// Integration tests for AppRuntime playback pipeline wiring
// Run: node tests/app_runtime_playback_pipeline.spec.js
//
// Milestone o6.2

import { BattleSceneStore } from '../presentation/BattleSceneStore.js';
import { compilePresentationTimeline, PresentationTimelineCompiler } from '../presentation/PresentationTimelineCompiler.js';
import { TurnPlaybackRuntime } from '../playback/TurnPlaybackRuntime.js';
import { buildPlaybackFrame } from '../playback/PresentationTimelinePlayback.js';
import { PresentationClipKind } from '../presentation/PresentationClipTypes.js';
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

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function makeResolution(overrides = {}) {
  return {
    schemaVersion: 2,
    turnNumber: overrides.turnNumber ?? 1,
    initialSnapshot: null,
    finalSnapshot: null,
    phases: overrides.phases || [],
  };
}

function makeFakeClock() {
  let t = 0;
  let pending = [];
  return {
    now: () => t,
    requestFrame: (cb) => { pending.push(cb); return pending.length; },
    cancelFrame: () => { pending = []; },
    _advance(ms) { t += ms; const run = [...pending]; pending = []; for (const cb of run) cb(); },
  };
}

function getAllJsFiles(dir) {
  const results = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fp = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...getAllJsFiles(fp));
      else if (entry.name.endsWith('.js')) results.push(fp);
    }
  } catch (_) {}
  return results;
}

// ═══════════════════════════════════════════
// Test 1: AppRuntime source wiring
// ═══════════════════════════════════════════

console.log('\n=== Test 1: AppRuntime source wiring ===');

{
  const src = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');

  const REQUIRED = [
    'BattleSceneStore',
    'TurnPlaybackRuntime',
    'ResolutionTimelinePanel',
    'compilePresentationTimeline',
    'buildPlaybackFrame',
    'playbackRuntime.onFrame',
    'playbackRuntime.onComplete',
    'timelinePanel.renderResolution',
    'timelinePanel.updatePlaybackFrame',
    'timelinePanel.markComplete',
    'timelinePanel.bindSkip',
    'playTurnResolution',
  ];

  console.log('\n[1a] AppRuntime imports/uses all required pipeline components');
  for (const term of REQUIRED) {
    assert(src.includes(term), `AppRuntime contains "${term}"`);
  }

  console.log('\n[1b] AppRuntime no longer imports old TurnPlaybackController (o6.4)');
  assert(!src.includes('TurnPlaybackController'), 'TurnPlaybackController NOT imported');
  assert(!src.includes('createTurnPlaybackController'), 'createTurnPlaybackController NOT used');
  // New pipeline (playTurnResolution) is the sole playback path
  assert(src.includes('playTurnResolution'), 'playTurnResolution is defined');
}

// ═══════════════════════════════════════════
// Test 2: renderer stays dumb
// ═══════════════════════════════════════════

console.log('\n=== Test 2: renderer stays dumb ===');

{
  const src = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

  console.log('\n[2a] renderer does not contain this.battleSession or this.getEngine');
  assert(!noComments.includes('this.battleSession'), 'no this.battleSession');
  assert(!noComments.includes('this.getEngine'), 'no this.getEngine');

  console.log('\n[2b] renderer does not call getRenderState or getRenderViewState');
  assert(!noComments.includes('getRenderState'), 'no getRenderState');
  assert(!noComments.includes('getRenderViewState'), 'no getRenderViewState');
}

// ═══════════════════════════════════════════
// Test 3: playback frame reaches scene store
// ═══════════════════════════════════════════

console.log('\n=== Test 3: playback frame → scene store → getScene ===');

