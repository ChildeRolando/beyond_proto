import { GameEngine } from './engine/GameEngine.js';
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
const engine = new GameEngine();
let networkManager = null;  // null in local mode, NetworkManager in P2P mode

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

let characterIds = [];
let localSubmittedSet = new Set();    // chars I submitted locally
let remoteSubmittedSet = new Set();   // chars opponent submitted (P2P only)
const plannedActions = [];            // local submitted actions used for same-turn range previews
let selectedSkill = null;
let viewingSkill = null;   // view-only opponent skill inspection (shows range, can't submit)
let validTargets = [];
let hoveredHex = null;
let hoverEffectArea = [];
let selectedCharacterId = null;
let lastHoveredCharacterId = null;
let activeSidebarTab = 'log';
let turnTimeoutId = null;
let battleEnded = false;
let battleActive = false; // true while a game is in progress (set in initGame, cleared on BATTLE_END)
let pveAiRunning = false;
const skillPages = new Map(); // charId -> current page number (0-indexed)
let skillsPerPage = 10;

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
  battleEnded = false;
  battleActive = false;
  selectedSkill = null;
  viewingSkill = null;
  validTargets = [];
  hoverEffectArea = [];
  hoveredHex = null;
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

function startBattleFromConfigs(seed = Date.now(), players = getBattlePlayerConfigs()) {
  battleConfigs = players.map(cloneConfig);
  const p1 = players.find(p => p.playerId === 'player1') || players[0];
  const p2 = players.find(p => p.playerId === 'player2') || players[1];
  initGame(p1.class, p2.class, seed, players);
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待提交...';
  document.getElementById('log').innerHTML = '';
  clearTurnTimeout();
  startTurnTimeout();
}

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

// Listen for battle end
engine.eventBus.on('BATTLE_END', (data) => {
  battleEnded = true;
  battleActive = false;
  showGameOver(data.winner);
});

// --- Galaxy sub-phase ---
let galaxyActive = false;
let galaxyCharId = null;
let galaxySelectedSkill = null;
let galaxyTargetPos = null;

let galaxyActionIndex = 0;
let galaxyActionTotal = 0;

engine.eventBus.on('GALAXY_SUBPHASE_START', (data) => {
  const myCharId = data.charIds.find(id => isMyCharacter(id));
  if (!myCharId) return;
  galaxyActive = true;
  galaxyCharId = myCharId;
  galaxySelectedSkill = null;
});

engine.eventBus.on('GALAXY_ACTION_PROMPT', (data) => {
  if (!galaxyActive || data.charId !== galaxyCharId) return;
  galaxyActionIndex = data.index;
  galaxyActionTotal = data.total;
  showGalaxyPanel();
});

engine.eventBus.on('GALAXY_SUBPHASE_END', () => {
  galaxyActive = false;
  galaxyCharId = null;
  galaxySelectedSkill = null;
  hideGalaxyPanel();
});

function showGalaxyPanel() {
  if (!galaxyCharId) return;
  const char = engine.registry.get(galaxyCharId);
  if (!char) return;

  document.getElementById('galaxy-hint').textContent =
    `行动 ${galaxyActionIndex + 1}/${galaxyActionTotal}`;
  const stateChar = engine.getState().characters.find(c => c.id === galaxyCharId);
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
      galaxySelectedSkill = btn.dataset.skill;
      document.getElementById('btn-galaxy-confirm').disabled = false;
    });
  });

  document.getElementById('galaxy-overlay').classList.add('show');
}

function hideGalaxyPanel() {
  document.getElementById('galaxy-overlay').classList.remove('show');
}

document.getElementById('btn-galaxy-confirm').addEventListener('click', () => {
  if (!galaxySelectedSkill) return;
  const skill = SKILLS[galaxySelectedSkill];
  if (!skill) return;

  if (skill.targeting.shape === 'SELF' || skill.targeting.shape === 'AOE_SELF') {
    // Self-targeting: submit immediately, panel stays hidden until next prompt
    engine.submitGalaxyAction(galaxySelectedSkill, null);
    if (networkManager && networkManager.mode !== 'local') {
      networkManager.sendGalaxyAction(galaxyCharId, galaxySelectedSkill, null);
    }
    galaxySelectedSkill = null;
    hideGalaxyPanel();
  } else {
    // Needs target: hide panel, show valid hexes on board
    hideGalaxyPanel();
    document.getElementById('submit-status').textContent = `银河远征: 点击棋盘选择 ${skill.name} 的目标`;

    const char = engine.registry.get(galaxyCharId);
    const range = engine.getEffectiveRange(galaxyCharId, skill.targeting.range ?? 99);
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    if (char) {
      for (let q = -3; q <= 3; q++) {
        for (let r = -3; r <= 3; r++) {
          if (!isOnBoard(q, r)) continue;
          if (q === char.position.q && r === char.position.r) continue;
          if (hexDistance(char.position.q, char.position.r, q, r) > range) continue;
          validTargets.push({ q, r });
        }
      }
    }
    renderAll();
  }
});

document.getElementById('btn-galaxy-skip').addEventListener('click', () => {
  engine.submitGalaxyAction(null, null);
  galaxySelectedSkill = null;
  hideGalaxyPanel();
});

// --- Start screen ---
document.getElementById('btn-local').addEventListener('click', () => {
  networkManager = null;
  configMode = 'local';
  currentConfigPlayer = 'player1';
  configPlayers.player1 = makeDefaultPlayerConfig('player1', configPlayers.player1.class || '法师');
  configPlayers.player2 = makeDefaultPlayerConfig('player2', configPlayers.player2.class || '战士');
  document.getElementById('mode-badge').textContent = '本地';
  document.getElementById('mode-badge').className = 'local';
  document.getElementById('conn-indicator').style.display = 'none';
  document.getElementById('p1-class-select').style.display = 'none';
  document.getElementById('p2-class-select').style.display = 'none';
  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('btn-reset').style.display = '';
  showConfigScreen('local');
});

document.getElementById('btn-pve').addEventListener('click', () => {
  networkManager = null;
  configMode = 'pve';
  currentConfigPlayer = 'player1';
  configPlayers.player1 = makeDefaultPlayerConfig('player1', configPlayers.player1.class || '法师');
  configPlayers.player2 = makeDefaultPlayerConfig('player2', configPlayers.player2.class || '战士');
  document.getElementById('mode-badge').textContent = 'PVE';
  document.getElementById('mode-badge').className = 'local';
  document.getElementById('conn-indicator').style.display = 'none';
  document.getElementById('p1-class-select').style.display = 'none';
  document.getElementById('p2-class-select').style.display = 'none';
  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('btn-reset').style.display = '';
  showConfigScreen('pve');
});

// --- Tutorial modal ---
function showTutorial() {
  document.getElementById('tutorial-overlay').classList.add('show');
}
function hideTutorial() {
  document.getElementById('tutorial-overlay').classList.remove('show');
}
document.getElementById('btn-tutorial').addEventListener('click', showTutorial);
document.getElementById('tutorial-close').addEventListener('click', hideTutorial);
document.getElementById('tutorial-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) hideTutorial();
});
document.getElementById('btn-help-top').addEventListener('click', showTutorial);

