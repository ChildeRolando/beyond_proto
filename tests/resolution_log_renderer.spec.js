// Unit tests for ResolutionActionSummarizer + ResolutionLogRenderer
// Run: node tests/resolution_log_renderer.spec.js

import { buildActionSummaries } from '../engine/resolution/ResolutionActionSummarizer.js';
import { renderTurnLog } from '../engine/resolution/ResolutionLogRenderer.js';
import { SKILLS } from '../engine/SkillData.js';

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

// ─── Test 1: buildActionSummaries — move action ───

console.log('\n[1] buildActionSummaries — move');
{
  const phase = {
    speed: 3,
    events: [
      { id: 'ev1', actionId: 'act-move', actorId: 'hero', type: 'move', skillId: 'warrior_move', result: 'success', to: { q: 1, r: 0 } },
    ],
  };
  const viewState = makeViewState([makeChar()]);
  const summaries = buildActionSummaries(phase, viewState);

  assertEquals(summaries.length, 1, 'one summary');
  const s = summaries[0];
  assertEquals(s.actionId, 'act-move', 'actionId');
  assertEquals(s.actorId, 'hero', 'actorId');
  assertEquals(s.actorName, '测试英雄', 'actorName');
  assertEquals(s.skillId, 'warrior_move', 'skillId');
  assertEquals(s.result, 'move', 'result is move');
  assert(s.summaryText.includes('移动'), 'summaryText mentions move');
  assert(s.logText, 'logText is set');
}

// ─── Test 2: buildActionSummaries — attack hit ───

console.log('\n[2] buildActionSummaries — attack hit');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev2', actionId: 'act-hit', actorId: 'hero', type: 'attack', skillId: 'warrior_slash', result: 'hit', targetId: 'target_b', targetName: '敌人B', damage: 35, killed: false },
    ],
  };
  const viewState = makeViewState([makeChar()]);
  const summaries = buildActionSummaries(phase, viewState);

  assertEquals(summaries.length, 1, 'one summary');
  const s = summaries[0];
  assertEquals(s.result, 'hit', 'result is hit');
  assertEquals(s.targetId, 'target_b', 'targetId');
  assertEquals(s.targetName, '敌人B', 'targetName');
  assertEquals(s.damage, 35, 'damage');
  assertEquals(s.killed, false, 'killed false');
  assert(s.summaryText.includes('敌人B'), 'summaryText mentions target');
  assert(s.summaryText.includes('命中'), 'summaryText includes 命中');
  assert(s.logText.includes('敌人B'), 'logText mentions target');
}

// ─── Test 3: buildActionSummaries — attack kill ───

console.log('\n[3] buildActionSummaries — attack kill');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev3', actionId: 'act-kill', actorId: 'hero', type: 'attack', skillId: 'warrior_slash', result: 'hit', targetId: 'dummy', targetName: '训练稻草人', damage: 120, killed: true },
    ],
  };
  const viewState = makeViewState([makeChar()]);
  const summaries = buildActionSummaries(phase, viewState);

  const s = summaries[0];
  assertEquals(s.result, 'kill', 'result is kill when killed=true');
  assertEquals(s.killed, true, 'killed true');
  assert(s.summaryText.includes('击杀'), 'summaryText includes 击杀');
  assert(s.logText.includes('击杀'), 'logText includes 击杀');
  assert(s.logText.includes('训练稻草人'), 'logText mentions target name');
}

// ─── Test 4: buildActionSummaries — attack miss ───

console.log('\n[4] buildActionSummaries — attack miss');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev4', actionId: 'act-miss', actorId: 'enemy', type: 'attack', skillId: 'mage_blast', result: 'miss' },
    ],
  };
  const viewState = makeViewState([makeChar({ id: 'enemy', name: '敌方法师', class: '法师', ownerId: 'player2' })]);
  const summaries = buildActionSummaries(phase, viewState);

  const s = summaries[0];
  assertEquals(s.result, 'miss', 'result is miss');
  assert(s.summaryText.includes('挥空'), 'summaryText includes 挥空');
  assert(s.logText.includes('挥空'), 'logText includes 挥空');
  assert(!s.killed, 'killed is falsy');
}

// ─── Test 5: buildActionSummaries — resource action ───

console.log('\n[5] buildActionSummaries — resource');
{
  const phase = {
    speed: 2,
    events: [
      { id: 'ev5', actionId: 'act-res', actorId: 'hero', type: 'resource', skillId: 'warrior_rage', result: 'success', resource: 'rage', amount: 3 },
    ],
  };
  const viewState = makeViewState([makeChar()]);
  const summaries = buildActionSummaries(phase, viewState);

  const s = summaries[0];
  assertEquals(s.result, 'resource', 'result is resource');
  assert(s.summaryText.includes('rage') || s.summaryText.includes('怒') || s.summaryText.includes('+'), 'summaryText mentions resource change');
}

// ─── Test 6: buildActionSummaries — same actor two attacks (hit + miss) ───

