# StartLobbyController Complete Extraction Report

## Summary

Completed the start lobby controller extraction — start screen, P2P lobby, and tutorial modal UI event bindings and DOM helpers have been moved from `main.js` into `ui/start/StartLobbyController.js`. The module exposes `initStartLobbyController(ctx)` which returns a UI API object `{ hideRoomSetup, resetConnectionUI }` for use by `main.js`.

## Files Changed

| File | Before | After | Delta |
|---|---|---|---|
| `main.js` | ~2473 lines | ~2356 lines | -117 |
| `ui/start/StartLobbyController.js` | — | 130 lines | +130 |
| `tests/e2e/start-lobby.spec.js` | — | NEW (8 tests) | +127 |
| `tests/architecture/start-lobby-split.spec.js` | — | NEW (17 tests) | +44 |

## StartLobbyController.js Exports

**Public API:**
- `initStartLobbyController(ctx)` — binds all start/lobby/tutorial events, returns `{ hideRoomSetup, resetConnectionUI }`

**Private helpers:**
- `showTutorial()` / `hideTutorial()` — tutorial overlay toggle
- `showRoomSetup()` / `hideRoomSetup()` — P2P room setup panel
- `showRoomCode(code)` — display generated room code
- `setRoomError(text)` — room validation error display
- `updateHostStatus(status, text)` — host connection status dot + text
- `updateJoinStatus(status, text)` — joiner connection status dot + text
- `resetConnectionUI(defaultAddr)` — reset all connection UI to defaults

**Button bindings (9 total):**
- `btn-local` → `ctx.callbacks.onStartLocal()`
- `btn-pve` → `ctx.callbacks.onStartPve()`
- `btn-tutorial`, `tutorial-close`, `tutorial-overlay`, `btn-help-top` → tutorial show/hide
- `btn-p2p` → show room setup + reset UI
- `btn-back-start` → hide room setup + reset UI + `ctx.callbacks.onBackStart()`
- `btn-create-room` → validate, connect, `ctx.callbacks.onCreateRoom({ serverAddr, ui })`
- `btn-join-room` → validate code, connect, `ctx.callbacks.onJoinRoom({ roomCode, serverAddr, ui })`

## ctx Structure

```js
ctx = {
  defaultAddr,  // server address for P2P connections
  callbacks: {
    onStartLocal,   // () => enter local config
    onStartPve,     // () => enter PVE config
    onBackStart,    // () => return to start from room setup
    onCreateRoom,   // ({ serverAddr, ui }) => create P2P room
    onJoinRoom,     // ({ roomCode, serverAddr, ui }) => join P2P room
  },
}
```

The `ui` object passed to `onCreateRoom`/`onJoinRoom` callbacks provides:
```js
ui = {
  showRoomCode, setRoomError,
  updateHostStatus, updateJoinStatus,
  hideRoomSetup,
  resetConnectionUI,
}
```

## Functions Removed from main.js

- `showTutorial` / `hideTutorial` (migrated to StartLobbyController)
- `showRoomSetup` / `hideRoomSetup` (migrated)
- `showRoomCode` / `setRoomError` (migrated)
- `updateHostStatus` / `updateJoinStatus` / `resetConnectionUI` (migrated)
- All 9 `addEventListener` bindings for start/lobby/tutorial buttons (migrated)
- Static listener for `tutorial-overlay` background click (migrated)

## Callbacks Added to main.js

- `onBackStart` — calls `hideRoomSetup()` + `resetConnectionUI(defaultAddr)` then `setRoute('start')`
- `onCreateRoom({ serverAddr, ui })` — creates NetworkManager, connects, wires up P2P flow
- `onJoinRoom({ roomCode, serverAddr, ui })` — creates NetworkManager, joins room, wires up P2P flow
- `onStartLocal()` — sets configMode, enters config screen
- `onStartPve()` — sets configMode, enters config screen

## Return Value Pattern

`initStartLobbyController()` returns:
```js
{
  hideRoomSetup,
  resetConnectionUI: () => resetConnectionUI(ctx.defaultAddr),
}
```

This allows `main.js` to call `startLobbyUi.hideRoomSetup()` and `startLobbyUi.resetConnectionUI()` from:
- `btn-config-back` click handler (return to start from config)
- `window.returnToStart()` (disconnect/return to start)

## Regression Fix (2026-05-30)

**Symptom:** Clicking `#btn-config-back` or calling `window.returnToStart()` after disconnect threw `ReferenceError: resetConnectionUI is not defined`.

**Root cause:** `resetConnectionUI` was a private function inside `StartLobbyController.js` and not exported. Two call sites in `main.js` still called bare `resetConnectionUI()`:
1. `btn-config-back` click handler — already fixed in initial extraction
2. `window.returnToStart()` — **missed in initial extraction** (line 654)

**Fix:**
1. Changed `window.returnToStart()` line 654: `resetConnectionUI()` → `startLobbyUi.resetConnectionUI()`
2. Added architecture test: "main.js does NOT call bare resetConnectionUI()" using negative lookbehind `/(?<!startLobbyUi\.)resetConnectionUI\s*\(/`

## Test Results

- Start lobby E2E: 8/8 pass ✓ (includes A8: config back returns to start)
- Architecture (start-lobby-split): 17/17 pass ✓ (includes bare call check)
- Architecture (main-split): 9/9 pass ✓
- Battle panels E2E: 6/6 pass ✓
- Config screen E2E: 9/9 pass ✓
- Battle screen E2E: 5/5 pass ✓
- Smoke E2E: 3/3 pass ✓
- Full E2E suite: 31/31 pass ✓
- Engine tests: all pass ✓

## Known Issues

None. All tests pass.

## Future Work

- Extract canvas rendering (`renderBoard`) into `ui/battle/CanvasRenderer.js`
- Extract `renderLog` to BattlePanelsView
- Extract network handling from main.js
- Remove remaining direct `engine` references from view layer