document.getElementById('btn-p2p').addEventListener('click', () => {
  document.getElementById('room-setup').style.display = 'flex';
  document.getElementById('room-host-section').style.display = 'block';
  document.getElementById('room-join-section').style.display = 'block';
  document.getElementById('room-code-text').style.display = 'none';
  document.getElementById('room-error').textContent = '';
  document.getElementById('p2p-class-pick').style.display = 'none';
});

document.getElementById('btn-back-start').addEventListener('click', () => {
  if (networkManager) { networkManager.disconnect(); networkManager = null; }
  document.getElementById('room-setup').style.display = 'none';
  document.getElementById('room-code-text').style.display = 'none';
  document.getElementById('room-error').textContent = '';
  resetConnectionUI();
});

document.getElementById('btn-create-room').addEventListener('click', async () => {
  document.getElementById('room-error').textContent = '';
  document.getElementById('room-code-text').style.display = 'none';
  updateHostStatus('connecting', '连接中...');
  const serverAddr = document.getElementById('server-addr-input-host').value.trim() || 'localhost:8088';
  const signalingUrl = serverAddr.match(/^wss?:\/\//) ? serverAddr : (isNgrok ? `wss://${serverAddr}` : `ws://${serverAddr}`);
  const nm = new NetworkManager({
    onStatusChange: (s) => {
      if (s.roomCode) {
        document.getElementById('room-code-text').textContent = s.roomCode;
        document.getElementById('room-code-text').style.display = 'block';
        updateHostStatus('connecting', '等待对手加入...');
      }
      if (s.status === 'connected') {
        updateHostStatus('connected', '已连接！');
        startP2PGame(nm);
      }
      if (s.error) {
        document.getElementById('room-error').textContent = s.error;
        updateHostStatus('disconnected', '错误');
        nm.disconnect();
      }
    },
    onDisconnect: (reason) => showDisconnect(reason),
    onRemoteSubmitted: (action) => handleRemoteAction(nm, action),
    onRemoteReady: () => updateSubmitStatus(nm),
    onReady: () => executeP2PTurn(nm),
    onClassPick: () => {},
    onGalaxyAction: (charId, skillId, targetPos) => {
      engine.submitGalaxyAction(skillId, targetPos);
    },
    onMessage: (payload) => handleNetworkMessage(payload),
  }, signalingUrl);
  networkManager = nm;
  try {
    await nm.createRoom();
  } catch (e) {
    document.getElementById('room-error').textContent = '连接服务器失败';
    updateHostStatus('disconnected', '连接失败');
    networkManager = null;
  }
});

document.getElementById('btn-join-room').addEventListener('click', async () => {
  const code = document.getElementById('room-code-input').value.toUpperCase().trim();
  if (!code || code.length !== 4) {
    document.getElementById('room-error').textContent = '请输入4位房间码';
    return;
  }
  document.getElementById('room-error').textContent = '';
  updateJoinStatus('connecting', '连接中...');
  const serverAddr = document.getElementById('server-addr-input').value.trim() || 'localhost:8088';
  const signalingUrl = serverAddr.match(/^wss?:\/\//) ? serverAddr : (isNgrok ? `wss://${serverAddr}` : `ws://${serverAddr}`);
  const nm = new NetworkManager({
    onStatusChange: (s) => {
      if (s.status === 'connected') {
        updateJoinStatus('connected', '已连接！');
        startP2PGame(nm);
      }
      if (s.error) {
        document.getElementById('room-error').textContent = s.error;
        updateJoinStatus('disconnected', '错误');
        nm.disconnect();
      }
    },
    onDisconnect: (reason) => showDisconnect(reason),
    onRemoteSubmitted: (action) => handleRemoteAction(nm, action),
    onRemoteReady: () => updateSubmitStatus(nm),
    onReady: () => executeP2PTurn(nm),
    onClassPick: () => {},
    onGalaxyAction: (charId, skillId, targetPos) => {
      engine.submitGalaxyAction(skillId, targetPos);
    },
    onMessage: (payload) => handleNetworkMessage(payload),
  }, signalingUrl);
  networkManager = nm;
  try {
    await nm.joinRoom(code);
  } catch (e) {
    document.getElementById('room-error').textContent = '连接服务器失败';
    updateJoinStatus('disconnected', '连接失败');
    networkManager = null;
  }
});

function updateHostStatus(status, text) {
  const dot = document.querySelector('#room-host-section .dot');
  dot.className = 'dot ' + (status === 'connected' ? 'green' : status === 'connecting' ? 'yellow' : 'red');
  document.getElementById('host-status-text').textContent = text;
}

function updateJoinStatus(status, text) {
  const dot = document.querySelector('#room-join-section .dot');
  dot.className = 'dot ' + (status === 'connected' ? 'green' : status === 'connecting' ? 'yellow' : 'red');
  document.getElementById('join-status-text').textContent = text;
}

function resetConnectionUI() {
  updateHostStatus('disconnected', '等待创建...');
  updateJoinStatus('disconnected', '输入房间码和地址');
  document.getElementById('room-code-input').value = '';
  const defaultAddr = isNgrok ? window.location.host : 'localhost:8088';
  document.getElementById('server-addr-input').value = defaultAddr;
  document.getElementById('server-addr-input-host').value = defaultAddr;
}

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
  document.getElementById('room-setup').style.display = 'none';
  resetConnectionUI();
});

function startP2PGame(nm) {
  document.getElementById('gameover-panel').classList.remove('show');
  battleEnded = false;
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
  localSubmittedSet.clear();
  remoteSubmittedSet.clear();
  clearPlannedActions();
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
  if (!gameoverShown && battleActive) {
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
  initGame(p1Class, p2Class, battleSeed);
  battleSeed = 0; // reset for next game
  document.getElementById('submit-status').textContent = '等待双方提交...';
  startTurnTimeout();
}

function handleRemoteAction(nm, action) {
  // Apply opponent's action to our local engine
  engine.submitAction(action.charId, action.skillId, action.targetPos);
  if (isRequiredActionReady(action.charId)) remoteSubmittedSet.add(action.charId);
  updateSubmitStatus(nm);
  renderAll();
}

async function executeP2PTurn(nm) {
  clearTurnTimeout();
  const result = await engine.executeTurn();
  if (!result.success) return;

  localSubmittedSet.clear();
  remoteSubmittedSet.clear();
  clearPlannedActions();
  nm.clearTurn();
  document.getElementById('submit-status').textContent = '等待双方提交...';
  if (result.battleEnded) {
    renderAll();
    return;
  }

  animateTurn().then(() => {
    engine.projectileCalculator.clearKeyframes();
    renderAll();
    startTurnTimeout();
  });
}

function showDisconnect(reason) {
  document.getElementById('disconnect-reason').textContent =
    reason === 'peer_left' ? '对手离开了游戏' :
    reason === 'timeout' ? '连接超时' :
    reason === 'connection_lost' ? '网络连接中断' : '连接已断开';
  document.getElementById('disconnect-overlay').classList.add('show');
}

window.returnToStart = function() {
  clearTurnTimeout();
  battleActive = false;
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
  localSubmittedSet.clear();
  remoteSubmittedSet.clear();
  clearPlannedActions();
  selectedSkill = null;
  viewingSkill = null;
  validTargets = [];
  hoverEffectArea = [];
  hoveredHex = null;
  battleEnded = false;
  resetConnectionUI();
};

function updateRematchButton() {
  const btn = document.getElementById('btn-rematch');
  if (opponentReadyForRematch) {
    btn.textContent = '对手已准备，重新开始';
  } else {
    btn.textContent = '重新开始';
  }
}

function showGameOver(winner) {
  clearTurnTimeout();
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '战斗已结束';
  const winnerText = winner === 'player1' ? '玩家1' : winner === 'player2' ? '玩家2' : '平局';
  document.getElementById('gameover-winner').textContent = `胜者: ${winnerText}`;
  document.getElementById('rematch-class-p1').value = player1Class;
  document.getElementById('rematch-class-p2').value = player2Class;
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
  battleEnded = false;
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待配置...';
  document.getElementById('log').innerHTML = '';
  localSubmittedSet.clear();
  remoteSubmittedSet.clear();
  clearPlannedActions();
  clearTurnTimeout();
  showConfigScreen(isP2P ? 'p2p' : (wasPve ? 'pve' : 'local'));
});

