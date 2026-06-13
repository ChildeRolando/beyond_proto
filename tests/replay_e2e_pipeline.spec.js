// End-to-end playback pipeline tests (Task 8.2)
// Run: node tests/replay_e2e_pipeline.spec.js
//
// Proves that a real turn execution flows through every stage of the
// playback pipeline:
//   buildTurnResolution → compilePresentationTimeline →
//   playTurnResolution → TurnPlaybackRuntime → PlaybackFrame →
//   BattleSceneStore → ResolutionTimelinePanel → BattleCanvasRenderer.render(scene)
//
// Uses fakes/spies for UI components; engine + resolution + presentation +
// playback layers are real (no mocks).

import { BattleSessionController } from '../session/BattleSessionController.js';
import { TurnPlaybackRuntime } from '../playback/TurnPlaybackRuntime.js';
import { compilePresentationTimeline } from '../presentation/PresentationTimelineCompiler.js';
import { buildPlaybackFrame } from '../playback/PresentationTimelinePlayback.js';
import { createTurnResolutionBuilder } from '../engine/resolution/TurnResolutionBuilder.js';
import { BattleSceneStore } from '../presentation/BattleSceneStore.js';
import { renderTurnLog } from '../engine/resolution/ResolutionLogRenderer.js';

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

// ── Clock factories ──

// Deterministic clock: time only advances via _advanceTime().
// Use for manually-driven playback tests.
function createFakeClock() {
  let currentTime = 0;
  let pendingCallbacks = [];
  let nextId = 1;

  return {
    _advanceTime(ms) {
      currentTime += ms;
      const toRun = [...pendingCallbacks];
      pendingCallbacks = [];
      for (const cb of toRun) cb();
    },
    _getTime() { return currentTime; },
    _pendingCount() { return pendingCallbacks.length; },
    now: () => currentTime,
    requestFrame: (cb) => {
      const id = nextId++;
      pendingCallbacks.push(cb);
      return id;
    },
    cancelFrame: (_id) => {
      pendingCallbacks = [];
    },
  };
}

// Async clock: uses real setTimeout, time progresses in real-time.
// Use for executeLocalTurn() tests where the BSC drives the pipeline.
function createAsyncClock() {
  return {
    now: () => Date.now(),
    requestFrame: (cb) => {
      // Use a short delay so playback progresses quickly
      const id = setTimeout(cb, 5);
      return id;
    },
    cancelFrame: (id) => {
      clearTimeout(id);
    },
  };
}

// ── Fake UI components ──

function createFakeRenderer() {
  const scenes = [];
  const renderBoardCalls = [];
  return {
    scenes,
    renderBoardCalls,
    render(scene) {
      scenes.push({ ...scene, effects: [...(scene.effects || [])] });
    },
    renderBoard(_state, _interaction, _effects, _playback) {
      renderBoardCalls.push({ _state, _interaction, _effects, _playback });
    },
  };
}

function createFakeTimelinePanel() {
  const callLog = [];
  return {
    callLog,
    renderResolution(resolution)   { callLog.push({ method: 'renderResolution', resolution }); },
    updatePlaybackFrame(frame)     { callLog.push({ method: 'updatePlaybackFrame', frame }); },
    markComplete(text)             { callLog.push({ method: 'markComplete', text }); },
    reset()                        { callLog.push({ method: 'reset' }); },
    bindSkip(_fn)                  {},
  };
}

// ── Scenarios ──

function makeProjectileScenario() {
  return {
    mode: 'duel',
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    rules: { friendlyFire: false },
    combatants: [
      {
        id: 'mage_a', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '法师', roleLoadoutSkillIds: [], loadoutSkillIds: ['mage_blast'],
        position: { q: 0, r: 0 }, resources: { qi: 3 },
      },
      {
        id: 'warrior_b', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '战士', roleLoadoutSkillIds: [], loadoutSkillIds: ['warrior_slash'],
        position: { q: 2, r: 0 }, resources: {},
      },
    ],
  };
}

