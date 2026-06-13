// Contract tests: old TurnPlaybackController fully removed (o6.4)
// Run: node tests/no_old_turn_playback_controller.spec.js

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
// Test 1: File deletion
// ═══════════════════════════════════════════

console.log('\n=== Test 1: File deletion ===');

{
  console.log('\n[1a] app/TurnPlaybackController.js does not exist');
  const exists = fs.existsSync(path.resolve('app/TurnPlaybackController.js'));
  assert(!exists, 'TurnPlaybackController.js removed');
}

// ═══════════════════════════════════════════
// Test 2: AppRuntime no longer references old controller
// ═══════════════════════════════════════════

console.log('\n=== Test 2: AppRuntime no old controller references ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[2a] no TurnPlaybackController import');
  assertExcludes(noComments, 'TurnPlaybackController', 'no TurnPlaybackController');

  console.log('\n[2b] no createTurnPlaybackController');
  assertExcludes(noComments, 'createTurnPlaybackController', 'no createTurnPlaybackController');

  console.log('\n[2c] no turnPlaybackController variable');
  assertExcludes(noComments, 'turnPlaybackController', 'no turnPlaybackController');

  console.log('\n[2d] no getTurnPlaybackController');
  assertExcludes(noComments, 'getTurnPlaybackController', 'no getTurnPlaybackController');

  console.log('\n[2e] no turnPlaybackController.play');
  assertExcludes(noComments, 'turnPlaybackController.play', 'no turnPlaybackController.play');

  console.log('\n[2f] no turnPlaybackController.reset');
  assertExcludes(noComments, 'turnPlaybackController.reset', 'no turnPlaybackController.reset');
}

// ═══════════════════════════════════════════
// Test 3: RuntimeTestHooks no longer references old controller
// ═══════════════════════════════════════════

console.log('\n=== Test 3: RuntimeTestHooks no old controller references ===');

{
  const src = fs.readFileSync(path.resolve('app/RuntimeTestHooks.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[3a] no TurnPlaybackController');
  assertExcludes(noComments, 'TurnPlaybackController', 'no TurnPlaybackController');

  console.log('\n[3b] no turnPlaybackController');
  assertExcludes(noComments, 'turnPlaybackController', 'no turnPlaybackController');

  console.log('\n[3c] no getTurnPlaybackController');
  assertExcludes(noComments, 'getTurnPlaybackController', 'no getTurnPlaybackController');
}

// ═══════════════════════════════════════════
// Test 4: BattleSessionController still supports new path
// ═══════════════════════════════════════════

console.log('\n=== Test 4: BSC still supports new playback path ===');

{
  const src = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');

  console.log('\n[4a] playTurnResolution || animateTurn in executeLocalTurn');
  assertIncludes(src, 'playTurnResolution || this._callbacks.animateTurn', 'playTurnResolution || animateTurn');

  console.log('\n[4b] executeLocalTurn preview branch uses playTurnResolution first');
  assertIncludes(src, 'const playResolution = this._callbacks.playTurnResolution', 'playTurnResolution in executeLocalTurn');

  console.log('\n[4c] executeP2PTurn preview branch uses playTurnResolution first');
  assertIncludes(src, 'const playResolution = this._callbacks.playTurnResolution || this._callbacks.animateTurn', 'playTurnResolution in executeP2PTurn');

  console.log('\n[4d] non-preview branch remains animateTurn optional/no-op');
  assertIncludes(src, "await this._callbacks.animateTurn?.()", 'animateTurn?.() no-op fallback');
}

// ═══════════════════════════════════════════
// Test 5: AppRuntime resetResolutionPlayback uses new pipeline
// ═══════════════════════════════════════════

console.log('\n=== Test 5: resetResolutionPlayback uses new pipeline ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[5a] resetResolutionPlayback does not reference turnPlaybackController');
  assertExcludes(noComments, 'turnPlaybackController', 'no old controller in resetResolutionPlayback');

  console.log('\n[5b] resetResolutionPlayback uses battleSceneStore.setPlaybackFrame(null)');
  assertIncludes(noComments, 'battleSceneStore.setPlaybackFrame(null)', 'setPlaybackFrame(null)');

  console.log('\n[5c] resetResolutionPlayback uses timelinePanel.reset');
  assertIncludes(noComments, 'timelinePanel.reset', 'timelinePanel.reset');

  console.log('\n[5d] resetResolutionPlayback uses playbackRuntime.stop');
  assertIncludes(noComments, 'playbackRuntime.stop', 'playbackRuntime.stop');
}

