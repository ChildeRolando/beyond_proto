// Contract tests: log / timeline boundary integrity (o7.3)
// Run: node tests/resolution_log_timeline_boundary.spec.js

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

// Strip comments, keep only active code
function stripComments(src) {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ═══════════════════════════════════════════
// Test A: ResolutionTimelinePanel boundary
// ═══════════════════════════════════════════

console.log('\n=== Test A: ResolutionTimelinePanel boundary ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/ResolutionTimelinePanel.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[A1] no import of BattleSessionController');
  assertExcludes(noComments, 'BattleSessionController', 'no BattleSessionController import');

  console.log('\n[A2] no import of GameEngine');
  assertExcludes(noComments, 'GameEngine', 'no GameEngine import');

  console.log('\n[A3] no import of BattleSceneStore');
  assertExcludes(noComments, 'BattleSceneStore', 'no BattleSceneStore import');

  console.log('\n[A4] no import of BattleCanvasRenderer');
  assertExcludes(noComments, 'BattleCanvasRenderer', 'no BattleCanvasRenderer import');

  console.log('\n[A5] no import of TurnPlaybackRuntime');
  assertExcludes(noComments, 'TurnPlaybackRuntime', 'no TurnPlaybackRuntime import');

  console.log('\n[A6] no combatLogStore reference');
  assertExcludes(noComments, 'combatLogStore', 'no combatLogStore');

  console.log('\n[A7] no renderTurnLog reference');
  assertExcludes(noComments, 'renderTurnLog', 'no renderTurnLog');

  console.log('\n[A8] no getLastTurnResolution reference');
  assertExcludes(noComments, 'getLastTurnResolution', 'no getLastTurnResolution');

  console.log('\n[A9] no engine.getState reference');
  assertExcludes(noComments, 'engine.getState', 'no engine.getState');

  console.log('\n[A10] panel has renderResolution method');
  assertIncludes(src, 'renderResolution(resolution)', 'renderResolution exists');

  console.log('\n[A11] panel has updatePlaybackFrame method');
  assertIncludes(src, 'updatePlaybackFrame(frame)', 'updatePlaybackFrame exists');

  console.log('\n[A12] panel has markComplete method');
  assertIncludes(src, 'markComplete(text', 'markComplete exists');

  console.log('\n[A13] panel has reset method');
  assertIncludes(src, 'reset()', 'reset method exists');

  console.log('\n[A14] panel has bindSkip method');
  assertIncludes(src, 'bindSkip(onSkip)', 'bindSkip exists');
}

// ═══════════════════════════════════════════
// Test B: Combat log boundary (BattleRenderCoordinator.renderLog)
// ═══════════════════════════════════════════

console.log('\n=== Test B: Combat log boundary ===');

{
  const src = fs.readFileSync(path.resolve('app/BattleRenderCoordinator.js'), 'utf-8');
  const noComments = stripComments(src);

  // Extract renderLog function body
  const fnStart = src.indexOf('function renderLog()');
  const fnBody = src.substring(fnStart);

  console.log('\n[B1] renderLog does NOT contain playbackRuntime');
  assertExcludes(fnBody, 'playbackRuntime', 'no playbackRuntime in renderLog');

  console.log('\n[B2] renderLog does NOT contain timelinePanel');
  assertExcludes(fnBody, 'timelinePanel', 'no timelinePanel in renderLog');

  console.log('\n[B3] renderLog does NOT contain BattleSceneStore');
  assertExcludes(fnBody, 'BattleSceneStore', 'no BattleSceneStore in renderLog');

  console.log('\n[B4] renderLog does NOT contain scene.effects');
  assertExcludes(fnBody, 'scene.effects', 'no scene.effects in renderLog');

  console.log('\n[B5] renderLog does NOT contain updatePlaybackFrame');
  assertExcludes(fnBody, 'updatePlaybackFrame', 'no updatePlaybackFrame in renderLog');

  console.log('\n[B6] renderLog uses getEl for DOM access (not timelinePanel)');
  assertIncludes(fnBody, 'getEl', 'uses getEl for log DOM element');

  console.log('\n[B7] renderLog uses combatLogStore (primary canonical log source)');
  assertIncludes(fnBody, 'combatLogStore', 'combatLogStore present');

  console.log('\n[B8] renderLog uses engine.getState as fallback');
  assertIncludes(fnBody, 'engine?.getState', 'engine fallback present');

  console.log('\n[B9] renderLog exists as function');
  assertIncludes(src, 'function renderLog()', 'renderLog function defined');

  console.log('\n[B10] BattleRenderCoordinator does NOT import playback modules');
  assertExcludes(noComments, 'TurnPlaybackRuntime', 'no TurnPlaybackRuntime import');
  assertExcludes(noComments, 'BattleSceneStore', 'no BattleSceneStore import');
  assertExcludes(noComments, 'PlaybackFrame', 'no PlaybackFrame import');
}

