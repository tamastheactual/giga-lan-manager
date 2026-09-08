# Backend

Express + TypeScript API over a Redis-backed store. See the [root README](../README.md)
for setup, environment variables and the full route table.

```
server/
├── index.ts        Express routes, admin auth, Redis persistence
├── tournament.ts   TournamentManager — all tournament state and rules
├── brackets.ts     pure bracket builders
├── tournament.characterization.test.ts
└── fixes.test.ts   regression tests for fixed defects
```

The domain model, game configs, scoring archetypes, result validation and
statistics all live in [`shared/`](../shared) and are imported by both the server
(relatively, as `../shared/*.js`) and the client (via the `$shared` alias).

## How state is held

```
Client → Express route → TournamentManager method → saveState() → Redis
```

Every tournament is one `TournamentManager` instance in an in-memory `Map`,
serialized whole to `tournament:<id>` on each mutation. `tournaments:list` is a
Redis set of ids, read once at boot to rehydrate. Admin sessions live under
`session:*` in the same Redis.

Because the authoritative copy is in process memory, **only one app instance may
run against a given Redis**.

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

// entrants — registration phase only
addPlayer(name) / removePlayer(id) / updatePlayerName(id, name)
updatePlayerPhoto(id, photo)              // data URL, 2 MB cap
addTeam(name, playerIds, logo?) / updateTeam(id, updates) / removeTeam(id)

// results — group phase only
submitMatchResult(matchId, results, mapName?)
submitTeamMatchResult(matchId, team1Score, team2Score, games?)
resetGroupData(podId) / updateGroupName(podId, name)

// playoffs
submitBracketGameResult(matchId, game)     // upserts by gameNumber
submitBracketWinner(matchId, winnerId)     // no-op if already that winner
submitTeamBracketGameResult(matchId, game)
submitTeamBracketWinner(matchId, teamId)

// reads
getRankings() / getTeamRankings() / getChampion() / getChampionTeam()
getPlayerStatistics()                      // per-player K/D, team mode
getGameConfig() / getArchetype()
```

## Invariants worth knowing

- **Aggregates are rebuilt, never incremented.** `submitMatchResult` recomputes
  every player's totals from the completed matches, and the bracket series score
  is recomputed from `match.games`. Resubmitting or correcting a result is
  therefore idempotent — no double counting.
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
  match id rather than at random, and the boot loader persists the result — it
  used to pick differently on every restart and never save.

## Bracket builders

`brackets.ts` holds pure functions: given seeded entrants (index 0 = top seed)
each returns the match list, with no dependency on tournament state.
`TournamentManager` decides who qualifies and in what order, then delegates the
shape. `reorderForCrossGroupMatchups` is generic over players and teams.

## Testing

```bash
npm test           # from the repo root
```

`tournament.characterization.test.ts` pins current observable behaviour so a
refactor is caught the moment it changes an output. `fixes.test.ts` covers each
defect fixed in the September 2026 review and fails against the code as it stood
before.
