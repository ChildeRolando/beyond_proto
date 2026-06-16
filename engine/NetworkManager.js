// WebSocket relay manager for P2P combat (server-relayed, no WebRTC)
const DEFAULT_SIGNALING = 'ws://120.77.178.15:8088';
export const NETWORK_PROTOCOL_VERSION = 2;

export class NetworkManager {
  #ws = null;
  #mode = 'local';           // 'local' | 'host' | 'client'
  #roomCode = null;
  #myPlayerId = null;        // 'player1' | 'player2'
  #status = 'disconnected';  // 'disconnected' | 'connecting' | 'connected'
  #signalingUrl;
  #lockedRoomMode = null;

  // Lockstep state
  #myActions = [];           // [{ charId, skillId, targetPos }]
  #remoteActions = [];       // [{ charId, skillId, targetPos }]
  #myReady = false;
  #remoteReady = false;
  #turnNumber = 1;
  #futureActionsByTurn = new Map();
  #futureReadyByTurn = new Set();
  #executingTurn = false;

  // Heartbeat
  #pingInterval = null;
  #lastPong = 0;

  // Callbacks
  #callbacks = {};

  constructor(callbacks = {}, signalingUrl = DEFAULT_SIGNALING) {
    this.#callbacks = callbacks;
    this.#signalingUrl = signalingUrl;
  }

  get mode() { return this.#mode; }
  get myPlayerId() { return this.#myPlayerId; }
  get roomCode() { return this.#roomCode; }
  get status() { return this.#status; }
  get lockedRoomMode() { return this.#lockedRoomMode; }
  get remoteSubmitted() { return this.#remoteReady; }
  get iSubmitted() { return this.#myReady; }

  // --- Public API ---

  async createRoom(roomMode = 'p2p_draft') {
    this.#mode = 'host';
    this.#myPlayerId = 'player1';
    this.#lockedRoomMode = roomMode;
    this.#setStatus('connecting');
    await this.#connectWS();
    this.#sendWS({ type: 'CREATE_ROOM', roomMode, protocolVersion: NETWORK_PROTOCOL_VERSION });
  }

  async joinRoom(code, expectedRoomMode = 'p2p_draft') {
    this.#mode = 'client';
    this.#myPlayerId = 'player2';
    this.#roomCode = code;
    this.#lockedRoomMode = expectedRoomMode;
    this.#setStatus('connecting');
    await this.#connectWS();
    this.#sendWS({ type: 'JOIN_ROOM', roomCode: code, expectedRoomMode, protocolVersion: NETWORK_PROTOCOL_VERSION });
  }

  submitMyAction(charId, skillId, targetPos) {
    const action = { charId, skillId, targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null };
    this.#myActions.push(action);
    this.#sendGame({
      type: 'TURN_ACTION',
      turnNumber: this.#turnNumber,
      charId,
      skillId,
      targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
    });
  }

  markReady() {
    if (this.#myReady) return;
    this.#myReady = true;
    this.#sendGame({ type: 'TURN_READY', turnNumber: this.#turnNumber });
    this.#checkBothReady();
  }

  clearTurn() {
    this.#turnNumber++;
    this.#myActions = [];
    this.#remoteActions = [];
    this.#myReady = false;
    this.#remoteReady = false;
    this.#drainQueuedMessagesForCurrentTurn();
  }

  sendClassPick(playerClass, battleSeed = 0) {
    this.#sendGame({ type: 'CLASS_PICK', playerClass, battleSeed });
  }

  sendMessage(msg) {
    this.#sendGame(msg);
  }

  sendGalaxyAction(charId, skillId, targetPos) {
    this.#sendGame({
      type: 'GALAXY_ACTION',
      turnNumber: this.#turnNumber,
      charId,
      skillId,
      targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
    });
  }

  disconnect() {
    this.#stopHeartbeat();
    if (this.#ws) { try { this.#ws.close(); } catch (_) { /* ignore */ } this.#ws = null; }
    this.#setStatus('disconnected');
    this.#mode = 'local';
    this.#roomCode = null;
    this.#myPlayerId = null;
    this.#lockedRoomMode = null;
    this.#myActions = [];
    this.#remoteActions = [];
    this.#myReady = false;
    this.#remoteReady = false;
    this.#futureActionsByTurn.clear();
    this.#futureReadyByTurn.clear();
    this.#executingTurn = false;
  }

  // --- WebSocket ---

  async #connectWS() {
    this.#ws = new WebSocket(this.#signalingUrl);
    return new Promise((resolve, reject) => {
      this.#ws.onopen = () => resolve();
      this.#ws.onerror = () => reject(new Error('signaling connection failed'));
      this.#ws.onmessage = (e) => this.#onWSMessage(e.data);
      this.#ws.onclose = () => {
        if (this.#status === 'connected') {
          this.#callbacks.onDisconnect?.('connection_lost');
          this.disconnect();
        }
      };
      setTimeout(() => reject(new Error('signaling timeout')), 10000);
    });
  }

  #sendWS(data) {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      this.#ws.send(JSON.stringify(data));
    }
  }

  #sendGame(payload) {
    this.#sendWS({ type: 'GAME', payload });
  }