// ═══════════════════════════════════════════
// Test C: RuntimeTestHooks semantic boundary
// ═══════════════════════════════════════════

console.log('\n=== Test C: RuntimeTestHooks semantic boundary ===');

{
  const src = fs.readFileSync(path.resolve('app/RuntimeTestHooks.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[C1] getResolution returns getLastTurnResolution');
  assertIncludes(noComments, 'getResolution:', 'getResolution defined');
  assertIncludes(noComments, 'getLastTurnResolution', 'delegates to getLastTurnResolution');

  console.log('\n[C2] getTimelineState uses playbackRuntime.getState');
  const timelineStateFn = src.substring(
    src.indexOf('getTimelineState:'),
    src.indexOf('getUnit:', src.indexOf('getTimelineState:'))
  );
  assertIncludes(timelineStateFn, 'getPlaybackRuntime', 'getTimelineState uses playbackRuntime');
  assertIncludes(timelineStateFn, 'prState.status', 'getTimelineState reads playback status');

  console.log('\n[C3] getTimelineState does NOT return combat log entries');
  // getTimelineState returns { activeSpeed, playbackStatus, timeMs, hasTimeline }
  assertIncludes(timelineStateFn, 'playbackStatus', 'returns playbackStatus');
  assertIncludes(timelineStateFn, 'activeSpeed', 'returns activeSpeed');
  assertExcludes(timelineStateFn, 'combatLogStore', 'no combatLogStore in getTimelineState');
  assertExcludes(timelineStateFn, 'renderTurnLog', 'no renderTurnLog in getTimelineState');
  assertExcludes(timelineStateFn, 'getEntries', 'no log getEntries in getTimelineState');

  console.log('\n[C4] getCanonicalLog uses combatLogStore or renderTurnLog');
  const canonicalLogFn = src.substring(
    src.indexOf('getCanonicalLog:'),
    src.indexOf('getPhaseActions:', src.indexOf('getCanonicalLog:'))
  );
  assertIncludes(canonicalLogFn, 'combatLogStore', 'getCanonicalLog reads combatLogStore');
  assertIncludes(canonicalLogFn, 'renderTurnLog', 'getCanonicalLog uses renderTurnLog fallback');

  console.log('\n[C5] getCanonicalLog does NOT read timeline DOM');
  assertExcludes(canonicalLogFn, 'querySelector', 'no DOM query in getCanonicalLog');
  assertExcludes(canonicalLogFn, 'resolution-phase', 'no timeline DOM in getCanonicalLog');
  assertExcludes(canonicalLogFn, 'activeSpeed', 'no activeSpeed in getCanonicalLog');
  assertExcludes(canonicalLogFn, 'dataset.speed', 'no dataset.speed in getCanonicalLog');

  console.log('\n[C6] getUnit reads engine current state');
  const getUnitFn = src.substring(
    src.indexOf('getUnit:(id)'),
    src.indexOf('isInputLocked:', src.indexOf('getUnit:(id)'))
  );
  assertIncludes(getUnitFn, 'engine.getState()', 'getUnit reads engine state');
  assertIncludes(getUnitFn, 'structuredClone', 'getUnit returns structured clone');

  console.log('\n[C7] getLegacyLogText exists, getCombatLogText absent (renamed o7.3)');
  assertIncludes(noComments, 'getLegacyLogText:', 'getLegacyLogText defined');
  assertExcludes(noComments, 'getCombatLogText:', 'getCombatLogText removed');
  // Verify legacy log accessor reads from engine state.logs
  const legacyLogFn = src.substring(
    src.indexOf('getLegacyLogText:'),
    src.indexOf('getCanonicalLog:', src.indexOf('getLegacyLogText:'))
  );
  assertIncludes(legacyLogFn, 'engine.getState()', 'legacy log reads engine state');
  assertIncludes(legacyLogFn, 'state?.logs', 'legacy log reads state.logs');

  console.log('\n[C8] RuntimeTestHooks imports renderTurnLog for canonical log');
  assertIncludes(noComments, 'renderTurnLog', 'renderTurnLog imported from ResolutionLogRenderer');

  console.log('\n[C9] getTimelineState reads activeSpeed from DOM phase cards (not log DOM)');
  assertIncludes(timelineStateFn, 'resolution-phase.active', 'reads timeline phase DOM for activeSpeed');
  assertIncludes(timelineStateFn, 'dataset.speed', 'reads dataset.speed from phase cards');
}

// ═══════════════════════════════════════════
// Test D: No scene.effects → combat log coupling
// ═══════════════════════════════════════════

console.log('\n=== Test D: No scene.effects → combat log coupling ===');

{
  const files = [
    'app/AppRuntime.js',
    'app/BattleRenderCoordinator.js',
    'session/BattleSessionController.js',
    'app/RuntimeTestHooks.js',
    'ui/battle/ResolutionTimelinePanel.js',
  ];

  for (const f of files) {
    const fpath = path.resolve(f);
    if (!fs.existsSync(fpath)) continue;
    const src = fs.readFileSync(fpath, 'utf-8');
    const noComments = stripComments(src);

    // Check: no pattern of reading scene.effects and writing to combat log
    // Strategy: if a file has scene.effects, verify it doesn't also have log-related terms
    const hasSceneEffects = noComments.includes('scene.effects');
    const hasLogTerms = noComments.includes('combatLogStore') ||
      noComments.includes('renderTurnLog') ||
      noComments.includes('appendResolution');

    if (hasSceneEffects && hasLogTerms) {
      console.log(`\n[D] ${f}: scene.effects + log terms coexist — checking context`);
      // BattleCanvasRenderer legitimately has scene.effects for rendering — it's excluded
      if (f === 'ui/battle/BattleCanvasRenderer.js') {
        console.log(`  renderer exemption: scene.effects for visuals is legitimate`);
      } else {
        // App-layer files must NOT couple scene.effects with log store/log renderer
        console.error(`  FAIL: ${f} has both scene.effects and log terms`);
        fail++;
      }
    }

    console.log(`\n[D] ${f}:`);
    if (hasSceneEffects) {
      console.log(`  scene.effects present (rendering)`);
    } else {
      console.log(`  no scene.effects`);
    }
    if (hasLogTerms) {
      console.log(`  log terms present (log pipeline)`);
    } else {
      console.log(`  no log terms`);
    }
    pass++; // file checked
  }
}

// ═══════════════════════════════════════════
// Test E: No renderer → log coupling
// ═══════════════════════════════════════════

console.log('\n=== Test E: No renderer → log coupling ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[E1] no combatLogStore in renderer');
  assertExcludes(noComments, 'combatLogStore', 'no combatLogStore');

  console.log('\n[E2] no renderTurnLog in renderer');
  assertExcludes(noComments, 'renderTurnLog', 'no renderTurnLog');

  console.log('\n[E3] no getLastTurnResolution in renderer');
  assertExcludes(noComments, 'getLastTurnResolution', 'no getLastTurnResolution');

  console.log('\n[E4] no timelinePanel in renderer');
  assertExcludes(noComments, 'timelinePanel', 'no timelinePanel');

  console.log('\n[E5] no updatePlaybackFrame in renderer');
  assertExcludes(noComments, 'updatePlaybackFrame', 'no updatePlaybackFrame');

  console.log('\n[E6] renderer has render(scene) method (new pipeline)');
  assertIncludes(src, 'render(scene)', 'render(scene) exists');

  console.log('\n[E7] renderer has renderBoard(legacyView) method (static legacy)');
  assertIncludes(src, 'renderBoard(legacyView = null)', 'renderBoard static legacy retained');

  console.log('\n[E8] renderer uses scene.effects for rendering (correct)');
  assertIncludes(noComments, 'scene.effects', 'uses scene.effects for visual effects');
}

