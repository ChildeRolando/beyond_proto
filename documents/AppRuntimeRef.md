你现在要重构 ChildeRolando/beyond_proto 的 AppRuntime。目标不是临时过测试，而是把 AppRuntime 恢复成纯 composition root。

硬性要求：
1. 不要修改 tests/architecture/app-runtime-composition.spec.js 里的 500 行预算。
2. 不要把逻辑搬到 main.js。main.js 必须继续保持 tiny。
3. 不要为了过测试删除有效断言。
4. 不要改变现有游戏行为。
5. AppRuntime.js 最终 non-empty line count 必须 <= 430，至少要明显低于 500，留出后续 tutorial 模式扩展空间。
6. AppRuntime 只允许做：
   - 创建 controller / renderer / session / service
   - 注入 dependency
   - 连接 callback
   - 初始化 route
   - return runtime object
7. AppRuntime 不允许继续直接拥有以下业务：
   - battle start/reset/execute lifecycle
   - turn animation loop
   - battle panel/log/turn UI rendering details
   - DOM event listener implementation
   - tutorial/help/legacy button behavior implementation
   - test hook implementation
   - skill ripple implementation
   - default server address DOM filling
   - disconnect reason 文案 mapping

当前已知问题：
- app/AppRuntime.js 约 538 行，超过架构预算。
- AppRuntime 里面直接实现了 renderPanels/renderLog/updateTurnUi/renderAll/resizeCanvas/showDisconnect。
- AppRuntime 里面直接实现了 startBattleFromConfigs/startBattleFromScenario/sleep/animateTurn。
- AppRuntime 底部直接绑定 config buttons、execute/reset/start buttons、skill ripple、DOMContentLoaded、resize。
- AppRuntime 里面直接安装 window.__testHooks 和 window.returnToStart。

请按下面方案重构。

============================================================
A. 新增 app/BattleRenderCoordinator.js
============================================================

职责：
- 管理 battle UI rendering 和 battle header/status DOM updates。
- 从 AppRuntime 移走：
  - setText
  - setDisplay
  - hideBattleHeaderControls
  - setBattleHeader
  - setSubmitStatus
  - setExecuteDisabled
  - clearLog
  - renderPanels
  - renderLog
  - updateTurnUi
  - renderAll
  - resizeCanvas
  - showDisconnect
- disconnect reason 文案 mapping 也放这里，不要留在 AppRuntime。

建议接口：

export function createBattleRenderCoordinator({
  getEl,
  getBattleSession,
  getBattleCanvasRenderer,
  renderBattlePanelsView,
}) {
  ...
  return {
    setDisplay,
    setBattleHeader,
    hideBattleHeaderControls,
    setSubmitStatus,
    setExecuteDisabled,
    clearLog,
    renderPanels,
    renderLog,
    updateTurnUi,
    renderAll,
    resizeCanvas,
    showDisconnect,
    setModeBadge,
    setConnectionIndicator,
    isGameOverShown,
  };
}

注意：
- getBattleSession 和 getBattleCanvasRenderer 必须是 getter，避免循环初始化问题。
- renderAll(animStep = -1, subT = 0) 里继续调用 renderer.renderBoard + renderPanels + renderLog + updateTurnUi。
- renderPanels 里继续调用 renderBattlePanelsView(battleSession.getBattlePanelsContext(...))。
- onExecuteTurn 可以继续 click #btn-execute，但实现留在 coordinator 内部，不要回到 AppRuntime。

============================================================
B. 新增 app/BattleLifecycleService.js
============================================================

职责：
- 管理 battle lifecycle，不操作复杂 DOM，只通过 renderCoordinator callback 更新 UI。
- 从 AppRuntime 移走：
  - clonePlayerConfig
  - startBattleFromConfigs
  - startBattleFromScenario
  - sleep
  - animateTurn
  - execute current turn
  - reset current battle

建议接口：

