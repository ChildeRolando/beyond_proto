
# Strong-agent architecture recovery prompt

Repository: `ChildeRolando/beyond_proto`

You are taking over a partially successful but architecturally incomplete refactor.

This file is the source of truth for the next refactor pass. Do not treat previous reports saying "tests pass" as sufficient. The current problem is not only functional correctness; it is architecture ownership.

---

## 1. Background and current situation

The project began as a single large `index.html` / `main.js` style vanilla JS game demo.

Already completed and mostly accepted:

- `index.html` split into external JS/CSS.
- `ConfigScreenView.js` extracted as config-page view rendering.
- `BattlePanelsView.js` extracted as battle HUD/panel rendering.
- `StartLobbyController.js` extracted for start/lobby/tutorial UI.
- `BattleSessionController.js` extracted for battle state, GameEngine ownership, action submission, turn execution, PVE/P2P battle flow, and skill selection.
- `RouteController.js` extracted and accepted.
- `BattleInputController.js`, `GalaxyOverlayController.js`, `GameOverController.js`, and `ChatController.js` appear to exist.
- `main.js` has been reduced to 2 lines:

```js
import { createAppRuntime } from './app/AppRuntime.js';
createAppRuntime();
````

However, this is not a successful final architecture.

The current failure is that `app/AppRuntime.js` became the new God file. It still contains a large amount of code and responsibilities that were supposed to be split out.

Known current state:

* `AppRuntime.js` is still approximately 1600+ lines.
* `AppRuntime.js` still imports `NetworkManager` directly.
* `AppRuntime.js` still owns config state and config business logic.
* `AppRuntime.js` still owns network/P2P state and network flow.
* `AppRuntime.js` still owns canvas rendering and visual effects.
* `ConfigSessionController.js` exists but is not wired into `AppRuntime.js`.
* `NetworkSessionController.js` exists but is not wired into `AppRuntime.js`.
* `NetworkMessageRouter.js` exists but is not wired into `AppRuntime.js`.
* Existing architecture tests were weakened with comments such as "AppRuntime wiring checks deferred". That is not acceptable.
* `NetworkMessageRouter.js` currently appears to call `configSession.normalizeForPlayer(...)`, but `ConfigSessionController` does not provide that method. This is a likely runtime bug once router wiring is enabled.

The previous agent made a common mistake: it created standalone module files and reported progress, but did not actually remove ownership from `AppRuntime.js`.

From now on, file existence does not count as architectural completion.

A phase is complete only when:

1. the new module exists,
2. `AppRuntime.js` actually uses it,
3. `AppRuntime.js` no longer owns that responsibility,
4. architecture tests enforce that loss of responsibility,
5. behavior tests still pass.

---

## 2. Final architecture target

Final high-level structure:

```text
main.js
  -> only starts AppRuntime

app/
  AppRuntime.js
  RouteController.js

session/
  BattleSessionController.js
  ConfigSessionController.js

network/
  NetworkSessionController.js
  NetworkMessageRouter.js

ui/start/
  StartLobbyController.js

ui/config/
  ConfigScreenView.js

ui/battle/
  BattlePanelsView.js
  BattleInputController.js
  BattleCanvasRenderer.js
  VisualEffects.js
  GalaxyOverlayController.js
  GameOverController.js
  ChatController.js
```

### Responsibility ownership

`main.js`:

* Only imports and starts AppRuntime.
* No DOM, no business logic, no engine, no network, no canvas.

`AppRuntime.js`:

* Composition root only.
* Creates controllers/renderers.
* Wires callbacks/providers between controllers.
* Exposes deterministic test hooks.
* Calls initial boot/setup.
* Preferred size: 150–300 lines.
* Hard maximum after this recovery pass: 500 lines.

`RouteController.js`:

* Owns top-level route state.
* Owns visibility of `#start-screen`, `#config-screen`, `#app`.

`ConfigSessionController.js`:

* Owns all config state and config business logic:

  * `configMode`
  * `currentConfigPlayer`
  * `configLoadoutOpen`
  * `hoverRoleId`
  * `battleConfigs`
  * `configPlayers`
  * config mutation functions
  * config lock/unlock
  * local/PVE/P2P config preparation
  * remote config application
  * config view context construction

`NetworkSessionController.js`:

* Owns all network/P2P session state and flow:

  * `networkManager`
  * `remoteClassPick`
  * `battleSeed`
  * `pendingMyClass`
  * `pendingRemoteRematchClass`
  * room creation/joining/disconnect
  * `startP2PGame`
  * P2P rematch coordination
  * config sync senders
  * `maybeStartP2PBattle`

`NetworkMessageRouter.js`:

* Owns routing of incoming network payloads:

  * `CHAT`
  * `CONFIG_UPDATE`
  * `CONFIG_LOCK`
  * `BATTLE_START`