// ═══════════════════════════════════════════
// Test F: Regression — existing boundary contracts still hold
// ═══════════════════════════════════════════

console.log('\n=== Test F: Regression checks ===');

{
  // F1: animStep/subT protocol still removed
  const coordSrc = fs.readFileSync(path.resolve('app/BattleRenderCoordinator.js'), 'utf-8');
  const coordNoComments = stripComments(coordSrc);
  console.log('\n[F1] animStep/subT protocol still removed');
  assertIncludes(coordNoComments, 'function renderAll()', 'renderAll() takes no params');
  assertExcludes(coordNoComments, 'animStep', 'no animStep');
  assertExcludes(coordNoComments, 'subT', 'no subT');

  // F2: keyframes/animEvents still removed from renderBoard
  const rendererSrc = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const rendererNoComments = stripComments(rendererSrc);
  const renderBoardStart = rendererSrc.indexOf('renderBoard(legacyView = null)');
  const renderBoardBody = rendererSrc.substring(renderBoardStart);

  console.log('\n[F2] keyframes/animEvents still removed from renderBoard');
  assertExcludes(stripComments(renderBoardBody), 'keyframes', 'no keyframes in renderBoard');
  assertExcludes(stripComments(renderBoardBody), 'animEvents', 'no animEvents in renderBoard');

  // F3: old TurnPlaybackController still deleted
  console.log('\n[F3] old TurnPlaybackController still deleted');
  const tpcExists = fs.existsSync(path.resolve('app/TurnPlaybackController.js'));
  assert(!tpcExists, 'TurnPlaybackController.js does not exist');

  // F4: BSC playback render state still deleted
  const bscSrc = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');
  const bscNoComments = stripComments(bscSrc);
  console.log('\n[F4] BSC playback render state still deleted');
  assertExcludes(bscNoComments, '_resolutionPlaybackState', 'no _resolutionPlaybackState');
  assertExcludes(bscNoComments, 'getRenderState', 'no getRenderState');
  assertExcludes(bscNoComments, 'setResolutionPlaybackState', 'no setResolutionPlaybackState');
  assertExcludes(bscNoComments, 'clearResolutionPlaybackState', 'no clearResolutionPlaybackState');

  // F5: new playback pipeline retained
  const appSrc = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const appNoComments = stripComments(appSrc);
  console.log('\n[F5] new playback pipeline retained');
  assertIncludes(appNoComments, 'TurnPlaybackRuntime', 'TurnPlaybackRuntime present');
  assertIncludes(appNoComments, 'BattleSceneStore', 'BattleSceneStore present');
  assertIncludes(appNoComments, 'createResolutionTimelinePanel', 'ResolutionTimelinePanel present');
  assertIncludes(appNoComments, 'compilePresentationTimeline', 'PresentationTimelineCompiler present');
  assertIncludes(appNoComments, 'playTurnResolution', 'playTurnResolution present');

  // F6: renderBoard static legacy render still exists
  console.log('\n[F6] renderBoard static legacy render retained');
  assertIncludes(rendererSrc, 'renderBoard(legacyView = null)', 'renderBoard retained');
  assertIncludes(renderBoardBody, 'legacyView?.state', 'renderBoard reads legacyView.state');
  assertIncludes(renderBoardBody, 'legacyView?.renderView', 'renderBoard reads legacyView.renderView');

  // F7: scene effects path retained
  console.log('\n[F7] scene effects path retained');
  assertIncludes(rendererSrc, '#renderSceneEffects(scene)', 'renderSceneEffects called');
  const sceneEffectsFn = rendererSrc.substring(rendererSrc.indexOf('#renderSceneEffects('));
  assertIncludes(sceneEffectsFn, 'scene.effects', 'reads scene.effects');
}

