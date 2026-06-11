// Unit tests for BattleSceneStore
// Run: node tests/battle_scene_store.spec.js
//
// Milestone 3 / Task 3.2

import { BattleSceneStore, createBattleSceneFromState } from '../presentation/BattleSceneStore.js';
import { createBattleScene, isBattleScene } from '../presentation/BattleScene.js';
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
// Helpers: build minimal fixtures
// ═══════════════════════════════════════════

function makeBaseState(overrides = {}) {
  return {
    turn: overrides.turn ?? 1,
    phase: overrides.phase ?? 'RESOLVE',
    teams: overrides.teams || [
      { id: 'team-a', name: 'Alpha', ownerId: 'p1' },
    ],
    rules: overrides.rules || { maxTurns: 99 },
    entities: overrides.entities || [
      { id: 'char-1', type: 'CHARACTER', name: 'Warrior', position: { q: 0, r: 0 } },
      { id: 'char-2', type: 'CHARACTER', name: 'Mage', position: { q: 2, r: 0 } },
    ],
    characters: overrides.characters || [
      { id: 'char-1', name: 'Warrior', position: { q: 0, r: 0 }, hp: 100 },
      { id: 'char-2', name: 'Mage', position: { q: 2, r: 0 }, hp: 80 },
    ],
    projectiles: overrides.projectiles || [
      { id: 'proj-1', position: { q: 1, r: 0 }, ownerId: 'char-1' },
    ],
    casings: overrides.casings || [],
    wildBullets: overrides.wildBullets || [],
    logs: overrides.logs || [
      { text: 'Warrior attacks', turn: 1 },
    ],
  };
}

function makePlaybackFrame(overrides = {}) {
  return {
    mode: 'playback',
    timeMs: overrides.timeMs ?? 500,
    durationMs: overrides.durationMs ?? 2000,
    phaseId: overrides.phaseId || 'turn-1-speed-3',
    activeActionIds: overrides.activeActionIds || ['act-1'],
    sceneState: overrides.sceneState || null,
    effects: overrides.effects || [
      { id: 'fx-1', type: 'hit_flash', targetId: 'char-2' },
    ],
  };
}

// ═══════════════════════════════════════════
// Test 1: live scene from baseState
// ═══════════════════════════════════════════

console.log('\n=== Test 1: live scene from baseState ===');

{
  const baseState = makeBaseState();
  const store = new BattleSceneStore(baseState);
  const scene = store.getScene();

  console.log('\n[1a] mode is live');
  assertEquals(scene.mode, 'live', 'mode === live');

  console.log('\n[1b] state fields preserved');
  assertEquals(scene.turn, 1, 'turn === 1');
  assertEquals(scene.phase, 'RESOLVE', 'phase preserved');
  assertEquals(scene.characters.length, 2, '2 characters');
  assertEquals(scene.characters[0].name, 'Warrior', 'character name');
  assertEquals(scene.characters[1].name, 'Mage', 'second character');
  assertEquals(scene.projectiles.length, 1, '1 projectile');
  assertEquals(scene.projectiles[0].id, 'proj-1', 'projectile id');
  assertEquals(scene.logs.length, 1, '1 log entry');

  console.log('\n[1c] casings and wildBullets');
  assert(Array.isArray(scene.casings), 'casings is array');
  assert(Array.isArray(scene.wildBullets), 'wildBullets is array');

  console.log('\n[1d] playback is null in live mode');
  assertEquals(scene.playback, null, 'playback is null in live mode');

  console.log('\n[1e] teams and rules');
  assertEquals(scene.teams.length, 1, '1 team');
  assert(scene.rules !== null, 'rules present');

  console.log('\n[1f] effects is empty array');
  assert(Array.isArray(scene.effects), 'effects is array');
  assertEquals(scene.effects.length, 0, 'effects empty by default');

  console.log('\n[1g] interaction has safe defaults');
  assert(Array.isArray(scene.interaction.hoverEffectArea), 'hoverEffectArea is array');
  assertEquals(scene.interaction.hoveredHex, null, 'hoveredHex null by default');
  assertEquals(scene.interaction.selectedCharacterId, null, 'selectedCharacterId null');
}

