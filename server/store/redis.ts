// Redis-backed store: the original persistence, behind the store interface.
//
// Kept because it needs no cloud project to run locally, and because it is the
// migration source for an existing deployment. Keys are unchanged from before,
// so an existing Redis works as-is.

import { createClient, type RedisClientType } from 'redis';
import { TournamentManager } from '../tournament.js';
import {
    VersionConflictError,
    type StoredTournament,
    type TournamentStore,
    type TournamentSummary,
} from './types.js';

const DOC = (id: string) => `tournament:${id}`;
const VER = (id: string) => `tournament:${id}:v`;
const LIST = 'tournaments:list';
const LIVE_CODES = 'joincodes:live';
const USED_CODES = 'joincodes:used';

// Compare-and-set. Redis has no conditional write over a blob, so the version
// lives in its own key and this swaps both atomically or neither.
const CAS = `
if redis.call('GET', KEYS[2]) == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2])
  return redis.call('INCR', KEYS[2])
else
  return nil
end`;

export interface RedisStoreOptions {
    /**
     * Give up after this many failed connection attempts.
     *
     * The default is node-redis's own strategy, which retries forever. That is
     * what a running server wants, since a Redis blip should not take it down.
     * It is the wrong thing for anything that only wants to find out WHETHER
     * Redis is there: `connect()` never rejects, so the caller waits forever
     * while the error handler prints one line per attempt. Pass a finite number
     * and `init()` rejects instead.
     */
    maxRetries?: number;
    /** Per-attempt socket timeout. Only meaningful alongside maxRetries. */
    connectTimeoutMs?: number;
}

export class RedisTournamentStore implements TournamentStore {
    private client: RedisClientType;

    constructor(url: string, options: RedisStoreOptions = {}) {
        const { maxRetries, connectTimeoutMs } = options;
        this.client = createClient({
            url,
            socket: {
                ...(connectTimeoutMs === undefined ? {} : { connectTimeout: connectTimeoutMs }),
                ...(maxRetries === undefined ? {} : {
                    reconnectStrategy: (retries: number) =>
                        retries >= maxRetries
                            ? new Error(`redis unreachable after ${maxRetries} attempts`)
                            : Math.min(50 * 2 ** retries, 500),
                }),
            },
        }) as RedisClientType;
        this.client.on('error', (err) => console.error('[redis]', err.message));
    }

    /** Drop the socket without the round trip `quit()` needs. Safe on a client that never connected. */
    destroy(): void {
        try {
            this.client.destroy();
        } catch {
            // Already closed, or never opened. Either way there is nothing to release.
        }
    }

    async init(): Promise<void> {
        await this.client.connect();
    }

    async close(): Promise<void> {
        await this.client.quit().catch(() => undefined);
    }

    private parse(raw: string | null, version: string | null): StoredTournament | null {
        if (!raw) return null;
        try {
            return {
                tournament: TournamentManager.fromJSON(JSON.parse(raw)),
                version: Number(version ?? 1),
            };
        } catch (err) {
            console.error('[redis] skipping unreadable tournament record:', (err as Error).message);
            return null;
        }
    }

    async load(id: string): Promise<StoredTournament | null> {
        const [raw, version] = await Promise.all([this.client.get(DOC(id)), this.client.get(VER(id))]);
        return this.parse(raw, version);
    }

    async loadByJoinCode(code: string): Promise<StoredTournament | null> {
        const id = await this.client.hGet(LIVE_CODES, code);
        return id ? this.load(id) : null;
    }

    async listSummaries(): Promise<TournamentSummary[]> {
        const ids = await this.client.sMembers(LIST);
        if (ids.length === 0) return [];
        const raws = await this.client.mGet(ids.map(DOC));
        const out: TournamentSummary[] = [];
        for (const raw of raws) {
            const loaded = this.parse(raw, '1');
            if (loaded) out.push(summarise(loaded.tournament));
        }
        return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    async insert(t: TournamentManager): Promise<void> {
        const multi = this.client.multi();
        multi.set(DOC(t.id), JSON.stringify(t));
        multi.set(VER(t.id), '1');
        multi.sAdd(LIST, t.id);
        multi.hSet(LIVE_CODES, t.joinCode, t.id);
        multi.sAdd(USED_CODES, t.joinCode);
        await multi.exec();
    }

    async update(t: TournamentManager, expectedVersion: number): Promise<number> {
        const next = await this.client.eval(CAS, {
            keys: [DOC(t.id), VER(t.id)],
            arguments: [String(expectedVersion), JSON.stringify(t)],
        });
        if (next === null || next === undefined) throw new VersionConflictError(t.id);
        return Number(next);
    }

    async remove(id: string): Promise<void> {
        const loaded = await this.load(id);
        const multi = this.client.multi();
        multi.del(DOC(id));
        multi.del(VER(id));
        multi.sRem(LIST, id);
        // The code leaves LIVE_CODES so it stops resolving, but stays in
        // USED_CODES so it is never handed out again.
        if (loaded?.tournament.joinCode) multi.hDel(LIVE_CODES, loaded.tournament.joinCode);
        await multi.exec();
    }

    async isJoinCodeTaken(code: string): Promise<boolean> {
        // node-redis v5 types sIsMember as number (0|1) rather than boolean.
        return Number(await this.client.sIsMember(USED_CODES, code)) === 1;
    }

    async isNameTaken(name: string): Promise<boolean> {
        const target = name.trim().toLowerCase();
        const all = await this.listSummaries();
        return all.some((t) => t.name.trim().toLowerCase() === target);
    }

    /** Escape hatch for the one-off Redis -> Supabase migration. */
    async allTournaments(): Promise<TournamentManager[]> {
        const ids = await this.client.sMembers(LIST);
        const out: TournamentManager[] = [];
        for (const id of ids) {
            const loaded = await this.load(id);
            if (loaded) out.push(loaded.tournament);
        }
        return out;
    }

    /** Used by the boot migration when an old record has no credentials yet. */
    async claimCode(code: string, id: string): Promise<void> {
        await this.client.hSet(LIVE_CODES, code, id);
        await this.client.sAdd(USED_CODES, code);
    }
}

export function summarise(t: TournamentManager): TournamentSummary {
    return {
        id: t.id,
        name: t.name,
        state: t.state,
        playerCount: t.players.length,
        gameType: t.gameType,
        createdAt: t.createdAt,
        startedAt: t.startedAt,
        isTeamBased: t.isTeamBased,
        joinCode: t.joinCode,
    };
}