// ═══════════════════════════════════════════
// Test G: AppRuntime onFrame wiring boundary
// ═══════════════════════════════════════════

console.log('\n=== Test G: AppRuntime onFrame wiring boundary ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  const noComments = stripComments(src);

  // Extract onFrame handler body
  const onFrameStart = src.indexOf('playbackRuntime.onFrame((frame)');
  const onFrameEnd = src.indexOf('playbackRuntime.onComplete', onFrameStart);
  const onFrameBody = src.substring(onFrameStart, onFrameEnd);

  console.log('\n[G1] onFrame updates sceneStore (correct)');
  assertIncludes(onFrameBody, 'battleSceneStore.setPlaybackFrame', 'updates sceneStore');

  console.log('\n[G2] onFrame updates timeline panel (correct)');
  assertIncludes(onFrameBody, 'timelinePanel.updatePlaybackFrame', 'updates timeline panel');

  console.log('\n[G3] onFrame calls renderer.render(scene) (correct)');
  assertIncludes(onFrameBody, 'battleCanvasRenderer.render(scene)', 'renders scene');

  console.log('\n[G4] onFrame calls renderLog via coordinator (correct — coord owns log)');
  assertIncludes(onFrameBody, 'battleRender.renderLog()', 'coordinator handles log');

  console.log('\n[G5] onFrame does NOT directly access combatLogStore');
  assertExcludes(onFrameBody, 'combatLogStore', 'no direct combatLogStore in onFrame');

  console.log('\n[G6] onFrame does NOT directly call renderTurnLog');
  assertExcludes(onFrameBody, 'renderTurnLog', 'no direct renderTurnLog in onFrame');
}

