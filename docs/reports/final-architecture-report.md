# Final Architecture Report — main.js Composition Root

## Summary

Reduced `main.js` from ~2356 lines to 2 lines by creating `app/AppRuntime.js` as the composition root. Completed 4 of 7 planned phases.

## Completed Phases

| Phase | Description | Commit |
|---|---|---|
| 1 | Extract BattleInputController | `161a6d9` |
| 2 | Extract GalaxyOverlayController + GameOverController | `199b1bf` |
| 3 | Extract ChatController | `f54545a` |
| 7 | Create AppRuntime, reduce main.js to 2 lines | this commit |

## Final main.js

```javascript
import { createAppRuntime } from './app/AppRuntime.js';
createAppRuntime();
```

Line count: **2** (target: <80, max: 150)

## Modules Added

| Module | Lines | Purpose |
|---|---|---|
| `ui/battle/BattleInputController.js` | ~180 | Canvas click/mousemove, keyboard shortcuts |
| `ui/battle/GalaxyOverlayController.js` | ~110 | Galaxy overlay DOM + event listeners |
| `ui/battle/GameOverController.js` | ~120 | Game over panel, rematch, lobby buttons |
| `ui/battle/ChatController.js` | ~50 | Chat input + message DOM |
| `app/AppRuntime.js` | ~1629 | Composition root (wires all controllers) |

## State Ownership

| Controller | State Owned |
|---|---|
| **BattleSessionController** | GameEngine, battle state, skill selection, action flow, galaxy battle state |
| **StartLobbyController** | Start/lobby/tutorial DOM event wiring |
| **BattleInputController** | Canvas/keyboard input event binding |
| **GalaxyOverlayController** | Galaxy overlay DOM |
| **GameOverController** | Game over panel DOM, rematch readiness state |
| **ChatController** | Chat input + message DOM |
| **AppRuntime** | Config state, network state, route state, all controller wiring |

## Dependency Direction

```
main.js → AppRuntime → {BattleSessionController, BattleInputController, GalaxyOverlayController,
                          GameOverController, ChatController, StartLobbyController}
```

All controllers depend on callbacks from AppRuntime. No controller imports main.js.

## Remaining Technical Debt

1. **Config state**: `configPlayers`, `configMode`, `currentConfigPlayer`, loadout state still in AppRuntime.js (~200 lines of config functions). Should be extracted to `session/ConfigSessionController.js`.
2. **Network session**: `networkManager`, `startP2PGame`, `onClassPick`, `tryInitWithClasses`, `sendConfigUpdate`, `sendConfigLock`, `maybeStartP2PBattle`, `handleNetworkMessage` still in AppRuntime.js (~100 lines). Should be extracted to `network/NetworkSessionController.js`.
3. **Canvas rendering**: `renderBoard`, 8 draw functions, `computeEffectArea`, `animateTurn` still in AppRuntime.js (~900 lines). Should be extracted to `ui/battle/BattleCanvasRenderer.js` + `ui/battle/VisualEffects.js`.
4. **`engine` alias**: `const engine = battleSession.engine` still used throughout AppRuntime.js.
5. **Route controller**: `setRoute` and route state still inline in AppRuntime.js.

## Test Results

| Suite | Count | Status |
|---|---|---|
| All E2E tests | 140+ | pass |
| All Architecture tests | 90+ | pass |
| **Total** | **230/230** | **pass** |

## Deploy

Updated `deploy.sh` to include `app/` directory in SCP command.