// ═══════════════════════════════════════════
// Test 2: playback scene from playbackFrame
// ═══════════════════════════════════════════

console.log('\n=== Test 2: playback scene from playbackFrame ===');

{
  const baseState = makeBaseState();
  const playbackFrame = makePlaybackFrame();
  const store = new BattleSceneStore(baseState);
  store.setPlaybackFrame(playbackFrame);
  const scene = store.getScene();

  console.log('\n[2a] mode is playback');
  assertEquals(scene.mode, 'playback', 'mode === playback when playbackFrame is set');

  console.log('\n[2b] playback fields');
  assert(scene.playback !== null, 'playback is not null');
  assertEquals(scene.playback.timeMs, 500, 'playback.timeMs === 500');
  assertEquals(scene.playback.durationMs, 2000, 'playback.durationMs === 2000');
  assertEquals(scene.playback.phaseId, 'turn-1-speed-3', 'playback.phaseId');
  assert(Array.isArray(scene.playback.activeActionIds), 'activeActionIds is array');

  console.log('\n[2c] effects from playbackFrame.effects');
  assertEquals(scene.effects.length, 1, '1 effect from playbackFrame');
  assertEquals(scene.effects[0].id, 'fx-1', 'effect id');
  assertEquals(scene.effects[0].targetId, 'char-2', 'effect targetId');

  console.log('\n[2d] state still preserved in playback mode');
  assertEquals(scene.characters.length, 2, '2 characters in playback');
  assertEquals(scene.turn, 1, 'turn preserved');

  console.log('\n[2e] clearing playbackFrame reverts to live');
  store.setPlaybackFrame(null);
  const scene2 = store.getScene();
  assertEquals(scene2.mode, 'live', 'back to live after clearing playbackFrame');
  assertEquals(scene2.playback, null, 'playback is null again');
}

// ═══════════════════════════════════════════
// Test 3: interaction state preserved
// ═══════════════════════════════════════════

console.log('\n=== Test 3: interaction state preserved ===');

{
  const store = new BattleSceneStore(makeBaseState());
  const interaction = {
    hoverEffectArea: [{ q: 1, r: 0 }],
    validTargets: ['char-2'],
    hoveredHex: { q: 2, r: 0 },
    localSubmittedCharacterIds: ['char-1'],
    remoteSubmittedCharacterIds: [],
    selectedCharacterId: 'char-1',
    lastHoveredCharacterId: 'char-2',
    customField: 'extra',
  };
  store.setInteraction(interaction);
  const scene = store.getScene();

  console.log('\n[3a] interaction fields preserved');
  assertEquals(scene.interaction.hoverEffectArea.length, 1, 'hoverEffectArea length');
  assertDeepEquals(scene.interaction.hoverEffectArea[0], { q: 1, r: 0 }, 'hoverEffectArea[0]');
  assertEquals(scene.interaction.validTargets.length, 1, 'validTargets length');
  assertEquals(scene.interaction.validTargets[0], 'char-2', 'validTargets[0]');
  assertDeepEquals(scene.interaction.hoveredHex, { q: 2, r: 0 }, 'hoveredHex');

  console.log('\n[3b] character selection');
  assertEquals(scene.interaction.selectedCharacterId, 'char-1', 'selectedCharacterId');
  assertEquals(scene.interaction.lastHoveredCharacterId, 'char-2', 'lastHoveredCharacterId');

  console.log('\n[3c] submission tracking');
  assertEquals(scene.interaction.localSubmittedCharacterIds.length, 1, 'local submitted');
  assertEquals(scene.interaction.remoteSubmittedCharacterIds.length, 0, 'remote submitted');

  console.log('\n[3d] extra fields pass through (spread)');
  assertEquals(scene.interaction.customField, 'extra', 'custom field preserved via spread');
}

// ═══════════════════════════════════════════
// Test 4: immutability (deep isolation)
// ═══════════════════════════════════════════

console.log('\n=== Test 4: immutability ===');