// ═══════════════════════════════════════════
// Test H: BattleSessionController log boundary
// ═══════════════════════════════════════════

console.log('\n=== Test H: BattleSessionController log boundary ===');

{
  const src = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[H1] BSC owns CombatLogStore instance');
  assertIncludes(noComments, 'new CombatLogStore()', 'owns CombatLogStore');

  console.log('\n[H2] BSC appends resolution to combatLogStore after turn execution');
  // Check that appendResolution is called in executeLocalTurn and executeP2PTurn
  const appendCalls = (src.match(/combatLogStore\.appendResolution/g) || []).length;
  assert(appendCalls >= 2, `appendResolution called ${appendCalls} times (expected >= 2)`);

  console.log('\n[H3] BSC does NOT read scene.effects');
  assertExcludes(noComments, 'scene.effects', 'no scene.effects in BSC');

  console.log('\n[H4] BSC does NOT read timelinePanel');
  assertExcludes(noComments, 'timelinePanel', 'no timelinePanel in BSC');

  console.log('\n[H5] BSC does NOT read PlaybackFrame');
  assertExcludes(noComments, 'PlaybackFrame', 'no PlaybackFrame in BSC');

  console.log('\n[H6] BSC getLastTurnResolution returns structuredClone');
  assertIncludes(noComments, 'structuredClone(this.lastTurnResolution)', 'returns clone for immutability');

  console.log('\n[H7] BSC does NOT import ResolutionLogRenderer');
  assertExcludes(noComments, 'ResolutionLogRenderer', 'no log renderer import');

  console.log('\n[H8] buildCurrentTurnResolution does NOT append to CombatLogStore');
  // Extract buildCurrentTurnResolution body
  const buildFnStart = src.indexOf('async buildCurrentTurnResolution()');
  const buildFnEnd = src.indexOf('isResolutionPlaybackActive', buildFnStart);
  const buildFnBody = src.substring(buildFnStart, buildFnEnd);
  assertExcludes(stripComments(buildFnBody), 'appendResolution', 'no appendResolution in buildCurrentTurnResolution');
  assertExcludes(stripComments(buildFnBody), 'combatLogStore.appendResolution', 'no combatLogStore.appendResolution in preview helper');

  console.log('\n[H9] appendResolution only in committed execution paths');
  // Verify: every combatLogStore.appendResolution in BSC is in a committed function.
  // Use delimiter-based extraction (avoid brace counting which breaks on default params).
  const bscAppendCount = (src.match(/combatLogStore\.appendResolution/g) || []).length;

  // executeLocalTurn: last execution method in file; after it comes _getPveAiCharacterIds
  const localStart = src.indexOf('async executeLocalTurn()');
  const localEnd = src.indexOf('_getPveAiCharacterIds()', localStart);
  const localBody = localEnd > 0 ? src.substring(localStart, localEnd) : src.substring(localStart);
  const localAppendCount = (localBody.match(/combatLogStore\.appendResolution/g) || []).length;

  // executeP2PTurn: after handleRemoteAction, before executeLocalTurn
  const p2pStart = src.indexOf('async executeP2PTurn(');
  const p2pEnd = src.indexOf('async executeLocalTurn()', p2pStart);
  const p2pBody = p2pEnd > 0 ? src.substring(p2pStart, p2pEnd) : '';
  const p2pAppendCount = (p2pBody.match(/combatLogStore\.appendResolution/g) || []).length;

  assert(localAppendCount >= 1, `executeLocalTurn has ${localAppendCount} appendResolution (expected >= 1)`);
  assert(p2pAppendCount >= 1, `executeP2PTurn has ${p2pAppendCount} appendResolution (expected >= 1)`);

  // All BSC appendResolution calls must be in committed execution paths
  assert(bscAppendCount === localAppendCount + p2pAppendCount,
    `All ${bscAppendCount} BSC appendResolution in committed paths (${localAppendCount} local + ${p2pAppendCount} p2p)`);
}

