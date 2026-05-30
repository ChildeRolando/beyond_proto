# GalaxyOverlayController + GameOverController Extraction Report

## Summary

Extracted galaxy overlay DOM management and game over panel management from `main.js` into `ui/battle/GalaxyOverlayController.js` and `ui/battle/GameOverController.js`.

### GalaxyOverlayController
Owns `#galaxy-overlay` show/hide, skill button rendering, confirm/skip button binding, and galaxy sub-phase event listeners (GALAXY_SUBPHASE_START, GALAXY_ACTION_PROMPT, GALAXY_SUBPHASE_END). Delegates galaxy state mutations to BattleSessionController.

### GameOverController
Owns `#gameover-panel` show/hide, winner text, rematch button, lobby button, and `opponentReadyForRematch` state. Coordinates via callbacks for route changes, config screen, and network state reset.

## Files Changed

| File | Change |
|---|---|
| `ui/battle/GalaxyOverlayController.js` | NEW — ~110 lines |
| `ui/battle/GameOverController.js` | NEW — ~120 lines |
| `main.js` | Removed ~170 lines (galaxy functions, gameover functions, button bindings), added ~45 lines (imports + init calls) |
| `tests/architecture/galaxy-gameover-split.spec.js` | NEW — 22 tests |
| `tests/e2e/gameover.spec.js` | NEW — 4 tests |
| `tests/e2e/galaxy-overlay.spec.js` | NEW — 3 tests |

## Callback Boundaries

### GalaxyOverlayController
```
ctx: { battleSession, getEngine, getNetworkManager, callbacks: { renderAll, setSubmitStatus } }
```
- Calls `battleSession.startGalaxySubphase/data.charIds)`, `battleSession.promptGalaxyAction()`, `battleSession.endGalaxySubphase()`
- Calls `battleSession.selectGalaxySkill()`, `battleSession.prepareGalaxyTargeting()`, `battleSession.submitGalaxyTarget()`, `battleSession.skipGalaxyAction()`

### GameOverController
```
ctx: { battleSession, getNetworkManager, isPveMode, startLobbyUi, callbacks: { setRoute, showConfigScreen, startBattleFromConfigs, resetNetworkState, getBattlePlayerConfigs } }
```
Returns: `{ show, hide, updateRematchButton, setOpponentReadyForRematch }`

## Architecture — What main.js No Longer Contains

- `function showGalaxyPanel` — removed
- `function hideGalaxyPanel` — removed
- `btn-galaxy-confirm` addEventListener — removed
- `btn-galaxy-skip` addEventListener — removed
- `function showGameOver` — removed
- `function updateRematchButton` — removed
- `btn-rematch` addEventListener — removed
- `btn-lobby` addEventListener — removed
- Direct `document.getElementById('gameover-panel')` manipulation — removed (now via gameOverController)
- Direct `document.getElementById('galaxy-overlay')` manipulation — removed (now via GalaxyOverlayController)
- `opponentReadyForRematch` variable — moved into GameOverController

## Test Results

| Suite | Count | Status |
|---|---|---|
| Architecture (galaxy-gameover-split) | 22/22 | pass |
| E2E (gameover) | 4/4 | pass |
| E2E (galaxy-overlay) | 3/3 | pass |
| All existing suites | 191/191 | pass |
| **Total** | **220/220** | **pass** |
