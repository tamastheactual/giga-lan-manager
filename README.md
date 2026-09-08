# GIGA LAN Tournament Manager

A self-hosted web app for running competitive LAN party tournaments: a round-robin
group stage followed by single-elimination playoffs, for twenty retro PC games,
in solo or team mode.

Built for the ELTE AI Department LAN series.

---

## Quick start

### With Docker (recommended)

```bash
docker compose up --build
```

Then open <http://localhost:3000>.

### Local development

```bash
docker compose up -d redis   # or: docker run -d -p 6379:6379 redis:alpine
npm install
npm run dev                  # client on :5173, API on :3000
```

Vite proxies `/api` to the API server, so the client and API are same-origin in
dev as well as in production.

## Sessions: sharing a tournament

Every tournament gets two credentials when it is created. They are shown once,
together, right after creation.

| | What it is | What it does | Share it? |
| --- | --- | --- | --- |
| **Join code** | 6 characters, e.g. `7K2QMX` | Opens `/t/7K2QMX` — a live, read-only view of the brackets, standings and statistics | **Yes.** That is the point |
| **Admin key** | 26 characters, 128 bits | Enters results and changes anything in that one tournament | **No.** Only to a co-organiser |

They are split because they have very different exposure. A code short enough to
read off a projector is short enough to guess, so it only ever grants reading.
The admin key is never displayed publicly, so it can be long.

**Sharing.** Hand out `https://your-host/t/7K2QMX`, or the code itself for
`/join`. Anyone with it watches live and can change nothing.

**Revisiting.** The join link is permanent — bookmark it. Codes stay valid for
finished tournaments, so past events remain browsable. A code is never reissued,
even after the tournament it belonged to is deleted: an old bookmark goes stale
rather than silently opening somebody else's tournament.

**Keeping control.** The admin key is saved in the creator's browser
(`localStorage`) automatically, so that browser just works. The server stores
only a SHA-256 hash, so the key can never be shown again — copy it if you might
run the tournament from another device.

Codes are Crockford base32 (no `I`, `L`, `O` or `U`), and input is normalised:
`7k2q-mx`, `7K2Q MX` and `7K2QMX` are the same code. Code lookups are rate
limited to 30 failures per 15 minutes per address.

## Who can do what

Three levels, and they are independent:

| Role | Holds | Can |
| --- | --- | --- |
| **Viewer** | a join code | Read one tournament |
| **Tournament admin** | that tournament's admin key | Write to that tournament |
| **Instance owner** | the instance `ADMIN_TOKEN` | Create and import tournaments, list them all, and manage any of them |

### Locking down who can create tournaments

Generate a token — 128 bits, not something you invent:

```bash
npm run gen-token
```

Set it on the server:

```bash
# docker compose: put ADMIN_TOKEN=... in a .env file beside docker-compose.yml
docker compose up --build

# local
ADMIN_TOKEN='<token>' npm run start:server
```

Then open the secret bootstrap link **once** in the browser you organise from:

```
https://your-host/admin/<token>
```

That browser stores the token and strips it back out of the URL. From then on it
can create tournaments and nothing else can. You can also paste the token at
`/login`, which is easier on a phone.

There is **no login session and no cookie** — the token is sent as an
`X-Admin-Token` header on each request. Nothing expires, and there is no session
store to keep. Failed token checks are rate-limited to 10 per 15 minutes per
address.

Leave `ADMIN_TOKEN` unset and anyone who can reach the server may create
tournaments; the server warns loudly at boot, and again if the token you did set
looks guessable. **Writing to an existing tournament always needs that
tournament's own admin key either way** — an open instance never means an open
tournament.

> The token lives in `localStorage`, like the per-tournament admin keys. That is
> a deliberate trade: it makes the whole model one uniform bearer-token scheme
> that ports to an edge runtime unchanged, at the cost of not being `httpOnly`.
> For a self-hosted tournament tool that is the right side of the trade; if you
> ever expose this to untrusted users, revisit it.

`ADMIN_PASSWORD` still works as a deprecated alias for `ADMIN_TOKEN`.

