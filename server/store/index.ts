import type { TournamentStore } from './types.js';
import { RedisTournamentStore } from './redis.js';
import { SupabaseTournamentStore } from './supabase.js';

export * from './types.js';
export * from './withTournament.js';
export { RedisTournamentStore } from './redis.js';
export { SupabaseTournamentStore } from './supabase.js';

/**
 * Pick a store from the environment.
 *
 * Supabase wins when it is configured, so a deployment is switched by setting
 * two variables rather than by changing code. Redis remains the default because
 * it needs no cloud project to run the app locally.
 */
export function createStore(env: Record<string, string | undefined> = process.env): TournamentStore {
    const supabaseUrl = env.SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceRoleKey) {
        console.log('[store] Supabase');
        return new SupabaseTournamentStore(supabaseUrl, serviceRoleKey);
    }

    if (supabaseUrl || serviceRoleKey) {
        throw new Error(
            'Supabase is half-configured: set BOTH SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, ' +
            'or neither to use Redis.',
        );
    }

    const redisUrl = env.REDIS_URL || 'redis://localhost:6379';
    console.log(`[store] Redis (${redisUrl})`);
    return new RedisTournamentStore(redisUrl);
}
