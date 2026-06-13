// Contract tests for BattleCanvasRenderer.render(scene)
// Run: node tests/battle_canvas_renderer_scene_contract.spec.js
//
// Milestone 3 / Task 3.4

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
  constructor() {
    this.complete = true;
    this.naturalWidth = 256;
    this.naturalHeight = 256;
    this._src = '';
    MockImage.instances.push(this);
  }
  set src(value) { this._src = value; }
  get src() { return this._src; }
};

function createMockContext() {
  const gradient = { addColorStop() {} };
  return {
    clearRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    stroke() {},
    arc() {},
    setLineDash() {},
    createRadialGradient() { return gradient; },
    drawImage() {},
    fillText() {},
    save() {},
    restore() {},
    clip() {},
  };
}

function createMockGeometry() {
  return {
    hexCenter(q, r) { return [q * 40 + 100, r * 40 + 100]; },
    hexCorners(cx, cy) {
      return [
        [cx - 10, cy - 10], [cx + 10, cy - 10], [cx + 15, cy],
        [cx + 10, cy + 10], [cx - 10, cy + 10], [cx - 15, cy],
      ];
    },
    isOnBoard() { return true; },
  };
}

function createMockVisualEffects() {
  return {
    drawImpactEffect() {},
    drawSlashArc() {},
    drawProjectileTrail() {},
    drawGatherEffect() {},
    drawDashTrail() {},
    drawTeleportEffect() {},
    drawWalkTrail() {},
    drawGrappleLine() {},
  };
}

function createRenderer(overrides = {}) {
  return new BattleCanvasRenderer({
    canvas: overrides.canvas || { width: 800, height: 600, clientWidth: 800, clientHeight: 600 },
    context: overrides.context || createMockContext(),
    geometry: overrides.geometry || createMockGeometry(),
    visualEffects: overrides.visualEffects || createMockVisualEffects(),
    portraitCacheVersion: overrides.portraitCacheVersion || 'test',
    assetImageCache: overrides.assetImageCache || new Map(),
  });
}

// ═══════════════════════════════════════════
// Helpers: build minimal BattleScene fixtures
// ═══════════════════════════════════════════

function makeMinimalScene(overrides = {}) {
  return {
    mode: overrides.mode || 'live',
    turn: overrides.turn ?? 1,
    phase: overrides.phase ?? 'RESOLVE',
    teams: overrides.teams || [],
    rules: overrides.rules || null,
    entities: overrides.entities || [],
    characters: overrides.characters || [],
    projectiles: overrides.projectiles || [],
    casings: overrides.casings || [],
    wildBullets: overrides.wildBullets || [],
    logs: overrides.logs || [],
    interaction: overrides.interaction || {
      hoverEffectArea: [],
      validTargets: [],
      hoveredHex: null,
      localSubmittedCharacterIds: [],
      remoteSubmittedCharacterIds: [],
      selectedCharacterId: null,
      lastHoveredCharacterId: null,
    },
    effects: overrides.effects || [],
    playback: overrides.playback || null,
  };
}

function makeCharacterEntity(overrides = {}) {
  return {
    id: overrides.id || 'char-1',
    type: 'CHARACTER',
    alive: true,
    class: overrides.class || '战士',
    roleId: overrides.roleId || 'warrior_flash',
    ownerId: overrides.ownerId || 'player1',
    position: overrides.position || { q: 0, r: 0 },
    resources: overrides.resources || {},
    buffs: overrides.buffs || [],
  };
}

// ═══════════════════════════════════════════
// Test 1: renderer has render(scene) method
// ═══════════════════════════════════════════

console.log('\n=== Test 1: renderer has render(scene) method ===');

{
  const renderer = createRenderer();

  console.log('\n[1a] render is a function');
  assertEquals(typeof renderer.render, 'function', 'renderer.render is a function');

  console.log('\n[1b] renderBoard still exists (legacy path retained)');
  assertEquals(typeof renderer.renderBoard, 'function', 'renderer.renderBoard still exists');
}

// ═══════════════════════════════════════════
// Test 2: render(scene) accepts minimal BattleScene
// ═══════════════════════════════════════════

console.log('\n=== Test 2: render(scene) accepts minimal BattleScene ===');