  async #onWSMessage(raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) { return; }

    switch (msg.type) {
      case 'ROOM_CREATED':
        this.#roomCode = msg.roomCode;
        this.#lockedRoomMode = msg.roomMode || this.#lockedRoomMode;
        this.#callbacks.onStatusChange?.({ roomCode: this.#roomCode, roomMode: this.#lockedRoomMode });
        break;

      case 'JOIN_SUCCESS':
        this.#myPlayerId = msg.playerId;
        this.#lockedRoomMode = msg.roomMode || this.#lockedRoomMode;
        this.#setStatus('connected');
        this.#startHeartbeat();
        break;

      case 'JOIN_ERROR':
        this.#callbacks.onStatusChange?.({ error: this.#formatJoinError(msg.reason), reason: msg.reason, roomMode: msg.roomMode || null });
        this.disconnect();
        break;

      case 'PEER_JOINED':
        this.#setStatus('connected');
        this.#startHeartbeat();
        break;

      case 'PEER_DISCONNECTED':
        if (this.#status === 'connected') {
          this.#callbacks.onDisconnect?.('peer_left');
        }
        this.disconnect();
        break;

      case 'GAME': {
        const { payload } = msg;
        switch (payload.type) {
          case 'TURN_ACTION':
            this.#handleTurnAction(payload);
            break;

          case 'TURN_READY':
            this.#handleTurnReady(payload);
            break;

          case 'CLASS_PICK':
            this.#callbacks.onClassPick?.(payload.playerClass, payload.battleSeed || 0);
            break;

          case 'GALAXY_ACTION':
            this.#callbacks.onGalaxyAction?.(payload.charId, payload.skillId, payload.targetPos);
            break;

          case 'PING':
            this.#sendGame({ type: 'PONG', timestamp: payload.timestamp });
            break;

          case 'PONG':
            this.#lastPong = Date.now();
            break;

          default:
            this.#callbacks.onMessage?.(payload);
            break;
        }
        break;
      }
    }
  }

  #handleTurnAction(payload) {
    const turnNumber = payload.turnNumber ?? this.#turnNumber;
    if (turnNumber < this.#turnNumber) return;
    if (turnNumber > this.#turnNumber) {
      const queued = this.#futureActionsByTurn.get(turnNumber) || [];
      queued.push(payload);
      this.#futureActionsByTurn.set(turnNumber, queued);
      return;
    }
    this.#processCurrentTurnAction(payload);
  }

  #handleTurnReady(payload) {
    const turnNumber = payload.turnNumber ?? this.#turnNumber;
    if (turnNumber < this.#turnNumber) return;
    if (turnNumber > this.#turnNumber) {
      this.#futureReadyByTurn.add(turnNumber);
      return;
    }
    this.#processCurrentTurnReady();
  }

  #processCurrentTurnAction(payload) {
    const remoteAction = {
      turnNumber: payload.turnNumber ?? this.#turnNumber,
      charId: payload.charId,
      skillId: payload.skillId,
      targetPos: payload.targetPos,
    };
    this.#remoteActions.push(remoteAction);
    this.#callbacks.onRemoteSubmitted?.(remoteAction);
  }

  #processCurrentTurnReady() {
    if (this.#remoteReady) return;
    this.#remoteReady = true;
    this.#callbacks.onRemoteReady?.();
    this.#checkBothReady();
  }

  #drainQueuedMessagesForCurrentTurn() {
    const actions = this.#futureActionsByTurn.get(this.#turnNumber) || [];
    this.#futureActionsByTurn.delete(this.#turnNumber);
    for (const payload of actions) this.#processCurrentTurnAction(payload);
    if (this.#futureReadyByTurn.delete(this.#turnNumber)) {
      this.#processCurrentTurnReady();
    }
  }

  async #checkBothReady() {
    if (!this.#myReady || !this.#remoteReady || this.#executingTurn) return;
    this.#executingTurn = true;
    try {
      await this.#callbacks.onReady?.();
    } finally {
      this.#executingTurn = false;
    }
  }

  #formatJoinError(reason) {
    if (reason === 'room_full') return '房间已满';
    if (reason === 'mode_mismatch') return '房间模式不匹配：该房间不是当前选择的模式';
    if (reason === 'protocol_mismatch') return '房间协议过旧，请刷新页面';
    return '房间不存在';
  }

  // --- Heartbeat ---

  #startHeartbeat() {
    this.#lastPong = Date.now();
    this.#pingInterval = setInterval(() => {
      if (Date.now() - this.#lastPong > 15000) {
        this.#callbacks.onDisconnect?.('timeout');
        this.disconnect();
        return;
      }
      this.#sendGame({ type: 'PING', timestamp: Date.now() });
    }, 5000);
  }

  #stopHeartbeat() {
    if (this.#pingInterval) { clearInterval(this.#pingInterval); this.#pingInterval = null; }
  }

  #setStatus(s) {
    this.#status = s;
    this.#callbacks.onStatusChange?.({ status: s });
  }
}
