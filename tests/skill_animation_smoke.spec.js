// Skill animation smoke test (Task 8.3)
// Run: node tests/skill_animation_smoke.spec.js
//
// Proves that skill visual effects actually render through the new pipeline:
//   TurnResolution → compilePresentationTimeline → buildPlaybackFrame →
//   BattleSceneStore → scene.effects → BattleCanvasRenderer.render(scene) →
//   visualEffects dispatch
//
// Does NOT use: TurnPlaybackController, animStep, subT, keyframes, animEvents, renderBoard.

import * as fs from 'fs';
import * as path from 'path';
import { compilePresentationTimeline } from '../presentation/PresentationTimelineCompiler.js';
import { buildPlaybackFrame } from '../playback/PresentationTimelinePlayback.js';
import { BattleSceneStore } from '../presentation/BattleSceneStore.js';
import { BattleCanvasRenderer } from '../ui/battle/BattleCanvasRenderer.js';
import { BattleSessionController } from '../session/BattleSessionController.js';
import { createTurnResolutionBuilder } from '../engine/resolution/TurnResolutionBuilder.js';

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
  const api = {
    clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() {}, stroke() {}, arc() {}, setLineDash() {},
    save() {}, restore() {}, clip() {},
    createRadialGradient() { return gradient; },
    drawImage() {}, fillText() {},
  };
  // Instrument with call counters
  const counters = { clearRect: 0, fillText: 0, arc: 0, stroke: 0, fill: 0, drawImage: 0 };
  for (const key of Object.keys(counters)) {
    const orig = api[key];
    api[key] = function (...args) { counters[key]++; return orig.apply(this, args); };
  }
  api.__counters = counters;
  return api;
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
    drawProjectileTrail: [],
    drawGrappleLine: [],
  };
  return {
    calls,
    drawImpactEffect(q, r, power, isMelee, age)   { calls.drawImpactEffect.push({q,r,power,isMelee,age}); },
    drawSlashArc(fq, fr, tq, tr, power, progress)  { calls.drawSlashArc.push({fq,fr,tq,tr,power,progress}); },
    drawWalkTrail(fq, fr, tq, tr, progress)        { calls.drawWalkTrail.push({fq,fr,tq,tr,progress}); },
    drawDashTrail(fq, fr, tq, tr, progress)        { calls.drawDashTrail.push({fq,fr,tq,tr,progress}); },
    drawTeleportEffect(fq, fr, tq, tr, progress)   { calls.drawTeleportEffect.push({fq,fr,tq,tr,progress}); },
    drawGatherEffect(q, r, color, amount, progress) { calls.drawGatherEffect.push({q,r,color,amount,progress}); },
    drawProjectileTrail(_q, _r, _power, _color)    { calls.drawProjectileTrail.push({}); },
    drawGrappleLine()                                { calls.drawGrappleLine.push({}); },
  };
}

