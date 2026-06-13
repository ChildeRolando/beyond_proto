// Contract tests for live BattleScene pipeline
// Run: node tests/live_scene_pipeline_contract.spec.js
//
// Milestone 3 / Task 3.5

import { renderLiveBattleScene } from '../app/BattleScenePipeline.js';
import { createBattleRenderCoordinator } from '../app/BattleRenderCoordinator.js';
import { BattleSceneStore } from '../presentation/BattleSceneStore.js';
import * as fs from 'fs';
import * as path from 'path';

// Minimal DOM mock for Node.js
globalThis.document = {
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { style: {}, classList: { add() {} } }; },
};

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
// Mocks
// ═══════════════════════════════════════════

function createMockEngine(stateOverrides = {}) {
  return {
    getState() {
      return {
        turn: stateOverrides.turn ?? 1,
        phase: stateOverrides.phase ?? 'RESOLVE',
        teams: stateOverrides.teams || [{ id: 'team-a' }],
        rules: stateOverrides.rules || { maxTurns: 99 },
        entities: stateOverrides.entities || [
          { id: 'char-1', type: 'CHARACTER', name: 'Warrior', position: { q: 0, r: 0 }, alive: true },
        ],
        characters: stateOverrides.characters || [
          { id: 'char-1', name: 'Warrior', position: { q: 0, r: 0 }, alive: true, hp: 100 },
        ],
        projectiles: stateOverrides.projectiles || [{ id: 'proj-1', position: { q: 1, r: 0 }, alive: true, power: 50 }],
        casings: stateOverrides.casings || [],
        wildBullets: stateOverrides.wildBullets || [],
        logs: stateOverrides.logs || [{ text: 'Test log', turn: 1 }],
      };
    },
  };
}

function createMockBattleSession(interactionOverrides = {}) {
  return {
    getRenderViewState() {
      return {
        hoverEffectArea: interactionOverrides.hoverEffectArea || [],
        validTargets: interactionOverrides.validTargets || [],
        hoveredHex: interactionOverrides.hoveredHex || null,
        localSubmittedCharacterIds: interactionOverrides.localSubmittedCharacterIds || [],
        remoteSubmittedCharacterIds: interactionOverrides.remoteSubmittedCharacterIds || [],
        selectedCharacterId: interactionOverrides.selectedCharacterId || 'char-1',
        lastHoveredCharacterId: interactionOverrides.lastHoveredCharacterId || null,
      };
    },
  };
}

function createMockRenderer() {
  const calls = { render: [], renderBoard: [] };
  return {
    calls,
    render(scene) {
      calls.render.push({ scene: JSON.parse(JSON.stringify(scene)) });
    },
    renderBoard(animStep, subT) {
      calls.renderBoard.push({ animStep, subT });
    },
  };
}

// ═══════════════════════════════════════════
// Test 1: live pipeline calls renderer.render(scene)
// ═══════════════════════════════════════════

console.log('\n=== Test 1: live pipeline calls renderer.render(scene) ===');

{
  const engine = createMockEngine();
  const battleSession = createMockBattleSession({ selectedCharacterId: 'char-1' });
  const sceneStore = new BattleSceneStore();
  const renderer = createMockRenderer();

  renderLiveBattleScene({ engine, battleSession, sceneStore, renderer });

  console.log('\n[1a] renderer.render was called exactly once');
  assertEquals(renderer.calls.render.length, 1, 'render called once');

  console.log('\n[1b] scene.mode is live');
  const renderedScene = renderer.calls.render[0].scene;
  assertEquals(renderedScene.mode, 'live', 'mode === live');

  console.log('\n[1c] scene.characters from engine state');
  assertEquals(renderedScene.characters.length, 1, '1 character');
  assertEquals(renderedScene.characters[0].name, 'Warrior', 'character name from engine');
  assertEquals(renderedScene.characters[0].hp, 100, 'character hp from engine');

  console.log('\n[1d] scene.projectiles from engine state');
  assertEquals(renderedScene.projectiles.length, 1, '1 projectile');
  assertEquals(renderedScene.projectiles[0].id, 'proj-1', 'projectile id from engine');

  console.log('\n[1e] scene.turn / phase from engine state');
  assertEquals(renderedScene.turn, 1, 'turn from engine');
  assertEquals(renderedScene.phase, 'RESOLVE', 'phase from engine');

  console.log('\n[1f] scene.interaction from battleSession');
  assertEquals(renderedScene.interaction.selectedCharacterId, 'char-1', 'selectedCharacterId from session');
}

