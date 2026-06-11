// Unit tests for TurnPlaybackRuntime
// Run: node tests/turn_playback_runtime.spec.js
//
// Milestone o4.1

import { TurnPlaybackRuntime } from '../playback/TurnPlaybackRuntime.js';
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
// Helpers: fake clock for deterministic tests
// ═══════════════════════════════════════════

function createFakeClock() {
  let currentTime = 0;
  let pendingCallbacks = [];
  let nextId = 1;

  return {
    // Control API for tests
    _advanceTime(ms) {
      currentTime += ms;
      const toRun = [...pendingCallbacks];
      pendingCallbacks = [];
      for (const cb of toRun) {
        cb();
      }
    },
    _getTime() { return currentTime; },
    _pendingCount() { return pendingCallbacks.length; },

    // Clock API (passed to TurnPlaybackRuntime)
    now: () => currentTime,
    requestFrame: (cb) => {
      const id = nextId++;
      pendingCallbacks.push(cb);
      return id;
    },
    cancelFrame: (id) => {
      pendingCallbacks = pendingCallbacks.filter((_, i) => {
        // We just remove all — simple for tests
        return true;
      });
      // Simpler: just clear all
      pendingCallbacks = [];
    },
  };
}

function makeTimeline(overrides = {}) {
  return {
    schemaVersion: 1,
    turnNumber: overrides.turnNumber ?? 1,
    durationMs: overrides.durationMs ?? 1000,
    tracks: overrides.tracks || [],
    clips: overrides.clips || [],
  };
}

function makeBuildFrame() {
  const calls = [];
  const fn = (timeline, timeMs) => {
    const frame = {
      mode: 'playback',
      timeMs,
      durationMs: timeline?.durationMs || 0,
      phaseId: null,
      activeActionIds: [],
      activeClipIds: [],
      activeClips: [],
      sceneState: null,
      effects: [],
    };
    calls.push(frame);
    return frame;
  };
  fn.calls = calls;
  return fn;
}

// ═══════════════════════════════════════════
// Test 1: play emits initial frame at timeMs=0
// ═══════════════════════════════════════════

console.log('\n=== Test 1: play emits initial frame ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 1000 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  const receivedFrames = [];
  runtime.onFrame((f) => receivedFrames.push(f));

  runtime.play(timeline);

  console.log('\n[1a] initial frame emitted synchronously at timeMs=0');
  assert(receivedFrames.length >= 1, 'at least 1 frame received');
  assertEquals(receivedFrames[0].timeMs, 0, 'first frame timeMs === 0');

  console.log('\n[1b] state is playing');
  const state = runtime.getState();
  assertEquals(state.status, 'playing', 'status is playing');
  assertEquals(state.timeMs, 0, 'timeMs is 0');
  assertEquals(state.durationMs, 1000, 'durationMs correct');
  assertEquals(state.hasTimeline, true, 'hasTimeline is true');

  console.log('\n[1c] advancing time emits more frames');
  clock._advanceTime(100);
  assert(receivedFrames.length >= 2, 'more frames after time advance');
  assert(receivedFrames[receivedFrames.length - 1].timeMs > 0, 'later frame timeMs > 0');
}

// ═══════════════════════════════════════════
// Test 2: seek emits correct frame
// ═══════════════════════════════════════════

console.log('\n=== Test 2: seek emits correct frame ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 1000 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  const receivedFrames = [];
  runtime.onFrame((f) => receivedFrames.push(f));

  runtime.play(timeline);
  receivedFrames.length = 0; // clear initial frames

  runtime.seek(500);

  console.log('\n[2a] seek(500) emits frame at timeMs=500');
  assert(receivedFrames.length >= 1, 'frame emitted on seek');
  assertEquals(receivedFrames[receivedFrames.length - 1].timeMs, 500, 'timeMs === 500');

  console.log('\n[2b] seek while not playing');
  const runtime2 = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  // idle state — seek should NOT emit (no timeline set)
  runtime2.seek(300);
  const state2 = runtime2.getState();
  assertEquals(state2.timeMs, 0, 'idle runtime seek does not change timeMs (no duration)');
}