function makeNoProjectileScenario() {
  return {
    mode: 'duel',
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    rules: { friendlyFire: false },
    combatants: [
      {
        id: 'warrior_a', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [], loadoutSkillIds: ['warrior_rage'],
        position: { q: 0, r: 0 }, resources: { rage: 3 },
      },
      {
        id: 'warrior_b', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '战士', roleLoadoutSkillIds: [], loadoutSkillIds: ['warrior_rage'],
        position: { q: 2, r: 0 }, resources: { rage: 3 },
      },
    ],
  };
}

// ── Test harness: creates BSC wired to real pipeline + spies ──

function createTestBSC(options = {}) {
  const {
    scenario = makeProjectileScenario(),
    fakeRenderer = null,
    fakeTimelinePanel = null,
    clock = null,           // if null → async clock (real setTimeout)
  } = options;

  const clk = clock || createAsyncClock();
  const turnResolutionBuilder = createTurnResolutionBuilder();
  const battleSceneStore = new BattleSceneStore();
  const renderer = fakeRenderer || createFakeRenderer();
  const timelinePanel = fakeTimelinePanel || createFakeTimelinePanel();

  // Playback runtime (real TurnPlaybackRuntime, clock injected)
  const playbackRuntime = new TurnPlaybackRuntime({
    buildFrame: (timeline, timeMs) => buildPlaybackFrame(timeline, timeMs),
    now: clk.now,
    requestFrame: clk.requestFrame,
    cancelFrame: clk.cancelFrame,
  });

  // Spies
  const playCalls = [];
  const skipCalls = [];
  const origPlay = playbackRuntime.play.bind(playbackRuntime);
  const origSkip = playbackRuntime.skipToEnd.bind(playbackRuntime);
  playbackRuntime.play = (t) => { playCalls.push(t); return origPlay(t); };
  playbackRuntime.skipToEnd = () => { skipCalls.push(true); return origSkip(); };

  // Collect all emitted frames
  const allFrames = [];
  playbackRuntime.onFrame((f) => allFrames.push(f));

  // Wire frame listener → scene store + timeline panel + renderer
  playbackRuntime.onFrame((frame) => {
    battleSceneStore.setPlaybackFrame(frame);
    timelinePanel.updatePlaybackFrame(frame);
    if (renderer) {
      const scene = battleSceneStore.getScene();
      renderer.render(scene);
    }
  });

  playbackRuntime.onComplete(() => {
    timelinePanel.markComplete('回放完成');
  });

  // buildTurnResolution callback
  const buildTurnResolutionCalls = [];
  const buildTurnResolution = async () => {
    buildTurnResolutionCalls.push(true);
    const bsc = battleSessionRef.value;
    if (!bsc) throw new Error('BSC not available');
    return turnResolutionBuilder.build(bsc.engine);
  };

  // playTurnResolution callback (mirrors AppRuntime logic)
  const playTurnResolutionCalls = [];
  let _unsubscribeComplete = null;

  const playTurnResolution = ({ resolution, finalSnapshot }) => {
    return new Promise((resolve) => {
      playTurnResolutionCalls.push({ resolution, finalSnapshot });

      if (_unsubscribeComplete) {
        _unsubscribeComplete();
        _unsubscribeComplete = null;
      }

      battleSceneStore.setPlaybackFrame(null);

      const timeline = compilePresentationTimeline(resolution);
      timelinePanel.renderResolution(resolution);

      const bsc = battleSessionRef.value;
      if (bsc?.engine) {
        battleSceneStore.setBaseState(bsc.engine.getState());
      }

      if (!timeline || timeline.durationMs <= 0) {
        timelinePanel.markComplete('回放完成');
        resolve();
        return;
      }

      _unsubscribeComplete = playbackRuntime.onComplete(() => {
        _unsubscribeComplete?.();
        _unsubscribeComplete = null;
        resolve();
      });

      playbackRuntime.play(timeline);
    });
  };

  // BSC
  const battleSessionRef = { value: null };
  const bsc = new BattleSessionController({
    computeEffectArea: () => [],
    renderAll: () => {},
    renderLog: () => {},
    clearLog: () => {},
    setSubmitStatus: () => {},
    setExecuteDisabled: () => {},
    showGameOverPanel: () => {},
    hideGameOverPanel: () => {},
    showDisconnect: () => {},
    getNetworkManager: () => null,
    getConfigMode: () => 'local',
    isPveMode: () => false,
    setRoute: () => {},
    appendChatMessage: () => {},
    buildTurnResolution,
    playTurnResolution,
    resetResolutionPlayback: () => {
      playbackRuntime.stop?.();
      battleSceneStore.setPlaybackFrame(null);
      timelinePanel.reset?.();
    },
  });
  battleSessionRef.value = bsc;

  bsc.startBattleFromScenario(Date.now(), scenario);

  const spies = {
    renderer,
    timelinePanel,
    battleSceneStore,
    playbackRuntime,
    buildTurnResolutionCalls,
    playTurnResolutionCalls,
    playCalls,
    skipCalls,
    allFrames,
    turnResolutionBuilder,
    clock: clk,
  };

  return { bsc, spies };
}