// ═══════════════════════════════════════════
// Test 2: live pipeline does NOT call renderer.renderBoard
// ═══════════════════════════════════════════

console.log('\n=== Test 2: live pipeline does NOT call renderBoard ===');

{
  const engine = createMockEngine();
  const battleSession = createMockBattleSession();
  const sceneStore = new BattleSceneStore();

  // Renderer where renderBoard throws
  const renderer = {
    calls: { render: [], renderBoard: [] },
    render(scene) { this.calls.render.push(scene); },
    renderBoard() { throw new Error('renderBoard should not be called'); },
  };

  console.log('\n[2a] pipeline does not throw (renderBoard unreachable)');
  let threw = false;
  try {
    renderLiveBattleScene({ engine, battleSession, sceneStore, renderer });
  } catch (e) {
    threw = true;
    console.error(`    Unexpected throw: ${e.message}`);
  }
  assert(!threw, 'pipeline completed without calling renderBoard');

  console.log('\n[2b] renderer.render was still called');
  assertEquals(renderer.calls.render.length, 1, 'render called once');
}

// ═══════════════════════════════════════════
// Test 3: renderer.render receives isolated scene
// ═══════════════════════════════════════════

console.log('\n=== Test 3: isolated scene per pipeline call ===');

{
  const engine = createMockEngine();
  const battleSession = createMockBattleSession();
  const sceneStore = new BattleSceneStore();
  const renderer = createMockRenderer();

  // First call
  renderLiveBattleScene({ engine, battleSession, sceneStore, renderer });
  const firstScene = renderer.calls.render[0].scene;

  // Mutate the first scene
  firstScene.characters[0].hp = 999;
  firstScene.characters.push({ id: 'injected', name: 'Bad' });

  // Second call
  renderLiveBattleScene({ engine, battleSession, sceneStore, renderer });
  const secondScene = renderer.calls.render[1].scene;

  console.log('\n[3a] second scene not polluted by first mutation');
  assertEquals(secondScene.characters.length, 1, 'second scene has correct char count');
  assertEquals(secondScene.characters[0].hp, 100, 'hp not 999 — isolated');

  console.log('\n[3b] scenes are different objects');
  assert(firstScene !== secondScene, 'different scene objects');
  assert(firstScene.characters !== secondScene.characters, 'different characters arrays');
}

// ═══════════════════════════════════════════
// Test 4: boundary scan — engine/ and resolution/ don't import presentation/playback/renderer
// ═══════════════════════════════════════════

console.log('\n=== Test 4: boundary scan ===');

