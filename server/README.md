# Backend

Hono + TypeScript API over a pluggable store. See the [root README](../README.md)
for setup, environment variables and the full route table.

```
server/
├── app.ts          the whole API as a Hono app - no Node built-ins
├── index.ts        Node entrypoint: env, static files, HTTP listener
├── worker.ts       Cloudflare entrypoint: bindings, Workers Assets
├── store/
│   ├── types.ts          the store contract and VersionConflictError
│   ├── redis.ts          Redis store (development and tests)
│   ├── supabase.ts       Supabase/Postgres store (production)
│   ├── withTournament.ts load-mutate-save under optimistic locking
│   ├── index.ts          createStore() - picks a backend from the environment
│   └── contract.test.ts  both backends held to identical behaviour
├── tournament.ts   TournamentManager - all tournament state and rules
├── brackets.ts     pure bracket builders
├── tournament.characterization.test.ts
└── fixes.test.ts   regression tests for fixed defects
```

The domain model, game configs, scoring archetypes, result validation, access
credentials and statistics all live in [`shared/`](../shared) and are imported by
both the server (relatively, as `../shared/*.js`) and the client (via the
`$shared` alias).

## One API, two hosts

`app.ts` is the entire application and contains **no Node built-ins and no
assumption about how it is served**. Both entrypoints mount it unchanged:

| | `index.ts` (Node) | `worker.ts` (Cloudflare) |
| --- | --- | --- |
| Configuration | `process.env` | `Env` bindings |
| Store | `createStore()` - Supabase or Redis | Supabase only |
| Static assets | `serveStatic` from `dist/` | Workers Assets |
| Startup | `store.init()`, legacy migration | none - a Worker has no boot |

That constraint is what keeps the edge deployment honest, and it is load-bearing
in `shared/access.ts` (Web Crypto, not `node:crypto`) and `store/supabase.ts`
(PostgREST over `fetch`, not a TCP driver).

> **Do not import `./store/index.js` from `app.ts` or `worker.ts`.** That barrel
> re-exports the Redis store, and a bundler following it pulls the Redis client
> and its `node:dns` / `node:events` dependencies into the Worker, which then
> fails to build. Import `./store/supabase.js`, `./store/types.js` and
> `./store/withTournament.js` directly.

## How state is held

```
Client → Hono route → withTournament(store, id, mutate) → store.update(version)
```

**Nothing is cached between requests.** Every route loads the tournament it
needs, mutates it and writes it back, so the process holds no authoritative
state and **more than one instance can run**. That was not true before, when an
in-memory `Map` was the source of truth and a second instance would have served
a stale snapshot and overwritten the first one's writes.

Because every write is a whole-tournament read-modify-write, two people
submitting results at the same moment would otherwise silently lose one. Writes
therefore go through `withTournament()`, which asserts the version it read and
**replays** the mutation against freshly loaded state on conflict - these are
short, idempotent operations, so replaying is both correct and cheaper than
reasoning about a merge. Twelve attempts, exponential backoff with jitter.

The version check is atomic on both backends: a Lua compare-and-set on Redis, the
`update_tournament` function on Postgres. `store/contract.test.ts` runs one suite
against every backend it can reach, including ten concurrent writers all landing;
a backend that is not there is skipped, never waited on.

## Access control

Three levels, enforced in one middleware in `app.ts`, and **independent** of one
another. There is no login session and no cookie - every request carries a bearer
token in a header.

| Level | Header | May |
| --- | --- | --- |
| Viewer | *(none - needs only the id a join code resolves to)* | Read one tournament |
| Tournament admin | `X-Admin-Key` | Write to that tournament |
| Instance owner | `X-Admin-Token` | Create and import, list all, manage any |

Credentials are minted in `shared/access.ts`: a 6-character Crockford base32 join
code that only ever grants reading, and a 128-bit admin key stored as a SHA-256
hash and shown exactly once. `pathTournamentId()` decides which gate a mutating
request meets, so it is security-relevant - a write that fails to match there
falls through to the create gate instead.

