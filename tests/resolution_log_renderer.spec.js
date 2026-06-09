// Unit tests for R2 architecture:
//   ResolutionActionSummarizer — action-level summaries (Timeline)
//   ResolutionLogRenderer — event-level detail (Combat Log)
//   CombatLogStore — append-only accumulated log
// Run: node tests/resolution_log_renderer.spec.js

import { buildActionSummaries } from '../engine/resolution/ResolutionActionSummarizer.js';
import { renderTurnLog, renderEventLogEntry } from '../engine/resolution/ResolutionLogRenderer.js';
import { CombatLogStore } from '../engine/CombatLogStore.js';

let pass = 0, fail = 0;

function assert(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

function assertEquals(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function assertMatch(actual, pattern, label) {
  if (pattern.test(actual)) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — "${actual}" does not match ${pattern}`); }
}

// ─── Helpers ───

function makeViewState(characters = []) {
  return { characters };
}

function makeChar(overrides = {}) {
  return {
    id: 'hero',
    name: '测试英雄',
    class: '战士',
    ownerId: 'player1',
    teamId: 'player1',
    position: { q: 0, r: 0 },
    alive: true,
    resources: { hp: 100, qi: 3 },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════
// PART 1: ResolutionActionSummarizer (action-level → Timeline)
// ═══════════════════════════════════════════════════════

console.log('\n=== Part 1: ResolutionActionSummarizer (action-level) ===');

// Test 1a: move action → result: 'move' (canonical character_moved)
console.log('\n[1a] move action');
{
  const phase = {
    speed: 3,
    events: [
      { id: 'ev1', actionId: 'act-move', actorId: 'hero', eventType: 'character_moved', skillId: 'warrior_move', to: { q: 1, r: 0 } },
    ],
  };
  const viewState = makeViewState([makeChar()]);
  const summaries = buildActionSummaries(phase, viewState);

  assertEquals(summaries.length, 1, 'one summary');
  const s = summaries[0];
  assertEquals(s.actionId, 'act-move', 'actionId');
  assertEquals(s.actorId, 'hero', 'actorId');
  assertEquals(s.actorName, '测试英雄', 'actorName');
  assertEquals(s.result, 'move', 'result is move');
  assert(s.summaryText.includes('移动'), 'summaryText mentions move');
  assertEquals(s.logText, undefined, 'action summaries do NOT have logText');
}

// Test 1b: attack hit (canonical damage_applied)
console.log('\n[1b] attack hit');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev2', actionId: 'act-hit', actorId: 'hero', eventType: 'damage_applied', skillId: 'warrior_slash', targetId: 'tgt', targetName: '敌人B', finalDamage: 35, result: 'hit' },
    ],
  };
  const summaries = buildActionSummaries(phase, makeViewState([makeChar()]));
  const s = summaries[0];
  assertEquals(s.result, 'hit', 'result is hit');
  assertEquals(s.targetName, '敌人B', 'targetName');
  assertEquals(s.damage, 35, 'damage');
  assert(s.summaryText.includes('命中'), 'summaryText includes 命中');
}

// Test 1c: attack kill (canonical damage_applied + character_died)
console.log('\n[1c] attack kill');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev3', actionId: 'act-kill', actorId: 'hero', eventType: 'damage_applied', skillId: 'warrior_slash', targetName: '训练稻草人', finalDamage: 120, result: 'killed' },
      { id: 'ev3b', actionId: 'act-kill', actorId: 'hero', eventType: 'character_died', targetId: 'dummy', targetName: '训练稻草人', finalDamage: 120 },
    ],
  };
  const summaries = buildActionSummaries(phase, makeViewState([makeChar()]));
  const s = summaries[0];
  assertEquals(s.result, 'kill', 'result is kill');
  assertEquals(s.killed, true, 'killed true');
  assert(s.summaryText.includes('击杀'), 'summaryText includes 击杀');
}

// Test 1d: attack miss (canonical action_failed)
console.log('\n[1d] attack miss');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev4', actionId: 'act-miss', actorId: 'enemy', eventType: 'action_failed', skillId: 'mage_blast', result: 'miss' },
    ],
  };
  const summaries = buildActionSummaries(phase, makeViewState([makeChar({ id: 'enemy', name: '敌方法师', class: '法师' })]));
  const s = summaries[0];
  assertEquals(s.result, 'miss', 'result is miss');
  assert(s.summaryText.includes('挥空'), 'summaryText includes 挥空');
}

// Test 1e: resource gain (canonical resource_changed with delta)
console.log('\n[1e] resource gain');
{
  const phase = {
    speed: 2,
    events: [
      { id: 'ev5', actionId: 'act-res', actorId: 'hero', eventType: 'resource_changed', skillId: 'warrior_rage', resource: 'rage', delta: 3 },
    ],
  };
  const summaries = buildActionSummaries(phase, makeViewState([makeChar()]));
  assertEquals(summaries[0].result, 'resource', 'result is resource');
}

// Test 1f: resource cost (canonical resource_changed with negative delta)
console.log('\n[1f] resource cost');
{
  const phase = {
    speed: 2,
    events: [
      { id: 'ev5b', actionId: 'act-cost', actorId: 'hero', eventType: 'resource_changed', skillId: 'mage_blast', resource: 'qi', delta: -1 },
    ],
  };
  const summaries = buildActionSummaries(phase, makeViewState([makeChar()]));
  assertEquals(summaries[0].result, 'resource', 'result is resource');
  // Cost should show negative delta, not gain
  assert(summaries[0].summaryText.includes('-1'), 'summaryText shows cost');
}

// Test 1g: same actor hit+miss — summaries distinguish
console.log('\n[1g] same actor hit+miss');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev6a', actionId: 'act-a', actorId: 'attacker', eventType: 'damage_applied', skillId: 'mage_blast', targetName: '目标H', finalDamage: 45, result: 'hit' },
      { id: 'ev6b', actionId: 'act-b', actorId: 'attacker', eventType: 'action_failed', skillId: 'mage_blast', result: 'miss' },
    ],
  };
  const summaries = buildActionSummaries(phase, makeViewState([makeChar({ id: 'attacker', name: '攻击者', class: '法师' })]));
  assertEquals(summaries.length, 2, 'two summaries');
  const hitS = summaries.find(s => s.result === 'hit');
  const missS = summaries.find(s => s.result === 'miss');
  assert(hitS, 'has hit summary');
  assert(missS, 'has miss summary');
  assert(hitS.summaryText.includes('命中'), 'hit summaryText includes 命中');
  assert(missS.summaryText.includes('挥空'), 'miss summaryText includes 挥空');
}

// ═══════════════════════════════════════════════════════
// PART 2: ResolutionLogRenderer (event-level → Combat Log)
// ═══════════════════════════════════════════════════════

console.log('\n=== Part 2: ResolutionLogRenderer (event-level) ===');

// Test 2a: renderTurnLog from resolution with canonical events
console.log('\n[2a] renderTurnLog — mixed events');
{
  const resolution = {
    turnNumber: 1,
    phases: [
      {
        speed: 3,
        viewState: makeViewState([makeChar()]),
        events: [
          { id: 'ev-move', actionId: 'act-move', actorId: 'hero', eventType: 'character_moved', to: { q: 1, r: 0 } },
        ],
      },
      {
        speed: 1,
        viewState: makeViewState([makeChar(), makeChar({ id: 'enemy', name: '敌方法师', class: '法师', ownerId: 'player2' })]),
        events: [
          { id: 'ev-hit', actionId: 'act-hit', actorId: 'hero', eventType: 'damage_applied', skillId: 'warrior_slash', targetName: '训练稻草人', finalDamage: 35, result: 'hit' },
          { id: 'ev-miss', actionId: 'act-miss', actorId: 'enemy', eventType: 'action_failed', skillId: 'mage_blast', result: 'miss', reason: 'miss' },
        ],
      },
    ],
  };

  const entries = renderTurnLog(resolution);

  // Should have: turn header + move + hit + fail = 4 entries
  assert(entries.length >= 4, `at least 4 entries, got ${entries.length}`);
  assertEquals(entries[0].type, 'turn', 'first is turn header');
  assertEquals(entries[1].type, 'move', 'second is move');
  assert(entries.some(e => e.type === 'hit'), 'has hit entry');
  assert(entries.some(e => e.type === 'fail'), 'has fail miss entry');

  const hitEntry = entries.find(e => e.type === 'hit');
  assert(hitEntry.text.includes('训练稻草人'), 'hit mentions target');
  assert(hitEntry.text.includes('伤害'), 'hit shows damage');
  assert(hitEntry.text.includes('35'), 'hit shows damage number');

  const failEntry = entries.find(e => e.type === 'fail');
  assert(failEntry.text.includes('挥空'), 'fail says 挥空');
}

// Test 2b: renderTurnLog — suppressGameOver
console.log('\n[2b] renderTurnLog — suppress game over');
{
  const resolution = {
    turnNumber: 1,
    suppressGameOver: true,
    winner: 'player1',
    phases: [
      { speed: 1, viewState: makeViewState([makeChar()]), events: [
        { id: 'ev-kill', actionId: 'act-kill', actorId: 'hero', eventType: 'character_died', targetName: 'dummy', finalDamage: 100 },
      ]},
    ],
  };
  const entries = renderTurnLog(resolution);
  const hasVictory = entries.some(e => /战斗结束|胜者/.test(e.text));
  assert(!hasVictory, 'suppressGameOver hides victory message');
}

// Test 2c: renderEventLogEntry — individual event rendering (canonical)
console.log('\n[2c] renderEventLogEntry — individual events');
{
  const charById = new Map([
    ['hero', makeChar()],
    ['enemy', makeChar({ id: 'enemy', name: '敌人', class: '法师' })],
  ]);

  // move (canonical character_moved)
  const moveEntry = renderEventLogEntry(
    { id: 'e1', actionId: 'a1', actorId: 'hero', eventType: 'character_moved', to: { q: 1, r: 0 } },
    charById
  );
  assertEquals(moveEntry.type, 'move', 'move type');
  assert(moveEntry.text.includes('移动'), 'move says 移动');

  // kill (canonical character_died)
  const killEntry = renderEventLogEntry(
    { id: 'e2', actionId: 'a2', actorId: 'hero', eventType: 'character_died', targetName: '稻草人', finalDamage: 50 },
    charById
  );
  assertEquals(killEntry.type, 'kill', 'kill type');
  assert(killEntry.text.includes('被击杀'), 'kill says 被击杀');

  // miss (canonical action_failed with reason)
  const missEntry = renderEventLogEntry(
    { id: 'e3', actionId: 'a3', actorId: 'enemy', eventType: 'action_failed', skillId: 'mage_blast', result: 'miss', reason: 'miss' },
    charById
  );
  assertEquals(missEntry.type, 'fail', 'miss type');
  assert(missEntry.text.includes('挥空'), 'miss says 挥空');
  assert(!missEntry.text.includes('miss'), 'miss does not contain raw "miss"');

  // resource (canonical resource_changed with negative delta — cost)
  const resEntry = renderEventLogEntry(
    { id: 'e4', actionId: 'a4', actorId: 'hero', eventType: 'resource_changed', resource: 'rage', delta: -1 },
    charById
  );
  assertEquals(resEntry.type, 'resource', 'resource type');
  assert(resEntry.text.includes('消耗'), 'negative delta shows 消耗');

  // resource (canonical resource_changed with positive delta — gain)
  const gainEntry = renderEventLogEntry(
    { id: 'e4b', actionId: 'a4b', actorId: 'hero', eventType: 'resource_changed', resource: 'qi', delta: 1 },
    charById
  );
  assertEquals(gainEntry.type, 'resource', 'gain type');
  assert(gainEntry.text.includes('获得') || gainEntry.text.includes('+1'), 'positive delta shows gain');
}

// ═══════════════════════════════════════════════════════
// PART 3: CombatLogStore (append-only accumulation)
// ═══════════════════════════════════════════════════════

console.log('\n=== Part 3: CombatLogStore (append-only) ===');

console.log('\n[3a] append accumulates entries across turns');
{
  const store = new CombatLogStore();
  assertEquals(store.getEntries().length, 0, 'starts empty');

  const res1 = {
    turnNumber: 1,
    phases: [
      { speed: 3, viewState: makeViewState([makeChar()]), events: [
        { id: 'ev1', actionId: 'act1', actorId: 'hero', eventType: 'character_moved', to: { q: 1, r: 0 } },
      ]},
    ],
  };
  store.appendResolution(res1);
  const after1 = store.getEntries();
  assert(after1.length >= 2, 'turn 1 has header + move');

  // Append turn 2
  const res2 = {
    turnNumber: 2,
    phases: [
      { speed: 1, viewState: makeViewState([makeChar()]), events: [
        { id: 'ev2', actionId: 'act2', actorId: 'hero', eventType: 'damage_applied', result: 'hit', targetName: '目标', finalDamage: 30 },
      ]},
    ],
  };
  store.appendResolution(res2);
  const after2 = store.getEntries();
  assert(after2.length > after1.length, 'turn 2 appends more entries');
  assert(after2.some(e => e.text.includes('第 2 回合')), 'turn 2 header present');
}

console.log('\n[3b] reset clears all entries');
{
  const store = new CombatLogStore();
  store.appendResolution({
    turnNumber: 1,
    phases: [{ speed: 3, viewState: makeViewState([makeChar()]), events: [{ id: 'e', actionId: 'a', actorId: 'hero', eventType: 'character_moved' }] }],
  });
  assert(store.getEntries().length > 0, 'has entries before reset');
  store.reset();
  assertEquals(store.getEntries().length, 0, 'empty after reset');
}

console.log('\n[3c] serialize / deserialize roundtrip');
{
  const store = new CombatLogStore();
  store.appendResolution({
    turnNumber: 1,
    phases: [{ speed: 3, viewState: makeViewState([makeChar()]), events: [{ id: 'e', actionId: 'a', actorId: 'hero', eventType: 'character_moved' }] }],
  });
  const data = store.serialize();
  const store2 = new CombatLogStore();
  store2.deserialize(data);
  assertEquals(store2.getEntries().length, store.getEntries().length, 'roundtrip same count');
}

// ─── Summary ───

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}, 失败: ${fail}`);
if (fail > 0) process.exit(1);