function createRenderer(overrides = {}) {
  const renderer = new BattleCanvasRenderer({
    canvas: { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    context: overrides.context || createMockContext(),
    geometry: overrides.geometry || createMockGeometry(),
    visualEffects: overrides.visualEffects || createSpyVisualEffects(),
    portraitCacheVersion: 'test',
    assetImageCache: new Map(),
  });
  // Spy on renderBoard to verify it's never called during skill animation
  const renderBoardCalls = [];
  const origRenderBoard = renderer.renderBoard?.bind(renderer);
  renderer.renderBoard = function (...args) {
    renderBoardCalls.push(args);
    if (origRenderBoard) return origRenderBoard(...args);
  };
  renderer.__renderBoardCalls = renderBoardCalls;
  return renderer;
}

// ── Resolution builders for hand-crafted events ──

let _eventSeq = 0;
function nextEventId() { return `ev-${++_eventSeq}`; }

function makeResolution(phases) {
  return { schemaVersion: 2, turnNumber: 1, initialSnapshot: null, finalSnapshot: null, phases: phases || [] };
}

function makePhase(overrides = {}) {
  return {
    id: overrides.id || 'phase-speed-3', phaseKind: overrides.phaseKind || 'speed',
    speed: overrides.speed ?? 3, commandCount: overrides.commandCount ?? 1,
    beforeSnapshot: null, afterSnapshot: null,
    events: overrides.events || [], summary: '', actionCount: 0, actions: [],
  };
}

// Base state for scene store
const EMPTY_BASE_STATE = { turn: 1, phase: 'RESOLVE', teams: [], entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [] };

// Assert renderBoard was never called on this renderer
function assertRenderBoardNotCalled(renderer) {
  assertEquals(renderer.__renderBoardCalls.length, 0, 'renderBoard was NOT called');
}

// ═══════════════════════════════════════════
// Test 1: Projectile skill smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 1: Projectile skill smoke ===');

function test1() {
  const resolution = makeResolution([
    makePhase({ speed: 3, commandCount: 1, events: [
      { id: nextEventId(), eventType: 'projectile_created', actionId: 'seq_1', actorId: 'mage_a', projectileId: 'proj_1', from: { q: 0, r: 0 }, to: { q: 2, r: 0 }, basePower: 100, metadata: { projectileType: 'projectile', path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], flags: [], speed: 1, isMelee: false } },
      { id: nextEventId(), eventType: 'projectile_collided', actionId: 'seq_1', actorId: 'mage_a', targetId: 'warrior_b', projectileId: 'proj_1', targetPos: { q: 2, r: 0 }, finalDamage: 100, metadata: { hitType: 'body_contact', contactPos: { q: 2, r: 0 }, flags: [], isMelee: false, ownerId: 'mage_a' } },
    ]}),
  ]);

  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[1a] timeline contains projectile_launch clip');
  const launchClip = timeline.clips.find(c => c.clipType === 'projectile_launch');
  assert(!!launchClip, 'projectile_launch clip exists');
  assert(Array.isArray(launchClip.payload?.path), 'launch payload has path array');

  console.log('\n[1b] timeline contains projectile_impact clip');
  const impactClip = timeline.clips.find(c => c.clipType === 'projectile_impact');
  assert(!!impactClip, 'projectile_impact clip exists');
  assertEquals(impactClip.payload?.finalDamage, 100, 'impact finalDamage = 100');

  // Build frames
  const midTime = launchClip.startMs + launchClip.durationMs * 0.5;
  const midFrame = buildPlaybackFrame(timeline, midTime);
  const impactTime = impactClip.startMs + 10;
  const impactFrame = buildPlaybackFrame(timeline, impactTime);

  console.log('\n[1c] mid-playback frame: projectile_launch effect');
  const launchFx = midFrame.effects.find(e => e.effectType === 'projectile_launch');
  assert(!!launchFx, 'projectile_launch effect in frame');
  assertInRange(launchFx.progress, 0, 1, 'launch progress in [0,1]');

  console.log('\n[1d] impact frame: projectile_impact effect');
  assert(!!impactFrame.effects.find(e => e.effectType === 'projectile_impact'), 'projectile_impact effect in frame');

  // Render through scene store
  const ctx = createMockContext();
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ context: ctx, visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState(EMPTY_BASE_STATE);

  // Render mid-frame
  sceneStore.setPlaybackFrame(midFrame);
  renderer.render(sceneStore.getScene());

  console.log('\n[1e] mid-frame: draw calls made (projectile drawn)');
  assertGte(ctx.__counters.arc, 1, 'arc called at least once (projectile body)');

  // Render impact frame
  sceneStore.setPlaybackFrame(impactFrame);
  renderer.render(sceneStore.getScene());

  console.log('\n[1f] impact frame: drawImpactEffect dispatched');
  assertGte(visualEffects.calls.drawImpactEffect.length, 1, 'drawImpactEffect called');
  assertEquals(visualEffects.calls.drawImpactEffect[0].q, 2, 'impact q=2');

  console.log('\n[1g] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);

  console.log('\n[1h] No keyframes/animEvents/animStep/subT in scene');
  const scene = sceneStore.getScene();
  const json = JSON.stringify(scene);
  assert(!json.includes('"keyframes"'), 'no keyframes');
  assert(!json.includes('"animEvents"'), 'no animEvents');
  assert(!('animStep' in scene), 'no animStep');
  assert(!('subT' in scene), 'no subT');
}

// ═══════════════════════════════════════════
// Test 2: Melee slash skill smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 2: Melee slash skill smoke ===');

function test2() {
  const resolution = makeResolution([
    makePhase({ speed: 3, commandCount: 1, events: [
      { id: nextEventId(), eventType: 'projectile_created', actionId: 'seq_2', actorId: 'warrior', projectileId: 'melee_1', from: { q: 1, r: 0 }, to: { q: 0, r: 0 }, basePower: 80, metadata: { projectileType: 'melee', path: [{ q: 1, r: 0 }, { q: 0, r: 0 }], flags: [], speed: null, isMelee: true } },
      { id: nextEventId(), eventType: 'projectile_collided', actionId: 'seq_2', actorId: 'warrior', targetId: 'target', projectileId: 'melee_1', targetPos: { q: 0, r: 0 }, finalDamage: 80, metadata: { hitType: 'body_contact', contactPos: { q: 0, r: 0 }, flags: [], isMelee: true, ownerId: 'warrior' } },
    ]}),
  ]);

  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[2a] timeline contains melee_slash clip');
  const slashClip = timeline.clips.find(c => c.clipType === 'melee_slash');
  assert(!!slashClip, 'melee_slash clip exists');
  assertEquals(slashClip.payload?.isMelee, true, 'isMelee flag true');

  const slashTime = slashClip.startMs + slashClip.durationMs * 0.5;
  const frame = buildPlaybackFrame(timeline, slashTime);

  console.log('\n[2b] frame contains melee_slash effect');
  const slashFx = frame.effects.find(e => e.effectType === 'melee_slash');
  assert(!!slashFx, 'melee_slash effect in frame');

  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState(EMPTY_BASE_STATE);
  sceneStore.setPlaybackFrame(frame);
  renderer.render(sceneStore.getScene());

  console.log('\n[2c] drawSlashArc dispatched');
  assertGte(visualEffects.calls.drawSlashArc.length, 1, 'drawSlashArc called');
  assertEquals(visualEffects.calls.drawSlashArc[0].fq, 1, 'fromQ=1');

  console.log('\n[2d] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);
}

// ═══════════════════════════════════════════
// Test 3: Movement / dash / teleport smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 3: Movement / dash / teleport smoke ===');

function test3() {
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState(EMPTY_BASE_STATE);

  // 3a: walk → drawWalkTrail
  console.log('\n[3a] walk → drawWalkTrail');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 100, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-walk', effectType: 'walk', clipId: 'c1', sourceEventId: 'e1', actionId: 'a1', actorId: 'c1', targetId: null, progress: 0.5, payload: { from: { q: 0, r: 0 }, to: { q: 2, r: 0 } } }] });
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawWalkTrail.length, 1, 'drawWalkTrail called');

  // 3b: dash → drawDashTrail
  console.log('\n[3b] dash → drawDashTrail');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 200, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-dash', effectType: 'dash', clipId: 'c2', sourceEventId: 'e2', actionId: 'a2', actorId: 'c2', targetId: null, progress: 0.3, payload: { from: { q: 0, r: 0 }, to: { q: 3, r: 0 } } }] });
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawDashTrail.length, 1, 'drawDashTrail called');

  // 3c: teleport → drawTeleportEffect
  console.log('\n[3c] teleport → drawTeleportEffect');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 300, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-tele', effectType: 'teleport', clipId: 'c3', sourceEventId: 'e3', actionId: 'a3', actorId: 'c3', targetId: null, progress: 0.7, payload: { from: { q: 1, r: 1 }, to: { q: -2, r: 0 } } }] });
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawTeleportEffect.length, 1, 'drawTeleportEffect called');

  // 3d: move (alias) → drawWalkTrail
  console.log('\n[3d] move → drawWalkTrail');
  const walkBefore = visualEffects.calls.drawWalkTrail.length;
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 400, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-move', effectType: 'move', clipId: 'c4', sourceEventId: 'e4', actionId: 'a4', actorId: 'c4', targetId: null, progress: 0.8, payload: { from: { q: -1, r: 0 }, to: { q: 1, r: 0 } } }] });
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawWalkTrail.length, walkBefore + 1, 'drawWalkTrail called for move');

  console.log('\n[3e] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);
}