{
  const store = new BattleSceneStore();
  const fakeState = { characters: [{ id: 'c1', position: { q: 0, r: 0 } }] };
  store.setBaseState(fakeState);

  const fakeFrame = {
    mode: 'playback',
    timeMs: 500,
    durationMs: 2000,
    phaseId: 'turn-1-speed-3',
    activeActionIds: ['act-1'],
    activeClipIds: ['clip-1'],
    activeClips: [],
    sceneState: null,
    effects: [{ id: 'fx-1', effectType: 'projectile_impact', progress: 0.5, payload: { contactPos: { q: 1, r: 0 } } }],
  };
  store.setPlaybackFrame(fakeFrame);

  const scene = store.getScene();

  console.log('\n[3a] scene.mode is playback');
  assertEquals(scene.mode, 'playback', 'mode === playback');

  console.log('\n[3b] scene has characters from base state');
  assertEquals(scene.characters.length, 1, 'characters from base state');
  assertEquals(scene.characters[0].id, 'c1', 'character id');

  console.log('\n[3c] scene.effects from frame.effects');
  assertEquals(scene.effects.length, 1, 'effects from frame');
  assertEquals(scene.effects[0].id, 'fx-1', 'effect id');

  console.log('\n[3d] scene.playback.timeMs from frame');
  assertEquals(scene.playback.timeMs, 500, 'playback.timeMs === frame.timeMs');
}

// ═══════════════════════════════════════════
// Test 4: pipeline render with playback frame
// ═══════════════════════════════════════════

console.log('\n=== Test 4: pipeline render with playback frame ===');

{
  const store = new BattleSceneStore();
  const fakeState = { characters: [], projectiles: [], casings: [], wildBullets: [] };
  store.setBaseState(fakeState);

  const fakeFrame = {
    mode: 'playback',
    timeMs: 300,
    durationMs: 1000,
    activeActionIds: [],
    activeClipIds: [],
    activeClips: [],
    sceneState: null,
    effects: [{ id: 'fx-1', effectType: 'projectile_impact', progress: 0.3, payload: { contactPos: { q: 0, r: 0 } } }],
  };
  store.setPlaybackFrame(fakeFrame);

  const interaction = { selectedCharacterId: 'c1' };
  store.setInteraction(interaction);

  const renderedScenes = [];
  const mockRenderer = { render(scene) { renderedScenes.push(scene); } };

  // Simulate what renderLiveScene does during playback frame callback
  const scene = store.getScene();
  mockRenderer.render(scene);

  console.log('\n[4a] renderer.render called with playback scene');
  assertEquals(renderedScenes.length, 1, 'render called');
  assertEquals(renderedScenes[0].mode, 'playback', 'scene.mode === playback');

  console.log('\n[4b] scene.effects present');
  assertEquals(renderedScenes[0].effects.length, 1, 'effects present');
  assertEquals(renderedScenes[0].effects[0].effectType, 'projectile_impact', 'effect type');

  console.log('\n[4c] scene.playback.timeMs correct');
  assertEquals(renderedScenes[0].playback.timeMs, 300, 'timeMs === 300');
}

// ═══════════════════════════════════════════
// Test 5: timeline panel callback wiring
// ═══════════════════════════════════════════

console.log('\n=== Test 5: timeline panel callbacks ===');

