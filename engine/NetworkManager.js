// WebSocket relay manager for P2P combat (server-relayed, no WebRTC)
const DEFAULT_SIGNALING = 'ws://120.77.178.15:8088';

export class NetworkManager {
  #ws = null;
  #mode = 'local';           // 'local' | 'host' | 'client'
  #roomCode = null;
  #myPlayerId = null;        // 'player1' | 'player2'
  #status = 'disconnected';  // 'disconnected' | 'connecting' | 'connected'
  #signalingUrl;

  // Lockstep state
  #myAction = null;          // { charId, skillId, targetPos }
  #remoteAction = null;      // { charId, skillId, targetPos }
  #turnNumber = 1;

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
  get remoteSubmitted() { return this.#remoteAction !== null; }
  get iSubmitted() { return this.#myAction !== null; }

  // --- Public API ---

  async createRoom() {
    this.#mode = 'host';
    this.#myPlayerId = 'player1';
    this.#setStatus('connecting');
    await this.#connectWS();
    this.#sendWS({ type: 'CREATE_ROOM' });
  }

  async joinRoom(code) {
    this.#mode = 'client';
    this.#myPlayerId = 'player2';
    this.#roomCode = code;
    this.#setStatus('connecting');
    await this.#connectWS();
    this.#sendWS({ type: 'JOIN_ROOM', roomCode: code });
  }

  submitMyAction(charId, skillId, targetPos) {
    this.#myAction = { charId, skillId, targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null };
    this.#sendGame({
      type: 'TURN_ACTION',
      turnNumber: this.#turnNumber,
      charId,
      skillId,
      targetPos: targetPos ? { q: targetPos.q, r: targetPos.r } : null,
    });
    this.#checkBothReady();
  }

  clearTurn() {
    this.#turnNumber++;
    this.#myAction = null;
    this.#remoteAction = null;
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
    this.#myAction = null;
    this.#remoteAction = null;
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
        this.#callbacks.onStatusChange?.({ roomCode: this.#roomCode });
        break;

      case 'JOIN_SUCCESS':
        this.#myPlayerId = msg.playerId;
        this.#setStatus('connected');
        this.#startHeartbeat();
        break;

      case 'JOIN_ERROR':
        this.#callbacks.onStatusChange?.({ error: msg.reason === 'room_full' ? '房间已满' : '房间不存在' });
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
            this.#remoteAction = {
              charId: payload.charId,
              skillId: payload.skillId,
              targetPos: payload.targetPos,
            };
            this.#callbacks.onRemoteSubmitted?.(this.#remoteAction);
            this.#checkBothReady();
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

  #checkBothReady() {
    if (this.#myAction && this.#remoteAction) {
      this.#callbacks.onReady?.();
    }
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