// Return to lobby button
document.getElementById('btn-lobby').addEventListener('click', () => {
  document.getElementById('gameover-panel').classList.remove('show');
  returnToStart();
});

function startTurnTimeout() {
  clearTurnTimeout();
  turnTimeoutId = setTimeout(() => {
    // Auto-submit pass for any unsubmitted characters I own
    const myChars = getMyCharacterIds();
    for (const charId of myChars) {
      if (canSubmitForChar(charId)) {
        const forcedId = engine.getForcedSkillId(charId);
        if (forcedId !== undefined) {
          submitAction(charId, forcedId, null);
        }
        // If no forced skill, the engine will handle PASS at execute time
      }
    }
  }, 60000);
}

function clearTurnTimeout() {
  if (turnTimeoutId) { clearTimeout(turnTimeoutId); turnTimeoutId = null; }
}

function getMyCharacterIds() {
  if (isPveMode()) return engine.getCharactersByOwner('player1').map(c => c.id);
  if (!networkManager || networkManager.mode === 'local') return characterIds;
  const myId = networkManager.myPlayerId;
  return engine.getCharactersByOwner(myId).map(c => c.id);
}

function isMyCharacter(charId) {
  if (isPveMode()) return engine.getCharacterOwner(charId) === 'player1';
  if (!networkManager || networkManager.mode === 'local') return true;
  return engine.getCharacterOwner(charId) === networkManager.myPlayerId;
}

function getCharacterState(charId) {
  return engine.getState().characters.find(c => c.id === charId) || null;
}

function getPreviewOrigin(charId, skillId) {
  const char = engine.registry.get(charId);
  if (!char) return null;
  return getPlannedOriginForSkill(char.position, plannedActions, charId, skillId);
}

function clearPlannedActions() {
  plannedActions.length = 0;
}

function canSubmitForChar(charId, skillId = null) {
  if (networkManager && networkManager.mode !== 'local' && networkManager.iSubmitted) return false;
  const result = engine.canSubmitAction?.(charId, skillId);
  return Boolean(result?.canSubmit ?? result?.ok);
}

function isRequiredActionReady(charId) {
  return Boolean(getCharacterState(charId)?.actionPoints?.requiredReady);
}

function hasOptionalActionAvailable(charId) {
  const ap = getCharacterState(charId)?.actionPoints;
  if (!ap?.requiredReady) return false;
  return (ap.finesse?.used || 0) < (ap.finesse?.total || 0);
}

function areMyRequiredActionsReady() {
  return getMyCharacterIds()
    .filter(id => engine.registry.get(id)?.alive !== false)
    .every(id => isRequiredActionReady(id));
}

function hasAnyMyOptionalActionAvailable() {
  return getMyCharacterIds()
    .filter(id => engine.registry.get(id)?.alive !== false)
    .some(id => hasOptionalActionAvailable(id));
}

function markP2PReady(nm) {
  if (!nm || nm.mode === 'local' || nm.iSubmitted) return;
  if (!areMyRequiredActionsReady()) return;
  nm.markReady();
  updateSubmitStatus(nm);
  renderAll();
}

function maybeAutoReadyP2P(nm) {
  if (!nm || nm.mode === 'local' || nm.iSubmitted) return;
  if (areMyRequiredActionsReady() && !hasAnyMyOptionalActionAvailable()) {
    markP2PReady(nm);
  }
}

function updateSubmitStatus(nm) {
  const allAlive = characterIds.filter(id => engine.registry.get(id)?.alive !== false);
  if (nm && nm.mode !== 'local') {
    const localCount = allAlive.filter(id => localSubmittedSet.has(id)).length;
    const remoteCount = allAlive.filter(id => remoteSubmittedSet.has(id)).length;
    document.getElementById('btn-execute').disabled = nm.iSubmitted || !areMyRequiredActionsReady();
    if (nm.iSubmitted && nm.remoteSubmitted) {
      document.getElementById('submit-status').textContent = '双方就绪，执行中...';
    } else {
      const mine = nm.iSubmitted ? '你已就绪' : '你待提交';
      const peer = nm.remoteSubmitted ? '对手已就绪' : '对手待提交';
      document.getElementById('submit-status').textContent =
        `${mine} / ${peer} 行动:${localCount}-${remoteCount}/${allAlive.length}`;
    }
  } else if (isPveMode()) {
    const mineAlive = getMyCharacterIds().filter(id => engine.registry.get(id)?.alive !== false);
    const submitted = mineAlive.filter(id => localSubmittedSet.has(id)).length;
    const ready = areMyRequiredActionsReady();
    document.getElementById('btn-execute').disabled = !ready || pveAiRunning;
    if (pveAiRunning) {
      document.getElementById('submit-status').textContent = 'PVE: AI 思考中...';
    } else if (ready) {
      document.getElementById('submit-status').textContent =
        hasAnyMyOptionalActionAvailable() ? 'PVE: 可继续可选行动或执行' : 'PVE: 玩家已提交，等待 AI';
    } else {
      document.getElementById('submit-status').textContent = `PVE: 已提交 ${submitted}/${mineAlive.length}`;
    }
  } else {
    const submitted = allAlive.filter(id => localSubmittedSet.has(id)).length;
    if (submitted >= allAlive.length) {
      document.getElementById('btn-execute').disabled = false;
      document.getElementById('submit-status').textContent = '就绪！点击执行回合';
    } else {
      document.getElementById('submit-status').textContent = `已提交 ${submitted}/${allAlive.length}`;
    }
  }
}

// --- Setup ---
let player1Class = '法师';
let player2Class = '战士';