{
  const renderer = createRenderer();

  console.log('\n[2a] empty scene does not throw');
  let threw = false;
  try {
    renderer.render(makeMinimalScene());
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render(empty scene) does not throw');

  console.log('\n[2b] scene with characters does not throw');
  const char = makeCharacterEntity();
  const sceneWithChar = makeMinimalScene({
    entities: [char],
    characters: [char],
  });
  threw = false;
  try {
    renderer.render(sceneWithChar);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render(scene with character) does not throw');

  console.log('\n[2c] scene with projectiles does not throw');
  const sceneWithProj = makeMinimalScene({
    projectiles: [{ id: 'proj-1', position: { q: 1, r: 0 }, power: 50, alive: true, flags: [], isMelee: false }],
  });
  threw = false;
  try {
    renderer.render(sceneWithProj);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render(scene with projectile) does not throw');

  console.log('\n[2d] scene with effects does not throw');
  const sceneWithFx = makeMinimalScene({
    effects: [
      { id: 'fx-1', effectType: 'projectile_impact', progress: 0.5, payload: { contactPos: { q: 1, r: 0 }, finalDamage: 50, isMelee: false } },
    ],
  });
  threw = false;
  try {
    renderer.render(sceneWithFx);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render(scene with effects) does not throw');

  console.log('\n[2e] scene with null does not throw');
  threw = false;
  try {
    renderer.render(null);
  } catch (e) {
    threw = true;
  }
  assert(!threw, 'render(null) does not throw');
}

// ═══════════════════════════════════════════
// Test 3: render(scene) does not mutate scene
// ═══════════════════════════════════════════

console.log('\n=== Test 3: render(scene) does not mutate scene ===');

{
  const renderer = createRenderer();
  const char = makeCharacterEntity();
  const scene = makeMinimalScene({
    entities: [char],
    characters: [char],
    projectiles: [{ id: 'proj-1', position: { q: 1, r: 0 }, power: 50, alive: true }],
    interaction: { hoveredHex: { q: 1, r: 1 }, selectedCharacterId: 'char-1' },
  });

  const sceneClone = clonePlainData(scene);

  console.log('\n[3a] scene unchanged after render');
  renderer.render(scene);
  assertDeepEquals(scene, sceneClone, 'scene deep equals clone after render');

  console.log('\n[3b] scene.characters unchanged');
  assertDeepEquals(scene.characters, sceneClone.characters, 'characters unchanged');

  console.log('\n[3c] scene.projectiles unchanged');
  assertDeepEquals(scene.projectiles, sceneClone.projectiles, 'projectiles unchanged');

  console.log('\n[3d] scene.interaction unchanged');
  assertDeepEquals(scene.interaction, sceneClone.interaction, 'interaction unchanged');
}

// ═══════════════════════════════════════════
// Test 4: source boundary scan (render(scene) method body)
// ═══════════════════════════════════════════

console.log('\n=== Test 4: source boundary scan ===');

{
  const filePath = path.resolve('ui/battle/BattleCanvasRenderer.js');
  const src = fs.readFileSync(filePath, 'utf-8');

  // Extract render(scene) method body — from "render(scene)" to the next "  }" at class level
  const renderStart = src.indexOf('  render(scene)');
  assert(renderStart >= 0, 'render(scene) method found in source');

  // Find the closing brace of render(scene): search for the next method or class end
  const afterRender = src.substring(renderStart);
  // Find the next method declaration at class level (2-space indent followed by identifier and '(')
  const nextMethodMatch = afterRender.match(/\n  [a-zA-Z_]+\(/);
  let renderBody;
  if (nextMethodMatch) {
    renderBody = afterRender.substring(0, afterRender.indexOf(nextMethodMatch[0]));
  } else {
    renderBody = afterRender;
  }

  // Remove comments and strings for checking
  const noComments = renderBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const FORBIDDEN_IN_NEW_PATH = [
    'GameEngine',
    'BattleSessionController',
    'TurnPlaybackController',
    'keyframes',
    'animEvents',
    'getAnimEvents',
    'generateKeyframes',
  ];

  console.log('\n[4a] render(scene) body does not reference forbidden APIs');
  for (const term of FORBIDDEN_IN_NEW_PATH) {
    // Only check within the render(scene) method, not the whole file
    const foundInRender = noComments.includes(term);
    if (foundInRender) {
      console.error(`    Found "${term}" in render(scene) body!`);
    }
    assert(!foundInRender, `no "${term}" in render(scene) method body`);
  }

  console.log('\n[4b] render(scene) does not call getEngine');
  assert(!noComments.includes('getEngine'), 'render(scene) does not call getEngine');

  console.log('\n[4c] render(scene) does not call battleSession');
  assert(!noComments.includes('battleSession'), 'render(scene) does not call battleSession');

  console.log('\n[4d] whole file does not contain this.battleSession');
  const wholeFile = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!wholeFile.includes('this.battleSession'), 'no this.battleSession anywhere');

  console.log('\n[4e] whole file does not contain this.getEngine');
  assert(!wholeFile.includes('this.getEngine'), 'no this.getEngine anywhere');
}

// ═══════════════════════════════════════════
// Test 5: effects are consumed from scene.effects
// ═══════════════════════════════════════════

console.log('\n=== Test 5: effects are consumed from scene.effects ===');

{
  const renderer = createRenderer();

  console.log('\n[5a] render with projectile_impact effect does not throw');
  const scene = makeMinimalScene({
    effects: [
      {
        id: 'fx-1',
        effectType: 'projectile_impact',
        progress: 0.5,
        payload: {
          contactPos: { q: 1, r: 0 },
          finalDamage: 80,
          isMelee: false,
          projectileId: 'proj-1',
        },
      },
    ],
  });
  let threw = false;
  try {
    renderer.render(scene);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render with impact effect does not throw');

  console.log('\n[5b] render with melee_slash effect does not throw');
  const scene2 = makeMinimalScene({
    effects: [
      {
        id: 'fx-2',
        effectType: 'melee_slash',
        progress: 0.3,
        payload: {
          from: { q: 0, r: 0 },
          to: { q: 1, r: 0 },
          basePower: 60,
          isMelee: true,
        },
      },
    ],
  });
  threw = false;
  try {
    renderer.render(scene2);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render with slash effect does not throw');

  console.log('\n[5c] render with unknown effect type does not throw');
  const scene3 = makeMinimalScene({
    effects: [{ id: 'fx-3', effectType: 'unknown_type', progress: 0.5, payload: {} }],
  });
  threw = false;
  try {
    renderer.render(scene3);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render with unknown effect type does not throw');
}

// ═══════════════════════════════════════════
// Test 6: playback mode accepted
// ═══════════════════════════════════════════

console.log('\n=== Test 6: playback mode accepted ===');

{
  const renderer = createRenderer();

  console.log('\n[6a] playback scene renders without throw');
  const playbackScene = makeMinimalScene({
    mode: 'playback',
    playback: {
      mode: 'playback',
      timeMs: 500,
      durationMs: 2000,
      phaseId: 'turn-1-speed-3',
      activeActionIds: ['act-1'],
      activeClipIds: ['clip-1', 'clip-2'],
      activeClips: [
        { id: 'clip-1', clipType: 'projectile_launch', startMs: 0, durationMs: 100, payload: {} },
        { id: 'clip-2', clipType: 'projectile_impact', startMs: 100, durationMs: 180, payload: { contactPos: { q: 2, r: 0 } } },
      ],
      sceneState: null,
      effects: [{ id: 'fx-1', effectType: 'projectile_impact', progress: 0.5, payload: { contactPos: { q: 2, r: 0 } } }],
    },
  });

  let threw = false;
  try {
    renderer.render(playbackScene);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render(playback scene) does not throw');

  console.log('\n[6b] render does not advance playback time');
  const timeBefore = playbackScene.playback.timeMs;
  renderer.render(playbackScene);
  assertEquals(playbackScene.playback.timeMs, timeBefore, 'playback.timeMs unchanged after render');

  console.log('\n[6c] playback scene not mutated');
  const clone = clonePlainData(playbackScene);
  renderer.render(playbackScene);
  assertDeepEquals(playbackScene, clone, 'playback scene unchanged after render');
}

// ═══════════════════════════════════════════
// Test 7: interaction state consumed from scene
// ═══════════════════════════════════════════

console.log('\n=== Test 7: interaction state consumed from scene ===');

{
  const renderer = createRenderer();

  console.log('\n[7a] hoverEffectArea from scene does not crash');
  const scene = makeMinimalScene({
    interaction: {
      hoverEffectArea: [{ q: 1, r: 0 }, { q: 2, r: 0 }],
      validTargets: [{ q: 1, r: 0 }],
      hoveredHex: { q: 1, r: 0 },
    },
  });
  let threw = false;
  try {
    renderer.render(scene);
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'render with interaction state does not throw');

  // hoveredHex in legacy renderBoard is [q, r] array; new render(scene) uses {q, r} object
  // The render(scene) code above checks hoveredHex.q and hoveredHex.r
  console.log('\n[7b] hoveredHex as object (BattleScene format) works');
  // Already tested in 7a with {q, r} object format
}

// ═══════════════════════════════════════════
// Test 8: render(scene) does NOT trigger renderBoard
// ═══════════════════════════════════════════

console.log('\n=== Test 8: render(scene) does NOT trigger renderBoard ===');

{
  // Reset MockImage instances so only images created by THIS test are checked
  if (typeof globalThis.Image !== 'undefined' && globalThis.Image.instances) {
    globalThis.Image.instances.length = 0;
  }

  const renderer = createRenderer();
  let renderBoardCallCount = 0;
  const originalRenderBoard = renderer.renderBoard.bind(renderer);
  renderer.renderBoard = function (...args) {
    renderBoardCallCount++;
    return originalRenderBoard(...args);
  };

  const char = makeCharacterEntity();
  const sceneWithChar = makeMinimalScene({
    entities: [char],
    characters: [char],
  });

  console.log('\n[8a] render(scene) does not call renderBoard directly');
  renderBoardCallCount = 0;
  renderer.render(sceneWithChar);
  assertEquals(renderBoardCallCount, 0, 'renderBoard NOT called during render(scene)');

  console.log('\n[8b] portrait onLoad does not call renderBoard');
  if (typeof globalThis.Image !== 'undefined' && globalThis.Image.instances) {
    for (const img of globalThis.Image.instances) {
      if (typeof img.onload === 'function') {
        img.onload();
      }
    }
  }
  assertEquals(renderBoardCallCount, 0, 'renderBoard NOT called after image onload');

  // Restore
  renderer.renderBoard = originalRenderBoard;
}

// ═══════════════════════════════════════════
// Test 9: render(scene) method body — no Date.now() / Math.random() / renderBoard
// ═══════════════════════════════════════════

console.log('\n=== Test 9: render(scene) body source scan for forbidden APIs ===');

{
  const filePath = path.resolve('ui/battle/BattleCanvasRenderer.js');
  const src = fs.readFileSync(filePath, 'utf-8');

  // Extract render(scene) method body
  const renderStart = src.indexOf('  render(scene)');
  const afterRender = src.substring(renderStart);
  const nextMethodMatch = afterRender.match(/\n  [a-zA-Z_]+\(/);
  let renderBody;
  if (nextMethodMatch) {
    renderBody = afterRender.substring(0, afterRender.indexOf(nextMethodMatch[0]));
  } else {
    renderBody = afterRender;
  }

  const noComments = renderBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  const FORBIDDEN_IN_RENDER_SCENE = [
    'Date.now()',
    'Math.random()',
    'renderBoard',
    'GameEngine',
    'BattleSessionController',
    'TurnPlaybackController',
    'keyframes',
    'animEvents',
    'getAnimEvents',
    'generateKeyframes',
    'getCharacterPortraitImage(',
  ];

  console.log('\n[9a] render(scene) body does not contain forbidden patterns');
  for (const term of FORBIDDEN_IN_RENDER_SCENE) {
    const found = noComments.includes(term);
    if (found) {
      console.error(`    Found "${term}" in render(scene) body!`);
    }
    assert(!found, `no "${term}" in render(scene) method body`);
  }

  console.log('\n[9b] render(scene) uses getCharacterPortraitImageForScene instead');
  assert(noComments.includes('getCharacterPortraitImageForScene'), 'uses scene-safe portrait helper');
}

// ═══════════════════════════════════════════
// Test 10: getCharacterPortraitImageForScene helper — no renderBoard reference
// ═══════════════════════════════════════════

console.log('\n=== Test 10: getCharacterPortraitImageForScene boundary ===');

{
  const filePath = path.resolve('ui/battle/BattleCanvasRenderer.js');
  const src = fs.readFileSync(filePath, 'utf-8');

  // Extract getCharacterPortraitImageForScene method body
  const helperStart = src.indexOf('  getCharacterPortraitImageForScene(');
  assert(helperStart >= 0, 'getCharacterPortraitImageForScene method found');

  const afterHelper = src.substring(helperStart);
  const nextMethod = afterHelper.match(/\n  [a-zA-Z_]+\(/);
  let helperBody;
  if (nextMethod) {
    helperBody = afterHelper.substring(0, afterHelper.indexOf(nextMethod[0]));
  } else {
    helperBody = afterHelper;
  }

  const noComments = helperBody.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[10a] helper does not reference renderBoard');
  assert(!noComments.includes('renderBoard'), 'getCharacterPortraitImageForScene does not call renderBoard');

  console.log('\n[10b] helper does not reference getEngine or battleSession');
  assert(!noComments.includes('getEngine'), 'helper does not call getEngine');
  assert(!noComments.includes('battleSession'), 'helper does not call battleSession');

  console.log('\n[10c] helper does not reference keyframes/animEvents');
  assert(!noComments.includes('keyframes'), 'helper does not reference keyframes');
  assert(!noComments.includes('animEvents'), 'helper does not reference animEvents');

  console.log('\n[10d] helper onLoad is no-op');
  const stripped = noComments.replace(/\s+/g, ' ');
  assert(stripped.includes('onLoad = () => {}') || stripped.includes('onLoad=()=>{}') || stripped.includes('onLoad = () =>{ }'),
    'onLoad is a no-op (empty body)');
}

// ═══════════════════════════════════════════
// Test 11: constructor no longer accepts battleSession/getEngine
// ═══════════════════════════════════════════

console.log('\n=== Test 11: constructor no longer has battleSession/getEngine ===');

{
  console.log('\n[11a] instantiate without battleSession/getEngine does not throw');
  let threw = false;
  try {
    const r = createRenderer();
  } catch (e) {
    threw = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw, 'constructor without battleSession/getEngine safe');

  console.log('\n[11b] renderer.battleSession is undefined');
  const renderer = createRenderer();
  assertEquals(renderer.battleSession, undefined, 'no this.battleSession');

  console.log('\n[11c] renderer.getEngine is undefined');
  assertEquals(renderer.getEngine, undefined, 'no this.getEngine');

  console.log('\n[11d] render(scene) still works without session/engine');
  const char = makeCharacterEntity();
  const scene = makeMinimalScene({
    entities: [char],
    characters: [char],
    projectiles: [{ id: 'proj-1', position: { q: 1, r: 0 }, power: 50, alive: true }],
    effects: [{ id: 'fx-1', effectType: 'projectile_impact', progress: 0.5, payload: { contactPos: { q: 1, r: 0 } } }],
  });
  threw = false;
  try {
    renderer.render(scene);
  } catch (e) {
    threw = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw, 'render(scene) works without session/engine');

  console.log('\n[11e] image onLoad still safe');
  if (typeof globalThis.Image !== 'undefined' && globalThis.Image.instances) {
    for (const img of globalThis.Image.instances) {
      if (typeof img.onload === 'function') {
        try { img.onload(); } catch (e) { threw = true; }
      }
    }
  }
  assert(!threw, 'image onLoad safe');
}

// ═══════════════════════════════════════════
// Test 12: renderBoard with legacyView param works
// ═══════════════════════════════════════════

console.log('\n=== Test 12: renderBoard with legacyView param ===');

{
  console.log('\n[12a] renderBoard with legacyView does not throw');
  const renderer = createRenderer();
  const char = makeCharacterEntity();
  const legacyView = {
    state: {
      characters: [char],
      projectiles: [],
      casings: [],
      wildBullets: [],
      entities: [char],
      keyframes: [],
      animEvents: [],
    },
    renderView: {
      hoverEffectArea: [],
      validTargets: [],
      hoveredHex: null,
      localSubmittedCharacterIds: [],
      remoteSubmittedCharacterIds: [],
    },
    engine: null,
  };
  let threw = false;
  try {
    renderer.renderBoard(legacyView);
  } catch (e) {
    threw = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw, 'renderBoard with legacyView safe');

  console.log('\n[12b] renderBoard without legacyView is no-op');
  threw = false;
  try {
    renderer.renderBoard(null);
  } catch (e) {
    threw = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw, 'renderBoard(null) safe no-op');
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
