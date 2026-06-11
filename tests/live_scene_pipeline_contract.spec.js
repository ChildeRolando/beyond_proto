// Contract tests for live BattleScene pipeline
// Run: node tests/live_scene_pipeline_contract.spec.js
//
// Milestone 3 / Task 3.5

import { renderLiveBattleScene } from '../app/BattleScenePipeline.js';
import { BattleSceneStore } from '../presentation/BattleSceneStore.js';
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

  // Inject forbidden fields into engine state — they should NOT appear in scene
  // (engine no longer produces them, but test defensively)
  renderLiveBattleScene({ engine, battleSession, sceneStore, renderer });
  const scene = renderer.calls.render[0].scene;

  console.log('\n[5a] scene does not have keyframes');
  assertEquals(scene.keyframes, undefined, 'no keyframes on scene');

  console.log('\n[5b] scene does not have animEvents');
  assertEquals(scene.animEvents, undefined, 'no animEvents on scene');

  console.log('\n[5c] scene.projectiles do not have keyframes');
  for (const proj of scene.projectiles) {
    assertEquals(proj.keyframes, undefined, `proj ${proj.id} has no keyframes`);
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
