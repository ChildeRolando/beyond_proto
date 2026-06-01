# Task: Finish architecture split after AppRuntime checkpoint

Repository:
ChildeRolando/beyond_proto

Current problem:
main.js has been reduced to 2 lines, but app/AppRuntime.js has become the new giant main.js.
This is not final architecture success.

The goal now is not to make main.js smaller.
The goal is to make AppRuntime.js a real composition root.

Final target:
- main.js only starts AppRuntime.
- AppRuntime.js only wires controllers and dependencies.
- AppRuntime.js should ideally be 150–300 lines.
- AppRuntime.js must not own config state, network state, route DOM, canvas rendering, or visual effect drawing.

Do not claim final success until:
- ConfigSessionController exists and owns config state.
- NetworkSessionController exists and owns NetworkManager and P2P state.
- NetworkMessageRouter exists and owns network message dispatch.
- BattleCanvasRenderer exists and owns renderBoard/canvas drawing.
- VisualEffects exists and owns draw* effect functions.
- RouteController exists and owns route state.
- AppRuntime is no longer a God file.

============================================================
Global rules
============================================================

Use TDD.

For every phase:
1. Add/strengthen architecture tests first.
2. Add/strengthen behavior tests where needed.
3. Confirm architecture test fails before implementation if it targets current debt.
4. Implement the split.
5. Run phase tests.
6. Run full E2E.
7. Run unit/engine tests.
8. Update report.
9. Commit.
10. Continue.

If tests fail:
- do not stop;
- reproduce;
- identify cause;
- fix forward;
- rerun;
- continue until green.

Do not:
- delete tests to pass;
- weaken tests to pass;
- remove features to pass;
- silence console errors;
- change engine rules;
- change skill/role data;
- change CSS/visual style unless absolutely necessary.

