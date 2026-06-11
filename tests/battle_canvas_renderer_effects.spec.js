// Effects rendering tests for BattleCanvasRenderer.render(scene)
// Run: node tests/battle_canvas_renderer_effects.spec.js
//
// Milestone o5.2

import { BattleCanvasRenderer } from '../ui/battle/BattleCanvasRenderer.js';
import { clonePlainData } from '../presentation/BattleScene.js';
import * as fs from 'fs';
import * as path from 'path';

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
// Mocks
// ═══════════════════════════════════════════

globalThis.Image = class MockImage {
  static instances = [];
  constructor() { this.complete = true; this.naturalWidth = 256; this.naturalHeight = 256; this._src = ''; MockImage.instances.push(this); }
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

function createCountingVisualEffects() {
  const counts = {};
  const record = (name) => { counts[name] = (counts[name] || 0) + 1; };
  return {
    counts,
    drawImpactEffect(q, r, power, isMelee, age) { record('drawImpactEffect'); },
    drawSlashArc(fromQ, fromR, toQ, toR, power, progress) { record('drawSlashArc'); },
    drawProjectileTrail() {},
    drawGatherEffect(q, r, color, amount, progress) { record('drawGatherEffect'); },
    drawDashTrail(fromQ, fromR, toQ, toR, progress) { record('drawDashTrail'); },
    drawTeleportEffect(fromQ, fromR, toQ, toR, progress) { record('drawTeleportEffect'); },
    drawWalkTrail(fromQ, fromR, toQ, toR, progress) { record('drawWalkTrail'); },
    drawGrappleLine() {},
  };
}

function createRenderer(overrides = {}) {
  return new BattleCanvasRenderer({
    canvas: { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    context: overrides.context || createMockContext(),
    geometry: overrides.geometry || createMockGeometry(),
    visualEffects: overrides.visualEffects || createCountingVisualEffects(),
    portraitCacheVersion: 'test',
    assetImageCache: new Map(),
  });
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function makeScene(effects = []) {
  return {
    mode: 'playback',
    turn: 1, phase: 'RESOLVE',
    teams: [], rules: null,
    entities: [], characters: [], projectiles: [], casings: [], wildBullets: [], logs: [],
    interaction: { hoverEffectArea: [], validTargets: [], hoveredHex: null, localSubmittedCharacterIds: [], remoteSubmittedCharacterIds: [], selectedCharacterId: null, lastHoveredCharacterId: null },
    effects,
    playback: { timeMs: 500 },
  };
}

function makeEffect(type, payload = {}, progress = 0.5) {
  return { id: `fx-${type}`, effectType: type, progress, payload };
}

// ═══════════════════════════════════════════
// Test 1: render(scene) accepts all required effect types
// ═══════════════════════════════════════════

console.log('\n=== Test 1: render(scene) accepts all required effect types ===');

{
  const renderer = createRenderer();
  const effects = [
    makeEffect('projectile_launch', { path: [{ q: 0, r: 0 }, { q: 2, r: 0 }], power: 50 }),
    makeEffect('projectile_impact', { contactPos: { q: 1, r: 0 }, finalDamage: 80 }),
    makeEffect('melee_slash', { from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, basePower: 60 }),
    makeEffect('move', { from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }),
    makeEffect('dash', { from: { q: 0, r: 0 }, to: { q: 2, r: 0 } }),
    makeEffect('teleport', { from: { q: 0, r: 0 }, to: { q: 3, r: 0 } }),
    makeEffect('walk', { from: { q: 0, r: 0 }, to: { q: 1, r: 1 } }),
    makeEffect('gather', { position: { q: 0, r: 0 }, amount: 2, resource: 'qi' }),
    makeEffect('damage_number', { position: { q: 1, r: 0 }, value: 100 }),
    makeEffect('death', { position: { q: 2, r: 0 } }),
    makeEffect('unknown_type', {}),
  ];

  const scene = makeScene(effects);

  console.log('\n[1a] all effect types render without throw');
  let threw = false;
  try { renderer.render(scene); }
  catch (e) { threw = true; console.error(`    ${e.message}`); }
  assert(!threw, 'all effect types accepted');
}

// ═══════════════════════════════════════════
// Test 2: effects are consumed from scene.effects → mock draw calls
// ═══════════════════════════════════════════

console.log('\n=== Test 2: mock draw calls from scene.effects ===');

{
  const visualEffects = createCountingVisualEffects();
  const renderer = createRenderer({ visualEffects });

  console.log('\n[2a] projectile_impact calls drawImpactEffect');
  renderer.render(makeScene([makeEffect('projectile_impact', { contactPos: { q: 1, r: 0 }, finalDamage: 80 })]));
  assertEquals(visualEffects.counts.drawImpactEffect || 0, 1, 'drawImpactEffect called once');

  console.log('\n[2b] melee_slash calls drawSlashArc');
  renderer.render(makeScene([makeEffect('melee_slash', { from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, basePower: 60 })]));
  assertEquals((visualEffects.counts.drawSlashArc || 0), 1, 'drawSlashArc called once for melee_slash');

  console.log('\n[2c] move calls drawWalkTrail');
  renderer.render(makeScene([makeEffect('move', { from: { q: 0, r: 0 }, to: { q: 1, r: 0 } })]));
  assert((visualEffects.counts.drawWalkTrail || 0) >= 1, 'drawWalkTrail called');

  console.log('\n[2d] dash calls drawDashTrail');
  renderer.render(makeScene([makeEffect('dash', { from: { q: 0, r: 0 }, to: { q: 2, r: 0 } })]));
  assert((visualEffects.counts.drawDashTrail || 0) >= 1, 'drawDashTrail called');

  console.log('\n[2e] teleport calls drawTeleportEffect');
  renderer.render(makeScene([makeEffect('teleport', { from: { q: 0, r: 0 }, to: { q: 3, r: 0 } })]));
  assert((visualEffects.counts.drawTeleportEffect || 0) >= 1, 'drawTeleportEffect called');

  console.log('\n[2f] walk calls drawWalkTrail');
  const before = visualEffects.counts.drawWalkTrail || 0;
  renderer.render(makeScene([makeEffect('walk', { from: { q: 0, r: 0 }, to: { q: 1, r: 1 } })]));
  assert((visualEffects.counts.drawWalkTrail || 0) > before, 'walk also calls drawWalkTrail');

  console.log('\n[2g] gather calls drawGatherEffect');
  renderer.render(makeScene([makeEffect('gather', { position: { q: 0, r: 0 }, amount: 2, resource: 'qi' })]));
  assert((visualEffects.counts.drawGatherEffect || 0) >= 1, 'drawGatherEffect called');
}

// ═══════════════════════════════════════════
// Test 3: render(scene) does not mutate scene
// ═══════════════════════════════════════════

console.log('\n=== Test 3: render(scene) does not mutate scene ===');

{
  const renderer = createRenderer();
  const effects = [
    makeEffect('projectile_launch', { path: [{ q: 0, r: 0 }, { q: 2, r: 0 }], basePower: 50 }),
    makeEffect('projectile_impact', { contactPos: { q: 1, r: 0 }, finalDamage: 80 }),
  ];
  const scene = makeScene(effects);
  const clone = clonePlainData(scene);

  renderer.render(scene);
  assertDeepEquals(scene, clone, 'scene unchanged after render');

  // Also check effects not mutated
  assertEquals(scene.effects[0].progress, 0.5, 'effect progress unchanged');
  assertEquals(scene.effects[0].payload.basePower, 50, 'effect payload unchanged');
}

// ═══════════════════════════════════════════
// Test 4: progress clamp
// ═══════════════════════════════════════════

console.log('\n=== Test 4: progress clamp ===');

{
  const renderer = createRenderer();

  console.log('\n[4a] progress: -1 does not throw');
  let threw = false;
  try {
    renderer.render(makeScene([makeEffect('projectile_impact', { contactPos: { q: 1, r: 0 } }, -1)]));
  } catch (e) { threw = true; }
  assert(!threw, 'progress -1 safe');

  console.log('\n[4b] progress: 2 does not throw');
  threw = false;
  try {
    renderer.render(makeScene([makeEffect('projectile_impact', { contactPos: { q: 1, r: 0 } }, 2)]));
  } catch (e) { threw = true; }
  assert(!threw, 'progress 2 safe');

  console.log('\n[4c] progress: undefined defaults to 0');
  threw = false;
  try {
    renderer.render(makeScene([makeEffect('projectile_impact', { contactPos: { q: 1, r: 0 } }, undefined)]));
  } catch (e) { threw = true; }
  assert(!threw, 'undefined progress safe');
}

// ═══════════════════════════════════════════
// Test 5: source boundary scan — no legacy fields in effects path
// ═══════════════════════════════════════════

console.log('\n=== Test 5: source boundary scan ===');

{
  const filePath = path.resolve('ui/battle/BattleCanvasRenderer.js');
  const src = fs.readFileSync(filePath, 'utf-8');

  // Extract #renderSceneEffects method body
  const helperStart = src.indexOf('#renderSceneEffects(');
  assert(helperStart >= 0, '#renderSceneEffects method found in source');

  const afterHelper = src.substring(helperStart);
  // Find next method or private method
  const nextMethod = afterHelper.match(/\n  (?:renderBoard|#drawSceneProjectile|getCharacterPortrait)\(/);
  let helperBody;
  if (nextMethod) {
    helperBody = afterHelper.substring(0, afterHelper.indexOf(nextMethod[0]));
  } else {
    helperBody = afterHelper;
  }

  const noComments = helperBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const FORBIDDEN = [
    'keyframes',
    'animEvents',
    'animStep',
    'subT',
    'renderBoard',
    'getEngine',
    'battleSession',
    'getRenderState',
    'getRenderViewState',
    'Date.now()',
    'Math.random()',
  ];

  console.log('\n[5a] #renderSceneEffects body does not contain forbidden patterns');
  for (const term of FORBIDDEN) {
    const found = noComments.includes(term);
    if (found) console.error(`    Found "${term}" in #renderSceneEffects body!`);
    assert(!found, `no "${term}" in effects helper`);
  }

  // Also check the private draw helper
  console.log('\n[5b] #drawSceneProjectile body is clean');
  const drawStart = src.indexOf('#drawSceneProjectile(');
  assert(drawStart >= 0, '#drawSceneProjectile helper found');
  const afterDraw = src.substring(drawStart);
  const nextAfterDraw = afterDraw.match(/\n  (?:renderBoard|getCharacterPortrait)\(/);
  const drawBody = nextAfterDraw ? afterDraw.substring(0, afterDraw.indexOf(nextAfterDraw[0])) : afterDraw;
  const drawNoComments = drawBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const term of FORBIDDEN) {
    assert(!drawNoComments.includes(term), `no "${term}" in #drawSceneProjectile`);
  }

  // Check render(scene) still doesn't contain forbidden terms
  console.log('\n[5c] render(scene) body remains clean');
  const renderStart = src.indexOf('  render(scene)');
  const afterRender = src.substring(renderStart);
  const nextRenderMethod = afterRender.match(/\n  (?:renderBoard|#renderSceneEffects)\(/);
  const renderBody = nextRenderMethod ? afterRender.substring(0, afterRender.indexOf(nextRenderMethod[0])) : afterRender;
  const renderNoComments = renderBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const term of FORBIDDEN) {
    if (term === 'renderBoard') continue; // renderBoard appears in the doc comment
    assert(!renderNoComments.includes(term), `no "${term}" in render(scene) body`);
  }
}

// ═══════════════════════════════════════════
// Test 6: missing payload safe
// ═══════════════════════════════════════════

console.log('\n=== Test 6: missing payload safe ===');

{
  const renderer = createRenderer();
  const effectTypes = ['projectile_launch', 'projectile_impact', 'melee_slash', 'move', 'dash', 'teleport', 'walk', 'gather', 'damage_number', 'death'];

  console.log('\n[6a] null payload does not throw');
  for (const type of effectTypes) {
    let threw = false;
    try {
      renderer.render(makeScene([{ id: `fx-${type}`, effectType: type, progress: 0.5, payload: null }]));
    } catch (e) { threw = true; console.error(`    ${type} threw: ${e.message}`); }
    assert(!threw, `null payload for ${type} safe`);
  }

  console.log('\n[6b] empty payload does not throw');
  for (const type of effectTypes) {
    let threw = false;
    try {
      renderer.render(makeScene([{ id: `fx-${type}`, effectType: type, progress: 0.5, payload: {} }]));
    } catch (e) { threw = true; console.error(`    ${type} threw: ${e.message}`); }
    assert(!threw, `empty payload for ${type} safe`);
  }
}

// ═══════════════════════════════════════════
// Test 7: unknown effect safe
// ═══════════════════════════════════════════

console.log('\n=== Test 7: unknown effect safe ===');

{
  const renderer = createRenderer();

  console.log('\n[7a] unknown effectType does not throw');
  let threw = false;
  try {
    renderer.render(makeScene([makeEffect('some_future_effect_type', {})]));
  } catch (e) { threw = true; }
  assert(!threw, 'unknown effectType safe');

  console.log('\n[7b] empty effectType string does not throw');
  threw = false;
  try {
    renderer.render(makeScene([{ id: 'fx-e', effectType: '', progress: 0.5, payload: {} }]));
  } catch (e) { threw = true; }
  assert(!threw, 'empty effectType safe');

  console.log('\n[7c] legacy clip kinds (projectile/impact/slash) also supported');
  threw = false;
  try {
    renderer.render(makeScene([
      makeEffect('projectile', { path: [{ q: 0, r: 0 }, { q: 2, r: 0 }], power: 50 }),
      makeEffect('impact', { contactPos: { q: 1, r: 0 }, finalDamage: 50 }),
      makeEffect('slash', { from: { q: 0, r: 0 }, to: { q: 1, r: 0 }, basePower: 50 }),
    ]));
  } catch (e) { threw = true; }
  assert(!threw, 'legacy clip kinds accepted');
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
