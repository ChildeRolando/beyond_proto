// Unit tests for PresentationTimelineCompiler
// Run: node tests/presentation_timeline_compiler.spec.js
//
// Milestone 3 / Task 3.1

import { compilePresentationTimeline, PresentationTimelineCompiler } from '../presentation/PresentationTimelineCompiler.js';
import { PresentationClipKind } from '../presentation/PresentationClipTypes.js';

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

// ═══════════════════════════════════════════
// Helpers: build minimal TurnResolution fixtures
// ═══════════════════════════════════════════

function makeResolution(turnNumber, phases) {
  return {
    schemaVersion: 2,
    turnNumber,
    initialSnapshot: null,
    finalSnapshot: null,
    phases,
  };
}

function makePhase(speed, events) {
  return {
    id: `turn-1-speed-${speed}`,
    phaseKind: 'speed',
    speed,
    commandCount: events.length,
    beforeSnapshot: null,
    afterSnapshot: null,
    events,
    summary: '',
    actionCount: 0,
    actions: [],
  };
}

function makeProjectileCreatedEvent(overrides = {}) {
  return {
    id: overrides.id || 'ev-001',
    eventType: 'projectile_created',
    actionId: overrides.actionId || 'act-1',
    actorId: overrides.actorId || 'char-a',
    skillId: overrides.skillId || 'mage_blast',
    projectileId: overrides.projectileId || 'proj-1',
    from: overrides.from || { q: 0, r: 0 },
    to: overrides.to || { q: 2, r: 0 },
    basePower: overrides.basePower ?? 100,
    projectileType: overrides.projectileType || 'projectile',
    metadata: overrides.metadata || {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      flags: [],
      speed: 3,
      isMelee: false,
      projectileType: overrides.projectileType || 'projectile',
    },
  };
}

function makeProjectileCollidedEvent(overrides = {}) {
  return {
    id: overrides.id || 'ev-002',
    eventType: 'projectile_collided',
    actionId: overrides.actionId || 'act-1',
    projectileId: overrides.projectileId || 'proj-1',
    targetId: overrides.targetId || 'char-b',
    targetPos: overrides.targetPos || { q: 2, r: 0 },
    finalDamage: overrides.finalDamage ?? 100,
    metadata: overrides.metadata || {
      hitType: 'body_contact',
      contactPos: { q: 2, r: 0 },
      isMelee: false,
      flags: [],
      ownerId: 'char-a',
    },
  };
}

function makeProjectileInterceptedEvent(overrides = {}) {
  return {
    id: overrides.id || 'ev-003',
    eventType: 'projectile_intercepted',
    projectileId: overrides.projectileId || 'proj-1',
    targetId: overrides.targetId || 'char-c',
    basePower: overrides.basePower ?? 80,
    metadata: overrides.metadata || {
      interceptPower: 80,
      projectilePower: 100,
      interceptType: 'buff_intercept',
    },
  };
}

function makeProjectileExpiredEvent(overrides = {}) {
  return {
    id: overrides.id || 'ev-004',
    eventType: 'projectile_expired',
    projectileId: overrides.projectileId || 'proj-1',
    reason: overrides.reason || 'max_range',
    metadata: overrides.metadata || {
      lastPos: { q: 5, r: 0 },
    },
  };
}

// ═══════════════════════════════════════════
// Test 1: projectile_created → projectile_launch
// ═══════════════════════════════════════════

console.log('\n=== Test 1: projectile_created → projectile_launch ===');

