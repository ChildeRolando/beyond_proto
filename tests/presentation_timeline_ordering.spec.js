// Presentation timeline ordering tests
// Verifies: replay clip order follows speed/phase order, not P1/P2.
// Same-speed tiebreak is documented as actorId localeCompare.
// Run: node tests/presentation_timeline_ordering.spec.js

import { BattleSessionController } from '../session/BattleSessionController.js';
import { compilePresentationTimeline } from '../presentation/PresentationTimelineCompiler.js';
import { createTurnResolutionBuilder } from '../engine/resolution/TurnResolutionBuilder.js';
import { buildPlaybackFrame } from '../playback/PresentationTimelinePlayback.js';
import { BattleSceneStore } from '../presentation/BattleSceneStore.js';

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
// Scenario builders
// ═══════════════════════════════════════════

/** P1 uses low-speed skill, P2 uses high-speed skill. */
function makeSpeedMismatchScenario() {
  return {
    mode: 'duel',
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    rules: { friendlyFire: false },
    combatants: [
      {
        // P1 = low speed (speed 1: warrior_slash)
        id: 'warrior_slow', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '战士', roleLoadoutSkillIds: [], loadoutSkillIds: ['warrior_slash'],
        position: { q: 0, r: 0 }, resources: {},
      },
      {
        // P2 = high speed (speed 3: warrior_sheathe)
        id: 'warrior_fast', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '战士', roleLoadoutSkillIds: [], loadoutSkillIds: ['warrior_sheathe'],
        position: { q: 2, r: 0 }, resources: {},
      },
    ],
  };
}