Tournaments created before per-tournament access existed get a code and a key on
first boot, printed once to the server log. An instance owner can manage them
regardless.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string (used when Supabase is not configured) |
| `SUPABASE_URL` | *(unset)* | Supabase project URL. Set both this and the key to use Postgres |
| `SUPABASE_SERVICE_ROLE_KEY` | *(unset)* | Service role key. **Server only** — never ship it to a browser |
| `ADMIN_TOKEN` | *(unset)* | The secret that permits creating tournaments. `npm run gen-token` |
| `ADMIN_PASSWORD` | *(unset)* | Deprecated alias for `ADMIN_TOKEN` |
| `NODE_ENV` | — | `production` in the Docker runtime image |

## Scripts

```bash
npm run dev            # client + API together, both watching
npm run dev:client     # Vite only
npm run dev:server     # API only (tsx --watch)

npm run build          # client -> dist/
npm run build:server   # server -> dist-server/
npm run preview        # preview the built client

npm run check          # svelte-check + tsc (no errors, no warnings)
npm test               # unit tests (Vitest)
npm run test:watch     # unit tests in watch mode
npm run test:e2e       # Playwright, drives the real built app

npm run start:server   # serve the built SPA + API on :3000
npm run gen-token      # generate an instance ADMIN_TOKEN
npm run migrate:supabase  # copy tournaments from Redis into Supabase
```

## Tournament flow

### 1. Registration

Add players (and, in team mode, build teams). Player names, the tournament name
and group names can all be edited. A player belongs to at most one team.

**Minimum: 2 players.** Small fields take shortcuts:

| Entrants | Format |
| --- | --- |
| 2 | Straight to a single Grand Final — no group stage |
| 3 | One round-robin group; the top 2 contest the final |
| 4+ | Groups, then playoffs (see below) |

11 and 13 players are padded with a BYE player up to 12 and 14.

### 2. Group stage

A **complete round-robin** inside each group — every entrant plays every other
group member exactly once, spread across rounds. Win 3 points, draw 1, loss 0.

| Players | Groups |
| --- | --- |
| 4, 5, 7 | 1 |
| 6, 8, 10, 14 | 2 |
| 9, 12, 15 | 3 |
| 16 | 4 |
| 17+ | groups of ~4 |

Standings sort on points, then total game score, then head-to-head, then wins,
then fewer losses, then score differential, then name.

### 3. Playoffs

Single elimination. Qualification is **top-K from each group**, not a global
top-N, so a strong group's lower seed can't displace a weak group's winner.
Seeding then interleaves across groups so the first round isn't a rematch of a
game already played — in both solo and team mode.

| Qualifiers | Shape |
| --- | --- |
| 4 (from one group) | Grand Final + 3rd-place match — everyone already played |
| 4 (from several groups) | Semifinals → Final + 3rd place |
| 6 | Top 2 seeds bye to the semis; seeds 3–6 play quarterfinals |
| 8 | Quarterfinals (1v8, 4v5, 2v7, 3v6) → Semifinals → Final + 3rd place |

Playoff matches are best-of-3 by default (`playoffs.mapsPerMatch` per game).
Submitting a map upserts by game number and rebuilds the series score, so a
double-click or a corrected result replaces the map rather than counting twice.

### 4. Completion

Once every bracket match has a winner the tournament is marked complete, and the
champion podium and confetti appear. The full bracket stays viewable.

## Games and scoring

Twenty games are described declaratively in `shared/gameTypes.ts` and reduce to
five **scoring archetypes** in `shared/gameArchetypes.ts`:

| Archetype | Meaning | Games |
| --- | --- | --- |
| `rounds` | Play to a round limit | CS 1.6, R6 Siege, RtCW, W:ET |
| `kills` | Deathmatch, most frags | UT99, UT2004, Quake III, Halo, MoH:AA, BF1942, BF:V, SWBF 1/2, DF:BHD |
| `health` | Winner records remaining HP | Worms Armageddon |
| `winonly` | Only who won | AoE2, WC3, Stronghold, RA1, RA2 |
| `points` | Custom scoring, set per tournament | any (opt-in) |

Adding a game is a config entry plus a logo in `src/assets/games/`.

**Team mode** is available for games with `supportsTeamMode` (CS 1.6, R6 Siege).
Team matches additionally track per-player kills and deaths per map.