{
  const ev = makeProjectileCreatedEvent({
    metadata: {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      flags: [],
      speed: 3,
      isMelee: false,
      projectileType: 'projectile',
    },
  });
  const phase = makePhase(3, [ev]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[1a] timeline schemaVersion');
  assertEquals(timeline.schemaVersion, 1, 'schemaVersion === 1');
  assert(timeline.turnNumber === 1, 'turnNumber === 1');
  assert(timeline.durationMs >= 120, 'durationMs >= 120');
  assert(Array.isArray(timeline.clips), 'clips is array');
  assert(timeline.clips.length >= 1, 'at least 1 clip');

  const launchClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_LAUNCH);
  assert(launchClip !== undefined, 'projectile_launch clip exists');

  console.log('\n[1b] launch clip payload');
  assertEquals(launchClip.kind, PresentationClipKind.PROJECTILE_LAUNCH, 'kind is projectile_launch');
  assertEquals(launchClip.payload.projectileId, 'proj-1', 'projectileId correct');
  assertEquals(launchClip.payload.path.length, 3, 'path length === 3');
  assertEquals(launchClip.payload.from.q, 0, 'from.q === 0');
  assertEquals(launchClip.payload.from.r, 0, 'from.r === 0');
  assertEquals(launchClip.payload.to.q, 2, 'to.q === 2');
  assertEquals(launchClip.payload.to.r, 0, 'to.r === 0');
  assertEquals(launchClip.payload.basePower, 100, 'basePower === 100');
  assertEquals(launchClip.payload.projectileType, 'projectile', 'projectileType correct');
  assertEquals(launchClip.payload.isMelee, false, 'isMelee === false');
  assertEquals(launchClip.payload.speed, 3, 'speed === 3');

  console.log('\n[1c] launch clip timing');
  assert(launchClip.startMs >= 0, 'startMs >= 0');
  assert(launchClip.durationMs >= 120, 'durationMs >= minProjectileDurationMs');
  // path.length(3) * 80 = 240, so durationMs should be >= 240
  assert(launchClip.durationMs >= 240, 'durationMs based on path length (3*80=240)');

  console.log('\n[1d] launch clip source linking');
  assertEquals(launchClip.sourceEventId, 'ev-001', 'sourceEventId === event id');
  assertEquals(launchClip.actionId, 'act-1', 'actionId correct');
  assertEquals(launchClip.actorId, 'char-a', 'actorId correct');
}

// ═══════════════════════════════════════════
// Test 2: melee projectile → melee_slash
// ═══════════════════════════════════════════

console.log('\n=== Test 2: melee projectile → melee_slash ===');

{
  const ev = makeProjectileCreatedEvent({
    projectileType: 'melee',
    metadata: {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      flags: ['MELEE'],
      speed: 1,
      isMelee: true,
      projectileType: 'melee',
    },
  });
  const phase = makePhase(3, [ev]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[2a] melee_slash clip exists');
  const slashClip = timeline.clips.find(c => c.kind === PresentationClipKind.MELEE_SLASH);
  assert(slashClip !== undefined, 'melee_slash clip exists');

  console.log('\n[2b] melee_slash payload');
  assertEquals(slashClip.kind, PresentationClipKind.MELEE_SLASH, 'kind is melee_slash');
  assertEquals(slashClip.payload.isMelee, true, 'isMelee === true');
  assertEquals(slashClip.payload.projectileType, 'melee', 'projectileType === melee');
  assert(slashClip.payload.flags.includes('MELEE'), 'flags includes MELEE');
  assertEquals(slashClip.payload.path.length, 2, 'path length === 2');
  // 2 * 80 = 160, which is > 120 (min)
  assert(slashClip.durationMs >= 160, 'durationMs based on melee path (2*80=160)');
}

// ═══════════════════════════════════════════
// Test 3: projectile_collided → projectile_impact
// ═══════════════════════════════════════════

console.log('\n=== Test 3: projectile_collided → projectile_impact ===');

{
  const launchEv = makeProjectileCreatedEvent({
    id: 'ev-launch',
    projectileId: 'proj-1',
    metadata: {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      flags: [],
      speed: 3,
      isMelee: false,
      projectileType: 'projectile',
    },
  });
  const hitEv = makeProjectileCollidedEvent({
    id: 'ev-hit',
    projectileId: 'proj-1',
    targetId: 'char-b',
    finalDamage: 100,
    metadata: {
      hitType: 'body_contact',
      contactPos: { q: 2, r: 0 },
      isMelee: false,
      flags: [],
      ownerId: 'char-a',
    },
  });
  const phase = makePhase(3, [launchEv, hitEv]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[3a] both clips exist');
  const launchClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_LAUNCH);
  const impactClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_IMPACT);
  assert(launchClip !== undefined, 'projectile_launch exists');
  assert(impactClip !== undefined, 'projectile_impact exists');

  console.log('\n[3b] impact clip payload');
  assertEquals(impactClip.kind, PresentationClipKind.PROJECTILE_IMPACT, 'kind is projectile_impact');
  assertEquals(impactClip.payload.projectileId, 'proj-1', 'projectileId correct');
  assertEquals(impactClip.payload.targetId, 'char-b', 'targetId correct');
  assert(impactClip.payload.contactPos !== null, 'contactPos exists');
  assertEquals(impactClip.payload.contactPos.q, 2, 'contactPos.q === 2');
  assertEquals(impactClip.payload.contactPos.r, 0, 'contactPos.r === 0');
  assertEquals(impactClip.payload.hitType, 'body_contact', 'hitType === body_contact');
  assertEquals(impactClip.payload.finalDamage, 100, 'finalDamage correct');

  console.log('\n[3c] impact timing relative to launch');
  assert(impactClip.startMs >= launchClip.startMs + launchClip.durationMs,
    `impact.startMs (${impactClip.startMs}) >= launch.startMs + launch.durationMs (${launchClip.startMs + launchClip.durationMs})`);
  assertEquals(impactClip.durationMs, 180, 'impact durationMs === 180 (default)');

  console.log('\n[3d] impact source linking');
  assertEquals(impactClip.sourceEventId, 'ev-hit', 'sourceEventId === hit event id');
}

