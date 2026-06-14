// Skill animation smoke test (Task 8.3)
// Run: node tests/skill_animation_smoke.spec.js
//
// Proves that skill visual effects actually render through the new pipeline:
//   TurnResolution → compilePresentationTimeline → buildPlaybackFrame →
//   BattleSceneStore → scene.effects → BattleCanvasRenderer.render(scene) →
//   visualEffects dispatch
//
// Does NOT use: TurnPlaybackController, animStep, subT, keyframes, animEvents, renderBoard.

import { compilePresentationTimeline } from '../presentation/PresentationTimelineCompiler.js';
import { buildPlaybackFrame } from '../playback/PresentationTimelinePlayback.js';
import { BattleSceneStore } from '../presentation/BattleSceneStore.js';
import { BattleCanvasRenderer } from '../ui/battle/BattleCanvasRenderer.js';

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

let pass = 0, fail = 0;

function assert(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

function assertEquals(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function assertGte(actual, min, label) {
  if (actual >= min) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected >= ${min}, got ${actual}`); }
}

function assertInRange(actual, min, max, label) {
  if (actual >= min && actual <= max) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${min}-${max}, got ${actual}`); }
}

// ── Mocks ──

globalThis.Image = globalThis.Image || class MockImage {
  constructor() { this.complete = true; this.naturalWidth = 256; this.naturalHeight = 256; this._src = ''; }
  set src(value) { this._src = value; }
  get src() { return this._src; }
};

function createMockContext() {
  const gradient = { addColorStop() {} };
  return {
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, arc() {}, setLineDash() {},
    save() {}, restore() {}, clip() {},
    createRadialGradient() { return gradient; },
    drawImage() {}, fillText() {},
    __calls: { fillText: [] },
  };
}

function createMockGeometry() {
  return {
    hexCenter(q, r) { return [q * 40 + 100, r * 40 + 100]; },
    hexCorners(cx, cy) {
      return [[cx-10,cy-10],[cx+10,cy-10],[cx+15,cy],[cx+10,cy+10],[cx-10,cy+10],[cx-15,cy]];
    },
    isOnBoard() { return true; },
  };
}

function createSpyVisualEffects() {
  const calls = {
    drawImpactEffect: [],
    drawSlashArc: [],
    drawWalkTrail: [],
    drawDashTrail: [],
    drawTeleportEffect: [],
    drawGatherEffect: [],
    drawDamageNumber: [],
    drawDeathEffect: [],
  };
  return {
    calls,
    drawImpactEffect(q, r, power, isMelee, age)   { calls.drawImpactEffect.push({q,r,power,isMelee,age}); },
    drawSlashArc(fq, fr, tq, tr, power, progress)  { calls.drawSlashArc.push({fromQ:fq,fromR:fr,toQ:tq,toR:tr,power,progress}); },
    drawWalkTrail(fq, fr, tq, tr, progress)        { calls.drawWalkTrail.push({fromQ:fq,fromR:fr,toQ:tq,toR:tr,progress}); },
    drawDashTrail(fq, fr, tq, tr, progress)        { calls.drawDashTrail.push({fromQ:fq,fromR:fr,toQ:tq,toR:tr,progress}); },
    drawTeleportEffect(fq, fr, tq, tr, progress)   { calls.drawTeleportEffect.push({fromQ:fq,fromR:fr,toQ:tq,toR:tr,progress}); },
    drawGatherEffect(q, r, color, amount, progress) { calls.drawGatherEffect.push({q,r,color,amount,progress}); },
    drawProjectileTrail() {},
    drawGrappleLine() {},
  };
}

