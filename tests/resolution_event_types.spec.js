// Unit tests for ResolutionEventTypes + ResolutionEventRecorder
// Run: node tests/resolution_event_types.spec.js

import { ResolutionEventType, isResolutionEventType, normalizeResolutionEvent, assertResolutionEvent } from '../engine/resolution/ResolutionEventTypes.js';

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

// ─── Summary ───

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}, 失败: ${fail}`);
if (fail > 0) process.exit(1);
