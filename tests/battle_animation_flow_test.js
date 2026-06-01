import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BattleSessionController } from '../session/BattleSessionController.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRuntimeSrc = readFileSync(resolve(__dirname, '../app/AppRuntime.js'), 'utf-8');
const battleSessionSrc = readFileSync(resolve(__dirname, '../session/BattleSessionController.js'), 'utf-8');

function createSession({
  isPveMode = false,
  executeTurnResult = { success: true, battleEnded: false },
} = {}) {
  const events = [];
  const counters = {
    submitAiAction: 0,
    executeTurn: 0,
  };

  const session = new BattleSessionController({
    computeEffectArea() { return []; },
    renderAll() { events.push('renderAll'); },
    renderLog() {},
    clearLog() {},
    setSubmitStatus() {},
    setExecuteDisabled() {},
    showGameOverPanel() {},
    hideGameOverPanel() {},
    showDisconnect() {},
    getNetworkManager() { return null; },
    getConfigMode() { return 'local'; },
    isPveMode() { return isPveMode; },
    setRoute() {},
    appendChatMessage() {},
    resizeCanvas() {},
    animateTurn: async () => {
      events.push('animateTurn');
    },
  });

  session.engine.executeTurn = async () => {
    counters.executeTurn += 1;
    return executeTurnResult;
  };
  session.engine.submitAiAction = async () => {
    counters.submitAiAction += 1;
    return { success: true, action: { skillId: 'stub' } };
  };

  session.startTurnTimeout = () => {};
  session.clearTurnTimeout = () => {};

  session.initGame('娉曞笀', '鎴樺＋', 123, [
    { playerId: 'player1', class: '娉曞笀' },
    { playerId: 'player2', class: '鎴樺＋' },
  ]);

  events.length = 0;

  return { session, events, counters };
}

test('AppRuntime.js passes animateTurn into BattleSessionController', () => {
  assert.match(appRuntimeSrc, /new\s+BattleSessionController\s*\(\s*\{[\s\S]*animateTurn,/);
});

test('AppRuntime.animateTurn clears both keyframes and animEvents', () => {
  assert.match(appRuntimeSrc, /clearKeyframes\?\.\(\);/);
  assert.match(appRuntimeSrc, /clearAnimEvents\(\);/);
});

test('BattleSessionController.executeP2PTurn does not clear keyframes directly', () => {
  const start = battleSessionSrc.indexOf('async executeP2PTurn');
  const end = battleSessionSrc.indexOf('async executeLocalTurn');
  assert.ok(start >= 0 && end > start, 'could not isolate executeP2PTurn body');
  const executeP2PSection = battleSessionSrc.slice(start, end);
  assert.doesNotMatch(executeP2PSection, /clearKeyframes\?\.\(\)/);
});

test('executeLocalTurn awaits animateTurn before the normal post-turn render', async () => {
  const { session, events, counters } = createSession();

  const result = await session.executeLocalTurn();

  assert.equal(result.success, true);
  assert.equal(counters.executeTurn, 1);
  assert.deepEqual(events, ['animateTurn', 'renderAll']);
});

test('executeLocalTurn awaits animateTurn before the battleEnded render', async () => {
  const { session, events, counters } = createSession({
    executeTurnResult: { success: true, battleEnded: true },
  });

  const result = await session.executeLocalTurn();

  assert.equal(result.success, true);
  assert.equal(counters.executeTurn, 1);
  assert.deepEqual(events, ['animateTurn', 'renderAll']);
});

test('submitAiAndExecutePveTurn reaches animateTurn through executeLocalTurn', async () => {
  const { session, events, counters } = createSession({ isPveMode: true });

  session.areMyRequiredActionsReady = () => true;
  session._getPveAiCharacterId = () => 'ai-1';
  session.hasOptionalActionAvailable = () => false;

  const result = await session.submitAiAndExecutePveTurn();

  assert.equal(result, undefined);
  assert.equal(counters.submitAiAction, 1);
  assert.equal(counters.executeTurn, 1);
  assert.equal(events.filter((event) => event === 'animateTurn').length, 1);
  assert.ok(events.includes('renderAll'));
});