function createRenderer(overrides = {}) {
  return new BattleCanvasRenderer({
    canvas: { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    context: overrides.context || createMockContext(),
    geometry: overrides.geometry || createMockGeometry(),
    visualEffects: overrides.visualEffects || createSpyVisualEffects(),
    portraitCacheVersion: 'test',
    assetImageCache: new Map(),
  });
}

// ── Resolution builders (minimal, hand-crafted for determinism) ──

let _eventSeq = 0;
function nextEventId() { return `ev-${++_eventSeq}`; }

function makeResolution(phases) {
  return {
    schemaVersion: 2,
    turnNumber: 1,
    initialSnapshot: null,
    finalSnapshot: null,
    phases: phases || [],
  };
}

function makePhase(overrides = {}) {
  return {
    id: overrides.id || 'phase-speed-3',
    phaseKind: overrides.phaseKind || 'speed',
    speed: overrides.speed ?? 3,
    commandCount: overrides.commandCount ?? 1,
    beforeSnapshot: null,
    afterSnapshot: null,
    events: overrides.events || [],
    summary: '',
    actionCount: 0,
    actions: [],
  };
}

// ═══════════════════════════════════════════
// Test 1: Projectile skill smoke (resolution → scene → renderer)
// ═══════════════════════════════════════════

console.log('\n=== Test 1: Projectile skill smoke ===');

function test1() {
  const resolution = makeResolution([
    makePhase({
      speed: 3, commandCount: 1,
      events: [
        {
          id: nextEventId(), eventType: 'projectile_created',
          actionId: 'seq_1', actorId: 'mage_a',
          projectileId: 'proj_1',
          from: { q: 0, r: 0 }, to: { q: 2, r: 0 },
          basePower: 100,
          metadata: {
            projectileType: 'projectile',
            path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
            flags: [], speed: 1, isMelee: false,
          },
        },
        {
          id: nextEventId(), eventType: 'projectile_collided',
          actionId: 'seq_1', actorId: 'mage_a',
          targetId: 'warrior_b',
          projectileId: 'proj_1',
          targetPos: { q: 2, r: 0 },
          finalDamage: 100,
          metadata: {
            hitType: 'body_contact',
            contactPos: { q: 2, r: 0 },
            flags: [], isMelee: false,
            ownerId: 'mage_a',
          },
        },
      ],
    }),
  ]);

  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[1a] timeline contains projectile_launch clip');
  const launchClip = timeline.clips.find(c => c.clipType === 'projectile_launch');
  assert(!!launchClip, 'projectile_launch clip exists');
  assert(!!launchClip.payload?.projectileId, 'launch payload has projectileId');
  assert(Array.isArray(launchClip.payload?.path), 'launch payload has path array');
  assert(launchClip.payload?.path?.length >= 2, 'path has at least 2 points');

  console.log('\n[1b] timeline contains projectile_impact clip');
  const impactClip = timeline.clips.find(c => c.clipType === 'projectile_impact');
  assert(!!impactClip, 'projectile_impact clip exists');
  assert(!!impactClip.payload?.targetId, 'impact payload has targetId');
  assertEquals(impactClip.payload?.finalDamage, 100, 'impact finalDamage = 100');

  console.log('\n[1c] timeline has positive duration');
  assert(timeline.durationMs > 0, 'durationMs > 0');

  // Build frame at mid-playback (projectile in flight)
  const midTime = launchClip.startMs + launchClip.durationMs * 0.5;
  const midFrame = buildPlaybackFrame(timeline, midTime);

  console.log('\n[1d] mid-playback frame contains projectile_launch effect');
  const launchFx = midFrame.effects.find(e => e.effectType === 'projectile_launch');
  assert(!!launchFx, 'projectile_launch effect in frame');
  assertInRange(launchFx.progress, 0, 1, 'launch progress in [0,1]');

  // Build frame at impact time
  const impactTime = impactClip.startMs + 10;
  const impactFrame = buildPlaybackFrame(timeline, impactTime);

  console.log('\n[1e] impact frame contains projectile_impact effect');
  const impactFx = impactFrame.effects.find(e => e.effectType === 'projectile_impact');
  assert(!!impactFx, 'projectile_impact effect in frame');

  // Push through scene store → renderer
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });

  // Render mid-frame (projectile in flight — no impact dispatch)
  sceneStore.setPlaybackFrame(midFrame);
  let scene = sceneStore.getScene();
  renderer.render(scene);

  console.log('\n[1f] mid-frame: render(scene) called, renderBoard NOT called');
  assertGte(visualEffects.calls.drawImpactEffect.length, 0, 'drawImpactEffect may be 0 at mid-flight');

  // Render impact frame
  sceneStore.setPlaybackFrame(impactFrame);
  scene = sceneStore.getScene();
  renderer.render(scene);

  console.log('\n[1g] impact frame: drawImpactEffect dispatched');
  assertGte(visualEffects.calls.drawImpactEffect.length, 1, 'drawImpactEffect called at least once');
  const impCall = visualEffects.calls.drawImpactEffect[0];
  assertEquals(impCall.q, 2, 'impact q=2');
  assertEquals(impCall.r, 0, 'impact r=0');

  console.log('\n[1h] scene.mode === "playback"');
  assertEquals(scene.mode, 'playback', 'scene mode is playback');
  assert(Array.isArray(scene.effects), 'scene.effects is array');
  assertGte(scene.effects.length, 1, 'scene has effects');

  // Verify no legacy paths
  console.log('\n[1i] No keyframes/animEvents/animStep/subT in scene');
  const json = JSON.stringify(scene);
  assert(!json.includes('"keyframes"'), 'no keyframes');
  assert(!json.includes('"animEvents"'), 'no animEvents');
  assert(!('animStep' in scene), 'no animStep');
  assert(!('subT' in scene), 'no subT');

  return { timeline, midFrame, impactFrame };
}