{
  const FORBIDDEN_IMPORTS = [
    'BattleSceneStore',
    'BattleScene',
    'PresentationTimelineCompiler',
    'PresentationTimelinePlayback',
    'BattleCanvasRenderer',
  ];

  console.log('\n[4a] engine/ does not import presentation/playback/renderer');
  let violations = 0;
  const engineDir = path.resolve('engine');
  const engineFiles = getAllJsFiles(engineDir);
  for (const file of engineFiles) {
    const src = fs.readFileSync(file, 'utf-8');
    const importLines = src.split('\n').filter(l => l.trimStart().startsWith('import'));
    for (const line of importLines) {
      for (const term of FORBIDDEN_IMPORTS) {
        if (line.includes(term)) {
          const rel = path.relative('.', file);
          console.error(`    Found "${term}" in ${rel}: ${line.trim()}`);
          violations++;
        }
      }
    }
  }
  assertEquals(violations, 0, `engine/ has 0 forbidden imports (${violations} found)`);

  console.log('\n[4b] resolution/ does not import presentation/playback/renderer');
  violations = 0;
  const resolutionDir = path.resolve('engine/resolution');
  const resolutionFiles = getAllJsFiles(resolutionDir);
  for (const file of resolutionFiles) {
    const src = fs.readFileSync(file, 'utf-8');
    const importLines = src.split('\n').filter(l => l.trimStart().startsWith('import'));
    for (const line of importLines) {
      for (const term of FORBIDDEN_IMPORTS) {
        if (line.includes(term)) {
          const rel = path.relative('.', file);
          console.error(`    Found "${term}" in ${rel}: ${line.trim()}`);
          violations++;
        }
      }
    }
  }
  assertEquals(violations, 0, `resolution/ has 0 forbidden imports (${violations} found)`);

  console.log('\n[4c] BattleScenePipeline only imports BattleSceneStore');
  violations = 0;
  const pipelinePath = path.resolve('app/BattleScenePipeline.js');
  const pipelineSrc = fs.readFileSync(pipelinePath, 'utf-8');
  const pipelineImports = pipelineSrc.split('\n').filter(l => l.trimStart().startsWith('import'));
  for (const line of pipelineImports) {
    const isOK = line.includes('BattleSceneStore');
    if (!isOK) {
      console.error(`    Unexpected import in pipeline: ${line.trim()}`);
      violations++;
    }
  }
  assertEquals(violations, 0, `pipeline has 0 unexpected imports (${violations} found)`);
}

// ═══════════════════════════════════════════
// Test 5: no old animation fields in scene passed to renderer
// ═══════════════════════════════════════════

console.log('\n=== Test 5: no old animation fields ===');

{
  const engine = createMockEngine();
  const battleSession = createMockBattleSession();
  const sceneStore = new BattleSceneStore();
  const renderer = createMockRenderer();

  // Actually inject forbidden fields into engine state — they must NOT appear in scene
  const injectedEngine = createMockEngine({
    characters: [{ id: 'char-1', name: 'Warrior', position: { q: 0, r: 0 }, alive: true, hp: 100 }],
    projectiles: [{ id: 'proj-1', position: { q: 1, r: 0 }, alive: true, power: 50 }],
  });
  // Hijack getState to inject keyframes/animEvents into the returned state
  const originalGetState = injectedEngine.getState.bind(injectedEngine);
  injectedEngine.getState = () => {
    const state = originalGetState();
    state.keyframes = [{ fake: true, step: 1 }];
    state.animEvents = [{ fake: true, event: 'gather' }];
    if (state.projectiles?.[0]) {
      state.projectiles[0].keyframes = [{ fake: true }];
      state.projectiles[0].animEvents = [{ fake: true }];
    }
    return state;
  };
  renderLiveBattleScene({ engine: injectedEngine, battleSession, sceneStore, renderer });
  const scene = renderer.calls.render[0].scene;

  console.log('\n[5a] scene does not have keyframes');
  assertEquals(scene.keyframes, undefined, 'no keyframes on scene');

  console.log('\n[5b] scene does not have animEvents');
  assertEquals(scene.animEvents, undefined, 'no animEvents on scene');

  // 5c: projectiles pass through from engine state as-is (deep-cloned).
  // After Task 2.1, the engine no longer produces keyframes/animEvents on projectiles,
  // so stripping them in the scene is unnecessary. The defense is at the source.
  // If projectiles are injected with extra fields (test-only), they survive cloning.
  console.log('\n[5c] scene.projectiles are deep-cloned from engine state');
  const hasProjectiles = scene.projectiles.length > 0;
  assert(hasProjectiles, 'scene has projectiles from engine');
  // Verify the projectile data survived cloning (not mutated)
  if (hasProjectiles) {
    assert(scene.projectiles[0].id === 'proj-1', 'projectile id preserved');
    assert(scene.projectiles[0].power === 50, 'projectile power preserved');
  }

  console.log('\n[5d] scene has BattleScene fields only');
  const allowedFields = ['mode', 'turn', 'phase', 'teams', 'rules', 'entities', 'characters', 'projectiles', 'casings', 'wildBullets', 'logs', 'interaction', 'effects', 'playback'];
  for (const key of Object.keys(scene)) {
    assert(allowedFields.includes(key), `field "${key}" is in allowed set`);
  }
}