// ═══════════════════════════════════════════
// Test 4: projectile-vs-projectile collision → projectile_clash
// ═══════════════════════════════════════════

console.log('\n=== Test 4: projectile-vs-projectile collision → projectile_clash ===');

{
  const launchEv = makeProjectileCreatedEvent({
    id: 'ev-launch-4',
    projectileId: 'proj-a',
    actorId: 'char-a',
  });
  const clashEv = {
    id: 'ev-clash',
    eventType: 'projectile_collided',
    actionId: 'act-1',
    projectileId: 'proj-a',
    targetId: 'proj-b',  // other projectile id
    targetPos: { q: 1, r: 0 },
    finalDamage: null,
    metadata: {
      collisionType: 'mutual_destroy',
      contactPos: { q: 1, r: 0 },
      power: 100,
      otherPower: 80,
      isMelee: false,
      otherIsMelee: false,
      ownerId: 'char-a',
      otherOwnerId: 'char-b',
    },
  };
  const phase = makePhase(3, [launchEv, clashEv]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[4a] clash clip exists');
  const clashClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_CLASH);
  assert(clashClip !== undefined, 'projectile_clash exists');

  console.log('\n[4b] clash clip payload');
  assertEquals(clashClip.kind, PresentationClipKind.PROJECTILE_CLASH, 'kind is projectile_clash');
  assertEquals(clashClip.payload.projectileId, 'proj-a', 'projectileId correct');
  assertEquals(clashClip.payload.otherProjectileId, 'proj-b', 'otherProjectileId === targetId');
  assertEquals(clashClip.payload.collisionType, 'mutual_destroy', 'collisionType correct');
  assertEquals(clashClip.payload.power, 100, 'power correct');
  assertEquals(clashClip.payload.otherPower, 80, 'otherPower correct');
  assertEquals(clashClip.payload.isMelee, false, 'isMelee === false');
  assertEquals(clashClip.payload.otherIsMelee, false, 'otherIsMelee === false');
  assert(clashClip.payload.contactPos !== null, 'contactPos exists');

  console.log('\n[4c] clash timing');
  const launchClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_LAUNCH);
  assert(clashClip.startMs >= launchClip.startMs + launchClip.durationMs,
    'clash.startMs >= launch.startMs + launch.durationMs');
  assertEquals(clashClip.durationMs, 180, 'clash durationMs === 180');
}

// ═══════════════════════════════════════════
// Test 5: intercept + expired
// ═══════════════════════════════════════════

console.log('\n=== Test 5: intercept + expired ===');