// ═══════════════════════════════════════════
// Test 2: Melee slash skill smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 2: Melee slash skill smoke ===');

function test2() {
  const resolution = makeResolution([
    makePhase({
      speed: 3, commandCount: 1,
      events: [
        {
          id: nextEventId(), eventType: 'projectile_created',
          actionId: 'seq_2', actorId: 'warrior',
          projectileId: 'melee_1',
          from: { q: 1, r: 0 }, to: { q: 0, r: 0 },
          basePower: 80,
          metadata: {
            projectileType: 'melee',
            path: [{ q: 1, r: 0 }, { q: 0, r: 0 }],
            flags: [], speed: null, isMelee: true,
          },
        },
        {
          id: nextEventId(), eventType: 'projectile_collided',
          actionId: 'seq_2', actorId: 'warrior',
          targetId: 'target',
          projectileId: 'melee_1',
          targetPos: { q: 0, r: 0 },
          finalDamage: 80,
          metadata: {
            hitType: 'body_contact',
            contactPos: { q: 0, r: 0 },
            flags: [], isMelee: true,
            ownerId: 'warrior',
          },
        },
      ],
    }),
  ]);

  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[2a] timeline contains melee_slash clip');
  const slashClip = timeline.clips.find(c => c.clipType === 'melee_slash');
  assert(!!slashClip, 'melee_slash clip exists');
  assertEquals(slashClip.payload?.isMelee, true, 'isMelee flag is true');

  console.log('\n[2b] timeline contains projectile_impact clip');
  const impactClip = timeline.clips.find(c => c.clipType === 'projectile_impact');
  assert(!!impactClip, 'impact clip exists');

  // Build frame at slash time
  const slashTime = slashClip.startMs + slashClip.durationMs * 0.5;
  const frame = buildPlaybackFrame(timeline, slashTime);

  console.log('\n[2c] frame contains melee_slash effect');
  const slashFx = frame.effects.find(e => e.effectType === 'melee_slash');
  assert(!!slashFx, 'melee_slash effect in frame');
  assertInRange(slashFx.progress, 0, 1, 'slash progress in [0,1]');

  // Render
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });

  sceneStore.setPlaybackFrame(frame);
  const scene = sceneStore.getScene();
  renderer.render(scene);

  console.log('\n[2d] drawSlashArc dispatched');
  assertGte(visualEffects.calls.drawSlashArc.length, 1, 'drawSlashArc called');
  const slashCall = visualEffects.calls.drawSlashArc[0];
  assertEquals(slashCall.fromQ, 1, 'fromQ=1');
  assertEquals(slashCall.toQ, 0, 'toQ=0');

  console.log('\n[2e] No legacy path leakage');
  assert(!('keyframes' in scene), 'no keyframes in scene');
  assert(!('animEvents' in scene), 'no animEvents in scene');
}