{
  const baseState = makeBaseState();
  const interaction = { selectedCharacterId: 'char-1', hoveredHex: { q: 1, r: 1 } };
  const effects = [{ id: 'fx-a', type: 'flash' }];
  const playbackFrame = makePlaybackFrame();

  const store = new BattleSceneStore(baseState);
  store.setInteraction(interaction);
  store.setEffects(effects);
  store.setPlaybackFrame(playbackFrame);

  // ── A: returned scene mutation does not pollute store ──

  console.log('\n[4a] scene.characters deep mutation isolated');
  const scene1 = store.getScene();
  assertEquals(scene1.characters[0].hp, 100, 'initial hp');
  assertEquals(scene1.characters.length, 2, 'initial character count');
  scene1.characters[0].hp = 999;
  scene1.characters.push({ id: 'fake', name: 'Injected' });

  const scene2 = store.getScene();
  assertEquals(scene2.characters[0].hp, 100, 'hp unchanged after scene mutation');
  assertEquals(scene2.characters.length, 2, 'character count unchanged (no injected)');

  console.log('\n[4b] scene.projectiles deep mutation isolated');
  assertEquals(scene1.projectiles[0].id, 'proj-1', 'initial projectile id');
  scene1.projectiles[0].id = 'mutated-proj';
  assertEquals(scene2.projectiles[0].id, 'proj-1', 'projectile id unchanged');

  console.log('\n[4c] scene.logs deep mutation isolated');
  assertEquals(scene1.logs[0].text, 'Warrior attacks', 'initial log text');
  scene1.logs[0].text = 'mutated-log';
  assertEquals(scene2.logs[0].text, 'Warrior attacks', 'log text unchanged');

  // ── B: original input object not mutated ──

  console.log('\n[4d] original baseState not mutated');
  const scene3 = store.getScene();
  scene3.characters[0].hp = 777;
  scene3.projectiles[0].id = 'bad-proj';
  scene3.logs[0].text = 'bad-log';
  assertEquals(baseState.characters[0].hp, 100, 'original character hp unchanged');
  assertEquals(baseState.projectiles[0].id, 'proj-1', 'original projectile id unchanged');
  assertEquals(baseState.logs[0].text, 'Warrior attacks', 'original log text unchanged');

  // ── C: external baseState mutation after setBaseState does not pollute store ──

  console.log('\n[4e] external mutation after setBaseState isolated');
  const freshState = makeBaseState({ turn: 5 });
  store.setBaseState(freshState);
  // Mutate the original object AFTER passing it to the store
  freshState.characters[0].hp = 12345;
  freshState.characters.push({ id: 'injected-late', name: 'Late' });
  const scene4 = store.getScene();
  assertEquals(scene4.characters[0].hp, 100, 'hp NOT 12345 — store cloned on input');
  assertEquals(scene4.characters.length, 2, 'no late-injected character');
  assertEquals(scene4.turn, 5, 'turn still captured');

  // ── D: nested interaction / effects / playback mutation ──

  console.log('\n[4f] nested interaction mutation isolated');
  const scene5 = store.getScene();
  scene5.interaction.hoveredHex.q = 99;
  scene5.interaction.selectedCharacterId = 'mutated';
  const scene6 = store.getScene();
  assertEquals(scene6.interaction.hoveredHex.q, 1, 'hoveredHex.q unchanged');
  assertEquals(scene6.interaction.selectedCharacterId, 'char-1', 'selectedCharacterId unchanged');

  console.log('\n[4g] nested playbackFrame.effects mutation isolated');
  // playbackFrame is still active, so effects come from playbackFrame.effects
  scene5.effects[0].id = 'mutated-effect';
  const scene7 = store.getScene();
  assertEquals(scene7.effects[0].id, 'fx-1', 'effect id unchanged (from playbackFrame.effects)');

  console.log('\n[4g2] explicit effects also isolated (no playbackFrame)');
  store.setPlaybackFrame(null);
  store.setEffects([{ id: 'explicit-fx', val: 42 }]);
  const sExplicit1 = store.getScene();
  sExplicit1.effects[0].id = 'mutated-explicit';
  const sExplicit2 = store.getScene();
  assertEquals(sExplicit2.effects[0].id, 'explicit-fx', 'explicit effect id unchanged');
  assertEquals(sExplicit2.effects[0].val, 42, 'explicit effect val unchanged');
  // Restore playbackFrame for subsequent tests
  store.setPlaybackFrame(playbackFrame);

  console.log('\n[4h] nested playback mutation isolated');
  store.setPlaybackFrame(playbackFrame);
  const scene8 = store.getScene();
  scene8.playback.activeActionIds.push('fake-action');
  scene8.playback.timeMs = 9999;
  const scene9 = store.getScene();
  assertEquals(scene9.playback.activeActionIds.length, 1, 'activeActionIds unchanged');
  assertEquals(scene9.playback.timeMs, 500, 'playback.timeMs unchanged');

  console.log('\n[4i] original interaction/effects/playback not mutated');
  assertEquals(interaction.selectedCharacterId, 'char-1', 'original interaction unchanged');
  assertEquals(interaction.hoveredHex.q, 1, 'original hoveredHex.q unchanged');
  assertEquals(effects[0].id, 'fx-a', 'original effects unchanged');
  assertEquals(playbackFrame.timeMs, 500, 'original playbackFrame unchanged');
  assert(playbackFrame.activeActionIds.length === 1, 'original activeActionIds unchanged');

  console.log('\n[4j] getScene returns fresh objects');
  const s1 = store.getScene();
  const s2 = store.getScene();
  assert(s1 !== s2, 'getScene returns new object each time');
  assert(s1.interaction !== s2.interaction, 'interaction is new object');
  assert(s1.effects !== s2.effects, 'effects is new array');
  assert(s1.playback !== s2.playback, 'playback is new object');
  assert(s1.characters !== s2.characters, 'characters is new array');
}

