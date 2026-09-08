import { VersionConflictError, type StoredTournament, type TournamentStore } from './types.js';
import type { TournamentManager } from '../tournament.js';

/** Raised when a route asks for a tournament that is not there. */
export class TournamentNotFoundError extends Error {
    constructor(id: string) {
        super('Tournament not found');
        this.name = 'TournamentNotFoundError';
    }
}

// A writer that loses N races needs N+1 attempts, so the budget has to exceed
// plausible concurrency rather than merely cover a stray collision. Ten people
// entering results at once on one tournament is an ordinary LAN evening.
const MAX_ATTEMPTS = 12;
const BASE_BACKOFF_MS = 10;
const MAX_BACKOFF_MS = 200;

/**
 * Load a tournament, mutate it, and save it back under optimistic locking.
 *
 * Every write is a read-modify-write over the whole tournament, so two admins
 * submitting at the same moment would otherwise silently lose one result. That
 * could not happen while a single process held the only copy in memory; it very
 * much can once requests are served concurrently. On a version conflict the
 * mutation is replayed against freshly loaded state rather than merged --
 * these are short, idempotent operations, so replaying is both correct and
 * cheaper than reasoning about a merge.
 */
export async function withTournament<T>(
    store: TournamentStore,
    id: string,
    mutate: (tournament: TournamentManager) => T | Promise<T>,
): Promise<{ result: T; tournament: TournamentManager }> {
    let lastConflict: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const loaded: StoredTournament | null = await store.load(id);
        if (!loaded) throw new TournamentNotFoundError(id);

        const result = await mutate(loaded.tournament);

        try {
            await store.update(loaded.tournament, loaded.version);
            return { result, tournament: loaded.tournament };
        } catch (err) {
            if (!(err instanceof VersionConflictError)) throw err;
            lastConflict = err;
            // Exponential backoff with jitter. Without the jitter, writers that
            // collided once tend to collide again on the same schedule.
            const backoff = Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
            await new Promise((r) => setTimeout(r, backoff * (0.5 + Math.random())));
        }
    }

    throw lastConflict;
}

/** Read-only load that throws the same not-found error as withTournament. */
export async function requireTournament(store: TournamentStore, id: string): Promise<TournamentManager> {
    const loaded = await store.load(id);
    if (!loaded) throw new TournamentNotFoundError(id);
    return loaded.tournament;
}