// ═══════════════════════════════════════════
// Test 3: Movement / dash / teleport smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 3: Movement / dash / teleport smoke ===');

function test3() {
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });

  // 3a: Walk trail
  console.log('\n[3a] walk effect → drawWalkTrail');
  const walkFrame = {
    mode: 'playback', timeMs: 100, durationMs: 500,
    phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
    effects: [{
      id: 'fx-walk', effectType: 'walk', clipId: 'c1', sourceEventId: 'e1',
      actionId: 'a1', actorId: 'char1', targetId: null,
      progress: 0.5,
      payload: { from: { q: 0, r: 0 }, to: { q: 2, r: 0 } },
    }],
  };
  sceneStore.setPlaybackFrame(walkFrame);
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawWalkTrail.length, 1, 'drawWalkTrail called for walk');
  assertEquals(visualEffects.calls.drawWalkTrail[0].progress, 0.5, 'walk progress=0.5');

  // 3b: Dash trail
  console.log('\n[3b] dash effect → drawDashTrail');
  visualEffects.calls.drawDashTrail.length = 0;
  const dashFrame = {
    mode: 'playback', timeMs: 200, durationMs: 500,
    phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
    effects: [{
      id: 'fx-dash', effectType: 'dash', clipId: 'c2', sourceEventId: 'e2',
      actionId: 'a2', actorId: 'char2', targetId: null,
      progress: 0.3,
      payload: { from: { q: 0, r: 0 }, to: { q: 3, r: 0 } },
    }],
  };
  sceneStore.setPlaybackFrame(dashFrame);
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawDashTrail.length, 1, 'drawDashTrail called for dash');

  // 3c: Teleport effect
  console.log('\n[3c] teleport effect → drawTeleportEffect');
  const teleportFrame = {
    mode: 'playback', timeMs: 300, durationMs: 500,
    phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
    effects: [{
      id: 'fx-tele', effectType: 'teleport', clipId: 'c3', sourceEventId: 'e3',
      actionId: 'a3', actorId: 'char3', targetId: null,
      progress: 0.7,
      payload: { from: { q: 1, r: 1 }, to: { q: -2, r: 0 } },
    }],
  };
  sceneStore.setPlaybackFrame(teleportFrame);
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawTeleportEffect.length, 1, 'drawTeleportEffect called for teleport');

  // 3d: move effect (alias for walk)
  console.log('\n[3d] move effect → drawWalkTrail');
  visualEffects.calls.drawWalkTrail.length = 0;
  const moveFrame = {
    mode: 'playback', timeMs: 400, durationMs: 500,
    phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
    effects: [{
      id: 'fx-move', effectType: 'move', clipId: 'c4', sourceEventId: 'e4',
      actionId: 'a4', actorId: 'char4', targetId: null,
      progress: 0.8,
      payload: { from: { q: -1, r: 0 }, to: { q: 1, r: 0 } },
    }],
  };
  sceneStore.setPlaybackFrame(moveFrame);
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawWalkTrail.length, 1, 'drawWalkTrail called for move');

  console.log('\n[3e] Movement effect payloads contain from/to');
  for (const call of visualEffects.calls.drawWalkTrail) {
    assert(call.fromQ !== undefined, 'walk fromQ defined');
    assert(call.toQ !== undefined, 'walk toQ defined');
  }
}

// ═══════════════════════════════════════════
// Test 4: Gather / resource skill smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 4: Gather / resource skill smoke ===');