function initGame(p1Class, p2Class, seed = 0, players = null) {
  player1Class = p1Class || player1Class;
  player2Class = p2Class || player2Class;
  setRoute('battle');
  document.getElementById('p1-class-select').style.display = 'none';
  document.getElementById('p2-class-select').style.display = 'none';
  document.getElementById('btn-start').style.display = 'none';
  document.getElementById('gameover-panel').classList.remove('show');
  battleEnded = false;
  battleActive = true;
  pveAiRunning = false;
  remoteClassPick = null;
  pendingRemoteRematchClass = null;
  opponentReadyForRematch = false;
  engine.reset();
  const battleSeed = seed || Date.now();
  const result = engine.initBattle(players
    ? { players, seed: battleSeed }
    : { player1Class, player2Class, seed: battleSeed });
  characterIds = [result.player1Id, result.player2Id];
  localSubmittedSet.clear();
  remoteSubmittedSet.clear();
  clearPlannedActions();
  selectedSkill = null;
  viewingSkill = null;
  validTargets = [];
  hoverEffectArea = [];
  hoveredHex = null;
  selectedCharacterId = null;
  lastHoveredCharacterId = null;
  activeSidebarTab = 'log';
  skillPages.clear();
  resizeCanvas();
  renderAll();
}

// --- Skill selection ---
function selectSkill(charId, skillId) {
  if (battleEnded) return;
  if (!isMyCharacter(charId)) return;

  // Clicking an already-selected skill deselects it
  if (selectedSkill && selectedSkill.charId === charId && selectedSkill.skillId === skillId) {
    selectedSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    renderAll();
    return;
  }

  if (!canSubmitForChar(charId, skillId)) return;

  const skill = SKILLS[skillId];
  if (!skill) return;

  selectedSkill = { charId, skillId };
  viewingSkill = null;
  validTargets = [];
  hoverEffectArea = [];
  hoveredHex = null;

  const char = engine.registry.get(charId);
  if (!char) { renderAll(); return; }
  const origin = getPreviewOrigin(charId, skillId) || char.position;

  const shape = skill.targeting.shape;
  const range = skill.type === '移动'
    ? engine.getEffectiveMoveRange(charId, skill.targeting.range ?? 99)
    : engine.getEffectiveRange(charId, skill.targeting.range ?? 99);

  if (shape === 'SELF') {
    validTargets = [{ q: -99, r: -99, self: true }];
  } else if (shape === 'AOE_SELF') {
    hoverEffectArea = computeEffectArea(skill, origin, origin, range);
  } else if (shape === 'HEX' || shape === 'DIRECTION' || shape === 'FAN') {
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        if (!isOnBoard(q, r)) continue;
        const dist = hexDistance(origin.q, origin.r, q, r);
        if (dist > range) continue;
        validTargets.push({ q, r });
      }
    }
  }

  renderAll();
}

// View opponent skill range without allowing submission
function viewOpponentSkill(charId, skillId) {
  if (battleEnded) return;
  const skill = SKILLS[skillId];
  if (!skill) return;

  // Toggle off if already viewing this skill
  if (viewingSkill && viewingSkill.charId === charId && viewingSkill.skillId === skillId) {
    viewingSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    renderAll();
    return;
  }

  viewingSkill = { charId, skillId };
  selectedSkill = null;
  validTargets = [];
  hoverEffectArea = [];
  hoveredHex = null;

  const char = engine.registry.get(charId);
  if (!char) { renderAll(); return; }

  const shape = skill.targeting.shape;
  const range = skill.type === '移动'
    ? engine.getEffectiveMoveRange(charId, skill.targeting.range ?? 99)
    : engine.getEffectiveRange(charId, skill.targeting.range ?? 99);

  if (shape === 'SELF') {
    validTargets = [{ q: char.position.q, r: char.position.r, self: true }];
  } else if (shape === 'AOE_SELF') {
    hoverEffectArea = computeEffectArea(skill, char.position, char.position, range);
  } else if (shape === 'HEX' || shape === 'DIRECTION' || shape === 'FAN') {
    for (let q = -3; q <= 3; q++) {
      for (let r = -3; r <= 3; r++) {
        if (!isOnBoard(q, r)) continue;
        const dist = hexDistance(char.position.q, char.position.r, q, r);
        if (dist > range) continue;
        validTargets.push({ q, r });
      }
    }
  }

  renderAll();
}

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

// --- Canvas click ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const [hq, hr] = pixelToHex(mx, my);

  if (!isOnBoard(hq, hr)) return;

  const clickedChar = getCharacterAtHex(hq, hr);

  // Galaxy sub-phase target selection (panel hidden, waiting for hex click)
  if (galaxyActive && galaxySelectedSkill && !document.getElementById('galaxy-overlay').classList.contains('show')) {
    const skill = SKILLS[galaxySelectedSkill];
    if (skill && skill.targeting.shape !== 'SELF' && skill.targeting.shape !== 'AOE_SELF') {
      engine.submitGalaxyAction(galaxySelectedSkill, { q: hq, r: hr });
      if (networkManager && networkManager.mode !== 'local') {
        networkManager.sendGalaxyAction(galaxyCharId, galaxySelectedSkill, { q: hq, r: hr });
      }
      galaxySelectedSkill = null;
      validTargets = [];
      hoverEffectArea = [];
      hoveredHex = null;
      document.getElementById('submit-status').textContent = '等待双方提交...';
      return;
    }
  }

  // If only viewing opponent skill, clicking a hex clears the view
  if (viewingSkill && !selectedSkill) {
    viewingSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    if (clickedChar) selectedCharacterId = clickedChar.id;
    renderAll();
    return;
  }

  if (!selectedSkill) {
    if (clickedChar) {
      // Cycle through chars on same hex on repeated clicks
      const hexChars = getCharactersAtHex(hq, hr);
      if (hexChars.length > 1 && hexChars.some(c => c.id === selectedCharacterId)) {
        const curIdx = hexChars.findIndex(c => c.id === selectedCharacterId);
        const next = hexChars[(curIdx + 1) % hexChars.length];
        selectedCharacterId = next.id;
        lastHoveredCharacterId = next.id;
      } else {
        selectedCharacterId = clickedChar.id;
        lastHoveredCharacterId = clickedChar.id;
      }
      renderAll();
    }
    return;
  }

  const charId = selectedSkill.charId;
  const skill = SKILLS[selectedSkill.skillId];

  if (skill.targeting.shape === 'SELF' || skill.targeting.shape === 'AOE_SELF') {
    submitAction(charId, selectedSkill.skillId, null);
    return;
  }

  // Click on invalid hex cancels selection
  if (!validTargets.some(t => t.q === hq && t.r === hr)) {
    selectedSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    renderAll();
    return;
  }

  submitAction(charId, selectedSkill.skillId, { q: hq, r: hr });
});

function submitAction(charId, skillId, targetPos) {
  if (battleEnded) return;
  if (!isMyCharacter(charId)) return;

  const result = engine.submitAction(charId, skillId, targetPos);
  if (result.success) {
    plannedActions.push({
      charId,
      skillId,
      targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
    });
    if (isRequiredActionReady(charId)) localSubmittedSet.add(charId);
    selectedSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    skillPages.set(charId, 0);

    if (networkManager && networkManager.mode !== 'local') {
      networkManager.submitMyAction(charId, skillId, targetPos);
      maybeAutoReadyP2P(networkManager);
    }
    updateSubmitStatus(networkManager);
    if (isPveMode() && areMyRequiredActionsReady() && !hasAnyMyOptionalActionAvailable()) {
      void submitAiAndExecutePveTurn();
    }
  } else {
    // Submission failed — reset selection and show error
    selectedSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    document.getElementById('submit-status').textContent = result.error || '提交失败';
  }
  renderAll();
}