Result validation lives in `shared/validation.ts` and is enforced by the server,
not only the UI: points must be 3/1/0, the result must name exactly the two
entrants in that match, the winner cannot have the lower score, draws are
rejected for games that can't draw, and a team match can't be recorded 0-0.

## Architecture

```
shared/           single source of truth, imported by BOTH sides
  types.ts          domain model
  gameTypes.ts      the 20 game configs
  gameArchetypes.ts the 5 scoring archetypes
  validation.ts     result rules
  statistics.ts     pure stat aggregation
  access.ts         join codes and admin keys (Web Crypto, no Node built-ins)

server/
  index.ts          Express routes and admin auth
  store/            persistence: the interface, Redis and Supabase, locking
  tournament.ts     TournamentManager: all state and rules
  brackets.ts       pure bracket builders (seeded entrants -> matches)

src/
  App.svelte        path-based router
  Layout.svelte     nav bar
  lib/api.ts        API client
  pages/            TournamentList, TournamentDashboard, Groups,
                    Brackets, Statistics, Login
```

The client imports `shared/` through the `$shared` Vite alias; the server imports
it relatively. Don't fork it — the two copies that predated it had already
drifted apart.

## Storage

Persistence sits behind a store interface (`server/store/`), so the same code
runs on either backend:

| Backend | When | Notes |
| --- | --- | --- |
| **Redis** | default | Needs no cloud project. Good for local work |
| **Supabase** | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` set | Postgres; the target for edge deployment |

Nothing is cached between requests. Every route loads the tournament it needs,
mutates it and writes it back, so the process holds no authoritative state and
**more than one instance can run** — which was not true before, when an
in-memory `Map` was the source of truth and a second instance would have served
a stale snapshot and overwritten the first one's writes.

Because every write is a whole-tournament read-modify-write, two people
submitting results at the same moment would lose one. Writes therefore go
through `withTournament()`, which asserts the version it read and replays the
mutation against fresh state on conflict. `server/store/contract.test.ts` holds
both backends to identical behaviour, including ten concurrent writers all
landing.

### Setting up Supabase

```bash
# 1. apply the schema to a new project
supabase db execute --file supabase/schema.sql   # or paste it into the SQL editor

# 2. bring existing tournaments across (join codes and admin keys are preserved)
REDIS_URL=redis://localhost:6379 \
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
npm run migrate:supabase -- --dry-run     # then again without --dry-run

