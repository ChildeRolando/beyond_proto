// Contract tests: keyframes/animEvents compatibility removed (o7.2)
// Run: node tests/no_keyframes_animEvents_compat.spec.js

import * as fs from 'fs';
import * as path from 'path';

let pass = 0, fail = 0;

function assert(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

function assertIncludes(src, term, label) {
  if (src.includes(term)) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — missing "${term}"`); }
}

function assertExcludes(src, term, label) {
  if (!src.includes(term)) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — found "${term}"`); }
}

// Helper: strip comments, keep only active code
function stripComments(src) {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ═══════════════════════════════════════════
// Test A: BattleCanvasRenderer — no keyframes/animEvents
// ═══════════════════════════════════════════

console.log('\n=== Test A: BattleCanvasRenderer no keyframes/animEvents ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[A1] no keyframes variable in active code');
  assertExcludes(noComments, 'state.keyframes', 'no state.keyframes');

  console.log('\n[A2] no animEvents variable in active code');
  assertExcludes(noComments, 'state.animEvents', 'no state.animEvents');

  console.log('\n[A3] no keyframes reference');
  assertExcludes(noComments, 'keyframes', 'no keyframes reference');

  console.log('\n[A4] no animEvents reference');
  assertExcludes(noComments, 'animEvents', 'no animEvents reference');

  console.log('\n[A5] no hitEvents reference');
  assertExcludes(noComments, 'hitEvents', 'no hitEvents');

  console.log('\n[A6] no slashEvents reference');
  assertExcludes(noComments, 'slashEvents', 'no slashEvents');
}

// ═══════════════════════════════════════════
// Test B: AppRuntime — no keyframes/animEvents
// ═══════════════════════════════════════════

console.log('\n=== Test B: AppRuntime no keyframes/animEvents ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[B1] no keyframes');
  assertExcludes(noComments, 'keyframes', 'no keyframes');

  console.log('\n[B2] no animEvents');
  assertExcludes(noComments, 'animEvents', 'no animEvents');
}

// ═══════════════════════════════════════════
// Test C: BattleRenderCoordinator — no keyframes/animEvents
// ═══════════════════════════════════════════

console.log('\n=== Test C: BattleRenderCoordinator no keyframes/animEvents ===');

{
  const src = fs.readFileSync(path.resolve('app/BattleRenderCoordinator.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[C1] no keyframes');
  assertExcludes(noComments, 'keyframes', 'no keyframes');

  console.log('\n[C2] no animEvents');
  assertExcludes(noComments, 'animEvents', 'no animEvents');
}

// ═══════════════════════════════════════════
// Test D: BattleSessionController — no keyframes/animEvents
// ═══════════════════════════════════════════

console.log('\n=== Test D: BattleSessionController no keyframes/animEvents ===');

{
  const src = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[D1] no keyframes');
  assertExcludes(noComments, 'keyframes', 'no keyframes');

  console.log('\n[D2] no animEvents');
  assertExcludes(noComments, 'animEvents', 'no animEvents');
}

// ═══════════════════════════════════════════
// Test E: engine/ directory — no presentation animation fields
// ═══════════════════════════════════════════

console.log('\n=== Test E: engine/ no keyframes/animEvents ===');

{
  const engineFiles = [
    'engine/GameEngine.js',
    'engine/TurnManager.js',
    'engine/ProjectileCalculator.js',
    'engine/SkillResolver.js',
    'engine/Registry.js',
  ];

  for (const f of engineFiles) {
    const fpath = path.resolve(f);
    if (!fs.existsSync(fpath)) continue;
    const src = fs.readFileSync(fpath, 'utf-8');
    const noComments = stripComments(src);

    console.log(`\n[E] ${f}:`);
    assertExcludes(noComments, 'keyframes', `${f} no keyframes`);
    assertExcludes(noComments, 'animEvents', `${f} no animEvents`);
  }
}

// ═══════════════════════════════════════════
// Test F: renderBoard retained as static legacy render
// ═══════════════════════════════════════════

console.log('\n=== Test F: renderBoard static legacy render retained ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[F1] renderBoard function exists');
  assertIncludes(src, 'renderBoard(legacyView = null)', 'renderBoard with legacyView signature');

  console.log('\n[F2] renderBoard body does not contain keyframes');
  // Extract the renderBoard function body
  const fnStart = src.indexOf('renderBoard(legacyView = null)');
  const fnBody = src.substring(fnStart);
  assert(!stripComments(fnBody).includes('keyframes'), 'renderBoard body no keyframes');

  console.log('\n[F3] renderBoard body does not contain animEvents');
  assert(!stripComments(fnBody).includes('animEvents'), 'renderBoard body no animEvents');

  console.log('\n[F4] renderBoard still uses legacyView.state');
  assertIncludes(fnBody, 'legacyView?.state', 'renderBoard reads legacyView.state');

  console.log('\n[F5] renderBoard still uses legacyView.renderView');
  assertIncludes(fnBody, 'legacyView?.renderView', 'renderBoard reads legacyView.renderView');
}