// --- Execute turn ---
function getPveAiCharacterId() {
  const ai = engine.getCharactersByOwner('player2').find(c => c.alive !== false);
  return ai?.id || null;
}

async function submitAiAndExecutePveTurn() {
  if (!isPveMode() || pveAiRunning || battleEnded) return;
  if (!areMyRequiredActionsReady()) return;
  const aiId = getPveAiCharacterId();
  if (!aiId) return;

  pveAiRunning = true;
  clearTurnTimeout();
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = 'PVE: AI 思考中...';
  renderAll();

  try {
    const aiResult = await Promise.race([
      engine.submitAiAction(aiId, {
        opponentId: getMyCharacterIds()[0],
        policy: { maxOwnActions: 12, maxOpponentActions: 8, maxTargetsPerSkill: 1, opponentTemperature: 50, preserveSkillCoverage: true },
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('ai_timeout')), 15000))
    ]);
    if (aiResult.success) {
      localSubmittedSet.add(aiId);
      // AI finesse: submit different optional action
      if (hasOptionalActionAvailable(aiId)) {
        const fResult = await engine.submitAiAction(aiId, {
          opponentId: getMyCharacterIds()[0],
          policy: { maxOwnActions: 8, maxOpponentActions: 4, maxTargetsPerSkill: 1, opponentTemperature: 50, preserveSkillCoverage: true },
          candidates: { excludeSkillIds: aiResult.action ? [aiResult.action.skillId] : [] },
        });
        if (fResult.success) localSubmittedSet.add(aiId);
      }
      await executeLocalTurn();
    } else {
      document.getElementById('submit-status').textContent = `PVE: AI 提交失败 ${aiResult.error || ''}`;
      document.getElementById('btn-execute').disabled = false;
    }
  } catch (err) {
    document.getElementById('submit-status').textContent = 'PVE: AI 超时，使用快速决策';
    document.getElementById('btn-execute').disabled = false;
    // Fast fallback: submit first candidate action
    const { generateCandidateActions } = await import('./engine/ai/CandidateGenerator.js');
    const candidates = generateCandidateActions(engine, aiId, { maxTargetsPerSkill: 1 });
    if (candidates.length > 0) {
      const fallback = candidates[0];
      engine.submitAction(fallback.characterId, fallback.skillId, fallback.targetPos ?? null);
      localSubmittedSet.add(aiId);
      await executeLocalTurn();
    }
  } finally {
    pveAiRunning = false;
  }
}

async function executeLocalTurn() {
  clearTurnTimeout();
  const result = await engine.executeTurn();
  if (!result.success) return result;

  localSubmittedSet.clear();
  clearPlannedActions();
  document.getElementById('btn-execute').disabled = true;

  if (result.battleEnded) {
    renderAll();
    return result;
  }

  document.getElementById('submit-status').textContent = '等待双方提交...';
  await animateTurn();
  engine.projectileCalculator.clearKeyframes();
  renderAll();
  startTurnTimeout();
  updateSubmitStatus(networkManager);
  return result;
}

document.getElementById('btn-execute').addEventListener('click', async () => {
  if (networkManager && networkManager.mode !== 'local') {
    markP2PReady(networkManager);
    return;
  }
  if (isPveMode()) {
    await submitAiAndExecutePveTurn();
    return;
  }
  await executeLocalTurn();
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
  clearTurnTimeout();
  startTurnTimeout();
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

      const inEffectArea = hoverEffectArea.some(t => t.q === q && t.r === r);
      const isValidTarget = validTargets.some(t => t.q === q && t.r === r);
      const isHovered = hoveredHex && hoveredHex[0] === q && hoveredHex[1] === r;

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
    if (localSubmittedSet.has(c.id) || remoteSubmittedSet.has(c.id)) {
      const [cx, cy] = hexCenter(c.position.q, c.position.r);
      const isLocal = localSubmittedSet.has(c.id);
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

function renderLegacyPanels() {
  const state = engine.getState();
  const leftEl = document.getElementById('panels-left');
  const rightEl = document.getElementById('panels-right');
  if (!leftEl || !rightEl) return;

  const chars = state.characters.filter(c => c.alive !== false);
  const leftChars = chars.slice(0, 1);
  const rightChars = chars.slice(1, 2);
  const PER_PAGE = skillsPerPage;

  function renderCharPanel(char) {
    const r = char.resources;
    const cls = char.class;
    const shortCls = cls === '法师' ? 'mage' : cls === '战士' ? 'warrior' : 'shooter';
    const isMine = isMyCharacter(char.id);
    const isP2P = networkManager && networkManager.mode !== 'local';
    const opponentClass = !isMine && isP2P ? ' opponent-panel' : '';

    let resHTML = '';
    if (cls === '法师') resHTML = `气:${r.qi || 0} | 盾:${r.shield || 0}${r.shieldActive ? ' [开]' : ''}`;
    else if (cls === '战士') resHTML = `怒:${r.rage || 0}`;
    else if (cls === '射手') resHTML = `弹:${r.ammo || 0}/${r.ammoMax || 6} | 背:${r.backpackAmmo || 0}${r.blockActive !== false ? ' [格挡]' : ''}`;
    const buffsHTML = char.buffs.map(b => {
      const d = b.duration === -1 ? '∞' : b.duration;
      const title = b.desc ? `title="${b.desc}"` : '';
      return `<span class="buff" ${title}>${b.name}(${d})</span>`;
    }).join(' ') || '—';
    const traitsHTML = (char.traits || []).map(t =>
      `<span class="buff" title="${t.desc || ''}">${t.name}</span>`
    ).join(' ');

    const forcedId = engine.getForcedSkillId(char.id);
    let forcedActive = false;
    let forcedHTML = '';
    if (forcedId !== undefined) {
      forcedActive = true;
      const fSkill = SKILLS[forcedId];
      const fName = fSkill ? fSkill.name : (forcedId || '强制待机');
      forcedHTML = `<div class="buffs"><span class="buff" style="background:#e94560;color:#fff;font-weight:700;">强制: ${fName}</span></div>`;
    }
    const allSkills = char.skills.filter(s => {
      const skill = SKILLS[s.id];
      if (!skill) return false;
      if (forcedActive) return s.id === forcedId;
      return !skill.hidden;
    }).sort((a, b) => {
      const costA = Object.values(SKILLS[a.id]?.cost || {}).reduce((sum, v) => sum + v, 0);
      const costB = Object.values(SKILLS[b.id]?.cost || {}).reduce((sum, v) => sum + v, 0);
      return costA - costB;
    });

    const totalPages = Math.max(1, Math.ceil(allSkills.length / PER_PAGE));
    let page = skillPages.get(char.id) || 0;
    if (page >= totalPages) page = 0;
    skillPages.set(char.id, page);

    const pageSkills = allSkills.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

    function canAfford(skill) {
      const cost = skill.cost || {};
      for (const [res, amount] of Object.entries(cost)) {
        if ((r[res] || 0) < amount) return false;
      }
      return true;
    }

    const skillsHTML = pageSkills.map(s => {
      const skill = SKILLS[s.id];
      const sel = (selectedSkill?.charId === char.id && selectedSkill?.skillId === s.id) ||
                 (viewingSkill?.charId === char.id && viewingSkill?.skillId === s.id) ? ' selected' : '';
      const used = isMine && !canSubmitForChar(char.id, s.id) ? ' used' : '';
      const opp = !isMine && isP2P ? ' opponent' : '';
      const noAfford = isMine && !canAfford(skill) ? ' unaffordable' : '';
      return `<button class="skill-btn${sel}${used}${opp}${noAfford}" data-skill="${s.id}" data-char="${char.id}">
        <div class="skill-name">${skill.name}</div>
        <div class="skill-desc">${skill.desc || ''}</div>
      </button>`;
    }).join('');

    const pageNav = `
      <div class="skill-page-nav">
        <button class="skill-page-btn" data-char="${char.id}" data-page-dir="prev"${page === 0 ? ' disabled' : ''}>◀</button>
        <span class="skill-page-indicator">${page + 1}/${totalPages}</span>
        <button class="skill-page-btn" data-char="${char.id}" data-page-dir="next"${page >= totalPages - 1 ? ' disabled' : ''}>▶</button>
      </div>`;

    return `
      <div class="char-panel ${shortCls}${opponentClass}">
        <div class="panel-title">${char.name}${!isMine && isP2P ? ' (对手)' : ''}</div>
        <div class="resources">${resHTML}</div>
        ${traitsHTML ? `<div class="buffs">${traitsHTML}</div>` : ''}
        <div class="buffs">${buffsHTML}</div>
        ${forcedHTML}
        <div class="skill-grid">${skillsHTML}</div>
        ${pageNav}
      </div>`;
  }

  leftEl.innerHTML = leftChars.map(c => renderCharPanel(c)).join('');
  rightEl.innerHTML = rightChars.map(c => renderCharPanel(c)).join('');

  // Auto-submit SELF-targeted forced skills (only if battle not ended)
  if (!battleEnded) {
    for (const c of chars) {
      if (!isMyCharacter(c.id)) continue;
      if (!canSubmitForChar(c.id)) continue;
      const forcedId = engine.getForcedSkillId(c.id);
      if (forcedId !== undefined) {
        const fSkill = SKILLS[forcedId];
        if (fSkill && fSkill.targeting.shape === 'SELF') {
          submitAction(c.id, forcedId, null);
        }
      }
    }
  }

  // Wire page nav buttons
  document.querySelectorAll('.skill-page-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const charId = btn.dataset.char;
      const dir = btn.dataset.pageDir;
      const cur = skillPages.get(charId) || 0;
      skillPages.set(charId, dir === 'next' ? cur + 1 : cur - 1);
      renderPanels();
    });
  });

  // Wire skill button click handlers
  document.querySelectorAll('.skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const skillId = btn.dataset.skill;
      const charId = btn.dataset.char;
      if (btn.classList.contains('opponent')) {
        viewOpponentSkill(charId, skillId);
      } else if (btn.classList.contains('used')) {
        return; // own character already submitted, do nothing
      } else {
        selectSkill(charId, skillId);
      }
    });
  });
}

