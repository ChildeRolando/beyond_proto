// NetworkSessionController — owns P2P network session orchestration.
// Owns NetworkManager, room creation/joining, rematch coordination,
// config sync, and disconnect handling.
// Does NOT import main.js or AppRuntime.

import { NetworkManager } from '../engine/NetworkManager.js';
import { GameMode, p2pSubModeFromRoomMode } from '../app/GameModes.js';

export class NetworkSessionController {
  constructor(ctx) {
    this._ctx = ctx;
    this._networkManager = null;

    // Rematch coordination state
    this.remoteClassPick = null;
    this.battleSeed = 0;
    this.pendingMyClass = null;
    this.pendingRemoteRematchClass = null;
    this.opponentReadyForRematch = false;
    this._lockedRoomMode = null;
  }

  getNetworkManager() { return this._networkManager; }
  getLockedRoomMode() { return this._lockedRoomMode; }
  hasNetwork() { return this._networkManager && this._networkManager.mode !== 'local'; }
  getMyPlayerId() { return this._networkManager?.myPlayerId || null; }

  disconnect() {
    if (this._networkManager) { this._networkManager.disconnect(); this._networkManager = null; }
    this.remoteClassPick = null;
    this.battleSeed = 0;
    this.pendingMyClass = null;
    this.pendingRemoteRematchClass = null;
    this.opponentReadyForRematch = false;
    this._lockedRoomMode = null;
  }

  startP2PGame() {
    if (!this._networkManager) return;
    this.remoteClassPick = null;
    this.pendingRemoteRematchClass = null;
    this.pendingMyClass = null;
    this.opponentReadyForRematch = false;
    this.battleSeed = 0;

    this._ctx.callbacks.hideGameOver?.();
    this._ctx.callbacks.setModeBadge?.(`联机 ${this._networkManager.roomCode || ''}`, 'online');
    this._ctx.callbacks.setConnectionIndicator?.(true);
    this._ctx.callbacks.hideLobbyControls?.();
    const roomMode = this._lockedRoomMode || this._networkManager.lockedRoomMode || GameMode.P2P_DRAFT;
    const subMode = p2pSubModeFromRoomMode(roomMode);
    this._ctx.configSession.setP2PSubMode?.(subMode, { sync: false });
    this._ctx.configSession.showConfigScreen(roomMode);
  }

