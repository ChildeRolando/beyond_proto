import { BattleSessionController } from './session/BattleSessionController.js';
import { NetworkManager } from './engine/NetworkManager.js';
import { SKILLS, SKILLS_BY_CLASS } from './engine/SkillData.js';
import { getPlannedOriginForSkill } from './engine/PlannedPositionPreview.js';
import {
  LOADOUT_SIZE,
  ROLE_LOADOUT_SIZE,
  ROLE_DEFS,
  ROLE_TRAITS,
  getRoleTraits,
  getDefaultLoadout,
  getDefaultRoleLoadout,
  getRoleSkillPool,
  getDefaultRoleId,
  getRolesByClass,
  normalizePlayerConfig,
  validateLoadout,
  validateRoleLoadout,
} from './engine/RoleData.js';
import { isOnBoard, hexCenter, hexCorners, pixelToHex, hexDistance, hexLine, hexSpiral, setCanvasSize, getSectorHexes } from './engine/HexMath.js';
import { renderConfigScreenView } from './ui/config/ConfigScreenView.js';
import { renderBattlePanelsView } from './ui/battle/BattlePanelsView.js';
import { initStartLobbyController } from './ui/start/StartLobbyController.js';
import { initBattleInputController } from './ui/battle/BattleInputController.js';

const PORTRAIT_CACHE_VERSION = '2';

// --- Preload skill icons + role portraits (non-blocking) ---
(function preloadIcons() {
  for (const skill of Object.values(SKILLS)) {
    if (skill.icon) {
      const img = new Image();
      img.src = skill.icon;
    }
  }
  for (const role of Object.values(ROLE_DEFS)) {
    const img = new Image();
    img.src = `assets/character-portraits/${role.id}.webp?v=${PORTRAIT_CACHE_VERSION}`;
  }
})();

// --- Init ---
let networkManager = null;  // null in local mode, NetworkManager in P2P mode

// --- BattleSessionController (holds all battle state + lifecycle) ---
const battleSession = new BattleSessionController({
  computeEffectArea: (skill, charPos, hoveredTarget, rangeOverride) => computeEffectArea(skill, charPos, hoveredTarget, rangeOverride),
  renderAll: () => renderAll(),
  renderLog: () => renderLog(),
  clearLog: () => { document.getElementById('log').innerHTML = ''; },
  setSubmitStatus: (text) => { document.getElementById('submit-status').textContent = text; },
  setExecuteDisabled: (disabled) => { document.getElementById('btn-execute').disabled = disabled; },
  showGameOverPanel: (winnerId) => showGameOver(winnerId),
  hideGameOverPanel: () => { document.getElementById('gameover-panel').classList.remove('show'); },
  showDisconnect: (reason) => showDisconnect(reason),
  getNetworkManager: () => networkManager,
  getConfigMode: () => configMode,
  isPveMode: () => isPveMode(),
  setRoute: (route) => setRoute(route),
  appendChatMessage: (sender, text) => appendChatMessage(sender, text),
  resizeCanvas: () => resizeCanvas(),
});

// Legacy engine accessor for canvas rendering (temporary migration)
const engine = battleSession.engine;

// Auto-detect if served through ngrok (for internet play)
const isNgrok = window.location.hostname.includes('ngrok-free');
const autoSignalingUrl = isNgrok
  ? `wss://${window.location.host}`
  : 'ws://120.77.178.15:8088';

// Set initial server address values
document.addEventListener('DOMContentLoaded', () => {
  const hostInput = document.getElementById('server-addr-input-host');
  const joinInput = document.getElementById('server-addr-input');
  if (hostInput) hostInput.value = isNgrok ? window.location.host : '120.77.178.15:8088';
  if (joinInput) joinInput.value = isNgrok ? window.location.host : '120.77.178.15:8088';
});
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  if (w <= 0 || h <= 0) return;
  canvas.width = w;
  canvas.height = h;
  setCanvasSize(w, h);
  renderAll();
}
window.addEventListener('resize', resizeCanvas);


const CLASSES = ['法师', '战士', '射手'];
let currentRoute = 'start';
let configMode = 'local';
let currentConfigPlayer = 'player1';
let configLoadoutOpen = false;
let hoverRoleId = null;
let battleConfigs = null;

function isPveMode() {
  return configMode === 'pve' && (!networkManager || networkManager.mode === 'local');
}

function makeDefaultPlayerConfig(playerId, className) {
  const cls = className || (playerId === 'player1' ? '法师' : '战士');
  const roleId = getDefaultRoleId(cls);
  return normalizePlayerConfig({
    playerId,
    class: cls,
    roleId,
    loadoutSkillIds: getDefaultLoadout(cls),
    roleLoadoutSkillIds: getDefaultRoleLoadout(roleId),
    locked: false,
  }, playerId);
}

let configPlayers = {
  player1: makeDefaultPlayerConfig('player1', '法师'),
  player2: makeDefaultPlayerConfig('player2', '战士'),
};

function cloneConfig(config) {
  return {
    playerId: config.playerId,
    class: config.class,
    roleId: config.roleId,
    loadoutSkillIds: [...config.loadoutSkillIds],
    roleLoadoutSkillIds: [...(config.roleLoadoutSkillIds || [])],
    locked: Boolean(config.locked),
  };
}

function setRoute(route) {
  currentRoute = route;
  document.getElementById('start-screen').style.display = route === 'start' ? 'flex' : 'none';
  document.getElementById('config-screen').style.display = route === 'config' ? 'grid' : 'none';
  document.getElementById('app').style.display = route === 'battle' ? 'grid' : 'none';
}

function showConfigScreen(mode) {
  configMode = mode || configMode || 'local';
  battleSession.resetForConfigScreen();
  if (configMode === 'p2p' && networkManager?.myPlayerId) {
    currentConfigPlayer = networkManager.myPlayerId;
  }
  for (const pid of ['player1', 'player2']) {
    configPlayers[pid].locked = false;
  }
  document.getElementById('gameover-panel').classList.remove('show');
  setRoute('config');
  renderConfigScreen();
  sendConfigUpdate();
}

function activeConfig() {
  return configPlayers[currentConfigPlayer];
}

function isConfigEditable(playerId = currentConfigPlayer) {
  if (configMode === 'local' || configMode === 'pve') return true;
  return networkManager?.myPlayerId === playerId;
}

function getOpponentPlayerId(playerId) {
  return playerId === 'player1' ? 'player2' : 'player1';
}

function setActiveClass(className) {
  const cfg = activeConfig();
  if (!isConfigEditable() || cfg.locked) return;
  configPlayers[currentConfigPlayer] = makeDefaultPlayerConfig(currentConfigPlayer, className);
  hoverRoleId = null;
  renderConfigScreen();
  sendConfigUpdate();
}

function setActiveRole(roleId) {
  const cfg = activeConfig();
  const role = ROLE_DEFS[roleId];
  if (!role || role.class !== cfg.class || !isConfigEditable() || cfg.locked) return;
  cfg.roleId = roleId;
  cfg.roleLoadoutSkillIds = getDefaultRoleLoadout(roleId);
  hoverRoleId = roleId;
  renderConfigScreen();
  sendConfigUpdate();
}

function shiftRole(delta) {
  const cfg = activeConfig();
  const roles = getRolesByClass(cfg.class);
  const idx = Math.max(0, roles.findIndex(r => r.id === cfg.roleId));
  const next = roles[(idx + delta + roles.length) % roles.length];
  if (next) setActiveRole(next.id);
}

function toggleLoadoutSkill(skillId, poolType) {
  const cfg = activeConfig();
  if (!isConfigEditable() || cfg.locked) return;
  if (poolType === 'role') return toggleRoleLoadoutSkill(skillId);
  const existing = cfg.loadoutSkillIds.indexOf(skillId);
  if (existing >= 0) {
    cfg.loadoutSkillIds.splice(existing, 1);
  } else if (cfg.loadoutSkillIds.length < LOADOUT_SIZE) {
    cfg.loadoutSkillIds.push(skillId);
  }
  renderConfigScreen();
  sendConfigUpdate();
}