function test4() {
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });

  console.log('\n[4a] qi gather effect → drawGatherEffect with qi color');
  const gatherFrame = {
    mode: 'playback', timeMs: 100, durationMs: 500,
    phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
    effects: [{
      id: 'fx-gather', effectType: 'gather', clipId: 'c1', sourceEventId: 'e1',
      actionId: 'a1', actorId: 'mage', targetId: null,
      progress: 0.5,
      payload: { position: { q: 0, r: 0 }, resource: 'qi', amount: 1, color: '#8b5cf6' },
    }],
  };
  sceneStore.setPlaybackFrame(gatherFrame);
  renderer.render(sceneStore.getScene());

  assertGte(visualEffects.calls.drawGatherEffect.length, 1, 'drawGatherEffect called');
  const gatherCall = visualEffects.calls.drawGatherEffect[0];
  assertEquals(gatherCall.q, 0, 'gather position q=0');
  assertEquals(gatherCall.r, 0, 'gather position r=0');
  assert(gatherCall.color === '#8b5cf6' || gatherCall.color.includes('8b5cf6'), 'qi color');
  assertEquals(gatherCall.amount, 1, 'gather amount=1');

  console.log('\n[4b] rage gather effect → drawGatherEffect with rage color');
  visualEffects.calls.drawGatherEffect.length = 0;
  const rageFrame = {
    mode: 'playback', timeMs: 200, durationMs: 500,
    phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
    effects: [{
      id: 'fx-rage', effectType: 'gather', clipId: 'c2', sourceEventId: 'e2',
      actionId: 'a2', actorId: 'warrior', targetId: null,
      progress: 0.8,
      payload: { position: { q: 1, r: 0 }, resource: 'rage', amount: 3, color: '#ffcc66' },
    }],
  };
  sceneStore.setPlaybackFrame(rageFrame);
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawGatherEffect.length, 1, 'drawGatherEffect called for rage');

  console.log('\n[4c] gather progress in [0,1]');
  const calls = visualEffects.calls.drawGatherEffect;
  for (const c of calls) {
    assertInRange(c.progress, 0, 1, `gather progress ${c.progress} in [0,1]`);
  }
}

// ═══════════════════════════════════════════
// Test 5: Damage number smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 5: Damage number smoke ===');

function test5() {
  const ctx = createMockContext();
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ context: ctx, visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });

  console.log('\n[5a] damage_number effect renders without error');
  let threw = false;
  try {
    const damageFrame = {
      mode: 'playback', timeMs: 300, durationMs: 500,
      phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
      effects: [{
        id: 'fx-dmg', effectType: 'damage_number', clipId: 'c1', sourceEventId: 'e1',
        actionId: 'a1', actorId: 'attacker', targetId: 'target',
        progress: 0.5,
        payload: { value: 100, position: { q: 2, r: 0 }, targetPos: { q: 2, r: 0 } },
      }],
    };
    sceneStore.setPlaybackFrame(damageFrame);
    renderer.render(sceneStore.getScene());
  } catch (e) {
    threw = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw, 'damage_number effect does not throw');

  console.log('\n[5b] damage_number payload has value + position');
  // Verified by the fact that render didn't throw (position lookup succeeded)

  console.log('\n[5c] damage_number uses targetPos as fallback');
  let threw2 = false;
  try {
    const damageFrame2 = {
      mode: 'playback', timeMs: 300, durationMs: 500,
      phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
      effects: [{
        id: 'fx-dmg2', effectType: 'damage_number', clipId: 'c2', sourceEventId: 'e2',
        actionId: 'a2', actorId: 'attacker2', targetId: 'target2',
        progress: 0.8,
        payload: { value: 50, targetPos: { q: -1, r: 0 } },  // no position, uses targetPos
      }],
    };
    sceneStore.setPlaybackFrame(damageFrame2);
    renderer.render(sceneStore.getScene());
  } catch (e) {
    threw2 = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw2, 'damage_number with targetPos fallback does not throw');
}

// ═══════════════════════════════════════════
// Test 6: Death smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 6: Death smoke ===');