// ═══════════════════════════════════════════
// Test G: scene effects path retained
// ═══════════════════════════════════════════

console.log('\n=== Test G: scene effects path retained ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');

  console.log('\n[G1] render(scene) calls #renderSceneEffects');
  assertIncludes(src, '#renderSceneEffects(scene)', 'renderSceneEffects called from render(scene)');

  console.log('\n[G2] #renderSceneEffects consumes scene.effects');
  const fnStart = src.indexOf('#renderSceneEffects(');
  // The function is large — search the whole remainder of the file from fnStart
  const fullFnBody = src.substring(fnStart);
  assertIncludes(fullFnBody, 'scene.effects', 'reads scene.effects');

  console.log('\n[G3] projectile effect types supported');
  assertIncludes(fullFnBody, 'projectile_launch', 'projectile_launch');
  assertIncludes(fullFnBody, 'projectile_impact', 'projectile_impact');
  assertIncludes(fullFnBody, 'melee_slash', 'melee_slash');

  console.log('\n[G4] movement effect types supported');
  assertIncludes(fullFnBody, "case 'move':", 'move effect');
  assertIncludes(fullFnBody, "case 'dash':", 'dash effect');
  assertIncludes(fullFnBody, "case 'teleport':", 'teleport effect');

  console.log('\n[G5] gather/damage/death effect types supported');
  assertIncludes(fullFnBody, "case 'gather':", 'gather effect');
  assertIncludes(fullFnBody, "case 'damage_number':", 'damage_number effect');
  assertIncludes(fullFnBody, "case 'death':", 'death effect');
}

// ═══════════════════════════════════════════
// Test H: no regression
// ═══════════════════════════════════════════

console.log('\n=== Test H: no regression ===');

{
  // H1: no animStep/subT protocol restored
  const coordSrc = fs.readFileSync(path.resolve('app/BattleRenderCoordinator.js'), 'utf-8');
  console.log('\n[H1] animStep/subT protocol still removed');
  assertIncludes(stripComments(coordSrc), 'function renderAll()', 'renderAll() takes no params');
  assertExcludes(stripComments(coordSrc), 'animStep', 'no animStep');
  assertExcludes(stripComments(coordSrc), 'subT', 'no subT');

  // H2: old TurnPlaybackController still deleted
  console.log('\n[H2] old TurnPlaybackController still deleted');
  const tpcExists = fs.existsSync(path.resolve('app/TurnPlaybackController.js'));
  assert(!tpcExists, 'TurnPlaybackController.js does not exist');

  // H3: BSC playback render state still deleted
  const bscSrc = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');
  const bscNoComments = stripComments(bscSrc);
  console.log('\n[H3] BSC playback render state still deleted');
  assertExcludes(bscNoComments, '_resolutionPlaybackState', 'no _resolutionPlaybackState');
  assertExcludes(bscNoComments, 'getRenderState', 'no getRenderState');
  assertExcludes(bscNoComments, 'setResolutionPlaybackState', 'no setResolutionPlaybackState');
  assertExcludes(bscNoComments, 'clearResolutionPlaybackState', 'no clearResolutionPlaybackState');
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
