// Combat Event Ontology compatibility migration tests.
// Run: node tests/combat_event_semantics.spec.js

import assert from 'node:assert/strict';
import { GameEngine } from '../engine/GameEngine.js';
import { TurnResolutionBuilder } from '../engine/resolution/TurnResolutionBuilder.js';
import { renderTurnLog } from '../engine/resolution/ResolutionLogRenderer.js';
import { compilePresentationTimeline } from '../presentation/PresentationTimelineCompiler.js';
import { TUTORIAL_LEVELS } from '../tutorial/TutorialSteps.js';
import { createTutorialDAG } from '../tutorial/TutorialDAG.js';
import { MechanicID } from '../tutorial/Mechanics.js';

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`OK ${name}`);
  } catch (error) {
    failed++;
    console.error(`FAIL ${name}`);
    console.error(error?.stack || error);
  }
}

function allEvents(resolution) {
  return (resolution?.phases || []).flatMap(phase => phase.events || []);
}

function allActions(resolution) {
  return (resolution?.phases || []).flatMap(phase => phase.actions || []);
}

function scenarioEngine(combatants, rules = {}) {
  const engine = new GameEngine();
  engine.initBattle({
    mode: 'test',
    seed: 1207,
    combatants,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: 'Hero' },
      { teamId: 'enemies', ownerId: 'player2', control: 'ai', name: 'Enemy' },
    ],
    rules: { victory: 'elimination', friendlyFire: false, suppressGameOverPanel: true, ...rules },
  });
  return engine;
}

async function buildResolution(engine, actions) {
  for (const action of actions) {
    const result = engine.submitAction(action.charId, action.skillId, action.targetPos ?? null);
    assert.equal(result.success, true, `${action.charId} ${action.skillId} submit failed: ${JSON.stringify(result)}`);
  }
  const built = await new TurnResolutionBuilder().build(engine);
  assert.equal(built.success, true);
  return built.resolution;
}

function tutorialModules() {
  return new Map(Object.values(TUTORIAL_LEVELS).map(level => [level.levelId, level]));
}

await test('Test A: projectile mutual destruction is semantic collision, not miss', async () => {
  const {
    isProjectileMutualDestruction,
    isTrueMiss,
    getPresentationKind,
    PresentationKind,
  } = await import('../engine/resolution/CombatEventSemantics.js');

  const engine = scenarioEngine([
    {
      id: 'mage_a', teamId: 'heroes', ownerId: 'player1', control: 'human',
      class: '法师', roleId: 'mage_hermit', loadoutSkillIds: ['mage_blast'],
      position: { q: 0, r: 0 }, resources: { qi: 2 },
    },
    {
      id: 'mage_b', teamId: 'enemies', ownerId: 'player2', control: 'human',
      class: '法师', roleId: 'mage_hermit', loadoutSkillIds: ['mage_blast'],
      position: { q: 2, r: 0 }, resources: { qi: 2 },
    },
  ]);

  const resolution = await buildResolution(engine, [
    { charId: 'mage_a', skillId: 'mage_blast', targetPos: { q: 2, r: 0 } },
    { charId: 'mage_b', skillId: 'mage_blast', targetPos: { q: 0, r: 0 } },
  ]);

  const events = allEvents(resolution);
  const mutual = events.filter(isProjectileMutualDestruction);
  assert.ok(mutual.length >= 1, 'records projectile mutual destruction');
  assert.equal(events.some(event => event.eventType === 'action_failed'), false, 'no action_failed for mutual destruction');
  assert.equal(events.some(isTrueMiss), false, 'no true miss for mutual destruction');
  assert.ok(mutual.every(event => getPresentationKind(event) === PresentationKind.PROJECTILE_MUTUAL_DESTRUCTION));

  const logText = renderTurnLog(resolution).map(entry => entry.text).join('\n');
  assert.match(logText, /弹体相杀|斩击相杀/);
  assert.doesNotMatch(logText, /挥空/);

  const summaries = allActions(resolution);
  assert.equal(summaries.length, 2, 'both actions get summaries');
  for (const action of summaries) {
    assert.match(action.summaryText, /发射弹体/);
    assert.match(action.summaryText, /弹体相杀|斩击相杀/);
    assert.doesNotMatch(action.summaryText, /挥空/);
    assert.notEqual(action.result, 'miss');
  }
});

await test('Test B: true miss still records and presents as 挥空', async () => {
  const { isTrueMiss, getPresentationKind, PresentationKind } = await import('../engine/resolution/CombatEventSemantics.js');
  const engine = scenarioEngine([
    {
      id: 'flash_warrior', teamId: 'heroes', ownerId: 'player1', control: 'human',
      class: '战士', roleId: 'warrior_vanguard', loadoutSkillIds: ['warrior_flash'],
      position: { q: 0, r: 0 }, resources: { rage: 3 },
    },
    {
      id: 'far_target', teamId: 'enemies', ownerId: 'player2', control: 'human',
      class: '战士', roleId: 'warrior_vanguard', loadoutSkillIds: ['warrior_rage'],
      position: { q: 3, r: 3 }, resources: {},
    },
  ]);

  const resolution = await buildResolution(engine, [
    { charId: 'flash_warrior', skillId: 'warrior_flash', targetPos: { q: 2, r: 0 } },
    { charId: 'far_target', skillId: 'warrior_rage', targetPos: null },
  ]);
  const missEvents = allEvents(resolution).filter(isTrueMiss);
  assert.ok(missEvents.length >= 1);
  assert.ok(missEvents.every(event => getPresentationKind(event) === PresentationKind.MISS));
  assert.match(renderTurnLog(resolution).map(entry => entry.text).join('\n'), /挥空/);
});