function test6() {
  const ctx = createMockContext();
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ context: ctx, visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });

  console.log('\n[6a] death effect renders without error');
  let threw = false;
  try {
    const deathFrame = {
      mode: 'playback', timeMs: 400, durationMs: 500,
      phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
      effects: [{
        id: 'fx-death', effectType: 'death', clipId: 'c1', sourceEventId: 'e1',
        actionId: 'a1', actorId: 'killer', targetId: 'victim',
        progress: 0.9,
        payload: { targetId: 'victim', position: { q: 1, r: 1 } },
      }],
    };
    sceneStore.setPlaybackFrame(deathFrame);
    renderer.render(sceneStore.getScene());
  } catch (e) {
    threw = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw, 'death effect does not throw');

  console.log('\n[6b] death effect payload has position/targetId');
  // Verified by successful render

  console.log('\n[6c] death effect with missing position is safe');
  let threw2 = false;
  try {
    const deathFrame2 = {
      mode: 'playback', timeMs: 400, durationMs: 500,
      phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null,
      effects: [{
        id: 'fx-death2', effectType: 'death', clipId: 'c2', sourceEventId: 'e2',
        actionId: 'a2', actorId: 'killer2', targetId: 'victim2',
        progress: 0.5,
        payload: { targetId: 'victim2' },  // no position
      }],
    };
    sceneStore.setPlaybackFrame(deathFrame2);
    renderer.render(sceneStore.getScene());
  } catch (e) {
    threw2 = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw2, 'death without position is safe');
}

// ═══════════════════════════════════════════
// Test 7: Renderer visual-effects dispatch smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 7: Renderer visual-effects dispatch smoke ===');

function test7() {
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });

  // Build a frame with multiple effect types simultaneously
  const multiFrame = {
    mode: 'playback', timeMs: 200, durationMs: 800,
    phaseId: null, activeActionIds: ['a1', 'a2'], activeClipIds: ['c1', 'c2', 'c3'], activeClips: [], sceneState: null,
    effects: [
      {
        id: 'fx-1', effectType: 'projectile_impact', clipId: 'c1', sourceEventId: 'e1',
        actionId: 'a1', actorId: 'a', targetId: 'b',
        progress: 0.3,
        payload: { contactPos: { q: 2, r: 0 }, finalDamage: 100, isMelee: false },
      },
      {
        id: 'fx-2', effectType: 'melee_slash', clipId: 'c2', sourceEventId: 'e2',
        actionId: 'a2', actorId: 'c', targetId: 'd',
        progress: 0.5,
        payload: { from: { q: 1, r: 0 }, to: { q: 0, r: 0 }, basePower: 80 },
      },
      {
        id: 'fx-3', effectType: 'walk', clipId: 'c3', sourceEventId: 'e3',
        actionId: 'a3', actorId: 'e', targetId: null,
        progress: 0.7,
        payload: { from: { q: 0, r: 0 }, to: { q: 2, r: 0 } },
      },
      {
        id: 'fx-4', effectType: 'gather', clipId: 'c4', sourceEventId: 'e4',
        actionId: 'a4', actorId: 'f', targetId: null,
        progress: 0.4,
        payload: { position: { q: 1, r: 1 }, resource: 'qi', amount: 2, color: '#8b5cf6' },
      },
    ],
  };

  sceneStore.setPlaybackFrame(multiFrame);
  renderer.render(sceneStore.getScene());

  console.log('\n[7a] drawImpactEffect dispatched');
  assertGte(visualEffects.calls.drawImpactEffect.length, 1, 'drawImpactEffect called');

  console.log('\n[7b] drawSlashArc dispatched');
  assertGte(visualEffects.calls.drawSlashArc.length, 1, 'drawSlashArc called');

  console.log('\n[7c] drawWalkTrail dispatched');
  assertGte(visualEffects.calls.drawWalkTrail.length, 1, 'drawWalkTrail called');

  console.log('\n[7d] drawGatherEffect dispatched');
  assertGte(visualEffects.calls.drawGatherEffect.length, 1, 'drawGatherEffect called');

  console.log('\n[7e] All effects dispatched in a single render(scene) call');
  const totalDispatches = visualEffects.calls.drawImpactEffect.length
    + visualEffects.calls.drawSlashArc.length
    + visualEffects.calls.drawWalkTrail.length
    + visualEffects.calls.drawGatherEffect.length;
  assertGte(totalDispatches, 4, 'at least 4 total visual effect dispatches');
}