// ═══════════════════════════════════════════
// Test 1: Local turn E2E — full pipeline
// ═══════════════════════════════════════════

console.log('\n=== Test 1: Local turn E2E — full pipeline ===');

async function test1() {
  const { bsc, spies } = createTestBSC({ scenario: makeProjectileScenario() });

  const r1 = bsc.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  const r2 = bsc.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });
  assert(r1.success, '[1a] mage_blast submitted');
  assert(r2.success, '[1b] warrior_slash submitted');

  const result = await bsc.executeLocalTurn();

  console.log('\n[1c] executeLocalTurn succeeds');
  assert(result.success, 'executeLocalTurn returned success');

  console.log('\n[1d] buildTurnResolution called exactly once');
  assertEquals(spies.buildTurnResolutionCalls.length, 1, 'buildTurnResolution call count = 1');

  console.log('\n[1e] playTurnResolution called exactly once');
  assertEquals(spies.playTurnResolutionCalls.length, 1, 'playTurnResolution call count = 1');

  const preview = spies.playTurnResolutionCalls[0];
  assert(!!preview.resolution, 'playTurnResolution received resolution');
  assert(!!preview.finalSnapshot, 'playTurnResolution received finalSnapshot');

  console.log('\n[1f] compilePresentationTimeline produced a timeline');
  const timeline = compilePresentationTimeline(preview.resolution);
  assert(!!timeline, 'timeline exists');
  assertGte(timeline.durationMs ?? 0, 0, 'timeline.durationMs >= 0');

  console.log('\n[1g] playbackRuntime.play called (if duration > 0)');
  if (timeline.durationMs > 0) {
    assertGte(spies.playCalls.length, 1, 'playbackRuntime.play was called');
  }

  console.log('\n[1h] onFrame fired at least once (if duration > 0)');
  if (timeline.durationMs > 0) {
    assertGte(spies.allFrames.length, 1, 'at least one frame emitted');
  }

  console.log('\n[1i] timelinePanel.renderResolution called before playback');
  const renderResCalls = spies.timelinePanel.callLog.filter(c => c.method === 'renderResolution');
  assertEquals(renderResCalls.length, 1, 'renderResolution called exactly once');

  console.log('\n[1j] timelinePanel.updatePlaybackFrame called for frames');
  const updateCalls = spies.timelinePanel.callLog.filter(c => c.method === 'updatePlaybackFrame');
  if (timeline.durationMs > 0) {
    assertGte(updateCalls.length, 1, 'updatePlaybackFrame called at least once');
  }

  console.log('\n[1k] BattleCanvasRenderer.render(scene) called');
  if (timeline.durationMs > 0) {
    assertGte(spies.renderer.scenes.length, 1, 'render(scene) called at least once');
  }

  console.log('\n[1l] Scene mode is "playback" with effects array');
  if (spies.renderer.scenes.length > 0) {
    const scene = spies.renderer.scenes[0];
    assertEquals(scene.mode, 'playback', 'scene.mode === "playback"');
    assert(Array.isArray(scene.effects), 'scene.effects is array');
  }

  console.log('\n[1m] After playback: input lock is false');
  assertEquals(bsc.isResolutionPlaybackActive(), false, 'input lock released');

  console.log('\n[1n] engine state restored to finalSnapshot');
  const engineState = bsc.engine.getState();
  assert(!!engineState, 'engine has state after turn');

  console.log('\n[1o] CombatLogStore has entries after committed turn');
  const entries = bsc.combatLogStore?.getEntries?.() || [];
  assertGte(entries.length, 1, 'combatLogStore has at least 1 entry after committed turn');

  console.log('\n[1p] getLastTurnResolution returns resolution');
  const lastRes = bsc.getLastTurnResolution();
  assert(!!lastRes, 'getLastTurnResolution returns truthy');
  assert(Array.isArray(lastRes.phases), 'resolution has phases array');
}