{
  const launchEv = makeProjectileCreatedEvent({
    id: 'ev-launch-5',
    projectileId: 'proj-1',
  });

  console.log('\n[5a] projectile_intercept clip');
  const interceptEv = makeProjectileInterceptedEvent({
    id: 'ev-intercept',
    projectileId: 'proj-1',
    targetId: 'char-c',
    basePower: 80,
    metadata: {
      interceptPower: 80,
      projectilePower: 100,
      interceptType: 'buff_intercept',
    },
  });
  const phaseIntercept = makePhase(3, [launchEv, interceptEv]);
  const resIntercept = makeResolution(2, [phaseIntercept]);
  const tlIntercept = compilePresentationTimeline(resIntercept);

  const interceptClip = tlIntercept.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_INTERCEPT);
  assert(interceptClip !== undefined, 'projectile_intercept clip exists');
  assertEquals(interceptClip.kind, PresentationClipKind.PROJECTILE_INTERCEPT, 'kind is projectile_intercept');
  assertEquals(interceptClip.payload.projectileId, 'proj-1', 'projectileId correct');
  assertEquals(interceptClip.payload.interceptorId, 'char-c', 'interceptorId === targetId');
  assertEquals(interceptClip.payload.interceptPower, 80, 'interceptPower correct');
  assertEquals(interceptClip.payload.projectilePower, 100, 'projectilePower correct');
  assertEquals(interceptClip.payload.interceptType, 'buff_intercept', 'interceptType correct');
  assertEquals(interceptClip.durationMs, 180, 'intercept durationMs === 180');

  console.log('\n[5b] projectile_expire clip');
  const expireEv = makeProjectileExpiredEvent({
    id: 'ev-expire',
    projectileId: 'proj-1',
    reason: 'max_range',
    metadata: { lastPos: { q: 5, r: 0 } },
  });
  const phaseExpire = makePhase(3, [launchEv, expireEv]);
  const resExpire = makeResolution(3, [phaseExpire]);
  const tlExpire = compilePresentationTimeline(resExpire);

  const expireClip = tlExpire.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_EXPIRE);
  assert(expireClip !== undefined, 'projectile_expire clip exists');
  assertEquals(expireClip.kind, PresentationClipKind.PROJECTILE_EXPIRE, 'kind is projectile_expire');
  assertEquals(expireClip.payload.projectileId, 'proj-1', 'projectileId correct');
  assertEquals(expireClip.payload.reason, 'max_range', 'reason correct');
  assert(expireClip.payload.lastPos !== null, 'lastPos exists');
  assertEquals(expireClip.payload.lastPos.q, 5, 'lastPos.q === 5');
  assertEquals(expireClip.payload.lastPos.r, 0, 'lastPos.r === 0');
  assertEquals(expireClip.durationMs, 80, 'expire durationMs === 80 (msPerEvent)');

  console.log('\n[5c] intercept/expire timing relative to launch');
  const launchClip5 = tlIntercept.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_LAUNCH);
  assert(interceptClip.startMs >= launchClip5.startMs + launchClip5.durationMs,
    'intercept.startMs >= launch.startMs + launch.durationMs');
}

// ═══════════════════════════════════════════
// Test 6: determinism
// ═══════════════════════════════════════════

console.log('\n=== Test 6: determinism ===');

{
  const launchEv = makeProjectileCreatedEvent();
  const hitEv = makeProjectileCollidedEvent();
  const phase = makePhase(3, [launchEv, hitEv]);
  const resolution = makeResolution(1, [phase]);

  console.log('\n[6a] same input → same output');
  const t1 = compilePresentationTimeline(resolution);
  const t2 = compilePresentationTimeline(resolution);
  const s1 = JSON.stringify(t1);
  const s2 = JSON.stringify(t2);
  assertEquals(s1, s2, 'JSON.stringify(timeline1) === JSON.stringify(timeline2)');

  console.log('\n[6b] class-based API also deterministic');
  const compiler = new PresentationTimelineCompiler();
  const t3 = compiler.compile(resolution);
  const t4 = compiler.compile(resolution);
  assertEquals(JSON.stringify(t3), JSON.stringify(t4), 'class compile: same input → same output');

  console.log('\n[6c] class-based API matches function API with same options');
  const t5 = compiler.compile(resolution);
  const s5 = JSON.stringify(t5);
  // Function API with defaults should match class with defaults
  assertEquals(s1, s5, 'function API with defaults === class API with defaults');
}

// ═══════════════════════════════════════════
// Test 7: tracks structure
// ═══════════════════════════════════════════

console.log('\n=== Test 7: tracks structure ===');

