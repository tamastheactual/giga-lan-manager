import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TournamentManager } from '../tournament.js';
import { RedisTournamentStore } from './redis.js';
import { VersionConflictError, type TournamentStore } from './types.js';
import { withTournament, TournamentNotFoundError } from './withTournament.js';

/**
 * The contract every store must satisfy.
 *
 * Written against the interface, not an implementation, so the Supabase store
 * can be held to exactly the same behaviour as Redis by pointing this at it.
 * Skipped when there is no store to talk to, so the suite stays green on a
 * machine with neither running.
 */

const REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379';

async function redisReachable(): Promise<boolean> {
    try {
        const probe = new RedisTournamentStore(REDIS_URL);
        await probe.init();
        await probe.close();
        return true;
    } catch {
        return false;
    }
}

const available = await redisReachable();
const suite = available ? describe : describe.skip;

let counter = 0;
function makeTournament(name = 'Contract'): TournamentManager {
    counter++;
    const t = new TournamentManager(
        `00000000-0000-4000-8000-${String(Date.now() % 1e12).padStart(12, '0')}`.slice(0, 36),
        `${name} ${Date.now()}-${counter}`,
        'cs16',
    );
    // Unique per instance so parallel runs cannot collide.
    t.id = crypto.randomUUID();
    t.joinCode = `T${String(counter).padStart(5, '0')}`.slice(0, 6).toUpperCase();
    t.adminKeyHash = 'x'.repeat(64);
    return t;
}

suite('TournamentStore contract (Redis)', () => {
    let store: TournamentStore;
    const created: string[] = [];

    beforeAll(async () => {
        store = new RedisTournamentStore(REDIS_URL);
        await store.init();
    });

    afterAll(async () => {
        for (const id of created) await store.remove(id).catch(() => undefined);
        await store.close();
    });

    async function seed(name?: string): Promise<TournamentManager> {
        const t = makeTournament(name);
        await store.insert(t);
        created.push(t.id);
        return t;
    }

    it('round-trips a tournament', async () => {
        const t = await seed();
        t.addPlayer('Ann');
        await store.update(t, 1);

        const loaded = await store.load(t.id);
        expect(loaded).not.toBeNull();
        expect(loaded!.tournament.name).toBe(t.name);
        expect(loaded!.tournament.players.map((p) => p.name)).toEqual(['Ann']);
        expect(loaded!.version).toBe(2);
    });

    it('returns null for an unknown id', async () => {
        expect(await store.load(crypto.randomUUID())).toBeNull();
    });

    it('resolves a join code to its tournament', async () => {
        const t = await seed();
        const found = await store.loadByJoinCode(t.joinCode);
        expect(found?.tournament.id).toBe(t.id);
    });

    it('lists a summary without needing the document', async () => {
        const t = await seed('Listed');
        t.addPlayer('Ann');
        t.addPlayer('Bo');
        await store.update(t, 1);

        const row = (await store.listSummaries()).find((s) => s.id === t.id);
        expect(row).toBeDefined();
        expect(row!.playerCount).toBe(2);
        expect(row!.joinCode).toBe(t.joinCode);
        expect(row!.state).toBe('registration');
    });

    it('rejects a write against a stale version', async () => {
        const t = await seed();
        const a = (await store.load(t.id))!;
        const b = (await store.load(t.id))!;
        expect(a.version).toBe(b.version);

        a.tournament.addPlayer('First');
        await store.update(a.tournament, a.version);

        // b read the same version and is now behind: its write must not land.
        b.tournament.addPlayer('Second');
        await expect(store.update(b.tournament, b.version)).rejects.toBeInstanceOf(VersionConflictError);

        const after = await store.load(t.id);
        expect(after!.tournament.players.map((p) => p.name)).toEqual(['First']);
    });

    it('retires a join code so it is never reissued', async () => {
        const t = await seed();
        expect(await store.isJoinCodeTaken(t.joinCode)).toBe(true);

        await store.remove(t.id);
        expect(await store.load(t.id)).toBeNull();
        expect(await store.loadByJoinCode(t.joinCode)).toBeNull(); // stops resolving
        expect(await store.isJoinCodeTaken(t.joinCode)).toBe(true); // but stays spent
    });

    it('detects a duplicate name case-insensitively', async () => {
        const t = await seed('Unique Name');
        expect(await store.isNameTaken(t.name.toUpperCase())).toBe(true);
        expect(await store.isNameTaken('definitely not taken')).toBe(false);
    });
});

suite('withTournament (Redis)', () => {
    let store: TournamentStore;
    const created: string[] = [];

    beforeAll(async () => {
        store = new RedisTournamentStore(REDIS_URL);
        await store.init();
    });
    afterAll(async () => {
        for (const id of created) await store.remove(id).catch(() => undefined);
        await store.close();
    });

    it('loads, mutates and saves in one step', async () => {
        const t = makeTournament('WithT');
        await store.insert(t);
        created.push(t.id);

        await withTournament(store, t.id, (tt) => tt.addPlayer('Ann'));
        const after = await store.load(t.id);
        expect(after!.tournament.players).toHaveLength(1);
        expect(after!.version).toBe(2);
    });

    it('throws a not-found error rather than a null dereference', async () => {
        await expect(withTournament(store, crypto.randomUUID(), () => 1))
            .rejects.toBeInstanceOf(TournamentNotFoundError);
    });

    it('serialises concurrent writers instead of losing one', async () => {
        const t = makeTournament('Concurrent');
        await store.insert(t);
        created.push(t.id);

        // Ten writers racing on the same tournament. Under a plain
        // read-modify-write every loser would silently vanish.
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                withTournament(store, t.id, (tt) => tt.addPlayer(`P${i}`)),
            ),
        );

        const after = await store.load(t.id);
        expect(after!.tournament.players).toHaveLength(10);
        expect(new Set(after!.tournament.players.map((p) => p.name)).size).toBe(10);
    });
});