export function createBattleLifecycleService({
  getBattleSession,
  getConfigSession,
  getNetworkManager,
  isPveMode,
  renderAll,
  clearLog,
  setSubmitStatus,
  setExecuteDisabled,
}) {
  function startBattleFromConfigs(seed = Date.now(), players = getConfigSession()?.getBattlePlayerConfigs() || []) { ... }
  function startBattleFromScenario(seed = Date.now(), scenario) { ... }
  async function animateTurn() { ... }
  async function executeCurrentTurn() { ... }
  function resetCurrentBattle() { ... }

  return {
    startBattleFromConfigs,
    startBattleFromScenario,
    animateTurn,
    executeCurrentTurn,
    resetCurrentBattle,
  };
}

行为必须保持：
- startBattleFromConfigs:
  - clone players
  - configSession.setBattleConfigs(clonedPlayers)
  - battleSession.startBattleFromConfigs(seed, clonedPlayers)
  - setExecuteDisabled(true)
  - setSubmitStatus('等待提交...')
  - clearLog()
  - battleSession.clearTurnTimeout()
  - battleSession.startTurnTimeout()
- startBattleFromScenario:
  - scenario 合并 seed
  - configSession.setBattleConfigs(battleScenario)
  - battleSession.startBattleFromScenario(seed, battleScenario)
  - 同样 reset submit/log/timeout
- executeCurrentTurn:
  - 如果 network manager 存在且 mode !== 'local'，调用 battleSession.markP2PReady(nm)
  - 如果 PVE，调用 battleSession.submitAiAndExecutePveTurn()
  - 否则调用 battleSession.executeLocalTurn()
- resetCurrentBattle:
  - const configs = configSession.getBattleConfigs() || configSession.getBattlePlayerConfigs()
  - 如果 PVE 且 configs.mode === 'pve_multi'，调用 startBattleFromScenario(Date.now(), configs)
  - 否则调用 startBattleFromConfigs(Date.now(), configs)
- animateTurn:
  - 保留现有 projectileCalculator.generateKeyframes/getAnimEvents/projectiles 逻辑
  - 保留 SUBFRAMES=4 和 frameMs=25
  - 每帧调用 renderAll(s, sub / SUBFRAMES)
  - 结束后 renderAll(-1, 0)
  - 清理 clearKeyframes?.() 和 clearAnimEvents()

============================================================
C. 新增 app/StartModeActions.js
============================================================

职责：
- 管理 start lobby 的 mode transitions，不要让 AppRuntime 直接写 onStartLocal/onStartPve/onBackStart 等业务。

建议接口：

export function createStartModeActions({
  getConfigSession,
  getNetworkSession,
  battleRender,
}) {
  function startLocalConfig() { ... }
  function startPveConfig() { ... }
  function backStart() { ... }
  function createRoom({ serverAddr, ui }) { ... }
  function joinRoom({ roomCode, serverAddr, ui }) { ... }

  return {
    startLocalConfig,
    startPveConfig,
    backStart,
    createRoom,
    joinRoom,
  };
}

行为保持：
- startLocalConfig:
  - networkSession?.disconnect()
  - configSession.resetPlayerConfigs()
  - battleRender.setBattleHeader('本地', 'local', false)
  - configSession.showConfigScreen('local')
- startPveConfig:
  - networkSession?.disconnect()
  - configSession.resetPlayerConfigs()
  - battleRender.setBattleHeader('PVE', 'local', false)
  - configSession.showConfigScreen('pve')
- backStart:
  - networkSession?.disconnect()
- createRoom/joinRoom:
  - 代理到 networkSession

AppRuntime 里 initStartLobbyController 的 callbacks 只能写成引用这些 actions，不要内联业务。

============================================================
D. 新增 app/ReturnToStartAction.js
============================================================

职责：
- 管理 returnToStart 业务，不留在 AppRuntime。

建议接口：