{
  const evA = makeProjectileCreatedEvent({
    id: 'ev-a', projectileId: 'proj-a', actorId: 'char-a',
  });
  const evB = makeProjectileCreatedEvent({
    id: 'ev-b', projectileId: 'proj-b', actorId: 'char-b',
    metadata: {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      flags: ['MELEE'],
      speed: 1,
      isMelee: true,
      projectileType: 'melee',
    },
    projectileType: 'melee',
  });
  const phase = makePhase(3, [evA, evB]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[7a] tracks array');
  assert(Array.isArray(timeline.tracks), 'tracks is array');
  assert(timeline.tracks.length >= 2, 'at least 2 tracks (one per actor)');

  console.log('\n[7b] track structure');
  for (const track of timeline.tracks) {
    assert(typeof track.trackId === 'string', `trackId is string: ${track.trackId}`);
    assert(typeof track.entityId === 'string', `entityId is string: ${track.entityId}`);
    assert(Array.isArray(track.clips), `clips is array for ${track.trackId}`);
    assert(track.clips.length >= 1, `at least 1 clip in track ${track.trackId}`);
  }

  console.log('\n[7c] all clip IDs in tracks reference real clips');
  const clipIds = new Set(timeline.clips.map(c => c.id));
  for (const track of timeline.tracks) {
    for (const clipId of track.clips) {
      assert(clipIds.has(clipId), `track clip id ${clipId} exists in clips array`);
    }
  }
}

// ═══════════════════════════════════════════
// Test 8: multi-phase cumulative timing
// ═══════════════════════════════════════════

console.log('\n=== Test 8: multi-phase cumulative timing ===');

{
  // Phase 1: speed 3, one projectile
  const launchEv = makeProjectileCreatedEvent({
    id: 'ev-p1', projectileId: 'proj-1',
    metadata: {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      flags: [], speed: 3, isMelee: false, projectileType: 'projectile',
    },
  });
  const phase1 = makePhase(3, [launchEv]);

  // Phase 2: speed 2, collision for proj-1 (in different phase)
  const hitEv = makeProjectileCollidedEvent({
    id: 'ev-p2', projectileId: 'proj-1', targetId: 'char-b',
  });
  const phase2 = makePhase(2, [hitEv]);

  const resolution = makeResolution(1, [phase1, phase2]);
  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[8a] phase 2 clips start after phase 1 max end time');
  const launchClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_LAUNCH);
  const impactClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_IMPACT);

  // Phase 1: launch at 0 + 0*80 = 0, duration = 3*80 = 240
  // Phase 1 max end = 240
  // Phase 2: impact at phaseStartMs(240) + 0*80 = 240, duration = 180
  // But impact is linked to launch, so startMs = launch.startMs + launch.durationMs = 0 + 240 = 240
  assert(impactClip.startMs >= launchClip.startMs + launchClip.durationMs,
    'phase 2 impact still linked to launch timing');
  assert(timeline.durationMs >= 240 + 180, 'total duration covers both phases');
}

// ═══════════════════════════════════════════
// Test 9: stationary projectile clip type
// ═══════════════════════════════════════════

console.log('\n=== Test 9: stationary / aoe projectile clip types ===');

{
  console.log('\n[9a] stationary projectile → projectile_launch');
  const ev = makeProjectileCreatedEvent({
    projectileType: 'stationary',
    metadata: {
      path: [{ q: 1, r: 0 }],
      flags: ['STATIONARY'],
      speed: 0,
      isMelee: false,
      projectileType: 'stationary',
    },
  });
  const phase = makePhase(3, [ev]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);
  const clip = timeline.clips[0];
  assertEquals(clip.kind, PresentationClipKind.PROJECTILE_LAUNCH, 'stationary → projectile_launch');
  assertEquals(clip.payload.projectileType, 'stationary', 'projectileType preserved');

  console.log('\n[9b] aoe projectile → projectile_launch');
  const ev2 = makeProjectileCreatedEvent({
    projectileType: 'aoe',
    metadata: {
      path: [{ q: 1, r: 0 }],
      flags: ['AOE_RADIUS_1'],
      speed: 3,
      isMelee: false,
      projectileType: 'aoe',
    },
  });
  const phase2 = makePhase(3, [ev2]);
  const resolution2 = makeResolution(1, [phase2]);
  const timeline2 = compilePresentationTimeline(resolution2);
  const clip2 = timeline2.clips[0];
  assertEquals(clip2.kind, PresentationClipKind.PROJECTILE_LAUNCH, 'aoe → projectile_launch');
  assertEquals(clip2.payload.projectileType, 'aoe', 'projectileType preserved');
}

// ═══════════════════════════════════════════
// Test 10: custom options
// ═══════════════════════════════════════════

console.log('\n=== Test 10: custom timing options ===');

