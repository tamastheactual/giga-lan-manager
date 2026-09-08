// The API, as a Hono app.
//
// Deliberately free of Node built-ins and of any assumption about how it is
// served: this file is the whole application, and both the Node entrypoint
// (server/index.ts) and the Cloudflare Worker mount it unchanged. Static assets
// and the SPA fallback belong to whichever host is serving, not here.

import { Hono } from 'hono';
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
// Imported from the specific modules, NOT from ./store/index.js: that barrel
// re-exports the Redis store, and a bundler following it would pull the whole
// Redis client — and its node:dns / node:events dependencies — into the
// Cloudflare Worker bundle, which then fails to build.
import { withTournament, TournamentNotFoundError } from './store/withTournament.js';
import { VersionConflictError, type TournamentStore } from './store/types.js';

export interface AppConfig {
    store: TournamentStore;
    /** The instance admin token, or '' for an open instance. */
    adminToken: string;
}

const MUTATING = ['POST', 'PUT', 'DELETE', 'PATCH'];
const RATE_WINDOW_MS = 15 * 60 * 1000;

/**
 * Per-instance attempt counter.
 *
 * NOTE FOR EDGE DEPLOYMENT: this lives in the isolate's memory, so on Workers
 * each isolate counts separately and the effective limit is much weaker than it
 * looks. Put a Cloudflare Rate Limiting rule in front of /api/admin/verify and
 * /api/join/* there; this stays as the floor for a single-process deployment.
 */
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

/** Warn about a token that is missing or guessable. Called once at startup. */
export function reportTokenHealth(adminToken: string): void {
    if (!adminToken) {
        console.warn(
            '[auth] No ADMIN_TOKEN set — ANYONE who can reach this server can create tournaments.\n' +
            '       Generate one with `npm run gen-token` and set ADMIN_TOKEN.\n' +
            '       (Writing to an existing tournament still always needs its own admin key.)',
        );
    } else if (looksLowEntropy(adminToken)) {
        console.warn(
            '[auth] ADMIN_TOKEN looks guessable. It is the only thing stopping strangers\n' +
            '       creating tournaments on this instance. Use `npm run gen-token`.',
        );
    }
}