function toggleRoleLoadoutSkill(skillId) {
  const cfg = activeConfig();
  if (!isConfigEditable() || cfg.locked) return;
  if (!cfg.roleLoadoutSkillIds) cfg.roleLoadoutSkillIds = [];
  const existing = cfg.roleLoadoutSkillIds.indexOf(skillId);
  if (existing >= 0) {
    cfg.roleLoadoutSkillIds.splice(existing, 1);
  } else if (cfg.roleLoadoutSkillIds.length < ROLE_LOADOUT_SIZE) {
    cfg.roleLoadoutSkillIds.push(skillId);
  }
  renderConfigScreen();
  sendConfigUpdate();
}

function removeLoadoutAt(index, poolType) {
  const cfg = activeConfig();
  if (!isConfigEditable() || cfg.locked) return;
  if (poolType === 'role') {
    if (!cfg.roleLoadoutSkillIds) return;
    cfg.roleLoadoutSkillIds.splice(index, 1);
  } else {
    cfg.loadoutSkillIds.splice(index, 1);
  }
  renderConfigScreen();
  sendConfigUpdate();
}

function renderConfigScreen() {
  const cfg = activeConfig();
  const editable = isConfigEditable();
  const role = ROLE_DEFS[hoverRoleId] || ROLE_DEFS[cfg.roleId];

  renderConfigScreenView({
    classes: CLASSES,
    cfg,
    role,
    configMode,
    roomCode: networkManager?.roomCode || '',
    currentConfigPlayer,
    configPlayers,
    configLoadoutOpen,
    editable,
    portraitCacheVersion: PORTRAIT_CACHE_VERSION,
    callbacks: {
      onClassSelect: setActiveClass,
      onRoleSelect: (roleId) => {
        hoverRoleId = null;
        setActiveRole(roleId);
      },
      onRoleHover: (roleId) => {
        hoverRoleId = roleId;
      },
      onSkillToggle: toggleLoadoutSkill,
      onSlotRemove: removeLoadoutAt,
    },
  });
}

// Config screen view functions moved to ui/config/ConfigScreenView.js.
// getRolePortrait kept here for preloader use.

function getBattlePlayerConfigs() {
  return [cloneConfig(configPlayers.player1), cloneConfig(configPlayers.player2)];
}

const startBattleFromConfigs = (seed = Date.now(), players = getBattlePlayerConfigs()) => {
  battleConfigs = players.map(cloneConfig);
  battleSession.startBattleFromConfigs(seed, players);
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待提交...';
  document.getElementById('log').innerHTML = '';
  battleSession.clearTurnTimeout();
  battleSession.startTurnTimeout();
};

function sendConfigUpdate() {
  if (!networkManager || networkManager.mode === 'local' || !networkManager.myPlayerId) return;
  const cfg = cloneConfig(configPlayers[networkManager.myPlayerId]);
  networkManager.sendMessage({ type: 'CONFIG_UPDATE', config: cfg });
}

function sendConfigLock() {
  if (!networkManager || networkManager.mode === 'local' || !networkManager.myPlayerId) return;
  const cfg = configPlayers[networkManager.myPlayerId];
  networkManager.sendMessage({ type: 'CONFIG_LOCK', playerId: cfg.playerId, locked: cfg.locked });
}

function maybeStartP2PBattle() {
  if (!networkManager || networkManager.myPlayerId !== 'player1') return;
  if (currentRoute !== 'config') return;
  if (!configPlayers.player1.locked || !configPlayers.player2.locked) return;
  const seed = Date.now();
  const players = getBattlePlayerConfigs();
  networkManager.sendMessage({ type: 'BATTLE_START', seed, players });
  startBattleFromConfigs(seed, players);
}

// BATTLE_END listener moved to BattleSessionController (calls showGameOverPanel callback)

// --- Galaxy sub-phase (state moved to BattleSessionController) ---

engine.eventBus.on('GALAXY_SUBPHASE_START', (data) => {
  const started = battleSession.startGalaxySubphase(data.charIds);
  if (!started) return;
});

engine.eventBus.on('GALAXY_ACTION_PROMPT', (data) => {
  if (battleSession.promptGalaxyAction(data)) showGalaxyPanel();
});

engine.eventBus.on('GALAXY_SUBPHASE_END', () => {
  battleSession.endGalaxySubphase();
  hideGalaxyPanel();
});

function showGalaxyPanel() {
  if (!battleSession.galaxyCharId) return;
  const char = engine.registry.get(battleSession.galaxyCharId);
  if (!char) return;

  document.getElementById('galaxy-hint').textContent =
    `行动 ${battleSession.galaxyActionIndex + 1}/${battleSession.galaxyActionTotal}`;
  const stateChar = engine.getState().characters.find(c => c.id === battleSession.galaxyCharId);
  const skillIds = stateChar?.skills?.map(s => s.id) || SKILLS_BY_CLASS[char.class] || [];
  const skills = skillIds.filter(sid => {
    const skill = SKILLS[sid];
    return skill && !skill.hidden;
  }).map(sid => {
    const skill = SKILLS[sid];
    return `<button class="skill-btn" data-skill="${sid}" title="${skill.desc || ''}">${skill.name}</button>`;
  }).join('');
  document.getElementById('galaxy-skills').innerHTML = skills || '<span style="color:#888">无可用技能</span>';
  document.getElementById('btn-galaxy-confirm').disabled = true;

  document.querySelectorAll('#galaxy-skills .skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#galaxy-skills .skill-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      battleSession.selectGalaxySkill(btn.dataset.skill);
      document.getElementById('btn-galaxy-confirm').disabled = false;
    });
  });

  document.getElementById('galaxy-overlay').classList.add('show');
}

function hideGalaxyPanel() {
  document.getElementById('galaxy-overlay').classList.remove('show');
}

document.getElementById('btn-galaxy-confirm').addEventListener('click', () => {
  if (!battleSession.galaxySelectedSkill) return;
  const skill = SKILLS[battleSession.galaxySelectedSkill];
  if (!skill) return;

  const targetingType = battleSession.prepareGalaxyTargeting(battleSession.galaxySelectedSkill);

  if (targetingType === 'self') {
    // Self-targeting: submit immediately
    battleSession.submitGalaxyTarget(null, networkManager);
    hideGalaxyPanel();
  } else {
    // Needs target: hide panel, show valid hexes on board
    hideGalaxyPanel();
    document.getElementById('submit-status').textContent = `银河远征: 点击棋盘选择 ${skill.name} 的目标`;
    renderAll();
  }
});

document.getElementById('btn-galaxy-skip').addEventListener('click', () => {
  battleSession.skipGalaxyAction(networkManager);
  hideGalaxyPanel();
});

// --- Start screen / lobby / tutorial — managed by ui/start/StartLobbyController.js ---
// Old button bindings, showTutorial, hideTutorial, updateHostStatus, updateJoinStatus,
// resetConnectionUI migrated to StartLobbyController. Business logic stays here via callbacks.

// (P2P button, create/join room handlers migrated to StartLobbyController)
// initStartLobbyController called below

// create-room / join-room handlers migrated to StartLobbyController

// join-room handler migrated to StartLobbyController

