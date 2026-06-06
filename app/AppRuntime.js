import { BattleSessionController } from '../session/BattleSessionController.js';
import { ConfigSessionController } from '../session/ConfigSessionController.js';
import { NetworkSessionController } from '../network/NetworkSessionController.js';
import { createNetworkMessageRouter } from '../network/NetworkMessageRouter.js';
import { BattleCanvasRenderer } from '../ui/battle/BattleCanvasRenderer.js';
import { createVisualEffects } from '../ui/battle/VisualEffects.js';
import { renderBattlePanelsView } from '../ui/battle/BattlePanelsView.js';
import { renderConfigScreenView } from '../ui/config/ConfigScreenView.js';
import { initStartLobbyController } from '../ui/start/StartLobbyController.js';
import { initBattleInputController } from '../ui/battle/BattleInputController.js';
import { initGalaxyOverlayController } from '../ui/battle/GalaxyOverlayController.js';
import { initGameOverController } from '../ui/battle/GameOverController.js';
import { initChatController } from '../ui/battle/ChatController.js';
import { RouteController } from './RouteController.js';
import { GameMode, normalizeConfigMode, isPveMode as isGameModePve } from './GameModes.js';
import { SKILLS, SKILLS_BY_CLASS } from '../engine/SkillData.js';
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