`BattleSessionController.js`:

* Already owns GameEngine and battle flow.
* Do not move GameEngine back into AppRuntime.

`BattleCanvasRenderer.js`:

* Owns board/canvas rendering.
* Owns calls to canvas context drawing APIs, except initialization of canvas/context passed from AppRuntime.

`VisualEffects.js`:

* Owns visual effect drawing helpers.

---

## 3. Non-negotiable rules

Do not solve architecture by moving one God file into another.

Specifically:

* Do not let `AppRuntime.js` remain the new `main.js`.
* Do not create unused controllers just to satisfy file-existence tests.
* Do not weaken architecture tests with "deferred" comments.
* Do not skip failing tests.
* Do not delete tests to pass.
* Do not silence console errors.
* Do not remove features to pass tests.
* Do not change engine rules, skill data, role data, CSS, visual style, or `index.html` unless absolutely necessary.
* Do not make `ConfigSessionController` import `NetworkSessionController`.
* Do not make `NetworkSessionController` import `ConfigSessionController`.
* Resolve Config/Network coupling through providers/callbacks in `AppRuntime.js`.

Allowed:

* Large diffs.
* Internal adapters/facades.
* Temporary test hooks under `window.__testHooks`, as long as they call real controllers and do not duplicate logic.
* Refactoring existing weak tests into strict tests.
* Rewriting incorrect architecture tests.

Failure is not a stop condition. If a test fails, repair forward until green. But do not fake green.

---

## 4. Immediate recovery plan

Do the following phases in order.

Do not start Phase 2 until Phase 1 is truly accepted by architecture tests and behavior tests.

---

# Phase 1 — Real Config + Network coordinated extraction

This is the most urgent phase.

Previous attempts failed because `ConfigSessionController`, `NetworkSessionController`, and `NetworkMessageRouter` were created but not actually wired into `AppRuntime.js`.

## Phase 1 goal

After this phase:

* `AppRuntime.js` imports and instantiates `ConfigSessionController`.
* `AppRuntime.js` imports and instantiates `NetworkSessionController`.
* `AppRuntime.js` imports and creates `NetworkMessageRouter`.
* `AppRuntime.js` no longer owns config state.
* `AppRuntime.js` no longer owns config business logic.
* `AppRuntime.js` no longer owns network state.
* `AppRuntime.js` no longer constructs `NetworkManager`.
* `AppRuntime.js` no longer owns network message routing.

## Required wiring pattern

Use provider/callback wiring to avoid circular imports.

Allowed pattern:

```js
let configSession;
let networkSession;
let handleNetworkMessage;

configSession = new ConfigSessionController({
  routeController,
  battleSession,
  renderConfigScreenView,
  getNetworkSession: () => networkSession,
  getNetworkManager: () => networkSession?.getNetworkManager() || null,
  callbacks: {
    sendConfigUpdate: () => networkSession?.sendConfigUpdate(),
    sendConfigLock: () => networkSession?.sendConfigLock(),
    maybeStartP2PBattle: () => networkSession?.maybeStartP2PBattle(),
    startBattleFromConfigs,
    hideGameOver: () => gameOverController?.hide(),
  },
  roleData: { ... }
});

networkSession = new NetworkSessionController({
  battleSession,
  configSession,
  routeController,
  getChatController: () => chatController,
  callbacks: {
    handleNetworkMessage: (payload) => handleNetworkMessage(payload),
    startBattleFromConfigs,
    showConfigScreen: (mode) => configSession.showConfigScreen(mode),
    renderConfigScreen: () => configSession.renderConfigScreen(),
    showDisconnect,
    animateTurn,
    setModeBadge,
    setConnectionIndicator,
  }
});

handleNetworkMessage = createNetworkMessageRouter({
  networkSession,
  configSession,
  chatController,
  battleSession,
  routeController,
  startBattleFromConfigs,
});
```

This is only illustrative. Equivalent clean wiring is acceptable.

## Fix required bugs while wiring

### Role loadout sync bug

Current `ConfigSessionController.toggleLoadoutSkill(poolType === 'role')` likely returns after `_toggleRoleLoadoutSkill()` without render/sync.

Fix it so role-skill loadout changes also call render + network sync.

### Router missing method bug

`NetworkMessageRouter.js` currently appears to call:

```js
configSession.normalizeForPlayer(...)
```

If that method does not exist, fix it.

Preferred solutions:

* Add a clear `normalizeForPlayer(config, playerId)` method to `ConfigSessionController`; or
* Make router use an existing method such as `applyRemoteConfig` and then use `getBattlePlayerConfigs` / normalized stored configs.

Do not leave a router path that will crash on `BATTLE_START`.

## AppRuntime must lose these symbols

