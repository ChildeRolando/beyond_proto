// Unit tests for PresentationTimelinePlayback / buildPlaybackFrame
// Run: node tests/presentation_timeline_playback.spec.js
//
// Milestone 3 / Task 3.3

import { buildPlaybackFrame, PresentationTimelinePlayback } from '../playback/PresentationTimelinePlayback.js';
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

function assertDeepEquals(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${b}, got ${a}`); }
}

// ═══════════════════════════════════════════
// Helpers: build minimal timeline fixtures
// ═══════════════════════════════════════════

function makeClip(overrides = {}) {
  return {
    id: overrides.id || 'clip-1',
    clipType: overrides.clipType || PresentationClipKind.PROJECTILE_LAUNCH,
    sourceEventId: overrides.sourceEventId || 'ev-1',
    actionId: overrides.hasOwnProperty('actionId') ? overrides.actionId : 'act-1',
    actorId: overrides.actorId || 'char-a',
    targetId: overrides.targetId ?? null,
    startMs: overrides.startMs ?? 0,
    durationMs: overrides.durationMs ?? 100,
    payload: overrides.payload || {
      projectileId: 'proj-1',
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      basePower: 100,
    },
  };
}

function makeTimeline(overrides = {}) {
  return {
    schemaVersion: 1,
    turnNumber: overrides.turnNumber ?? 1,
    durationMs: overrides.durationMs ?? 200,
    tracks: overrides.tracks || [],
    clips: overrides.clips || [],
  };
}

// ═══════════════════════════════════════════
// Test 1: active clip selection
// ═══════════════════════════════════════════

console.log('\n=== Test 1: active clip selection ===');

{
  const clipA = makeClip({ id: 'clip-a', startMs: 0, durationMs: 100 });
  const clipB = makeClip({ id: 'clip-b', startMs: 100, durationMs: 100, actionId: 'act-2' });
  const timeline = makeTimeline({ durationMs: 200, clips: [clipA, clipB] });

  console.log('\n[1a] timeMs=50 → only clip A active');
  {
    const frame = buildPlaybackFrame(timeline, 50);
    assertEquals(frame.activeClipIds.length, 1, '1 active clip');
    assertEquals(frame.activeClipIds[0], 'clip-a', 'active clip is A');
    assertEquals(frame.activeActionIds.length, 1, '1 active actionId');
    assertEquals(frame.activeActionIds[0], 'act-1', 'actionId from clip A');
  }

  console.log('\n[1b] timeMs=100 → only clip B active');
  {
    const frame = buildPlaybackFrame(timeline, 100);
    assertEquals(frame.activeClipIds.length, 1, '1 active clip');
    assertEquals(frame.activeClipIds[0], 'clip-b', 'active clip is B');
    assertEquals(frame.activeActionIds[0], 'act-2', 'actionId from clip B');
  }

  console.log('\n[1c] timeMs=0 → clip A active (inclusive start)');
  {
    const frame = buildPlaybackFrame(timeline, 0);
    assertEquals(frame.activeClipIds.length, 1, '1 active clip at time 0');
    assertEquals(frame.activeClipIds[0], 'clip-a', 'clip A active at time 0');
  }

  console.log('\n[1d] timeMs=200 → no clips active (exclusive end)');
  {
    const frame = buildPlaybackFrame(timeline, 200);
    assertEquals(frame.activeClipIds.length, 0, '0 active clips at time=duration');
  }

  console.log('\n[1e] timeMs=150 → clip B still active');
  {
    const frame = buildPlaybackFrame(timeline, 150);
    assertEquals(frame.activeClipIds.length, 1, '1 active clip');
    assertEquals(frame.activeClipIds[0], 'clip-b', 'clip B active at 150');
  }
}

// ═══════════════════════════════════════════
// Test 2: progress calculation
// ═══════════════════════════════════════════

console.log('\n=== Test 2: progress calculation ===');

{
  const clip = makeClip({ id: 'clip-1', startMs: 100, durationMs: 200, payload: { val: 42 } });
  const timeline = makeTimeline({ durationMs: 500, clips: [clip] });

  console.log('\n[2a] timeMs=150 → progress=0.25');
  {
    const frame = buildPlaybackFrame(timeline, 150);
    assertEquals(frame.effects.length, 1, '1 effect');
    assertEquals(frame.effects[0].progress, 0.25, 'progress = (150-100)/200 = 0.25');
  }

  console.log('\n[2b] timeMs=200 → progress=0.5');
  {
    const frame = buildPlaybackFrame(timeline, 200);
    assertEquals(frame.effects.length, 1, '1 effect');
    assertEquals(frame.effects[0].progress, 0.5, 'progress = (200-100)/200 = 0.5');
  }

  console.log('\n[2c] timeMs=299 → progress=0.995 (last active ms)');
  {
    const frame = buildPlaybackFrame(timeline, 299);
    assertEquals(frame.effects.length, 1, '1 effect at time 299');
    assertEquals(frame.effects[0].progress, 0.995, 'progress = (299-100)/200 = 0.995');
  }

  console.log('\n[2d] timeMs=300 → clip inactive (exclusive end)');
  {
    const frame = buildPlaybackFrame(timeline, 300);
    assertEquals(frame.effects.length, 0, '0 effects at time=start+duration');
  }

  console.log('\n[2e] timeMs<start → clip inactive');
  {
    const frame = buildPlaybackFrame(timeline, 50);
    assertEquals(frame.effects.length, 0, '0 effects before clip starts');
  }
}

// ═══════════════════════════════════════════
// Test 3: activeActionIds dedupe
// ═══════════════════════════════════════════

console.log('\n=== Test 3: activeActionIds dedupe ===');

{
  const clipA = makeClip({ id: 'clip-a', actionId: 'act-1', startMs: 0, durationMs: 100 });
  const clipB = makeClip({ id: 'clip-b', actionId: 'act-1', startMs: 50, durationMs: 100 }); // same actionId
  const timeline = makeTimeline({ durationMs: 200, clips: [clipA, clipB] });

  console.log('\n[3a] two active clips, same actionId → deduped');
  {
    // At time 75, both clips are active, both have actionId 'act-1'
    const frame = buildPlaybackFrame(timeline, 75);
    assertEquals(frame.activeClipIds.length, 2, '2 active clips');
    assertEquals(frame.activeActionIds.length, 1, '1 unique actionId');
    assertEquals(frame.activeActionIds[0], 'act-1', 'deduped actionId');
  }

  console.log('\n[3b] different actionIds → both appear');
  {
    const clipC = makeClip({ id: 'clip-c', actionId: 'act-2', startMs: 0, durationMs: 100 });
    const clipD = makeClip({ id: 'clip-d', actionId: 'act-3', startMs: 50, durationMs: 100 });
    const tl = makeTimeline({ durationMs: 200, clips: [clipC, clipD] });
    const frame = buildPlaybackFrame(tl, 75);
    assertEquals(frame.activeActionIds.length, 2, '2 unique actionIds');
    assert(frame.activeActionIds.includes('act-2'), 'contains act-2');
    assert(frame.activeActionIds.includes('act-3'), 'contains act-3');
  }

  console.log('\n[3c] null actionId is filtered out');
  {
    const clipNull = makeClip({ id: 'clip-null', actionId: null, startMs: 0, durationMs: 100 });
    const tl2 = makeTimeline({ durationMs: 200, clips: [clipNull] });
    const frame = buildPlaybackFrame(tl2, 50);
    assertEquals(frame.activeActionIds.length, 0, 'null actionId filtered out');
    assertEquals(frame.activeClipIds.length, 1, 'clip still active');
  }
}

// ═══════════════════════════════════════════
// Test 4: effects shape
// ═══════════════════════════════════════════

console.log('\n=== Test 4: effects shape ===');

{
  const clip = makeClip({
    id: 'clip-1',
    clipType: PresentationClipKind.PROJECTILE_LAUNCH,
    sourceEventId: 'ev-launch',
    actionId: 'act-1',
    actorId: 'char-a',
    targetId: 'char-b',
    startMs: 0,
    durationMs: 100,
    payload: { projectileId: 'proj-1', path: [{ q: 0, r: 0 }, { q: 2, r: 0 }], basePower: 100 },
  });
  const timeline = makeTimeline({ durationMs: 100, clips: [clip] });

  console.log('\n[4a] effect shape fields');
  {
    const frame = buildPlaybackFrame(timeline, 50);
    assertEquals(frame.effects.length, 1, '1 effect');
    const fx = frame.effects[0];

    assertEquals(fx.effectType, PresentationClipKind.PROJECTILE_LAUNCH, 'effectType === clip.clipType');
    assertEquals(fx.clipId, 'clip-1', 'clipId correct');
    assertEquals(fx.sourceEventId, 'ev-launch', 'sourceEventId correct');
    assertEquals(fx.actionId, 'act-1', 'actionId correct');
    assertEquals(fx.actorId, 'char-a', 'actorId correct');
    assertEquals(fx.targetId, 'char-b', 'targetId correct');
    assertEquals(fx.progress, 0.5, 'progress = 50/100 = 0.5');

    assert(typeof fx.id === 'string' && fx.id.startsWith('fx-'), 'effect id starts with fx-');
  }

  console.log('\n[4b] effect payload deep equals clip payload (cloned)');
  {
    const frame = buildPlaybackFrame(timeline, 50);
    const fx = frame.effects[0];
    // payload is deep-cloned, but values match original
    assertEquals(fx.payload.projectileId, 'proj-1', 'payload.projectileId');
    assertEquals(fx.payload.basePower, 100, 'payload.basePower');
    assertEquals(fx.payload.path.length, 2, 'payload.path length');
    // payload is a clone, not the same reference
    assert(fx.payload !== clip.payload, 'effect payload is a clone (different reference)');
  }
}

// ═══════════════════════════════════════════
// Test 5: time clamp
// ═══════════════════════════════════════════

console.log('\n=== Test 5: time clamp ===');

{
  const clip = makeClip({ id: 'clip-1', startMs: 0, durationMs: 100 });
  const timeline = makeTimeline({ durationMs: 100, clips: [clip] });

  console.log('\n[5a] timeMs < 0 clamped to 0');
  {
    const frame = buildPlaybackFrame(timeline, -50);
    assertEquals(frame.timeMs, 0, 'negative time clamped to 0');
    assertEquals(frame.activeClipIds.length, 1, 'clip active at clamped time 0');
  }

  console.log('\n[5b] timeMs > duration clamped to duration');
  {
    const frame = buildPlaybackFrame(timeline, 999);
    assertEquals(frame.timeMs, 100, 'time > duration clamped to durationMs');
    assertEquals(frame.activeClipIds.length, 0, 'no clip active at duration (exclusive end)');
  }

  console.log('\n[5c] empty timeline handles any timeMs');
  {
    const emptyTL = makeTimeline({ durationMs: 0, clips: [] });
    const frame = buildPlaybackFrame(emptyTL, 500);
    assertEquals(frame.timeMs, 0, 'empty timeline clamps to 0');
    assertEquals(frame.durationMs, 0, 'durationMs = 0');
    assertEquals(frame.activeClipIds.length, 0, 'no active clips');
    assertEquals(frame.activeActionIds.length, 0, 'no active actionIds');
    assertEquals(frame.effects.length, 0, 'no effects');
  }
}

// ═══════════════════════════════════════════
// Test 6: immutability
// ═══════════════════════════════════════════

console.log('\n=== Test 6: immutability ===');

{
  const payload = { projectileId: 'proj-1', nested: { val: 42 } };
  const clip = makeClip({ id: 'clip-1', payload, startMs: 0, durationMs: 100 });
  const timeline = makeTimeline({ durationMs: 100, clips: [clip] });

  console.log('\n[6a] mutating frame.activeClips[0].payload does not mutate original');
  {
    const frame = buildPlaybackFrame(timeline, 50);
    frame.activeClips[0].payload.projectileId = 'mutated';
    frame.activeClips[0].payload.nested.val = 999;
    assertEquals(timeline.clips[0].payload.projectileId, 'proj-1', 'original clip.payload.projectileId unchanged');
    assertEquals(timeline.clips[0].payload.nested.val, 42, 'original nested val unchanged');
  }

  console.log('\n[6b] mutating frame.effects[0].payload does not mutate original');
  {
    const frame2 = buildPlaybackFrame(timeline, 50);
    frame2.effects[0].payload.projectileId = 'mutated-2';
    assertEquals(timeline.clips[0].payload.projectileId, 'proj-1', 'original clip.payload unchanged via effects');
  }

  console.log('\n[6c] mutating activeActionIds array does not affect re-build');
  {
    const frame3 = buildPlaybackFrame(timeline, 50);
    frame3.activeActionIds.push('injected');
    frame3.activeClipIds.push('injected-clip');
    const frame4 = buildPlaybackFrame(timeline, 50);
    assertEquals(frame4.activeActionIds.length, 1, 'activeActionIds clean on re-build');
    assertEquals(frame4.activeClipIds.length, 1, 'activeClipIds clean on re-build');
  }

  console.log('\n[6d] original timeline not mutated by buildPlaybackFrame');
  {
    const tlClone = JSON.parse(JSON.stringify(timeline));
    buildPlaybackFrame(timeline, 50);
    assertDeepEquals(timeline, tlClone, 'timeline unchanged after buildPlaybackFrame');
  }
}

// ═══════════════════════════════════════════
// Test 7: boundary source scan
// ═══════════════════════════════════════════

console.log('\n=== Test 7: boundary source scan ===');

{
  const filePath = path.resolve('playback/PresentationTimelinePlayback.js');
  const src = fs.readFileSync(filePath, 'utf-8');

  const FORBIDDEN = [
    'window',
    'document',
    'canvas',
    'BattleCanvasRenderer',
    'BattleSessionController',
    'GameEngine',
    'renderAll',
    'keyframes',
    'animEvents',
    'Date.now()',
    'Math.random()',
  ];

  console.log('\n[7a] no forbidden imports');
  const importLines = src.split('\n').filter(l => l.trimStart().startsWith('import'));
  const forbiddenModules = ['BattleCanvasRenderer', 'BattleSessionController', 'GameEngine'];
  for (const line of importLines) {
    for (const term of forbiddenModules) {
      assert(!line.includes(term), `no import of "${term}"`);
    }
  }

  console.log('\n[7b] no forbidden globals in source');
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const term of FORBIDDEN) {
    assert(!noComments.includes(term), `no "${term}" in source`);
  }

  console.log('\n[7c] only imports from PlaybackFrame.js and BattleScene.js');
  for (const line of importLines) {
    const isOK = line.includes('./PlaybackFrame.js') ||
                 line.includes('../presentation/BattleScene.js');
    assert(isOK, `legal import only: ${line.trim()}`);
  }
}

// ═══════════════════════════════════════════
// Test 8: deterministic output
// ═══════════════════════════════════════════

console.log('\n=== Test 8: deterministic output ===');

{
  const clip = makeClip();
  const timeline = makeTimeline({ durationMs: 100, clips: [clip] });

  console.log('\n[8a] same input → same output');
  const f1 = buildPlaybackFrame(timeline, 50);
  const f2 = buildPlaybackFrame(timeline, 50);
  assertEquals(JSON.stringify(f1), JSON.stringify(f2), 'identical output for same input');

  console.log('\n[8b] class-based API also deterministic');
  const playback = new PresentationTimelinePlayback(timeline);
  const f3 = playback.seek(50).getFrame();
  const f4 = playback.seek(50).getFrame();
  assertEquals(JSON.stringify(f3), JSON.stringify(f4), 'class API deterministic');

  console.log('\n[8c] class API matches function API');
  assertEquals(JSON.stringify(f1), JSON.stringify(f3), 'class === function output');
}

// ═══════════════════════════════════════════
// Test 9: class API lifecycle
// ═══════════════════════════════════════════

console.log('\n=== Test 9: class API lifecycle ===');

{
  const clipA = makeClip({ id: 'clip-a', startMs: 0, durationMs: 100 });
  const clipB = makeClip({ id: 'clip-b', startMs: 100, durationMs: 100, actionId: 'act-2' });
  const timeline = makeTimeline({ durationMs: 200, clips: [clipA, clipB] });

  console.log('\n[9a] seek and getFrame');
  const playback = new PresentationTimelinePlayback(timeline);
  assertEquals(playback.getCurrentTime(), 0, 'initial time is 0');
  assertEquals(playback.getDuration(), 200, 'duration is 200');

  playback.seek(50);
  assertEquals(playback.getCurrentTime(), 50, 'seek to 50');
  const frame50 = playback.getFrame();
  assertEquals(frame50.timeMs, 50, 'frame at 50');
  assertEquals(frame50.activeClipIds.length, 1, '1 active clip at 50');

  console.log('\n[9b] seek to end');
  playback.seek(200);
  const frame200 = playback.getFrame();
  assertEquals(frame200.timeMs, 200, 'frame at duration');
  assertEquals(frame200.activeClipIds.length, 0, '0 active clips at duration');

  console.log('\n[9c] seek beyond duration clamps');
  playback.seek(9999);
  const frameClamped = playback.getFrame();
  assertEquals(frameClamped.timeMs, 200, 'time clamped to duration');
  assertEquals(frameClamped.activeClipIds.length, 0, '0 active clips at clamped max');

  console.log('\n[9d] empty timeline in constructor');
  const emptyPlayback = new PresentationTimelinePlayback(null);
  assertEquals(emptyPlayback.getDuration(), 0, 'null timeline → duration 0');
  const emptyFrame = emptyPlayback.getFrame();
  assertEquals(emptyFrame.timeMs, 0, 'empty playback frame time 0');
  assertEquals(emptyFrame.activeClipIds.length, 0, 'empty: no active clips');
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
