// Network room mode lock regression tests.
// Run: node tests/network_room_mode_lock.spec.js

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { NetworkManager } from '../engine/NetworkManager.js';
import { NetworkSessionController } from '../network/NetworkSessionController.js';
import { GameMode } from '../app/GameModes.js';

const PROTOCOL_VERSION = 2;
const PORT = 8092;
const HOST = 'localhost';
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \x1b[32mOK\x1b[0m ${name}`);
  } catch (error) {
    failed++;
    console.error(`  \x1b[31mFAIL\x1b[0m ${name} - ${error.message}`);
  }
}

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
    queueMicrotask(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  send(raw) {
    this.sent.push(JSON.parse(raw));
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  receive(payload) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }
}

async function withFakeWebSocket(fn) {
  const original = globalThis.WebSocket;
  const originalWindow = globalThis.window;
  globalThis.WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];
  try {
    await fn();
  } finally {
    globalThis.WebSocket = original;
    globalThis.window = originalWindow;
  }
}

function encodeMaskedFrame(data) {
  const payload = Buffer.from(data, 'utf8');
  const maskKey = crypto.randomBytes(4);
  const header = Buffer.alloc(payload.length < 126 ? 6 : 8);
  header[0] = 0x81;
  if (payload.length < 126) {
    header[1] = 0x80 | payload.length;
    maskKey.copy(header, 2);
  } else {
    header[1] = 0x80 | 126;
    header.writeUInt16BE(payload.length, 2);
    maskKey.copy(header, 4);
  }
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ maskKey[i % 4];
  return Buffer.concat([header, masked]);
}

function parseFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 2) break;
    const opcode = buffer[offset] & 0x0f;
    const masked = (buffer[offset + 1] & 0x80) !== 0;
    let payloadLen = buffer[offset + 1] & 0x7f;
    let headerLen = 2;
    if (payloadLen === 126) {
      if (buffer.length - offset < 4) break;
      payloadLen = buffer.readUInt16BE(offset + 2);
      headerLen = 4;
    }
    const maskLen = masked ? 4 : 0;
    if (buffer.length - offset < headerLen + maskLen + payloadLen) break;
    const payloadStart = offset + headerLen + maskLen;
    const payload = buffer.slice(payloadStart, payloadStart + payloadLen);
    frames.push(opcode === 0x8 ? { type: 'close' } : { type: 'text', payload: payload.toString('utf8') });
    offset = payloadStart + payloadLen;
  }
  return { frames, consumed: offset };
}

async function wsConnect() {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: HOST,
      port: PORT,
      method: 'GET',
      path: '/',
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
        'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (_res, socket, head) => {
      const buffer = { buf: head?.length ? Buffer.from(head) : Buffer.alloc(0) };
      socket.on('data', chunk => { buffer.buf = Buffer.concat([buffer.buf, chunk]); });
      resolve({ socket, buffer });
    });
    req.on('error', reject);
    req.end();
    setTimeout(() => reject(new Error('connect timeout')), 4000);
  });
}

function send(conn, data) {
  conn.socket.write(encodeMaskedFrame(JSON.stringify(data)));
}

async function waitMessages(conn, delayMs = 250) {
  await new Promise(resolve => setTimeout(resolve, delayMs));
  const { frames, consumed } = parseFrames(conn.buffer.buf);
  conn.buffer.buf = conn.buffer.buf.slice(consumed);
  return frames.filter(f => f.type === 'text').map(f => JSON.parse(f.payload));
}

async function startSignalingServer() {
  const child = spawn(process.execPath, ['server/signaling.js', String(PORT)], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('signaling server start timeout')), 5000);
    child.stdout.on('data', chunk => {
      if (chunk.toString().includes('Signaling server listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`signaling server exited early: ${code}`)));
  });
  return child;
}

async function createRoom(roomMode) {
  const host = await wsConnect();
  send(host, { type: 'CREATE_ROOM', roomMode, protocolVersion: PROTOCOL_VERSION });
  const messages = await waitMessages(host);
  const created = messages.find(message => message.type === 'ROOM_CREATED');
  assert.ok(created?.roomCode, 'room was not created');
  return { host, created };
}

async function joinRoom(roomCode, expectedRoomMode) {
  const client = await wsConnect();
  send(client, { type: 'JOIN_ROOM', roomCode, expectedRoomMode, protocolVersion: PROTOCOL_VERSION });
  return { client, messages: await waitMessages(client) };
}

console.log('\n=== Client protocol payloads ===');
await withFakeWebSocket(async () => {
  const host = new NetworkManager({}, 'ws://test');
  await host.createRoom('p2p_quick');
  check('createRoom quick sends roomMode', () => {
    assert.deepEqual(FakeWebSocket.instances[0].sent[0], {
      type: 'CREATE_ROOM',
      roomMode: 'p2p_quick',
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  const draftHost = new NetworkManager({}, 'ws://test');
  await draftHost.createRoom('p2p_draft');
  check('createRoom draft sends roomMode', () => {
    assert.deepEqual(FakeWebSocket.instances[1].sent[0], {
      type: 'CREATE_ROOM',
      roomMode: 'p2p_draft',
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  const quickJoin = new NetworkManager({}, 'ws://test');
  await quickJoin.joinRoom('ABCD', 'p2p_quick');
  check('joinRoom quick sends expectedRoomMode', () => {
    assert.deepEqual(FakeWebSocket.instances[2].sent[0], {
      type: 'JOIN_ROOM',
      roomCode: 'ABCD',
      expectedRoomMode: 'p2p_quick',
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  const draftJoin = new NetworkManager({}, 'ws://test');
  await draftJoin.joinRoom('WXYZ', 'p2p_draft');
  check('joinRoom draft sends expectedRoomMode', () => {
    assert.deepEqual(FakeWebSocket.instances[3].sent[0], {
      type: 'JOIN_ROOM',
      roomCode: 'WXYZ',
      expectedRoomMode: 'p2p_draft',
      protocolVersion: PROTOCOL_VERSION,
    });
  });
});

console.log('\n=== NetworkSessionController room mode handling ===');
await withFakeWebSocket(async () => {
  globalThis.window = { location: { hostname: 'localhost' } };
  const errors = [];
  const shown = [];
  const configSession = {
    setP2PSubMode: (submode) => shown.push(`submode:${submode}`),
    showConfigScreen: (mode) => shown.push(`mode:${mode}`),
  };
  const controller = new NetworkSessionController({
    configSession,
    battleSession: {},
    callbacks: {
      hideGameOver: () => {},
      setModeBadge: () => {},
      setConnectionIndicator: () => {},
      hideLobbyControls: () => {},
      showDisconnect: () => {},
    },
  });

  await controller.joinRoom({
    roomCode: 'ABCD',
    serverAddr: 'localhost:8092',
    expectedRoomMode: 'p2p_quick',
    ui: {
      setRoomError: (error) => errors.push(error),
      updateJoinStatus: () => {},
    },
  });
  FakeWebSocket.instances[0].receive({ type: 'JOIN_ERROR', reason: 'mode_mismatch', roomMode: 'p2p_draft' });
  check('mode_mismatch shows clear error and does not enter config', () => {
    assert.equal(errors.at(-1), '房间模式不匹配：该房间不是当前选择的模式');
    assert.deepEqual(shown, []);
  });

  await controller.joinRoom({
    roomCode: 'EFGH',
    serverAddr: 'localhost:8092',
    expectedRoomMode: 'p2p_quick',
    ui: {
      setRoomError: (error) => errors.push(error),
      updateJoinStatus: () => {},
    },
  });
  FakeWebSocket.instances[1].receive({ type: 'JOIN_SUCCESS', playerId: 'player2', roomMode: 'p2p_quick' });
  check('JOIN_SUCCESS enters matching quick config', () => {
    assert.deepEqual(shown, ['submode:quick', `mode:${GameMode.P2P_QUICK}`]);
  });

  controller.disconnect();
  check('disconnect clears locked room mode', () => {
    assert.equal(controller.getLockedRoomMode?.(), null);
  });
});

console.log('\n=== Signaling server mode checks ===');
const server = await startSignalingServer();
try {
  const quick = await createRoom('p2p_quick');
  check('ROOM_CREATED returns quick roomMode', () => {
    assert.equal(quick.created.roomMode, 'p2p_quick');
  });

  const quickJoin = await joinRoom(quick.created.roomCode, 'p2p_quick');
  check('quick room + quick join succeeds', () => {
    assert.ok(quickJoin.messages.some(message => message.type === 'JOIN_SUCCESS' && message.roomMode === 'p2p_quick'));
  });
  quick.host.socket.destroy();
  quickJoin.client.socket.destroy();

  const quickMismatch = await createRoom('p2p_quick');
  const draftJoin = await joinRoom(quickMismatch.created.roomCode, 'p2p_draft');
  const hostMessages = await waitMessages(quickMismatch.host);
  check('quick room + draft join gets mode_mismatch', () => {
    assert.ok(draftJoin.messages.some(message => message.type === 'JOIN_ERROR' && message.reason === 'mode_mismatch'));
  });
  check('mode mismatch does not notify host peer joined', () => {
    assert.equal(hostMessages.some(message => message.type === 'PEER_JOINED'), false);
  });
  const correctAfterMismatch = await joinRoom(quickMismatch.created.roomCode, 'p2p_quick');
  check('correct mode can still join after mismatch', () => {
    assert.ok(correctAfterMismatch.messages.some(message => message.type === 'JOIN_SUCCESS'));
  });
  quickMismatch.host.socket.destroy();
  draftJoin.client.socket.destroy();
  correctAfterMismatch.client.socket.destroy();

  const draft = await createRoom('p2p_draft');
  const quickWrong = await joinRoom(draft.created.roomCode, 'p2p_quick');
  check('draft room + quick join gets mode_mismatch', () => {
    assert.ok(quickWrong.messages.some(message => message.type === 'JOIN_ERROR' && message.reason === 'mode_mismatch'));
  });
  const draftOk = await joinRoom(draft.created.roomCode, 'p2p_draft');
  check('draft room + draft join succeeds', () => {
    assert.ok(draftOk.messages.some(message => message.type === 'JOIN_SUCCESS' && message.roomMode === 'p2p_draft'));
  });
  draft.host.socket.destroy();
  quickWrong.client.socket.destroy();
  draftOk.client.socket.destroy();
} finally {
  server.kill();
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
