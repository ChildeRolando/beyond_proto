# Task: TDD architecture completion — split remaining main.js responsibilities

Repository:

ChildeRolando/beyond_proto

Current state:
- index.html 已拆分；
- CSS 已拆分；
- ConfigScreenView 已拆分；
- BattlePanelsView 已拆分；
- StartLobbyController 已拆分；
- BattleSessionController 已拆分并完成 ownership cleanup；
- main.js 仍然保留大量职责：
  - config state/controller
  - network/P2P session
  - galaxy overlay DOM
  - game over/rematch/lobby DOM
  - battle input handlers
  - canvas rendering
  - visual effects
  - chat glue
  - route glue
  - temporary engine alias

本轮目标：
一口气完成剩余架构拆分，使 main.js 成为真正的 composition root。

最终目标：
main.js 只负责：
- import modules
- create controllers/renderers
- wire dependencies
- call init
- expose minimal debug hooks if needed

main.js 不再负责：
- battle input
- canvas rendering
- visual effects drawing
- network message routing
- config business state
- game over DOM
- galaxy DOM
- chat DOM
- route DOM implementation
- direct engine usage

============================================================
0. Global execution rule
============================================================

This is a TDD refactor.

For every phase:
1. Add or strengthen behavior tests first.
2. Add or strengthen architecture tests first.
3. Confirm new architecture tests fail before implementation when they target existing debt.
4. Implement the phase.
5. Run phase tests.
6. Run full e2e.
7. Update report.
8. Commit.
9. Continue to next phase only if tests are green.

Do not stop after the first successful phase unless tests fail.
Do not skip tests.
Do not silently catch errors.
Do not delete features to pass tests.
Do not change game rules.
Do not change skill/role data.
Do not change CSS/visual style unless absolutely required by extraction.

Large diff is acceptable.
Breaking internal structure is acceptable during implementation.
Final state must pass tests and have clean responsibility boundaries.

============================================================
1. Target architecture
============================================================

Create or complete this structure:

app/
  AppRuntime.js
  RouteController.js

session/
  ConfigSessionController.js
  BattleSessionController.js

network/
  NetworkSessionController.js
  NetworkMessageRouter.js

ui/
  start/
    StartLobbyController.js

  config/
    ConfigScreenView.js

  battle/
    BattlePanelsView.js
    BattleInputController.js
    BattleCanvasRenderer.js
    VisualEffects.js
    GalaxyOverlayController.js
    GameOverController.js
    ChatController.js

utils/
  dom.js

tests/
  e2e/
    input-controller.spec.js
    canvas-renderer.spec.js
    galaxy-overlay.spec.js
    gameover.spec.js
    network-session.spec.js
    config-session.spec.js
    app-runtime.spec.js

  architecture/
    input-controller-split.spec.js
    canvas-renderer-split.spec.js
    galaxy-gameover-split.spec.js
    network-session-split.spec.js
    config-session-split.spec.js
    main-composition-root.spec.js

docs/reports/
  refactor-battle-input-controller.md
  refactor-battle-canvas-renderer.md
  refactor-galaxy-gameover-controller.md
  refactor-network-session-controller.md
  refactor-config-session-controller.md
  refactor-app-runtime.md
  final-architecture-report.md

============================================================
2. Global allowed files
============================================================

Allowed to modify:

- main.js
- app/**
- session/**
- network/**
- ui/**
- utils/**
- tests/**
- docs/reports/**
- package.json only if test scripts need adjustment
- playwright.config.js only if test config needs adjustment

Avoid modifying unless absolutely necessary:

- engine/**
- styles/**
- index.html
- assets/**
- engine/SkillData.js
- engine/RoleData.js
- engine/NetworkManager.js

If engine/**, styles/**, index.html, or data files are modified, explain exactly why in final report.

============================================================
3. Global test commands
============================================================

Before starting:
- npm run test:e2e
- npm test

After each phase:
- npm run test:e2e -- relevant phase spec
- npm run test:e2e -- relevant architecture spec
- npm run test:e2e
- npm test

If npm test is not the engine/unit command, use the existing project command and document it.

Every e2e spec must guard:
- pageerror => fail
- console error => fail
- local .css/.js/.webp/.png/.svg/.json resource status >= 400 => fail

Do not let unreachable external P2P signaling fail local tests.
Mock or avoid real external signaling where needed.

============================================================
PHASE 1 — Extract BattleInputController
============================================================

Goal:
Move all battle input handling out of main.js.

Create:

ui/battle/BattleInputController.js

It owns:
- canvas click
- canvas mousemove
- keyboard shortcuts
- Escape clear selection
- Space execute
- digit skill hotkeys
- character selection cycling
- target click handling
- galaxy target click bridge
- input-to-session method calls

It does NOT own:
- GameEngine
- canvas drawing
- battle state
- battle rules
- DOM panels rendering
- network

Public API:

export function initBattleInputController(ctx) { ... }

ctx:

{
  canvas,
  battleSession,
  getNetworkManager,
  isPveMode,
  getEngine,
  getSkillData,
  geometry: {
    pixelToHex,
    isOnBoard,
    hexDistance,
    hexLine,
    hexSpiral,
    getSectorHexes,
  },
  selectors: {
    getCharacterAtHex,
    getCharactersAtHex,
  },
  callbacks: {
    renderAll,
    executeButtonClick,
    setSubmitStatus,
  }
}

main.js after phase:
- must not contain canvas.addEventListener('click'
- must not contain canvas.addEventListener('mousemove'
- must not contain document.addEventListener('keydown'
- must call initBattleInputController(...)

Behavior tests:

tests/e2e/input-controller.spec.js

Test I1: canvas click selects character
- enter local battle
- click known character location or several candidate positions
- assert selected drawer or action dock changes
- no console error

Test I2: skill select and invalid target cancel
- enter battle
- click skill
- click invalid/far hex
- assert action dock remains valid
- no console error

Test I3: Escape clears selection
- enter battle
- click skill
- press Escape
- assert no selected skill button remains OR target hint resets
- no console error

Test I4: digit hotkey selects usable skill
- enter battle
- press Digit1
- assert no char.skills undefined error
- assert dock remains valid
- if skill is selected, target hint visible
- no console error

Test I5: Space executes only when valid
- enter battle
- press Space
- no console error
- dock/canvas still valid

Architecture tests:

tests/architecture/input-controller-split.spec.js

main.js must:
- import initBattleInputController
- call initBattleInputController(

main.js must NOT contain:
- canvas.addEventListener('click'
- canvas.addEventListener('mousemove'
- document.addEventListener('keydown'
- char.skills.filter in keyboard handler

BattleInputController.js must:
- export initBattleInputController
- not import main.js
- not import GameEngine
- not new GameEngine
- not call engine.executeTurn
- not call engine.submitAction

Commit:

refactor: extract battle input controller

Report:

docs/reports/refactor-battle-input-controller.md

============================================================
PHASE 2 — Extract GalaxyOverlayController and GameOverController
============================================================

Goal:
Move galaxy overlay DOM and game over/rematch/lobby DOM out of main.js.

Create:

ui/battle/GalaxyOverlayController.js
ui/battle/GameOverController.js

GalaxyOverlayController owns:
- GALAXY_SUBPHASE_START listener binding bridge
- GALAXY_ACTION_PROMPT DOM
- GALAXY_SUBPHASE_END DOM
- #galaxy-overlay show/hide
- #galaxy-skills rendering
- #btn-galaxy-confirm
- #btn-galaxy-skip
- galaxy target mode UI prompt

It calls BattleSessionController methods:
- startGalaxySubphase
- promptGalaxyAction
- endGalaxySubphase
- selectGalaxySkill
- prepareGalaxyTargeting
- submitGalaxyTarget
- skipGalaxyAction

It does NOT mutate battleSession fields directly.

GameOverController owns:
- showGameOver panel
- hide game over panel
- rematch button
- lobby button
- updateRematchButton
- return-to-start DOM part
- rematch class select DOM
- gameover winner text

BattleSessionController still owns battle state reset.
StartLobbyController still owns start/lobby room UI reset.
GameOverController coordinates via callbacks.

Public API:

export function initGalaxyOverlayController(ctx) { ... }

ctx:
{
  battleSession,
  getEngine,
  getNetworkManager,
  skills,
  skillsByClass,
  geometry,
  callbacks: {
    renderAll,
    setSubmitStatus,
  }
}

export function initGameOverController(ctx) { ... }

ctx:
{
  battleSession,
  getNetworkManager,
  isPveMode,
  startLobbyUi,
  callbacks: {
    setRoute,
    showConfigScreen,
    startBattleFromConfigs,
    resetNetworkState,
  }
}

main.js after phase:
- must not define showGalaxyPanel
- must not define hideGalaxyPanel
- must not bind btn-galaxy-confirm
- must not bind btn-galaxy-skip
- must not define showGameOver
- must not define updateRematchButton
- must not bind btn-rematch
- must not bind btn-lobby
- must not directly manipulate #gameover-panel
- must not directly manipulate #galaxy-overlay

Behavior tests:

tests/e2e/galaxy-overlay.spec.js
- If galaxy can be triggered deterministically, test real flow.
- If not, expose a test-only debug hook under window.__testHooks only in test mode:
  window.__testHooks.triggerGalaxyPrompt()
- Assert overlay opens, skill buttons render, confirm/skip work, no console error.
- Do not change production behavior.

tests/e2e/gameover.spec.js
- enter battle
- force gameover panel through debug hook or simulated BATTLE_END event
- assert gameover panel visible
- click lobby
- assert start-screen visible
- no ReferenceError
- force gameover again
- click rematch
- assert config screen visible
- no console error

Architecture tests:

tests/architecture/galaxy-gameover-split.spec.js

main.js must import and call:
- initGalaxyOverlayController
- initGameOverController

main.js must NOT contain:
- function showGalaxyPanel
- function hideGalaxyPanel
- btn-galaxy-confirm addEventListener
- btn-galaxy-skip addEventListener
- function showGameOver
- function updateRematchButton
- btn-rematch addEventListener
- btn-lobby addEventListener
- document.getElementById('gameover-panel')
- document.getElementById('galaxy-overlay')

Exception:
main.js may pass DOM callbacks only through controller initialization, but direct manipulation should be gone.

Commit:

refactor: extract galaxy and game over controllers

Reports:
- docs/reports/refactor-galaxy-gameover-controller.md

============================================================
PHASE 3 — Extract ChatController
============================================================

Goal:
Move chat DOM and message append logic out of main.js.

Create:

ui/battle/ChatController.js

Owns:
- #chat-input keydown
- appendChatMessage
- chat message DOM rendering
- sending CHAT payload via callback
- receiving opponent chat display via public method

Public API:

export function initChatController(ctx) {
  return {
    appendMessage(sender, text),
    clear()
  }
}

ctx:
{
  callbacks: {
    sendChat(text)
  }
}

main.js:
- creates chatController
- NetworkMessageRouter or handleNetworkMessage calls chatController.appendMessage('对手', text)
- no longer directly binds chat-input
- no longer defines appendChatMessage

Behavior tests:

tests/e2e/chat-controller.spec.js

Test C1:
- enter local battle
- type into #chat-input
- press Enter
- assert message appears as 我
- no console error

Test C2:
- simulate incoming CHAT via test hook or message router
- assert 对手 message appears

Architecture tests:

tests/architecture/chat-controller-split.spec.js

main.js must:
- import initChatController
- call initChatController

main.js must NOT contain:
- chat-input addEventListener
- function appendChatMessage

Commit:

refactor: extract chat controller

Report:
docs/reports/refactor-chat-controller.md

============================================================
PHASE 4 — Extract NetworkSessionController and NetworkMessageRouter
============================================================

Goal:
Move P2P/network session orchestration out of main.js.

Create:

network/NetworkSessionController.js
network/NetworkMessageRouter.js

NetworkSessionController owns:
- networkManager variable
- create room flow
- join room flow
- disconnect flow
- startP2PGame
- onClassPick
- tryInitWithClasses
- rematch P2P coordination:
  - remoteClassPick
  - battleSeed
  - pendingMyClass
  - pendingRemoteRematchClass
  - opponentReadyForRematch
- sendConfigUpdate
- sendConfigLock
- maybeStartP2PBattle
- showDisconnect trigger via callback

NetworkMessageRouter owns:
- handling payload.type:
  - CHAT
  - CONFIG_UPDATE
  - CONFIG_LOCK
  - BATTLE_START
- dispatching to:
  - ConfigSessionController or temporary config adapter
  - BattleSessionController
  - ChatController
  - NetworkSessionController

Important:
NetworkSessionController may import NetworkManager.
main.js should no longer import NetworkManager directly after this phase.

Public API:

export class NetworkSessionController {
  constructor(ctx)

  getNetworkManager()
  isOnline()
  getMyPlayerId()
  createRoom({ serverAddr, ui })
  joinRoom({ serverAddr, roomCode, ui })
  disconnect()
  startP2PGame(nm)
  sendConfigUpdate(config)
  sendConfigLock(playerId, locked)
  maybeStartP2PBattle()
  handleClassPick(remoteClass, seed)
  resetForReturnToStart()
}

ctx:
{
  battleSession,
  getConfigMode,
  getConfigPlayers,
  normalizePlayerConfig,
  getBattlePlayerConfigs,
  callbacks: {
    showConfigScreen,
    renderConfigScreen,
    startBattleFromConfigs,
    showDisconnect,
    setModeBadge,
    setConnectionIndicator,
    setConfigControlsForP2P,
    chatAppendMessage,
  }
}

NetworkMessageRouter:

export function createNetworkMessageRouter(ctx) {
  return function handleNetworkMessage(payload) { ... }
}

main.js after phase:
- no `let networkManager`
- no import NetworkManager
- no function handleNetworkMessage
- no function startP2PGame
- no function onClassPick
- no function tryInitWithClasses
- no remoteClassPick/battleSeed/pendingMyClass/pendingRemoteRematchClass/opponentReadyForRematch globals
- StartLobbyController callbacks call networkSession.createRoom / joinRoom
- BattleSessionController callbacks getNetworkManager via networkSession.getNetworkManager

Behavior tests:

tests/e2e/network-session.spec.js

Avoid real external WebSocket.

Test N1: P2P lobby invalid join still works
- existing start-lobby test remains green

Test N2: NetworkMessageRouter CONFIG_UPDATE updates config
- use test hook to inject payload:
  window.__testHooks.routeNetworkMessage({ type:'CONFIG_UPDATE', config: ... })
- assert config screen updates

Test N3: NetworkMessageRouter CHAT appends chat
- inject CHAT
- assert chat message appears

Test N4: BATTLE_START starts battle from payload
- enter p2p config state with test hook or inject payload
- assert #app visible

Architecture tests:

tests/architecture/network-session-split.spec.js

main.js must import/call:
- NetworkSessionController
- createNetworkMessageRouter

main.js must NOT:
- import NetworkManager
- declare networkManager
- define handleNetworkMessage
- define startP2PGame
- define onClassPick
- define tryInitWithClasses
- declare remoteClassPick
- declare battleSeed
- declare pendingMyClass
- declare pendingRemoteRematchClass
- declare opponentReadyForRematch
- call new NetworkManager

Commit:

refactor: extract network session controller

Report:
docs/reports/refactor-network-session-controller.md

============================================================
PHASE 5 — Extract ConfigSessionController
============================================================

Goal:
Move config state and config business logic out of main.js.

Create:

session/ConfigSessionController.js

Owns:
- configMode
- currentConfigPlayer
- configLoadoutOpen
- hoverRoleId
- battleConfigs
- configPlayers
- makeDefaultPlayerConfig if appropriate
- cloneConfig if appropriate
- activeConfig
- isConfigEditable
- getOpponentPlayerId
- setActiveClass
- setActiveRole
- shiftRole
- toggleLoadoutSkill
- toggleRoleLoadoutSkill
- removeLoadoutAt
- getBattlePlayerConfigs
- showConfigScreen state part

ConfigScreenView remains pure view.
main.js only wires controller to ConfigScreenView.

Public API:

export class ConfigSessionController {
  constructor(ctx)

  getConfigMode()
  setConfigMode(mode)
  getCurrentPlayer()
  setCurrentPlayer(playerId)
  getConfigPlayers()
  getBattlePlayerConfigs()
  getActiveConfig()
  isConfigEditable(playerId)
  showConfigScreen(mode)
  setActiveClass(className)
  setActiveRole(roleId)
  shiftRole(delta)
  toggleLoadoutSkill(skillId, poolType)
  removeLoadoutAt(index, poolType)
  setPlayerLocked(playerId, locked)
  normalizeAndApplyRemoteConfig(config)
  applyRemoteLock(playerId, locked)
  buildViewContext()
}

ctx:
{
  getNetworkSession,
  callbacks: {
    renderConfigScreen,
    sendConfigUpdate,
    maybeStartP2PBattle,
    setRoute,
    hideGameOver,
    resetBattleForConfig,
  }
}

main.js after phase:
- no configPlayers global
- no currentConfigPlayer global
- no configMode global
- no configLoadoutOpen global
- no hoverRoleId global
- no battleConfigs global
- no function activeConfig
- no function isConfigEditable
- no function setActiveClass
- no function setActiveRole
- no function toggleLoadoutSkill
- no function removeLoadoutAt
- no function getBattlePlayerConfigs
- no function showConfigScreen business logic

Behavior tests:

tests/e2e/config-session.spec.js

Reuse/strengthen existing config-screen tests:
- local config role/class/loadout works
- hover preview works
- click select works
- P1/P2 switch works
- lock/unlock works
- PVE starts from P1 only
- P2P remote config update via router updates view
- no console error

Architecture tests:

tests/architecture/config-session-split.spec.js

main.js must:
- import ConfigSessionController
- instantiate it

main.js must NOT declare:
- configMode
- currentConfigPlayer
- configPlayers
- configLoadoutOpen
- hoverRoleId
- battleConfigs

main.js must NOT define:
- activeConfig
- isConfigEditable
- setActiveClass
- setActiveRole
- shiftRole
- toggleLoadoutSkill
- toggleRoleLoadoutSkill
- removeLoadoutAt
- getBattlePlayerConfigs

Commit:

refactor: extract config session controller

Report:
docs/reports/refactor-config-session-controller.md

============================================================
PHASE 6 — Extract BattleCanvasRenderer and VisualEffects
============================================================

Goal:
Move canvas rendering and visual effect drawing out of main.js.

Create:

ui/battle/BattleCanvasRenderer.js
ui/battle/VisualEffects.js

BattleCanvasRenderer owns:
- resizeCanvas if battle-canvas specific
- renderBoard
- renderAll board part or renderBoard only
- hex drawing
- entity drawing
- projectile drawing
- casing/wild bullet drawing
- submitted indicators
- hover/valid target drawing

VisualEffects owns:
- drawSlashArc
- drawImpactEffect
- drawProjectileTrail
- drawGatherEffect
- drawDashTrail
- drawTeleportEffect
- drawWalkTrail
- drawGrappleLine
- any other draw* animation effect

Input geometry helpers may remain in a shared module if needed:

utils/hexGeometry.js

Move if not already separate:
- hexCenter
- hexCorners
- pixelToHex
- isOnBoard
- hexDistance
- hexLine
- hexSpiral
- getSectorHexes

Public API:

export class BattleCanvasRenderer {
  constructor(ctx)
  resize()
  renderBoard({ animStep = -1, subT = 0 })
}

ctx:
{
  canvas,
  ctx,
  battleSession,
  getEngine,
  geometry,
  visualEffects,
}

main.js after phase:
- no function renderBoard
- no drawSlashArc / drawImpactEffect / drawProjectileTrail / drawGatherEffect / drawDashTrail / drawTeleportEffect / drawWalkTrail / drawGrappleLine
- no direct canvas drawing code
- renderAll calls battleCanvasRenderer.renderBoard(...), renderPanels(), renderLog()

Behavior tests:

tests/e2e/canvas-renderer.spec.js

Test R1:
- enter battle
- canvas visible
- screenshot or pixel smoke: canvas has non-empty painted pixels
- no console error

Test R2:
- select skill
- valid target highlight changes canvas
- no console error

Test R3:
- execute turn if possible
- animation path does not throw
- canvas remains visible

Architecture tests:

tests/architecture/canvas-renderer-split.spec.js

main.js must:
- import BattleCanvasRenderer
- instantiate it
- call battleCanvasRenderer.renderBoard

main.js must NOT contain:
- function renderBoard
- function drawSlashArc
- function drawImpactEffect
- function drawProjectileTrail
- function drawGatherEffect
- function drawDashTrail
- function drawTeleportEffect
- function drawWalkTrail
- function drawGrappleLine
- ctx.arc(
- ctx.fill(
- ctx.stroke(
- ctx.fillText(

Exception:
main.js may use canvas/ctx only to pass them into renderer.

Commit:

refactor: extract battle canvas renderer

Report:
docs/reports/refactor-battle-canvas-renderer.md

============================================================
PHASE 7 — Extract AppRuntime and RouteController
============================================================

Goal:
Make main.js a true composition root.

Create:

app/RouteController.js
app/AppRuntime.js
utils/dom.js

RouteController owns:
- setRoute
- currentRoute
- route DOM visibility:
  - #start-screen
  - #config-screen
  - #app

Public API:

export class RouteController {
  setRoute(route)
  getRoute()
  is(route)
}

AppRuntime owns:
- constructing controllers in correct order
- exposing test hooks
- global init sequence
- dependency wiring

main.js final target:

import { createAppRuntime } from './app/AppRuntime.js';

const app = createAppRuntime();
app.init();

window.__app = app; // optional debug/test hook

Nothing else.

main.js should be ideally < 80 lines.
Hard max: 150 lines.
If longer, report why.

Behavior tests:

tests/e2e/app-runtime.spec.js

Test A1:
- app boots
- start screen visible
- local config works
- battle works
- return start works

Test A2:
- window.__app exists in test mode or debug mode
- exposes safe read-only status

Architecture tests:

tests/architecture/main-composition-root.spec.js

main.js must:
- import createAppRuntime or AppRuntime
- call app.init

main.js must NOT contain:
- document.getElementById
- addEventListener
- function renderAll
- function renderBoard
- function renderConfigScreen
- function setRoute
- new BattleSessionController
- new ConfigSessionController
- new NetworkSessionController
- initStartLobbyController
- initBattleInputController
- initGameOverController
- initGalaxyOverlayController
- initChatController
- renderBattlePanelsView
- canvas.getContext

AppRuntime.js must contain the composition/wiring.

Commit:

refactor: reduce main to app composition root

Report:
docs/reports/refactor-app-runtime.md

============================================================
8. Final architecture report
============================================================

After all phases pass, create:

docs/reports/final-architecture-report.md

Must include:

1. Final module map
2. Dependency direction
3. State ownership table
4. What main.js still does
5. Remaining technical debt
6. Test matrix
7. Manual browser validation
8. Commit list

State ownership table must include:

- ConfigSessionController:
  - configPlayers
  - configMode
  - currentConfigPlayer
  - lock/loadout state

- BattleSessionController:
  - GameEngine
  - selectedSkill/viewingSkill
  - validTargets/hoverEffectArea/hoveredHex
  - battleActive/battleEnded
  - submission sets
  - galaxy battle state

- NetworkSessionController:
  - NetworkManager
  - room/session state
  - rematch network state
  - message routing

- StartLobbyController:
  - start/lobby/tutorial DOM event wiring

- GameOverController:
  - gameover/rematch/lobby DOM

- GalaxyOverlayController:
  - galaxy overlay DOM

- BattleInputController:
  - input event binding

- BattleCanvasRenderer:
  - canvas drawing

- BattlePanelsView:
  - battle HUD DOM rendering

- ConfigScreenView:
  - config DOM rendering

============================================================
9. Final validation
============================================================

Run:

npm run test:e2e
npm test

Required final passing suites:
- smoke
- start-lobby
- config-screen
- config-session
- battle-screen
- battle-session
- battle-panels
- input-controller
- canvas-renderer
- galaxy-overlay
- gameover
- chat-controller
- network-session
- app-runtime
- all architecture tests
- engine/unit tests

Manual browser validation:
- start screen
- tutorial open/close
- local config
- PVE config
- P2P lobby invalid join validation
- local battle
- PVE battle
- skill select
- target submit
- execute turn
- keyboard Digit1/Escape/Space
- battle panels
- canvas animation
- game over panel
- lobby return
- rematch
- chat
- no console errors

============================================================
10. Final commit strategy
============================================================

Commit after each successful phase:

1. refactor: extract battle input controller
2. refactor: extract galaxy and game over controllers
3. refactor: extract chat controller
4. refactor: extract network session controller
5. refactor: extract config session controller
6. refactor: extract battle canvas renderer
7. refactor: reduce main to app composition root
8. docs: add final architecture report

If any phase fails:
- stop
- do not continue to later phases
- report exact failing test and suspected cause

============================================================
11. Final reply format
============================================================

When finished, reply:

Summary:
- Completed phases:
- Failed phase, if any:

Architecture:
- main.js line count:
- modules added:
- state ownership:

Tests:
- npm run test:e2e: pass/fail
- npm test: pass/fail
- architecture tests: pass/fail

Commits:
- <hash> refactor: extract battle input controller
- <hash> refactor: extract galaxy and game over controllers
- <hash> refactor: extract chat controller
- <hash> refactor: extract network session controller
- <hash> refactor: extract config session controller
- <hash> refactor: extract battle canvas renderer
- <hash> refactor: reduce main to app composition root
- <hash> docs: add final architecture report

Known issues:
- ...

Manual validation:
- ...

Do not claim success unless all final tests are green.