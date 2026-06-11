import { BattleSessionController } from '../session/BattleSessionController.js';
import { ConfigSessionController } from '../session/ConfigSessionController.js';
import { NetworkSessionController } from '../network/NetworkSessionController.js';
import { createNetworkMessageRouter } from '../network/NetworkMessageRouter.js';
import { BattleCanvasRenderer } from '../ui/battle/BattleCanvasRenderer.js';
import { createVisualEffects } from '../ui/battle/VisualEffects.js';
import { renderConfigScreenView } from '../ui/config/ConfigScreenView.js';
import { initStartLobbyController } from '../ui/start/StartLobbyController.js';
import { initBattleInputController } from '../ui/battle/BattleInputController.js';
import { initGalaxyOverlayController } from '../ui/battle/GalaxyOverlayController.js';
import { initGameOverController } from '../ui/battle/GameOverController.js';
import { initChatController } from '../ui/battle/ChatController.js';
import { TutorialManager } from '../tutorial/TutorialManager.js';
import { RouteController } from './RouteController.js';
import { GameMode, normalizeConfigMode, isPveMode as isGameModePve } from './GameModes.js';
import { SKILLS } from '../engine/SkillData.js';
import { createAssetPreloader } from '../ui/shared/AssetPreloader.js';
import {
  LOADOUT_SIZE,
  ROLE_LOADOUT_SIZE,
  ROLE_DEFS,
  getDefaultLoadout,
  getDefaultRoleLoadout,
  getDefaultRoleId,
  getRolesByClass,
  normalizePlayerConfig,
  validateLoadout,
  validateRoleLoadout,
} from '../engine/RoleData.js';
import {
  isOnBoard,
  hexCenter,
  hexCorners,
  pixelToHex,
} from '../engine/HexMath.js';
import { computeEffectArea } from '../ui/battle/EffectAreaCalculator.js';
import { createBattleRenderCoordinator } from './BattleRenderCoordinator.js';
import { createBattleLifecycleService } from './BattleLifecycleService.js';
import { createTurnPlaybackController } from './TurnPlaybackController.js';
import { createStartModeActions } from './StartModeActions.js';
import { createReturnToStartAction } from './ReturnToStartAction.js';
import { bindConfigDomEvents } from './ConfigDomBindings.js';
import { bindBattleDomEvents } from './BattleDomBindings.js';
import { initSkillRippleController } from '../ui/battle/SkillRippleController.js';
import { installRuntimeDomDefaults } from './RuntimeDomDefaults.js';
import { installRuntimeTestHooks } from './RuntimeTestHooks.js';
import { PORTRAIT_CACHE_VERSION } from '../ui/portrait/PortraitAssets.js';
import { seedSkillIconCacheFromPreloader } from '../ui/shared/SkillIconAssets.js';
import { createTurnResolutionBuilder } from '../engine/resolution/TurnResolutionBuilder.js';
import { BattleSceneStore } from '../presentation/BattleSceneStore.js';
import { renderLiveBattleScene } from './BattleScenePipeline.js';