function classPanelKey(className) {
  if (className === '法师') return 'mage';
  if (className === '战士') return 'warrior';
  return 'shooter';
}

function renderResourceHTML(char) {
  const r = char.resources || {};
  if (char.class === '法师') return `气:${r.qi || 0} | 盾:${r.shield || 0}${r.shieldActive ? ' [开]' : ''}`;
  if (char.class === '战士') return `怒:${r.rage || 0}`;
  return `弹:${r.ammo || 0}/${r.ammoMax || 6} | 备:${r.backpackAmmo || 0}${r.blockActive !== false ? ' [格挡]' : ''}`;
}
function renderBuffHTML(char) {
  return (char.buffs || []).map(b => {
    const d = b.duration === -1 ? '∞' : b.duration;
    const title = b.desc ? `title="${b.desc}"` : '';
    return `<span class="buff" ${title}>${b.name}(${d})</span>`;
  }).join(' ') || '—';
}

function renderTraitHTML(char) {
  return (char.traits || []).map(t =>
    `<span class="buff" title="${t.desc || ''}">${t.name}</span>`
  ).join(' ');
}

function visibleSkillsForChar(char) {
  const forcedId = engine.getForcedSkillId(char.id);
  return (char.skills || []).filter(s => {
    const skill = SKILLS[s.id];
    if (!skill) return false;
    if (forcedId !== undefined) return s.id === forcedId;
    return !skill.hidden;
  }).sort((a, b) => {
    const costA = Object.values(SKILLS[a.id]?.cost || {}).reduce((sum, v) => sum + v, 0);
    const costB = Object.values(SKILLS[b.id]?.cost || {}).reduce((sum, v) => sum + v, 0);
    return costA - costB;
  });
}

function skillCostLabel(skill, char) {
  let total = Object.values(skill.cost || {}).reduce((sum, v) => sum + v, 0);
  // 易经洗髓酒: cost scales with marrow layer
  if (skill.id === 'role_jimmy_marrow_wine' && char) {
    const costs = [3, 4, 4, 5, 5];
    const buffs = char.buffs || [];
    const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
    const layer = marrow?.data?.layer || 0;
    total = layer < costs.length ? costs[layer] : costs[costs.length - 1];
  }
  return `C${total}`;
}

function skillGlyph(skill) {
  if (skill.icon) return `<img src="${skill.icon}" alt="${skill.name}" style="width:100%;height:100%;object-fit:contain;">`;
  return (skill.name || '?').slice(0, 1);
}

function renderInfoPanel(char, title, options = {}) {
  if (!char) return `<div class="inspector-empty">将指针停留在角色上查看状态。</div>`;
  const shortCls = classPanelKey(char.class);
  const traitsHTML = renderTraitHTML(char);
  const showSkills = options.showSkills !== false;
  const skillRows = visibleSkillsForChar(char).map(s => {
    const skill = SKILLS[s.id];
    const selected = viewingSkill?.charId === char.id && viewingSkill?.skillId === s.id ? ' selected' : '';
    return `<button class="drawer-skill-btn${selected}" data-skill="${s.id}" data-char="${char.id}" title="${skill.desc || ''}">
      <span>${skill.name}</span><small>${skill.desc || ''}</small>
    </button>`;
  }).join('');
  return `
    <div class="char-panel info-only ${shortCls}">
      <div class="drawer-header">
        <div class="hud-section-label">${title}</div>
        ${options.closable ? '<button class="drawer-close" id="selected-unit-close" title="关闭">×</button>' : ''}
      </div>
      <div class="panel-title">${char.name}</div>
      <div class="resources">${renderResourceHTML(char)}</div>
      ${traitsHTML ? `<div class="buffs">${traitsHTML}</div>` : ''}
      <div class="buffs">${renderBuffHTML(char)}</div>
      ${showSkills ? '<div class="hud-section-label">技能列表</div>' : ''}
      ${showSkills ? `<div class="info-skill-list">${skillRows || '<div class="drawer-empty">无可见技能</div>'}</div>` : ''}
    </div>`;
}