console.log('\n[6] buildActionSummaries — same actor hit+miss');
{
  const phase = {
    speed: 1,
    events: [
      { id: 'ev6a', actionId: 'act-a', actorId: 'attacker', type: 'attack', skillId: 'mage_blast', result: 'hit', targetId: 'target_hit', targetName: '目标H', damage: 45, killed: false },
      { id: 'ev6b', actionId: 'act-b', actorId: 'attacker', type: 'attack', skillId: 'mage_blast', result: 'miss' },
    ],
  };
  const viewState = makeViewState([makeChar({ id: 'attacker', name: '攻击者', class: '法师', ownerId: 'player1' })]);
  const summaries = buildActionSummaries(phase, viewState);

  assertEquals(summaries.length, 2, 'two summaries');
  const hitSummary = summaries.find(s => s.result === 'hit');
  const missSummary = summaries.find(s => s.result === 'miss');
  assert(hitSummary, 'has hit summary');
  assert(missSummary, 'has miss summary');
  assertEquals(hitSummary.actorId, 'attacker', 'hit actorId');
  assertEquals(missSummary.actorId, 'attacker', 'miss actorId');
  assert(hitSummary.actionId !== missSummary.actionId, 'distinct actionIds');
  assert(hitSummary.summaryText.includes('命中'), 'hit summaryText includes 命中');
  assert(missSummary.summaryText.includes('挥空'), 'miss summaryText includes 挥空');
  assert(!missSummary.summaryText.includes('命中'), 'miss summaryText does NOT include 命中');
  assert(!hitSummary.summaryText.includes('挥空'), 'hit summaryText does NOT include 挥空');
  // Log texts must also be distinct
  assert(hitSummary.logText !== missSummary.logText, 'logText differs between hit and miss');
}

// ─── Test 7: buildActionSummaries — utility action ───

console.log('\n[7] buildActionSummaries — utility/pass');
{
  const phase = {
    speed: 0,
    events: [
      { id: 'ev7', actionId: 'act-pass', actorId: 'dummy', type: 'utility', skillId: 'tutorial_dummy_wait', result: 'success' },
    ],
  };
  const viewState = makeViewState([makeChar({ id: 'dummy', name: '训练稻草人', ownerId: 'ai' })]);
  const summaries = buildActionSummaries(phase, viewState);

  const s = summaries[0];
  assertEquals(s.result, 'utility', 'result is utility');
  assert(s.summaryText.length > 0, 'summaryText is non-empty');
  assert(s.logText.length > 0, 'logText is non-empty');
}

// ─── Test 8: renderTurnLog — mixed resolution ───

console.log('\n[8] renderTurnLog — mixed phases');
{
  const resolution = {
    turnNumber: 1,
    phases: [
      {
        speed: 3,
        actions: [
          { actionId: 'act-move', actorId: 'hero', actorName: '测试英雄', skillId: 'warrior_move', skillName: '移动', result: 'move', summaryText: '移动至 (1,0)', logText: '测试英雄 → 移动 (1,0)' },
        ],
      },
      {
        speed: 1,
        actions: [
          { actionId: 'act-hit', actorId: 'hero', actorName: '测试英雄', skillId: 'warrior_slash', skillName: '普通斩', result: 'kill', targetName: '训练稻草人', damage: 120, killed: true, summaryText: '→训练稻草人 击杀', logText: '测试英雄 ⚔ 普通斩 → 训练稻草人 击杀（伤害 120）' },
          { actionId: 'act-miss', actorId: 'enemy', actorName: '敌方法师', skillId: 'mage_blast', skillName: '气功波', result: 'miss', summaryText: '挥空', logText: '敌方法师 🔮 气功波 挥空' },
        ],
      },
    ],
  };

  const entries = renderTurnLog(resolution);

  assert(entries.length >= 3, `has at least 3 entries (header + 2 actions), got ${entries.length}`);
  assertEquals(entries[0].type, 'turn', 'first entry type is turn header');
  assertEquals(entries[1].type, 'move', 'second entry type is move');
  assert(entries.some(e => e.type === 'kill'), 'has kill entry');
  assert(entries.some(e => e.type === 'miss'), 'has miss entry');

  // Each action entry must reference its actionId (skip turn header)
  for (const e of entries.filter(e => e.type !== 'turn' && e.type !== 'battle_end')) {
    assert(e.actionId, `entry has actionId: ${e.type}`);
    assert(typeof e.text === 'string' && e.text.length > 0, `entry has text: ${e.type}`);
  }
}

// ─── Test 9: renderTurnLog — suppress game over ───

console.log('\n[9] renderTurnLog — suppress game over');
{
  const resolution = {
    turnNumber: 1,
    suppressGameOver: true,
    phases: [
      {
        speed: 1,
        actions: [
          { actionId: 'act-kill', actorId: 'hero', actorName: '测试英雄', skillId: 'warrior_slash', skillName: '普通斩', result: 'kill', targetName: '训练稻草人', killed: true, summaryText: '→训练稻草人 击杀', logText: '测试英雄 ⚔ 普通斩 → 训练稻草人 击杀' },
        ],
      },
    ],
  };

  const entries = renderTurnLog(resolution);

  // Must NOT contain "战斗结束" or "胜者"
  const hasVictory = entries.some(e => /战斗结束|胜者/i.test(e.text));
  assert(!hasVictory, 'suppressGameOver prevents victory log');
}

// ─── Test 10: buildActionSummaries — playerLabel ───

console.log('\n[10] buildActionSummaries — playerLabel');
{
  const phase = {
    speed: 3,
    events: [
      { id: 'ev10', actionId: 'act-p1', actorId: 'hero', type: 'move', skillId: 'warrior_move', result: 'success' },
    ],
  };
  const viewState = makeViewState([makeChar({ ownerId: 'player1' })]);
  const summaries = buildActionSummaries(phase, viewState);

  assertEquals(summaries[0].playerLabel, 'P1', 'player1 → P1');
}

{
  const viewState = makeViewState([makeChar({ ownerId: 'ai' })]);
  const phase = {
    speed: 0,
    events: [
      { id: 'ev10b', actionId: 'act-ai', actorId: 'hero', type: 'utility', skillId: 'tutorial_dummy_wait', result: 'success' },
    ],
  };
  const summaries = buildActionSummaries(phase, viewState);
  assertEquals(summaries[0].playerLabel, 'AI', 'ai → AI');
}

// ─── Summary ───

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}, 失败: ${fail}`);
if (fail > 0) process.exit(1);
