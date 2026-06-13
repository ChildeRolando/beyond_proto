// Contract tests: BattleSessionController no longer holds playback render state
// Run: node tests/battle_session_no_playback_render_state.spec.js
//
// Milestone o6.3

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

function assertEquals(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

// ═══════════════════════════════════════════
// Test 1: BSC source scan — deleted playback render state
// ═══════════════════════════════════════════

console.log('\n=== Test 1: BSC source scan — deleted playback render state ===');

{
  const src = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[1a] _resolutionPlaybackState not in source');
  assertExcludes(noComments, '_resolutionPlaybackState', 'no _resolutionPlaybackState');

  console.log('\n[1b] getRenderState not in source');
  assertExcludes(noComments, 'getRenderState', 'no getRenderState');

  console.log('\n[1c] setResolutionPlaybackState not in source');
  assertExcludes(noComments, 'setResolutionPlaybackState', 'no setResolutionPlaybackState');

  console.log('\n[1d] clearResolutionPlaybackState not in source');
  assertExcludes(noComments, 'clearResolutionPlaybackState', 'no clearResolutionPlaybackState');
}

// ═══════════════════════════════════════════
// Test 2: BSC still has input lock
// ═══════════════════════════════════════════

console.log('\n=== Test 2: BSC still has input lock ===');

{
  const src = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');

  console.log('\n[2a] _resolutionPlaybackLocked retained');
  assertIncludes(src, '_resolutionPlaybackLocked', '_resolutionPlaybackLocked');

  console.log('\n[2b] isResolutionPlaybackActive retained');
  assertIncludes(src, 'isResolutionPlaybackActive', 'isResolutionPlaybackActive');

  console.log('\n[2c] setResolutionPlaybackLocked retained');
  assertIncludes(src, 'setResolutionPlaybackLocked', 'setResolutionPlaybackLocked');
}

// ═══════════════════════════════════════════
// Test 3: getBattlePanelsContext uses engine/getState, not getRenderState
// ═══════════════════════════════════════════

console.log('\n=== Test 3: getBattlePanelsContext uses engine/getState ===');

{
  const src = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');

  // Extract getBattlePanelsContext body (from method start to next method or EOF)
  const ctxStart = src.indexOf('getBattlePanelsContext(extra');
  assert(ctxStart >= 0, 'getBattlePanelsContext method exists');

  // Get a generous chunk: from method start through ~50 lines
  const ctxBody = src.substring(ctxStart, ctxStart + 3000);

  console.log('\n[3a] getBattlePanelsContext body does not contain getRenderState');
  assertExcludes(ctxBody, 'getRenderState', 'no getRenderState in getBattlePanelsContext');

  console.log('\n[3b] state source is this.getState()');
  assertIncludes(ctxBody, 'this.getState()', 'uses this.getState()');
}

// ═══════════════════════════════════════════
// Test 4: BattleRenderCoordinator no longer calls getRenderState
// ═══════════════════════════════════════════

console.log('\n=== Test 4: BattleRenderCoordinator no getRenderState ===');

{
  const src = fs.readFileSync(path.resolve('app/BattleRenderCoordinator.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[4a] no getRenderState in coordinator');
  assertExcludes(noComments, 'getRenderState', 'no getRenderState');

  console.log('\n[4b] legacy fallback uses engine.getState');
  assertIncludes(noComments, "engine?.getState?.() || session?.getState?.()", 'engine.getState || session.getState in legacy renderAll');

  console.log('\n[4c] renderLog fallback uses engine.getState first');
  assertIncludes(noComments, "battleSession.engine?.getState?.() || battleSession?.getState?.()", 'engine.getState first in renderLog');
}

// ═══════════════════════════════════════════
// Test 5: TurnPlaybackController no longer writes playback render state
// ═══════════════════════════════════════════

console.log('\n=== Test 5: TurnPlaybackController no playback render state writes ===');

{
  const src = fs.readFileSync(path.resolve('app/TurnPlaybackController.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[5a] no setResolutionPlaybackState');
  assertExcludes(noComments, 'setResolutionPlaybackState', 'no setResolutionPlaybackState');

  console.log('\n[5b] no clearResolutionPlaybackState');
  assertExcludes(noComments, 'clearResolutionPlaybackState', 'no clearResolutionPlaybackState');

  console.log('\n[5c] no getRenderState');
  assertExcludes(noComments, 'getRenderState', 'no getRenderState');

  console.log('\n[5d] setResolutionPlaybackLocked retained (input lock)');
  assertIncludes(noComments, 'setResolutionPlaybackLocked', 'setResolutionPlaybackLocked retained');

  console.log('\n[5e] renderAll still callable');
  assertIncludes(noComments, 'renderAll', 'renderAll retained');
}

// ═══════════════════════════════════════════
// Test 6: AppRuntime no playback render state dependency
// ═══════════════════════════════════════════

console.log('\n=== Test 6: AppRuntime no playback render state dependency ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[6a] no setResolutionPlaybackState');
  assertExcludes(noComments, 'setResolutionPlaybackState', 'no setResolutionPlaybackState');

  console.log('\n[6b] no clearResolutionPlaybackState');
  assertExcludes(noComments, 'clearResolutionPlaybackState', 'no clearResolutionPlaybackState');

  console.log('\n[6c] no getRenderState');
  assertExcludes(noComments, 'getRenderState', 'no getRenderState');
}

// ═══════════════════════════════════════════
// Test 7: new playback pipeline still intact
// ═══════════════════════════════════════════

console.log('\n=== Test 7: new playback pipeline still intact ===');

{
  const appSrc = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const bscSrc = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');

  console.log('\n[7a] playTurnResolution exists in AppRuntime');
  assertIncludes(appSrc, 'playTurnResolution', 'playTurnResolution defined');

  console.log('\n[7b] playbackRuntime.onFrame writes battleSceneStore.setPlaybackFrame');
  assertIncludes(appSrc, 'setPlaybackFrame', 'setPlaybackFrame in onFrame callback');

  console.log('\n[7c] timelinePanel.updatePlaybackFrame called in onFrame');
  assertIncludes(appSrc, 'timelinePanel.updatePlaybackFrame', 'updatePlaybackFrame called');

  console.log('\n[7d] battleCanvasRenderer.render(scene) in onFrame');
  assertIncludes(appSrc, 'render(scene)', 'render(scene) called');

  console.log('\n[7e] executeLocalTurn preview uses playTurnResolution first');
  assertIncludes(bscSrc, 'playTurnResolution || this._callbacks.animateTurn', 'playTurnResolution || animateTurn in executeLocalTurn');

  console.log('\n[7f] executeP2PTurn preview uses playTurnResolution first');
  // Count occurrences of "playTurnResolution ||" in BSC — should be 2 (local + p2p)
  const playResOrCount = (bscSrc.match(/playTurnResolution \|\| this\._callbacks\.animateTurn/g) || []).length;
  assertEquals(playResOrCount, 2, 'playTurnResolution || animateTurn appears exactly 2 times');

  console.log('\n[7g] non-preview branch uses animateTurn only');
  assertIncludes(bscSrc, "await this._callbacks.animateTurn?.()", 'non-preview else → animateTurn only');
}

// ═══════════════════════════════════════════
// Test 8: renderer remains dumb
// ═══════════════════════════════════════════

console.log('\n=== Test 8: renderer remains dumb ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[8a] no this.battleSession');
  assertExcludes(noComments, 'this.battleSession', 'no this.battleSession');

  console.log('\n[8b] no this.getEngine');
  assertExcludes(noComments, 'this.getEngine', 'no this.getEngine');

  console.log('\n[8c] no getRenderState');
  assertExcludes(noComments, 'getRenderState', 'no getRenderState');

  console.log('\n[8d] no getRenderViewState');
  assertExcludes(noComments, 'getRenderViewState', 'no getRenderViewState');
}

// ═══════════════════════════════════════════
// Test 9: RuntimeTestHooks no getRenderState
// ═══════════════════════════════════════════

console.log('\n=== Test 9: RuntimeTestHooks no getRenderState ===');

{
  const src = fs.readFileSync(path.resolve('app/RuntimeTestHooks.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[9a] no getRenderState');
  assertExcludes(noComments, 'getRenderState', 'no getRenderState');

  console.log('\n[9b] no setResolutionPlaybackState');
  assertExcludes(noComments, 'setResolutionPlaybackState', 'no setResolutionPlaybackState');

  console.log('\n[9c] no clearResolutionPlaybackState');
  assertExcludes(noComments, 'clearResolutionPlaybackState', 'no clearResolutionPlaybackState');
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