export function createReturnToStartAction({
  getEl,
  getBattleSession,
  getGameOverController,
  getStartLobbyUi,
  routeController,
}) {
  return function returnToStart() {
    getBattleSession()?.resetForReturnToStart();
    getEl('disconnect-overlay')?.classList.remove('show');
    getGameOverController()?.hide();
    routeController.setRoute('start');
    getStartLobbyUi()?.hideRoomSetup();
    getStartLobbyUi()?.resetConnectionUI();
  };
}

============================================================
E. 新增 app/ConfigDomBindings.js
============================================================

职责：
- 只绑定 config screen 相关 DOM events。
- 从 AppRuntime 移走：
  - #config-player-switch button click
  - #btn-toggle-loadout click
  - #btn-config-lock click
  - #btn-config-start click
  - #btn-config-back click
  - #btn-start click legacy direct start

建议接口：

export function bindConfigDomEvents({
  getEl,
  getConfigSession,
  isPveMode,
  returnToStart,
  startBattleFromConfigs,
  startBattleFromScenario,
}) {
  ...
}

行为保持：
- player switch click 调 configSession.setConfigPlayerSwitch(btn.dataset.player)
- toggle loadout 调 configSession.toggleLoadoutDrawer()
- lock 调 configSession.toggleLockCurrent()
- config start:
  - if !configSession.canStartBattle() return
  - seed = Date.now()
  - if isPveMode() && typeof configSession.buildPveBattleScenario === 'function':
      startBattleFromScenario(seed, configSession.buildPveBattleScenario(seed))
    else:
      startBattleFromConfigs(seed, configSession.getBattlePlayerConfigs())
- config back 调 returnToStart
- legacy #btn-start:
  - p1 = #p1-class-select value || '法师'
  - p2 = #p2-class-select value || '战士'
  - configSession.resetPlayerConfigs(p1, p2)
  - startBattleFromConfigs(Date.now(), configSession.getBattlePlayerConfigs())

============================================================
F. 新增 app/BattleDomBindings.js
============================================================

职责：
- 绑定 battle screen 相关 DOM events。
- 从 AppRuntime 移走：
  - #btn-execute click
  - #btn-reset click
  - window resize

建议接口：

export function bindBattleDomEvents({
  getEl,
  executeCurrentTurn,
  resetCurrentBattle,
  resizeCanvas,
}) {
  getEl('btn-execute')?.addEventListener('click', executeCurrentTurn);
  getEl('btn-reset')?.addEventListener('click', resetCurrentBattle);
  window.addEventListener('resize', resizeCanvas);
}

不要在这里写 PVE/P2P 分支，那些已经属于 BattleLifecycleService。

============================================================
G. 新增 ui/battle/SkillRippleController.js
============================================================

职责：
- skill button ripple 是纯 UI effect，放到 ui/battle，不留在 AppRuntime。

建议接口：

export function initSkillRippleController({ root = document } = {}) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('.skill-btn');
    if (!btn) return;
    ...
  });
}

行为保持现有 ripple:
- span.ripple
- left/top/width/height 根据 click 位置和 button rect 计算
- animationend 后 remove

============================================================
H. 新增 app/RuntimeDomDefaults.js
============================================================

职责：
- 默认 server address 填充逻辑独立出去。

建议接口：

export function installRuntimeDomDefaults({
  getEl,
  getDefaultAddr,
}) {
  document.addEventListener('DOMContentLoaded', () => {
    const defaultAddr = getDefaultAddr();
    const hostInput = getEl('server-addr-input-host');
    const joinInput = getEl('server-addr-input');
    if (hostInput) hostInput.value = defaultAddr;
    if (joinInput) joinInput.value = defaultAddr;
  });
}

============================================================
I. 新增 app/RuntimeTestHooks.js
============================================================

职责：
- window.__testHooks 和 window.returnToStart 都从 AppRuntime 移走。

建议接口：

