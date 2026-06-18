// Unit tests for ProjectileResolutionCompiler
// Run: node tests/projectile_resolution_compiler.spec.js

import { ProjectileResolutionCompiler, compileAllPhases } from '../engine/resolution/ProjectileResolutionCompiler.js';
import { summarizeOne, buildActionSummaries } from '../engine/resolution/ResolutionActionSummarizer.js';
import { createTurnResolutionBuilder } from '../engine/resolution/TurnResolutionBuilder.js';
import { BattleSessionController } from '../session/BattleSessionController.js';
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

function assertDeepEquals(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${b}, got ${a}`); }
}

function makeEvent(eventType, overrides = {}) {
  return {
    id: overrides.id || `evt-${Math.random().toString(36).slice(2)}`,
    eventType,
    turnNumber: overrides.turnNumber ?? 1,
    phaseSpeed: overrides.phaseSpeed ?? 3,
    phaseKind: overrides.phaseKind ?? 'speed',
    actionId: overrides.actionId || null,
    actorId: overrides.actorId || null,
    skillId: overrides.skillId || null,
    projectileId: overrides.projectileId || null,
    targetId: overrides.targetId || null,
    targetPos: overrides.targetPos || null,
    from: overrides.from || null,
    to: overrides.to || null,
    basePower: overrides.basePower ?? null,
    finalDamage: overrides.finalDamage ?? null,
    reason: overrides.reason || null,
    metadata: overrides.metadata || null,
    ...overrides.extra,
  };
}

// ═══════════════════════════════════════════
// Test A: Collision endpoint override
// ═══════════════════════════════════════════

console.log('\n=== Test A: Collision endpoint override ===');

{
  const compiler = new ProjectileResolutionCompiler();

  // Projectile created with intendedTo (0,5)
  compiler.build([
    makeEvent('projectile_created', {
      projectileId: 'proj-A',
      actionId: 'act-1',
      actorId: 'char-1',
      from: { q: 0, r: 0 },
      to: { q: 0, r: 5 },
      basePower: 100,
      metadata: { path: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 0, r: 2 }, { q: 0, r: 3 }, { q: 0, r: 4 }, { q: 0, r: 5 }], flags: [], speed: 1, isMelee: false, projectileType: 'projectile' },
    }),
  ]);

  // Collision occurs at (0,2) — body contact hit
  compiler.build([
    makeEvent('projectile_collided', {
      projectileId: 'proj-A',
      actionId: 'act-1',
      targetId: 'char-2',
      targetPos: { q: 0, r: 2 },
      finalDamage: 30,
      metadata: { hitType: 'body_contact', contactPos: { q: 0, r: 2 }, isMelee: false, flags: [] },
    }),
  ]);

  const facts = compiler.getFacts();
  assertEquals(facts.length, 1, 'A1: one fact produced');
  const fact = facts[0];

  // actualEnd MUST be (0,2), NOT (0,5)
  assertDeepEquals(fact.actualEnd, { q: 0, r: 2 }, 'A2: actualEnd = (0,2) — collision point');
  assert(fact.actualEnd.q !== 5 || fact.actualEnd.r !== 5, 'A3: actualEnd is NOT intendedTo (0,5)');

  // Verbatim intendedTo is preserved
  assertDeepEquals(fact.intendedTo, { q: 0, r: 5 }, 'A4: intendedTo preserved as (0,5)');

  assertEquals(fact.endReason, 'hit', 'A5: endReason = hit');
  assertEquals(fact.status, 'collided', 'A6: status = collided');
  assertEquals(fact.collidedWith, 'char-2', 'A7: collidedWith = target char-2');
}

// ═══════════════════════════════════════════
// Test B: Mutual annihilation
// ═══════════════════════════════════════════

console.log('\n=== Test B: Mutual annihilation ===');

{
  const compiler = new ProjectileResolutionCompiler();

  // Two projectiles heading toward each other
  compiler.build([
    makeEvent('projectile_created', {
      projectileId: 'proj-1',
      actionId: 'act-1',
      actorId: 'char-1',
      from: { q: -2, r: 0 },
      to: { q: 2, r: 0 },
      basePower: 100,
      metadata: { path: [{ q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], flags: [], speed: 1, isMelee: false, projectileType: 'projectile' },
    }),
    makeEvent('projectile_created', {
      projectileId: 'proj-2',
      actionId: 'act-2',
      actorId: 'char-2',
      from: { q: 2, r: 0 },
      to: { q: -2, r: 0 },
      basePower: 100,
      metadata: { path: [{ q: 2, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 0 }, { q: -1, r: 0 }, { q: -2, r: 0 }], flags: [], speed: 1, isMelee: false, projectileType: 'projectile' },
    }),
  ]);

  // Mutual destruction at (0,0)
  compiler.build([
    makeEvent('projectile_collided', {
      projectileId: 'proj-1',
      targetId: 'proj-2',
      targetPos: { q: 0, r: 0 },
      metadata: { collisionType: 'mutual_destroy', contactPos: { q: 0, r: 0 }, power: 100, otherPower: 100, isMelee: false, otherIsMelee: false, ownerId: 'char-1', otherOwnerId: 'char-2' },
    }),
    makeEvent('projectile_collided', {
      projectileId: 'proj-2',
      targetId: 'proj-1',
      targetPos: { q: 0, r: 0 },
      metadata: { collisionType: 'mutual_destroy', contactPos: { q: 0, r: 0 }, power: 100, otherPower: 100, isMelee: false, otherIsMelee: false, ownerId: 'char-2', otherOwnerId: 'char-1' },
    }),
  ]);

  const facts = compiler.getFacts();
  assertEquals(facts.length, 2, 'B1: two facts produced');

  const f1 = facts.find(f => f.projectileId === 'proj-1');
  const f2 = facts.find(f => f.projectileId === 'proj-2');

  assertEquals(f1.endReason, 'mutual_annihilation', 'B2: proj-1 endReason = mutual_annihilation');
  assertEquals(f2.endReason, 'mutual_annihilation', 'B3: proj-2 endReason = mutual_annihilation');
  assertDeepEquals(f1.actualEnd, { q: 0, r: 0 }, 'B4: proj-1 actualEnd = collision point (0,0)');
  assertDeepEquals(f2.actualEnd, { q: 0, r: 0 }, 'B5: proj-2 actualEnd = collision point (0,0)');
  assertEquals(f1.collidedWith, 'proj-2', 'B6: proj-1 collidedWith = proj-2');
  assertEquals(f2.collidedWith, 'proj-1', 'B7: proj-2 collidedWith = proj-1');

  // Verify summarizer produces "弹体相杀" for mutual annihilation
  const eventsWithActionId = [
    makeEvent('action_declared', { actionId: 'act-1', actorId: 'char-1', skillId: 'mage_blast', actorName: '法师' }),
    makeEvent('projectile_created', { projectileId: 'proj-1', actionId: 'act-1', actorId: 'char-1', from: { q: -2, r: 0 }, to: { q: 2, r: 0 }, metadata: { path: [], flags: [], isMelee: false, projectileType: 'projectile' } }),
    makeEvent('projectile_collided', { projectileId: 'proj-1', actionId: 'act-1', targetId: 'proj-2', targetPos: { q: 0, r: 0 }, metadata: { collisionType: 'mutual_destroy', contactPos: { q: 0, r: 0 }, power: 100, otherPower: 100, isMelee: false, otherIsMelee: false } }),
  ];

  const factsById = new Map(facts.map(f => [f.projectileId, f]));
  const charById = new Map([
    ['char-1', { id: 'char-1', name: '法师', class: '法师', ownerId: 'player1' }],
    ['char-2', { id: 'char-2', name: '射手', class: '射手', ownerId: 'player2' }],
  ]);
  const metaById = new Map([['act-1', { actorId: 'char-1', skillId: 'mage_blast', actorName: '法师', actorOwnerId: 'player1', actorClass: '法师' }]]);

  const summary = summarizeOne('act-1', eventsWithActionId, null, SKILLS['mage_blast'], charById, metaById.get('act-1'), factsById);

  assert(summary.effectLines.includes('弹体相杀'), 'B8: effectLines contains "弹体相杀"');
  assertEquals(summary.result, 'clash', 'B9: result = clash for mutual annihilation');
}

// ═══════════════════════════════════════════
// Test C: Expired projectile
// ═══════════════════════════════════════════

console.log('\n=== Test C: Expired projectile ===');

{
  const compiler = new ProjectileResolutionCompiler();

  compiler.build([
    makeEvent('projectile_created', {
      projectileId: 'proj-E',
      actionId: 'act-1',
      actorId: 'char-1',
      from: { q: 0, r: 0 },
      to: { q: 0, r: 8 },
      basePower: 50,
      metadata: { path: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 0, r: 2 }, { q: 0, r: 3 }], flags: [], speed: 1, isMelee: false, projectileType: 'projectile' },
    }),
  ]);

  // Projectile expires with lastPos at max range
  compiler.build([
    makeEvent('projectile_expired', {
      projectileId: 'proj-E',
      reason: 'path_end',
      metadata: { lastPos: { q: 0, r: 3 } },
    }),
  ]);

  const facts = compiler.getFacts();
  assertEquals(facts.length, 1, 'C1: one fact produced');
  const fact = facts[0];

  assertEquals(fact.endReason, 'expired', 'C2: endReason = expired');
  assertDeepEquals(fact.actualEnd, { q: 0, r: 3 }, 'C3: actualEnd = lastPos (0,3)');
  assert(fact.actualEnd.q !== 0 || fact.actualEnd.r !== 8, 'C4: actualEnd is NOT intendedTo (0,8)');
  assertEquals(fact.status, 'expired', 'C5: status = expired');
}

// Test C6: expired without lastPos — actualEnd stays null, does NOT fallback to intendedTo
{
  const compiler = new ProjectileResolutionCompiler();
  compiler.build([
    makeEvent('projectile_created', {
      projectileId: 'proj-E2',
      actionId: 'act-2',
      actorId: 'char-1',
      from: { q: 0, r: 0 },
      to: { q: 5, r: 0 },
      basePower: 50,
      metadata: { path: [], flags: [], speed: 1, isMelee: false, projectileType: 'projectile' },
    }),
  ]);
  compiler.build([
    makeEvent('projectile_expired', {
      projectileId: 'proj-E2',
      reason: 'destroyed',
      metadata: {},  // no lastPos
    }),
  ]);
  const facts = compiler.getFacts();
  assertEquals(facts.length, 1, 'C6: one fact produced');
  assertEquals(facts[0].actualEnd, null, 'C7: actualEnd is null when no lastPos — NOT intendedTo');
}

// ═══════════════════════════════════════════
// Test D: No miss pollution
// ═══════════════════════════════════════════

console.log('\n=== Test D: No miss pollution ===');

{
  // A projectile that collides (body_contact hit) should NOT produce "挥空" (action_failed).
  // Only true miss uses action_failed.
  const events = [
    makeEvent('action_declared', { actionId: 'act-D', actorId: 'char-1', skillId: 'mage_blast', actorName: '法师' }),
    makeEvent('projectile_created', { projectileId: 'proj-D', actionId: 'act-D', actorId: 'char-1', from: { q: 0, r: 0 }, to: { q: 0, r: 3 }, metadata: { path: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 0, r: 2 }, { q: 0, r: 3 }], flags: [], isMelee: false, projectileType: 'projectile' } }),
    makeEvent('projectile_collided', { projectileId: 'proj-D', actionId: 'act-D', targetId: 'char-2', targetPos: { q: 0, r: 2 }, finalDamage: 30, metadata: { hitType: 'body_contact', contactPos: { q: 0, r: 2 }, isMelee: false, flags: [] } }),
    makeEvent('damage_applied', { actionId: 'act-D', actorId: 'char-1', targetId: 'char-2', finalDamage: 30, result: 'hit' }),
  ];

  // Build facts for the events
  const compiler = new ProjectileResolutionCompiler();
  const projectileFacts = compiler.build(events);
  const factsById = new Map(projectileFacts.map(f => [f.projectileId, f]));

  const charById = new Map([
    ['char-1', { id: 'char-1', name: '法师', class: '法师', ownerId: 'player1' }],
    ['char-2', { id: 'char-2', name: '射手', class: '射手', ownerId: 'player2' }],
  ]);
  const metaById = new Map([['act-D', { actorId: 'char-1', skillId: 'mage_blast', actorName: '法师', actorOwnerId: 'player1', actorClass: '法师' }]]);

  const summary = summarizeOne('act-D', events, null, SKILLS['mage_blast'], charById, metaById.get('act-D'), factsById);

  // Must NOT contain "挥空"
  const hasMiss = summary.effectLines.some(line => line.includes('挥空'));
  assert(!hasMiss, 'D1: body_contact hit does NOT produce "挥空"');

  // Must contain damage
  const hasDamage = summary.effectLines.some(line => line.includes('伤害'));
  assert(hasDamage, 'D2: damage line present');

  assertEquals(summary.result, 'hit', 'D3: result = hit, not miss');

  // Verify effectLineKinds does not include 'miss'
  assert(!(summary.effectLineKinds || []).includes('miss'), 'D4: effectLineKinds does not include miss');
}

// True miss case (action_failed) should still work
{
  const events = [
    makeEvent('action_declared', { actionId: 'act-miss', actorId: 'char-1', skillId: 'mage_blast', actorName: '法师' }),
    makeEvent('action_failed', { actionId: 'act-miss', actorId: 'char-1', skillId: 'mage_blast', reason: 'miss' }),
  ];

  const charById = new Map([['char-1', { id: 'char-1', name: '法师', class: '法师', ownerId: 'player1' }]]);
  const metaById = new Map([['act-miss', { actorId: 'char-1', skillId: 'mage_blast', actorName: '法师', actorOwnerId: 'player1', actorClass: '法师' }]]);

  const summary = summarizeOne('act-miss', events, null, SKILLS['mage_blast'], charById, metaById.get('act-miss'), null);

  assertEquals(summary.result, 'miss', 'D5: true miss result = miss');
  const hasMissLine = summary.effectLines.some(line => line.includes('挥空'));
  assert(hasMissLine, 'D6: true miss produces "挥空"');
}

// ═══════════════════════════════════════════
// Test E: Cross-system consistency
// ═══════════════════════════════════════════

console.log('\n=== Test E: Cross-system consistency ===');

{
  // Full turn simulation: two mages shoot at each other, projectiles may collide
  const callbacks = {
    computeEffectArea: () => [],
    renderAll: () => {},
    renderLog: () => {},
    clearLog: () => {},
    setSubmitStatus: () => {},
    setExecuteDisabled: () => {},
    showGameOverPanel: () => {},
    hideGameOverPanel: () => {},
    showDisconnect: () => {},
    getNetworkManager: () => null,
    getConfigMode: () => 'local',
    isPveMode: () => false,
    setRoute: () => {},
    appendChatMessage: () => {},
    animateTurn: async () => {},
    buildTurnResolution: null,
  };
  const session = new BattleSessionController(callbacks);
  session.startBattleFromScenario(Date.now(), {
    mode: 'duel', seed: 500,
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    combatants: [
      {
        id: 'mage1', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_blast'],
        position: { q: 0, r: -2 }, resources: { qi: 4 },
      },
      {
        id: 'mage2', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '法师', roleLoadoutSkillIds: [],
        loadoutSkillIds: ['mage_blast'],
        position: { q: 0, r: 2 }, resources: { qi: 4 },
      },
    ],
    rules: { friendlyFire: false },
  });

  // Submit attacks targeting each other
  session.engine.submitAction('mage1', 'mage_blast', { q: 0, r: 2 });
  session.engine.submitAction('mage2', 'mage_blast', { q: 0, r: -2 });
  session.localSubmittedSet.add('mage1');
  session.localSubmittedSet.add('mage2');

  // Use TurnResolutionBuilder to simulate
  const builder = createTurnResolutionBuilder();
  const result = await builder.build(session.engine);

  assert(result.success, 'E1: turn executed successfully');
  assert(!!result.resolution, 'E2: resolution produced');

  const resolution = result.resolution;

  // Check resolution-level facts
  const resFacts = resolution.projectileResolutionFacts;
  assert(Array.isArray(resFacts), 'E3: projectileResolutionFacts is array');
  // At least 2 projectiles (both mages shoot)
  assert(resFacts.length >= 2, `E4: at least 2 facts (got ${resFacts.length})`);

  // Each phase must have projectileFacts
  for (const phase of resolution.phases) {
    assert(Array.isArray(phase.projectileFacts), `E5: phase ${phase.id} has projectileFacts array`);
  }

  // Check facts have no intendedTo fallback for actualEnd
  for (const fact of resFacts) {
    // If endReason is set, actualEnd must be set
    if (fact.endReason) {
      assert(fact.actualEnd !== null, `E6: fact ${fact.projectileId} with endReason=${fact.endReason} has actualEnd`);
    }
    // actualEnd must not equal intendedTo unless the projectile reached its target
    if (fact.endReason === 'hit' && fact.actualEnd && fact.intendedTo) {
      const ae = `${fact.actualEnd.q},${fact.actualEnd.r}`;
      const it = `${fact.intendedTo.q},${fact.intendedTo.r}`;
      assert(true, `E7: fact ${fact.projectileId} hit: actualEnd=(${ae}), intendedTo=(${it})`);
    }
  }

  // Verify facts have proper structure for downstream consumers
  const factsById = new Map(resFacts.map(f => [f.projectileId, f]));
  for (const [pid, fact] of factsById) {
    assert(typeof fact.actualEnd === 'object' || fact.actualEnd === null,
      `E8: fact ${pid} actualEnd is object or null (got ${typeof fact.actualEnd})`);
    assert(typeof fact.intendedTo === 'object' || fact.intendedTo === null,
      `E9: fact ${pid} intendedTo is object or null`);
    assert(typeof fact.endReason === 'string' || fact.endReason === null,
      `E10: fact ${pid} endReason is string or null`);
  }

  // Verify ActionSummarizer can consume facts from each phase
  for (const phase of resolution.phases) {
    const viewState = { characters: [] };
    const actions = buildActionSummaries(phase, viewState, { projectileFacts: phase.projectileFacts });
    assert(Array.isArray(actions), `E11: phase ${phase.id} buildActionSummaries returns array`);
  }

  // Check that a collision scenario does NOT produce "挥空" in action summaries
  let allMissLines = [];
  for (const phase of resolution.phases) {
    for (const action of (phase.actions || [])) {
      if (action.effectLines) {
        allMissLines.push(...action.effectLines.filter(l => l.includes('挥空')));
      }
    }
  }
  // In a two-mage-shoot scenario at distance 4, projectiles may cross and collide or hit
  // Neither should produce "挥空" (only true out-of-range miss does)
  assert(allMissLines.length === 0, `E12: no "挥空" lines from projectile scenario (got ${allMissLines.length})`);
}

// ═══════════════════════════════════════════
// Test F: overpowered — weaker projectile intercepted, stronger survives
// ═══════════════════════════════════════════

console.log('\n=== Test F: Overpowered collision ===');

{
  const compiler = new ProjectileResolutionCompiler();

  compiler.build([
    makeEvent('projectile_created', {
      projectileId: 'proj-weak',
      actionId: 'act-1',
      actorId: 'char-1',
      from: { q: -2, r: 0 },
      to: { q: 2, r: 0 },
      basePower: 100,
      metadata: { path: [{ q: -2, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], flags: [], speed: 1, isMelee: false, projectileType: 'projectile' },
    }),
    makeEvent('projectile_created', {
      projectileId: 'proj-strong',
      actionId: 'act-2',
      actorId: 'char-2',
      from: { q: 2, r: 0 },
      to: { q: -2, r: 0 },
      basePower: 300,
      metadata: { path: [{ q: 2, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 0 }, { q: -1, r: 0 }, { q: -2, r: 0 }], flags: [], speed: 1, isMelee: false, projectileType: 'projectile' },
    }),
  ]);

  // Collision at (0,0): strong (power=300) vs weak (power=100)
  compiler.build([
    makeEvent('projectile_collided', {
      projectileId: 'proj-weak',
      targetId: 'proj-strong',
      targetPos: { q: 0, r: 0 },
      metadata: { collisionType: 'overpowered', contactPos: { q: 0, r: 0 }, power: 100, otherPower: 300, isMelee: false, otherIsMelee: false, ownerId: 'char-1', otherOwnerId: 'char-2' },
    }),
    makeEvent('projectile_collided', {
      projectileId: 'proj-strong',
      targetId: 'proj-weak',
      targetPos: { q: 0, r: 0 },
      metadata: { collisionType: 'overpowered', contactPos: { q: 0, r: 0 }, power: 300, otherPower: 100, isMelee: false, otherIsMelee: false, ownerId: 'char-2', otherOwnerId: 'char-1' },
    }),
  ]);

  const facts = compiler.getFacts();

  const weakFact = facts.find(f => f.projectileId === 'proj-weak');
  const strongFact = facts.find(f => f.projectileId === 'proj-strong');

  // Weak projectile: intercepted
  assertEquals(weakFact.endReason, 'intercepted', 'F1: weak projectile endReason = intercepted');
  assertDeepEquals(weakFact.actualEnd, { q: 0, r: 0 }, 'F2: weak projectile actualEnd = collision point');
  assertEquals(weakFact.status, 'collided', 'F3: weak projectile status = collided');
  assertEquals(weakFact.collidedWith, 'proj-strong', 'F4: weak collidedWith = proj-strong');

  // Strong projectile: survives (NOT terminal)
  assertEquals(strongFact.endReason, null, 'F5: strong projectile endReason = null (survives)');
  assertEquals(strongFact.status, 'flying', 'F6: strong projectile status = flying (not terminal)');
  assertEquals(strongFact.actualEnd, null, 'F7: strong projectile actualEnd = null (still flying)');

  // Verify summarizer shows "弹体贯穿" for the STRONG projectile (the one that overpowered)
  const eventsStrong = [
    makeEvent('action_declared', { actionId: 'act-2', actorId: 'char-2', skillId: 'mage_bigblast', actorName: '法师2' }),
    makeEvent('projectile_created', { projectileId: 'proj-strong', actionId: 'act-2', actorId: 'char-2', from: { q: 2, r: 0 }, to: { q: -2, r: 0 }, metadata: { path: [], flags: [], isMelee: false, projectileType: 'projectile' } }),
    makeEvent('projectile_collided', { projectileId: 'proj-strong', actionId: 'act-2', targetId: 'proj-weak', targetPos: { q: 0, r: 0 }, metadata: { collisionType: 'overpowered', contactPos: { q: 0, r: 0 }, power: 300, otherPower: 100, isMelee: false, otherIsMelee: false } }),
  ];

  const factsById2 = new Map(facts.map(f => [f.projectileId, f]));
  const charById2 = new Map([
    ['char-1', { id: 'char-1', name: '法师1', class: '法师', ownerId: 'player1' }],
    ['char-2', { id: 'char-2', name: '法师2', class: '法师', ownerId: 'player2' }],
  ]);
  const metaById2 = new Map([['act-2', { actorId: 'char-2', skillId: 'mage_bigblast', actorName: '法师2', actorOwnerId: 'player2', actorClass: '法师' }]]);

  const summaryStrong = summarizeOne('act-2', eventsStrong, null, SKILLS['mage_bigblast'], charById2, metaById2.get('act-2'), factsById2);

  assert(summaryStrong.effectLines.includes('弹体贯穿'), 'F8: strong projectile effectLines contains "弹体贯穿"');
  assertEquals(summaryStrong.result, 'clash', 'F9: result = clash for overpowered projectile');
}

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════

console.log(`\n=== Result: ${pass} passed, ${fail} failed, ${pass + fail} total ===`);
if (fail > 0) {
  console.error('❌ Some tests FAILED');
  process.exit(1);
} else {
  console.log('✅ All ProjectileResolutionCompiler tests passed!');
}