export function createAppRuntime() {
  const PORTRAIT_CACHE_VERSION = '3';
  const CLASSES = ['法师', '战士', '射手'];
  const assetPreloader = createAssetPreloader();
  assetPreloader.preloadBattleAssets({
    skills: SKILLS,
    roles: ROLE_DEFS,
    portraitCacheVersion: PORTRAIT_CACHE_VERSION,
  });

  const getEl = (id) => document.getElementById(id);
  const setText = (id, text) => { const el = getEl(id); if (el) el.textContent = text; };
  const setDisplay = (id, value) => { const el = getEl(id); if (el) el.style.display = value; };
  const clonePlayerConfig = (cfg) => ({
    playerId: cfg.playerId,
    class: cfg.class,
    roleId: cfg.roleId,
    loadoutSkillIds: [...cfg.loadoutSkillIds],
    roleLoadoutSkillIds: [...(cfg.roleLoadoutSkillIds || [])],
    locked: Boolean(cfg.locked),
  });

  const canvas = getEl('board');
  const context = canvas.getContext('2d');
  const routeController = new RouteController({ dom: { startScreen: 'start-screen', configScreen: 'config-screen', app: 'app' } });
  const geometry = { pixelToHex, isOnBoard, hexCenter, hexCorners };

  let battleCanvasRenderer = null;
  let battleSession = null;
  let configSession = null;
  let networkSession = null;
  let chatController = null;
  let gameOverController = null;
  let startLobbyUi = null;
  let handleNetworkMessage = () => {};

  const getNetworkManager = () => networkSession?.getNetworkManager() || null;
  const getCurrentGameMode = () => normalizeConfigMode(configSession?.getConfigMode());
  const isPveMode = () => isGameModePve(getCurrentGameMode()) && (!getNetworkManager() || getNetworkManager().mode === 'local');

  const hideBattleHeaderControls = () => {
    setDisplay('p1-class-select', 'none');
    setDisplay('p2-class-select', 'none');
    setDisplay('btn-start', 'none');
    setDisplay('btn-reset', '');
  };

  const setBattleHeader = (modeText, modeClass, connected = false) => {
    const badge = getEl('mode-badge');
    if (badge) {
      badge.textContent = modeText;
      badge.className = modeClass;
    }
    setDisplay('conn-indicator', connected ? '' : 'none');
    hideBattleHeaderControls();
  };

  const setSubmitStatus = (text) => setText('submit-status', text);
  const setExecuteDisabled = (disabled) => { const btn = getEl('btn-execute'); if (btn) btn.disabled = disabled; };
  const clearLog = () => { const log = getEl('log'); if (log) log.innerHTML = ''; };

  function renderPanels() {
    try {
      renderBattlePanelsView(battleSession.getBattlePanelsContext({
        onExecuteTurn: () => getEl('btn-execute')?.click(),
      }));
    } catch (err) {
      console.error('[renderPanels] renderBattlePanelsView failed:', err);
      throw err;
    }
  }

  function renderLog() {
    const logEl = getEl('log');
    if (!logEl) return;
    const entries = battleSession.engine.logger.getEntries();
    logEl.innerHTML = entries.map(e => `<div class="log-entry log-${e.category || 's'}">[${e.turn || '-'}] ${e.message}</div>`).join('');
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateTurnUi() {
    const engine = battleSession?.engine;
    if (!engine) return;
    setText('turn-num', engine.turnManager.turnNumber);
    const phaseEl = getEl('phase-text');
    if (!phaseEl) return;
    const phase = engine.turnManager.phase;
    phaseEl.textContent = phase;
    if (phase === 'EXECUTE') {
      phaseEl.style.color = '#e05555';
      phaseEl.style.animation = 'phase-pulse 0.6s ease-in-out';
    } else {
      phaseEl.style.color = '#DDBB99';
      phaseEl.style.animation = 'none';
    }
  }

  function renderAll(animStep = -1, subT = 0) {
    battleCanvasRenderer?.renderBoard(animStep, subT);
    renderPanels();
    renderLog();
    updateTurnUi();
  }

  function resizeCanvas() {
    battleCanvasRenderer?.resize();
  }

  function showDisconnect(reason) {
    setText(
      'disconnect-reason',
      reason === 'peer_left' ? '对手离开了游戏' :
      reason === 'timeout' ? '连接超时' :
      reason === 'connection_lost' ? '网络连接中断' : '连接已断开'
    );
    getEl('disconnect-overlay')?.classList.add('show');
  }

  function startBattleFromConfigs(seed = Date.now(), players = configSession?.getBattlePlayerConfigs() || []) {
    const clonedPlayers = players.map(clonePlayerConfig);
    configSession.setBattleConfigs(clonedPlayers);
    battleSession.startBattleFromConfigs(seed, clonedPlayers);
    setExecuteDisabled(true);
    setSubmitStatus('等待提交...');
    clearLog();
    battleSession.clearTurnTimeout();
    battleSession.startTurnTimeout();
  }

  function startBattleFromScenario(seed = Date.now(), scenario) {
    const battleScenario = { ...scenario, seed };
    configSession.setBattleConfigs(battleScenario);
    battleSession.startBattleFromScenario(seed, battleScenario);
    setExecuteDisabled(true);
    setSubmitStatus('等待提交...');
    clearLog();
    battleSession.clearTurnTimeout();
    battleSession.startTurnTimeout();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function animateTurn() {
    const keyframes = battleSession.engine.projectileCalculator.generateKeyframes();
    const animEvents = battleSession.engine.projectileCalculator.getAnimEvents();
    const projs = battleSession.engine.projectileCalculator.projectiles;
    if (keyframes.length === 0 && animEvents.length === 0 && projs.length === 0) return;

    const maxStep = Math.max(
      keyframes.reduce((max, kf) => Math.max(max, kf.step || 0), 0),
      animEvents.reduce((max, e) => Math.max(max, (e.step || 0) + (e.duration || 1) - 1), 0)
    );
    const SUBFRAMES = 4;
    const frameMs = 25;

    for (let s = 0; s <= maxStep; s++) {
      const startSub = s === 0 ? 0 : 1;
      for (let sub = startSub; sub <= SUBFRAMES; sub++) {
        await sleep(frameMs);
        renderAll(s, sub / SUBFRAMES);
      }
    }
    await sleep(200);
    renderAll(-1, 0);
    battleSession.engine.projectileCalculator.clearKeyframes?.();
    battleSession.engine.projectileCalculator.clearAnimEvents();
  }

  battleSession = new BattleSessionController({
    computeEffectArea,
    renderAll: () => renderAll(),
    renderLog,
    clearLog,
    setSubmitStatus,
    setExecuteDisabled,
    showGameOverPanel: (winnerId) => gameOverController?.show(winnerId),
    hideGameOverPanel: () => gameOverController?.hide(),
    showDisconnect,
    getNetworkManager,
    getConfigMode: () => configSession?.getConfigMode() || 'local',
    isPveMode,
    setRoute: (route) => routeController.setRoute(route),
    appendChatMessage: (sender, text) => chatController?.appendMessage(sender, text),
    resizeCanvas,
    animateTurn,
  });

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

  const visualEffects = createVisualEffects({ context, hexCenter });
  battleCanvasRenderer = new BattleCanvasRenderer({
    canvas,
    context,
    battleSession,
    getEngine: () => battleSession.engine,
    geometry,
    visualEffects,
    portraitCacheVersion: PORTRAIT_CACHE_VERSION,
    assetImageCache: assetPreloader.cache,
  });

  startLobbyUi = initStartLobbyController({
    defaultAddr: window.location.hostname.includes('ngrok-free') ? window.location.host : '120.77.178.15:8088',
    callbacks: {
      onStartLocalDuel() {
        networkSession?.disconnect();
        configSession.resetPlayerConfigs();
        setBattleHeader('本地对战', 'local', false);
        configSession.showConfigScreen(GameMode.LOCAL_DUEL);
      },
      onStartLocalCoop() {
        networkSession?.disconnect();
        configSession.resetPlayerConfigs();
        setBattleHeader('本地合作', 'local', false);
        configSession.showConfigScreen(GameMode.LOCAL_COOP);
      },
      onStartLocalSolo() {
        networkSession?.disconnect();
        configSession.resetPlayerConfigs();
        setBattleHeader('本地单人', 'local', false);
        configSession.showConfigScreen(GameMode.LOCAL_SOLO);
      },
      onStartP2PDuel() {
        networkSession?.disconnect();
        configSession.resetPlayerConfigs();
        configSession.setConfigMode(GameMode.P2P_DUEL);
        setBattleHeader('联机对战', 'p2p', true);
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

  networkSession = new NetworkSessionController({
    battleSession,
    configSession,
    routeController,
    callbacks: {
      handleNetworkMessage: (payload) => handleNetworkMessage(payload),
      showDisconnect,
      startBattleFromConfigs,
      hideGameOver: () => gameOverController?.hide(),
      setModeBadge: (text, className) => {
        const badge = getEl('mode-badge');
        if (!badge) return;
        badge.textContent = text;
        badge.className = className;
      },
      setConnectionIndicator: (visible) => setDisplay('conn-indicator', visible ? '' : 'none'),
      hideLobbyControls: hideBattleHeaderControls,
      getP2PClassSelection: () => getEl('p2p-class-select')?.value || '法师',
      isGameOverShown: () => Boolean(getEl('gameover-panel')?.classList.contains('show')),
      setOpponentReadyForRematch: (ready) => gameOverController?.setOpponentReadyForRematch(ready),
      animateTurn,
    },
  });

  handleNetworkMessage = createNetworkMessageRouter({
    networkSession,
    configSession,
    getChatController: () => chatController,
    battleSession,
    routeController,
    startBattleFromConfigs,
    renderConfigScreen: () => configSession.renderConfigScreen(),
    getCurrentRoute: () => routeController.getRoute(),
  });

  gameOverController = initGameOverController({
    battleSession,
    getNetworkManager,
    getCurrentGameMode,
    startLobbyUi,
    callbacks: {
      setRoute: (route) => routeController.setRoute(route),
      showConfigScreen: (mode) => configSession.showConfigScreen(mode),
      startBattleFromConfigs,
      resetNetworkState: () => {
        networkSession?.resetForReturnToStart();
        getEl('disconnect-overlay')?.classList.remove('show');
      },
      getBattlePlayerConfigs: () => configSession.getBattlePlayerConfigs(),
    },
  });

  chatController = initChatController({
    callbacks: {
      sendChat: (text) => {
        const nm = getNetworkManager();
        if (nm && nm.mode !== 'local') nm.sendMessage({ type: 'CHAT', text });
      },
    },
  });

  initGalaxyOverlayController({
    battleSession,
    getEngine: () => battleSession.engine,
    getNetworkManager,
    callbacks: {
      renderAll,
      setSubmitStatus,
    },
  });

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
      renderAll,
      executeButtonClick: () => getEl('btn-execute')?.click(),
      setSubmitStatus,
      computeEffectArea,
    },
  });

  window.__testHooks = window.__testHooks || {};
  window.__testHooks.routeNetworkMessage = (payload) => handleNetworkMessage(payload);
  window.__testHooks.getConfigSnapshot = () => ({
    mode: configSession.getConfigMode(),
    currentPlayer: configSession.getCurrentConfigPlayer(),
    players: structuredClone(configSession.getConfigPlayers()),
    battleConfigs: structuredClone(configSession.getBattleConfigs()),
  });

  function returnToStart() {
    battleSession.resetForReturnToStart();
    getEl('disconnect-overlay')?.classList.remove('show');
    gameOverController?.hide();
    routeController.setRoute('start');
    startLobbyUi.hideRoomSetup();
    startLobbyUi.resetConnectionUI();
  }

  window.returnToStart = returnToStart;

  document.querySelectorAll('#config-player-switch button').forEach(btn => {
    btn.addEventListener('click', () => {
      configSession.setConfigPlayerSwitch(btn.dataset.player);
    });
  });

  getEl('btn-toggle-loadout')?.addEventListener('click', () => configSession.toggleLoadoutDrawer());
  getEl('btn-config-lock')?.addEventListener('click', () => configSession.toggleLockCurrent());
  getEl('btn-config-start')?.addEventListener('click', () => {
    if (!configSession.canStartBattle()) return;
    const seed = Date.now();
    if (getCurrentGameMode() === GameMode.LOCAL_COOP && typeof configSession.buildPveBattleScenario === 'function') {
      startBattleFromScenario(seed, configSession.buildPveBattleScenario(seed));
      return;
    }
    startBattleFromConfigs(seed, configSession.getBattlePlayerConfigs());
  });
  getEl('btn-config-back')?.addEventListener('click', returnToStart);
  getEl('btn-execute')?.addEventListener('click', async () => {
    const nm = getNetworkManager();
    if (nm && nm.mode !== 'local') {
      battleSession.markP2PReady(nm);
      return;
    }
    if (isPveMode()) {
      await battleSession.submitAiAndExecutePveTurn();
      return;
    }
    await battleSession.executeLocalTurn();
  });
  getEl('btn-reset')?.addEventListener('click', () => {
    const configs = configSession.getBattleConfigs() || configSession.getBattlePlayerConfigs();
    if (getCurrentGameMode() === GameMode.LOCAL_COOP && configs?.mode === 'pve_multi') {
      startBattleFromScenario(Date.now(), configs);
      return;
    }
    startBattleFromConfigs(Date.now(), configs);
  });
  getEl('btn-start')?.addEventListener('click', () => {
    const p1 = getEl('p1-class-select')?.value || '法师';
    const p2 = getEl('p2-class-select')?.value || '战士';
    configSession.resetPlayerConfigs(p1, p2);
    startBattleFromConfigs(Date.now(), configSession.getBattlePlayerConfigs());
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.skill-btn');
    if (!btn) return;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
    ripple.style.width = ripple.style.height = `${size}px`;
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', () => ripple.remove());
  });

  document.addEventListener('DOMContentLoaded', () => {
    const defaultAddr = window.location.hostname.includes('ngrok-free') ? window.location.host : '120.77.178.15:8088';
    const hostInput = getEl('server-addr-input-host');
    const joinInput = getEl('server-addr-input');
    if (hostInput) hostInput.value = defaultAddr;
    if (joinInput) joinInput.value = defaultAddr;
  });

  window.addEventListener('resize', resizeCanvas);

  routeController.setRoute('start');
  startLobbyUi.resetConnectionUI();
  resizeCanvas();
  renderAll();

  return { init: () => {} };
}