// ═══════════════════════════════════════════
// Test 3: seek clamps
// ═══════════════════════════════════════════

console.log('\n=== Test 3: seek clamps ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 1000 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  const receivedFrames = [];
  runtime.onFrame((f) => receivedFrames.push(f));
  runtime.play(timeline);
  receivedFrames.length = 0;

  console.log('\n[3a] seek(-100) clamps to 0');
  runtime.seek(-100);
  assertEquals(receivedFrames[receivedFrames.length - 1].timeMs, 0, 'clamped to 0');

  console.log('\n[3b] seek(9999) clamps to duration');
  receivedFrames.length = 0;
  runtime.seek(9999);
  assertEquals(receivedFrames[receivedFrames.length - 1].timeMs, 1000, 'clamped to durationMs=1000');
}

// ═══════════════════════════════════════════
// Test 4: skipToEnd emits final frame and complete
// ═══════════════════════════════════════════

console.log('\n=== Test 4: skipToEnd ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 1000 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  const receivedFrames = [];
  let completeCount = 0;
  runtime.onFrame((f) => receivedFrames.push(f));
  runtime.onComplete(() => completeCount++);

  runtime.play(timeline);
  receivedFrames.length = 0;
  completeCount = 0;

  runtime.skipToEnd();

  console.log('\n[4a] last frame timeMs === duration');
  assert(receivedFrames.length >= 1, 'final frame emitted');
  assertEquals(receivedFrames[receivedFrames.length - 1].timeMs, 1000, 'timeMs === 1000');

  console.log('\n[4b] onComplete called once');
  assertEquals(completeCount, 1, 'complete called once');

  console.log('\n[4c] state is completed');
  const state = runtime.getState();
  assertEquals(state.status, 'completed', 'status is completed');
  assertEquals(state.timeMs, 1000, 'timeMs is duration');
}

// ═══════════════════════════════════════════
// Test 5: pause / resume
// ═══════════════════════════════════════════

console.log('\n=== Test 5: pause / resume ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 1000 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  const receivedFrames = [];
  runtime.onFrame((f) => receivedFrames.push(f));

  console.log('\n[5a] pause sets status to paused');
  runtime.play(timeline);
  runtime.pause();
  assertEquals(runtime.getState().status, 'paused', 'status is paused');

  console.log('\n[5b] no new frames while paused');
  const frameCountBefore = receivedFrames.length;
  clock._advanceTime(500);
  assertEquals(receivedFrames.length, frameCountBefore, 'no new frames while paused');

  console.log('\n[5c] resume sets status to playing');
  runtime.resume();
  assertEquals(runtime.getState().status, 'playing', 'status is playing');

  console.log('\n[5d] frames resume after resume');
  clock._advanceTime(100);
  assert(receivedFrames.length > frameCountBefore, 'new frames after resume');
}

// ═══════════════════════════════════════════
// Test 6: stop (no complete event)
// ═══════════════════════════════════════════

console.log('\n=== Test 6: stop ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 1000 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  let completeCount = 0;
  runtime.onComplete(() => completeCount++);

  console.log('\n[6a] stop sets status to stopped');
  runtime.play(timeline);
  runtime.stop();
  assertEquals(runtime.getState().status, 'stopped', 'status is stopped');

  console.log('\n[6b] stop does NOT trigger complete');
  assertEquals(completeCount, 0, 'complete NOT called on stop');

  console.log('\n[6c] no more frames after stop');
  const receivedFrames = [];
  runtime.onFrame((f) => receivedFrames.push(f));
  clock._advanceTime(500);
  assertEquals(receivedFrames.length, 0, 'no frames after stop');
}

// ═══════════════════════════════════════════
// Test 7: unsubscribe
// ═══════════════════════════════════════════