export function installRuntimeTestHooks({
  getConfigSession,
  routeNetworkMessage,
  returnToStart,
}) {
  window.__testHooks = window.__testHooks || {};
  window.__testHooks.routeNetworkMessage = payload => routeNetworkMessage(payload);
  window.__testHooks.getConfigSnapshot = () => {
    const configSession = getConfigSession();
    return {
      mode: configSession.getConfigMode(),
      currentPlayer: configSession.getCurrentConfigPlayer(),
      players: structuredClone(configSession.getConfigPlayers()),
      battleConfigs: structuredClone(configSession.getBattleConfigs()),
    };
  };
  window.returnToStart = returnToStart;
}

============================================================
J. 修改 app/AppRuntime.js
============================================================

AppRuntime 最终应该只做这些事：

1. import controllers/renderers/services
2. create getEl/defaultAddr/geometry
3. declare let battleSession/configSession/networkSession/chatController/gameOverController/startLobbyUi/battleCanvasRenderer/handleNetworkMessage
4. create battleRender = createBattleRenderCoordinator(...)
5. create lifecycle = createBattleLifecycleService(...)
6. new BattleSessionController(...)
7. new ConfigSessionController(...)
8. createVisualEffects + new BattleCanvasRenderer(...)
9. create startModeActions
10. initStartLobbyController with action callbacks
11. new NetworkSessionController with callbacks referencing battleRender/lifecycle/gameOver
12. createNetworkMessageRouter
13. initGameOverController
14. initChatController
15. initGalaxyOverlayController
16. initBattleInputController
17. create returnToStart action
18. bindConfigDomEvents(...)
19. bindBattleDomEvents(...)
20. initSkillRippleController(...)
21. installRuntimeDomDefaults(...)
22. installRuntimeTestHooks(...)
23. routeController.setRoute('start')
24. startLobbyUi.resetConnectionUI()
25. battleRender.resizeCanvas()
26. battleRender.renderAll()
27. return { init: () => {} }

AppRuntime 不要再定义：
- function renderPanels
- function renderLog
- function updateTurnUi
- function renderAll
- function resizeCanvas
- function showDisconnect
- function startBattleFromConfigs
- function startBattleFromScenario
- function sleep
- function animateTurn
- function returnToStart
- document.addEventListener(...)
- window.addEventListener(...)
- document.querySelectorAll(...).forEach(...)
- window.__testHooks = ...
- window.returnToStart = ...

如果必须保留极小 wrapper，只能是为了打破初始化循环，例如：
const getBattleSession = () => battleSession;
const getConfigSession = () => configSession;
const getNetworkSession = () => networkSession;
const getGameOverController = () => gameOverController;
const getStartLobbyUi = () => startLobbyUi;
const getBattleCanvasRenderer = () => battleCanvasRenderer;

但不要在 wrapper 里写业务分支。

============================================================
K. Callback wiring 注意点
============================================================

BattleSessionController:
- renderAll: () => battleRender.renderAll()
- renderLog: battleRender.renderLog
- clearLog: battleRender.clearLog
- setSubmitStatus: battleRender.setSubmitStatus
- setExecuteDisabled: battleRender.setExecuteDisabled
- showGameOverPanel: winnerId => gameOverController?.show(winnerId)
- hideGameOverPanel: () => gameOverController?.hide()
- showDisconnect: battleRender.showDisconnect
- getNetworkManager
- getConfigMode
- isPveMode
- setRoute
- appendChatMessage
- resizeCanvas: battleRender.resizeCanvas
- animateTurn: lifecycle.animateTurn

注意 lifecycle 创建时如果 battleSession 尚未赋值，必须通过 getter 读取，不能直接捕获 null。

NetworkSessionController callbacks:
- handleNetworkMessage: payload => handleNetworkMessage(payload)
- showDisconnect: battleRender.showDisconnect
- startBattleFromConfigs: lifecycle.startBattleFromConfigs
- hideGameOver: () => gameOverController?.hide()
- setModeBadge: battleRender.setModeBadge
- setConnectionIndicator: battleRender.setConnectionIndicator
- hideLobbyControls: battleRender.hideBattleHeaderControls
- getP2PClassSelection: () => getEl('p2p-class-select')?.value || '法师'
- isGameOverShown: battleRender.isGameOverShown
- setOpponentReadyForRematch: ready => gameOverController?.setOpponentReadyForRematch(ready)
- animateTurn: lifecycle.animateTurn

