# Code Quality Cleanup

## Summary

This pass tightened the post-refactor architecture without changing gameplay, engine rules, skill data, role data, CSS, or `index.html`.

Main outcomes:

- Added a hygiene guard for stale architecture-test debt.
- Removed the deferred wiring note from `tests/architecture/config-session-split.spec.js`.
- Removed the stale mojibake fallback assertion from `tests/architecture/network-session-split.spec.js`.
- Added a render-view boundary check for battle canvas rendering.
- Moved `BattleCanvasRenderer` off direct mutable `BattleSessionController` fields and onto a read-only render snapshot.

## Files Changed

- `session/BattleSessionController.js`
- `ui/battle/BattleCanvasRenderer.js`
- `tests/architecture/code-quality-hygiene.spec.js`
- `tests/architecture/render-view-boundary.spec.js`
- `tests/architecture/config-session-split.spec.js`
- `tests/architecture/network-session-split.spec.js`

## What Was Cleaned

- `BattleSessionController` now exposes `getRenderViewState()` for renderer-only reads.
- `BattleCanvasRenderer` now consumes that snapshot instead of reading `hoverEffectArea`, `validTargets`, `hoveredHex`, or submitted sets directly.
- The architecture test suite no longer carries the deferred comment from the config-session split.
- The stale network-session spec no longer keeps the old mojibake assertion.
- A new hygiene spec guards against reintroducing those stale patterns and keeps the AppRuntime size budget visible.

## What Was Intentionally Not Changed

- No engine logic, skill data, or role data changes.
- No UI styling or layout changes.
- No `AppRuntime.js` ownership expansion.
- No `main.js` changes.
- No report deletions.

## Tests Run

- `npm run test:e2e -- tests/architecture/code-quality-hygiene.spec.js`
- `npm run test:e2e -- tests/architecture/render-view-boundary.spec.js`
- `npm run test:e2e -- tests/architecture/app-runtime-composition.spec.js`
- `npm run test:e2e -- tests/architecture/config-network-session-split.spec.js`
- `npm run test:e2e -- tests/architecture/config-session-split.spec.js`
- `npm run test:e2e -- tests/architecture/network-session-split.spec.js`
- `npm run test:e2e -- tests/architecture/canvas-renderer-split.spec.js`
- `npm run test:e2e`
- `npm test`

All passed. Full Playwright suite: 312 tests.

## Remaining Technical Debt

- `AppRuntime.js` is still a fairly large composition root at 403 non-empty lines.
- The battle session callback surface is still broad, even though the renderer boundary is now read-only.
- There are unrelated pre-existing worktree deletions and generated artifacts outside this cleanup pass.
