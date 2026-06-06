// Regression: rematch must route back to exact mode (local_solo → local_solo, etc.)
// Bug: wasPve ? 'pve' : 'local' collapsed local_solo into 'pve', which normalizes to local_coop.

import assert from 'node:assert/strict';

// ── Mock DOM before module import ──

const elStore = {};

function makeEl(id) {
  if (!elStore[id]) {
    elStore[id] = { listeners: {}, value: '', disabled: false, textContent: '', style: { display: '' } };
  }
  const data = elStore[id];
  return {
    addEventListener: (event, fn) => { data.listeners[event] = fn; },
    removeEventListener: () => {},
    get value() { return data.value; },
    set value(v) { data.value = v; },
    get disabled() { return data.disabled; },
    set disabled(v) { data.disabled = v; },
    get textContent() { return data.textContent; },
    set textContent(v) { data.textContent = v; },
    get style() { return data.style; },
    get classList() {
      return {
        _classes: [],
        add: (c) => { data._classes = [...(data._classes || []), c]; },
        remove: (c) => { data._classes = (data._classes || []).filter(x => x !== c); },
        contains: (c) => (data._classes || []).includes(c),
      };
    },
  };
}

function fireClick(id) {
  const data = elStore[id];
  if (data?.listeners?.click) data.listeners.click();
}

global.document = {
  getElementById: (id) => makeEl(id),
  querySelectorAll: () => [],
  addEventListener: () => {},
};

global.window = {};

// ── Dynamic import after mocks ──

const { initGameOverController } = await import('../ui/battle/GameOverController.js');

// Helpers
function makeMockSession() {
  return {
    clearTurnTimeout: () => {},
    resetForConfigScreen: () => {},
  };
}

function makeCallbacks() {
  let capturedMode = null;
  return {
    capturedMode: () => capturedMode,
    setRoute: () => {},
    showConfigScreen: (mode) => { capturedMode = mode; },
    startBattleFromConfigs: () => {},
    resetNetworkState: () => {},
    getBattlePlayerConfigs: () => [],
  };
}

console.log('=== Game Over Rematch Mode Regression Tests ===\n');

// ── Test 1: local_solo rematch → local_solo ──

{
  const cb = makeCallbacks();
  initGameOverController({
    battleSession: makeMockSession(),
    getNetworkManager: () => null,
    getCurrentGameMode: () => 'local_solo',
    startLobbyUi: { hideRoomSetup: () => {}, resetConnectionUI: () => {} },
    callbacks: cb,
  });

  fireClick('btn-rematch');

  assert.equal(cb.capturedMode(), 'local_solo',
    `local_solo rematch: expected showConfigScreen('local_solo'), got '${cb.capturedMode()}'`);
  console.log('  ✓ local_solo rematch → local_solo');
}

// ── Test 2: local_coop rematch → local_coop ──

{
  const cb = makeCallbacks();
  initGameOverController({
    battleSession: makeMockSession(),
    getNetworkManager: () => null,
    getCurrentGameMode: () => 'local_coop',
    startLobbyUi: { hideRoomSetup: () => {}, resetConnectionUI: () => {} },
    callbacks: cb,
  });

  fireClick('btn-rematch');

  assert.equal(cb.capturedMode(), 'local_coop',
    `local_coop rematch: expected showConfigScreen('local_coop'), got '${cb.capturedMode()}'`);
  console.log('  ✓ local_coop rematch → local_coop');
}

// ── Test 3: local_duel rematch → local_duel ──

{
  const cb = makeCallbacks();
  initGameOverController({
    battleSession: makeMockSession(),
    getNetworkManager: () => null,
    getCurrentGameMode: () => 'local_duel',
    startLobbyUi: { hideRoomSetup: () => {}, resetConnectionUI: () => {} },
    callbacks: cb,
  });

  fireClick('btn-rematch');

  assert.equal(cb.capturedMode(), 'local_duel',
    `local_duel rematch: expected showConfigScreen('local_duel'), got '${cb.capturedMode()}'`);
  console.log('  ✓ local_duel rematch → local_duel');
}

// ── Test 4: Regression — NOT 'pve' or 'local_coop' for local_solo ──

{
  const cb = makeCallbacks();
  initGameOverController({
    battleSession: makeMockSession(),
    getNetworkManager: () => null,
    getCurrentGameMode: () => 'local_solo',
    startLobbyUi: { hideRoomSetup: () => {}, resetConnectionUI: () => {} },
    callbacks: cb,
  });

  fireClick('btn-rematch');

  assert.notEqual(cb.capturedMode(), 'pve',
    'local_solo rematch must NOT pass legacy "pve" mode');
  assert.notEqual(cb.capturedMode(), 'local_coop',
    'local_solo rematch must NOT pass "local_coop"');
  console.log('  ✓ local_solo rematch does NOT route to pve or local_coop');
}

// ── Test 5: P2P rematch still passes 'p2p' ──

{
  const cb = makeCallbacks();
  initGameOverController({
    battleSession: makeMockSession(),
    getNetworkManager: () => ({ mode: 'p2p' }),
    getCurrentGameMode: () => 'p2p_duel',
    startLobbyUi: { hideRoomSetup: () => {}, resetConnectionUI: () => {} },
    callbacks: cb,
  });

  fireClick('btn-rematch');

  assert.equal(cb.capturedMode(), 'p2p',
    `P2P rematch: expected showConfigScreen('p2p'), got '${cb.capturedMode()}'`);
  console.log('  ✓ P2P rematch → p2p');
}

console.log('\ngame_over_rematch_mode_test: passed');