GalaxyOverlayController callbacks:
- renderAll: battleRender.renderAll
- setSubmitStatus: battleRender.setSubmitStatus

BattleInputController callbacks:
- renderAll: battleRender.renderAll
- executeButtonClick: () => getEl('btn-execute')?.click()
- setSubmitStatus: battleRender.setSubmitStatus
- computeEffectArea

GameOverController callbacks:
- startBattleFromConfigs: lifecycle.startBattleFromConfigs
- resetNetworkState:
    networkSession?.resetForReturnToStart()
    getEl('disconnect-overlay')?.classList.remove('show')
  如果想进一步干净，可以把 resetNetworkState 也抽入一个小 helper，但不要让 AppRuntime 重新膨胀。

============================================================
L. 验证
============================================================

修改后运行：

npm test -- tests/architecture/app-runtime-composition.spec.js tests/architecture/code-quality-hygiene.spec.js

然后运行：

npm test -- tests/e2e/smoke.spec.js tests/e2e/start-lobby.spec.js tests/e2e/config-session.spec.js

最后运行全量：

npm test

额外检查：
1. AppRuntime.js non-empty lines <= 430。
2. main.js 仍然 <= 3 non-empty lines。
3. AppRuntime.js 不包含：
   - document.addEventListener
   - window.addEventListener
   - window.__testHooks =
   - function animateTurn
   - function startBattleFromConfigs
   - function renderPanels
   - function renderLog
   - function updateTurnUi
   - function showDisconnect
4. AppRuntime.js 仍然包含架构测试期望的 wiring：
   - import ConfigSessionController
   - import NetworkSessionController
   - import createNetworkMessageRouter
   - import BattleCanvasRenderer
   - import createVisualEffects
   - new ConfigSessionController(...)
   - new NetworkSessionController(...)
   - new BattleCanvasRenderer(...)
   - createNetworkMessageRouter(...)
   - battleCanvasRenderer.renderBoard(...) 这一条如果因为 renderBoard 移入 BattleRenderCoordinator 导致架构测试失败，不要简单删除断言。可以将架构测试更新为允许 BattleRenderCoordinator owning renderBoard，前提是测试意图仍然保持：AppRuntime 不允许拥有 canvas drawing implementation。更好的做法是在 AppRuntime 里通过 BattleRenderCoordinator 间接引用，不再要求 AppRuntime 直接匹配 renderBoard。
5. 不允许新增 circular import。
6. 不允许把 engine state、config state、network manager 重新定义成 AppRuntime 局部业务状态。

============================================================
M. 如果架构测试中 renderBoard 正则失败
============================================================

当前 app-runtime-composition.spec.js 可能要求 AppRuntime 直接出现 battleCanvasRenderer.renderBoard(...)。
但是这次目标是进一步瘦身，renderBoard 应该移入 BattleRenderCoordinator。

如果该断言失败，请只做这个测试语义更新：
- 不再要求 AppRuntime 直接调用 battleCanvasRenderer.renderBoard(...)
- 改为要求：
  1. AppRuntime imports createBattleRenderCoordinator
  2. AppRuntime calls createBattleRenderCoordinator(...)
  3. BattleRenderCoordinator.js contains getBattleCanvasRenderer()?.renderBoard(...) 或等价调用
  4. AppRuntime 仍然 not.toMatch ctx.arc/fill/stroke/fillText/renderConfigScreenView({...})

不要放宽 500 行预算。
不要删除 canvas ownership 保护。
不要把 renderBoard 调回 AppRuntime。

============================================================
N. 交付格式
============================================================

完成后给出：
1. 新增文件列表。
2. 修改文件列表。
3. AppRuntime.js non-empty line count before/after。
4. 每个抽取模块负责什么。
5. 测试结果。
6. 如果有失败，说明是行为失败还是测试基线过时，不要含糊。