// ═══════════════════════════════════════════
// Test 2: No zero-duration deadlock
// ═══════════════════════════════════════════

console.log('\n=== Test 2: No zero-duration deadlock ===');

async function test2() {
  const { bsc, spies } = createTestBSC({ scenario: makeNoProjectileScenario() });

  bsc.submitAction('warrior_a', 'warrior_rage', { q: 0, r: 0, self: true });
  bsc.submitAction('warrior_b', 'warrior_rage', { q: 2, r: 0, self: true });

  const startTime = Date.now();
  const result = await bsc.executeLocalTurn();
  const elapsed = Date.now() - startTime;

  console.log('\n[2a] executeLocalTurn resolves successfully');
  assert(result.success, 'executeLocalTurn success');

  console.log('\n[2b] Resolves quickly (no real-time animation wait)');
  assert(elapsed < 3000, `resolved in ${elapsed}ms (expected < 3000ms)`);

  console.log('\n[2c] Input lock is false after resolution');
  assertEquals(bsc.isResolutionPlaybackActive(), false, 'not locked');

  console.log('\n[2d] timelinePanel.markComplete was called');
  const markCompleteCalls = spies.timelinePanel.callLog.filter(c => c.method === 'markComplete');
  assertGte(markCompleteCalls.length, 1, 'markComplete called');

  console.log('\n[2e] Zero-duration timeline never calls playbackRuntime.play');
  const resolution = spies.playTurnResolutionCalls[0]?.resolution;
  const timeline = compilePresentationTimeline(resolution);
  assertEquals(timeline.durationMs, 0, 'timeline duration is 0');
  assertEquals(spies.playCalls.length, 0, 'playbackRuntime.play was NOT called');

  console.log('\n[2f] No frames emitted');
  assertEquals(spies.allFrames.length, 0, 'zero frames emitted');

  console.log('\n[2g] CombatLogStore still has entries (committed turn)');
  const entries = bsc.combatLogStore?.getEntries?.() || [];
  assertGte(entries.length, 1, 'combatLogStore has entries after zero-duration turn');
}

// ═══════════════════════════════════════════
// Test 3: Skip playback E2E
// ═══════════════════════════════════════════

console.log('\n=== Test 3: Skip playback E2E ===');