export function createApiApp({ store, adminToken }: AppConfig): Hono {
    const app = new Hono();

    const tokenLimiter = makeRateLimiter(10);
    const joinLimiter = makeRateLimiter(30);

    // Hashed once, lazily, so the comparison never touches the plaintext and a
    // cold isolate does not pay for it until something actually authenticates.
    let tokenHash: Promise<string> | null = null;
    const adminTokenHash = () => (tokenHash ??= hashSecret(adminToken));

    /** Best available client identity for rate limiting. */
    const clientKey = (c: any): string =>
        c.req.header('cf-connecting-ip') ||
        (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
        'unknown';

    /** Parse a JSON body without throwing on malformed input. */
    const body = async (c: any): Promise<any> => {
        try {
            return (await c.req.json()) ?? {};
        } catch {
            return {};
        }
    };

    /**
     * Does this request carry the instance admin token?
     *
     * False when none is configured: with nothing set there IS no instance
     * owner. Treating everyone as the owner once made this a master key over
     * every tournament, so on an open instance any visitor could write to any
     * tournament without its admin key. The open case is handled at the create
     * gate, where it belongs.
     */
    async function isInstanceOwner(c: any): Promise<boolean> {
        if (!adminToken) return false;
        const supplied = c.req.header('x-admin-token');
        if (typeof supplied !== 'string' || supplied.length === 0) return false;
        return timingSafeEqualHex(await hashSecret(supplied), await adminTokenHash());
    }

    /** Does this request carry write access to `tournamentId`? */
    async function canWriteTournament(c: any, tournamentId: string): Promise<boolean> {
        if (await isInstanceOwner(c)) return true; // instance owner is a superuser
        const supplied = c.req.header('x-admin-key');
        if (typeof supplied !== 'string' || supplied.length === 0) return false;
        const loaded = await store.load(tournamentId);
        return loaded !== null && (await loaded.tournament.isAdminKey(supplied));
    }

    /**
     * Not-found and version conflict are not client mistakes: a conflict that
     * survived withTournament's retries means sustained contention, and 409 is
     * something the caller can sensibly retry.
     */
    const fail = (c: any, err: unknown) => {
        if (err instanceof TournamentNotFoundError) return c.json({ error: 'Tournament not found' }, 404);
        if (err instanceof VersionConflictError) {
            return c.json({ error: 'Someone else was editing this. Please try again.' }, 409);
        }
        return c.json({ error: (err as Error)?.message || 'Request failed' }, 400);
    };

    /** A join code that has never been issued before, live or retired. */
    async function freshJoinCode(): Promise<string> {
        for (let i = 0; i < 100; i++) {
            const code = generateJoinCode();
            if (!(await store.isJoinCodeTaken(code))) return code;
        }
        throw new Error('Could not allocate a unique join code');
    }

    // -----------------------------------------------------------------------
    // Access control
    //
    //   * the INSTANCE OWNER holds ADMIN_TOKEN. They may create and import
    //     tournaments, list every tournament, and manage any of them.
    //   * a TOURNAMENT ADMIN holds that tournament's admin key (X-Admin-Key)
    //     and may write to that tournament only.
    //
    // Reading needs only the tournament id, which is what a join code resolves
    // to, so holding a join code grants view and nothing more.
    // -----------------------------------------------------------------------
    app.use('/api/*', async (c, next) => {
        if (!MUTATING.includes(c.req.method)) return next();

        const apiPath = c.req.path.replace(/^\/api/, '');
        if (apiPath === '/admin/verify') return next();

        const tournamentId = pathTournamentId(apiPath);
        if (tournamentId) {
            // Always requires that tournament's key -- independently of
            // ADMIN_TOKEN, so a shared join code can never edit.
            if (await canWriteTournament(c, tournamentId)) return next();
            return c.json({ error: "This tournament's admin key is required" }, 401);
        }

        // Creating or importing. With no ADMIN_TOKEN the instance is open to
        // all (the server warns at boot); with one, it takes the token.
        if (!adminToken) return next();
        if (await isInstanceOwner(c)) return next();
        return c.json({ error: 'A valid admin token is required to create a tournament' }, 401);
    });

    // ----------------------------- admin ------------------------------------

    // Check a token before storing it, so the UI can say "that is not right"
    // rather than silently failing on the next write.
    app.post('/api/admin/verify', async (c) => {
        const key = clientKey(c);
        if (tokenLimiter.limited(key)) {
            return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
        }
        if (!adminToken) return c.json({ ok: true, authRequired: false });

        const { token } = await body(c);
        if (typeof token === 'string' && timingSafeEqualHex(await hashSecret(token), await adminTokenHash())) {
            tokenLimiter.clear(key);
            return c.json({ ok: true, authRequired: true });
        }
        tokenLimiter.recordFailure(key);
        return c.json({ error: 'That admin token is not valid' }, 401);
    });

    app.get('/api/admin/status', async (c) => {
        // `isOwner` means "holds the instance admin token". NOT the same as
        // holding a given tournament's admin key -- see /state's `isAdmin`.
        const owner = await isInstanceOwner(c);
        return c.json({ authRequired: !!adminToken, isAdmin: owner, isOwner: owner });
    });

    // ---------------------------- catalogue ---------------------------------

    app.get('/api/health', (c) => c.json({ status: 'ok' }));
    app.get('/api/games', (c) => c.json(getAllGames()));
    app.get('/api/team-games', (c) => c.json(getTeamModeGames()));

    // --------------------------- tournaments --------------------------------

    // The instance owner's lobby. This used to hand every tournament to anyone
    // who asked; viewers now reach one by join code and never see the list.
    app.get('/api/tournaments', async (c) => {
        // On an open instance anyone may create, so anyone may see the list.
        if (adminToken && !(await isInstanceOwner(c))) {
            return c.json({ error: 'A valid admin token is required' }, 401);
        }
        return c.json(await store.listSummaries());
    });

    // Resolve a shared join code. Public and rate limited: ~30 bits of code
    // must not be freely guessable.
    app.get('/api/join/:code', async (c) => {
        const key = clientKey(c);
        if (joinLimiter.limited(key)) {
            return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
        }
        const loaded = await store.loadByJoinCode(normalizeCode(c.req.param('code')));
        if (!loaded) {
            joinLimiter.recordFailure(key);
            return c.json({ error: 'No tournament with that code' }, 404);
        }
        joinLimiter.clear(key);
        const t = loaded.tournament;
        return c.json({
            id: t.id,
            name: t.name,
            gameType: t.gameType,
            state: t.state,
            joinCode: t.joinCode,
            isTeamBased: t.isTeamBased,
            playerCount: t.players.length,
        });
    });

    app.post('/api/tournaments', async (c) => {
        const {
            name, gameType, mapPool = [], groupStageRoundLimit,
            playoffsRoundLimit, useCustomPoints, teamMode,
        } = await body(c);

        if (!name) return c.json({ error: 'Name is required' }, 400);
        if (!gameType || !GAME_CONFIGS[gameType as GameType]) {
            return c.json({ error: 'Valid game type is required' }, 400);
        }
        if (await store.isNameTaken(name)) {
            return c.json({ error: 'A tournament with this name already exists' }, 400);
        }
        try {
            const tournament = new TournamentManager(
                crypto.randomUUID(), name, gameType as GameType, mapPool,
                groupStageRoundLimit, playoffsRoundLimit, useCustomPoints, teamMode,
            );
            // The plaintext admin key exists only in this response.
            const adminKey = await tournament.issueAccess(await freshJoinCode());
            await store.insert(tournament);
            return c.json({
                id: tournament.id, name, gameType, mapPool,
                groupStageRoundLimit, playoffsRoundLimit, useCustomPoints,
                isTeamBased: tournament.isTeamBased,
                joinCode: tournament.joinCode,
                adminKey, // shown once -- never retrievable again
            });
        } catch (err) {
            return fail(c, err);
        }
    });

    app.delete('/api/tournament/:tournamentId', async (c) => {
        const id = c.req.param('tournamentId');
        try {
            if (!(await store.load(id))) return c.json({ error: 'Tournament not found' }, 404);
            // The row goes; the join code stays retired, never reissued.
            await store.remove(id);
            return c.json({ success: true, message: `Tournament ${id} deleted.` });
        } catch (err) {
            return c.json({ error: 'Failed to delete tournament', details: (err as Error).message }, 500);
        }
    });

    app.post('/api/tournaments/import', async (c) => {
        try {
            const data = await body(c);
            if (!data || typeof data.name !== 'string' || !data.name.trim()) {
                return c.json({ error: 'Invalid tournament data' }, 400);
            }

            // Never trust a client-supplied primary key: require a UUID that is
            // not already taken, else mint one.
            const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            let id = data.tournamentId || data.id;
            if (typeof id !== 'string' || !UUID_RE.test(id) || (await store.load(id)) !== null) {
                id = crypto.randomUUID();
            }

            const tournament = TournamentManager.fromJSON({ ...data, id });
            // Always mint fresh credentials. An exported JSON file must never
            // carry working admin access to whoever happens to receive it.
            const adminKey = await tournament.issueAccess(await freshJoinCode());
            await store.insert(tournament);

            return c.json({
                success: true,
                id,
                name: tournament.name,
                joinCode: tournament.joinCode,
                adminKey, // shown once
                message: `Tournament "${tournament.name}" imported successfully`,
            });
        } catch (err) {
            return c.json({ error: 'Failed to import tournament', details: (err as Error).message }, 500);
        }
    });

    app.get('/api/tournament/:tournamentId/state', async (c) => {
        const id = c.req.param('tournamentId');
        const loaded = await store.load(id);
        if (!loaded) return c.json({ error: 'Tournament not found' }, 404);
        const t = loaded.tournament;

        return c.json({
            id: t.id,
            name: t.name,
            // The join code is a read credential and the caller already has
            // read access. `isAdmin` only tells the UI whether to offer
            // editing; the server enforces it regardless.
            joinCode: t.joinCode,
            isAdmin: await canWriteTournament(c, id),
            gameType: t.gameType,
            gameConfig: t.getGameConfig(),
            players: t.players,
            pods: t.pods,
            matches: t.matches,
            bracketMatches: t.bracketMatches,
            state: t.state,
            champion: t.getChampion(),
            createdAt: t.createdAt,
            startedAt: t.startedAt,
            mapPool: t.mapPool,
            groupStageRoundLimit: t.groupStageRoundLimit,
            playoffsRoundLimit: t.playoffsRoundLimit,
            useCustomPoints: t.useCustomPoints,
            isTeamBased: t.isTeamBased,
            teams: t.teams.map((team) => ({
                ...team,
                roundDiff: team.roundsWon - team.roundsLost,
                members: team.playerIds, // alias for frontend compatibility
            })),
            teamPods: t.teamPods,
            teamMatches: t.teamMatches,
            teamBracketMatches: t.teamBracketMatches,
            championTeam: t.getChampionTeam(),
            playerStatistics: t.isTeamBased ? Object.fromEntries(t.getPlayerStatistics()) : {},
        });
    });

    // ------------------------------ writes ----------------------------------
    //
    // Every mutation goes through withTournament: load, apply, save under the
    // version it read, replaying against fresh state if it loses a race.

    /** Wrap a mutation route: run it, map errors, return {success:true}. */
    const mutate = (
        fn: (c: any, t: TournamentManager, b: any) => void | Promise<void>,
    ) => async (c: any) => {
        try {
            const b = await body(c);
            await withTournament(store, c.req.param('tournamentId'), (t) => fn(c, t, b));
            return c.json({ success: true });
        } catch (err) {
            return fail(c, err);
        }
    };

    /** As `mutate`, but the mutation's return value is the response. */
    const mutateReturning = (
        fn: (c: any, t: TournamentManager, b: any) => unknown,
    ) => async (c: any) => {
        try {
            const b = await body(c);
            const { result } = await withTournament(
                store, c.req.param('tournamentId'), (t) => fn(c, t, b),
            );
            return c.json(result as any);
        } catch (err) {
            return fail(c, err);
        }
    };

    // players
    app.post('/api/tournament/:tournamentId/players', async (c) => {
        const { name } = await body(c);
        if (!name) return c.json({ error: 'Name is required' }, 400);
        try {
            const { result } = await withTournament(
                store, c.req.param('tournamentId'), (t) => t.addPlayer(name),
            );
            return c.json(result);
        } catch (err) {
            return fail(c, err);
        }
    });
    app.put('/api/tournament/:tournamentId/player/:playerId',
        mutate((c, t, b) => t.updatePlayerName(c.req.param('playerId'), b.name)));
    app.put('/api/tournament/:tournamentId/player/:playerId/photo',
        mutate((c, t, b) => t.updatePlayerPhoto(c.req.param('playerId'), b.photo)));
    app.delete('/api/tournament/:tournamentId/player/:playerId',
        mutate((c, t) => t.removePlayer(c.req.param('playerId'))));

    // tournament lifecycle
    app.post('/api/tournament/:tournamentId/start', mutate((_c, t) => t.startGroupStage()));
    app.post('/api/tournament/:tournamentId/start-team', mutate((_c, t) => t.startTeamGroupStage()));
    app.post('/api/tournament/:tournamentId/reset', mutate((_c, t) => t.reset()));
    app.put('/api/tournament/:tournamentId/name', mutate((_c, t, b) => t.updateTournamentName(b.name)));

    // group stage
    app.post('/api/tournament/:tournamentId/match/:id',
        mutate((c, t, b) => t.submitMatchResult(c.req.param('id'), b.results, b.mapName)));
    app.put('/api/tournament/:tournamentId/group/:podId/name',
        mutate((c, t, b) => t.updateGroupName(c.req.param('podId'), b.name)));
    app.post('/api/tournament/:tournamentId/group/:podId/reset',
        mutate((c, t) => t.resetGroupData(c.req.param('podId'))));
    app.post('/api/tournament/:tournamentId/team-match/:id',
        mutate((c, t, b) => t.submitTeamMatchResult(c.req.param('id'), b.team1Score, b.team2Score, b.games)));

    // playoffs
    app.post('/api/tournament/:tournamentId/brackets',
        mutate((_c, t) => { t.isTeamBased ? t.generateTeamBrackets() : t.generateBrackets(); }));
    app.post('/api/tournament/:tournamentId/team-brackets',
        mutate((_c, t) => t.generateTeamBrackets()));
    app.post('/api/tournament/:tournamentId/bracket-match/:id',
        mutate((c, t, b) => t.submitBracketWinner(c.req.param('id'), b.winnerId)));
    app.post('/api/tournament/:tournamentId/bracket-match/:id/game',
        mutate((c, t, b) => t.submitBracketGameResult(c.req.param('id'), {
            gameNumber: b.gameNumber,
            mapName: b.mapName,
            player1Score: b.player1Score,
            player2Score: b.player2Score,
            winnerId: b.winnerId,
        })));
    app.post('/api/tournament/:tournamentId/team-bracket-match/:id',
        mutate((c, t, b) => t.submitTeamBracketWinner(c.req.param('id'), b.winnerId)));
    app.post('/api/tournament/:tournamentId/team-bracket-match/:id/game',
        mutate((c, t, b) => {
            const game: TeamGameResult = {
                gameNumber: b.gameNumber,
                mapName: b.mapName,
                team1Score: b.team1Score,
                team2Score: b.team2Score,
                winnerTeamId: b.winnerTeamId,
                playerStats: b.playerStats || [],
            };
            t.submitTeamBracketGameResult(c.req.param('id'), game);
        }));

    // teams
    app.post('/api/tournament/:tournamentId/teams', async (c) => {
        const { name, playerIds, logo } = await body(c);
        if (!name) return c.json({ error: 'Team name is required' }, 400);
        if (!Array.isArray(playerIds) || playerIds.length === 0) {
            return c.json({ error: 'At least one player is required' }, 400);
        }
        try {
            const { result } = await withTournament(
                store, c.req.param('tournamentId'), (t) => t.addTeam(name, playerIds, logo),
            );
            return c.json(result);
        } catch (err) {
            return fail(c, err);
        }
    });
    app.put('/api/tournament/:tournamentId/team/:teamId',
        mutateReturning((c, t, b) => t.updateTeam(c.req.param('teamId'), {
            name: b.name, playerIds: b.playerIds, logo: b.logo,
        })));
    app.put('/api/tournament/:tournamentId/team/:teamId/logo',
        mutate((c, t, b) => { t.updateTeam(c.req.param('teamId'), { logo: b.logo }); }));
    app.delete('/api/tournament/:tournamentId/team/:teamId',
        mutate((c, t) => t.removeTeam(c.req.param('teamId'))));

    // team reads
    app.get('/api/tournament/:tournamentId/player-stats', async (c) => {
        const loaded = await store.load(c.req.param('tournamentId'));
        if (!loaded) return c.json({ error: 'Tournament not found' }, 404);
        if (!loaded.tournament.isTeamBased) {
            return c.json({ error: 'Player stats only available for team tournaments' }, 400);
        }
        return c.json(
            Array.from(loaded.tournament.getPlayerStatistics().entries())
                .map(([playerId, data]) => ({ playerId, ...data })),
        );
    });

    app.get('/api/tournament/:tournamentId/team-rankings', async (c) => {
        const loaded = await store.load(c.req.param('tournamentId'));
        if (!loaded) return c.json({ error: 'Tournament not found' }, 404);
        if (!loaded.tournament.isTeamBased) {
            return c.json({ error: 'Team rankings only available for team tournaments' }, 400);
        }
        return c.json(loaded.tournament.getTeamRankings());
    });

    // An unmatched /api path is an API error, never the SPA shell.
    app.all('/api/*', (c) => c.json({ error: 'API endpoint not found' }, 404));

    return app;
}
