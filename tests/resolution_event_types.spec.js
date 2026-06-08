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

// ─── Summary ───

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}, 失败: ${fail}`);
if (fail > 0) process.exit(1);