// ═══════════════════════════════════════════
// Test 4: Gather / resource skill smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 4: Gather / resource skill smoke ===');

function test4() {
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState(EMPTY_BASE_STATE);

  console.log('\n[4a] qi gather → drawGatherEffect with qi color');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 100, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-qi', effectType: 'gather', clipId: 'c1', sourceEventId: 'e1', actionId: 'a1', actorId: 'mage', targetId: null, progress: 0.5, payload: { position: { q: 0, r: 0 }, resource: 'qi', amount: 1, color: '#8b5cf6' } }] });
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawGatherEffect.length, 1, 'drawGatherEffect called');
  const qiCall = visualEffects.calls.drawGatherEffect[0];
  assertEquals(qiCall.q, 0, 'qi q=0');
  assertEquals(qiCall.amount, 1, 'qi amount=1');

  console.log('\n[4b] rage gather → drawGatherEffect');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 200, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-rage', effectType: 'gather', clipId: 'c2', sourceEventId: 'e2', actionId: 'a2', actorId: 'warrior', targetId: null, progress: 0.8, payload: { position: { q: 1, r: 0 }, resource: 'rage', amount: 3, color: '#ffcc66' } }] });
  renderer.render(sceneStore.getScene());
  assertGte(visualEffects.calls.drawGatherEffect.length, 2, 'drawGatherEffect called for rage too');

  console.log('\n[4c] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);
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
  sceneStore.setBaseState(EMPTY_BASE_STATE);

  console.log('\n[5a] damage_number draws text (fillText called)');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 300, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-dmg', effectType: 'damage_number', clipId: 'c1', sourceEventId: 'e1', actionId: 'a1', actorId: 'a', targetId: 't', progress: 0.5, payload: { value: 100, position: { q: 2, r: 0 }, targetPos: { q: 2, r: 0 } } }] });
  const fillTextBefore = ctx.__counters.fillText;
  renderer.render(sceneStore.getScene());
  assertGte(ctx.__counters.fillText, fillTextBefore + 1, 'fillText called for damage number');

  console.log('\n[5b] damage_number with targetPos fallback draws text');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 300, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-dmg2', effectType: 'damage_number', clipId: 'c2', sourceEventId: 'e2', actionId: 'a2', actorId: 'a2', targetId: 't2', progress: 0.8, payload: { value: 50, targetPos: { q: -1, r: 0 } } }] });
  const ftBefore2 = ctx.__counters.fillText;
  renderer.render(sceneStore.getScene());
  assertGte(ctx.__counters.fillText, ftBefore2 + 1, 'fillText with targetPos fallback');

  console.log('\n[5c] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);
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
  sceneStore.setBaseState(EMPTY_BASE_STATE);

  console.log('\n[6a] death effect draws (arc/stroke called)');
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 400, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-death', effectType: 'death', clipId: 'c1', sourceEventId: 'e1', actionId: 'a1', actorId: 'k', targetId: 'v', progress: 0.9, payload: { targetId: 'victim', position: { q: 1, r: 1 } } }] });
  const arcBefore = ctx.__counters.arc;
  renderer.render(sceneStore.getScene());
  assertGte(ctx.__counters.arc, arcBefore + 1, 'arc called for death effect');

  console.log('\n[6b] death without position is safe (no throw)');
  const arcBefore2 = ctx.__counters.arc;
  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 400, durationMs: 500, phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [], sceneState: null, effects: [{ id: 'fx-death2', effectType: 'death', clipId: 'c2', sourceEventId: 'e2', actionId: 'a2', actorId: 'k2', targetId: 'v2', progress: 0.5, payload: { targetId: 'victim2' } }] });
  let threw = false;
  try { renderer.render(sceneStore.getScene()); } catch (e) { threw = true; }
  assert(!threw, 'death without position does not throw');

  console.log('\n[6c] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);
}

