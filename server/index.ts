import express from 'express';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { TournamentManager } from './tournament.js';
import type { TeamGameResult } from '../shared/types.js';
import { type GameType, GAME_CONFIGS, getAllGames, getTeamModeGames } from '../shared/gameTypes.js';
import {
    generateJoinCode,
    normalizeCode,
    pathTournamentId,
    hashSecret,
    looksLowEntropy,
    timingSafeEqualHex,
} from '../shared/access.js';
import {
    createStore,
    withTournament,
    requireTournament,
    TournamentNotFoundError,
    VersionConflictError,
    RedisTournamentStore,
    type TournamentStore,
} from './store/index.js';

const app = express();
const port = 3000;

// Persistence lives behind a store: Redis locally, Supabase when configured.
// Nothing is cached between requests, so this process holds no authoritative
// state and more than one of it can run.
const store: TournamentStore = createStore();

/** A join code that has never been issued before, live or retired. */
async function freshJoinCode(): Promise<string> {
    for (let i = 0; i < 100; i++) {
        const code = generateJoinCode();
        if (!(await store.isJoinCodeTaken(code))) return code;
    }
    throw new Error('Could not allocate a unique join code');
}

/**
 * Turn a thrown store or engine error into the right status.
 *
 * A version conflict that survived withTournament's retries means sustained
 * contention, not a client mistake, so it is a 409 the caller can retry -- not
 * the 400 that would tell them their request was malformed.
 */
function respondWithError(res: express.Response, err: unknown): void {
    if (err instanceof TournamentNotFoundError) {
        res.status(404).json({ error: 'Tournament not found' });
    } else if (err instanceof VersionConflictError) {
        res.status(409).json({ error: 'Someone else was editing this. Please try again.' });
    } else {
        res.status(400).json({ error: (err as Error)?.message || 'Request failed' });
    }
}

(async () => {
    await store.init();

    // Records written before per-tournament access have no credentials. Only the
    // Redis store can hold those -- the Supabase schema requires both columns --
    // so this runs once, on the way out of the old world.
    if (store instanceof RedisTournamentStore) {
        for (const tournament of await store.allTournaments()) {
            let dirty = tournament.fillMissingMaps();

            if (!tournament.joinCode || !tournament.adminKeyHash) {
                const adminKey = await tournament.issueAccess(await freshJoinCode());
                console.log(
                    `[migrate] "${tournament.name}" -> join code ${tournament.joinCode}, ` +
                    `admin key ${adminKey}`,
                );
                dirty = true;
            }
            await store.claimCode(tournament.joinCode, tournament.id);

            if (dirty) {
                const current = await store.load(tournament.id);
                if (current) await store.update(tournament, current.version);
            }
        }
    }

    console.log('[store] ready');
})().catch((err) => {
    console.error('[store] failed to start:', err.message);
    process.exit(1);
});

// No CORS middleware: the SPA and the API are same-origin in production (Express
// serves both) and in dev (Vite proxies /api -> :3000). A wildcard
// Access-Control-Allow-Origin on a cookie-authenticated API was only ever
// defanged by sameSite:'lax' and the absence of credentials -- load-bearing
// settings that nothing documented.
app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Instance admin token
//
// One high-entropy secret decides who may CREATE tournaments. It is sent as an
// X-Admin-Token header and compared as a hash -- there is no login form, no
// session and no cookie, because a bearer token in a header does the same job
// without a server-side store and works unchanged on an edge runtime.
//
// ADMIN_PASSWORD is still honoured so existing deployments keep working.
// ---------------------------------------------------------------------------
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD || '';

if (!ADMIN_TOKEN) {
    console.warn(
        '[auth] No ADMIN_TOKEN set — ANYONE who can reach this server can create tournaments.\n' +
        '       Generate one with `npm run gen-token` and set ADMIN_TOKEN.\n' +
        '       (Writing to an existing tournament still always needs its own admin key.)',
    );
} else {
    if (process.env.ADMIN_TOKEN === undefined) {
        console.warn('[auth] ADMIN_PASSWORD is deprecated; rename it to ADMIN_TOKEN.');
    }
    if (looksLowEntropy(ADMIN_TOKEN)) {
        console.warn(
            '[auth] ADMIN_TOKEN looks guessable. It is the only thing stopping strangers\n' +
            '       creating tournaments on this instance. Use `npm run gen-token`.',
        );
    }
}