`isInstanceOwner` is **false when no `ADMIN_TOKEN` is set**: with nothing
configured there is no instance owner. Treating everyone as the owner once made
it a master key over every tournament, so on an open instance any visitor could
write to any tournament without its admin key.

## TournamentManager

State machine: `registration → group → playoffs → completed`, plus `reset()`
back to `registration` from anywhere.

```ts
// lifecycle
startGroupStage()            // registration → group (or → playoffs for 2 entrants)
startTeamGroupStage()
generateBrackets()           // group → playoffs
generateTeamBrackets()
reset()                      // → registration, clears solo AND team data

// entrants - registration phase only
addPlayer(name) / removePlayer(id) / updatePlayerName(id, name)
updatePlayerPhoto(id, photo)              // data URL, 2 MB cap
addTeam(name, playerIds, logo?) / updateTeam(id, updates) / removeTeam(id)

// results - group phase only
submitMatchResult(matchId, results, mapName?)
submitTeamMatchResult(matchId, team1Score, team2Score, games?)
resetGroupData(podId) / updateGroupName(podId, name)

// playoffs
submitBracketGameResult(matchId, game)     // upserts by gameNumber
submitBracketWinner(matchId, winnerId)     // no-op if already that winner
submitTeamBracketGameResult(matchId, game)
submitTeamBracketWinner(matchId, teamId)

// access
issueAccess(joinCode?)                     // mints the admin key, returns it ONCE
isAdminKey(key)

// reads
getRankings() / getTeamRankings() / getChampion() / getChampionTeam()
getPlayerStatistics()                      // per-player K/D, team mode
getGameConfig() / getArchetype()
```

## Invariants worth knowing

- **Aggregates are rebuilt, never incremented.** `submitMatchResult` recomputes
  every player's totals from the completed matches, and the bracket series score
  is recomputed from `match.games`. Resubmitting or correcting a result is
  therefore idempotent - no double counting. This is also what makes replaying a
  mutation after a version conflict safe.
- **Phase guards are real.** Adding entrants, editing teams and submitting group
  results are rejected outside the phase that owns them. Editing a group result
  after the bracket is seeded would silently rewrite the standings the bracket
  was built from.
- **The engine validates, not just the UI.** `shared/validation.ts` rejects
  out-of-range points, results naming the wrong players, a winner who scored
  lower than the loser, illegal draws, and 0-0 team matches.
- **Playoff qualification is top-K per group**, then reordered across groups so
  the first round is not an intra-group rematch. Both solo and team.
- **`submitBracketWinner` returns early when the winner is unchanged.** The
  playoff UI submits the series games (which already decide the match) and then
  calls the winner endpoint; without the guard the second pass seeded the same
  loser into both slots of the 3rd-place match.
- **Map back-fill is deterministic.** `fillMissingMaps()` derives a map from the
  match id rather than at random, and the boot loader persists the result - it
  used to pick differently on every restart and never save.
- **An imported tournament always gets fresh credentials.** An exported JSON file
  must never carry working admin access to whoever happens to receive it, and a
  client-supplied primary key is never trusted.

## Bracket builders

`brackets.ts` holds pure functions: given seeded entrants (index 0 = top seed)
each returns the match list, with no dependency on tournament state.
`TournamentManager` decides who qualifies and in what order, then delegates the
shape. `reorderForCrossGroupMatchups` is generic over players and teams.

## Testing

```bash
npm test           # from the repo root
```

| File | Covers |
| --- | --- |
| `tournament.characterization.test.ts` | Pins current observable behaviour so a refactor is caught the moment it changes an output |
| `fixes.test.ts` | Each defect fixed in the September 2026 review; fails against the code as it stood before |
| `store/contract.test.ts` | The store contract and optimistic locking, against every backend it can reach |