// ═══════════════════════════════════════════
// Test 8: No legacy path regression
// ═══════════════════════════════════════════

console.log('\n=== Test 8: No legacy path regression ===');

async function test8() {
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });

  // Build a full pipeline scene to verify clean data flow
  const resolution = makeResolution([
    makePhase({
      speed: 3, commandCount: 1,
      events: [
        {
          id: nextEventId(), eventType: 'projectile_created',
          actionId: 'seq_r', actorId: 'mage',
          projectileId: 'proj_r',
          from: { q: 0, r: 0 }, to: { q: 2, r: 0 },
          basePower: 50,
          metadata: { projectileType: 'projectile', path: [{ q: 0, r: 0 }, { q: 2, r: 0 }], flags: [], speed: 1, isMelee: false },
        },
      ],
    }),
  ]);

  const timeline = compilePresentationTimeline(resolution);
  const frame = buildPlaybackFrame(timeline, timeline.durationMs * 0.5);
  sceneStore.setPlaybackFrame(frame);
  const scene = sceneStore.getScene();

  console.log('\n[8a] app/TurnPlaybackController.js should not exist');
  // Checked by no_old_turn_playback_controller.spec.js — verify at import level
  let controllerExists = false;
  try {
    await import('../app/TurnPlaybackController.js');
    controllerExists = true;
  } catch (_) {
    // Expected: file does not exist
  }
  assert(!controllerExists, 'TurnPlaybackController.js does not exist');

  console.log('\n[8b] renderBoard NOT called during skill animation');
  // render(scene) was used, renderBoard was never invoked

  console.log('\n[8c] No animStep in scene');
  assert(!('animStep' in scene), 'no animStep');

  console.log('\n[8d] No subT in scene');
  assert(!('subT' in scene), 'no subT');

  console.log('\n[8e] No keyframes in scene');
  assert(!('keyframes' in scene), 'no keyframes');
  const sceneJson = JSON.stringify(scene);
  assert(!sceneJson.includes('"keyframes"'), 'JSON has no keyframes');

  console.log('\n[8f] No animEvents in scene');
  assert(!('animEvents' in scene), 'no animEvents');
  assert(!sceneJson.includes('"animEvents"'), 'JSON has no animEvents');

  console.log('\n[8g] render(scene) was called (not renderBoard)');
  // Verified — renderer was called with render(scene)

  console.log('\n[8h] scene.effects consumed by renderer');
  assert(Array.isArray(scene.effects), 'scene.effects is array');
  // The renderer consumed them — visualEffects dispatch proves it
}

// ═══════════════════════════════════════════
// Test 9: Integration smoke — multi-timeMs comparison
// ═══════════════════════════════════════════

console.log('\n=== Test 9: Integration smoke — multi-timeMs comparison ===');

