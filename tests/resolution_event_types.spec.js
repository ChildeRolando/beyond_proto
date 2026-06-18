// Unit tests for ResolutionEventTypes + ResolutionEventRecorder
// Run: node tests/resolution_event_types.spec.js

import { ResolutionEventType, isResolutionEventType, normalizeResolutionEvent, assertResolutionEvent } from '../engine/resolution/ResolutionEventTypes.js';
import { ResolutionEventRecorder } from '../engine/resolution/ResolutionEventRecorder.js';

let pass = 0, fail = 0;

function assert(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

function assertEquals(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ═══════════════════════════════════════════
// Part 1: ResolutionEventType registry
// ═══════════════════════════════════════════

console.log('\n=== Part 1: ResolutionEventType registry ===');

console.log('\n[1a] all expected event types are registered');
const expected = [
  'ACTION_DECLARED', 'ACTION_FAILED',
  'RESOURCE_CHANGED',
  'STATUS_APPLIED', 'STATUS_REMOVED', 'STATUS_EXPIRED',
  'PROJECTILE_CREATED', 'PROJECTILE_MOVED', 'PROJECTILE_COLLIDED',
  'PROJECTILE_INTERCEPTED', 'PROJECTILE_EXPIRED',
  'CHARACTER_MOVED',
  'DAMAGE_APPLIED', 'DAMAGE_ABSORBED',
  'CHARACTER_DIED',
  'TURN_STARTED', 'BATTLE_ENDED',
];
for (const key of expected) {
  const val = ResolutionEventType[key];
  assert(val !== undefined, `${key} exists`);
  assert(typeof val === 'string', `${key} is string`);
  assert(isResolutionEventType(val), `${key} is valid`);
}

console.log('\n[1b] invalid types are rejected');
assertEquals(isResolutionEventType('move'), false, 'move is not valid');
assertEquals(isResolutionEventType('attack'), false, 'attack is not valid');
assertEquals(isResolutionEventType('resource'), false, 'resource is not valid');
assertEquals(isResolutionEventType(undefined), false, 'undefined not valid');
assertEquals(isResolutionEventType(null), false, 'null not valid');
assertEquals(isResolutionEventType(''), false, 'empty not valid');

console.log('\n[1c] freeze prevents mutation');
try {
  ResolutionEventType.NEW_KEY = 'test';
  assert(ResolutionEventType.NEW_KEY === undefined, 'Object.freeze prevents new keys');
} catch (e) {
  assert(true, 'freeze throws on mutation (strict mode)');
}

// ═══════════════════════════════════════════
// Part 2: normalizeResolutionEvent
// ═══════════════════════════════════════════

console.log('\n=== Part 2: normalizeResolutionEvent ===');

console.log('\n[2a] fills defaults for empty input');
{
  const e = normalizeResolutionEvent({});
  assertEquals(e.eventType, null, 'empty → null eventType');
  assertEquals(e.phaseKind, 'speed', 'default phaseKind');
  assertEquals(e.turnNumber, null, 'null turnNumber');
}

console.log('\n[2b] recognizes eventType field');
{
  const e = normalizeResolutionEvent({ eventType: 'damage_applied', finalDamage: 50 });
  assertEquals(e.eventType, 'damage_applied', 'keeps eventType');
  assertEquals(e.finalDamage, 50, 'passes through finalDamage');
}

console.log('\n[2c] normalizes legacy type field (coarse → null eventType)');
{
  const e = normalizeResolutionEvent({ type: 'attack', result: 'hit' });
  // Legacy 'type' is not a valid eventType → eventType stays null
  assertEquals(e.eventType, null, 'legacy type does not auto-promote');
  assertEquals(e._legacyType, 'attack', 'legacy type preserved in _legacyType');
  assertEquals(e.result, 'hit', 'result preserved');
}

console.log('\n[2d] aliases old/new to oldValue/newValue');
{
  const e = normalizeResolutionEvent({ eventType: 'resource_changed', old: 10, new: 7, delta: -3 });
  assertEquals(e.oldValue, 10, 'old → oldValue');
  assertEquals(e.newValue, 7, 'new → newValue');
  assertEquals(e.delta, -3, 'delta preserved');
}

console.log('\n[2e] does not mutate input');
{
  const raw = { eventType: 'character_moved', from: { q: 0, r: 0 } };
  const e = normalizeResolutionEvent(raw);
  assert(e !== raw, 'returns new object');
  assertEquals(raw.from, e.from, 'object refs preserved (shallow copy behavior)');
}

// ═══════════════════════════════════════════
// Part 3: assertResolutionEvent
// ═══════════════════════════════════════════

console.log('\n=== Part 3: assertResolutionEvent ===');

console.log('\n[3a] valid event passes');
{
  const e = normalizeResolutionEvent({ eventType: 'action_declared', actionId: 'a1' });
  const result = assertResolutionEvent(e);
  assert(result === e, 'returns same object');
}

console.log('\n[3b] invalid event throws');
{
  try {
    assertResolutionEvent({ eventType: 'move' });
    assert(false, 'should have thrown');
  } catch (err) {
    assert(err.message.includes('Invalid'), 'throws with descriptive message');
  }
}

console.log('\n[3c] missing eventType throws');
{
  try {
    assertResolutionEvent({});
    assert(false, 'should have thrown');
  } catch (err) {
    assert(true, 'throws on missing eventType');
  }
}

// ─── Batch assertion helper for TurnResolution ───

console.log('\n=== Part 4: Batch resolution event validation ===');

function assertAllResolutionEvents(resolution) {
  for (const phase of resolution.phases || []) {
    for (const event of phase.events || []) {
      assertResolutionEvent(event);
    }
  }
}

console.log('[4a] valid resolution passes batch assertion');
{
  const validResolution = {
    phases: [
      {
        events: [
          { eventType: 'action_declared', actorId: 'a', skillId: 's' },
          { eventType: 'character_moved', actorId: 'a', from: { q: 0, r: 0 }, to: { q: 1, r: 0 } },
          { eventType: 'projectile_created', actorId: 'a' },
          { eventType: 'damage_applied', targetId: 'b', finalDamage: 100 },
        ],
      },
    ],
  };
  try {
    assertAllResolutionEvents(validResolution);
    assert(true, 'batch assertion passes');
  } catch (err) {
    assert(false, `batch assertion should not throw: ${err.message}`);
  }
}

console.log('[4b] resolution with coarse type fails batch assertion');
{
  const invalidResolution = {
    phases: [
      {
        events: [
          { eventType: 'action_declared', actorId: 'a', skillId: 's' },
          { eventType: 'attack', actorId: 'a' },  // coarse type — must fail
        ],
      },
    ],
  };
  try {
    assertAllResolutionEvents(invalidResolution);
    assert(false, 'should have thrown on coarse event type');
  } catch (err) {
    assert(err.message.includes('Invalid'), 'throws on coarse event type');
  }
}

console.log('[4c] resolution with null eventType fails batch assertion');
{
  const invalidResolution = {
    phases: [
      {
        events: [
          { eventType: 'action_declared', actorId: 'a', skillId: 's' },
          {},  // no eventType
        ],
      },
    ],
  };
  try {
    assertAllResolutionEvents(invalidResolution);
    assert(false, 'should have thrown on missing eventType');
  } catch (err) {
    assert(true, 'throws on missing eventType');
  }
}

console.log('[4d] empty phases pass batch assertion');
{
  const emptyResolution = { phases: [] };
  try {
    assertAllResolutionEvents(emptyResolution);
    assert(true, 'empty phases pass');
  } catch (err) {
    assert(false, `empty phases should not throw: ${err.message}`);
  }
}

// ═══════════════════════════════════════════
// Part 5: metadata preservation
// ═══════════════════════════════════════════

console.log('\n=== Part 5: metadata preservation ===');

console.log('[5a] normalizeResolutionEvent preserves metadata field');
{
  const raw = {
    eventType: 'projectile_collided',
    projectileId: 'proj-1',
    targetId: 'proj-2',
    actionId: 'act-1',
    metadata: {
      collisionType: 'mutual_destroy',
      isMelee: false,
      otherIsMelee: false,
      power: 100,
      otherPower: 100,
      ownerId: 'char-a',
      otherOwnerId: 'char-b',
    },
  };
  const e = normalizeResolutionEvent(raw);
  assert(e.metadata !== null, 'metadata is preserved');
  assertEquals(e.metadata.collisionType, 'mutual_destroy', 'metadata.collisionType preserved');
  assertEquals(e.metadata.isMelee, false, 'metadata.isMelee preserved');
  assertEquals(e.metadata.power, 100, 'metadata.power preserved');
  assertEquals(e.metadata.ownerId, 'char-a', 'metadata.ownerId preserved');
  assertEquals(e.eventType, 'projectile_collided', 'standard eventType preserved');
  assertEquals(e.projectileId, 'proj-1', 'standard projectileId preserved');
}

console.log('[5b] projectile_collided with metadata passes assertResolutionEvent');
{
  const e = normalizeResolutionEvent({
    eventType: 'projectile_collided',
    projectileId: 'proj-1',
    targetId: 'proj-2',
    metadata: { collisionType: 'overpowered', isMelee: true, otherIsMelee: false, power: 150, otherPower: 50, ownerId: 'a', otherOwnerId: 'b' },
  });
  try {
    assertResolutionEvent(e);
    assert(true, 'projectile_collided with metadata passes assertion');
  } catch (err) {
    assert(false, `should not throw: ${err.message}`);
  }
}

console.log('[5c] event without metadata works (null metadata)');
{
  const e = normalizeResolutionEvent({
    eventType: 'projectile_collided',
    projectileId: 'proj-1',
    targetId: 'char-1',
    finalDamage: 50,
  });
  assertEquals(e.metadata, null, 'no metadata → null');
  assertEquals(e.eventType, 'projectile_collided', 'eventType still valid');
}

// ═══════════════════════════════════════════
// Part 6: finalize returns correct snapshots
// ═══════════════════════════════════════════

console.log('\n=== Part 6: ResolutionEventRecorder finalize returns snapshots ===');

{
  // Minimal mock EventBus
  const mockBus = { on: () => 0, off: () => {} };
  const recorder = new ResolutionEventRecorder(mockBus, null);

  recorder.startTurn(3);
  const phase = recorder.startPhase(2, 'speed', 1);
  recorder.record({
    eventType: 'action_declared',
    actorId: 'a1',
    skillId: 's1',
    actionId: 'act-1',
  });
  recorder.endPhase(phase);

  const initSnap = { version: 1, registry: { entities: ['init'] } };
  const finalSnap = { version: 1, registry: { entities: ['final'] } };
  const result = recorder.finalize({ initialSnapshot: initSnap, finalSnapshot: finalSnap });

  console.log('[6a] finalize returns initialSnapshot');
  assert(result.initialSnapshot === initSnap, 'initialSnapshot is the passed object');

  console.log('[6b] finalize returns finalSnapshot');
  assert(result.finalSnapshot === finalSnap, 'finalSnapshot is the passed object');

  console.log('[6c] result has schemaVersion 2');
  assertEquals(result.schemaVersion, 2, 'schemaVersion is 2');

  console.log('[6d] result has no endState');
  assert(!('endState' in result), 'no endState on result');

  console.log('[6e] result has no finalViewState');
  assert(!('finalViewState' in result), 'no finalViewState on result');

  console.log('[6f] result has no viewState');
  assert(!('viewState' in result), 'no viewState on result');

  console.log('[6g] finalize with no args returns null snapshots');
  const recorder2 = new ResolutionEventRecorder(mockBus, null);
  recorder2.startTurn(1);
  recorder2.startPhase(1);
  const r2 = recorder2.finalize();
  assertEquals(r2.initialSnapshot, null, 'no-arg initialSnapshot is null');
  assertEquals(r2.finalSnapshot, null, 'no-arg finalSnapshot is null');
}

// ═══════════════════════════════════════════
// Part 7: projectile lifecycle facts
// ═══════════════════════════════════════════

console.log('\n=== Part 7: projectile lifecycle facts ===');

{
  const mockBus = { on: () => 0, off: () => {} };
  const recorder = new ResolutionEventRecorder(mockBus, null);
  recorder.startTurn(1);
  recorder.startPhase(2, 'speed', 1);

  recorder.recordProjectileCreated(
    'proj-a', 'actor-a', 'mage_blast', 'act-a',
    { q: 0, r: 0 }, { q: 3, r: 0 }, 100, 2,
    { path: [[0, 0], [1, 0], [2, 0], [3, 0]], flags: [], speed: 2 }
  );
  recorder.recordProjectileCreated(
    'proj-b', 'actor-b', 'mage_blast', 'act-b',
    { q: 3, r: 0 }, { q: 0, r: 0 }, 100, 2,
    { path: [[3, 0], [2, 0], [1, 0], [0, 0]], flags: [], speed: 2 }
  );
  recorder.recordProjectileCreated(
    'proj-c', 'actor-c', 'mage_blast', 'act-c',
    { q: 0, r: 1 }, { q: 2, r: 1 }, 80, 2,
    { path: [[0, 1], [1, 1], [2, 1]], flags: [], speed: 2 }
  );
  recorder.recordProjectileCreated(
    'proj-d', 'actor-d', 'mage_blast', 'act-d',
    { q: 0, r: 2 }, { q: 1, r: 2 }, 60, 2,
    { path: [[0, 2], [1, 2]], flags: [], speed: 2 }
  );
  recorder.recordProjectileCreated(
    'proj-e', 'actor-e', 'mage_blast', 'act-e',
    { q: 0, r: 3 }, { q: 3, r: 3 }, 50, 2,
    { path: [[0, 3], [1, 3], [2, 3], [3, 3]], flags: [], speed: 2 }
  );

  recorder.recordProjectileCollided(
    'proj-a', 'proj-b', null, null, 'act-a',
    {
      collisionType: 'mutual_destroy',
      contactPos: { q: 1, r: 0 },
      power: 100,
      otherPower: 100,
      ownerId: 'actor-a',
      otherOwnerId: 'actor-b',
    }
  );
  recorder.recordProjectileCollided(
    'proj-b', 'proj-a', null, null, 'act-b',
    {
      collisionType: 'mutual_destroy',
      contactPos: { q: 1, r: 0 },
      power: 100,
      otherPower: 100,
      ownerId: 'actor-b',
      otherOwnerId: 'actor-a',
    }
  );
  recorder.recordProjectileCollided(
    'proj-c', 'target-1', null, 80, 'act-c',
    {
      hitType: 'body_contact',
      contactPos: { q: 1, r: 1 },
      ownerId: 'actor-c',
    }
  );
  recorder.recordProjectileIntercepted(
    'proj-d', 'interceptor-1', 90,
    {
      projectilePower: 60,
      contactPos: { q: 1, r: 2 },
    }
  );
  recorder.recordProjectileExpired('proj-e', 'path_end', { lastPos: { q: 2, r: 3 } });

  const resolution = recorder.finalize();
  const facts = resolution.projectileResolutionFacts || [];

  const factA = facts.find(f => f.projectileId === 'proj-a');
  const factB = facts.find(f => f.projectileId === 'proj-b');
  const factC = facts.find(f => f.projectileId === 'proj-c');
  const factD = facts.find(f => f.projectileId === 'proj-d');
  const factE = facts.find(f => f.projectileId === 'proj-e');

  assertEquals(facts.length, 5, 'all created projectiles produce resolution facts');
  assertEquals(factA?.actualEnd?.q, 1, 'mutual annihilation uses collision endpoint');
  assertEquals(factA?.actualEnd?.r, 0, 'mutual annihilation endpoint preserves r');
  assertEquals(factA?.endReason, 'mutual_annihilation', 'mutual annihilation end reason');
  assertEquals(factA?.collidedWith, 'proj-b', 'mutual annihilation keeps collidedWith');
  assertEquals(factB?.endReason, 'mutual_annihilation', 'other projectile also finalizes');

  assertEquals(factC?.endReason, 'hit', 'body contact finalizes as hit');
  assertEquals(factC?.actualEnd?.q, 1, 'body contact uses contact position');
  assertEquals(factC?.actorId, 'actor-c', 'fact preserves actorId');
  assertEquals(factC?.actionId, 'act-c', 'fact preserves actionId');

  assertEquals(factD?.status, 'intercepted', 'intercepted projectile status recorded');
  assertEquals(factD?.endReason, 'intercepted', 'intercepted projectile end reason');
  assertEquals(factD?.actualEnd?.q, 1, 'interception uses contact position when provided');

  assertEquals(factE?.status, 'expired', 'expired projectile status recorded');
  assertEquals(factE?.endReason, 'expired', 'expired projectile end reason');
  assertEquals(factE?.actualEnd?.q, 2, 'expired projectile uses lastPos');

  const failedEvents = (resolution.phases[0]?.events || []).filter(e => e.eventType === 'action_failed');
  assertEquals(failedEvents.length, 0, 'projectile collisions do not synthesize action_failed');
}

// ─── Summary ───

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}, 失败: ${fail}`);
if (fail > 0) process.exit(1);
