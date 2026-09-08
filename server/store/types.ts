// Storage contract for tournaments.
//
// The engine keeps no persistent state of its own: a route loads a tournament,
// calls methods on it, and saves it back. That was previously an in-memory Map
// that only touched Redis on the way out, which meant exactly one process could
// ever run. Behind this interface it can be Redis today and Postgres tomorrow,
// and the serverless case -- load per request, no boot phase -- works because
// nothing is cached between calls.
//
// Deliberately free of Node built-ins so an implementation can run on an edge
// runtime unchanged.

import type { TournamentManager } from '../tournament.js';

/** A tournament plus the version it was read at, for optimistic locking. */
export interface StoredTournament {
    tournament: TournamentManager;
    version: number;
}

/** Enough to render the lobby without deserialising every tournament. */
export interface TournamentSummary {
    id: string;
    name: string;
    state: string;
    playerCount: number;
    gameType: string;
    createdAt: string;
    startedAt?: string;
    isTeamBased: boolean;
    joinCode: string;
}

/**
 * Thrown when a save loses a race: the row moved on since it was read.
 * `withTournament` retries these; a caller that sees one has exhausted retries.
 */
export class VersionConflictError extends Error {
    readonly id: string;
    constructor(id: string) {
        super(`Tournament ${id} was modified concurrently`);
        this.name = 'VersionConflictError';
        this.id = id;
    }
}

export interface TournamentStore {
    /** Connect, run migrations, warm caches. Called once at startup. */
    init(): Promise<void>;

    load(id: string): Promise<StoredTournament | null>;
    loadByJoinCode(code: string): Promise<StoredTournament | null>;
    listSummaries(): Promise<TournamentSummary[]>;

    insert(tournament: TournamentManager): Promise<void>;

    /**
     * Save, but only if the row is still at `expectedVersion`. Returns the new
     * version; throws VersionConflictError if someone else got there first.
     */
    update(tournament: TournamentManager, expectedVersion: number): Promise<number>;

    remove(id: string): Promise<void>;

    /**
     * Has this join code ever been issued -- including by a tournament since
     * deleted? Codes are never reused, so a stale bookmark 404s rather than
     * silently opening someone else's tournament.
     */
    isJoinCodeTaken(code: string): Promise<boolean>;

    /** Tournament names are unique, case-insensitively. */
    isNameTaken(name: string): Promise<boolean>;

    close(): Promise<void>;
}