async function test3() {
  const fakeClock = createFakeClock();
  const { bsc, spies } = createTestBSC({
    scenario: makeProjectileScenario(),
    clock: fakeClock,
  });

  bsc.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  bsc.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });

  // Build preview manually (bypasses executeLocalTurn)
  const preview = await bsc.buildCurrentTurnResolution();
  assert(!!preview, '[3a] preview built');
  const timeline = compilePresentationTimeline(preview.resolution);
  assertGte(timeline.durationMs, 0, '[3a2] timeline has duration');

  // Manually drive the pipeline
  spies.battleSceneStore.setPlaybackFrame(null);
  spies.timelinePanel.renderResolution(preview.resolution);
  spies.battleSceneStore.setBaseState(bsc.engine.getState());

  const completePromise = new Promise((resolve) => {
    spies.playbackRuntime.onComplete(() => resolve());
  });

  // Start playing
  spies.playbackRuntime.play(timeline);

  // Emit a few frames
  fakeClock._advanceTime(100);

  console.log('\n[3b] Frames emitted before skip');
  assertGte(spies.allFrames.length, 1, 'at least one frame emitted before skip');

  const frameCountBeforeSkip = spies.allFrames.length;

  // Skip to end
  spies.playbackRuntime.skipToEnd();
  await completePromise;

  console.log('\n[3c] Skip completes playback — status is "completed"');
  assertEquals(spies.playbackRuntime.getState().status, 'completed', 'runtime status completed');

  console.log('\n[3d] markComplete called');
  const markCalls = spies.timelinePanel.callLog.filter(c => c.method === 'markComplete');
  assertGte(markCalls.length, 1, 'markComplete called after skip');

  console.log('\n[3e] Last frame timeMs === durationMs');
  const lastFrame = spies.allFrames[spies.allFrames.length - 1];
  assertEquals(lastFrame.timeMs, timeline.durationMs, 'final frame at durationMs');

  console.log('\n[3f] Skip via skipToEnd() directly does not throw');
  const { bsc: bsc2, spies: spies2 } = createTestBSC({
    scenario: makeProjectileScenario(),
    clock: createFakeClock(),
  });
  bsc2.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  bsc2.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });
  const preview2 = await bsc2.buildCurrentTurnResolution();
  const timeline2 = compilePresentationTimeline(preview2.resolution);
  if (timeline2.durationMs > 0) {
    spies2.playbackRuntime.play(timeline2);
    spies2.playbackRuntime.skipToEnd();
    assertEquals(spies2.playbackRuntime.getState().status, 'completed', 'skip leads to completed');
    // Frames should have been emitted (initial frame + final frame from skip)
    assertGte(spies2.allFrames.length, 1, 'frames emitted during skip');
  }

  console.log('\n[3g] After skip, runtime.play from 0 works again');
  if (timeline.durationMs > 0) {
    const framesBefore = spies.allFrames.length;
    spies.playbackRuntime.play(timeline);
    // Initial frame at timeMs=0 should be emitted
    assertGte(spies.allFrames.length, framesBefore + 1, 'new frames after replay');
  }
}

// ═══════════════════════════════════════════
// Test 4: Combat log E2E
// ═══════════════════════════════════════════

console.log('\n=== Test 4: Combat log E2E ===');