export function createAppRuntime() {
  const CLASSES = ['法师', '战士', '射手'];
  const assetPreloader = createAssetPreloader();
  assetPreloader.preloadBattleAssets({
    skills: SKILLS,
    roles: ROLE_DEFS,
    portraitCacheVersion: PORTRAIT_CACHE_VERSION,
  });
  seedSkillIconCacheFromPreloader(assetPreloader.cache);

  const getEl = (id) => document.getElementById(id);
  const getDefaultAddr = () => window.location.hostname.includes('ngrok-free') ? window.location.host : '120.77.178.15:8088';

  const canvas = getEl('board');
  const context = canvas.getContext('2d');
  const routeController = new RouteController({ dom: { startScreen: 'start-screen', configScreen: 'config-screen', app: 'app' } });
  const geometry = { pixelToHex, isOnBoard, hexCenter, hexCorners };

  // ── Lazy-initialized services ──
  let battleCanvasRenderer = null;
  let battleSession = null;
  let configSession = null;
  let networkSession = null;
  let chatController = null;
  let gameOverController = null;
  let startLobbyUi = null;
  let tutorialManager = new TutorialManager();
  let turnPlaybackController = null;
  const turnResolutionBuilder = createTurnResolutionBuilder();
  let handleNetworkMessage = () => {};

  // ── Getters (break initialization cycles) ──
  const getBattleSession = () => battleSession;
  const getConfigSession = () => configSession;
  const getNetworkSession = () => networkSession;
  const getNetworkManager = () => networkSession?.getNetworkManager() || null;
  const getCurrentGameMode = () => normalizeConfigMode(configSession?.getConfigMode());
  const getTutorialManager = () => tutorialManager;
  const isTutorialMode = () => Boolean(tutorialManager?.getCurrentLevel?.());
  const isPveMode = () => !isTutorialMode() && (
    Boolean(configSession?.isLegacyPveMode?.()) ||
    (isGameModePve(getCurrentGameMode()) && (!getNetworkManager() || getNetworkManager().mode === 'local'))
  );
  const getBattleCanvasRenderer = () => battleCanvasRenderer;
  const getGameOverController = () => gameOverController;
  const getStartLobbyUi = () => startLobbyUi;

  // ── BattleSceneStore (live pipeline) ──
  const battleSceneStore = new BattleSceneStore();
  const renderLiveScene = () => renderLiveBattleScene({
    engine: battleSession?.engine,
    battleSession,
    sceneStore: battleSceneStore,
    renderer: battleCanvasRenderer,
  });

  // ── Battle render coordinator ──
  const battleRender = createBattleRenderCoordinator({
    getEl,
    getBattleSession,
    getBattleCanvasRenderer,
    renderLiveScene,
  });

  // ── Battle lifecycle service ──
  const lifecycle = createBattleLifecycleService({
    getBattleSession,
    getConfigSession,
    getNetworkManager,
    isPveMode,
    isTutorialMode,
    renderAll: (s, sub) => battleRender.renderAll(s, sub),
    clearLog: battleRender.clearLog,
    setSubmitStatus: battleRender.setSubmitStatus,
    setExecuteDisabled: battleRender.setExecuteDisabled,
    setBattleHeader: battleRender.setBattleHeader,
    getTutorialManager,
  });

  // ── Battle session controller ──
  battleSession = new BattleSessionController({
    computeEffectArea,
    renderAll: () => battleRender.renderAll(),
    renderLog: battleRender.renderLog,
    clearLog: battleRender.clearLog,
    setSubmitStatus: battleRender.setSubmitStatus,
    setExecuteDisabled: battleRender.setExecuteDisabled,
    showGameOverPanel: (winnerId) => gameOverController?.show(winnerId),
    hideGameOverPanel: () => gameOverController?.hide(),
    showDisconnect: battleRender.showDisconnect,
    getNetworkManager,
    getConfigMode: () => configSession?.getConfigMode() || 'local',
    isPveMode,
    setRoute: (route) => routeController.setRoute(route),
    appendChatMessage: (sender, text) => chatController?.appendMessage(sender, text),
    resizeCanvas: battleRender.resizeCanvas,
    animateTurn: (turnData) => turnPlaybackController.play(turnData),
    buildTurnResolution: () => turnResolutionBuilder.build(battleSession.engine),
    resetResolutionPlayback: () => turnPlaybackController?.reset?.(),
  });
  battleSession.setTutorialManager(tutorialManager);

  turnPlaybackController = createTurnPlaybackController({
    getBattleSession: () => battleSession,
    getEl,
    getCharacterPortraitSrc: (char) => battleCanvasRenderer?.getCharacterPortraitSrc?.(char) || '',
    getCurrentGameMode,
    renderAll: () => battleRender.renderAll(),
    setSubmitStatus: battleRender.setSubmitStatus,
    setExecuteDisabled: battleRender.setExecuteDisabled,
  });

  // ── Config session controller ──
  configSession = new ConfigSessionController({
    routeController,
    battleSession,
    getNetworkManager,
    renderConfigScreenView,
    sendConfigUpdate: () => networkSession?.sendConfigUpdate(),
    sendConfigLock: () => networkSession?.sendConfigLock(),
    maybeStartP2PBattle: () => networkSession?.maybeStartP2PBattle(),
    callbacks: {
      hideGameOver: () => gameOverController?.hide(),
    },
    CLASSES,
    PORTRAIT_CACHE_VERSION,
    ROLE_DEFS,
    LOADOUT_SIZE,
    ROLE_LOADOUT_SIZE,
    getDefaultRoleId,
    getDefaultLoadout,
    getDefaultRoleLoadout,
    getRolesByClass,
    normalizePlayerConfig,
    validateLoadout,
    validateRoleLoadout,
  });

  // ── Canvas renderer ──
  const visualEffects = createVisualEffects({ context, hexCenter });
  battleCanvasRenderer = new BattleCanvasRenderer({
    canvas,
    context,
    geometry,
    visualEffects,
    portraitCacheVersion: PORTRAIT_CACHE_VERSION,
    assetImageCache: assetPreloader.cache,
  });

  // ── Start mode actions ──
  const startModeActions = createStartModeActions({
    getConfigSession,
    getNetworkSession,
    battleRender,
    getTutorialManager,
    lifecycle,
  });

  // ── Start lobby ──
  startLobbyUi = initStartLobbyController({
    defaultAddr: getDefaultAddr(),
    callbacks: {
      onStartTutorial() {
        startModeActions.startTutorial();
      },
      onStartLocalDuel() {
        startModeActions.startLocalConfig(GameMode.LOCAL_DUEL, '本地对战', { leftLabel: 'P1', rightLabel: 'P2' });
      },
      onStartLocalCoop() {
        startModeActions.startLocalConfig(GameMode.LOCAL_COOP, '本地合作', { leftLabel: 'P1', rightLabel: 'P2' });
      },
      onStartLocalSolo() {
        startModeActions.startLocalConfig(GameMode.LOCAL_SOLO, '本地单人', { leftLabel: 'P1', rightLabel: 'AI' });
      },
      onStartLegacyPve() {
        startModeActions.startLegacyPveConfig();
      },
      onStartP2PDuel() {
        startModeActions.startP2PConfig(GameMode.P2P_DUEL, '联机对战');
      },
      onStartP2PCoop() {
        alert('联机合作开发中');
      },
      onBackStart() {
        networkSession?.disconnect();
      },
      onCreateRoom({ serverAddr, ui }) {
        return networkSession?.createRoom({ serverAddr, ui });
      },
      onJoinRoom({ roomCode, serverAddr, ui }) {
        return networkSession?.joinRoom({ roomCode, serverAddr, ui });
      },
    },
  });

  // ── Network session controller ──
  networkSession = new NetworkSessionController({
    battleSession,
    configSession,
    routeController,
    callbacks: {
      handleNetworkMessage: (payload) => handleNetworkMessage(payload),
      showDisconnect: battleRender.showDisconnect,
      startBattleFromConfigs: lifecycle.startBattleFromConfigs,
      hideGameOver: () => gameOverController?.hide(),
      setModeBadge: battleRender.setModeBadge,
      setConnectionIndicator: battleRender.setConnectionIndicator,
      hideLobbyControls: battleRender.hideBattleHeaderControls,
      getP2PClassSelection: () => getEl('p2p-class-select')?.value || '法师',
      isGameOverShown: battleRender.isGameOverShown,
      setOpponentReadyForRematch: (ready) => gameOverController?.setOpponentReadyForRematch(ready),
      animateTurn: (turnData) => turnPlaybackController.play(turnData),
    },
  });

  // ── Network message router ──
  handleNetworkMessage = createNetworkMessageRouter({
    networkSession,
    configSession,
    getChatController: () => chatController,
    battleSession,
    routeController,
    startBattleFromConfigs: lifecycle.startBattleFromConfigs,
    renderConfigScreen: () => configSession.renderConfigScreen(),
    getCurrentRoute: () => routeController.getRoute(),
  });

  // ── Return to start (lazy init, assigned after createReturnToStartAction) ──
  let returnToStart = () => {};

  // ── Game over controller ──
  gameOverController = initGameOverController({
    battleSession,
    getNetworkManager,
    getCurrentGameMode,
    startLobbyUi,
    callbacks: {
      setRoute: (route) => routeController.setRoute(route),
      showConfigScreen: (mode) => configSession.showConfigScreen(mode),
      startBattleFromConfigs: lifecycle.startBattleFromConfigs,
      resetNetworkState: () => {
        networkSession?.resetForReturnToStart();
        getEl('disconnect-overlay')?.classList.remove('show');
      },
      getBattlePlayerConfigs: () => configSession.getBattlePlayerConfigs(),
      returnToStart: () => returnToStart(),
    },
  });

  // ── Chat controller ──
  chatController = initChatController({
    callbacks: {
      sendChat: (text) => {
        const nm = getNetworkManager();
        if (nm && nm.mode !== 'local') nm.sendMessage({ type: 'CHAT', text });
      },
    },
  });

  // ── Galaxy overlay controller ──
  initGalaxyOverlayController({
    battleSession,
    getEngine: () => battleSession.engine,
    getNetworkManager,
    callbacks: {
      renderAll: battleRender.renderAll,
      setSubmitStatus: battleRender.setSubmitStatus,
    },
  });

  // ── Battle input controller ──
  initBattleInputController({
    canvas,
    battleSession,
    getNetworkManager,
    isPveMode,
    getEngine: () => battleSession.engine,
    geometry,
    selectors: {
      getCharacterAtHex: (q, r) => battleSession.engine.getState().characters.find(c => c.alive !== false && c.position?.q === q && c.position?.r === r) || null,
      getCharactersAtHex: (q, r) => battleSession.engine.getState().characters.filter(c => c.alive !== false && c.position?.q === q && c.position?.r === r),
    },
    callbacks: {
      renderAll: battleRender.renderAll,
      executeButtonClick: () => getEl('btn-execute')?.click(),
      setSubmitStatus: battleRender.setSubmitStatus,
      computeEffectArea,
    },
  });

  // ── Return to start action ──
  returnToStart = createReturnToStartAction({
    getEl,
    getBattleSession,
    getGameOverController,
    getStartLobbyUi,
    getTutorialManager,
    getConfigSession,
    battleRender,
    routeController,
  });

  // ── DOM event bindings ──
  bindConfigDomEvents({
    getEl,
    getConfigSession,
    getCurrentGameMode,
    isPveMode,
    lifecycle,
    returnToStart,
  });

  bindBattleDomEvents({
    getEl,
    executeCurrentTurn: lifecycle.executeCurrentTurn,
    resetCurrentBattle: lifecycle.resetCurrentBattle,
    resizeCanvas: battleRender.resizeCanvas,
  });

  initSkillRippleController({ root: document });

  installRuntimeDomDefaults({ getEl, getDefaultAddr });

  installRuntimeTestHooks({
    getConfigSession,
    getBattleSession,
    getTutorialManager,
    getTurnPlaybackController: () => turnPlaybackController,
    routeController,
    routeNetworkMessage: (payload) => handleNetworkMessage(payload),
    returnToStart,
    renderAll: () => battleRender.renderAll(),
  });

  // ── Initialize ──
  routeController.setRoute('start');
  startLobbyUi.resetConnectionUI();
  battleRender.resizeCanvas();
  battleRender.renderAll();

  return { init: () => {} };
}
