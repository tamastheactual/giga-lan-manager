import express from 'express';
import { createClient } from 'redis';
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

const app = express();
const port = 3000;

// Redis Client
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redisClient = createClient({ url: redisUrl });

redisClient.on('error', (err) => console.log('Redis Client Error', err));

const tournaments: Map<string, TournamentManager> = new Map();
// joinCode -> tournamentId. Rebuilt at boot and kept in step on create/delete.
const joinCodes: Map<string, string> = new Map();

// Every code ever issued, including those of deleted tournaments. A code is
// never reissued: a bookmarked /t/<code> link must go stale rather than quietly
// resolve to somebody else's tournament later.
const usedJoinCodes: Set<string> = new Set();
const USED_CODES_KEY = 'joincodes:used';

/** A join code that has never been issued before. */
function freshJoinCode(): string {
    for (let i = 0; i < 100; i++) {
        const code = generateJoinCode();
        if (!usedJoinCodes.has(code)) return code;
    }
    throw new Error('Could not allocate a unique join code');
}

/** Claim a code: reserve it in memory and record it as spent, durably. */
async function claimJoinCode(code: string, tournamentId: string): Promise<void> {
    joinCodes.set(code, tournamentId);
    usedJoinCodes.add(code);
    await redisClient.sAdd(USED_CODES_KEY, code);
}

(async () => {
  await redisClient.connect();
  console.log('Connected to Redis');

  // Codes spent by tournaments that may since have been deleted.
  for (const code of await redisClient.sMembers(USED_CODES_KEY)) usedJoinCodes.add(code);

  // Load tournament list from Redis
  const tournamentIds = await redisClient.sMembers('tournaments:list');
  for (const id of tournamentIds) {
    const state = await redisClient.get(`tournament:${id}`);
    if (state) {
      const data = JSON.parse(state);
      const tournament = new TournamentManager(data.id, data.name, data.gameType, data.mapPool);
      // Copy all properties from persisted data, including createdAt
      Object.assign(tournament, data);
      tournaments.set(id, tournament);
      let dirty = false;

      // Back-fill maps for matches recorded before maps were tracked, and SAVE
      // the result -- leaving it unsaved meant it was recomputed every boot.
      if (tournament.fillMissingMaps()) dirty = true;

      // Tournaments created before per-tournament access get credentials now.
      // The generated admin key is printed once, because nobody else has it --
      // a holder of the instance admin token can also manage it regardless.
      if (!tournament.joinCode || !tournament.adminKeyHash) {
        const adminKey = await tournament.issueAccess(freshJoinCode());
        console.log(
          `[migrate] "${tournament.name}" -> join code ${tournament.joinCode}, admin key ${adminKey}`,
        );
        dirty = true;
      }
      await claimJoinCode(tournament.joinCode, id);

      if (dirty) await redisClient.set(`tournament:${id}`, JSON.stringify(tournament));
      console.log(`Loaded tournament: ${data.name} (${id}) - join ${tournament.joinCode}`);
    }
  }
})();

const saveState = async (tournamentId: string) => {
    const tournament = tournaments.get(tournamentId);
    if (tournament) {
        await redisClient.set(`tournament:${tournamentId}`, JSON.stringify(tournament));
    }
};

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
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return false;
    const supplied = req.header('x-admin-key');
    return typeof supplied === 'string' && (await tournament.isAdminKey(supplied));
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
  const tournamentList = Array.from(tournaments.values()).map(t => ({
    id: t.id,
    name: t.name,
    state: t.state,
    playerCount: t.players.length,
    gameType: t.gameType,
    createdAt: t.createdAt,
    startedAt: t.startedAt,
    isTeamBased: t.isTeamBased,
    joinCode: t.joinCode
  }));
  res.json(tournamentList);
});