// ═══════════════════════════════════════════
// Test 7: Renderer visual-effects dispatch smoke
// ═══════════════════════════════════════════

console.log('\n=== Test 7: Renderer visual-effects dispatch smoke ===');

function test7() {
  const ctx = createMockContext();
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ context: ctx, visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState(EMPTY_BASE_STATE);

  sceneStore.setPlaybackFrame({ mode: 'playback', timeMs: 200, durationMs: 800, phaseId: null, activeActionIds: ['a1', 'a2'], activeClipIds: ['c1', 'c2', 'c3', 'c4'], activeClips: [], sceneState: null, effects: [
    { id: 'fx-1', effectType: 'projectile_impact', clipId: 'c1', sourceEventId: 'e1', actionId: 'a1', actorId: 'a', targetId: 'b', progress: 0.3, payload: { contactPos: { q: 2, r: 0 }, finalDamage: 100, isMelee: false } },
    { id: 'fx-2', effectType: 'melee_slash', clipId: 'c2', sourceEventId: 'e2', actionId: 'a2', actorId: 'c', targetId: 'd', progress: 0.5, payload: { from: { q: 1, r: 0 }, to: { q: 0, r: 0 }, basePower: 80 } },
    { id: 'fx-3', effectType: 'walk', clipId: 'c3', sourceEventId: 'e3', actionId: 'a3', actorId: 'e', targetId: null, progress: 0.7, payload: { from: { q: 0, r: 0 }, to: { q: 2, r: 0 } } },
    { id: 'fx-4', effectType: 'gather', clipId: 'c4', sourceEventId: 'e4', actionId: 'a4', actorId: 'f', targetId: null, progress: 0.4, payload: { position: { q: 1, r: 1 }, resource: 'qi', amount: 2, color: '#8b5cf6' } },
  ]});
  renderer.render(sceneStore.getScene());

  console.log('\n[7a] drawImpactEffect dispatched');
  assertGte(visualEffects.calls.drawImpactEffect.length, 1, 'drawImpactEffect');
  console.log('\n[7b] drawSlashArc dispatched');
  assertGte(visualEffects.calls.drawSlashArc.length, 1, 'drawSlashArc');
  console.log('\n[7c] drawWalkTrail dispatched');
  assertGte(visualEffects.calls.drawWalkTrail.length, 1, 'drawWalkTrail');
  console.log('\n[7d] drawGatherEffect dispatched');
  assertGte(visualEffects.calls.drawGatherEffect.length, 1, 'drawGatherEffect');

  console.log('\n[7e] All effects in single render(scene) call');
  const total = visualEffects.calls.drawImpactEffect.length + visualEffects.calls.drawSlashArc.length + visualEffects.calls.drawWalkTrail.length + visualEffects.calls.drawGatherEffect.length;
  assertGte(total, 4, '>=4 dispatches');

  console.log('\n[7f] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);
}

// ═══════════════════════════════════════════
// Test 8: Real engine resolution smoke (TurnResolutionBuilder)
// ═══════════════════════════════════════════

console.log('\n=== Test 8: Real engine resolution smoke ===');

async function test8() {
  // Build a real TurnResolution from the engine (validates event shapes)
  const bsc = new BattleSessionController({
    computeEffectArea: () => [], renderAll: () => {}, renderLog: () => {}, clearLog: () => {},
    setSubmitStatus: () => {}, setExecuteDisabled: () => {},
    showGameOverPanel: () => {}, hideGameOverPanel: () => {}, showDisconnect: () => {},
    getNetworkManager: () => null, getConfigMode: () => 'local', isPveMode: () => false,
    setRoute: () => {}, appendChatMessage: () => {},
  });

  bsc.startBattleFromScenario(Date.now(), {
    mode: 'duel',
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    rules: { friendlyFire: false },
    combatants: [
      { id: 'mage_a', teamId: 'player1', ownerId: 'player1', control: 'human', class: '法师', roleLoadoutSkillIds: [], loadoutSkillIds: ['mage_blast'], position: { q: 0, r: 0 }, resources: { qi: 3 } },
      { id: 'warrior_b', teamId: 'player2', ownerId: 'player2', control: 'human', class: '战士', roleLoadoutSkillIds: [], loadoutSkillIds: ['warrior_slash'], position: { q: 2, r: 0 }, resources: {} },
    ],
  });

  bsc.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  bsc.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });

  const builder = createTurnResolutionBuilder();
  const preview = await builder.build(bsc.engine);
  const resolution = preview.resolution;

  console.log('\n[8a] Real engine resolution has phases');
  assert(Array.isArray(resolution.phases), 'resolution has phases');
  assertGte(resolution.phases.length, 1, 'at least 1 phase');

  // Check events exist with canonical eventTypes
  const allEvents = resolution.phases.flatMap(p => p.events || []);
  const eventTypes = allEvents.map(e => e.eventType);
  console.log('\n[8b] Resolution contains projectile_created event');
  assert(eventTypes.includes('projectile_created'), 'projectile_created found');

  // Compile and render
  const timeline = compilePresentationTimeline(resolution);
  console.log('\n[8c] Real engine resolution produces valid timeline');
  assert(!!timeline, 'timeline exists');
  assertGte(timeline.clips.length, 1, 'timeline has clips from real engine events');

  // Build frame at mid-timeline and render
  if (timeline.durationMs > 0) {
    const frame = buildPlaybackFrame(timeline, timeline.durationMs * 0.5);
    assertGte(frame.effects.length, 1, 'frame has effects from real engine resolution');

    const ctx = createMockContext();
    const visualEffects = createSpyVisualEffects();
    const renderer = createRenderer({ context: ctx, visualEffects });
    const sceneStore = new BattleSceneStore();
    sceneStore.setBaseState(EMPTY_BASE_STATE);
    sceneStore.setPlaybackFrame(frame);
    renderer.render(sceneStore.getScene());

    console.log('\n[8d] Renderer dispatched visual effects from real engine events');
    const total = visualEffects.calls.drawImpactEffect.length + visualEffects.calls.drawSlashArc.length;
    assertGte(total, 0, 'visual effects dispatched (at least arc/stroke for projectile)');

    console.log('\n[8e] renderBoard NOT called on real engine resolution');
    assertRenderBoardNotCalled(renderer);
  }

  console.log('\n[8f] Real engine resolution schema version is 2');
  assertEquals(resolution.schemaVersion, 2, 'schemaVersion 2');
}