function renderSelectedUnitDrawer(state) {
  const drawer = document.getElementById('selected-unit-drawer');
  const char = state.characters.find(c => c.id === selectedCharacterId && c.alive !== false);
  if (!drawer) return;
  if (!char) {
    drawer.classList.remove('open');
    drawer.innerHTML = '';
    return;
  }
  drawer.classList.add('open');
  drawer.innerHTML = renderInfoPanel(char, '角色详情', { closable: true, showSkills: true });
}

function renderHoverInspector(state) {
  const el = document.getElementById('hover-inspector');
  if (!el) return;
  const char = state.characters.find(c => c.id === lastHoveredCharacterId && c.alive !== false) ||
    state.characters.find(c => c.alive !== false && !isMyCharacter(c.id)) ||
    state.characters.find(c => c.alive !== false);
  el.innerHTML = renderInfoPanel(char, char?.id === lastHoveredCharacterId ? '悬停角色' : '战场目标', { showSkills: false });
}

function renderActionDock(state) {
  const dock = document.getElementById('action-dock');
  if (!dock) return;
  const chars = state.characters.filter(c => c.alive !== false && isMyCharacter(c.id));
  const selectedMine = chars.find(c => c.id === selectedCharacterId);
  const pendingMine = chars.find(c => canSubmitForChar(c.id));
  const actor = selectedSkill
    ? chars.find(c => c.id === selectedSkill.charId)
    : (selectedMine && canSubmitForChar(selectedMine.id) ? selectedMine : pendingMine || selectedMine || chars[0]);

  if (!actor) {
    dock.innerHTML = '<div class="drawer-empty">没有可操作角色。</div>';
    return;
  }

  const forcedId = engine.getForcedSkillId(actor.id);
  const forcedSkill = forcedId !== undefined ? SKILLS[forcedId] : null;
  if (!battleEnded && forcedSkill && forcedSkill.targeting.shape === 'SELF' && canSubmitForChar(actor.id, forcedId)) {
    submitAction(actor.id, forcedId, null);
    return;
  }

  const allSkills = visibleSkillsForChar(actor);
  const totalPages = Math.max(1, Math.ceil(allSkills.length / skillsPerPage));
  let page = skillPages.get(actor.id) || 0;
  if (page >= totalPages) page = 0;
  skillPages.set(actor.id, page);
  const pageSkills = allSkills.slice(page * skillsPerPage, (page + 1) * skillsPerPage);

  function canAfford(skill) {
    let cost = { ...(skill.cost || {}) };
    if (skill.id === 'role_jimmy_marrow_wine') {
      const costs = [3, 4, 4, 5, 5];
      const buffs = actor.buffs || [];
      const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
      const layer = marrow?.data?.layer || 0;
      cost = { rage: layer < costs.length ? costs[layer] : costs[costs.length - 1] };
    }
    // Factor in pending resource gains from already-submitted actions
    const pending = engine.getPendingResourceGains?.(actor.id) || {};
    for (const [res, amount] of Object.entries(cost)) {
      const available = (actor.resources?.[res] || 0) + (pending[res] || 0);
      if (available < amount) return false;
    }
    return true;
  }

  const skillsHTML = pageSkills.map(s => {
    const skill = SKILLS[s.id];
    const sel = selectedSkill?.charId === actor.id && selectedSkill?.skillId === s.id ? ' selected' : '';
    const used = !canSubmitForChar(actor.id, s.id) ? ' used' : '';
    const noAfford = !canAfford(skill) ? ' unaffordable' : '';
    return `<button class="skill-btn skill-icon-btn${sel}${used}${noAfford}" data-skill="${s.id}" data-char="${actor.id}" title="${skill.name}: ${skill.desc || ''}" data-tooltip-title="${skill.name}" data-tooltip="${skill.desc || ''}">
      <div class="skill-glyph">${skillGlyph(skill)}</div>
      <div class="skill-meta"><span>${skillCostLabel(skill, actor)}</span><span>S${skill.speed ?? '-'}</span></div>
    </button>`;
  }).join('');

  const pageNav = `
    <div class="skill-page-nav">
      <button class="skill-page-btn" data-char="${actor.id}" data-page-dir="prev"${page === 0 ? ' disabled' : ''}>◀</button>
      <span class="skill-page-indicator">${page + 1}/${totalPages}</span>
      <button class="skill-page-btn" data-char="${actor.id}" data-page-dir="next"${page >= totalPages - 1 ? ' disabled' : ''}>▶</button>
    </div>`;
  const hint = selectedSkill?.charId === actor.id
    ? `选择 <span class="target-skill-name">${SKILLS[selectedSkill.skillId]?.name || '技能'}</span> 的目标格`
    : (hasOptionalActionAvailable(actor.id) ? '可追加灵巧行动，或执行回合' : (canSubmitForChar(actor.id) ? '选择技能后在棋盘指定目标' : '该角色已提交行动'));
  const executeBtn = document.getElementById('btn-execute');

  dock.innerHTML = `
    <div class="dock-actor">
      <div class="dock-actor-label">当前行动</div>
      <div class="dock-actor-name">${actor.name}</div>
      <div class="resources">${renderResourceHTML(actor)}</div>
      <div class="buffs">${renderTraitHTML(actor) || '—'}</div>
      <div class="buffs">${renderBuffHTML(actor)}</div>
    </div>
    <div class="dock-skills">
      <div class="hud-section-label">技能</div>
      <div class="skill-grid">${skillsHTML || '<span class="drawer-empty">无可用技能</span>'}</div>
      ${pageNav}
    </div>
    <div class="dock-control">
      <div>
        <div class="hud-section-label">目标提示</div>
        <div class="target-hint">${hint}</div>
      </div>
      <button class="dock-execute-proxy" id="dock-execute" ${executeBtn?.disabled ? 'disabled' : ''}>执行回合</button>
    </div>`;
}

function renderRightSidebarTabs() {
  document.querySelectorAll('#right-sidebar-tabs button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeSidebarTab);
    btn.onclick = () => {
      activeSidebarTab = btn.dataset.tab;
      renderRightSidebarTabs();
    };
  });
  document.getElementById('log')?.classList.toggle('active', activeSidebarTab === 'log');
  document.getElementById('chat-box')?.classList.toggle('active', activeSidebarTab === 'chat');
}