{
  const ev = makeProjectileCreatedEvent({
    metadata: {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
      flags: [], speed: 3, isMelee: false, projectileType: 'projectile',
    },
  });
  const hitEv = makeProjectileCollidedEvent({ projectileId: 'proj-1' });
  const phase = makePhase(3, [ev, hitEv]);
  const resolution = makeResolution(1, [phase]);

  const customOpts = {
    msPerEvent: 100,
    msPerProjectileStep: 60,
    minProjectileDurationMs: 200,
    impactDurationMs: 250,
  };
  const timeline = compilePresentationTimeline(resolution, customOpts);

  const launchClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_LAUNCH);
  const impactClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_IMPACT);

  // path.length(3) * 60 = 180, min is 200 → 200
  assertEquals(launchClip.durationMs, 200, 'custom minProjectileDurationMs applied');
  // eventIndex=0 → startMs = 0 (phaseStartMs is 0)
  assertEquals(launchClip.startMs, 0, 'launch startMs = phaseStartMs + 0*msPerEvent = 0');
  // impact is at eventIndex=1 with msPerEvent=100 → startMs based on launch timing
  assertEquals(impactClip.durationMs, 250, 'custom impactDurationMs applied');
  assert(impactClip.startMs >= launchClip.startMs + launchClip.durationMs,
    'impact still linked to launch timing with custom opts');
}

// ═══════════════════════════════════════════
// Test 11: non-projectile events are skipped
// ═══════════════════════════════════════════

console.log('\n=== Test 11: non-projectile events skipped ===');

{
  const resourceEv = {
    id: 'ev-res', eventType: 'resource_changed',
    actorId: 'char-a', resource: 'qi', delta: -1,
  };
  const moveEv = {
    id: 'ev-move', eventType: 'character_moved',
    actorId: 'char-a', from: { q: 0, r: 0 }, to: { q: 1, r: 0 },
  };
  const damageEv = {
    id: 'ev-dmg', eventType: 'damage_applied',
    actorId: 'char-a', targetId: 'char-b', finalDamage: 50,
  };
  const launchEv = makeProjectileCreatedEvent({ id: 'ev-launch' });
  const phase = makePhase(3, [resourceEv, moveEv, damageEv, launchEv]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[11a] only projectile events produce clips');
  assertEquals(timeline.clips.length, 1, 'only 1 clip (projectile_launch)');
  assertEquals(timeline.clips[0].sourceEventId, 'ev-launch', 'correct event compiled');

  console.log('\n[11b] non-projectile events do not create clips');
  const kinds = timeline.clips.map(c => c.kind);
  assert(!kinds.includes('resource_changed'), 'no resource clip');
  assert(!kinds.includes('character_moved'), 'no move clip');
  assert(!kinds.includes('damage_applied'), 'no damage clip');
}

// ═══════════════════════════════════════════
// Test 12: aoe_explosion hitType → impact
// ═══════════════════════════════════════════

console.log('\n=== Test 12: aoe_explosion hitType → impact');

{
  const launchEv = makeProjectileCreatedEvent({
    id: 'ev-launch-12', projectileId: 'proj-aoe',
    projectileType: 'aoe',
    metadata: {
      path: [{ q: 1, r: 0 }],
      flags: ['AOE_RADIUS_1'], speed: 3, isMelee: false, projectileType: 'aoe',
    },
  });
  const hitEv = {
    id: 'ev-hit-12',
    eventType: 'projectile_collided',
    actionId: 'act-1',
    projectileId: 'proj-aoe',
    targetId: 'char-b',
    targetPos: { q: 1, r: 0 },
    finalDamage: 80,
    metadata: {
      hitType: 'aoe_explosion',
      contactPos: { q: 1, r: 0 },
      isMelee: false,
      flags: ['AOE_RADIUS_1'],
      ownerId: 'char-a',
    },
  };
  const phase = makePhase(3, [launchEv, hitEv]);
  const resolution = makeResolution(1, [phase]);
  const timeline = compilePresentationTimeline(resolution);

  const impactClip = timeline.clips.find(c => c.kind === PresentationClipKind.PROJECTILE_IMPACT);
  assert(impactClip !== undefined, 'aoe impact clip exists');
  assertEquals(impactClip.payload.hitType, 'aoe_explosion', 'hitType === aoe_explosion');
  assert(impactClip.payload.flags.includes('AOE_RADIUS_1'), 'flags preserved');
}

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) {
  console.error('SOME TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
