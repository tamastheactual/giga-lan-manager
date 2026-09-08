// One-off migration: Redis -> Supabase.
//
//   REDIS_URL=redis://localhost:6379 \
//   SUPABASE_URL=https://xxxx.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=... \
//   npm run migrate:supabase [-- --dry-run]
//
// Join codes and admin key hashes are carried across unchanged, so every link
// already handed out and every admin key already saved in someone's browser
// keeps working. Re-runnable: a tournament already present is skipped, so a
// partial run can simply be repeated.

import { RedisTournamentStore } from '../server/store/redis.js';
import { SupabaseTournamentStore } from '../server/store/supabase.js';

const dryRun = process.argv.includes('--dry-run');

function required(name: string): string {
    const value = process.env[name];
    if (!value) {
        console.error(`Missing ${name}.`);
        process.exit(1);
    }
    return value;
}

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const supabaseUrl = required('SUPABASE_URL');
const serviceRoleKey = required('SUPABASE_SERVICE_ROLE_KEY');

const source = new RedisTournamentStore(redisUrl);
const target = new SupabaseTournamentStore(supabaseUrl, serviceRoleKey);

await source.init();
await target.init(); // fails loudly if the schema was never applied

const tournaments = await source.allTournaments();
console.log(`Found ${tournaments.length} tournament(s) in Redis${dryRun ? ' (dry run)' : ''}\n`);

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const tournament of tournaments) {
    const label = `${tournament.joinCode || '??????'}  ${tournament.name}`;

    if (!tournament.joinCode || !tournament.adminKeyHash) {
        // The server mints these at boot; running it once against Redis first
        // means nobody loses access on the way over.
        console.log(`  SKIP  ${label} - no credentials yet; start the server against Redis once first`);
        skipped++;
        continue;
    }

    if (await target.load(tournament.id)) {
        console.log(`  SKIP  ${label} - already in Supabase`);
        skipped++;
        continue;
    }

    if (dryRun) {
        console.log(`  WOULD ${label} (${tournament.players.length} players, ${tournament.state})`);
        migrated++;
        continue;
    }

    try {
        await target.insert(tournament);
        console.log(`  OK    ${label} (${tournament.players.length} players, ${tournament.state})`);
        migrated++;
    } catch (err) {
        console.error(`  FAIL  ${label} - ${(err as Error).message}`);
        failed++;
    }
}

console.log(`\n${dryRun ? 'Would migrate' : 'Migrated'}: ${migrated}   Skipped: ${skipped}   Failed: ${failed}`);
if (!dryRun && migrated > 0) {
    console.log('\nSwitch over by setting SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.');
    console.log('Keep the Redis data until you have confirmed the new instance works.');
}

await source.close();
await target.close();
process.exit(failed > 0 ? 1 : 0);