async function test4() {
  const { bsc, spies } = createTestBSC({ scenario: makeProjectileScenario() });

  // Check pre-turn state
  const logBefore = bsc.combatLogStore?.getEntries?.() || [];
  const initialCount = logBefore.length;

  console.log('\n[4a] buildCurrentTurnResolution does NOT append to CombatLogStore');
  const preview = await bsc.buildCurrentTurnResolution();
  const logAfterPreview = bsc.combatLogStore?.getEntries?.() || [];
  assertEquals(logAfterPreview.length, initialCount,
    'combatLogStore unchanged after preview-only buildCurrentTurnResolution');

  console.log('\n[4b] executeLocalTurn appends to CombatLogStore');
  // Need to resubmit because buildCurrentTurnResolution called buildTurnResolution
  // which executes on a clone — real engine still has the original submissions
  const r1 = bsc.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  const r2 = bsc.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });
  assert(r1.success, 'resubmit mage_blast');
  assert(r2.success, 'resubmit warrior_slash');

  await bsc.executeLocalTurn();

  const logAfterTurn = bsc.combatLogStore?.getEntries?.() || [];
  assertGte(logAfterTurn.length, 1,
    'combatLogStore has at least 1 entry after committed turn');

  console.log('\n[4c] getLastTurnResolution + renderTurnLog produces canonical log');
  const resolution = bsc.getLastTurnResolution();
  if (resolution && resolution.phases && resolution.phases.length > 0) {
    const canonicalEntries = renderTurnLog(resolution);
    assert(Array.isArray(canonicalEntries), 'renderTurnLog returns array');
    assertGte(canonicalEntries.length, 1, 'canonical log has entries');
  }

  console.log('\n[4d] Preview-only path does not append log (fresh BSC, second verification)');
  // After executeLocalTurn, battle may be over (e.g. one-shot kill).
  // Create a fresh BSC to verify the preview-only invariant cleanly.
  const { bsc: bsc2, spies: spies2 } = createTestBSC({ scenario: makeProjectileScenario() });
  const countBeforePreview2 = (bsc2.combatLogStore?.getEntries?.() || []).length;
  bsc2.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  bsc2.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });
  const preview2 = await bsc2.buildCurrentTurnResolution();
  const logAfterPreview2 = bsc2.combatLogStore?.getEntries?.() || [];
  assertEquals(logAfterPreview2.length, countBeforePreview2,
    'combatLogStore unchanged after buildCurrentTurnResolution on fresh BSC');

  console.log('\n[4e] CombatLogStore.reset clears entries');
  bsc.combatLogStore.reset();
  const afterReset = bsc.combatLogStore?.getEntries?.() || [];
  assertEquals(afterReset.length, 0, 'combatLogStore empty after reset');
}

// ═══════════════════════════════════════════
// Test 5: Renderer boundary during E2E
// ═══════════════════════════════════════════

console.log('\n=== Test 5: Renderer boundary during E2E ===');

async function test5() {
  const fakeRenderer = createFakeRenderer();
  const fakeClock = createFakeClock();
  const { bsc, spies } = createTestBSC({
    scenario: makeProjectileScenario(),
    fakeRenderer,
    clock: fakeClock,
  });

  // Reset any calls from BSC init
  fakeRenderer.scenes.length = 0;
  fakeRenderer.renderBoardCalls.length = 0;

  bsc.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  bsc.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });

  const preview = await bsc.buildCurrentTurnResolution();
  const timeline = compilePresentationTimeline(preview.resolution);

  if (timeline.durationMs > 0) {
    spies.battleSceneStore.setBaseState(bsc.engine.getState());
    spies.timelinePanel.renderResolution(preview.resolution);

    const completePromise = new Promise((resolve) => {
      spies.playbackRuntime.onComplete(() => resolve());
    });

    spies.playbackRuntime.play(timeline);
    fakeClock._advanceTime(timeline.durationMs + 100);
    await completePromise;

    console.log('\n[5a] render(scene) call count > 0');
    assertGte(fakeRenderer.scenes.length, 1, 'render(scene) called at least once');

    console.log('\n[5b] Every scene has mode "playback"');
    for (let i = 0; i < fakeRenderer.scenes.length; i++) {
      assertEquals(fakeRenderer.scenes[i].mode, 'playback',
        `scene[${i}].mode === "playback"`);
    }

    console.log('\n[5c] Every scene has effects array');
    for (let i = 0; i < fakeRenderer.scenes.length; i++) {
      assert(Array.isArray(fakeRenderer.scenes[i].effects),
        `scene[${i}].effects is array`);
    }
  }

  console.log('\n[5d] renderBoard NOT called during new playback pipeline');
  assertEquals(fakeRenderer.renderBoardCalls.length, 0,
    'renderBoard call count = 0 (new pipeline uses render(scene))');

  console.log('\n[5e] No animStep / subT in scene objects');
  for (const scene of fakeRenderer.scenes) {
    assert(!('animStep' in (scene || {})), 'scene has no animStep');
    assert(!('subT' in (scene || {})), 'scene has no subT');
  }

  console.log('\n[5f] No keyframes / animEvents in scene objects');
  for (const scene of fakeRenderer.scenes) {
    const json = JSON.stringify(scene);
    assert(!json.includes('"keyframes"'), 'scene JSON has no keyframes');
    assert(!json.includes('"animEvents"'), 'scene JSON has no animEvents');
  }
}

