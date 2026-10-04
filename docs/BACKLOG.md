# Backlog: known technical debt

None of these block the first PR; nothing here is broken today. Each is a scoped
follow-up.

| # | Item | Why | Suggested approach |
|---|---|---|---|
| 1 | **Three.js bundle splitting** | The production bundle is over 500 kB (Vite warns), so first load is slower than it needs to be. | Split `three` and the renderer into a separate chunk (`build.rollupOptions.output.manualChunks`, or a dynamic `import()` of the stage), and load the HUD first. |
| 2 | **Disposal of textures and scene resources** | Section changes dispose geometries but not canvas textures, per-section materials or lights. Long sessions slowly leak GPU memory. | A `dispose(section)` that walks the group and frees textures, materials and geometries, with tracked shared materials kept alive. Add a smoke check on renderer memory info after N section changes. |
| 3 | **Chronicle / evidence pagination or archival** | `chronicle`, `evidence`, `interactions` and `ledger` grow without bound, are scanned linearly, and inflate save size. | Index by actor/scope; page queries; archive older segments into checksummed chunks (save slot + archive slots); keep summaries hot. Never edit entries (append-only), only move them. |
| 4 | **Remove unsafe casts** | `as never` / `as unknown as` casts on branded ids in content loading, seeding and some UI code bypass type safety. | Typed id constructors per brand (`itemId(s)`, `locationId(s)`) validated at the content boundary, then remove the casts. Enable a lint rule that bans `as never`. |
| 5 | **Remove production debug handles** | `window.__eotr` (sim, game, saves, AI) is exposed in production builds, and `debugPlace` exists on `Game`. | Gate both behind `import.meta.env.DEV` (and a test build flag for the smoke test). Strip them in production. |
| 6 | **Incremental UI rendering** | HUD panels rebuild their DOM on every update (dialogue, journal, companions). | Keyed row updates or a small view library. React is acceptable here, scoped to `src/ui` panels only. |
| 7 | **Accessibility pass** | Keyboard-only movement; no touch or mouse movement; no focus management, ARIA roles or reduced-motion handling; contrast not audited. | Click/tap-to-move, focus trapping in panels, ARIA labels, a text-size option, reduced motion, colour-contrast audit, and screen-reader text for toasts. |
| 8 | **Content refresh for existing saves** (from `docs/PROVISIONAL.md`) | Saved worlds keep the placeholder values they were founded with. | An explicit, logged content-refresh migration that updates definitions (prices, items) without rewriting history. |