After Phase 1, `app/AppRuntime.js` must not contain:

Config state:

```text
let configMode
let currentConfigPlayer
let configLoadoutOpen
let hoverRoleId
let battleConfigs
let configPlayers
```

Config functions:

```text
function makeDefaultPlayerConfig
function cloneConfig
function activeConfig
function isConfigEditable
function setActiveClass
function setActiveRole
function shiftRole
function toggleLoadoutSkill
function toggleRoleLoadoutSkill
function removeLoadoutAt
function renderConfigScreen
function getBattlePlayerConfigs
renderConfigScreenView({
```

Network state:

```text
let networkManager
let remoteClassPick
let battleSeed
let pendingMyClass
let pendingRemoteRematchClass
let opponentReadyForRematch
```

Network functions:

```text
function startP2PGame
function onClassPick
function tryInitWithClasses
function sendConfigUpdate
function sendConfigLock
function maybeStartP2PBattle
function handleNetworkMessage
```

Network direct usage:

```text
import { NetworkManager }
new NetworkManager
```

## Phase 1 architecture tests

Rewrite or replace the weak existing architecture test.

Create/update:

```text
tests/architecture/config-network-session-split.spec.js
```

It must include all negative checks above.

It must also assert:

* `AppRuntime.js` imports `ConfigSessionController`.
* `AppRuntime.js` instantiates `ConfigSessionController`.
* `AppRuntime.js` imports `NetworkSessionController`.
* `AppRuntime.js` instantiates `NetworkSessionController`.
* `AppRuntime.js` imports `createNetworkMessageRouter`.
* `AppRuntime.js` calls `createNetworkMessageRouter(...)`.
* `ConfigSessionController.js` does not import `AppRuntime` or `NetworkSessionController`.
* `NetworkSessionController.js` does not import `AppRuntime` or `ConfigSessionController`.
* `NetworkMessageRouter.js` does not import `AppRuntime`.

No deferred checks. No comments saying wiring checks are postponed.

## Phase 1 behavior tests

Create/update:

```text
tests/e2e/config-session.spec.js
tests/e2e/network-session.spec.js
```

Config behavior must verify:

1. Local config opens.
2. PVE config opens.
3. P1/P2 switch works.
4. Class switch works.
5. Role hover preview works.
6. Role click selection works.
7. Class loadout add/remove works.
8. Role loadout add/remove works and updates UI.
9. Lock/unlock works.
10. Start battle works.
11. Config back returns to start.
12. No console error.

Network behavior must avoid real external WebSocket dependency.

Use deterministic test hooks if needed:

```js
window.__testHooks.routeNetworkMessage(payload)
window.__testHooks.getConfigSnapshot()
```

Network tests must verify:

1. P2P invalid room code validation still works.
2. Injected `CHAT` payload appends opponent chat.
3. Injected `CONFIG_UPDATE` payload updates remote config.
4. Injected `CONFIG_LOCK` payload updates remote lock state.
5. Injected `BATTLE_START` payload enters battle.
6. Create/join connection failure displays error and does not crash.

## Phase 1 report

Create/update:

```text
docs/reports/refactor-config-network-session.md
```

Report must include:

* Why Config + Network were merged into one coordinated phase.
* How circular dependency was avoided.
* What `ConfigSessionController` now owns.
* What `NetworkSessionController` now owns.
* What `NetworkMessageRouter` now owns.
* What `AppRuntime.js` no longer owns.
* List of removed AppRuntime symbols.
* Behavior test results.
* Architecture test results.
* Remaining AppRuntime responsibilities.

## Phase 1 validation

Run:

```bash
npm run test:e2e -- tests/architecture/config-network-session-split.spec.js
npm run test:e2e -- tests/e2e/config-session.spec.js
npm run test:e2e -- tests/e2e/network-session.spec.js
npm run test:e2e
npm test
```

All must pass.

Commit:

```text
refactor: wire config and network session controllers
```

---

# Phase 2 — Extract BattleCanvasRenderer and VisualEffects

Only start this after Phase 1 is green.

## Phase 2 goal

Move all canvas rendering and visual effect drawing out of `AppRuntime.js`.

Create/use:

```text
ui/battle/BattleCanvasRenderer.js
ui/battle/VisualEffects.js
```

## BattleCanvasRenderer owns

* `renderBoard`
* hex grid drawing
* target/hover highlight drawing
* character drawing
* projectile drawing
* gate/stationary object drawing
* submitted indicators
* any direct canvas board drawing loop

## VisualEffects owns

* `drawSlashArc`
* `drawImpactEffect`
* `drawProjectileTrail`
* `drawGatherEffect`
* `drawDashTrail`
* `drawTeleportEffect`
* `drawWalkTrail`
* `drawGrappleLine`