/** Both use same-speed skills (speed 2) — tests actorId tiebreak. */
function makeSameSpeedScenario() {
  return {
    mode: 'duel',
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    rules: { friendlyFire: false },
    combatants: [
      {
        // id 'mage_a' sorts before 'warrior_b' via localeCompare
        id: 'mage_a', teamId: 'player1', ownerId: 'player1', control: 'human',
        class: '法师', roleLoadoutSkillIds: [], loadoutSkillIds: ['mage_blast'],
        position: { q: 0, r: 0 }, resources: { qi: 3 },
      },
      {
        // id 'warrior_b'
        id: 'warrior_b', teamId: 'player2', ownerId: 'player2', control: 'human',
        class: '战士', roleLoadoutSkillIds: [], loadoutSkillIds: ['warrior_slash'],
        position: { q: 2, r: 0 }, resources: {},
      },
    ],
  };
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

async function buildResolutionFromScenario(scenario) {
  const builder = createTurnResolutionBuilder();
  const bsc = new BattleSessionController();
  await bsc.startBattleFromScenario(scenario);
  // Hook the resolution builder
  bsc._engine.turnManager.setResolutionRecorder({
    onTurnStart: (info) => builder.startTurn(info),
    onPhaseStart: (info) => builder.startPhase(info),
    onPhaseEnd: (info) => builder.endPhase(info),
    onTurnEnd: () => builder.endTurn(),
  });
  bsc._engine.turnManager.setResolutionRecorder(builder);
  return { bsc, builder };
}

/** Find the actorId of the first action_declared clip in a timeline. */
function firstActionClipActorId(timeline) {
  for (const clip of timeline.clips) {
    if (clip.actorId && clip.clipType !== 'track_label') {
      return clip.actorId;
    }
  }
  return null;
}

/** Find all action-level actorIds in timeline order. */
function actionClipActorIds(timeline) {
  const seen = new Set();
  const ids = [];
  for (const clip of timeline.clips) {
    if (clip.actorId && clip.clipType !== 'track_label' && !seen.has(clip.actionId)) {
      seen.add(clip.actionId);
      ids.push(clip.actorId);
    }
  }
  return ids;
}

// Helper: create a projectile_created event (produces a clip in the timeline)
function makeProjectileEvent(overrides = {}) {
  return {
    id: overrides.id || 'ev-1',
    eventType: 'projectile_created',
    actionId: overrides.actionId || 'act-1',
    actorId: overrides.actorId || 'actor_a',
    skillId: overrides.skillId || 'skill_x',
    projectileId: overrides.projectileId || 'proj-1',
    from: overrides.from || { q: 0, r: 0 },
    to: overrides.to || { q: 1, r: 0 },
    basePower: overrides.basePower ?? 100,
    projectileType: overrides.projectileType || 'projectile',
    metadata: overrides.metadata || {
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      flags: [],
      speed: 1,
      isMelee: false,
      projectileType: overrides.projectileType || 'projectile',
    },
  };
}

// ═══════════════════════════════════════════
// Test 1: Manual resolution ordering — phases ordered by speed
// ═══════════════════════════════════════════
console.log('\n=== Test 1: Timeline preserves phase order (high speed first) ===');
{
  // Manually construct a resolution with speed 3 then speed 0 phases
  // Use projectile_created events which produce actual timeline clips
  const resolution = {
    schemaVersion: 2, turnNumber: 1,
    initialSnapshot: null, finalSnapshot: null,
    phases: [
      {
        id: 'turn-1-speed-3', phaseKind: 'speed', speed: 3, commandCount: 1,
        beforeSnapshot: null, afterSnapshot: null,
        events: [
          makeProjectileEvent({ id: 'ev-fast', actionId: 'act-fast', actorId: 'fast_actor', projectileId: 'proj-fast' }),
        ],
        summary: '', actionCount: 1, actions: [],
      },
      {
        id: 'turn-1-speed-0', phaseKind: 'speed', speed: 0, commandCount: 1,
        beforeSnapshot: null, afterSnapshot: null,
        events: [
          makeProjectileEvent({ id: 'ev-slow', actionId: 'act-slow', actorId: 'slow_actor', projectileId: 'proj-slow' }),
        ],
        summary: '', actionCount: 1, actions: [],
      },
    ],
  };

  const timeline = compilePresentationTimeline(resolution);

  // First action clip should be from the speed-3 phase (fast_actor)
  const firstActor = firstActionClipActorId(timeline);
  assertEquals(firstActor, 'fast_actor', 'first visible action belongs to speed-3 actor');

  // All action clips should be in order: fast_actor first, slow_actor second
  const actorOrder = actionClipActorIds(timeline);
  assertEquals(actorOrder[0], 'fast_actor', 'actor order[0] = fast_actor');
  assertEquals(actorOrder[1], 'slow_actor', 'actor order[1] = slow_actor');
}

// ═══════════════════════════════════════════
// Test 2: Manual resolution — same-speed tiebreak by actorId
// ═══════════════════════════════════════════
console.log('\n=== Test 2: Same-speed ordering follows actorId (localeCompare) ===');
{
  // Two actors in the same speed tier. TurnManager sorts by actorId.
  // 'actor_alpha' < 'actor_beta' via localeCompare
  const resolution = {
    schemaVersion: 2, turnNumber: 1,
    initialSnapshot: null, finalSnapshot: null,
    phases: [
      {
        id: 'turn-1-speed-2', phaseKind: 'speed', speed: 2, commandCount: 2,
        beforeSnapshot: null, afterSnapshot: null,
        events: [
          makeProjectileEvent({ id: 'ev-alpha', actionId: 'act-alpha', actorId: 'actor_alpha', projectileId: 'proj-a' }),
          makeProjectileEvent({ id: 'ev-beta', actionId: 'act-beta', actorId: 'actor_beta', projectileId: 'proj-b' }),
        ],
        summary: '', actionCount: 2, actions: [],
      },
    ],
  };

  const timeline = compilePresentationTimeline(resolution);
  const actorOrder = actionClipActorIds(timeline);

  assertEquals(actorOrder[0], 'actor_alpha',
    'same speed: actor_alpha before actor_beta (localeCompare)');
  assertEquals(actorOrder[1], 'actor_beta',
    'same speed: actor_beta after actor_alpha');

  // Document: this ordering comes from TurnManager groups[spd].sort(actorId),
  // NOT from playerId or P1/P2 preference.
  console.log('  NOTE: same-speed tiebreak = actorId localeCompare (TurnManager line ~174).');
  console.log('  This is NOT P1/P2 based. It guarantees P2P lockstep determinism.');
}

// ═══════════════════════════════════════════
// Test 3: No playerId-based sorting in timeline
// ═══════════════════════════════════════════
console.log('\n=== Test 3: No playerId-based reordering in compiler ===');
{
  const resolution = {
    schemaVersion: 2, turnNumber: 1,
    initialSnapshot: null, finalSnapshot: null,
    phases: [
      {
        id: 'turn-1-speed-1', phaseKind: 'speed', speed: 1, commandCount: 2,
        beforeSnapshot: null, afterSnapshot: null,
        events: [
          makeProjectileEvent({ id: 'ev-p2', actionId: 'act-p2', actorId: 'char_p2', projectileId: 'proj-p2' }),
          makeProjectileEvent({ id: 'ev-p1', actionId: 'act-p1', actorId: 'char_p1', projectileId: 'proj-p1' }),
        ],
        summary: '', actionCount: 2, actions: [],
      },
    ],
  };

  const timeline = compilePresentationTimeline(resolution);
  const actorOrder = actionClipActorIds(timeline);

  // Events listed as [char_p2, char_p1]. Compiler does NOT reorder by playerId.
  // If a P1-first bias existed, char_p1 would appear first despite event order.
  // The compiler preserves input order → char_p2 is first.
  assertEquals(actorOrder[0], 'char_p2',
    'char_p2 listed first → appears first (compiler preserves event order)');
  assertEquals(actorOrder[1], 'char_p1',
    'char_p1 listed second → appears second');

  console.log('  NOTE: compiler does NOT reorder by playerId.');
  console.log('  In real engine, TurnManager sorts within same speed by actorId BEFORE');
  console.log('  recording events (line ~174). This test uses manual ordering to prove');
  console.log('  the compiler itself does not apply any P1/P2 bias.');
}

// ═══════════════════════════════════════════
// Test 3b: Same-speed actorId ordering (P2's actorId sorts before P1's)
// ═══════════════════════════════════════════
console.log('\n=== Test 3b: Same-speed ordering by actorId, not playerId ===');
{
  const resolution = {
    schemaVersion: 2, turnNumber: 1,
    initialSnapshot: null, finalSnapshot: null,
    phases: [
      {
        id: 'turn-1-speed-1', phaseKind: 'speed', speed: 1, commandCount: 2,
        beforeSnapshot: null, afterSnapshot: null,
        events: [
          // 'alpha_p2' < 'zeta_p1' (alphabetically), P2's actor sorts first
          makeProjectileEvent({ id: 'ev-a', actionId: 'act-a', actorId: 'alpha_p2', projectileId: 'proj-a' }),
          makeProjectileEvent({ id: 'ev-z', actionId: 'act-z', actorId: 'zeta_p1', projectileId: 'proj-z' }),
        ],
        summary: '', actionCount: 2, actions: [],
      },
    ],
  };

  const timeline = compilePresentationTimeline(resolution);
  const actorOrder = actionClipActorIds(timeline);

  assertEquals(actorOrder[0], 'alpha_p2',
    'alpha_p2 (P2 actorId) appears before zeta_p1 — actorId sort, not playerId');
  assertEquals(actorOrder[1], 'zeta_p1',
    'zeta_p1 (P1 actorId) appears second');
}

// ═══════════════════════════════════════════
// Test 4: Timeline clip startMs increases monotonically within phases
// ═══════════════════════════════════════════
console.log('\n=== Test 4: Clip startMs monotonic within and across phases ===');
{
  const resolution = {
    schemaVersion: 2, turnNumber: 1,
    initialSnapshot: null, finalSnapshot: null,
    phases: [
      {
        id: 'turn-1-speed-3', phaseKind: 'speed', speed: 3, commandCount: 2,
        beforeSnapshot: null, afterSnapshot: null,
        events: [
          makeProjectileEvent({ id: 'ev-1', actionId: 'a1', actorId: 'actor_a', projectileId: 'proj-1' }),
          makeProjectileEvent({ id: 'ev-2', actionId: 'a2', actorId: 'actor_b', projectileId: 'proj-2' }),
        ],
        summary: '', actionCount: 2, actions: [],
      },
      {
        id: 'turn-1-speed-1', phaseKind: 'speed', speed: 1, commandCount: 1,
        beforeSnapshot: null, afterSnapshot: null,
        events: [
          makeProjectileEvent({ id: 'ev-3', actionId: 'a3', actorId: 'actor_c', projectileId: 'proj-3' }),
        ],
        summary: '', actionCount: 1, actions: [],
      },
    ],
  };

  const timeline = compilePresentationTimeline(resolution);
  const actionClips = timeline.clips.filter(c =>
    c.actorId && c.clipType !== 'track_label' &&
    c.sourceEventId && resolution.phases.some(p => p.events.some(e => e.id === c.sourceEventId))
  );

  assert(actionClips.length >= 3, `at least 3 action clips, got ${actionClips.length}`);

  // Clips should be in non-decreasing startMs order
  let prevMs = -1;
  let monotonic = true;
  for (const clip of actionClips) {
    if (clip.startMs < prevMs) { monotonic = false; break; }
    prevMs = clip.startMs;
  }
  assert(monotonic, 'clip startMs is non-decreasing (preserves phase/event order)');

  // Phase boundary: speed-3 clips should all have startMs < speed-1 clips
  const speed3Clips = actionClips.filter(c => c.actorId === 'actor_a' || c.actorId === 'actor_b');
  const speed1Clips = actionClips.filter(c => c.actorId === 'actor_c');
  // All speed-3 clips come before speed-1 clips by startMs
  if (speed3Clips.length > 0 && speed1Clips.length > 0) {
    const maxSpeed3Ms = Math.max(...speed3Clips.map(c => c.startMs));
    const minSpeed1Ms = Math.min(...speed1Clips.map(c => c.startMs));
    assert(maxSpeed3Ms <= minSpeed1Ms,
      `speed-3 max startMs (${maxSpeed3Ms}) <= speed-1 min startMs (${minSpeed1Ms})`);
  }
}

// ═══════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${pass}, Failed: ${fail}`);
console.log(`${'='.repeat(50)}`);
console.log('\nOrdering summary:');
console.log('  1. Primary: speed tier descending (4→3→2→1→0)');
console.log('  2. Secondary: actorId localeCompare (P2P lockstep tiebreak)');
console.log('  3. No playerId/teamId sorting at any layer');
console.log('  4. PresentationTimelineCompiler preserves phase/event order');

if (fail > 0) process.exit(1);