const startLobbyUi = initStartLobbyController({
  defaultAddr: isNgrok ? window.location.host : '120.77.178.15:8088',
  callbacks: {
    onStartLocal() {
      networkManager = null; configMode = 'local'; currentConfigPlayer = 'player1';
      configPlayers.player1 = makeDefaultPlayerConfig('player1', configPlayers.player1.class || '法师');
      configPlayers.player2 = makeDefaultPlayerConfig('player2', configPlayers.player2.class || '战士');
      document.getElementById('mode-badge').textContent = '本地'; document.getElementById('mode-badge').className = 'local';
      document.getElementById('conn-indicator').style.display = 'none';
      document.getElementById('p1-class-select').style.display = 'none'; document.getElementById('p2-class-select').style.display = 'none';
      document.getElementById('btn-start').style.display = 'none'; document.getElementById('btn-reset').style.display = '';
      showConfigScreen('local');
    },
    onStartPve() {
      networkManager = null; configMode = 'pve'; currentConfigPlayer = 'player1';
      configPlayers.player1 = makeDefaultPlayerConfig('player1', configPlayers.player1.class || '法师');
      configPlayers.player2 = makeDefaultPlayerConfig('player2', configPlayers.player2.class || '战士');
      document.getElementById('mode-badge').textContent = 'PVE'; document.getElementById('mode-badge').className = 'local';
      document.getElementById('conn-indicator').style.display = 'none';
      document.getElementById('p1-class-select').style.display = 'none'; document.getElementById('p2-class-select').style.display = 'none';
      document.getElementById('btn-start').style.display = 'none'; document.getElementById('btn-reset').style.display = '';
      showConfigScreen('pve');
    },
    onBackStart() { if (networkManager) { networkManager.disconnect(); networkManager = null; } },
    async onCreateRoom({ serverAddr, ui }) {
      const signalingUrl = serverAddr.match(/^wss?:\/\//) ? serverAddr : (isNgrok ? `wss://${serverAddr}` : `ws://${serverAddr}`);
      const nm = new NetworkManager({ onStatusChange: (s) => { if (s.roomCode) { ui.showRoomCode(s.roomCode); ui.updateHostStatus('connecting', '等待对手加入...'); } if (s.status === 'connected') { ui.updateHostStatus('connected', '已连接！'); startP2PGame(nm); } if (s.error) { ui.setRoomError(s.error); ui.updateHostStatus('disconnected', '错误'); nm.disconnect(); } }, onDisconnect: (reason) => showDisconnect(reason), onRemoteSubmitted: (action) => battleSession.handleRemoteAction(nm, action), onRemoteReady: () => battleSession.updateSubmitStatus(nm), onReady: () => battleSession.executeP2PTurn(nm, { animateTurn }), onClassPick: () => {}, onGalaxyAction: (charId, skillId, targetPos) => { engine.submitGalaxyAction(skillId, targetPos); }, onMessage: (payload) => handleNetworkMessage(payload), }, signalingUrl);
      networkManager = nm; try { await nm.createRoom(); } catch (e) { ui.setRoomError('连接服务器失败'); ui.updateHostStatus('disconnected', '连接失败'); networkManager = null; }
    },
    async onJoinRoom({ roomCode, serverAddr, ui }) {
      const signalingUrl = serverAddr.match(/^wss?:\/\//) ? serverAddr : (isNgrok ? `wss://${serverAddr}` : `ws://${serverAddr}`);
      const nm = new NetworkManager({ onStatusChange: (s) => { if (s.status === 'connected') { ui.updateJoinStatus('connected', '已连接！'); startP2PGame(nm); } if (s.error) { ui.setRoomError(s.error); ui.updateJoinStatus('disconnected', '错误'); nm.disconnect(); } }, onDisconnect: (reason) => showDisconnect(reason), onRemoteSubmitted: (action) => battleSession.handleRemoteAction(nm, action), onRemoteReady: () => battleSession.updateSubmitStatus(nm), onReady: () => battleSession.executeP2PTurn(nm, { animateTurn }), onClassPick: () => {}, onGalaxyAction: (charId, skillId, targetPos) => { engine.submitGalaxyAction(skillId, targetPos); }, onMessage: (payload) => handleNetworkMessage(payload), }, signalingUrl);
      networkManager = nm; try { await nm.joinRoom(roomCode); } catch (e) { ui.setRoomError('连接服务器失败'); ui.updateJoinStatus('disconnected', '连接失败'); networkManager = null; }
    },
  },
});

// updateHostStatus, updateJoinStatus, resetConnectionUI migrated to StartLobbyController

document.querySelectorAll('#config-player-switch button').forEach(btn => {
  btn.addEventListener('click', () => {
    currentConfigPlayer = btn.dataset.player;
    hoverRoleId = null;
    renderConfigScreen();
  });
});

// role-prev / role-next removed — replaced by vertical role list
document.getElementById('btn-toggle-loadout').addEventListener('click', () => {
  configLoadoutOpen = !configLoadoutOpen;
  renderConfigScreen();
});
document.getElementById('btn-config-lock').addEventListener('click', () => {
  const cfg = activeConfig();
  if (!isConfigEditable(cfg.playerId)) return;
  const ownClassOk = validateLoadout(cfg.class, cfg.loadoutSkillIds).ok && cfg.loadoutSkillIds.length === LOADOUT_SIZE;
  const ownRoleOk = validateRoleLoadout(cfg.roleId, cfg.roleLoadoutSkillIds || []).ok && (cfg.roleLoadoutSkillIds || []).length === ROLE_LOADOUT_SIZE;
  const ownOk = ownClassOk && ownRoleOk;
  if (!cfg.locked && !ownOk) return;
  cfg.locked = !cfg.locked;
  renderConfigScreen();
  sendConfigLock();
  maybeStartP2PBattle();
});
document.getElementById('btn-config-start').addEventListener('click', () => {
  const pveReady = configMode === 'pve' && configPlayers.player1.locked;
  const localReady = configPlayers.player1.locked && configPlayers.player2.locked;
  if (!pveReady && !localReady) return;
  startBattleFromConfigs(Date.now(), getBattlePlayerConfigs());
});
document.getElementById('btn-config-back').addEventListener('click', () => {
  if (networkManager) { networkManager.disconnect(); networkManager = null; }
  setRoute('start');
  startLobbyUi.hideRoomSetup();
  startLobbyUi.resetConnectionUI();
});

function startP2PGame(nm) {
  document.getElementById('gameover-panel').classList.remove('show');
  battleSession.resetForConfigScreen();
  configMode = 'p2p';
  currentConfigPlayer = nm.myPlayerId;
  // Reset all rematch/class-pick state for fresh connection
  remoteClassPick = null;
  pendingRemoteRematchClass = null;
  opponentReadyForRematch = false;
  pendingMyClass = null;
  document.getElementById('mode-badge').textContent = '联机 ' + (nm.roomCode || '');
  document.getElementById('mode-badge').className = 'online';
  document.getElementById('conn-indicator').style.display = '';
  document.getElementById('p1-class-select').style.display = 'none';
  document.getElementById('p2-class-select').style.display = 'none';
  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('btn-reset').style.display = 'none';

  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待配置...';
  document.getElementById('log').innerHTML = '';
  showConfigScreen('p2p');
}

let remoteClassPick = null;
let battleSeed = 0;         // host generates from Date.now(), shared via CLASS_PICK
let pendingMyClass = null; // for rematch: stored myClass when waiting for opponent
let pendingRemoteRematchClass = null; // CLASS_PICK from opponent that arrived while our game still active
let opponentReadyForRematch = false; // true when opponent already clicked rematch (shown in gameover UI)

function onClassPick(nm, remoteClass, seed = 0) {
  const gameoverShown = document.getElementById('gameover-panel').classList.contains('show');
  // Premature rematch: our game still running, opponent's game ended first.
  if (!gameoverShown && battleSession.battleActive) {
    pendingRemoteRematchClass = remoteClass;
    return;
  }
  remoteClassPick = remoteClass;
  if (seed) battleSeed = seed;
  // Opponent clicked first while we're in game-over screen — show indicator
  if (gameoverShown && !pendingMyClass) {
    opponentReadyForRematch = true;
    updateRematchButton();
    return;
  }
  // Both sides have clicked: start the game
  const myClass = pendingMyClass || document.getElementById('p2p-class-select').value;
  // If we already clicked (premature sender), re-send our class so the other
  // side gets a fresh CLASS_PICK while their game-over is showing
  if (pendingMyClass) {
    nm.sendClassPick(myClass, battleSeed);
  }
  pendingMyClass = null;
  opponentReadyForRematch = false;
  tryInitWithClasses(nm, myClass);
}

function tryInitWithClasses(nm, myClass) {
  if (!remoteClassPick) return;
  const myId = nm.myPlayerId;
  const p1Class = myId === 'player1' ? myClass : remoteClassPick;
  const p2Class = myId === 'player2' ? myClass : remoteClassPick;
  remoteClassPick = null; // reset for reconnection
  battleSession.initGame(p1Class, p2Class, battleSeed);
  battleSeed = 0; // reset for next game
  document.getElementById('submit-status').textContent = '等待双方提交...';
  battleSession.startTurnTimeout();
}

function showDisconnect(reason) {
  document.getElementById('disconnect-reason').textContent =
    reason === 'peer_left' ? '对手离开了游戏' :
    reason === 'timeout' ? '连接超时' :
    reason === 'connection_lost' ? '网络连接中断' : '连接已断开';
  document.getElementById('disconnect-overlay').classList.add('show');
}

function returnToStart() {
  battleSession.resetForReturnToStart();
  remoteClassPick = null;
  pendingRemoteRematchClass = null;
  opponentReadyForRematch = false;
  if (networkManager) { networkManager.disconnect(); networkManager = null; }
  document.getElementById('disconnect-overlay').classList.remove('show');
  document.getElementById('gameover-panel').classList.remove('show');
  setRoute('start');
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('room-code-text').style.display = 'none';
  document.getElementById('p2p-class-pick').style.display = 'none';
  document.getElementById('room-host-section').style.display = 'block';
  document.getElementById('room-join-section').style.display = 'block';
  document.getElementById('conn-indicator').style.display = 'none';
  startLobbyUi.resetConnectionUI();
}
window.returnToStart = returnToStart;

function updateRematchButton() {
  const btn = document.getElementById('btn-rematch');
  if (opponentReadyForRematch) {
    btn.textContent = '对手已准备，重新开始';
  } else {
    btn.textContent = '重新开始';
  }
}

function showGameOver(winner) {
  battleSession.clearTurnTimeout();
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '战斗已结束';
  const winnerText = winner === 'player1' ? '玩家1' : winner === 'player2' ? '玩家2' : '平局';
  document.getElementById('gameover-winner').textContent = `胜者: ${winnerText}`;
  document.getElementById('rematch-class-p1').value = battleSession.player1Class;
  document.getElementById('rematch-class-p2').value = battleSession.player2Class;
  document.getElementById('btn-rematch').disabled = false;
  updateRematchButton();

  document.getElementById('go-p1-pick').style.display = 'none';
  document.getElementById('go-p2-pick').style.display = 'none';

  document.getElementById('gameover-panel').classList.add('show');
}

// Rematch button
document.getElementById('btn-rematch').addEventListener('click', () => {
  const isP2P = networkManager && networkManager.mode !== 'local';
  const wasPve = isPveMode();
  document.getElementById('gameover-panel').classList.remove('show');
  battleSession.resetForConfigScreen();
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待配置...';
  document.getElementById('log').innerHTML = '';
  battleSession.clearTurnTimeout();
  showConfigScreen(isP2P ? 'p2p' : (wasPve ? 'pve' : 'local'));
});

// Return to lobby button
document.getElementById('btn-lobby').addEventListener('click', () => {
  document.getElementById('gameover-panel').classList.remove('show');
  returnToStart();
});

// [moved to BattleSessionController] battleSession.startTurnTimeout

// [moved to BattleSessionController] battleSession.clearTurnTimeout

// [moved to BattleSessionController] battleSession.getMyCharacterIds

// [moved to BattleSessionController] battleSession.isMyCharacter

// [moved to BattleSessionController] battleSession.getCharacterState

// [moved to BattleSessionController] battleSession.getPreviewOrigin

// [moved to BattleSessionController] battleSession.clearPlannedActions

// [moved to BattleSessionController] battleSession.canSubmitForChar

// [moved to BattleSessionController] battleSession.isRequiredActionReady

// [moved to BattleSessionController] battleSession.hasOptionalActionAvailable

// [moved to BattleSessionController] battleSession.areMyRequiredActionsReady

// [moved to BattleSessionController] battleSession.hasAnyMyOptionalActionAvailable

// [moved to BattleSessionController] battleSession.markP2PReady

// [moved to BattleSessionController] battleSession.maybeAutoReadyP2P

// [moved to BattleSessionController] battleSession.updateSubmitStatus

// --- Setup (player1Class/player2Class moved to BattleSessionController) ---

// [moved to BattleSessionController] battleSession.initGame

// --- Skill selection ---
// [moved to BattleSessionController] battleSession.selectSkill

// View opponent skill range without allowing submission
// [moved to BattleSessionController] battleSession.viewOpponentSkill

// --- Skill effect area preview (LoL-style hover indicator) ---
function simulateDash(fromPos, targetPos, eff) {
  const away = eff.direction === 'AWAY_FROM_TARGET';
  const steps = eff.distance || 1;

  let dirQ, dirR;
  if (away) {
    const line = hexLine(targetPos.q, targetPos.r, fromPos.q, fromPos.r);
    if (line.length < 2) return { q: fromPos.q, r: fromPos.r };
    dirQ = line[1][0] - line[0][0];
    dirR = line[1][1] - line[0][1];
  } else {
    const line = hexLine(fromPos.q, fromPos.r, targetPos.q, targetPos.r);
    if (line.length < 2) return { q: fromPos.q, r: fromPos.r };
    dirQ = line[1][0] - line[0][0];
    dirR = line[1][1] - line[0][1];
  }

  let curQ = fromPos.q, curR = fromPos.r;
  for (let s = 0; s < steps; s++) {
    const nq = curQ + dirQ, nr = curR + dirR;
    if (!isOnBoard(nq, nr)) break;
    curQ = nq; curR = nr;
  }
  return { q: curQ, r: curR };
}

function computeEffectArea(skill, charPos, hoveredTarget, rangeOverride = null) {
  const area = new Set();
  let simPos = { q: charPos.q, r: charPos.r };

  for (const eff of skill.effects) {
    switch (eff.cmd) {
      case 'ATTACK_PROJECTILE':
      case 'ATTACK_AOE_PATH': {
        const line = hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
        for (const [q, r] of line) area.add(`${q},${r}`);
        break;
      }
      case 'ATTACK_MELEE': {
        const dist = hexDistance(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
        if (dist <= (eff.range || 1)) area.add(`${hoveredTarget.q},${hoveredTarget.r}`);
        break;
      }
      case 'ATTACK_AOE_SELF':
      case 'REACTIVE_ARMOR': {
        const hexes = hexSpiral(simPos.q, simPos.r, eff.radius || 1);
        for (const [q, r] of hexes) area.add(`${q},${r}`);
        break;
      }
      case 'SPAWN_STATIONARY_AOE': {
        const center = (skill.targeting.shape === 'HEX' || skill.targeting.shape === 'FAN')
          ? hoveredTarget : simPos;
        const hexes = hexSpiral(center.q, center.r, eff.radius || 1);
        for (const [q, r] of hexes) area.add(`${q},${r}`);
        break;
      }
      case 'ATTACK_AOE_TARGET': {
        const hexes = hexSpiral(hoveredTarget.q, hoveredTarget.r, eff.radius || 1);
        for (const [q, r] of hexes) area.add(`${q},${r}`);
        break;
      }
      case 'ATTACK_LINE': {
        const fwdLine = hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
        // Forward: hexLine from caster through target, projectile starts from self
        for (const [q, r] of fwdLine) {
          area.add(`${q},${r}`);
        }
        // Reverse: opposite direction from caster to board edge
        if (fwdLine.length >= 2) {
          const dq = fwdLine[1][0] - fwdLine[0][0];
          const dr = fwdLine[1][1] - fwdLine[0][1];
          let curQ = simPos.q, curR = simPos.r;
          for (let i = 0; i < 10; i++) {
            curQ -= dq; curR -= dr;
            if (!isOnBoard(curQ, curR)) break;
            area.add(`${curQ},${curR}`);
          }
        }
        break;
      }
      case 'MOVE_DASH': {
        simPos = simulateDash(simPos, hoveredTarget, eff);
        area.add(`${simPos.q},${simPos.r}`);
        break;
      }
      case 'MOVE_GRAPNEL': {
        const path = hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
        for (const [pq, pr] of path) {
          const nearby = hexSpiral(pq, pr, 1);
          for (const [nq, nr] of nearby) area.add(`${nq},${nr}`);
        }
        simPos = { q: hoveredTarget.q, r: hoveredTarget.r };
        break;
      }
      case 'MOVE_TELEPORT': {
        if (eff.target === 'BEHIND_TARGET') {
          const line = hexLine(simPos.q, simPos.r, hoveredTarget.q, hoveredTarget.r);
          const behindDirQ = line.length >= 2 ? line[1][0] - line[0][0] : 0;
          const behindDirR = line.length >= 2 ? line[1][1] - line[0][1] : 0;
          simPos = { q: hoveredTarget.q + behindDirQ, r: hoveredTarget.r + behindDirR };
        } else {
          simPos = { q: hoveredTarget.q, r: hoveredTarget.r };
        }
        area.add(`${simPos.q},${simPos.r}`);
        break;
      }
      case 'MOVE_WALK': {
        simPos = { q: hoveredTarget.q, r: hoveredTarget.r };
        area.add(`${simPos.q},${simPos.r}`);
        break;
      }
      case 'MOVE_PULL': {
        if (eff.target === 'FAN_AREA') {
          const sectorRange = rangeOverride ?? skill.targeting?.range ?? 3;
          const sectorHexes = getSectorHexes(charPos.q, charPos.r, hoveredTarget.q, hoveredTarget.r, sectorRange);
          for (const [q, r] of sectorHexes) area.add(`${q},${r}`);
        } else {
          area.add(`${hoveredTarget.q},${hoveredTarget.r}`);
          area.add(`${charPos.q},${charPos.r}`);
        }
        break;
      }
      case 'CREATE_GATE': {
        area.add(`${hoveredTarget.q},${hoveredTarget.r}`);
        break;
      }
      case 'CREATE_FORMATION': {
        const hexes = hexSpiral(hoveredTarget.q, hoveredTarget.r, 1);
        for (const [q, r] of hexes) area.add(`${q},${r}`);
        break;
      }
      case 'APPLY_STATUS': {
        if (eff.status === 'METEOR_ASCENDING') {
          const hexes = hexSpiral(hoveredTarget.q, hoveredTarget.r, 1);
          for (const [q, r] of hexes) area.add(`${q},${r}`);
        }
        break;
      }
    }
  }

  return [...area].map(k => { const [q, r] = k.split(',').map(Number); return { q, r }; });
}

function getCharactersAtHex(q, r) {
  return engine.getState().characters.filter(c =>
    c.alive !== false && c.position?.q === q && c.position?.r === r
  );
}
function getCharacterAtHex(q, r) {
  const chars = getCharactersAtHex(q, r);
  return chars[0] || null;
}

// Canvas click handler moved to ui/battle/BattleInputController.js

// [moved to BattleSessionController] battleSession.submitAction

// --- Execute turn ---
// [moved to BattleSessionController] battleSession.getPveAiCharacterId

// [moved to BattleSessionController] battleSession.submitAiAndExecutePveTurn

// [moved to BattleSessionController] battleSession.executeLocalTurn

document.getElementById('btn-execute').addEventListener('click', async () => {
  if (networkManager && networkManager.mode !== 'local') {
    battleSession.markP2PReady(networkManager);
    return;
  }
  if (isPveMode()) {
    await battleSession.submitAiAndExecutePveTurn();
    return;
  }
  await battleSession.executeLocalTurn();
});

// --- Reset ---
document.getElementById('btn-reset').addEventListener('click', () => {
  if (battleConfigs) {
    startBattleFromConfigs(Date.now(), battleConfigs);
  } else {
    startBattleFromConfigs(Date.now(), getBattlePlayerConfigs());
  }
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待提交...';
  document.getElementById('log').innerHTML = '';
  battleSession.clearTurnTimeout();
  battleSession.startTurnTimeout();
});

// --- Turn animation ---
async function animateTurn() {
  const keyframes = engine.projectileCalculator.generateKeyframes();
  const animEvents = engine.projectileCalculator.getAnimEvents();
  const projs = engine.projectileCalculator.projectiles;
  if (keyframes.length === 0 && animEvents.length === 0 && projs.length === 0) return;

  const maxStep = Math.max(
    keyframes.reduce((max, kf) => Math.max(max, kf.step || 0), 0),
    animEvents.reduce((max, e) => Math.max(max, (e.step || 0) + (e.duration || 1) - 1), 0)
  );
  const SUBFRAMES = 4;
  const frameMs = 25;

  for (let s = 0; s <= maxStep; s++) {
    const startSub = (s === 0) ? 0 : 1;
    for (let sub = startSub; sub <= SUBFRAMES; sub++) {
      const t = sub / SUBFRAMES;
      await sleep(frameMs);
      renderAll(s, t);
    }
  }
  await sleep(200);
  renderAll(-1, 0);
  engine.projectileCalculator.clearAnimEvents();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Rendering ---
function renderAll(animStep = -1, subT = 0) {
  renderBoard(animStep, subT);
  renderPanels();
  renderLog();
  document.getElementById('turn-num').textContent = engine.turnManager.turnNumber;
  const phase = engine.turnManager.phase;
  const phaseEl = document.getElementById('phase-text');
  phaseEl.textContent = phase;
  if (phase === 'EXECUTE') {
    phaseEl.style.color = '#e05555';
    phaseEl.style.animation = 'phase-pulse 0.6s ease-in-out';
  } else {
    phaseEl.style.color = '#DDBB99';
    phaseEl.style.animation = 'none';
  }
}

function renderBoard(animStep = -1, subT = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 1000);
  const projs = engine.projectileCalculator.projectiles;
  const keyframes = engine.projectileCalculator.generateKeyframes();
  const state = engine.getState();

  // Pre-compute animation data from keyframes (projectiles may be dead/gone after resolution)
  const projPositions = new Map(); // projId → { q, r, alive, isMelee, power, fromQ, fromR, toQ, toR }
  const hitEvents = []; // { q, r, power, isMelee, age }
  const slashEvents = []; // { fromQ, fromR, toQ, toR, power, progress }

  // Group keyframes by projectileId
  const kfGroups = new Map();
  for (const kf of keyframes) {
    if (!kfGroups.has(kf.projectileId)) kfGroups.set(kf.projectileId, []);
    kfGroups.get(kf.projectileId).push(kf);
  }

  if (animStep >= 0) {
    for (const [projId, kfs] of kfGroups) {
      kfs.sort((a, b) => a.step - b.step);
      const firedKf = kfs.find(k => k.event === 'fired');
      if (!firedKf) continue;
      const isMelee = firedKf.flags?.includes('MELEE') || false;
      const power = firedKf.power || 0;
      const fromQ = firedKf.fromQ, fromR = firedKf.fromR;
      const toQ = firedKf.toQ, toR = firedKf.toR;

      // Find current position keyframe
      let curKf = null, nextKf = null;
      for (let i = kfs.length - 1; i >= 0; i--) {
        if (kfs[i].step <= animStep) { curKf = kfs[i]; nextKf = kfs[i + 1] || null; break; }
      }
      if (!curKf && kfs.length > 0) { curKf = kfs[0]; nextKf = kfs[1] || null; }
      if (!curKf) continue;

      // Interpolated position
      let iq = curKf.q, ir = curKf.r;
      if (nextKf && nextKf.q !== undefined) {
        iq = curKf.q + (nextKf.q - curKf.q) * subT;
        ir = curKf.r + (nextKf.r - curKf.r) * subT;
      }

      // Alive based on keyframe timeline
      const bodyContactStep = kfs.find(k => k.event === 'body_contact')?.step ?? Infinity;
      const expiredStep = kfs.find(k => k.event === 'expired')?.step ?? Infinity;
      const deathStep = Math.min(bodyContactStep, expiredStep);
      const alive = animStep < deathStep || (animStep === deathStep && subT < 0.5);

      projPositions.set(projId, { q: iq, r: ir, alive, isMelee, power, fromQ, fromR, toQ, toR });

      // Hit / slash events at this animation step
      const stepEvents = kfs.filter(k => k.step === animStep);
      for (const evt of stepEvents) {
        if (evt.event === 'body_contact') {
          hitEvents.push({ q: evt.q, r: evt.r, power, isMelee, age: subT });
        }
      }
      if (isMelee) {
        for (const evt of stepEvents) {
          if (evt.event === 'fired') {
            slashEvents.push({ fromQ, fromR, toQ, toR, power, progress: subT });
          }
          if (evt.event === 'body_contact') {
            slashEvents.push({ fromQ, fromR, toQ: evt.q, toR: evt.r, power, progress: 1 });
          }
        }
      }
    }
  } else {
    // Static render: alive projectiles from arr
    for (const proj of projs) {
      if (!proj.alive) continue;
      const [q, r] = proj.path[proj.stepIndex];
      projPositions.set(proj.id, {
        q, r, alive: true, isMelee: proj.flags.includes('MELEE'), power: proj.power,
        fromQ: proj.fromQ, fromR: proj.fromR, toQ: proj.toQ, toR: proj.toR,
      });
    }
  }

  // --- Draw hex grid ---
  for (let q = -3; q <= 3; q++) {
    for (let r = -3; r <= 3; r++) {
      if (!isOnBoard(q, r)) continue;
      const [cx, cy] = hexCenter(q, r);
      const corners = hexCorners(cx, cy);

      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();

      const inEffectArea = battleSession.hoverEffectArea.some(t => t.q === q && t.r === r);
      const isValidTarget = battleSession.validTargets.some(t => t.q === q && t.r === r);
      const isHovered = battleSession.hoveredHex && battleSession.hoveredHex[0] === q && battleSession.hoveredHex[1] === r;

      if (inEffectArea) {
        ctx.fillStyle = `rgba(212,148,58,${0.35 + pulse * 0.15})`;
      } else if (isHovered && isValidTarget) {
        ctx.fillStyle = `rgba(221,187,153,${0.4 + pulse * 0.2})`;
      } else if (isValidTarget) {
        ctx.fillStyle = 'rgba(221,187,153,0.12)';
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
      } else {
        ctx.fillStyle = '#1e1d2a';
      }
      ctx.fill();

      if (isHovered && isValidTarget) {
        ctx.strokeStyle = `rgba(221,187,153,0.9)`;
        ctx.lineWidth = 2.5;
      } else if (inEffectArea) {
        ctx.strokeStyle = `rgba(212,148,58,${0.7 + pulse * 0.3})`;
        ctx.lineWidth = 1.8;
      } else if (isValidTarget) {
        ctx.strokeStyle = 'rgba(221,187,153,0.3)';
        ctx.lineWidth = 1.2;
      } else {
        ctx.strokeStyle = 'rgba(83,81,100,0.4)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();
    }
  }

  // --- Draw impact flashes (behind projectiles) ---
  for (const hit of hitEvents) {
    drawImpactEffect(hit.q, hit.r, hit.power, hit.isMelee, hit.age);
  }

  // --- Draw melee slash arcs ---
  for (const slash of slashEvents) {
    drawSlashArc(slash.fromQ, slash.fromR, slash.toQ, slash.toR, slash.power, slash.progress);
  }

  // --- Draw projectile trails ---
  for (const [projId, pos] of projPositions) {
    if (!pos.alive || pos.isMelee) continue;
    drawProjectileTrail(projId, pos, animStep, keyframes);
  }

  // --- Draw animation events (gather, dash, teleport, walk, grapple) ---
  if (animStep >= 0) {
    const animEvents = engine.projectileCalculator.getAnimEvents();
    for (const evt of animEvents) {
      const evtStart = evt.step;
      const evtEnd = evtStart + (evt.duration || 1);
      if (animStep < evtStart || animStep >= evtEnd) continue;
      const evtProgress = (animStep - evtStart + subT) / (evt.duration || 1);
      switch (evt.event) {
        case 'gather': drawGatherEffect(evt.q, evt.r, evt.color, evt.amount, evtProgress); break;
        case 'dash': drawDashTrail(evt.fromQ, evt.fromR, evt.toQ, evt.toR, evtProgress); break;
        case 'teleport': drawTeleportEffect(evt.fromQ, evt.fromR, evt.toQ, evt.toR, evtProgress); break;
        case 'walk': drawWalkTrail(evt.fromQ, evt.fromR, evt.toQ, evt.toR, evtProgress); break;
        case 'grapple': drawGrappleLine(evt.fromQ, evt.fromR, evt.toQ, evt.toR, evtProgress); break;
      }
    }
  }

  // --- Draw entities ---
  // Group characters by hex to split overlapping positions
  const charsByHex = new Map();
  const allChars = [];
  for (const e of engine.registry.entities()) {
    if (e.type === 'CHARACTER' && e.alive !== false) {
      allChars.push(e);
      const key = `${e.position.q},${e.position.r}`;
      if (!charsByHex.has(key)) charsByHex.set(key, []);
      charsByHex.get(key).push(e);
    }
  }

  // Compute offset positions for characters sharing a hex
  const charDrawPos = new Map(); // entityId -> {cx, cy}
  for (const [key, chars] of charsByHex) {
    const [hcx, hcy] = hexCenter(chars[0].position.q, chars[0].position.r);
    if (chars.length === 1) {
      charDrawPos.set(chars[0].id, { cx: hcx, cy: hcy });
    } else if (chars.length === 2) {
      charDrawPos.set(chars[0].id, { cx: hcx - 12, cy: hcy - 5 });
      charDrawPos.set(chars[1].id, { cx: hcx + 12, cy: hcy + 5 });
    } else {
      const r = 14;
      for (let i = 0; i < chars.length; i++) {
        const angle = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
        charDrawPos.set(chars[i].id, { cx: hcx + Math.cos(angle) * r, cy: hcy + Math.sin(angle) * r });
      }
    }
  }

  for (const e of engine.registry.entities()) {
    if (e.alive === false) continue;

    if (e.type === 'CHARACTER') {
      const pos = charDrawPos.get(e.id) || hexCenter(e.position.q, e.position.r);
      const cx = pos.cx, cy = pos.cy;
      const charColor = e.class === '法师' ? '#8b5cf6' : e.class === '战士' ? '#e05555' : '#d4943a';
      const charLabel = e.class === '法师' ? '法' : e.class === '战士' ? '战' : '射';

      // Hit flash: check if this character's hex is at a hit position
      let hitFlash = 0;
      for (const hit of hitEvents) {
        if (hit.q === e.position.q && hit.r === e.position.r) { hitFlash = 1 - hit.age; break; }
      }

      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      if (hitFlash > 0.3) {
        ctx.fillStyle = `rgba(255,255,255,${hitFlash})`;
      } else {
        ctx.fillStyle = charColor;
      }
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 + hitFlash * 3;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px "KaiTi","STKaiti",serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(charLabel, cx, cy);

      // p1/p2 badge
      const badge = e.ownerId === 'player1' ? '1P' : '2P';
      ctx.fillStyle = e.ownerId === 'player1' ? '#8b5cf6' : '#d4943a';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(badge, cx + 13, cy + 10);

      const pool = engine.resourceSystem.getAll(e.id);
      if (pool.shieldActive) {
        ctx.beginPath();
        ctx.arc(cx, cy, 23, 0, Math.PI * 2);
        ctx.strokeStyle = '#8b5cf6';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    if (e.type === 'GATE') {
      const [cx, cy] = hexCenter(e.position.q, e.position.r);
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(139,92,246,0.15)';
      ctx.fill();
      ctx.strokeStyle = '#8b5cf6';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (e.type === 'FORMATION') {
      const formation = engine.formationSystem.getFormation(e.id);
      const hexes = formation ? formation.coverageHexes : [[e.position.q, e.position.r]];
      for (const [hq, hr] of hexes) {
        const [hcx, hcy] = hexCenter(hq, hr);
        ctx.beginPath();
        ctx.arc(hcx, hcy, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(139,92,246,0.12)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(139,92,246,0.4)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // --- Draw weak point indicators (心眼) ---
  const dirVectors = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
  for (const e of state.characters) {
    if (e.alive === false) continue;
    const wp = e.buffs.find(b => b.statusType === 'WEAK_POINT');
    if (!wp || !wp.data?.directions) continue;
    const [cx, cy] = hexCenter(e.position.q, e.position.r);
    for (const d of wp.data.directions) {
      const [dq, dr] = dirVectors[d];
      const [nx, ny] = hexCenter(e.position.q + dq, e.position.r + dr);
      const ang = Math.atan2(ny - cy, nx - cx); // arrow points outward (from char toward neighbor)
      const dist = 10;
      const sx = cx + dist * Math.cos(ang);
      const sy = cy + dist * Math.sin(ang);
      // Arrowhead points toward neighbor
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + 7 * Math.cos(ang + 0.5), sy + 7 * Math.sin(ang + 0.5));
      ctx.lineTo(sx + 7 * Math.cos(ang - 0.5), sy + 7 * Math.sin(ang - 0.5));
      ctx.closePath();
      ctx.fillStyle = 'rgba(220,60,60,0.85)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(180,30,30,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // --- Draw projectiles (non-melee) ---
  for (const [projId, pos] of projPositions) {
    if (!pos.alive || pos.isMelee) continue;
    const [cx, cy] = hexCenter(pos.q, pos.r);
    const size = 5 + Math.min(10, pos.power / 50);

    // Glow
    ctx.beginPath();
    ctx.arc(cx, cy, size + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();

    // Core
    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, size);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.3, '#ffcc66');
    g.addColorStop(0.7, '#e05555');
    g.addColorStop(1, '#801010');
    ctx.fillStyle = g;
    ctx.fill();

    // Power label
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(pos.power), cx, cy - 14);
  }

  // --- Draw casings ---
  for (const c of state.casings) {
    const [cx, cy] = hexCenter(c.q, c.r);
    ctx.beginPath();
    ctx.arc(cx + 10, cy + 10, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#c9a96e';
    ctx.fill();
    ctx.fillStyle = '#1a1410';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(c.count, cx + 10, cy + 10);
  }

  // --- Draw wild bullets ---
  for (const wb of state.wildBullets) {
    const [cx, cy] = hexCenter(wb.q, wb.r);
    ctx.beginPath();
    ctx.arc(cx - 10, cy + 10, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#d4943a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f5eedc';
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('W', cx - 10, cy + 10);
  }

  // --- Draw submitted indicator ---
  for (const c of engine.registry.characters()) {
    if (c.alive === false) continue;
    if (battleSession.localSubmittedSet.has(c.id) || battleSession.remoteSubmittedSet.has(c.id)) {
      const [cx, cy] = hexCenter(c.position.q, c.position.r);
      const isLocal = battleSession.localSubmittedSet.has(c.id);
      ctx.fillStyle = isLocal ? '#5a9e7e' : '#7b9fff';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', cx, cy - 28);
    }
  }
}

// --- Visual effect helpers ---

function drawSlashArc(fromQ, fromR, toQ, toR, power, progress) {
  const [fx, fy] = hexCenter(fromQ, fromR);
  const [tx, ty] = hexCenter(toQ, toR);
  const midX = (fx + tx) / 2, midY = (fy + ty) / 2;
  const dx = tx - fx, dy = ty - fy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const perpX = -dy / (dist || 1), perpY = dx / (dist || 1);

  const alpha = progress < 0.5 ? progress * 2 : (1 - progress) * 2;
  const arcSize = 20 + power / 20;
  const thickness = 3 + power / 100;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Outer glow
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.quadraticCurveTo(midX + perpX * arcSize, midY + perpY * arcSize, tx, ty);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = thickness + 6;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Inner bright arc
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.quadraticCurveTo(midX + perpX * arcSize * 0.7, midY + perpY * arcSize * 0.7, tx, ty);
  ctx.strokeStyle = 'rgba(255,220,150,0.9)';
  ctx.lineWidth = thickness;
  ctx.stroke();

  // Core white arc
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.quadraticCurveTo(midX + perpX * arcSize * 0.5, midY + perpY * arcSize * 0.5, tx, ty);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = Math.max(1, thickness - 1);
  ctx.stroke();

  ctx.restore();
}

function drawImpactEffect(q, r, power, isMelee, age) {
  const [cx, cy] = hexCenter(q, r);
  const alpha = 1 - age;
  if (alpha <= 0) return;

  const baseRadius = 10 + power / 30;
  const ringCount = isMelee ? 2 : 1;

  ctx.save();
  ctx.globalAlpha = alpha;

  for (let i = 0; i < ringCount; i++) {
    const r1 = baseRadius + age * 35 + i * 8;
    const r2 = baseRadius + age * 20 + i * 5;
    if (r1 < 50) {
      // Expanding shock ring
      ctx.beginPath();
      ctx.arc(cx, cy, r1, 0, Math.PI * 2);
      ctx.strokeStyle = isMelee ? 'rgba(255,200,100,0.7)' : 'rgba(255,150,80,0.6)';
      ctx.lineWidth = 3 - age * 2;
      ctx.stroke();
    }

    // Inner filled circle
    ctx.beginPath();
    ctx.arc(cx, cy, r2, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, isMelee ? 'rgba(255,220,120,0.5)' : 'rgba(255,180,60,0.4)');
    g.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }

  // Spark particles
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + age * 2;
    const dist = age * 30 + 5;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    const sparkSize = 2 - age * 1.5;
    if (sparkSize > 0.3) {
      ctx.beginPath();
      ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,240,200,${alpha})`;
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawProjectileTrail(projId, pos, animStep, keyframes) {
  if (animStep < 1) return;
  const projKfs = keyframes.filter(k => k.projectileId === projId).sort((a, b) => a.step - b.step);

  for (let i = 1; i <= Math.min(3, animStep); i++) {
    const kfIdx = animStep - i;
    let trailQ, trailR;
    if (kfIdx >= 0 && kfIdx < projKfs.length) {
      trailQ = projKfs[kfIdx].q;
      trailR = projKfs[kfIdx].r;
    } else if (pos.prevQ !== undefined) {
      trailQ = pos.prevQ; trailR = pos.prevR;
    } else continue;

    const [cx, cy] = hexCenter(trailQ, trailR);
    const alpha = (3 - i) / 3 * 0.4;
    const size = 3 + i;

    ctx.beginPath();
    ctx.arc(cx, cy, size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,200,100,${alpha})`;
    ctx.fill();
  }
}

function drawGatherEffect(q, r, color, amount, progress) {
  const [cx, cy] = hexCenter(q, r);
  // Longer peak: alpha stays high for middle 60% of animation
  const peak = 1 - Math.abs(progress - 0.5) * 1.4;
  const alpha = Math.max(0, peak);

  ctx.save();
  ctx.globalAlpha = alpha * 0.85;

  // Pulsing rings (2 rings at different phases)
  for (let ring = 0; ring < 2; ring++) {
    const rp = (progress + ring * 0.3) % 1;
    const radius = 16 + rp * 28;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 - rp * 2;
    ctx.stroke();
  }

  // Inner bright glow
  const glowR = 12 + Math.sin(progress * Math.PI) * 10;
  ctx.beginPath();
  ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.3, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fill();

  // Particles spiraling upward (8 particles)
  for (let i = 0; i < 8; i++) {
    const baseAngle = (i / 8) * Math.PI * 2;
    const angle = baseAngle + progress * 4;
    const dist = 10 + progress * 28;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist * 0.6 - progress * 26;
    const pSize = 3.5 - progress * 1.5;
    if (pSize > 0.5) {
      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? '#ffffff' : color;
      ctx.fill();
    }
  }

  // Amount text floating up
  if (amount > 0 && progress < 0.8) {
    ctx.fillStyle = `rgba(255,255,255,${1 - progress})`;
    ctx.font = 'bold 14px "KaiTi",serif';
    ctx.textAlign = 'center';
    ctx.fillText(`+${amount}`, cx, cy - 30 - progress * 24);
  }

  ctx.restore();
}

function drawDashTrail(fromQ, fromR, toQ, toR, progress) {
  const [fx, fy] = hexCenter(fromQ, fromR);
  const [tx, ty] = hexCenter(toQ, toR);
  const dx = tx - fx, dy = ty - fy;
  const perpX = -dy * 0.3, perpY = dx * 0.3;

  ctx.save();
  const alpha = 0.7 - progress * 0.5;

  // Speed lines along dash path
  for (let i = 0; i < 4; i++) {
    const t = (i / 4) + progress * 0.3;
    if (t > 1) continue;
    const lx = fx + dx * Math.max(0, t - 0.2);
    const ly = fy + dy * Math.max(0, t - 0.2);
    const rx = fx + dx * Math.min(1, t + 0.1);
    const ry = fy + dy * Math.min(1, t + 0.1);

    ctx.beginPath();
    ctx.moveTo(lx + perpX, ly + perpY);
    ctx.lineTo(rx + perpX, ry + perpY);
    ctx.moveTo(lx - perpX, ly - perpY);
    ctx.lineTo(rx - perpX, ry - perpY);
    ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.5})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Ghost afterimages
  for (let i = 0; i < 3; i++) {
    const t = progress - (i + 1) * 0.15;
    if (t < 0) continue;
    const gx = fx + dx * t;
    const gy = fy + dy * t;
    ctx.beginPath();
    ctx.arc(gx, gy, 18, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${0.15 - i * 0.04})`;
    ctx.fill();
  }

  ctx.restore();
}

function drawTeleportEffect(fromQ, fromR, toQ, toR, progress) {
  const [fx, fy] = hexCenter(fromQ, fromR);
  const [tx, ty] = hexCenter(toQ, toR);

  ctx.save();

  // Origin flash (fading out)
  const outAlpha = (1 - progress) * 0.8;
  if (outAlpha > 0) {
    ctx.beginPath();
    ctx.arc(fx, fy, 22 + progress * 10, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(139,92,246,${outAlpha * 0.3})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${outAlpha})`;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Destination flash (fading in)
  const inAlpha = progress * 0.8;
  if (inAlpha > 0) {
    ctx.beginPath();
    ctx.arc(tx, ty, 22 + (1 - progress) * 10, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(139,92,246,${inAlpha * 0.3})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${inAlpha})`;
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner bright core
    ctx.beginPath();
    ctx.arc(tx, ty, 8, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${inAlpha * 0.9})`;
    ctx.fill();
  }

  ctx.restore();
}

function drawWalkTrail(fromQ, fromR, toQ, toR, progress) {
  const [fx, fy] = hexCenter(fromQ, fromR);
  const [tx, ty] = hexCenter(toQ, toR);

  ctx.save();
  // Simple dust puffs along the path
  for (let i = 0; i < 2; i++) {
    const t = progress - i * 0.3;
    if (t < 0 || t > 1) continue;
    const px = fx + (tx - fx) * t;
    const py = fy + (ty - fy) * t;
    const alpha = (1 - i * 0.3) * 0.4 * (1 - progress);

    ctx.beginPath();
    ctx.arc(px + (i - 0.5) * 8, py + 12, 4 + progress * 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,190,180,${alpha})`;
    ctx.fill();
  }
  ctx.restore();
}

function drawGrappleLine(fromQ, fromR, toQ, toR, progress) {
  const [fx, fy] = hexCenter(fromQ, fromR);
  const [tx, ty] = hexCenter(toQ, toR);

  ctx.save();
  // Rope/chain line
  ctx.beginPath();
  ctx.moveTo(fx, fy);
  ctx.lineTo(tx, ty);
  ctx.strokeStyle = `rgba(180,160,140,0.6)`;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Hook head at destination
  const hookAlpha = progress > 0.5 ? 1 : progress * 2;
  ctx.beginPath();
  ctx.arc(tx, ty, 5, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(200,180,150,${hookAlpha})`;
  ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${hookAlpha * 0.7})`;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
}


// [moved to BattleSessionController] battleSession.visibleSkillsForChar

function renderPanels() {
  try {
    renderBattlePanelsView(battleSession.getBattlePanelsContext({
      onExecuteTurn: () => { document.getElementById('btn-execute')?.click(); },
    }));
  } catch (err) {
    console.error('[renderPanels] renderBattlePanelsView failed:', err);
    throw err;
  }
}

function renderLog() {
  const entries = engine.logger.getEntries();
  const logEl = document.getElementById('log');
  logEl.innerHTML = entries.map(e =>
    `<div class="log-entry log-${e.category || 's'}">[${e.turn || '-'}] ${e.message}</div>`
  ).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

// Keyboard shortcuts moved to ui/battle/BattleInputController.js

// Chat
document.getElementById('chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const msg = e.target.value.trim();
    if (!msg) return;
    e.target.value = '';
    appendChatMessage('我', msg);
    if (networkManager && networkManager.mode !== 'local') {
      networkManager.sendMessage({ type: 'CHAT', text: msg });
    }
  }
});

function appendChatMessage(sender, text) {
  const msgs = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.style.marginBottom = '2px';
  div.innerHTML = `<b>${sender}:</b> ${text}`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function handleNetworkMessage(payload) {
  if (payload.type === 'CHAT') {
    appendChatMessage('对手', payload.text);
  } else if (payload.type === 'CONFIG_UPDATE') {
    const cfg = payload.config;
    if (cfg?.playerId && cfg.playerId !== networkManager?.myPlayerId) {
      configPlayers[cfg.playerId] = normalizePlayerConfig(cfg, cfg.playerId);
      renderConfigScreen();
      maybeStartP2PBattle();
    }
  } else if (payload.type === 'CONFIG_LOCK') {
    const playerId = payload.playerId;
    if (playerId && playerId !== networkManager?.myPlayerId && configPlayers[playerId]) {
      configPlayers[playerId].locked = Boolean(payload.locked);
      renderConfigScreen();
      maybeStartP2PBattle();
    }
  } else if (payload.type === 'BATTLE_START') {
    if (currentRoute === 'battle' && battleSession.battleActive) return;
    if (Array.isArray(payload.players)) {
      for (const cfg of payload.players) {
        if (cfg?.playerId) configPlayers[cfg.playerId] = normalizePlayerConfig(cfg, cfg.playerId);
      }
      startBattleFromConfigs(payload.seed || Date.now(), payload.players.map((cfg, idx) => normalizePlayerConfig(cfg, idx === 0 ? 'player1' : 'player2')));
    }
  }
}

// Ripple effect on skill button click
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.skill-btn');
  if (!btn) return;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  ripple.style.width = ripple.style.height = size + 'px';
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
});

// --- Battle input controller (canvas click/mousemove, keyboard shortcuts) ---
initBattleInputController({
  canvas,
  battleSession,
  getNetworkManager: () => networkManager,
  isPveMode,
  getEngine: () => engine,
  geometry: { pixelToHex, isOnBoard, hexDistance, hexLine, hexSpiral, getSectorHexes },
  selectors: { getCharacterAtHex, getCharactersAtHex },
  callbacks: {
    renderAll,
    executeButtonClick: () => { document.getElementById('btn-execute')?.click(); },
    setSubmitStatus: (text) => { document.getElementById('submit-status').textContent = text; },
    computeEffectArea,
  },
});

// Canvas mousemove handler moved to ui/battle/BattleInputController.js

// --- Local mode: class selection + start ---
document.getElementById('btn-start').addEventListener('click', () => {
  const p1 = document.getElementById('p1-class-select').value;
  const p2 = document.getElementById('p2-class-select').value;
  battleSession.initGame(p1, p2);
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待提交...';
  document.getElementById('log').innerHTML = '';
  battleSession.clearTurnTimeout();
  battleSession.startTurnTimeout();
});