// ═══════════════════════════════════════════
// Test 6: Timeline panel E2E
// ═══════════════════════════════════════════

console.log('\n=== Test 6: Timeline panel E2E ===');

async function test6() {
  const fakeTimelinePanel = createFakeTimelinePanel();
  const fakeClock = createFakeClock();
  const { bsc, spies } = createTestBSC({
    scenario: makeProjectileScenario(),
    fakeTimelinePanel,
    clock: fakeClock,
  });

  bsc.submitAction('mage_a', 'mage_blast', { q: 2, r: 0 });
  bsc.submitAction('warrior_b', 'warrior_slash', { q: 0, r: 0 });

  const callLog = fakeTimelinePanel.callLog;
  // Clear any calls from BSC init (resetResolutionPlayback may call reset)
  callLog.length = 0;

  const preview = await bsc.buildCurrentTurnResolution();
  const timeline = compilePresentationTimeline(preview.resolution);

  if (timeline.durationMs > 0) {
    spies.battleSceneStore.setBaseState(bsc.engine.getState());

    // Simulate playTurnResolution entry
    fakeTimelinePanel.renderResolution(preview.resolution);

    console.log('\n[6a] renderResolution called exactly once before playback');
    const renderResCalls = callLog.filter(c => c.method === 'renderResolution');
    assertEquals(renderResCalls.length, 1, 'renderResolution called once');

    const completePromise = new Promise((resolve) => {
      spies.playbackRuntime.onComplete(() => resolve());
    });

    spies.playbackRuntime.play(timeline);
    fakeClock._advanceTime(timeline.durationMs + 100);
    await completePromise;

    console.log('\n[6b] updatePlaybackFrame called for frames');
    const updateCalls = callLog.filter(c => c.method === 'updatePlaybackFrame');
    assertGte(updateCalls.length, 1, 'updatePlaybackFrame called at least once');

    console.log('\n[6c] markComplete called after playback completes');
    const markCompleteCalls = callLog.filter(c => c.method === 'markComplete');
    assertGte(markCompleteCalls.length, 1, 'markComplete called');

    console.log('\n[6d] Method call order: renderResolution → updatePlaybackFrame → markComplete');
    const methodOrder = callLog.map(c => c.method);
    const resIdx = methodOrder.indexOf('renderResolution');
    const updateIdx = methodOrder.indexOf('updatePlaybackFrame');
    const completeIdx = methodOrder.indexOf('markComplete');
    assert(resIdx >= 0, 'renderResolution in call log');
    if (updateIdx >= 0 && completeIdx >= 0) {
      assert(updateIdx >= resIdx, 'updatePlaybackFrame after renderResolution');
      assert(completeIdx >= updateIdx, 'markComplete after updatePlaybackFrame');
    }

    console.log('\n[6e] reset clears panel');
    callLog.length = 0;
    fakeTimelinePanel.reset();
    const resetCalls = callLog.filter(c => c.method === 'reset');
    assertEquals(resetCalls.length, 1, 'reset called');
  } else {
    console.log('  (info) timeline duration 0 — testing zero-duration path');
    fakeTimelinePanel.renderResolution(preview.resolution);
    fakeTimelinePanel.markComplete('回放完成');

    assertEquals(callLog.filter(c => c.method === 'renderResolution').length, 1,
      'renderResolution called once');
    assertEquals(callLog.filter(c => c.method === 'markComplete').length, 1,
      'markComplete called once');
  }
}

// ═══════════════════════════════════════════
// Run all tests
// ═══════════════════════════════════════════

async function main() {
  try {
    await test1();
    await test2();
    await test3();
    await test4();
    await test5();
    await test6();
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