console.log('\n=== Test 7: unsubscribe ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 1000 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  console.log('\n[7a] onFrame returns unsubscribe function');
  const frameCounts = { a: 0, b: 0 };
  const unsubA = runtime.onFrame(() => frameCounts.a++);
  const unsubB = runtime.onFrame(() => frameCounts.b++);

  runtime.play(timeline);
  assert(frameCounts.a > 0, 'listener A called');
  assert(frameCounts.b > 0, 'listener B called');

  console.log('\n[7b] after unsubscribe, listener not called');
  const countABefore = frameCounts.a;
  unsubA();
  clock._advanceTime(200);
  assertEquals(frameCounts.a, countABefore, 'listener A not called after unsubscribe');
  assert(frameCounts.b > countABefore, 'listener B still called');

  console.log('\n[7c] onComplete returns unsubscribe function');
  let completeA = 0, completeB = 0;
  const runtime3 = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });
  const unsubCompA = runtime3.onComplete(() => completeA++);
  runtime3.onComplete(() => completeB++);
  unsubCompA();
  runtime3.play(makeTimeline({ durationMs: 50 }));
  // Advance past duration
  clock._advanceTime(100);
  assertEquals(completeA, 0, 'unsubscribed complete not called');
  assert(completeB >= 1, 'other complete listener called');
}

// ═══════════════════════════════════════════
// Test 8: deterministic fake clock (no real RAF)
// ═══════════════════════════════════════════

console.log('\n=== Test 8: deterministic fake clock ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 500 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  const receivedFrames = [];
  let completeCount = 0;
  runtime.onFrame((f) => receivedFrames.push(f));
  runtime.onComplete(() => completeCount++);

  console.log('\n[8a] controlled time advancement');
  runtime.play(timeline);
  assertEquals(receivedFrames[0].timeMs, 0, 'initial timeMs=0');

  // Advance to middle
  clock._advanceTime(250);
  assert(receivedFrames.length > 1, 'frames emitted during advance');
  const lastBeforeEnd = receivedFrames[receivedFrames.length - 1];
  assert(lastBeforeEnd.timeMs > 0 && lastBeforeEnd.timeMs < 500, 'timeMs between 0 and duration');

  console.log('\n[8b] complete triggers when time reaches duration');
  // Advance past duration
  clock._advanceTime(500);
  assertEquals(completeCount, 1, 'complete called');
  assertEquals(runtime.getState().status, 'completed', 'status completed');
  assertEquals(runtime.getState().timeMs, 500, 'timeMs at duration');

  console.log('\n[8c] deterministic: same inputs → same frames');
  const clock2 = createFakeClock();
  const buildFrame2 = makeBuildFrame();
  const runtime2 = new TurnPlaybackRuntime({
    buildFrame: buildFrame2,
    now: clock2.now,
    requestFrame: clock2.requestFrame,
    cancelFrame: clock2.cancelFrame,
  });
  const frames2 = [];
  runtime2.onFrame((f) => frames2.push(f));
  runtime2.play(makeTimeline({ durationMs: 500 }));
  clock2._advanceTime(250);
  clock2._advanceTime(500);

  const frames1 = receivedFrames;
  // Both should have same number of frames at same time positions
  assertEquals(frames1[0].timeMs, frames2[0].timeMs, 'same initial timeMs');
  assertEquals(frames1[frames1.length - 1].timeMs, frames2[frames2.length - 1].timeMs, 'same final timeMs');
}

// ═══════════════════════════════════════════
// Test 9: boundary source scan
// ═══════════════════════════════════════════

console.log('\n=== Test 9: boundary source scan ===');