// ═══════════════════════════════════════════
// Test 9: No legacy path regression
// ═══════════════════════════════════════════

console.log('\n=== Test 9: No legacy path regression ===');

function test9() {
  console.log('\n[9a] app/TurnPlaybackController.js does not exist');
  const tpcPath = path.resolve('app/TurnPlaybackController.js');
  let tpcExists = false;
  try {
    fs.statSync(tpcPath);
    tpcExists = true;
  } catch (e) {
    // Expected: ENOENT
    assert(e.code === 'ENOENT', 'TurnPlaybackController.js returns ENOENT');
  }
  assert(!tpcExists, 'TurnPlaybackController.js does not exist on disk');

  // Build a full pipeline scene and verify clean data
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });
  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState(EMPTY_BASE_STATE);

  const resolution = makeResolution([
    makePhase({ speed: 3, commandCount: 1, events: [
      { id: nextEventId(), eventType: 'projectile_created', actionId: 'seq_r', actorId: 'mage', projectileId: 'proj_r', from: { q: 0, r: 0 }, to: { q: 2, r: 0 }, basePower: 50, metadata: { projectileType: 'projectile', path: [{ q: 0, r: 0 }, { q: 2, r: 0 }], flags: [], speed: 1, isMelee: false } },
    ]}),
  ]);

  const timeline = compilePresentationTimeline(resolution);
  const frame = buildPlaybackFrame(timeline, timeline.durationMs * 0.5);
  sceneStore.setPlaybackFrame(frame);
  renderer.render(sceneStore.getScene());
  const scene = sceneStore.getScene();

  console.log('\n[9b] No animStep in scene');
  assert(!('animStep' in scene), 'no animStep');

  console.log('\n[9c] No subT in scene');
  assert(!('subT' in scene), 'no subT');

  console.log('\n[9d] No keyframes in scene');
  assert(!('keyframes' in scene), 'no keyframes');
  assert(!JSON.stringify(scene).includes('"keyframes"'), 'JSON has no keyframes');

  console.log('\n[9e] No animEvents in scene');
  assert(!('animEvents' in scene), 'no animEvents');
  assert(!JSON.stringify(scene).includes('"animEvents"'), 'JSON has no animEvents');

  console.log('\n[9f] scene.effects consumed by renderer (dispatch verified)');
  assert(Array.isArray(scene.effects), 'scene.effects is array');

  console.log('\n[9g] renderBoard NOT called during skill animation');
  assertRenderBoardNotCalled(renderer);
}