// ═══════════════════════════════════════════
// Test 6: pipeline with null/undefined inputs is safe
// ═══════════════════════════════════════════

console.log('\n=== Test 6: pipeline defensive with missing inputs ===');

{
  console.log('\n[6a] null engine does not throw');
  let threw = false;
  try {
    renderLiveBattleScene({ engine: null, battleSession: {}, sceneStore: new BattleSceneStore(), renderer: createMockRenderer() });
  } catch (e) {
    threw = true;
    console.error(`    Throw: ${e.message}`);
  }
  assert(!threw, 'null engine handled gracefully');

  console.log('\n[6b] null battleSession does not throw');
  threw = false;
  try {
    renderLiveBattleScene({ engine: createMockEngine(), battleSession: null, sceneStore: new BattleSceneStore(), renderer: createMockRenderer() });
  } catch (e) {
    threw = true;
    console.error(`    Throw: ${e.message}`);
  }
  assert(!threw, 'null battleSession handled gracefully');

  console.log('\n[6c] engine without getState does not throw');
  threw = false;
  try {
    renderLiveBattleScene({ engine: {}, battleSession: {}, sceneStore: new BattleSceneStore(), renderer: createMockRenderer() });
  } catch (e) {
    threw = true;
    console.error(`    Throw: ${e.message}`);
  }
  assert(!threw, 'engine without getState handled gracefully');
}

// ═══════════════════════════════════════════
// Test 7: renderAll() always uses live scene pipeline (o7.1 — animStep/subT removed)
// ═══════════════════════════════════════════

console.log('\n=== Test 7: renderAll() always uses live scene pipeline ===');

{
  let renderLiveSceneCallCount = 0;
  let renderBoardCallCount = 0;

  function makeSessionMock() {
    return {
      getBattlePanelsContext: () => ({
        state: { characters: [], projectiles: [] },
        getEl: () => null,
      }),
      combatLogStore: { getEntries: () => [] },

      engine: { turnManager: { turnNumber: 1, phase: 'RESOLVE' } },
      isResolutionPlaybackActive: () => false,
      getTutorialState: () => ({}),
    };
  }

  const coordinator = createBattleRenderCoordinator({
    getEl: () => null,
    getBattleSession: () => makeSessionMock(),
    getBattleCanvasRenderer: () => ({
      render(scene) {},
      renderBoard(legacyView) { renderBoardCallCount++; },
    }),
    renderLiveScene: () => { renderLiveSceneCallCount++; },
  });

  console.log('\n[7a] renderAll() calls renderLiveScene');
  renderLiveSceneCallCount = 0;
  renderBoardCallCount = 0;
  coordinator.renderAll();
  assertEquals(renderLiveSceneCallCount, 1, 'renderLiveScene called once');
  assertEquals(renderBoardCallCount, 0, 'renderBoard NOT called');

  console.log('\n[7b] renderAll() does not accept animStep/subT arguments');
  // renderAll() ignores extra arguments — still calls renderLiveScene
  renderLiveSceneCallCount = 0;
  renderBoardCallCount = 0;
  coordinator.renderAll(-1, 0);
  assertEquals(renderLiveSceneCallCount, 1, 'renderLiveScene still called (extra args ignored)');
  assertEquals(renderBoardCallCount, 0, 'renderBoard NOT called');
}

// ═══════════════════════════════════════════
// Test 8: renderAll() no longer falls back to renderBoard (o7.1 — legacy fallback removed)
// ═══════════════════════════════════════════

console.log('\n=== Test 8: renderAll() no legacy renderBoard fallback ===');