{
  const FORBIDDEN = [
    'document',
    'getElementById',
    'battleSession',
    'BattleSessionController',
    'BattleCanvasRenderer',
    'TurnPlaybackController',
    'renderAll',
    'setSubmitStatus',
    'setExecuteDisabled',
    'GameEngine',
    'keyframes',
    'animEvents',
  ];

  function scanFile(filePath) {
    const src = fs.readFileSync(filePath, 'utf-8');
    const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const rel = path.relative('.', filePath);
    for (const term of FORBIDDEN) {
      if (noComments.includes(term)) {
        console.error(`    Found "${term}" in ${rel}`);
        fail++;
      }
    }
  }

  console.log('\n[9a] TurnPlaybackRuntime.js boundary');
  scanFile(path.resolve('playback/TurnPlaybackRuntime.js'));

  console.log('\n[9b] PlaybackClock.js boundary');
  scanFile(path.resolve('playback/PlaybackClock.js'));

  console.log('\n[9c] TurnPlaybackRuntime only imports from PlaybackClock.js');
  const runtimePath = path.resolve('playback/TurnPlaybackRuntime.js');
  const runtimeSrc = fs.readFileSync(runtimePath, 'utf-8');
  const importLines = runtimeSrc.split('\n').filter(l => l.trimStart().startsWith('import'));
  for (const line of importLines) {
    const isOK = line.includes('./PlaybackClock.js');
    if (!isOK) {
      console.error(`    Unexpected import: ${line.trim()}`);
      fail++;
    }
  }

  console.log('\n[9d] PlaybackClock.js has no imports (self-contained)');
  const clockPath = path.resolve('playback/PlaybackClock.js');
  const clockSrc = fs.readFileSync(clockPath, 'utf-8');
  const clockImports = clockSrc.split('\n').filter(l => l.trimStart().startsWith('import'));
  assertEquals(clockImports.length, 0, 'PlaybackClock has no imports');
}

// ═══════════════════════════════════════════
// Test 10: play with empty/null timeline
// ═══════════════════════════════════════════

console.log('\n=== Test 10: edge cases ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  console.log('\n[10a] play(null) does not throw');
  let threw = false;
  try {
    runtime.play(null);
  } catch (e) {
    threw = true;
    console.error(`    ${e.message}`);
  }
  assert(!threw, 'play(null) handled');

  console.log('\n[10b] initial state is idle');
  const runtime2 = new TurnPlaybackRuntime({ buildFrame });
  const state = runtime2.getState();
  assertEquals(state.status, 'idle', 'initial status is idle');
  assertEquals(state.timeMs, 0, 'initial timeMs is 0');
  assertEquals(state.hasTimeline, false, 'no timeline initially');

  console.log('\n[10c] constructor throws without buildFrame');
  threw = false;
  try {
    new TurnPlaybackRuntime({});
  } catch (e) {
    threw = true;
  }
  assert(threw, 'constructor throws without buildFrame');

  console.log('\n[10d] pause/resume ignored when not playing');
  const runtime3 = new TurnPlaybackRuntime({ buildFrame });
  runtime3.pause();  // no-op
  assertEquals(runtime3.getState().status, 'idle', 'pause on idle is no-op');
  runtime3.resume(); // no-op
  assertEquals(runtime3.getState().status, 'idle', 'resume on idle is no-op');
}

// ═══════════════════════════════════════════
// Test 11: play from beginning after completed
// ═══════════════════════════════════════════

console.log('\n=== Test 11: replay after complete ===');

{
  const clock = createFakeClock();
  const buildFrame = makeBuildFrame();
  const timeline = makeTimeline({ durationMs: 200 });

  const runtime = new TurnPlaybackRuntime({
    buildFrame,
    now: clock.now,
    requestFrame: clock.requestFrame,
    cancelFrame: clock.cancelFrame,
  });

  console.log('\n[11a] skipToEnd then play again from 0');
  runtime.play(timeline);
  runtime.skipToEnd();
  assertEquals(runtime.getState().status, 'completed', 'completed after skipToEnd');

  const receivedFrames = [];
  runtime.onFrame((f) => receivedFrames.push(f));
  runtime.play(timeline);
  assertEquals(receivedFrames[0].timeMs, 0, 'restarts from 0');
  assertEquals(runtime.getState().status, 'playing', 'playing again');
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