// ═══════════════════════════════════════════
// Test 6: new playback pipeline still intact
// ═══════════════════════════════════════════

console.log('\n=== Test 6: new playback pipeline still intact ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');

  const REQUIRED = [
    'BattleSceneStore',
    'TurnPlaybackRuntime',
    'createResolutionTimelinePanel',
    'compilePresentationTimeline',
    'buildPlaybackFrame',
    'playbackRuntime.onFrame',
    'battleSceneStore.setPlaybackFrame',
    'timelinePanel.updatePlaybackFrame',
    'battleCanvasRenderer.render(scene)',
    'playTurnResolution',
  ];

  console.log('\n[6] AppRuntime contains all new pipeline components');
  for (const term of REQUIRED) {
    assertIncludes(src, term, `AppRuntime contains "${term}"`);
  }
}

// ═══════════════════════════════════════════
// Test 7: old render compatibility retained
// ═══════════════════════════════════════════

console.log('\n=== Test 7: old render compatibility retained ===');

{
  const rendererSrc = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const coordSrc = fs.readFileSync(path.resolve('app/BattleRenderCoordinator.js'), 'utf-8');

  console.log('\n[7a] BattleCanvasRenderer still has renderBoard');
  assertIncludes(rendererSrc, 'renderBoard', 'renderBoard retained in renderer');

  console.log('\n[7b] BattleRenderCoordinator renderAll() no longer takes animStep/subT (o7.1)');
  assertIncludes(coordSrc, 'function renderAll()', 'renderAll() retained without animStep/subT');

  console.log('\n[7c] BattleRenderCoordinator no longer calls renderBoard with animStep/subT');
  assertExcludes(coordSrc, 'renderBoard(animStep', 'renderBoard no longer called with animStep/subT from coordinator');
}

// ═══════════════════════════════════════════
// Test 8: no playback render state regression
// ═══════════════════════════════════════════

console.log('\n=== Test 8: no playback render state regression ===');

{
  const banned = [
    '_resolutionPlaybackState',
    'getRenderState',
    'setResolutionPlaybackState',
    'clearResolutionPlaybackState',
  ];

  const files = [
    'session/BattleSessionController.js',
    'app/AppRuntime.js',
    'app/BattleRenderCoordinator.js',
    'app/RuntimeTestHooks.js',
    'ui/battle/BattleCanvasRenderer.js',
  ];

  for (const file of files) {
    const src = fs.readFileSync(path.resolve(file), 'utf-8');
    const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const term of banned) {
      assertExcludes(noComments, term, `${file} does not contain "${term}"`);
    }
  }
}

// ═══════════════════════════════════════════
// Test 9: full previous tests still pass by source compatibility
// ═══════════════════════════════════════════

console.log('\n=== Test 9: source compatibility checks ===');

{
  // app_runtime_playback_pipeline test file still valid
  const pipelineSrc = fs.readFileSync(path.resolve('tests/app_runtime_playback_pipeline.spec.js'), 'utf-8');

  console.log('\n[9a] app_runtime_playback_pipeline test asserts old controller deleted');
  assertIncludes(pipelineSrc, 'TurnPlaybackController.js file removed', 'test updated for deletion');

  console.log('\n[9b] battle_session_no_playback_render_state test asserts old controller deleted');
  const bscSrc = fs.readFileSync(path.resolve('tests/battle_session_no_playback_render_state.spec.js'), 'utf-8');
  assertIncludes(bscSrc, 'TurnPlaybackController.js does not exist', 'test updated for deletion');

  // Scenario files still valid
  console.log('\n[9c] scenario files not referencing old controller');
  const scenarioFiles = [
    'tests/resolution_log_renderer.spec.js',
    'tests/skill_test.js',
    'tests/role_loadout_test.js',
    'tests/role_mechanics_test.js',
  ];
  for (const f of scenarioFiles) {
    if (fs.existsSync(path.resolve(f))) {
      const content = fs.readFileSync(path.resolve(f), 'utf-8');
      const noComments = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      assertExcludes(noComments, 'turnPlaybackController', `${f} no turnPlaybackController`);
    }
  }
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