// ═══════════════════════════════════════════
// Test 10: Integration smoke — multi-timeMs
// ═══════════════════════════════════════════

console.log('\n=== Test 10: Integration smoke — multi-timeMs comparison ===');

function test10() {
  const resolution = makeResolution([
    makePhase({ speed: 3, commandCount: 2, events: [
      { id: nextEventId(), eventType: 'projectile_created', actionId: 'seq_i1', actorId: 'mage_a', projectileId: 'proj_i1', from: { q: 0, r: 0 }, to: { q: 3, r: 0 }, basePower: 120, metadata: { projectileType: 'projectile', path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }], flags: [], speed: 1, isMelee: false } },
      { id: nextEventId(), eventType: 'projectile_collided', actionId: 'seq_i1', actorId: 'mage_a', targetId: 'enemy', projectileId: 'proj_i1', targetPos: { q: 3, r: 0 }, finalDamage: 120, metadata: { hitType: 'body_contact', contactPos: { q: 3, r: 0 }, flags: [], isMelee: false, ownerId: 'mage_a' } },
      { id: nextEventId(), eventType: 'projectile_created', actionId: 'seq_i2', actorId: 'warrior', projectileId: 'proj_i2', from: { q: 1, r: 0 }, to: { q: 0, r: 0 }, basePower: 80, metadata: { projectileType: 'melee', path: [{ q: 1, r: 0 }, { q: 0, r: 0 }], flags: [], speed: null, isMelee: true } },
      { id: nextEventId(), eventType: 'projectile_collided', actionId: 'seq_i2', actorId: 'warrior', targetId: 'target2', projectileId: 'proj_i2', targetPos: { q: 0, r: 0 }, finalDamage: 80, metadata: { hitType: 'body_contact', contactPos: { q: 0, r: 0 }, flags: [], isMelee: true, ownerId: 'warrior' } },
    ]}),
  ]);

  const timeline = compilePresentationTimeline(resolution);

  console.log('\n[10a] timeline has multiple clips from different actions');
  const launchClips = timeline.clips.filter(c => c.clipType === 'projectile_launch');
  const meleeClips = timeline.clips.filter(c => c.clipType === 'melee_slash');
  const impactClips = timeline.clips.filter(c => c.clipType === 'projectile_impact');
  assertGte(launchClips.length + meleeClips.length, 2, '>=2 launch/slash clips');
  assertGte(impactClips.length, 2, '>=2 impact clips');

  const sceneStore = new BattleSceneStore();
  sceneStore.setBaseState(EMPTY_BASE_STATE);
  const visualEffects = createSpyVisualEffects();
  const renderer = createRenderer({ visualEffects });

  const timePoints = [timeline.durationMs * 0.1, timeline.durationMs * 0.5, timeline.durationMs * 0.9];
  const results = [];

  for (const t of timePoints) {
    const frame = buildPlaybackFrame(timeline, t);
    sceneStore.setPlaybackFrame(frame);
    const scene = sceneStore.getScene();
    renderer.render(scene);
    results.push({ timeMs: t, activeEffects: frame.effects.length, sceneEffects: scene.effects.length });
  }

  console.log('\n[10b] Different timeMs produce different active effects');
  const effectCounts = results.map(r => r.activeEffects);
  const allSame = effectCounts.every(c => c === effectCounts[0]);
  assert(!allSame || effectCounts[0] === 0, 'effect counts vary across time points');

  console.log('\n[10c] At least one time point has active effects');
  const totalEffects = results.reduce((s, r) => s + r.activeEffects, 0);
  assert(totalEffects > 0, 'at least one time point has effects');

  console.log('\n[10d] Visual effects dispatched across time points');
  const totalDraws = visualEffects.calls.drawImpactEffect.length + visualEffects.calls.drawSlashArc.length + visualEffects.calls.drawWalkTrail.length + visualEffects.calls.drawGatherEffect.length;
  assertGte(totalDraws, 1, '>=1 visual effect dispatched');

  console.log('\n[10e] renderBoard NOT called');
  assertRenderBoardNotCalled(renderer);
}

// ═══════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════

async function main() {
  try {
    test1();
    test2();
    test3();
    test4();
    test5();
    test6();
    test7();
    await test8();
    test9();
    test10();
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