// Resolve a shared join code to the tournament it opens. Public and rate
// limited: the code is only ~30 bits, so it must not be freely guessable.
app.get('/api/join/:code', (req, res) => {
  const ip = req.ip || 'unknown';
  if (joinLimiter.limited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' });
  }
  const code = normalizeCode(req.params.code);
  const tournamentId = joinCodes.get(code);
  const tournament = tournamentId ? tournaments.get(tournamentId) : undefined;
  if (!tournament) {
    joinLimiter.recordFailure(ip);
    return res.status(404).json({ error: 'No tournament with that code' });
  }
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
  // Check for unique tournament name
  const existingNames = Array.from(tournaments.values()).map(t => t.name.toLowerCase());
  if (existingNames.includes(name.trim().toLowerCase())) {
    return res.status(400).json({ error: 'A tournament with this name already exists' });
  }
  const id = uuidv4();
  const tournament = new TournamentManager(id, name, gameType as GameType, mapPool, groupStageRoundLimit, playoffsRoundLimit, useCustomPoints, teamMode);
  // The plaintext admin key exists only in this response. Only its hash is kept.
  const adminKey = await tournament.issueAccess(freshJoinCode());
  tournaments.set(id, tournament);
  await claimJoinCode(tournament.joinCode, id);
  await redisClient.sAdd('tournaments:list', id);
  await saveState(id);
  res.json({
    id, name, gameType, mapPool, groupStageRoundLimit, playoffsRoundLimit, useCustomPoints,
    isTeamBased: tournament.isTeamBased,
    joinCode: tournament.joinCode,
    adminKey, // shown once -- never retrievable again
  });
});