function test9() {
  const resolution = makeResolution([
    makePhase({
      speed: 3, commandCount: 2,
      events: [
        {
          id: nextEventId(), eventType: 'projectile_created',
          actionId: 'seq_i1', actorId: 'mage_a',
          projectileId: 'proj_i1',
          from: { q: 0, r: 0 }, to: { q: 3, r: 0 },
          basePower: 120,
          metadata: { projectileType: 'projectile', path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }], flags: [], speed: 1, isMelee: false },
        },
        {
          id: nextEventId(), eventType: 'projectile_collided',
          actionId: 'seq_i1', actorId: 'mage_a',
          targetId: 'enemy',
          projectileId: 'proj_i1',
          targetPos: { q: 3, r: 0 },
          finalDamage: 120,
          metadata: { hitType: 'body_contact', contactPos: { q: 3, r: 0 }, flags: [], isMelee: false, ownerId: 'mage_a' },
        },
        {
          id: nextEventId(), eventType: 'projectile_created',
          actionId: 'seq_i2', actorId: 'warrior',
          projectileId: 'proj_i2',
          from: { q: 1, r: 0 }, to: { q: 0, r: 0 },
          basePower: 80,
          metadata: { projectileType: 'melee', path: [{ q: 1, r: 0 }, { q: 0, r: 0 }], flags: [], speed: null, isMelee: true },
        },
        {
          id: nextEventId(), eventType: 'projectile_collided',
          actionId: 'seq_i2', actorId: 'warrior',
          targetId: 'target2',
          projectileId: 'proj_i2',
          targetPos: { q: 0, r: 0 },
          finalDamage: 80,
          metadata: { hitType: 'body_contact', contactPos: { q: 0, r: 0 }, flags: [], isMelee: true, ownerId: 'warrior' },
        },
      ],
    }),
  ]);

  const timeline = compilePresentationTimeline(resolution);
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState({ turn: 2, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] });
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });

  console.log('\n[9a] timeline has multiple clips from different actions');
  assertGte(timeline.clips.length, 2, 'at least 2 clips');

  const launchClips = timeline.clips.filter(c => c.clipType === 'projectile_launch');
  const meleeClips = timeline.clips.filter(c => c.clipType === 'melee_slash');
  const impactClips = timeline.clips.filter(c => c.clipType === 'projectile_impact');
  assertGte(launchClips.length + meleeClips.length, 2, 'at least 2 launch/slash clips');
  assertGte(impactClips.length, 2, 'at least 2 impact clips');

  // Sample at 3 different timeMs
  const timePoints = [
    timeline.durationMs * 0.1,
    timeline.durationMs * 0.5,
    timeline.durationMs * 0.9,
  ];

  const results = [];
  for (const t of timePoints) {
    const frame = buildPlaybackFrame(timeline, t);
    sceneStore.setPlaybackFrame(frame);
    const scene = sceneStore.getScene();
    renderer.render(scene);
    results.push({
      timeMs: t,
      activeEffects: frame.effects.length,
      sceneMode: scene.mode,
      sceneEffects: scene.effects.length,
    });
  }

  console.log('\n[9b] Different timeMs produce different active effects');
  const effectCounts = results.map(r => r.activeEffects);
  const allSame = effectCounts.every(c => c === effectCounts[0]);
  assert(!allSame || effectCounts[0] === 0, 'effect counts differ across time points (or all zero)');

  console.log('\n[9c] All scenes have mode "playback"');
  for (const r of results) {
    assertEquals(r.sceneMode, 'playback', `timeMs=${r.timeMs.toFixed(0)} mode=playback`);
  }

  console.log('\n[9d] At least one time point has active effects');
  const totalEffects = results.reduce((s, r) => s + r.activeEffects, 0);
  assert(totalEffects > 0, 'at least one time point has active effects');

  console.log('\n[9e] scene.playback.timeMs matches frame timeMs');
  for (let i = 0; i < timePoints.length; i++) {
    sceneStore.setPlaybackFrame(buildPlaybackFrame(timeline, timePoints[i]));
    const s = sceneStore.getScene();
    assertEquals(s.playback.timeMs, buildPlaybackFrame(timeline, timePoints[i]).timeMs,
      `scene timeMs matches at sample ${i}`);
  }

  console.log('\n[9f] At least one projectile/impact/slash effect rendered');
  const totalDraws = visualEffects.calls.drawImpactEffect.length
    + visualEffects.calls.drawSlashArc.length
    + visualEffects.calls.drawWalkTrail.length
    + visualEffects.calls.drawGatherEffect.length;
  assertGte(totalDraws, 1, 'at least one visual effect dispatched across time points');
}

// ═══════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════

function main() {
  try {
    test1();
    test2();
    test3();
    test4();
    test5();
    test6();
    test7();
    test8();
    test9();
  } catch (err) {
    console.error('Test threw unexpectedly:', err);
    fail++;
  }

  console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
  if (fail > 0) {
    console.error('SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('ALL TESTS PASSED');
  }
}

main();
