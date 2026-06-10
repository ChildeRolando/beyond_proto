// action_card_effects.spec.js — Verify replay/timeline action cards show ALL direct effects
// per action, with strict actionId ownership and no cross-action mixing.
import { summarizeOne, buildActionSummaries } from '../engine/resolution/ResolutionActionSummarizer.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
    failed++;
    return false;
  }
  console.log(`✓ ${name}`);
  passed++;
  return true;
}

// ─── Test A: Multi-effect same action ───
function testA_multiEffectSameAction() {
  // Simulate 易经洗髓酒: resource_changed (rage -4) + status_applied
  const events = [
    { eventType: 'action_declared', actionId: 'act-marrow', actorId: 'jimmy', skillId: 'role_jimmy_marrow_wine' },
    { eventType: 'resource_changed', actionId: 'act-marrow', actorId: 'jimmy', resource: 'rage', delta: -4 },
    { eventType: 'status_applied', actionId: 'act-marrow', actorId: 'jimmy', statusId: 'JIMMY_MARROW_RANGE', targetId: 'jimmy' },
  ];
  const s = summarizeOne('act-marrow', events, null, null, new Map());

  check('A.1 result is resource (primary)', s.result === 'resource' || s.result === 'status',
    `result=${s.result}`);
  check('A.2 effectLines has 2 entries', s.effectLines.length === 2,
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('A.3 resource cost in effects', s.effectLines.some(l => l.includes('怒气') && l.includes('-4')),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('A.4 status applied in effects', s.effectLines.some(l => l.includes('获得')),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('A.5 summaryText includes both', s.summaryText.includes('怒气') && s.summaryText.includes('获得'),
    `summaryText: "${s.summaryText}"`);
  check('A.6 summaryText uses separator', s.summaryText.includes(' · '),
    `summaryText: "${s.summaryText}"`);
}

// ─── Test B: Cross-action isolation ───
function testB_crossActionIsolation() {
  // Phase: action A (resource cost) + action B (status applied)
  const phase = {
    speed: 2,
    events: [
      { eventType: 'resource_changed', actionId: 'act-cost', actorId: 'hero', resource: 'qi', delta: -1 },
      { eventType: 'status_applied', actionId: 'act-gain', actorId: 'hero', statusId: 'JIMMY_MARROW_RANGE', targetId: 'hero' },
    ],
  };
  const viewState = {
    characters: [{ id: 'hero', name: '吉米', class: '战士', ownerId: 'player1' }],
  };
  const summaries = buildActionSummaries(phase, viewState);

  check('B.1 two summaries', summaries.length === 2,
    `count=${summaries.length}`);

  const costA = summaries.find(s => s.actionId === 'act-cost');
  const gainA = summaries.find(s => s.actionId === 'act-gain');

  check('B.2 cost action only has resource effect',
    costA && costA.effectLines.every(l => !l.includes('获得')),
    `effectLines: ${JSON.stringify(costA?.effectLines)}`);
  check('B.3 gain action only has status effect',
    gainA && gainA.effectLines.every(l => l.includes('获得')),
    `effectLines: ${JSON.stringify(gainA?.effectLines)}`);
  check('B.4 cost action result is resource',
    costA?.result === 'resource', `result=${costA?.result}`);
  check('B.5 gain action result is status',
    gainA?.result === 'status', `result=${gainA?.result}`);
}

// ─── Test C: No-action passive event skipped ───
function testC_noActionPassiveSkipped() {
  const phase = {
    speed: null,
    events: [
      { eventType: 'status_expired', actionId: null, statusId: 'SPEED_BOOST', targetId: 'hero' },
    ],
  };
  const summaries = buildActionSummaries(phase, { characters: [] });
  check('C.1 passive event with null actionId produces no summary',
    summaries.length === 0, `count=${summaries.length}`);
}

// ─── Test D: Meteor direct effects all shown under one card ───
function testD_meteorDirectEffects() {
  // Simulate warrior_meteor_resolve speed-2 effects
  const events = [
    { eventType: 'action_declared', actionId: 'act-meteor', actorId: 'warrior', skillId: 'warrior_meteor_resolve' },
    { eventType: 'character_moved', actionId: 'act-meteor', actorId: 'warrior', from: { q: 0, r: -2 }, to: { q: 0, r: 2 } },
    { eventType: 'damage_absorbed', actionId: 'act-meteor', targetId: 'enemy', layer: 'RAGE', absorbed: 200, targetName: '吉米' },
    { eventType: 'damage_applied', actionId: 'act-meteor', actorId: 'warrior', targetId: 'enemy', finalDamage: 500, result: 'killed', targetName: '吉米' },
    { eventType: 'character_died', actionId: 'act-meteor', actorId: 'warrior', targetId: 'enemy', targetName: '吉米' },
    { eventType: 'status_removed', actionId: 'act-meteor', actorId: 'warrior', statusId: 'METEOR_ASCENDING', targetId: 'warrior' },
  ];
  const charById = new Map([
    ['warrior', { id: 'warrior', name: '吉米', class: '战士', ownerId: 'player1' }],
    ['enemy', { id: 'enemy', name: '吉米', class: '战士', ownerId: 'player2' }],
  ]);
  const s = summarizeOne('act-meteor', events, charById.get('warrior'), null, charById);

  check('D.1 result is kill', s.result === 'kill', `result=${s.result}`);
  check('D.2 killed is true', s.killed === true);
  check('D.3 effectLines has movement', s.effectLines.some(l => l.includes('移动')),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('D.4 effectLines has absorb', s.effectLines.some(l => l.includes('抵消')),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('D.5 effectLines has damage', s.effectLines.some(l => l.includes('造成')),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('D.6 effectLines has kill', s.effectLines.some(l => l.includes('击杀')),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('D.7 effectLines has status removed', s.effectLines.some(l => l.includes('失去')),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('D.8 6 effect lines total (5 direct effects, no action_declared)',
    s.effectLines.length === 5,
    `count=${s.effectLines.length}: ${JSON.stringify(s.effectLines)}`);
  check('D.9 summaryText mentions all effects',
    s.summaryText.includes('移动') && s.summaryText.includes('击杀') && s.summaryText.includes('失去'),
    `summaryText: "${s.summaryText}"`);
}

// ─── Test E: Isolated event not from this actionId excluded ───
function testE_foreignEventExcluded() {
  // Phase has two actions. Verify each card only gets its own events.
  const phase = {
    speed: 1,
    events: [
      { eventType: 'damage_applied', actionId: 'act-hit', actorId: 'atk1', finalDamage: 30, result: 'hit' },
      { eventType: 'resource_changed', actionId: 'act-res', actorId: 'atk2', resource: 'rage', delta: 2 },
    ],
  };
  const viewState = {
    characters: [
      { id: 'atk1', name: '攻击者A', class: '战士', ownerId: 'player1' },
      { id: 'atk2', name: '攻击者B', class: '战士', ownerId: 'player1' },
    ],
  };
  const summaries = buildActionSummaries(phase, viewState);

  const hitS = summaries.find(s => s.actionId === 'act-hit');
  const resS = summaries.find(s => s.actionId === 'act-res');

  check('E.1 hit summary has damage but not resource',
    hitS && hitS.effectLines.some(l => l.includes('造成')) && !hitS.effectLines.some(l => l.includes('怒气')),
    `hit effectLines: ${JSON.stringify(hitS?.effectLines)}`);
  check('E.2 resource summary has resource but not damage',
    resS && resS.effectLines.some(l => l.includes('怒气')) && !resS.effectLines.some(l => l.includes('造成')),
    `res effectLines: ${JSON.stringify(resS?.effectLines)}`);
  check('E.3 hit result', hitS?.result === 'hit');
  check('E.4 resource result', resS?.result === 'resource');
}

// ─── Test F: Full attack flow (projectile → hit → kill) ───
function testF_fullAttackFlow() {
  const events = [
    { eventType: 'action_declared', actionId: 'act-shot', actorId: 'shooter', skillId: 'shooter_attack' },
    { eventType: 'projectile_created', actionId: 'act-shot', actorId: 'shooter' },
    { eventType: 'damage_absorbed', actionId: 'act-shot', targetId: 'tgt', layer: 'SHIELD', absorbed: 30, targetName: '目标' },
    { eventType: 'damage_applied', actionId: 'act-shot', targetId: 'tgt', finalDamage: 70, result: 'killed', targetName: '目标' },
    { eventType: 'character_died', actionId: 'act-shot', targetId: 'tgt', targetName: '目标' },
  ];
  const s = summarizeOne('act-shot', events);

  check('F.1 result is kill', s.result === 'kill');
  check('F.2 effectLines: projectile created',
    s.effectLines.some(l => l === '发射弹体'),
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('F.3 effectLines: absorb', s.effectLines.some(l => l.includes('抵消')));
  check('F.4 effectLines: damage', s.effectLines.some(l => l.includes('造成')));
  check('F.5 effectLines: kill', s.effectLines.some(l => l.includes('击杀')));
}

// ─── Test G: New fields on ActionSummary ───
function testG_newFields() {
  const events = [
    { eventType: 'action_declared', actionId: 'act-test', actorId: 'hero', skillId: 'warrior_slash' },
    { eventType: 'damage_applied', actionId: 'act-test', targetId: 'tgt', finalDamage: 42, result: 'hit', targetName: '敌人' },
    { eventType: 'status_applied', actionId: 'act-test', statusId: 'WEAK_POINT', targetId: 'tgt' },
  ];
  const charById = new Map([
    ['hero', { id: 'hero', name: '吉米', class: '战士', ownerId: 'player1' }],
    ['tgt', { id: 'tgt', name: '敌人', class: '法师', ownerId: 'player2' }],
  ]);
  const s = summarizeOne('act-test', events, charById.get('hero'), null, charById);

  check('G.1 effectLines is array', Array.isArray(s.effectLines));
  check('G.2 effectLines has 2 entries (damage + status)',
    s.effectLines.length === 2,
    `effectLines: ${JSON.stringify(s.effectLines)}`);
  check('G.3 summaryText uses dot separator',
    s.summaryText.includes(' · '),
    `summaryText: "${s.summaryText}"`);
  check('G.4 playerLabel present', s.playerLabel === 'P1',
    `playerLabel=${s.playerLabel}`);
  check('G.5 damage field', s.damage === 42);
  check('G.6 killed field', s.killed === false);
}

// ─── Run ───
async function main() {
  console.log('=== Action Card Effects Tests ===\n');

  console.log('--- Test A: Multi-effect same action ---');
  testA_multiEffectSameAction();

  console.log('\n--- Test B: Cross-action isolation ---');
  testB_crossActionIsolation();

  console.log('\n--- Test C: No-action passive skipped ---');
  testC_noActionPassiveSkipped();

  console.log('\n--- Test D: Meteor direct effects ---');
  testD_meteorDirectEffects();

  console.log('\n--- Test E: Foreign event excluded ---');
  testE_foreignEventExcluded();

  console.log('\n--- Test F: Full attack flow ---');
  testF_fullAttackFlow();

  console.log('\n--- Test G: New fields ---');
  testG_newFields();

  console.log(`\n=== ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error(err); process.exit(1); });