function wireActionDock() {
  document.getElementById('selected-unit-close')?.addEventListener('click', () => {
    selectedCharacterId = null;
    viewingSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    renderAll();
  });
  document.querySelectorAll('#selected-unit-drawer .drawer-skill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.add('selected');
      viewOpponentSkill(btn.dataset.char, btn.dataset.skill);
    });
  });
  document.querySelectorAll('#action-dock .skill-page-btn:not(:disabled)').forEach(btn => {
    btn.addEventListener('click', () => {
      const charId = btn.dataset.char;
      const dir = btn.dataset.pageDir;
      const cur = skillPages.get(charId) || 0;
      skillPages.set(charId, dir === 'next' ? cur + 1 : cur - 1);
      renderAll();
    });
  });
  document.querySelectorAll('#action-dock .skill-btn').forEach(btn => {
    btn.addEventListener('mouseenter', (e) => showSkillTooltip(e, btn));
    btn.addEventListener('mousemove', (e) => positionSkillTooltip(e));
    btn.addEventListener('mouseleave', hideSkillTooltip);
    btn.addEventListener('click', () => {
      const charId = btn.dataset.char;
      const skillId = btn.dataset.skill;
      if (btn.classList.contains('used')) return;
      selectSkill(charId, skillId);
    });
  });
  document.getElementById('dock-execute')?.addEventListener('click', () => {
    document.getElementById('btn-execute')?.click();
  });
}

function showSkillTooltip(e, btn) {
  const tooltip = document.getElementById('skill-tooltip');
  if (!tooltip) return;
  const title = btn.dataset.tooltipTitle || '';
  const body = btn.dataset.tooltip || btn.getAttribute('title') || '';
  tooltip.innerHTML = `<strong>${title}</strong><span>${body}</span>`;
  tooltip.classList.add('visible');
  positionSkillTooltip(e);
}

function positionSkillTooltip(e) {
  const tooltip = document.getElementById('skill-tooltip');
  if (!tooltip) return;
  const pad = 14;
  const rect = tooltip.getBoundingClientRect();
  let left = e.clientX + pad;
  let top = e.clientY - rect.height - pad;
  if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
  if (top < 8) top = e.clientY + pad;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideSkillTooltip() {
  document.getElementById('skill-tooltip')?.classList.remove('visible');
}

function renderPanels() {
  const state = engine.getState();
  renderSelectedUnitDrawer(state);
  renderHoverInspector(state);
  renderActionDock(state);
  renderRightSidebarTabs();
  wireActionDock();
}

function renderLog() {
  const entries = engine.logger.getEntries();
  const logEl = document.getElementById('log');
  logEl.innerHTML = entries.map(e =>
    `<div class="log-entry log-${e.category || 's'}">[${e.turn || '-'}] ${e.message}</div>`
  ).join('');
  logEl.scrollTop = logEl.scrollHeight;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (battleEnded) return;
  if (galaxyActive) return; // Don't interfere with galaxy sub-phase
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  // Keys 1-4: select visible skills on current page
  const key = parseInt(e.key);
  if (key >= 1 && key <= 4) {
    e.preventDefault();
    const myChars = getMyCharacterIds();
    for (const charId of myChars) {
      if (!canSubmitForChar(charId)) continue;
      const char = engine.registry.get(charId);
      if (!char) continue;
      const forcedId = engine.getForcedSkillId(charId);
      const allSkills = char.skills.filter(s => {
        const skill = SKILLS[s.id];
        return skill && !skill.hidden && (!forcedId || s.id === forcedId);
      }).sort((a, b) => {
        const costA = Object.values(SKILLS[a.id]?.cost || {}).reduce((s, v) => s + v, 0);
        const costB = Object.values(SKILLS[b.id]?.cost || {}).reduce((s, v) => s + v, 0);
        return costA - costB;
      });
      const page = skillPages.get(charId) || 0;
      const pageSkills = allSkills.slice(page * skillsPerPage, (page + 1) * skillsPerPage);
      if (key <= pageSkills.length) {
        const s = pageSkills[key - 1];
        selectSkill(charId, s.id);
        if (SKILLS[s.id]?.targeting.shape === 'SELF') {
          submitAction(charId, s.id, null);
        }
      }
      break;
    }
    return;
  }

  // Space: execute turn in local mode
  if (e.key === ' ' && (!networkManager || networkManager.mode === 'local')) {
    e.preventDefault();
    const btn = document.getElementById('btn-execute');
    if (!btn.disabled) btn.click();
  }

  // Escape: clear selection
  if (e.key === 'Escape') {
    selectedSkill = null;
    viewingSkill = null;
    validTargets = [];
    hoverEffectArea = [];
    hoveredHex = null;
    renderAll();
  }
});

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
    if (currentRoute === 'battle' && battleActive) return;
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

// Canvas hover
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  hoveredHex = pixelToHex(mx, my);
  if (!isOnBoard(hoveredHex[0], hoveredHex[1])) hoveredHex = null;
  if (hoveredHex) {
    const hoverChar = getCharacterAtHex(hoveredHex[0], hoveredHex[1]);
    if (hoverChar) lastHoveredCharacterId = hoverChar.id;
  }

  hoverEffectArea = [];
  if (selectedSkill || viewingSkill) {
    const sel = selectedSkill || viewingSkill;
    const skill = SKILLS[sel.skillId];
    const char = engine.registry.get(sel.charId);
    if (skill && char) {
      const origin = selectedSkill
        ? (getPreviewOrigin(sel.charId, sel.skillId) || char.position)
        : char.position;
      const effectiveRange = skill.type === '移动'
        ? engine.getEffectiveMoveRange(sel.charId, skill.targeting?.range ?? 99)
        : engine.getEffectiveRange(sel.charId, skill.targeting?.range ?? 99);
      const shape = skill.targeting.shape;
      if (shape === 'SELF' || shape === 'AOE_SELF') {
        hoverEffectArea = computeEffectArea(skill, origin, origin, effectiveRange);
      } else if (shape === 'FAN' && hoveredHex && validTargets.some(t => t.q === hoveredHex[0] && t.r === hoveredHex[1])) {
        hoverEffectArea = getSectorHexes(origin.q, origin.r, hoveredHex[0], hoveredHex[1], effectiveRange)
          .map(([q, r]) => ({ q, r }));
      } else if (hoveredHex && validTargets.some(t => t.q === hoveredHex[0] && t.r === hoveredHex[1])) {
        hoverEffectArea = computeEffectArea(skill, origin, { q: hoveredHex[0], r: hoveredHex[1] }, effectiveRange);
      }
    }
  } else if (galaxyActive && galaxySelectedSkill && !document.getElementById('galaxy-overlay').classList.contains('show')) {
    // Galaxy target selection hover
    const skill = SKILLS[galaxySelectedSkill];
    const char = engine.registry.get(galaxyCharId);
    if (skill && char) {
      if (hoveredHex && validTargets.some(t => t.q === hoveredHex[0] && t.r === hoveredHex[1])) {
        hoverEffectArea = computeEffectArea(skill, char.position, { q: hoveredHex[0], r: hoveredHex[1] });
      }
    }
  }

  renderAll();
});

// --- Local mode: class selection + start ---
document.getElementById('btn-start').addEventListener('click', () => {
  const p1 = document.getElementById('p1-class-select').value;
  const p2 = document.getElementById('p2-class-select').value;
  initGame(p1, p2);
  document.getElementById('btn-execute').disabled = true;
  document.getElementById('submit-status').textContent = '等待提交...';
  document.getElementById('log').innerHTML = '';
  clearTurnTimeout();
  startTurnTimeout();
});

