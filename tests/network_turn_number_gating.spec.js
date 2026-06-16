// NetworkManager turnNumber gating regression tests.
// Run: node tests/network_turn_number_gating.spec.js

import assert from 'node:assert/strict';
import { NetworkManager } from '../engine/NetworkManager.js';

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
  globalThis.WebSocket = FakeWebSocket;
  FakeWebSocket.instances = [];
  try {
    await fn();
  } finally {
    globalThis.WebSocket = original;
  }
}

function game(payload) {
  return { type: 'GAME', payload };
}

console.log('\n=== NetworkManager turnNumber gating ===');

await withFakeWebSocket(async () => {
  const remoteActions = [];
  let onReadyCount = 0;
  const nm = new NetworkManager({
    onRemoteSubmitted: action => remoteActions.push(action),
    onReady: () => { onReadyCount++; },
  }, 'ws://test');
  await nm.createRoom('p2p_draft');
  const ws = FakeWebSocket.instances[0];
  ws.receive({ type: 'ROOM_CREATED', roomCode: 'ABCD', roomMode: 'p2p_draft' });
  ws.receive({ type: 'PEER_JOINED' });

  ws.receive(game({ type: 'TURN_ACTION', turnNumber: 2, charId: 'p2c1', skillId: 'warrior_rage', targetPos: null }));
  ws.receive(game({ type: 'TURN_READY', turnNumber: 2 }));
  nm.markReady();

  check('future turn action is queued, not submitted immediately', () => {
    assert.deepEqual(remoteActions, []);
  });
  check('future turn ready does not complete current turn', () => {
    assert.equal(onReadyCount, 0);
  });

  nm.clearTurn();
  check('clearTurn drains queued future action for new current turn', () => {
    assert.deepEqual(remoteActions, [{
      turnNumber: 2,
      charId: 'p2c1',
      skillId: 'warrior_rage',
      targetPos: null,
    }]);
  });

  nm.markReady();
  check('queued future ready completes only after local turn 2 ready', () => {
    assert.equal(onReadyCount, 1);
  });
  check('local turn 2 ready is sent with turnNumber 2', () => {
    const readyFrames = ws.sent.filter(frame => frame.type === 'GAME' && frame.payload?.type === 'TURN_READY');
    assert.equal(readyFrames.at(-1).payload.turnNumber, 2);
  });

  ws.receive(game({ type: 'TURN_ACTION', turnNumber: 1, charId: 'stale', skillId: 'mage_blast', targetPos: { q: 0, r: 0 } }));
  ws.receive(game({ type: 'TURN_READY', turnNumber: 1 }));
  check('stale turn action is ignored', () => {
    assert.equal(remoteActions.length, 1);
  });
  check('stale turn ready does not re-enter onReady', () => {
    assert.equal(onReadyCount, 1);
  });
});

console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