Allowed files:
- main.js
- app/**
- session/**
- network/**
- ui/**
- utils/**
- tests/**
- docs/reports/**

Avoid modifying:
- engine/**
- styles/**
- index.html
- assets/**

============================================================
Phase 1 — Extract RouteController
============================================================

Create:

app/RouteController.js

Responsibilities:
- currentRoute
- setRoute(route)
- getRoute()
- is(route)
- DOM visibility for:
  - #start-screen
  - #config-screen
  - #app

Public API:

export class RouteController {
  constructor({ dom })
  setRoute(route)
  getRoute()
  is(route)
}

AppRuntime after phase:
- no `let currentRoute`
- no inline `function setRoute`
- no direct route display toggling

Architecture test:
tests/architecture/route-controller-split.spec.js

Assert:
- AppRuntime imports RouteController
- AppRuntime instantiates RouteController
- AppRuntime does not define `function setRoute`
- AppRuntime does not declare `currentRoute`
- AppRuntime does not directly set:
  - start-screen.style.display
  - config-screen.style.display
  - app.style.display

Behavior test:
- start screen visible on boot
- local config switches to config screen
- battle switches to app screen
- return to start switches back

Report:
docs/reports/refactor-route-controller.md

Commit:
refactor: extract route controller

============================================================
Phase 2 — Extract ConfigSessionController
============================================================

Create:

session/ConfigSessionController.js

Responsibilities:
- configMode
- currentConfigPlayer
- configLoadoutOpen
- hoverRoleId
- battleConfigs
- configPlayers
- makeDefaultPlayerConfig
- cloneConfig
- activeConfig
- isConfigEditable
- setActiveClass
- setActiveRole
- shiftRole
- toggleLoadoutSkill
- toggleRoleLoadoutSkill
- removeLoadoutAt
- lock/unlock config
- getBattlePlayerConfigs
- normalize/apply remote config
- apply remote lock
- build ConfigScreenView ctx

Public API:

export class ConfigSessionController {
  constructor(ctx)

  showConfigScreen(mode)
  renderConfigScreen()
  getConfigMode()
  setConfigMode(mode)
  getCurrentConfigPlayer()
  setCurrentConfigPlayer(playerId)
  getConfigPlayers()
  getBattlePlayerConfigs()
  getBattleConfigs()
  setBattleConfigs(players)
  activeConfig()
  isConfigEditable(playerId)
  setActiveClass(className)
  setActiveRole(roleId)
  toggleLoadoutSkill(skillId, poolType)
  removeLoadoutAt(index, poolType)
  toggleLockCurrent()
  canStartBattle()
  applyRemoteConfig(config)
  applyRemoteLock(playerId, locked)
  buildViewContext()
}

ctx should include:
- routeController
- renderConfigScreenView
- getNetworkSession
- battleSession
- callbacks:
  - sendConfigUpdate
  - sendConfigLock
  - maybeStartP2PBattle
  - hideGameOver

AppRuntime after phase:
- no configPlayers
- no configMode
- no currentConfigPlayer
- no configLoadoutOpen
- no hoverRoleId
- no battleConfigs
- no makeDefaultPlayerConfig
- no activeConfig
- no isConfigEditable
- no setActiveClass
- no setActiveRole
- no toggleLoadoutSkill
- no removeLoadoutAt
- no renderConfigScreen implementation
- no direct ConfigScreenView ctx construction

Architecture test:
tests/architecture/config-session-split.spec.js

Behavior tests:
- local config still works
- PVE config still works
- P1/P2 switching works
- class switching works
- role hover preview works
- role click selection works
- loadout add/remove works
- lock/unlock works
- start battle works
- remote CONFIG_UPDATE test hook updates config view
- remote CONFIG_LOCK test hook updates lock state

Report:
docs/reports/refactor-config-session-controller.md

Commit:
refactor: extract config session controller

============================================================
Phase 3 — Extract NetworkSessionController and NetworkMessageRouter
============================================================

Create:

network/NetworkSessionController.js
network/NetworkMessageRouter.js

NetworkSessionController owns:
- networkManager
- createRoom
- joinRoom
- disconnect
- startP2PGame
- onClassPick
- tryInitWithClasses
- sendConfigUpdate
- sendConfigLock
- maybeStartP2PBattle
- P2P rematch state:
  - remoteClassPick
  - battleSeed
  - pendingMyClass
  - pendingRemoteRematchClass
  - opponentReadyForRematch

NetworkMessageRouter owns:
- handleNetworkMessage(payload)

Message routing:
- CHAT → chatController.appendMessage
- CONFIG_UPDATE → configSession.applyRemoteConfig
- CONFIG_LOCK → configSession.applyRemoteLock
- BATTLE_START → configSession.apply battle configs + battleSession.start

Public API:

export class NetworkSessionController {
  constructor(ctx)

  getNetworkManager()
  hasNetwork()
  getMyPlayerId()
  createRoom({ serverAddr, ui })
  joinRoom({ serverAddr, roomCode, ui })
  disconnect()
  startP2PGame(nm)
  sendConfigUpdate()
  sendConfigLock()
  maybeStartP2PBattle()
  resetForReturnToStart()
}

export function createNetworkMessageRouter(ctx) {
  return function handleNetworkMessage(payload) {}
}

AppRuntime after phase:
- no `let networkManager`
- no import NetworkManager
- no `new NetworkManager`
- no startP2PGame
- no onClassPick
- no tryInitWithClasses
- no handleNetworkMessage
- no sendConfigUpdate
- no sendConfigLock
- no maybeStartP2PBattle
- no remoteClassPick
- no battleSeed
- no pendingMyClass
- no pendingRemoteRematchClass

Architecture test:
tests/architecture/network-session-split.spec.js

Behavior tests:
- P2P lobby invalid join validation still works
- create/join button does not throw when server unavailable
- injected CHAT payload updates chat
- injected CONFIG_UPDATE updates config
- injected CONFIG_LOCK updates config lock
- injected BATTLE_START enters battle

Use deterministic test hooks. Do not depend on real external WebSocket availability.

Report:
docs/reports/refactor-network-session-controller.md

Commit:
refactor: extract network session controller

============================================================
Phase 4 — Extract BattleCanvasRenderer and VisualEffects
============================================================

Create:

ui/battle/BattleCanvasRenderer.js
ui/battle/VisualEffects.js

Move from AppRuntime:
- renderBoard
- all ctx drawing
- drawSlashArc
- drawImpactEffect
- drawProjectileTrail
- drawGatherEffect
- drawDashTrail
- drawTeleportEffect
- drawWalkTrail
- drawGrappleLine
- canvas board rendering

BattleCanvasRenderer API:

export class BattleCanvasRenderer {
  constructor(ctx)
  resize()
  renderBoard(animStep = -1, subT = 0)
}

ctx:
{
  canvas,
  context,
  battleSession,
  geometry,
  visualEffects,
  getEngine
}

VisualEffects API:

export function createVisualEffects(ctx) {
  return {
    drawSlashArc,
    drawImpactEffect,
    drawProjectileTrail,
    drawGatherEffect,
    drawDashTrail,
    drawTeleportEffect,
    drawWalkTrail,
    drawGrappleLine,
  };
}

AppRuntime after phase:
- no renderBoard
- no drawSlashArc
- no drawImpactEffect
- no drawProjectileTrail
- no drawGatherEffect
- no drawDashTrail
- no drawTeleportEffect
- no drawWalkTrail
- no drawGrappleLine
- no direct ctx.arc/fill/stroke/fillText
- no large canvas drawing loop

AppRuntime may still have:
- renderAll() as orchestration:
  battleCanvasRenderer.renderBoard(...)
  renderPanels()
  renderLog()
  update turn/phase text

Architecture test:
tests/architecture/canvas-renderer-split.spec.js

Behavior tests:
- battle canvas visible
- canvas has non-empty painted pixels
- skill select changes target highlight or at least does not blank canvas
- execute turn animation does not throw
- battle panels still render after canvas extraction

Report:
docs/reports/refactor-battle-canvas-renderer.md

Commit:
refactor: extract battle canvas renderer

============================================================
Phase 5 — AppRuntime cleanup and final enforcement
============================================================

Goal:
AppRuntime becomes a real composition root.

Create/update:

tests/architecture/app-runtime-composition.spec.js

Final AppRuntime should:
- create DOM refs
- create RouteController
- create BattleSessionController
- create ConfigSessionController
- create NetworkSessionController
- create ChatController
- create GameOverController
- create GalaxyOverlayController
- create BattleInputController
- create BattleCanvasRenderer
- wire callbacks
- expose test hooks
- call initial route setup

AppRuntime should not:
- own config state
- own network state
- own route state
- implement canvas rendering
- implement config business logic
- implement network message routing
- directly new NetworkManager
- directly call ctx drawing APIs

Architecture assertions:
- AppRuntime line count should be <= 350 preferred, <= 500 hard max.
- AppRuntime must not contain:
  - `let configPlayers`
  - `let configMode`
  - `let networkManager`
  - `function renderBoard`
  - `function setRoute`
  - `function handleNetworkMessage`
  - `new NetworkManager`
  - `ctx.arc(`
  - `ctx.fill(`
  - `ctx.stroke(`
  - `renderConfigScreenView({`

Final report:
docs/reports/final-architecture-report.md

Must include:
- final module map
- state ownership table
- dependency direction
- AppRuntime line count
- main.js line count
- all test results
- remaining technical debt

Commit:
refactor: finalize app runtime composition root

============================================================
Final validation
============================================================

Run:

npm run test:e2e
npm test

Manual browser validation:
- start screen
- tutorial
- local config
- PVE config
- P2P lobby invalid join
- role hover/click
- loadout edit
- lock/start battle
- battle panels
- canvas render
- skill select
- target submit
- execute turn
- Digit1 / Escape / Space
- chat
- game over
- rematch
- lobby return
- no console errors

Final success means:
- all tests green
- main.js remains tiny
- AppRuntime is not a God file
- Config, Network, Canvas are genuinely extracted