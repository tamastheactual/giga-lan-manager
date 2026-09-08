// Node entrypoint.
//
// Everything platform-specific lives here: reading the environment, choosing a
// store, serving the built SPA off disk, and starting an HTTP listener. The API
// itself is in server/app.ts and knows none of that, which is what lets the
// Cloudflare Worker mount exactly the same routes.

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { createApiApp, reportTokenHealth } from './app.js';
import { createStore, RedisTournamentStore, type TournamentStore } from './store/index.js';

const port = Number(process.env.PORT || 3000);

// ADMIN_PASSWORD is still honoured so existing deployments keep working.
const adminToken = process.env.ADMIN_TOKEN || process.env.ADMIN_PASSWORD || '';
if (adminToken && process.env.ADMIN_TOKEN === undefined) {
    console.warn('[auth] ADMIN_PASSWORD is deprecated; rename it to ADMIN_TOKEN.');
}
reportTokenHealth(adminToken);

const store: TournamentStore = createStore();

/**
 * Bring records written before per-tournament access up to date.
 *
 * Only the Redis store can hold those -- the Supabase schema requires both
 * credential columns -- so this runs once, on the way out of the old world.
 */
async function migrateLegacyRecords(s: TournamentStore): Promise<void> {
    if (!(s instanceof RedisTournamentStore)) return;

    for (const tournament of await s.allTournaments()) {
        let dirty = tournament.fillMissingMaps();

        if (!tournament.joinCode || !tournament.adminKeyHash) {
            // Printed once, because nobody else has it. A holder of the
            // instance admin token can manage the tournament regardless.
            const adminKey = await tournament.issueAccess(await freshLegacyCode(s));
            console.log(
                `[migrate] "${tournament.name}" -> join code ${tournament.joinCode}, admin key ${adminKey}`,
            );
            dirty = true;
        }
        await s.claimCode(tournament.joinCode, tournament.id);

        if (dirty) {
            const current = await s.load(tournament.id);
            if (current) await s.update(tournament, current.version);
        }
    }
}

async function freshLegacyCode(s: TournamentStore): Promise<string> {
    const { generateJoinCode } = await import('../shared/access.js');
    for (let i = 0; i < 100; i++) {
        const code = generateJoinCode();
        if (!(await s.isJoinCodeTaken(code))) return code;
    }
    throw new Error('Could not allocate a unique join code');
}

const app = new Hono();
app.route('/', createApiApp({ store, adminToken }));

// Serve the built SPA. In Docker the server runs from /app with dist/ beside
// it; locally `npm run start:server` runs from the repo root. Both are cwd.
const distDir = path.join(process.cwd(), 'dist');
app.use('/*', serveStatic({ root: path.relative(process.cwd(), distDir) || 'dist' }));

// Client-side routes (/t/<code>, /tournament/<id>/groups, ...) have no file on
// disk; they are all the same shell. /api/* never reaches here -- the API app
// answers unmatched API paths with JSON above.
let indexHtml: string | null = null;
app.get('*', async (c) => {
    try {
        indexHtml ??= await readFile(path.join(distDir, 'index.html'), 'utf8');
        return c.html(indexHtml);
    } catch {
        return c.text('The client has not been built yet. Run `npm run build`.', 503);
    }
});

(async () => {
    await store.init();
    await migrateLegacyRecords(store);
    console.log('[store] ready');

    serve({ fetch: app.fetch, port }, (info) => {
        console.log(`Server running at http://localhost:${info.port}`);
    });
})().catch((err) => {
    console.error('[startup] failed:', err.message);
    process.exit(1);
});
