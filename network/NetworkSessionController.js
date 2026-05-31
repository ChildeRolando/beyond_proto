// NetworkSessionController — owns P2P network session orchestration.
// Owns NetworkManager, room creation/joining, rematch coordination,
// config sync, and disconnect handling.
// Does NOT import main.js or AppRuntime.

import { NetworkManager } from '../engine/NetworkManager.js';

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
  }

  getNetworkManager() { return this._networkManager; }
  hasNetwork() { return this._networkManager && this._networkManager.mode !== 'local'; }
  getMyPlayerId() { return this._networkManager?.myPlayerId || null; }

  disconnect() {
    if (this._networkManager) { this._networkManager.disconnect(); this._networkManager = null; }
  }

  _resolveSignalingUrl(serverAddr) {
    const isNgrok = window.location.hostname.includes('ngrok-free');
    const url = serverAddr.match(/^wss?:\/\//)
      ? serverAddr
      : (isNgrok ? `wss://${serverAddr}` : `ws://${serverAddr}`);
    return { isNgrok, signalingUrl: url };
  }

  async createRoom({ serverAddr, ui }) {
    const { signalingUrl } = this._resolveSignalingUrl(serverAddr);
    const nm = new NetworkManager({
      onStatusChange: (s) => {
        if (s.roomCode) { ui.showRoomCode(s.roomCode); ui.updateHostStatus('connecting', '等待对手加入...'); }
        if (s.status === 'connected') { ui.updateHostStatus('connected', '已连接！'); this._ctx.callbacks.startP2PGame(nm); }
        if (s.error) { ui.setRoomError(s.error); ui.updateHostStatus('disconnected', '错误'); nm.disconnect(); }
      },
      onDisconnect: (reason) => this._ctx.callbacks.showDisconnect(reason),
      onRemoteSubmitted: (action) => this._ctx.battleSession.handleRemoteAction(nm, action),
      onRemoteReady: () => this._ctx.battleSession.updateSubmitStatus(nm),
      onReady: () => this._ctx.battleSession.executeP2PTurn(nm, { animateTurn: this._ctx.callbacks.animateTurn }),
      onClassPick: () => {},
      onGalaxyAction: (charId, skillId, targetPos) => {
        this._ctx.battleSession.engine.submitGalaxyAction(skillId, targetPos);
      },
      onMessage: (payload) => this._ctx.callbacks.handleNetworkMessage(payload),
    }, signalingUrl);
    this._networkManager = nm;
    try { await nm.createRoom(); } catch (e) {
      ui.setRoomError('连接服务器失败'); ui.updateHostStatus('disconnected', '连接失败');
      this._networkManager = null;
    }
  }

  async joinRoom({ roomCode, serverAddr, ui }) {
    const { signalingUrl } = this._resolveSignalingUrl(serverAddr);
    const nm = new NetworkManager({
      onStatusChange: (s) => {
        if (s.status === 'connected') { ui.updateJoinStatus('connected', '已连接！'); this._ctx.callbacks.startP2PGame(nm); }
        if (s.error) { ui.setRoomError(s.error); ui.updateJoinStatus('disconnected', '错误'); nm.disconnect(); }
      },
      onDisconnect: (reason) => this._ctx.callbacks.showDisconnect(reason),
      onRemoteSubmitted: (action) => this._ctx.battleSession.handleRemoteAction(nm, action),
      onRemoteReady: () => this._ctx.battleSession.updateSubmitStatus(nm),
      onReady: () => this._ctx.battleSession.executeP2PTurn(nm, { animateTurn: this._ctx.callbacks.animateTurn }),
      onClassPick: () => {},
      onGalaxyAction: (charId, skillId, targetPos) => {
        this._ctx.battleSession.engine.submitGalaxyAction(skillId, targetPos);
      },
      onMessage: (payload) => this._ctx.callbacks.handleNetworkMessage(payload),
    }, signalingUrl);
    this._networkManager = nm;
    try { await nm.joinRoom(roomCode); } catch (e) {
      ui.setRoomError('连接服务器失败'); ui.updateJoinStatus('disconnected', '连接失败');
      this._networkManager = null;
    }
  }

  sendConfigUpdate() {
    if (!this.hasNetwork() || !this.getMyPlayerId()) return;
    const cfg = this._ctx.configSession.getConfigPlayers()[this.getMyPlayerId()];
    if (!cfg) return;
    this._networkManager.sendMessage({ type: 'CONFIG_UPDATE', config: { ...cfg } });
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
    this._networkManager.sendMessage({ type: 'BATTLE_START', seed, players: configs });
    this._ctx.callbacks.startBattleFromConfigs(seed, configs);
  }

  resetForReturnToStart() {
    this.remoteClassPick = null;
    this.pendingRemoteRematchClass = null;
    this.opponentReadyForRematch = false;
    this.disconnect();
  }
}
