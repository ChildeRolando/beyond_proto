// Contract tests: animStep/subT protocol removed (o7.1)
// Run: node tests/no_anim_step_subt_protocol.spec.js

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

// ═══════════════════════════════════════════
// Test A: BattleRenderCoordinator — no animStep/subT
// ═══════════════════════════════════════════

console.log('\n=== Test A: BattleRenderCoordinator no animStep/subT ===');

{
  const src = fs.readFileSync(path.resolve('app/BattleRenderCoordinator.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[A1] no animStep');
  assertExcludes(noComments, 'animStep', 'no animStep in coordinator');

  console.log('\n[A2] no subT');
  assertExcludes(noComments, 'subT', 'no subT in coordinator');

  console.log('\n[A3] no renderAll(animStep');
  assertExcludes(noComments, 'renderAll(animStep', 'no renderAll(animStep');

  console.log('\n[A4] no renderBoard(animStep');
  assertExcludes(noComments, 'renderBoard(animStep', 'no renderBoard(animStep');

  console.log('\n[A5] no renderBoard(..., subT');
  assertExcludes(noComments, 'renderBoard(', 'renderBoard not called from coordinator (static fallback removed)');

  console.log('\n[A6] renderAll() signature is clean');
  assertIncludes(noComments, 'function renderAll()', 'renderAll() takes no params');
}

// ═══════════════════════════════════════════
// Test B: AppRuntime — no animStep/subT in renderAll wiring
// ═══════════════════════════════════════════

console.log('\n=== Test B: AppRuntime no animStep/subT ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[B1] no renderAll: (s, sub)');
  assertExcludes(noComments, '(s, sub)', 'no (s, sub) callback args');

  console.log('\n[B2] no renderAll(s, sub)');
  assertExcludes(noComments, 'renderAll(s, sub)', 'no renderAll(s, sub) call');

  console.log('\n[B3] no animStep');
  assertExcludes(noComments, 'animStep', 'no animStep in AppRuntime');

  console.log('\n[B4] no subT');
  assertExcludes(noComments, 'subT', 'no subT in AppRuntime');
}

// ═══════════════════════════════════════════
// Test C: BattleLifecycleService — no animStep/subT
// ═══════════════════════════════════════════

console.log('\n=== Test C: BattleLifecycleService no animStep/subT ===');

{
  const src = fs.readFileSync(path.resolve('app/BattleLifecycleService.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[C1] no renderAll(s, sub)');
  assertExcludes(noComments, '(s, sub)', 'no (s, sub) args');

  console.log('\n[C2] no animStep');
  assertExcludes(noComments, 'animStep', 'no animStep');

  console.log('\n[C3] no subT');
  assertExcludes(noComments, 'subT', 'no subT');

  console.log('\n[C4] renderAll() called without args');
  assertIncludes(noComments, 'renderAll()', 'renderAll() no-arg call');
}

// ═══════════════════════════════════════════
// Test D: RuntimeTestHooks — no animStep/subT
// ═══════════════════════════════════════════

console.log('\n=== Test D: RuntimeTestHooks no animStep/subT ===');

{
  const src = fs.readFileSync(path.resolve('app/RuntimeTestHooks.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[D1] no animStep');
  assertExcludes(noComments, 'animStep', 'no animStep');

  console.log('\n[D2] no subT');
  assertExcludes(noComments, 'subT', 'no subT');
}

// ═══════════════════════════════════════════
// Test E: BattleCanvasRenderer renderBoard signature — no animStep/subT
// ═══════════════════════════════════════════

console.log('\n=== Test E: BattleCanvasRenderer renderBoard signature clean ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  // Match the function definition signature specifically
  const fnSig = noComments.match(/renderBoard\(legacyView\s*=\s*null\)/);
  const sig = fnSig ? fnSig[0] : '';

  console.log('\n[E1] renderBoard signature does not contain animStep');
  assert(!sig.includes('animStep'), 'renderBoard function signature has no animStep param');

  console.log('\n[E2] renderBoard signature does not contain subT');
  assert(!sig.includes('subT'), 'renderBoard function signature has no subT param');

  console.log('\n[E3] renderBoard takes legacyView');
  assert(fnSig !== null, 'renderBoard signature has legacyView = null');
}

// ═══════════════════════════════════════════
// Test F: Legacy test patterns removed
// ═══════════════════════════════════════════

console.log('\n=== Test F: legacy renderAll/renderBoard call patterns removed ===');

{
  const testFiles = [
    'tests/no_old_turn_playback_controller.spec.js',
    'tests/battle_session_no_playback_render_state.spec.js',
    'tests/app_runtime_playback_pipeline.spec.js',
    'tests/battle_canvas_renderer_scene_contract.spec.js',
    'tests/battle_canvas_renderer_test.js',
  ];

  for (const f of testFiles) {
    const fpath = path.resolve(f);
    if (!fs.existsSync(fpath)) continue;
    const src = fs.readFileSync(fpath, 'utf-8');
    const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    console.log(`\n[F] ${f}: no renderAll(0, 0.5) or renderAll(-1, 0)`);
    assertExcludes(noComments, 'renderAll(0, 0.5)', `${f} no renderAll(0, 0.5)`);
    assertExcludes(noComments, 'renderAll(-1, 0)', `${f} no renderAll(-1, 0)`);

    console.log(`[F] ${f}: no renderBoard(-1, 0, ...) or renderBoard(0, 0.5, ...)`);
    assertExcludes(noComments, 'renderBoard(-1, 0', `${f} no renderBoard(-1, 0, ...)`);
    assertExcludes(noComments, 'renderBoard(0, 0.5', `${f} no renderBoard(0, 0.5, ...)`);
  }
}

// ═══════════════════════════════════════════
// Test G: New playback pipeline still intact
// ═══════════════════════════════════════════

console.log('\n=== Test G: new playback pipeline still intact ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');

  console.log('\n[G1] playTurnResolution still exists');
  assertIncludes(src, 'playTurnResolution', 'playTurnResolution defined');

  console.log('\n[G2] playbackRuntime.onFrame');
  assertIncludes(src, 'playbackRuntime.onFrame', 'playbackRuntime.onFrame wired');

  console.log('\n[G3] battleSceneStore.setPlaybackFrame');
  assertIncludes(src, 'battleSceneStore.setPlaybackFrame', 'setPlaybackFrame in onFrame');

  console.log('\n[G4] battleCanvasRenderer.render(scene)');
  assertIncludes(src, 'render(scene)', 'render(scene) in onFrame');
}

// ═══════════════════════════════════════════
// Test H: Legacy renderBoard retained
// ═══════════════════════════════════════════

console.log('\n=== Test H: legacy renderBoard retained ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');

  console.log('\n[H1] BattleCanvasRenderer still contains renderBoard');
  assertIncludes(src, 'renderBoard', 'renderBoard function exists');

  console.log('\n[H2] renderBoard takes legacyView');
  assertIncludes(src, 'renderBoard(legacyView = null)', 'renderBoard signature with legacyView');

  console.log('\n[H3] renderBoard function definition has no animStep');
  const fnSigH = src.match(/renderBoard\(legacyView\s*=\s*null\)/);
  const sigH = fnSigH ? fnSigH[0] : '';
  assert(!sigH.includes('animStep'), 'renderBoard function definition no animStep param');

  console.log('\n[H4] renderBoard function definition has no subT');
  assert(!sigH.includes('subT'), 'renderBoard function definition no subT param');
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
