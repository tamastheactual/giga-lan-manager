// Cloudflare Worker entrypoint.
//
// The counterpart to server/index.ts: same API, different host. Everything
// platform-specific is here — reading bindings instead of process.env, and
// leaving static assets to Workers Assets rather than serving them from disk.
//
// server/app.ts is imported unchanged; if this file ever needs to reach into
// the API's internals, that is a sign the split has broken.

import type { Hono } from 'hono';
import { createApiApp, reportTokenHealth } from './app.js';
import { SupabaseTournamentStore } from './store/supabase.js';

export interface Env {
    SUPABASE_URL: string;
    /** Secret. Set with `wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. */
    SUPABASE_SERVICE_ROLE_KEY: string;
    /** Secret. Set with `wrangler secret put ADMIN_TOKEN`. */
    ADMIN_TOKEN?: string;
}

// Built once per isolate and reused across the requests that isolate serves.
// The store holds no connection -- every call is a fetch -- so there is nothing
// to pool and nothing to tear down.
let cached: { app: Hono; key: string } | null = null;

function getApp(env: Env): Hono {
    const adminToken = env.ADMIN_TOKEN || '';
    // Rebuild if the bindings changed under us (a redeploy with new secrets).
    const key = `${env.SUPABASE_URL}|${adminToken.length}`;
    if (cached?.key === key) return cached.app;

    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
            'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
            'See the Cloudflare section of the README.',
        );
    }

    reportTokenHealth(adminToken);
    const store = new SupabaseTournamentStore(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    // No store.init() here: it exists to fail fast at boot, and a Worker has no
    // boot. A missing table surfaces as a 500 on the first request instead.

    const app = createApiApp({ store, adminToken });
    cached = { app, key };
    return app;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        try {
            return await getApp(env).fetch(request, env as any, ctx as any);
        } catch (err) {
            console.error('[worker]', (err as Error).message);
            return Response.json({ error: 'Server misconfigured' }, { status: 500 });
        }
    },
};
