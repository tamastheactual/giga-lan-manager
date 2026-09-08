# Frontend

Svelte 5 (runes) + Vite + Tailwind. See the [root README](../README.md) for
scripts, the tournament rules and the API.

```
src/
├── main.ts              mount
├── App.svelte           path-based router
├── Layout.svelte        nav bar + admin login/logout
├── app.css              Tailwind entry and global styles
├── components/          Confetti, Footer
├── lib/
│   ├── api.ts           API client; re-exports the shared types
│   ├── playerImages.ts  name → bundled avatar, plus resolvePlayerAvatar()
│   ├── teamImages.ts    team logo helpers and upload validation
│   └── gameLogos.ts     game logo lookup (Vite glob over src/assets/games)
└── pages/
    ├── TournamentList.svelte       lobby: create, import, delete
    ├── TournamentDashboard.svelte  registration, rosters, podium
    ├── Groups.svelte               group stage results entry
    ├── Brackets.svelte             playoff bracket and series entry
    ├── Statistics.svelte           charts, rankings, shareable cards
    └── Login.svelte                admin login
```

## Routing

`App.svelte` reads `window.location.pathname` and renders one of
`/`, `/login`, `/tournament/:id`, `/tournament/:id/groups`,
`/tournament/:id/brackets`, `/tournament/:id/statistics`.

Navigation is a full page load, not client-side routing. It is simple and it
works; it also means every move between pages refetches the bundle and state.

## State

Svelte 5 runes throughout: `$state` for local state, `$derived` / `$derived.by`
for computed values, `$effect` for side effects, `$props` for component inputs.
Pages load through `$lib/api` on mount and reload after each mutation - the
server is always the source of truth.

## Where the logic lives

Scoring rules, game configs and statistics aggregation are **not** in the
components: they are in [`shared/`](../shared) so the server enforces the same
rules and the pure functions can be unit-tested.

- `shared/gameArchetypes.ts` - what a score means for a given game
- `shared/validation.ts` - what a valid result looks like
- `shared/statistics.ts` - score aggregation, placement, head-to-head, match
  history, advanced stats. `Statistics.svelte` imports these and only renders.

## Avatars

`resolvePlayerAvatar(player)` is the one way to pick a player image. An uploaded
photo (stored as a data URL) wins; anything else falls back to a lookup by name
in `playerImages.ts`. Bundled asset URLs are deliberately never persisted - their Vite content hash changes on every production build.

## Design system

Defined in `tailwind.config.js` and `app.css`: `space-*` backgrounds,
`cyber-green` / `cyber-blue` / `cyber-pink` accents, `brand-*` gradients, and the
`.glass`, `.gradient-text`, `.btn-glow` and `.card-entrance` utilities.