// ═══════════════════════════════════════════
// Test 5: does not expose old animation fields
// ═══════════════════════════════════════════

console.log('\n=== Test 5: does not expose old animation fields ===');

{
  const baseState = makeBaseState();
  // baseState is clean (engine no longer produces keyframes/animEvents).
  // Verify the store does not ADD these fields.

  const store = new BattleSceneStore(baseState);
  const scene = store.getScene();

  console.log('\n[5a] scene does not have keyframes');
  assertEquals(scene.keyframes, undefined, 'no keyframes on scene');

  console.log('\n[5b] scene does not have animEvents');
  assertEquals(scene.animEvents, undefined, 'no animEvents on scene');

  console.log('\n[5c] projectile payload does not add keyframes');
  for (const proj of scene.projectiles) {
    assertEquals(proj.keyframes, undefined, `projectile ${proj.id} has no keyframes`);
  }

  console.log('\n[5d] projectile payload does not add animEvents');
  for (const proj of scene.projectiles) {
    assertEquals(proj.animEvents, undefined, `projectile ${proj.id} has no animEvents`);
  }

  console.log('\n[5e] scene has legitimate fields only');
  const allowedFields = ['mode', 'turn', 'phase', 'teams', 'rules', 'entities', 'characters', 'projectiles', 'casings', 'wildBullets', 'logs', 'interaction', 'effects', 'playback'];
  for (const key of Object.keys(scene)) {
    assert(allowedFields.includes(key), `field "${key}" is in allowed set`);
  }
}

// ═══════════════════════════════════════════
// Test 6: pure boundary source scan
// ═══════════════════════════════════════════

console.log('\n=== Test 6: pure boundary source scan ===');