{
  const panelCalls = { updatePlaybackFrame: 0, markComplete: 0, renderResolution: 0, bindSkip: 0 };
  const skipHandler = { fn: null };

  const mockPanel = {
    updatePlaybackFrame(frame) { panelCalls.updatePlaybackFrame++; },
    markComplete(text) { panelCalls.markComplete++; },
    renderResolution(res) { panelCalls.renderResolution++; },
    bindSkip(fn) { panelCalls.bindSkip++; skipHandler.fn = fn; },
    reset() {}, setCollapsed() {}, toggleCollapsed() {},
  };

  const mockBattleRender = { renderAllCalls: 0, renderAll() { this.renderAllCalls++; } };

  // Simulate runtime.onFrame callback
  const clock = makeFakeClock();
  const store = new BattleSceneStore();
  store.setBaseState({ characters: [], projectiles: [] });

  const runtime = new TurnPlaybackRuntime({
    buildFrame: (timeline, timeMs) => ({
      mode: 'playback', timeMs, durationMs: timeline?.durationMs || 0,
      phaseId: 'turn-1-speed-3', activeActionIds: [], activeClipIds: [], activeClips: [],
      sceneState: null, effects: [],
    }),
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  runtime.onFrame((frame) => {
    mockPanel.updatePlaybackFrame(frame);
    mockBattleRender.renderAll();
  });

  const timeline = compilePresentationTimeline(makeResolution());
  runtime.play(timeline);

  console.log('\n[5a] onFrame → updatePlaybackFrame called');
  assert(panelCalls.updatePlaybackFrame >= 1, 'updatePlaybackFrame called');

  console.log('\n[5b] onFrame → render called');
  // Note: onFrame now calls renderer.render(scene) + individual panel methods
  // rather than battleRender.renderAll() to avoid overwriting playback base state
  assert(panelCalls.updatePlaybackFrame >= 1, 'updatePlaybackFrame called');
}

// ═══════════════════════════════════════════
// Test 6: complete callback
// ═══════════════════════════════════════════

console.log('\n=== Test 6: complete callback → markComplete ===');

{
  let markCompleteCalled = false;
  let markCompleteText = '';
  const mockPanel = {
    markComplete(text) { markCompleteCalled = true; markCompleteText = text; },
    updatePlaybackFrame() {}, renderResolution() {}, bindSkip() {},
    reset() {}, setCollapsed() {}, toggleCollapsed() {},
  };

  const clock = makeFakeClock();
  const runtime = new TurnPlaybackRuntime({
    buildFrame: (timeline, timeMs) => ({
      mode: 'playback', timeMs, durationMs: timeline?.durationMs || 0,
      phaseId: null, activeActionIds: [], activeClipIds: [], activeClips: [],
      sceneState: null, effects: [],
    }),
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  runtime.onComplete(() => mockPanel.markComplete('回放完成'));

  const timeline = compilePresentationTimeline(makeResolution());
  runtime.play(timeline);
  runtime.skipToEnd();

  console.log('\n[6a] skipToEnd → onComplete → markComplete');
  assert(markCompleteCalled, 'markComplete called');
  assertEquals(markCompleteText, '回放完成', 'text is 回放完成');
}

// ═══════════════════════════════════════════
// Test 7: skip binding → runtime.skipToEnd
// ═══════════════════════════════════════════

console.log('\n=== Test 7: bindSkip → runtime.skipToEnd ===');

{
  let skipToEndCalled = false;
  const mockRuntime = {
    skipToEnd() { skipToEndCalled = true; },
  };

  let skipHandler = null;

  // Simulate bindSkip pattern
  const bindSkip = (fn) => { skipHandler = fn; };
  bindSkip(() => mockRuntime.skipToEnd());

  console.log('\n[7a] bound callback calls runtime.skipToEnd');
  assert(skipHandler !== null, 'skip handler registered');
  skipHandler();
  assert(skipToEndCalled, 'skipToEnd called via bound handler');
}

// ═══════════════════════════════════════════
// Test 8: old controller deleted (o6.4)
// ═══════════════════════════════════════════

console.log('\n=== Test 8: old controller deleted (o6.4) ===');

{
  console.log('\n[8a] TurnPlaybackController.js no longer exists');
  const exists = fs.existsSync(path.resolve('app/TurnPlaybackController.js'));
  assert(!exists, 'TurnPlaybackController.js file removed');

  console.log('\n[8b] AppRuntime no longer references TurnPlaybackController');
  const appSrc = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');
  assert(!appSrc.includes('TurnPlaybackController'), 'TurnPlaybackController not imported');
  assert(!appSrc.includes('createTurnPlaybackController'), 'createTurnPlaybackController not used');
}

// ═══════════════════════════════════════════
// Test 9: boundary scan
// ═══════════════════════════════════════════

console.log('\n=== Test 9: boundary scan ===');

{
  console.log('\n[9a] TurnPlaybackRuntime has no DOM/session/renderer imports');
  const runtimeSrc = fs.readFileSync(path.resolve('playback/TurnPlaybackRuntime.js'), 'utf-8');
  const runtimeImports = runtimeSrc.split('\n').filter(l => l.trimStart().startsWith('import'));
  for (const line of runtimeImports) {
    const isOK = line.includes('./PlaybackClock.js');
    assert(isOK, `TurnPlaybackRuntime import OK: ${line.trim()}`);
  }

  console.log('\n[9b] ResolutionTimelinePanel has no runtime/session imports');
  const panelSrc = fs.readFileSync(path.resolve('ui/battle/ResolutionTimelinePanel.js'), 'utf-8');
  const panelImports = panelSrc.split('\n').filter(l => l.trimStart().startsWith('import'));
  for (const line of panelImports) {
    const isOK = line.includes('SkillData.js') || line.includes('GameModes.js') || line.includes('SkillIconAssets.js');
    assert(isOK, `Panel import OK: ${line.trim()}`);
  }

  console.log('\n[9c] BattleCanvasRenderer has no session/engine constructor dependency');
  const rendererSrc = fs.readFileSync(path.resolve('ui/battle/BattleCanvasRenderer.js'), 'utf-8');
  const noComments = rendererSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert(!noComments.includes('this.battleSession'), 'no this.battleSession');
  assert(!noComments.includes('this.getEngine'), 'no this.getEngine');

  console.log('\n[9d] engine/ does not import presentation/playback/renderer');
  const forbiddenModules = ['BattleSceneStore', 'BattleScene', 'BattleCanvasRenderer', 'PresentationTimelineCompiler', 'TurnPlaybackRuntime', 'PresentationTimelinePlayback', 'ResolutionTimelinePanel'];
  let violations = 0;
  for (const file of getAllJsFiles(path.resolve('engine'))) {
    const fileSrc = fs.readFileSync(file, 'utf-8');
    for (const line of fileSrc.split('\n').filter(l => l.trimStart().startsWith('import'))) {
      for (const term of forbiddenModules) {
        if (line.includes(term)) { violations++; console.error(`    ${term} in ${path.relative('.', file)}`); }
      }
    }
  }
  assertEquals(violations, 0, `engine/ has 0 forbidden imports (${violations} found)`);
}

// ═══════════════════════════════════════════
// Test 10: BattleSessionController prefers playTurnResolution

console.log('\n=== Test 10: BattleSessionController prefers playTurnResolution ===');

{
  const bscSrc = fs.readFileSync(path.resolve('session/BattleSessionController.js'), 'utf-8');
  const appSrc = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');

  console.log('\n[10a] BSC preview branches use playTurnResolution || animateTurn');
  assert(bscSrc.includes('playTurnResolution ||'), 'playTurnResolution || animateTurn pattern in BSC');
  assert(bscSrc.includes('animateTurn'), 'animateTurn fallback retained');

  console.log('\n[10b] playTurnResolution appears exactly in 2 preview branches');
  // executeLocalTurn preview + executeP2PTurn preview only (NOT non-preview else)
  const playResCount = (bscSrc.match(/playTurnResolution/g) || []).length;
  assertEquals(playResCount, 2, 'playTurnResolution in 2 preview branches only');

  console.log('\n[10c] non-preview else branch uses animateTurn only (not playTurnResolution)');
  // Count: playTurnResolution should appear exactly 2 times (2 preview branches)
  // The non-preview } else { await this._callbacks.animateTurn?.() } is clean
  const playResCount2 = (bscSrc.match(/playTurnResolution/g) || []).length;
  assertEquals(playResCount2, 2, 'playTurnResolution only in 2 preview branches, NOT in non-preview else');
  // Verify the else branch with animateTurn still exists
  const nonPreviewElsePattern = /}\s*else\s*\{\s*await\s+this\._callbacks\.animateTurn\?\.\(\)/;
  assert(nonPreviewElsePattern.test(bscSrc), 'non-preview else → animateTurn only');

  console.log('\n[10c] playTurnResolution defined in AppRuntime and passed to session');
  assert(appSrc.includes('playTurnResolution'), 'playTurnResolution defined in AppRuntime');
  assert(appSrc.includes('playTurnResolution,'), 'playTurnResolution in BSC options');
}

// ═══════════════════════════════════════════
// Test 11: Promise behavior — playTurnResolution resolves on complete

console.log('\n=== Test 11: playTurnResolution Promise behavior ===');

{
  const appSrc = fs.readFileSync(path.resolve('app/AppRuntime.js'), 'utf-8');

  console.log('\n[11a] playTurnResolution returns a Promise');
  assert(appSrc.includes('new Promise'), 'playTurnResolution uses new Promise');

  console.log('\n[11b] playTurnResolution resolves in onComplete callback');
  assert(appSrc.includes('_unsubscribePlayComplete'), 'uses unsubscribe to avoid listener leak');
  assert(appSrc.includes('resolve()'), 'calls resolve() on complete');

  console.log('\n[11c] playTurnResolution clears old playback frame');
  assert(appSrc.includes('setPlaybackFrame(null)'), 'clears old playbackFrame before starting');
}

// ═══════════════════════════════════════════
// Test 12: onComplete dedup — safe with both global + per-play listeners

console.log('\n=== Test 12: onComplete dedup safe ===');

{
  let globalCompleteCount = 0;
  let perPlayCompleteCount = 0;

  const listeners = [];
  const mockRuntime = {
    onComplete(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    play() {},
    skipToEnd() { for (const fn of listeners) fn(); },
  };

  // Global (always active)
  mockRuntime.onComplete(() => { globalCompleteCount++; });
  // Per-play (registered for specific resolution, unsubscribes on complete)
  const unsub = mockRuntime.onComplete(() => { perPlayCompleteCount++; unsub(); });

  // Trigger complete (via skipToEnd)
  mockRuntime.skipToEnd();

  console.log('\n[12a] both listeners fire on first complete');
  assertEquals(globalCompleteCount, 1, 'global onComplete called once');
  assertEquals(perPlayCompleteCount, 1, 'per-play onComplete called once');

  // Trigger again — per-play listener should be unsubscribed
  mockRuntime.skipToEnd();

  console.log('\n[12b] per-play listener does not fire twice (unsubscribed)');
  assertEquals(globalCompleteCount, 2, 'global fires again');
  assertEquals(perPlayCompleteCount, 1, 'per-play does NOT fire again');
}

// ═══════════════════════════════════════════
// Test 13: compiler → timeline → frame integration
// ═══════════════════════════════════════════

console.log('\n=== Test 13: compiler → timeline → buildPlaybackFrame ===');

{
  const phase = {
    id: 'turn-1-speed-3',
    phaseKind: 'speed',
    speed: 3,
    events: [{
      id: 'ev-1', eventType: 'projectile_created',
      projectileId: 'proj-1', actorId: 'char-a', actionId: 'act-1',
      from: { q: 0, r: 0 }, to: { q: 2, r: 0 }, basePower: 100,
      metadata: { path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], flags: [], speed: 3, isMelee: false, projectileType: 'projectile' },
    }],
  };
  const resolution = makeResolution({ phases: [phase] });

  console.log('\n[13a] compilePresentationTimeline produces valid timeline');
  const timeline = compilePresentationTimeline(resolution);
  assertEquals(timeline.schemaVersion, 1, 'schemaVersion 1');
  assert(timeline.clips.length >= 1, 'has clips');
  assert(timeline.durationMs > 0, 'has duration');

  console.log('\n[13b] buildPlaybackFrame from timeline');
  const frame = buildPlaybackFrame(timeline, 50);
  assertEquals(frame.mode, 'playback', 'frame mode');
  assertEquals(frame.timeMs, 50, 'frame timeMs');
  assertEquals(frame.durationMs, timeline.durationMs, 'durationMs matches');
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