  _resolveSignalingUrl(serverAddr) {
    const isNgrok = window.location.hostname.includes('ngrok-free');
    const url = serverAddr.match(/^wss?:\/\//)
      ? serverAddr
      : (isNgrok ? `wss://${serverAddr}` : `ws://${serverAddr}`);
    return { isNgrok, signalingUrl: url };
  }

  async createRoom({ serverAddr, ui, roomMode = GameMode.P2P_DRAFT }) {
    const { signalingUrl } = this._resolveSignalingUrl(serverAddr);
    this._lockedRoomMode = roomMode;
    const nm = new NetworkManager({
      onStatusChange: (s) => {
        if (s.roomCode) { ui.showRoomCode(s.roomCode); ui.updateHostStatus('connecting', '等待对手加入...'); }
        if (s.status === 'connected') { ui.updateHostStatus('connected', '已连接！'); this.startP2PGame(); }
        if (s.error) { ui.setRoomError(s.error); ui.updateHostStatus('disconnected', '错误'); nm.disconnect(); }
      },
      onDisconnect: (reason) => this._ctx.callbacks.showDisconnect(reason),
      onRemoteSubmitted: (action) => this._ctx.battleSession.handleRemoteAction(nm, action),
      onRemoteReady: () => this._ctx.battleSession.updateSubmitStatus(nm),
      onReady: () => this._ctx.battleSession.executeP2PTurn(nm, { animateTurn: this._ctx.callbacks.animateTurn }),
      onClassPick: (playerClass, battleSeed) => this.onClassPick(playerClass, battleSeed),
      onGalaxyAction: (charId, skillId, targetPos) => {
        this._ctx.battleSession.engine.submitGalaxyAction(skillId, targetPos);
      },
      onMessage: (payload) => this._ctx.callbacks.handleNetworkMessage(payload),
    }, signalingUrl);
    this._networkManager = nm;
    try { await nm.createRoom(roomMode); } catch (e) {
      ui.setRoomError('连接服务器失败'); ui.updateHostStatus('disconnected', '连接失败');
      this._networkManager = null;
      this._lockedRoomMode = null;
    }
  }

  async joinRoom({ roomCode, serverAddr, ui, expectedRoomMode = GameMode.P2P_DRAFT }) {
    const { signalingUrl } = this._resolveSignalingUrl(serverAddr);
    this._lockedRoomMode = expectedRoomMode;
    const nm = new NetworkManager({
      onStatusChange: (s) => {
        if (s.status === 'connected') { ui.updateJoinStatus('connected', '已连接！'); this.startP2PGame(); }
        if (s.error) { ui.setRoomError(s.error); ui.updateJoinStatus('disconnected', '错误'); nm.disconnect(); }
      },
      onDisconnect: (reason) => this._ctx.callbacks.showDisconnect(reason),
      onRemoteSubmitted: (action) => this._ctx.battleSession.handleRemoteAction(nm, action),
      onRemoteReady: () => this._ctx.battleSession.updateSubmitStatus(nm),
      onReady: () => this._ctx.battleSession.executeP2PTurn(nm, { animateTurn: this._ctx.callbacks.animateTurn }),
      onClassPick: (playerClass, battleSeed) => this.onClassPick(playerClass, battleSeed),
      onGalaxyAction: (charId, skillId, targetPos) => {
        this._ctx.battleSession.engine.submitGalaxyAction(skillId, targetPos);
      },
      onMessage: (payload) => this._ctx.callbacks.handleNetworkMessage(payload),
    }, signalingUrl);
    this._networkManager = nm;
    try { await nm.joinRoom(roomCode, expectedRoomMode); } catch (e) {
      ui.setRoomError('连接服务器失败'); ui.updateJoinStatus('disconnected', '连接失败');
      this._networkManager = null;
      this._lockedRoomMode = null;
    }
  }

  sendConfigUpdate() {
    if (!this.hasNetwork() || !this.getMyPlayerId()) return;
    const cfg = this._ctx.configSession.getConfigPlayers()[this.getMyPlayerId()];
    if (!cfg) return;
    this._networkManager.sendMessage({
      type: 'CONFIG_UPDATE',
      p2pSubMode: this._ctx.configSession.getP2PSubMode?.() || 'draft',
      config: { ...cfg },
    });
  }

  sendConfigLock() {
    if (!this.hasNetwork() || !this.getMyPlayerId()) return;
    const cfg = this._ctx.configSession.getConfigPlayers()[this.getMyPlayerId()];
    if (!cfg) return;
    this._networkManager.sendMessage({ type: 'CONFIG_LOCK', playerId: cfg.playerId, locked: cfg.locked });
  }

  maybeStartP2PBattle() {
    if (!this._networkManager || this._networkManager.myPlayerId !== 'player1') return;
    if (!this._ctx.routeController.is('config')) return;
    const players = this._ctx.configSession.getConfigPlayers();
    if (!players.player1.locked || !players.player2.locked) return;
    const seed = Date.now();
    const configs = this._ctx.configSession.getBattlePlayerConfigs();
    this._networkManager.sendMessage({
      type: 'BATTLE_START',
      seed,
      p2pSubMode: this._ctx.configSession.getP2PSubMode?.() || 'draft',
      players: configs,
    });
    this._ctx.callbacks.startBattleFromConfigs(seed, configs);
  }

  onClassPick(remoteClass, seed = 0) {
    const gameoverShown = this._ctx.callbacks.isGameOverShown?.() || false;
    if (!gameoverShown && this._ctx.battleSession.battleActive) {
      this.pendingRemoteRematchClass = remoteClass;
      return;
    }
    this.remoteClassPick = remoteClass;
    if (seed) this.battleSeed = seed;

    if (gameoverShown && !this.pendingMyClass) {
      this._ctx.callbacks.setOpponentReadyForRematch?.(true);
      return;
    }

    const myClass = this.pendingMyClass || this._ctx.callbacks.getP2PClassSelection?.() || '法师';
    if (this.pendingMyClass) {
      this._networkManager?.sendClassPick(myClass, this.battleSeed);
    }
    this.pendingMyClass = null;
    this._ctx.callbacks.setOpponentReadyForRematch?.(false);
    this.tryInitWithClasses(myClass);
  }

  tryInitWithClasses(myClass) {
    if (!this.remoteClassPick) return;
    const myId = this.getMyPlayerId();
    const p1Class = myId === 'player1' ? myClass : this.remoteClassPick;
    const p2Class = myId === 'player2' ? myClass : this.remoteClassPick;
    this.remoteClassPick = null;
    this._ctx.battleSession.initGame(p1Class, p2Class, this.battleSeed);
    this.battleSeed = 0;
    this._ctx.battleSession.startTurnTimeout();
    this._ctx.battleSession.updateSubmitStatus(this._networkManager);
  }

  resetForReturnToStart() {
    this.remoteClassPick = null;
    this.pendingRemoteRematchClass = null;
    this.opponentReadyForRematch = false;
    this.disconnect();
  }
}