// Hashed once at boot so the comparison never touches the plaintext.
let adminTokenHash = '';
const adminTokenReady: Promise<void> = ADMIN_TOKEN
    ? hashSecret(ADMIN_TOKEN).then((h) => { adminTokenHash = h; })
    : Promise.resolve();

// Throttle guessing. The admin token and a ~30-bit join code are both
// brute-force oracles if the endpoints that check them are unthrottled.
const RATE_WINDOW_MS = 15 * 60 * 1000;

function makeRateLimiter(maxAttempts: number) {
    const attempts = new Map<string, { count: number; firstAt: number }>();
    return {
        limited(key: string): boolean {
            const entry = attempts.get(key);
            if (!entry || Date.now() - entry.firstAt > RATE_WINDOW_MS) return false;
            return entry.count >= maxAttempts;
        },
        recordFailure(key: string): void {
            const now = Date.now();
            const entry = attempts.get(key);
            if (!entry || now - entry.firstAt > RATE_WINDOW_MS) {
                attempts.set(key, { count: 1, firstAt: now });
            } else {
                entry.count++;
            }
        },
        clear(key: string): void {
            attempts.delete(key);
        },
    };
}

const tokenLimiter = makeRateLimiter(10);
const joinLimiter = makeRateLimiter(30);

/**
 * Does this request carry the instance admin token?
 *
 * Returns false when no token is configured: with nothing set there IS no
 * instance owner. Treating everyone as the owner made this a master key over
 * every tournament, so on an open instance any visitor could write to any
 * tournament without its admin key -- the exact opposite of the guarantee that
 * "an open instance never means an open tournament". The open case is handled
 * where it belongs, at the create gate.
 */
async function isInstanceOwner(req: express.Request): Promise<boolean> {
    if (!ADMIN_TOKEN) return false;
    await adminTokenReady;
    const supplied = req.header('x-admin-token');
    if (typeof supplied !== 'string' || supplied.length === 0) return false;
    return timingSafeEqualHex(await hashSecret(supplied), adminTokenHash);
}

// Check a token before storing it, so the UI can say "that is not right" rather
// than silently failing on the next write.
app.post('/api/admin/verify', async (req, res) => {
    const ip = req.ip || 'unknown';
    if (tokenLimiter.limited(ip)) {
        return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
    }
    const { token } = req.body ?? {};
    if (!ADMIN_TOKEN) return res.json({ ok: true, authRequired: false });

    if (typeof token === 'string' && timingSafeEqualHex(await hashSecret(token), adminTokenHash)) {
        tokenLimiter.clear(ip);
        return res.json({ ok: true, authRequired: true });
    }
    tokenLimiter.recordFailure(ip);
    return res.status(401).json({ error: 'That admin token is not valid' });
});

app.get('/api/admin/status', async (req, res) => {
    // `isOwner` means "holds the instance admin token". It is NOT the same as
    // holding a given tournament's admin key -- see /state's `isAdmin`.
    const owner = await isInstanceOwner(req);
    res.json({ authRequired: !!ADMIN_TOKEN, isAdmin: owner, isOwner: owner });
});

// ---------------------------------------------------------------------------
// Access control
//
// Two independent things:
//   * the INSTANCE OWNER holds ADMIN_TOKEN. They may create and import
//     tournaments, list every tournament, and manage any of them.
//   * a TOURNAMENT ADMIN holds that tournament's admin key (X-Admin-Key) and
//     may write to that tournament only.
//
// Reading a tournament needs only its id, which is what a join code resolves
// to. Holding a join code therefore grants view and nothing more.
// ---------------------------------------------------------------------------

const MUTATING = ['POST', 'PUT', 'DELETE', 'PATCH'];