## API sketch

```js
export class BattleCanvasRenderer {
  constructor(ctx) {}
  resize() {}
  renderBoard(animStep = -1, subT = 0) {}
}
```

`ctx` should include:

```js
{
  canvas,
  context,
  battleSession,
  getEngine,
  geometry,
  visualEffects,
}
```

## AppRuntime must lose these symbols

After Phase 2, `AppRuntime.js` must not contain:

```text
function renderBoard
function drawSlashArc
function drawImpactEffect
function drawProjectileTrail
function drawGatherEffect
function drawDashTrail
function drawTeleportEffect
function drawWalkTrail
function drawGrappleLine
ctx.arc(
ctx.fill(
ctx.stroke(
ctx.fillText(
```

Allowed:

* `AppRuntime.js` may still create `canvas` and `ctx` and pass them to renderer.
* `AppRuntime.js` may keep `renderAll()` as orchestration:

```js
function renderAll(animStep = -1, subT = 0) {
  battleCanvasRenderer.renderBoard(animStep, subT);
  renderPanels();
  renderLog();
  updateTurnPhaseUi();
}
```

## Phase 2 architecture tests

Create/update:

```text
tests/architecture/canvas-renderer-split.spec.js
```

Assert:

* `AppRuntime.js` imports `BattleCanvasRenderer`.
* `AppRuntime.js` instantiates `BattleCanvasRenderer`.
* `AppRuntime.js` calls `battleCanvasRenderer.renderBoard`.
* `AppRuntime.js` does not contain any forbidden drawing symbols listed above.
* `BattleCanvasRenderer.js` exists and exports `BattleCanvasRenderer`.
* `VisualEffects.js` exists and exports required effect functions or a factory.

## Phase 2 behavior tests

Create/update:

```text
tests/e2e/canvas-renderer.spec.js
```

Verify:

1. Enter local battle.
2. Canvas is visible.
3. Canvas has non-empty painted pixels.
4. Skill selection still highlights valid targets or at least does not blank canvas.
5. Execute turn animation does not throw.
6. Battle panels still render after canvas extraction.
7. No console error.

## Phase 2 report

Create/update:

```text
docs/reports/refactor-battle-canvas-renderer.md
```

## Phase 2 validation

Run:

```bash
npm run test:e2e -- tests/architecture/canvas-renderer-split.spec.js
npm run test:e2e -- tests/e2e/canvas-renderer.spec.js
npm run test:e2e
npm test
```

Commit:

```text
refactor: extract battle canvas renderer
```

---

# Phase 3 — AppRuntime final cleanup and enforcement

Only start after Phase 1 and Phase 2 are green.

## Phase 3 goal

Make `AppRuntime.js` a real composition root, not a God file.

After this phase:

* `AppRuntime.js` should ideally be 150–300 lines.
* Hard max: 500 lines.

## Required final architecture test

Create/update:

```text
tests/architecture/app-runtime-composition.spec.js
```

Assert:

* `main.js` remains <= 3 non-empty lines.
* `AppRuntime.js` line count <= 500.
* `AppRuntime.js` imports/creates controllers/renderers.
* `AppRuntime.js` does not contain:

```text
let configPlayers
let configMode
let networkManager
function renderBoard
function setRoute
function handleNetworkMessage
new NetworkManager
ctx.arc(
ctx.fill(
ctx.stroke(
renderConfigScreenView({
```

## Final report

Update:

```text
docs/reports/final-architecture-report.md
```

Must include:

* final module map
* state ownership table
* dependency direction
* `main.js` line count
* `AppRuntime.js` line count
* tests run
* remaining technical debt

## Final validation

Run:

```bash
npm run test:e2e
npm test
```

Manual browser validation:

* start screen
* tutorial
* local config
* PVE config
* P2P invalid join
* role hover/click
* loadout edit
* lock/start battle
* battle panels
* canvas render
* skill select
* target submit
* execute turn
* Digit1 / Escape / Space
* chat
* game over
* rematch
* lobby return
* no console errors

Commit:

```text
refactor: finalize app runtime composition root
```

---

## Final response format

When finished, reply:

```text
Summary:
- Completed phases:
- Final main.js line count:
- Final AppRuntime.js line count:

Architecture:
- Config state owner:
- Network state owner:
- Canvas renderer owner:
- AppRuntime remaining responsibilities:

Tests:
- config-network architecture:
- config e2e:
- network e2e:
- canvas architecture:
- canvas e2e:
- full e2e:
- npm test:

Commits:
- <hash> refactor: wire config and network session controllers
- <hash> refactor: extract battle canvas renderer
- <hash> refactor: finalize app runtime composition root

Known issues:
- ...
```

Do not claim success unless all final tests are green and `AppRuntime.js` is no longer a God file.

```
```