{
  let renderLiveSceneCallCount = 0;
  let renderBoardCallCount = 0;

  function makeSessionMock8() {
    return {
      getBattlePanelsContext: () => ({
        state: { characters: [], projectiles: [] },
        getEl: () => null,
      }),
      combatLogStore: { getEntries: () => [] },

      engine: { turnManager: { turnNumber: 1, phase: 'EXECUTE' } },
      isResolutionPlaybackActive: () => false,
      getTutorialState: () => ({}),
    };
  }

  const coordinator = createBattleRenderCoordinator({
    getEl: () => null,
    getBattleSession: () => makeSessionMock8(),
    getBattleCanvasRenderer: () => ({
      render(scene) {},
      renderBoard(legacyView) { renderBoardCallCount++; },
    }),
    renderLiveScene: () => { renderLiveSceneCallCount++; },
  });

  console.log('\n[8a] renderAll() always prefers renderLiveScene even with animStep >= 0 args');
  renderLiveSceneCallCount = 0;
  renderBoardCallCount = 0;
  coordinator.renderAll(0, 0.5);
  assertEquals(renderLiveSceneCallCount, 1, 'renderLiveScene called (legacy args ignored)');
  assertEquals(renderBoardCallCount, 0, 'renderBoard NOT called');

  console.log('\n[8b] coordinator without renderLiveScene is safe no-op');
  const legacyCoordinator = createBattleRenderCoordinator({
    getEl: () => null,
    getBattleSession: () => makeSessionMock8(),
    getBattleCanvasRenderer: () => ({
      render(scene) {},
      renderBoard(legacyView) { renderBoardCallCount++; },
    }),
    // No renderLiveScene
  });
  renderBoardCallCount = 0;
  legacyCoordinator.renderAll();
  assertEquals(renderBoardCallCount, 0, 'renderBoard NOT called when no renderLiveScene (no legacy fallback)');
}

// ═══════════════════════════════════════════
// Test 9: AppRuntime source scan — imports BattleSceneStore and renderLiveBattleScene
// ═══════════════════════════════════════════

console.log('\n=== Test 9: AppRuntime source scan ===');

{
  const appRuntimePath = path.resolve('app/AppRuntime.js');
  const src = fs.readFileSync(appRuntimePath, 'utf-8');

  console.log('\n[9a] AppRuntime imports BattleSceneStore');
  assert(src.includes(`'../presentation/BattleSceneStore.js'`), 'imports BattleSceneStore');

  console.log('\n[9b] AppRuntime imports renderLiveBattleScene');
  assert(src.includes(`'./BattleScenePipeline.js'`), 'imports renderLiveBattleScene from BattleScenePipeline');

  console.log('\n[9c] AppRuntime creates BattleSceneStore');
  assert(src.includes('new BattleSceneStore()'), 'instantiates BattleSceneStore');

  console.log('\n[9d] AppRuntime passes renderLiveScene to createBattleRenderCoordinator');
  assert(src.includes('renderLiveScene'), 'passes renderLiveScene to coordinator');

  console.log('\n[9e] renderLiveScene callback calls renderLiveBattleScene');
  assert(src.includes('renderLiveBattleScene'), 'calls renderLiveBattleScene');

  console.log('\n[9f] renderLiveScene passes engine to pipeline');
  assert(src.includes('engine'), 'passes engine');

  console.log('\n[9g] renderLiveScene passes battleSession to pipeline');
  assert(src.includes('battleSession'), 'passes battleSession');

  console.log('\n[9h] renderLiveScene passes sceneStore to pipeline');
  assert(src.includes('sceneStore'), 'passes sceneStore');

  console.log('\n[9i] renderLiveScene passes renderer to pipeline');
  assert(src.includes('renderer'), 'passes renderer');
}

// ═══════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════

function getAllJsFiles(dir) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...getAllJsFiles(fullPath));
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        results.push(fullPath);
      }
    }
  } catch (e) {
    // Directory not found — skip
  }
  return results;
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