// Delete a tournament
app.delete('/api/tournament/:tournamentId', async (req, res) => {
    const { tournamentId } = req.params;
    if (!tournaments.has(tournamentId)) {
        return res.status(404).json({ error: 'Tournament not found' });
    }

    try {
        const doomed = tournaments.get(tournamentId);
        if (doomed?.joinCode) joinCodes.delete(doomed.joinCode);
        tournaments.delete(tournamentId);
        await redisClient.sRem('tournaments:list', tournamentId);
        await redisClient.del(`tournament:${tournamentId}`);
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
        if (typeof id !== 'string' || !UUID_RE.test(id) || tournaments.has(id)) {
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
        const adminKey = await tournament.issueAccess(freshJoinCode());
        tournaments.set(id, tournament);
        await claimJoinCode(tournament.joinCode, id);
        await redisClient.sAdd('tournaments:list', id);
        await saveState(id);

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
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

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
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const player = tournament.addPlayer(name);
    await saveState(tournamentId);
    res.json(player);
});

app.post('/api/tournament/:tournamentId/start', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    try {
        tournament.startGroupStage();
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const { results, mapName } = req.body;
    try {
        tournament.submitMatchResult(id, results, mapName);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/brackets', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    try {
        // Automatically detect team vs solo tournament and call appropriate method
        if (tournament.isTeamBased) {
            tournament.generateTeamBrackets();
        } else {
            tournament.generateBrackets();
        }
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/bracket-match/:id', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const { winnerId } = req.body;
    try {
        tournament.submitBracketWinner(id, winnerId);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Submit a single game result for BO3 bracket match
app.post('/api/tournament/:tournamentId/bracket-match/:id/game', async (req, res) => {
    const { tournamentId, id } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    const { gameNumber, mapName, player1Score, player2Score, winnerId } = req.body;
    try {
        tournament.submitBracketGameResult(id, {
            gameNumber,
            mapName,
            player1Score,
            player2Score,
            winnerId
        });
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/tournament/:tournamentId/reset', async (req, res) => {
    const { tournamentId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
    tournament.reset();
    await saveState(tournamentId);
    res.json({ success: true });
});

// Update tournament name
app.put('/api/tournament/:tournamentId/name', async (req, res) => {
    const { tournamentId } = req.params;
    const { name } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    try {
        tournament.updateTournamentName(name);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Update group name
app.put('/api/tournament/:tournamentId/group/:podId/name', async (req, res) => {
    const { tournamentId, podId } = req.params;
    const { name } = req.body;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    try {
        tournament.updateGroupName(podId, name);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Reset group data
app.post('/api/tournament/:tournamentId/group/:podId/reset', async (req, res) => {
    const { tournamentId, podId } = req.params;
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return res.status(404).json({ error: 'Tournament not found' });

    try {
        tournament.resetGroupData(podId);
        await saveState(tournamentId);
        res.json({ success: true });
    } catch (e: any) {
        res.status(400).json({ error: e.message });
    }
});

// Update a player's name
app.put('/api/tournament/:tournamentId/player/:playerId', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  const { name } = req.body;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  try {
    tournament.updatePlayerName(playerId, name);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Update player photo
app.put('/api/tournament/:tournamentId/player/:playerId/photo', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  const { photo } = req.body;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  try {
    tournament.updatePlayerPhoto(playerId, photo);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Remove player
app.delete('/api/tournament/:tournamentId/player/:playerId', async (req, res) => {
  const { tournamentId, playerId } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  try {
    tournament.removePlayer(playerId);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
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
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  const { name, playerIds, logo } = req.body;
  if (!name) return res.status(400).json({ error: 'Team name is required' });
  if (!playerIds || !Array.isArray(playerIds) || playerIds.length === 0) {
    return res.status(400).json({ error: 'At least one player is required' });
  }
  
  try {
    const team = tournament.addTeam(name, playerIds, logo);
    await saveState(tournamentId);
    res.json(team);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Update a team
app.put('/api/tournament/:tournamentId/team/:teamId', async (req, res) => {
  const { tournamentId, teamId } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  const { name, playerIds, logo } = req.body;
  
  try {
    const team = tournament.updateTeam(teamId, { name, playerIds, logo });
    await saveState(tournamentId);
    res.json(team);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Remove a team
app.delete('/api/tournament/:tournamentId/team/:teamId', async (req, res) => {
  const { tournamentId, teamId } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  try {
    tournament.removeTeam(teamId);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Update team logo
app.put('/api/tournament/:tournamentId/team/:teamId/logo', async (req, res) => {
  const { tournamentId, teamId } = req.params;
  const { logo } = req.body;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  try {
    tournament.updateTeam(teamId, { logo });
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Start team group stage
app.post('/api/tournament/:tournamentId/start-team', async (req, res) => {
  const { tournamentId } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  try {
    tournament.startTeamGroupStage();
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Submit team match result (group stage)
app.post('/api/tournament/:tournamentId/team-match/:id', async (req, res) => {
  const { tournamentId, id } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  const { team1Score, team2Score, games } = req.body;
  
  try {
    tournament.submitTeamMatchResult(id, team1Score, team2Score, games);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Generate team brackets
app.post('/api/tournament/:tournamentId/team-brackets', async (req, res) => {
  const { tournamentId } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  try {
    tournament.generateTeamBrackets();
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Submit team bracket winner
app.post('/api/tournament/:tournamentId/team-bracket-match/:id', async (req, res) => {
  const { tournamentId, id } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
  const { winnerId } = req.body;
  
  try {
    tournament.submitTeamBracketWinner(id, winnerId);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Submit a single game result for team bracket match (BO3/BO5)
app.post('/api/tournament/:tournamentId/team-bracket-match/:id/game', async (req, res) => {
  const { tournamentId, id } = req.params;
  const tournament = tournaments.get(tournamentId);
  if (!tournament) return res.status(404).json({ error: 'Tournament not found' });
  
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
    tournament.submitTeamBracketGameResult(id, gameResult);
    await saveState(tournamentId);
    res.json({ success: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Get player statistics for team tournament
app.get('/api/tournament/:tournamentId/player-stats', (req, res) => {
  const { tournamentId } = req.params;
  const tournament = tournaments.get(tournamentId);
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
app.get('/api/tournament/:tournamentId/team-rankings', (req, res) => {
  const { tournamentId } = req.params;
  const tournament = tournaments.get(tournamentId);
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