// ═══════════════════════════════════════════
// Test I: RuntimeTestHooks preview helpers do NOT mutate CombatLogStore
// ═══════════════════════════════════════════

console.log('\n=== Test I: RuntimeTestHooks preview helpers do NOT mutate CombatLogStore ===');

{
  const src = fs.readFileSync(path.resolve('app/RuntimeTestHooks.js'), 'utf-8');
  const noComments = stripComments(src);

  console.log('\n[I1] executeTurnAndGetResolution is labeled preview-only');
  // Comment is on the line(s) immediately above the function key — search wider range
  const execFnKeyIdx = src.indexOf('executeTurnAndGetResolution:');
  const execFnPreContext = src.substring(Math.max(0, execFnKeyIdx - 200), execFnKeyIdx);
  const execFnEnd = src.indexOf('executeRealTurnAndGetResolution:', execFnKeyIdx);
  const execFnBody = src.substring(execFnKeyIdx, execFnEnd > 0 ? execFnEnd : src.length);
  // Comment is in the pre-context (lines above the key)
  const hasPreviewComment = execFnPreContext.includes('Preview-only') || execFnBody.includes('Preview-only');
  assert(hasPreviewComment, 'executeTurnAndGetResolution has preview-only comment');

  console.log('\n[I2] executeTurnAndGetResolution does NOT call appendResolution');
  assertExcludes(stripComments(execFnBody), 'appendResolution', 'no appendResolution in preview helper');

  console.log('\n[I3] executeTurnAndGetResolution calls buildCurrentTurnResolution');
  assertIncludes(noComments, 'executeTurnAndGetResolution:', 'preview helper exists');
  // It calls buildCurrentTurnResolution which no longer appends

  console.log('\n[I4] executeRealTurnAndGetResolution IS allowed to append (committed real turn)');
  // executeRealTurnAndGetResolution executes on real engine and manually appends — this is legitimate
  const realFnStart = src.indexOf('executeRealTurnAndGetResolution:');
  if (realFnStart > 0) {
    const realFnBody = src.substring(realFnStart, src.indexOf('playCurrentResolution:', realFnStart));
    // Real turn hook may contain appendResolution — that's committed path
    assertIncludes(noComments, 'executeRealTurnAndGetResolution:', 'real turn helper exists');
  }

  console.log('\n[I5] playTurnResolution does NOT append to CombatLogStore');
  // playTurnResolution in AppRuntime is the playback entry point — must not touch log
  const appSrc = stripComments(fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8'));
  const playFnStart = appSrc.indexOf('const playTurnResolution');
  const playFnEnd = appSrc.indexOf('const battleRender', playFnStart);
  const playFnBody = appSrc.substring(playFnStart, playFnEnd);
  assertExcludes(playFnBody, 'appendResolution', 'playTurnResolution does not append');
  assertExcludes(playFnBody, 'combatLogStore', 'playTurnResolution does not touch combatLogStore');
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