/** Does this request carry write access to `tournamentId`? */
async function canWriteTournament(req: express.Request, tournamentId: string): Promise<boolean> {
    if (await isInstanceOwner(req)) return true; // instance owner is a superuser
    const supplied = req.header('x-admin-key');
    if (typeof supplied !== 'string' || supplied.length === 0) return false;
    const loaded = await store.load(tournamentId);
    return loaded !== null && (await loaded.tournament.isAdminKey(supplied));
}

app.use('/api', async (req, res, next) => {
    if (!MUTATING.includes(req.method)) return next();
    if (req.path === '/admin/verify') return next();

    const tournamentId = pathTournamentId(req.path);
    if (tournamentId) {
        // Writing to one tournament. Always requires that tournament's key --
        // independently of ADMIN_TOKEN, so a shared join code can never edit.
        if (await canWriteTournament(req, tournamentId)) return next();
        return res.status(401).json({ error: "This tournament's admin key is required" });
    }

    // Creating or importing. With no ADMIN_TOKEN the instance is open to all
    // (the server warns about this at boot); with one, it takes the token.
    if (!ADMIN_TOKEN) return next();
    if (await isInstanceOwner(req)) return next();
    return res.status(401).json({ error: 'A valid admin token is required to create a tournament' });
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// The instance owner's lobby. This used to hand every tournament to anyone who
// asked; with per-tournament access, viewers reach a tournament by join code
// instead and never see the full list.
app.get('/api/tournaments', async (req, res) => {
  // On an open instance anyone may create, so anyone may see the list.
  if (ADMIN_TOKEN && !(await isInstanceOwner(req))) {
    return res.status(401).json({ error: 'A valid admin token is required' });
  }
  // Summary columns only: the lobby never pulls the match documents.
  res.json(await store.listSummaries());
});

// Resolve a shared join code to the tournament it opens. Public and rate
// limited: the code is only ~30 bits, so it must not be freely guessable.
app.get('/api/join/:code', async (req, res) => {
  const ip = req.ip || 'unknown';
  if (joinLimiter.limited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  const code = normalizeCode(req.params.code);
  const loaded = await store.loadByJoinCode(code);
  if (!loaded) {
    joinLimiter.recordFailure(ip);
    return res.status(404).json({ error: 'No tournament with that code' });
  }
  const tournament = loaded.tournament;
  joinLimiter.clear(ip);
  res.json({
    id: tournament.id,
    name: tournament.name,
    gameType: tournament.gameType,
    state: tournament.state,
    joinCode: tournament.joinCode,
    isTeamBased: tournament.isTeamBased,
    playerCount: tournament.players.length,
  });
});

// Get available games
app.get('/api/games', (req, res) => {
  res.json(getAllGames());
});

app.post('/api/tournaments', async (req, res) => {
  const { name, gameType, mapPool = [], groupStageRoundLimit, playoffsRoundLimit, useCustomPoints, teamMode } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!gameType || !GAME_CONFIGS[gameType as GameType]) {
    return res.status(400).json({ error: 'Valid game type is required' });
  }
  if (await store.isNameTaken(name)) {
    return res.status(400).json({ error: 'A tournament with this name already exists' });
  }
  try {
    const id = uuidv4();
    const tournament = new TournamentManager(id, name, gameType as GameType, mapPool, groupStageRoundLimit, playoffsRoundLimit, useCustomPoints, teamMode);
    // The plaintext admin key exists only in this response. Only its hash is kept.
    const adminKey = await tournament.issueAccess(await freshJoinCode());
    await store.insert(tournament);
    res.json({
      id, name, gameType, mapPool, groupStageRoundLimit, playoffsRoundLimit, useCustomPoints,
      isTeamBased: tournament.isTeamBased,
      joinCode: tournament.joinCode,
      adminKey, // shown once -- never retrievable again
    });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Delete a tournament
app.delete('/api/tournament/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        if (!(await store.load(tournamentId))) {
            return res.status(404).json({ error: 'Tournament not found' });
        }
        // The row goes; the join code stays retired, so it is never reissued.
        await store.remove(tournamentId);
        res.json({ success: true, message: `Tournament ${tournamentId} deleted.` });
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to delete tournament', details: e.message });
    }
});

// Import a tournament from JSON
app.post('/api/tournaments/import', async (req, res) => {
    try {
        const importData = req.body;
        
        if (!importData || typeof importData.name !== 'string' || !importData.name.trim()) {
            return res.status(400).json({ error: 'Invalid tournament data' });
        }
        
        // Use the original ID or generate a new one if it conflicts
        // Never trust a client-supplied Redis key: require a UUID, else mint one.
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        let id = importData.tournamentId || importData.id;
        if (typeof id !== 'string' || !UUID_RE.test(id) || (await store.load(id)) !== null) {
            id = uuidv4();
        }
        
        // Create a new tournament manager and restore state
        const gameType = (importData.gameType || 'cs16') as GameType;
        const tournament = new TournamentManager(
            id,
            importData.name,
            gameType,
            Array.isArray(importData.mapPool) ? importData.mapPool : [],
            typeof importData.groupStageRoundLimit === 'number' ? importData.groupStageRoundLimit : undefined,
            typeof importData.playoffsRoundLimit === 'number' ? importData.playoffsRoundLimit : undefined,
            importData.useCustomPoints === true,
            importData.isTeamBased === true,
        );

        // Restore state (validated against the allowed set) and timestamps.
        const VALID_STATES = ['registration', 'group', 'playoffs', 'completed'];
        tournament.state = VALID_STATES.includes(importData.state) ? importData.state : 'registration';
        if (typeof importData.createdAt === 'string') tournament.createdAt = importData.createdAt;
        if (typeof importData.startedAt === 'string') tournament.startedAt = importData.startedAt;

        // Restore collections, guarding each against a non-array payload.
        const asArray = (v: any) => (Array.isArray(v) ? v : []);
        tournament.players = asArray(importData.players);
        tournament.pods = asArray(importData.pods);
        tournament.matches = asArray(importData.matches);
        tournament.bracketMatches = asArray(importData.bracketMatches);
        tournament.teams = asArray(importData.teams);
        tournament.teamPods = asArray(importData.teamPods);
        tournament.teamMatches = asArray(importData.teamMatches);
        tournament.teamBracketMatches = asArray(importData.teamBracketMatches);
        
        // Always mint fresh credentials. An exported JSON file must never carry
        // working admin access to whoever happens to receive it.
        const adminKey = await tournament.issueAccess(await freshJoinCode());
        await store.insert(tournament);

        res.json({
            success: true,
            id,
            name: tournament.name,
            joinCode: tournament.joinCode,
            adminKey, // shown once
            message: `Tournament "${tournament.name}" imported successfully`
        });
    } catch (e: any) {
        res.status(500).json({ error: 'Failed to import tournament', details: e.message });
    }
});

// Get tournament state
app.get('/api/tournament/:tournamentId/state', async (req, res) => {
  const { tournamentId } = req.params;
  const loaded = await store.load(tournamentId);
  if (!loaded) return res.status(404).json({ error: 'Tournament not found' });
  const tournament = loaded.tournament;

  res.json({
    id: tournament.id,
    name: tournament.name,
    // The join code is a read credential, and the caller already has read
    // access. `isAdmin` is what the UI uses to decide whether to offer editing;
    // the server enforces it regardless.
    joinCode: tournament.joinCode,
    isAdmin: await canWriteTournament(req, tournamentId),
    gameType: tournament.gameType,
    gameConfig: tournament.getGameConfig(),
    players: tournament.players,
    pods: tournament.pods,
    matches: tournament.matches,
    bracketMatches: tournament.bracketMatches,
    state: tournament.state,
    champion: tournament.getChampion(),
    createdAt: tournament.createdAt,
    startedAt: tournament.startedAt,
    mapPool: tournament.mapPool,
    groupStageRoundLimit: tournament.groupStageRoundLimit,
    playoffsRoundLimit: tournament.playoffsRoundLimit,
    useCustomPoints: tournament.useCustomPoints,
    // Team tournament data
    isTeamBased: tournament.isTeamBased,
    teams: tournament.teams.map(t => ({
      ...t,
      roundDiff: t.roundsWon - t.roundsLost,
      members: t.playerIds // Alias for frontend compatibility
    })),
    teamPods: tournament.teamPods,
    teamMatches: tournament.teamMatches,
    teamBracketMatches: tournament.teamBracketMatches,
    championTeam: tournament.getChampionTeam(),
    // Player statistics (for team tournaments with K/D tracking)
    playerStatistics: tournament.isTeamBased ? Object.fromEntries(tournament.getPlayerStatistics()) : {}
  });
});



app.post('/api/tournament/:tournamentId/players', async (req, res) => {
    const { tournamentId } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const { result } = await withTournament(store, tournamentId, (tournament) => {
        return tournament.addPlayer(name);
    });
    res.json(result);
});

app.post('/api/tournament/:tournamentId/start', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        await withTournament(store, tournamentId, (tournament) => {
            tournament.startGroupStage();
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

app.post('/api/tournament/:tournamentId/match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const { results, mapName } = req.body;
    try {
        await withTournament(store, tournamentId, (tournament) => {
            tournament.submitMatchResult(id, results, mapName);
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

app.post('/api/tournament/:tournamentId/brackets', async (req, res) => {
    const { tournamentId } = req.params;
    try {
        // Automatically detect team vs solo tournament and call appropriate method
        await withTournament(store, tournamentId, (tournament) => {
            if (tournament.isTeamBased) {
            tournament.generateTeamBrackets();
            } else {
            tournament.generateBrackets();
            }
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

app.post('/api/tournament/:tournamentId/bracket-match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const { winnerId } = req.body;
    try {
        await withTournament(store, tournamentId, (tournament) => {
            tournament.submitBracketWinner(id, winnerId);
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

// Submit a single game result for BO3 bracket match
app.post('/api/tournament/:tournamentId/bracket-match/:id/game', async (req, res) => {
    const { tournamentId, id } = req.params;
    const { gameNumber, mapName, player1Score, player2Score, winnerId } = req.body;
    try {
        await withTournament(store, tournamentId, (tournament) => {
            tournament.submitBracketGameResult(id, {
            gameNumber,
            mapName,
            player1Score,
            player2Score,
            winnerId
            });
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

app.post('/api/tournament/:tournamentId/reset', async (req, res) => {
    const { tournamentId } = req.params;
    await withTournament(store, tournamentId, (tournament) => {
        tournament.reset();
    });
    res.json({ success: true });
});

// Update tournament name
app.put('/api/tournament/:tournamentId/name', async (req, res) => {
    const { tournamentId } = req.params;
    const { name } = req.body;
    try {
        await withTournament(store, tournamentId, (tournament) => {
            tournament.updateTournamentName(name);
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

// Update group name
app.put('/api/tournament/:tournamentId/group/:podId/name', async (req, res) => {
    const { tournamentId, podId } = req.params;
    const { name } = req.body;
    try {
        await withTournament(store, tournamentId, (tournament) => {
            tournament.updateGroupName(podId, name);
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

// Reset group data
app.post('/api/tournament/:tournamentId/group/:podId/reset', async (req, res) => {
    const { tournamentId, podId } = req.params;
    try {
        await withTournament(store, tournamentId, (tournament) => {
            tournament.resetGroupData(podId);
        });
        res.json({ success: true });
    } catch (e: any) {
        respondWithError(res, e);
    }
});

// Update a player's name
app.put('/api/tournament/:tournamentId/player/:playerId', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  const { name } = req.body;
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.updatePlayerName(playerId, name);
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Update player photo
app.put('/api/tournament/:tournamentId/player/:playerId/photo', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  const { photo } = req.body;
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.updatePlayerPhoto(playerId, photo);
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Remove player
app.delete('/api/tournament/:tournamentId/player/:playerId', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.removePlayer(playerId);
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// ========================================
// TEAM TOURNAMENT API ENDPOINTS
// ========================================

// Get available team games
app.get('/api/team-games', (req, res) => {
  res.json(getTeamModeGames());
});

// Add a team to a tournament
app.post('/api/tournament/:tournamentId/teams', async (req, res) => {
  const { tournamentId } = req.params;
  
  const { name, playerIds, logo } = req.body;
  if (!name) return res.status(400).json({ error: 'Team name is required' });
  if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
    return res.status(400).json({ error: 'At least one player is required' });
  }
  
  try {
    const { result } = await withTournament(store, tournamentId, (tournament) => {
        return tournament.addTeam(name, playerIds, logo);
    });
    res.json(result);
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Update a team
app.put('/api/tournament/:tournamentId/team/:teamId', async (req, res) => {
  const { tournamentId, teamId } = req.params;
  
  const { name, playerIds, logo } = req.body;
  
  try {
    const { result } = await withTournament(store, tournamentId, (tournament) => {
        return tournament.updateTeam(teamId, { name, playerIds, logo });
    });
    res.json(result);
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Remove a team
app.delete('/api/tournament/:tournamentId/team/:teamId', async (req, res) => {
  const { tournamentId, teamId } = req.params;
  
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.removeTeam(teamId);
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Update team logo
app.put('/api/tournament/:tournamentId/team/:teamId/logo', async (req, res) => {
  const { tournamentId, teamId } = req.params;
  const { logo } = req.body;
  
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.updateTeam(teamId, { logo });
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Start team group stage
app.post('/api/tournament/:tournamentId/start-team', async (req, res) => {
  const { tournamentId } = req.params;
  
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.startTeamGroupStage();
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Submit team match result (group stage)
app.post('/api/tournament/:tournamentId/team-match/:id', async (req, res) => {
  const { tournamentId, id } = req.params;
  
  const { team1Score, team2Score, games } = req.body;
  
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.submitTeamMatchResult(id, team1Score, team2Score, games);
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Generate team brackets
app.post('/api/tournament/:tournamentId/team-brackets', async (req, res) => {
  const { tournamentId } = req.params;
  
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.generateTeamBrackets();
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Submit team bracket winner
app.post('/api/tournament/:tournamentId/team-bracket-match/:id', async (req, res) => {
  const { tournamentId, id } = req.params;
  
  const { winnerId } = req.body;
  
  try {
    await withTournament(store, tournamentId, (tournament) => {
        tournament.submitTeamBracketWinner(id, winnerId);
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Submit a single game result for team bracket match (BO3/BO5)
app.post('/api/tournament/:tournamentId/team-bracket-match/:id/game', async (req, res) => {
  const { tournamentId, id } = req.params;
  
  const { gameNumber, mapName, team1Score, team2Score, winnerTeamId, playerStats } = req.body;
  
  try {
    const gameResult: TeamGameResult = {
      gameNumber,
      mapName,
      team1Score,
      team2Score,
      winnerTeamId,
      playerStats: playerStats || []
    };
    await withTournament(store, tournamentId, (tournament) => {
        tournament.submitTeamBracketGameResult(id, gameResult);
    });
    res.json({ success: true });
  } catch (e: any) {
    respondWithError(res, e);
  }
});

// Get player statistics for team tournament
app.get('/api/tournament/:tournamentId/player-stats', async (req, res) => {
  const { tournamentId } = req.params;
  const tournament = await store.load(tournamentId).then((l) => l?.tournament);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  if (!tournament.isTeamBased) {
    return res.status(400).json({ error: 'Player stats only available for team tournaments' });
  }
  
  const stats = tournament.getPlayerStatistics();
  // Convert Map to array of objects for JSON
  const statsArray = Array.from(stats.entries()).map(([playerId, data]) => ({
    playerId,
    ...data
  }));
  
  res.json(statsArray);
});

// Get team rankings
app.get('/api/tournament/:tournamentId/team-rankings', async (req, res) => {
  const { tournamentId } = req.params;
  const tournament = await store.load(tournamentId).then((l) => l?.tournament);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  if (!tournament.isTeamBased) {
    return res.status(400).json({ error: 'Team rankings only available for team tournaments' });
  }
  
  res.json(tournament.getTeamRankings());
});

// Serve the built SPA. In Docker the server runs from /app with dist/ beside it;
// in dev `npm run start:server` runs from the repo root. Both resolve off cwd.
// (__filename/__dirname were computed here and never used.)
app.use(express.static(path.join(process.cwd(), 'dist')));

app.get(/.*/, (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
