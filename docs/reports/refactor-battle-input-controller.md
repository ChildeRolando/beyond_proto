# BattleInputController Extraction Report

## Summary

Extracted all battle input handling from `main.js` into `ui/battle/BattleInputController.js`. The controller owns canvas click, canvas mousemove, and keyboard shortcut event binding. main.js no longer directly binds any battle input event listeners.

## Files Changed

| File | Change |
|---|---|
| `ui/battle/BattleInputController.js` | NEW — 180 lines |
| `main.js` | Removed ~200 lines of event handlers, added import + init call (+15 lines) |
| `tests/architecture/input-controller-split.spec.js` | NEW — 13 tests |
| `tests/e2e/input-controller.spec.js` | NEW — 5 tests |

## BattleInputController Public API

```javascript
export function initBattleInputController(ctx)
```

### ctx parameters:
- `canvas` — HTMLCanvasElement for binding click/mousemove
- `battleSession` — BattleSessionController instance (delegates all state mutations)
- `getNetworkManager` — () => NetworkManager | null
- `isPveMode` — () => boolean
- `getEngine` — () => GameEngine (for registry access in hover computation)
- `geometry` — { pixelToHex, isOnBoard, hexDistance, hexLine, hexSpiral, getSectorHexes }
- `selectors` — { getCharacterAtHex, getCharactersAtHex }
- `callbacks` — { renderAll, executeButtonClick, setSubmitStatus, computeEffectArea }

### Owned features:
- Canvas click: character selection/cycling, skill target selection, invalid target cancel, galaxy target click bridge, self-target skill submission
- Canvas mousemove: hex hover tracking, effect area computation (including FAN sector, galaxy hover)
- Keyboard: Digit 1-4 skill hotkeys, Space execute, Escape clear selection

### Does NOT own:
- GameEngine
- Canvas drawing
- Battle state
- DOM panels rendering
- Network

## Architecture — What main.js No Longer Contains

- `canvas.addEventListener('click', ...)` — removed
- `canvas.addEventListener('mousemove', ...)` — removed
- `document.addEventListener('keydown', ...)` — removed
- `char.skills.filter` keyboard pattern — removed

## Test Results

| Suite | Count | Status |
|---|---|---|
| Architecture (input-controller-split) | 13/13 | pass |
| E2E (input-controller) | 5/5 | pass |
| All existing suites | 173/173 | pass |
| **Total** | **191/191** | **pass** |

## Remaining Technical Debt

- `computeEffectArea` and `simulateDash` remain in main.js (needed by canvas renderer and input controller; will move in Phase 6)
- `getCharacterAtHex` / `getCharactersAtHex` remain in main.js (used by both input controller and canvas renderer)
- `renderAll` remains in main.js (will move in Phase 7)