{
  const storePath = path.resolve('presentation/BattleSceneStore.js');
  const src = fs.readFileSync(storePath, 'utf-8');

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

  console.log('\n[6a] BattleSceneStore.js does not import forbidden modules');
  // Check imports
  const importLines = src.split('\n').filter(l => l.startsWith('import'));
  for (const line of importLines) {
    for (const term of ['BattleCanvasRenderer', 'BattleSessionController', 'GameEngine']) {
      assert(!line.includes(term), `no import of "${term}"`);
    }
  }

  console.log('\n[6b] BattleSceneStore.js does not reference forbidden globals');
  // Remove comments and strings before checking
  const noComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const term of FORBIDDEN) {
    assert(!noComments.includes(term), `no "${term}" in source`);
  }

  console.log('\n[6c] BattleSceneStore.js only imports from BattleScene.js');
  for (const line of importLines) {
    assert(
      line.includes('./BattleScene.js'),
      `import only from BattleScene.js, got: ${line.trim()}`
    );
  }
}

// ═══════════════════════════════════════════
// Test 7: createBattleSceneFromState pure function
// ═══════════════════════════════════════════

console.log('\n=== Test 7: createBattleSceneFromState pure function ===');

{
  const baseState = makeBaseState();
  const interaction = { selectedCharacterId: 'char-1' };
  const playbackFrame = makePlaybackFrame();
  const effects = [{ id: 'fx-1' }];

  console.log('\n[7a] live mode from function');
  const liveScene = createBattleSceneFromState({ baseState, interaction, effects });
  assertEquals(liveScene.mode, 'live', 'live mode without playbackFrame');
  assertEquals(liveScene.effects.length, 1, 'effects from explicit array');

  console.log('\n[7b] playback mode from function');
  const playbackScene = createBattleSceneFromState({ baseState, interaction, playbackFrame, effects });
  assertEquals(playbackScene.mode, 'playback', 'playback mode with playbackFrame');
  // playbackFrame.effects takes priority over explicit effects
  assertEquals(playbackScene.effects.length, 1, 'effects from playbackFrame (1 effect)');
  assertEquals(playbackScene.playback.timeMs, 500, 'playback timeMs');

  console.log('\n[7c] effects priority: playbackFrame.effects > explicit effects');
  // playbackFrame.effects is used when available (1 effect: flash), explicit effects ignored
  assertEquals(playbackScene.effects.length, 1, 'uses playbackFrame.effects, not explicit');
  assertEquals(playbackScene.effects[0].id, 'fx-1', 'effect from playbackFrame');
  assertEquals(playbackScene.effects[0].type, 'hit_flash', 'effect type from playbackFrame');
}

// ═══════════════════════════════════════════
// Test 8: BattleSceneStore reset
// ═══════════════════════════════════════════

console.log('\n=== Test 8: BattleSceneStore reset ===');

{
  const store = new BattleSceneStore(makeBaseState());
  store.setInteraction({ selectedCharacterId: 'char-1' });
  store.setPlaybackFrame(makePlaybackFrame());
  store.setEffects([{ id: 'fx' }]);

  store.reset();
  const scene = store.getScene();

  console.log('\n[8a] reset clears all state');
  assertEquals(scene.mode, 'live', 'mode back to live after reset');
  assertEquals(scene.turn, null, 'turn null after reset');
  assertEquals(scene.characters.length, 0, 'no characters after reset');
  assertEquals(scene.playback, null, 'playback null after reset');
  assertEquals(scene.effects.length, 0, 'no effects after reset');
  assertEquals(scene.interaction.selectedCharacterId, null, 'interaction cleared');
}

// ═══════════════════════════════════════════
// Test 9: isBattleScene type guard
// ═══════════════════════════════════════════

console.log('\n=== Test 9: isBattleScene type guard ===');

{
  const store = new BattleSceneStore(makeBaseState());
  const scene = store.getScene();

  console.log('\n[9a] valid scene passes type guard');
  assert(isBattleScene(scene), 'store.getScene() is valid BattleScene');

  console.log('\n[9b] live scene from function passes');
  const liveScene = createBattleSceneFromState({ baseState: makeBaseState() });
  assert(isBattleScene(liveScene), 'function scene is valid');

  console.log('\n[9c] invalid values rejected');
  assertEquals(isBattleScene(null), false, 'null rejected');
  assertEquals(isBattleScene({}), false, 'empty object rejected');
  assertEquals(isBattleScene(undefined), false, 'undefined rejected');
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