# 3. point the server at it
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run start:server
```

The migration is re-runnable — anything already present is skipped — so keep the
Redis data until the new instance is confirmed working.

**Expect Postgres to be slower than Redis**, because every request is now an
HTTP round trip rather than a local socket. Measured against a live project:
~60-120 ms to read a tournament, ~270 ms to write one (a write is two round
trips — load, then the version-checked update). Fine for entering results;
worth knowing before assuming the app got slower for some other reason.

Both tables have RLS enabled with **no permissive policy**, so the anon and
publishable keys can read nothing. The API talks to Postgres as the service role
and enforces access itself; without that lockdown, publishing the anon key would
publish every `admin_key_hash`.

## API

All `POST`/`PUT`/`DELETE` routes require an admin session when `ADMIN_PASSWORD`
is set. `GET` is always public.

### Auth and joining

Writes to a tournament carry its admin key in an **`X-Admin-Key`** header.
Creating one carries the instance token in **`X-Admin-Token`**, which also acts
as a master key on any tournament. No cookies are used.

| Method | Route | |
| --- | --- | --- |
| POST | `/api/admin/verify` | `{ token }` — check the instance token before storing it |
| GET | `/api/admin/status` | `{ authRequired, isAdmin, isOwner }` |
| GET | `/api/join/:code` | Resolve a join code to its tournament. Public, rate limited |

### Tournaments
| Method | Route | |
| --- | --- | --- |
| GET | `/api/health` | |
| GET | `/api/games` | all game configs |
| GET | `/api/team-games` | games supporting team mode |
| GET | `/api/tournaments` | list — **instance owner only** |
| POST | `/api/tournaments` | `{ name, gameType, mapPool?, ... }` → returns `joinCode` and `adminKey` (once) |
| POST | `/api/tournaments/import` | restore from an exported JSON state; always mints **fresh** credentials |
| DELETE | `/api/tournament/:id` | |
| GET | `/api/tournament/:id/state` | full state, plus `joinCode` and `isAdmin` for the caller |
| PUT | `/api/tournament/:id/name` | `{ name }` |
| POST | `/api/tournament/:id/reset` | back to registration, clears solo **and** team data |

### Players and teams
| Method | Route | |
| --- | --- | --- |
| POST | `/api/tournament/:id/players` | `{ name }` |
| PUT | `/api/tournament/:id/player/:pid` | `{ name }` |
| PUT | `/api/tournament/:id/player/:pid/photo` | `{ photo }` — data URL, 2 MB cap |
| DELETE | `/api/tournament/:id/player/:pid` | also clears them from their team |
| POST | `/api/tournament/:id/teams` | `{ name, playerIds, logo? }` |
| PUT | `/api/tournament/:id/team/:tid` | `{ name?, playerIds?, logo? }` |
| PUT | `/api/tournament/:id/team/:tid/logo` | `{ logo }` |
| DELETE | `/api/tournament/:id/team/:tid` | |

### Running a tournament
| Method | Route | |
| --- | --- | --- |
| POST | `/api/tournament/:id/start` | start the group stage |
| POST | `/api/tournament/:id/start-team` | start a team group stage |
| POST | `/api/tournament/:id/match/:mid` | `{ results, mapName? }` |
| POST | `/api/tournament/:id/team-match/:mid` | `{ team1Score, team2Score, games? }` |
| PUT | `/api/tournament/:id/group/:pid/name` | `{ name }` |
| POST | `/api/tournament/:id/group/:pid/reset` | clear that group's results |
| POST | `/api/tournament/:id/brackets` | generate playoffs (solo or team, auto-detected) |
| POST | `/api/tournament/:id/team-brackets` | generate team playoffs |
| POST | `/api/tournament/:id/bracket-match/:mid` | `{ winnerId }` |
| POST | `/api/tournament/:id/bracket-match/:mid/game` | one map of a series |
| POST | `/api/tournament/:id/team-bracket-match/:mid` | `{ winnerId }` |
| POST | `/api/tournament/:id/team-bracket-match/:mid/game` | one map, with player stats |
| GET | `/api/tournament/:id/player-stats` | team tournaments only |
| GET | `/api/tournament/:id/team-rankings` | team tournaments only |

## Testing

```bash
npm test          # Vitest: engine, validation and statistics
npm run test:e2e  # Playwright: the real built app in a browser (needs Redis)
```

| File | Covers |
| --- | --- |
| `server/tournament.characterization.test.ts` | Locks current engine behaviour so refactors are caught |
| `server/fixes.test.ts` | Regression tests for each fixed defect |
| `shared/statistics.test.ts` | The pure statistics aggregation |
| `shared/access.test.ts` | Code generation, normalisation, key hashing, path matching |
| `server/store/contract.test.ts` | The store contract and optimistic locking, run against a live Redis |
| `e2e/smoke.spec.ts` | Creation and credentials, the join flow, key enforcement, the stats page, team avatars |

CI (`.github/workflows/ci.yml`) runs `npm run check`, `npm test` and the build on
every push and pull request, and the Playwright suite against a Redis service.

## Backup

`./backup.sh` writes each tournament's full state to
`backups/tournaments_<timestamp>/`. Those files import straight back through the
lobby's **Import** button. `./stop.sh` runs a backup before shutting down.

## Design system

Tailwind, with a cyberpunk-leaning dark palette defined in `tailwind.config.js`.

- Background: `space-900` `#0a0e27` → `space-800` `#151937`
- Text: `gaming-text` `#e8eef5`
- Accents: cyber green `#00ff88`, cyber blue `#00d4ff`, cyber pink `#ff0080`
- `.glass` backdrop blur, `.gradient-text`, `.btn-glow`, `.card-entrance`

Avatars come from `src/assets/players/`, keyed by lowercase full name in
`src/lib/playerImages.ts`, falling back to `Cat.jpg`. Uploaded photos are stored
as data URLs; bundled asset paths are never persisted, because their build hash
changes on every rebuild.