await test('Test C: same-speed projectile launches start together in one phase', () => {
  const phase = {
    speed: 1,
    events: [
      {
        id: 'declare-a', eventType: 'action_declared', actionId: 'act-a', actorId: 'a', skillId: 'mage_blast',
      },
      {
        id: 'declare-b', eventType: 'action_declared', actionId: 'act-b', actorId: 'b', skillId: 'mage_blast',
      },
      {
        id: 'spawn-a', eventType: 'projectile_created', actionId: 'act-a', actorId: 'a', projectileId: 'p-a',
        metadata: { path: [{ q: 0, r: 0 }, { q: 1, r: 0 }], flags: [], projectileType: 'projectile' },
      },
      {
        id: 'spawn-b', eventType: 'projectile_created', actionId: 'act-b', actorId: 'b', projectileId: 'p-b',
        metadata: { path: [{ q: 2, r: 0 }, { q: 1, r: 0 }], flags: [], projectileType: 'projectile' },
      },
      {
        id: 'clash-a', eventType: 'projectile_collided', actionId: 'act-a', projectileId: 'p-a', targetId: 'p-b',
        metadata: { collisionType: 'mutual_destroy', contactPos: { q: 1, r: 0 }, power: 100, otherPower: 100 },
      },
    ],
  };
  const timeline = compilePresentationTimeline({ schemaVersion: 2, turnNumber: 1, phases: [phase] }, { msPerEvent: 80 });
  const launches = timeline.clips.filter(clip => clip.clipType === 'projectile_launch');
  assert.equal(launches.length, 2);
  assert.equal(launches[0].startMs, launches[1].startMs, 'same-speed launch clips start together');
  const clash = timeline.clips.find(clip => clip.clipType === 'projectile_clash');
  assert.ok(clash.startMs >= launches[0].startMs + launches[0].durationMs);
});

await test('Test D: tutorial navigation availability follows DAG prerequisites', () => {
  const dag = createTutorialDAG(tutorialModules());
  const completed = [
    'tutorial_move_execute',
    'tutorial_attack_target',
    'tutorial_speed_priority',
  ];
  const available = dag.getAvailable(completed);
  assert.deepEqual(available, [
    'tutorial_power_comparison',
    'tutorial_gunfighter_resources',
    'tutorial_charge_shield',
  ]);
});

await test('Test E: gunfighter tutorial teaches zero-ammo collect-reload-attack loop', () => {
  const level = TUTORIAL_LEVELS.tutorial_gunfighter_resources;
  assert.equal(level.playerResources.ammo, 0);
  assert.ok(level.playerLoadoutSkillIds.includes('shooter_roll'));
  assert.ok(level.playerLoadoutSkillIds.includes('shooter_reload'));
  assert.ok(level.playerLoadoutSkillIds.includes('shooter_attack'));
  assert.ok(level._multiTurn, 'resource loop needs multiple turns');
  const turnSkills = Object.values(level._turnScripts || {}).flatMap(script =>
    Object.values(script.playerSteps || {}).flatMap(step => step.allowedSkillIds || []));
  assert.ok(turnSkills.includes('shooter_roll'), 'requires roll/move to collect ammo');
  assert.ok(turnSkills.includes('shooter_reload'), 'requires reload/load after pickup');
  assert.ok(turnSkills.includes('shooter_attack'), 'requires final attack after resource loop');
});

await test('Test F: shield tutorial requires recast timing when demonstrating turn-2 defense', () => {
  const level = TUTORIAL_LEVELS.tutorial_charge_shield;
  const turn2 = level._turnScripts?.[2];
  assert.ok(turn2, 'shield tutorial has second turn');
  const turn2Steps = Object.values(turn2.playerSteps || {});
  assert.ok(turn2Steps.some(step => (step.allowedSkillIds || []).includes('mage_gather')), 'turn 2 requires recasting shield');
  assert.equal(turn2.checkParams?.expectStatusApplied, 'SHIELD_ACTIVE');
  assert.equal(turn2.checkParams?.expectShieldAbsorb, true);
});

await test('Test G: tutorial 6 and 7 teach distinct shield mechanics', () => {
  const six = TUTORIAL_LEVELS.tutorial_charge_shield;
  const seven = TUTORIAL_LEVELS.tutorial_shield_timing;
  assert.notDeepEqual(six.teaches, seven.teaches);
  assert.ok(six.teaches.includes(MechanicID.CHARGE_SHIELD));
  assert.ok(seven.teaches.includes(MechanicID.SHIELD_TIMING));
  assert.notDeepEqual(Object.keys(six.steps), Object.keys(seven.steps));
  assert.ok(seven.prerequisites.includes(MechanicID.CHARGE_SHIELD));
  assert.ok(seven.prerequisites.includes(MechanicID.POWER_COMPARISON));
});

console.log(`\ncombat_event_semantics: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
