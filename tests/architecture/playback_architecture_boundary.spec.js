// Architecture boundary tests: playback / presentation / engine / renderer (Task 8.1)
// Run: node tests/architecture/playback_architecture_boundary.spec.js

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

// Regex-based exclusion — uses pattern.test() instead of substring match
function assertExcludesPattern(src, pattern, label) {
  if (!pattern.test(src)) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — matched ${pattern}`); }
}

function stripComments(src) {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const ROOT = path.resolve('.');

function readRelative(relPath) {
  return fs.readFileSync(path.resolve(ROOT, relPath), 'utf-8');
}

function collectJsFiles(dirRel) {
  const results = [];
  const fullDir = path.resolve(ROOT, dirRel);
  if (!fs.existsSync(fullDir)) return results;
  const entries = fs.readdirSync(fullDir, { withFileTypes: true });
  for (const e of entries) {
    const rel = dirRel + '/' + e.name;
    if (e.isFile() && e.name.endsWith('.js')) {
      results.push(rel);
    } else if (e.isDirectory() && !e.name.startsWith('.')) {
      results.push(...collectJsFiles(rel));
    }
  }
  return results;
}

// ═══════════════════════════════════════════
// Test A: engine/ boundary
// ═══════════════════════════════════════════

console.log('\n=== Test A: engine/ boundary ===');

const ENGINE_FORBIDDEN_SUBSTR = [
  'BattleCanvasRenderer',
  'BattleSceneStore',
  'BattleScene',             // presentation module — not engine
  'PresentationTimeline',
  'PlaybackFrame',
  'TurnPlaybackRuntime',
  'ResolutionTimelinePanel',
  'renderBoard',
  'render(scene)',
  'scene.effects',
  'canvas',
  'DOM',
  'animEvents',
  'animStep',
  'subT',
];

// Regex patterns to avoid false positives (e.g. greed_window, 'keyframes' in exclusion sets)
const ENGINE_FORBIDDEN_PATTERNS = [
  [/\bwindow\.\b/, 'window.X (DOM access)'],
  [/\bdocument\./, 'document.X (DOM access)'],
  [/\bkeyframes\b/, 'keyframes'],
];

// Files allowed to contain "keyframes" because they exclude it from state
const KEYFRAMES_ALLOWLIST = new Set([
  'engine/rl/rollout/StateHasher.js',
]);

{
  const engineFiles = collectJsFiles('engine');
  const allowedInResolution = new Set([
    'engine/resolution/ResolutionEventRecorder.js',
    'engine/resolution/TurnResolutionBuilder.js',
    'engine/resolution/ResolutionLogRenderer.js',
    'engine/resolution/ResolutionEventTypes.js',
    'engine/resolution/ResolutionActionSummarizer.js',
  ]);

  for (const file of engineFiles) {
    const src = stripComments(readRelative(file));
    for (const term of ENGINE_FORBIDDEN_SUBSTR) {
      assertExcludes(src, term, `[A] ${file} must not contain "${term}"`);
    }
    for (const [pattern, desc] of ENGINE_FORBIDDEN_PATTERNS) {
      if (desc === 'keyframes' && KEYFRAMES_ALLOWLIST.has(file)) continue;
      assertExcludesPattern(src, pattern, `[A] ${file} must not match ${desc}`);
    }
  }

  // Positive: engine/resolution must contain canonical event machinery
  const resolFiles = engineFiles.filter(f => f.startsWith('engine/resolution/'));
  console.log('\n[A-positive] engine/resolution contains canonical event files');
  for (const f of allowedInResolution) {
    assert(fs.existsSync(path.resolve(ROOT, f)), `[A+] ${f} exists`);
  }
}

// ═══════════════════════════════════════════
// Test B: engine/resolution/ boundary
// ═══════════════════════════════════════════

console.log('\n=== Test B: engine/resolution/ boundary ===');

const RESOLUTION_FORBIDDEN = [
  'BattleCanvasRenderer',
  'BattleSceneStore',
  'PlaybackFrame',
  'TurnPlaybackRuntime',
  'scene.effects',
  'VisualEffects',
  'canvas',
  'DOM',
  'document',
  'keyframes',
  'animEvents',
  'animStep',
  'subT',
];

const RESOLUTION_ALLOWED = [
  'ResolutionEventRecorder',
  'TurnResolutionBuilder',
  'ResolutionLogRenderer',
  'ResolutionEventTypes',
  'ResolutionActionSummarizer',
];

{
  const resDir = 'engine/resolution';
  if (fs.existsSync(path.resolve(ROOT, resDir))) {
    const resFiles = collectJsFiles(resDir);
    for (const file of resFiles) {
      const src = stripComments(readRelative(file));
      for (const term of RESOLUTION_FORBIDDEN) {
        assertExcludes(src, term, `[B] ${file} must not contain "${term}"`);
      }
    }
    // Positive: resolution files contain expected types
    for (const term of RESOLUTION_ALLOWED) {
      const found = resFiles.some(f => readRelative(f).includes(term));
      if (!found) {
        // Not a hard fail — some types may be defined elsewhere
        console.log(`  (info) "${term}" not found in engine/resolution/ — may be fine`);
      }
    }
  }
}

// ═══════════════════════════════════════════
// Test C: presentation/ boundary
// ═══════════════════════════════════════════

console.log('\n=== Test C: presentation/ boundary ===');

const PRESENTATION_FORBIDDEN_IMPORTS = [
  'GameEngine',
  'BattleSessionController',
  'BattleCanvasRenderer',
];

const PRESENTATION_FORBIDDEN_TERMS = [
  'DOM',
  'document',
  'window',
  'canvas',
  '.getEngine()',
  '.executeTurn(',
];

{
  const presFiles = collectJsFiles('presentation');
  for (const file of presFiles) {
    const src = readRelative(file);
    const noComments = stripComments(src);
    for (const term of PRESENTATION_FORBIDDEN_IMPORTS) {
      assertExcludes(noComments, term, `[C] ${file} must not import "${term}"`);
    }
    // DOM/canvas terms: check stripped source but be lenient about string literals mentioning them
    for (const term of PRESENTATION_FORBIDDEN_TERMS) {
      assertExcludes(noComments, term, `[C] ${file} must not contain "${term}"`);
    }
  }

  // PresentationTimelineCompiler must only consume TurnResolution / canonical events
  const compilerSrc = stripComments(readRelative('presentation/PresentationTimelineCompiler.js'));
  console.log('\n[C5] PresentationTimelineCompiler does not mutate engine state');
  assertExcludes(compilerSrc, 'mutate', '[C5] no mutate');
  assertExcludes(compilerSrc, 'executeTurn', '[C5] no executeTurn');
  assertExcludes(compilerSrc, '.hp', '[C5] no direct .hp access');
  assertExcludes(compilerSrc, '.resources', '[C5] no direct .resources access');
}

// ═══════════════════════════════════════════
// Test D: playback/ boundary
// ═══════════════════════════════════════════

console.log('\n=== Test D: playback/ boundary ===');

const PLAYBACK_FORBIDDEN_IMPORTS = [
  'GameEngine',
  'BattleSessionController',
  'BattleCanvasRenderer',
  'BattleSceneStore',
  'ResolutionTimelinePanel',
];

const PLAYBACK_FORBIDDEN_TERMS = [
  'DOM',
  'document',
  'window',
  'canvas',
];

{
  const playFiles = collectJsFiles('playback');
  for (const file of playFiles) {
    const src = readRelative(file);
    const noComments = stripComments(src);
    for (const term of PLAYBACK_FORBIDDEN_IMPORTS) {
      assertExcludes(noComments, term, `[D] ${file} must not import "${term}"`);
    }
    for (const term of PLAYBACK_FORBIDDEN_TERMS) {
      assertExcludes(noComments, term, `[D] ${file} must not contain "${term}"`);
    }
  }

  // TurnPlaybackRuntime must not know DOM/session/renderer
  const tprSrc = stripComments(readRelative('playback/TurnPlaybackRuntime.js'));
  console.log('\n[D5] TurnPlaybackRuntime does not know DOM/session/renderer');
  assertExcludes(tprSrc, 'getElementById', '[D5] no getElementById');
  assertExcludes(tprSrc, 'querySelector', '[D5] no querySelector');
  assertExcludes(tprSrc, 'BattleSessionController', '[D5] no BattleSessionController');
  assertExcludes(tprSrc, 'BattleCanvasRenderer', '[D5] no BattleCanvasRenderer');
}

// ═══════════════════════════════════════════
// Test E: renderer boundary (BattleCanvasRenderer)
// ═══════════════════════════════════════════

console.log('\n=== Test E: BattleCanvasRenderer boundary ===');

const RENDERER_FORBIDDEN = [
  'this.battleSession',
  'this.getEngine',
  'getRenderState',
  'getRenderViewState',
  'keyframes',
  'animEvents',
  'animStep',
  'subT',
  'combatLogStore',
  'renderTurnLog',
  'timelinePanel',
  'TurnPlaybackRuntime',
];

const RENDERER_REQUIRED = [
  'render(scene)',
  'scene.effects',
  'renderBoard',
];

{
  const rendererSrc = readRelative('ui/battle/BattleCanvasRenderer.js');
  const noComments = stripComments(rendererSrc);

  for (const term of RENDERER_FORBIDDEN) {
    assertExcludes(noComments, term, `[E] BattleCanvasRenderer must not contain "${term}"`);
  }

  for (const term of RENDERER_REQUIRED) {
    assertIncludes(noComments, term, `[E] BattleCanvasRenderer must contain "${term}"`);
  }
}

// ═══════════════════════════════════════════
// Test F: AppRuntime composition boundary
// ═══════════════════════════════════════════

console.log('\n=== Test F: AppRuntime composition boundary ===');

const APPRUNTIME_REQUIRED = [
  'BattleSceneStore',
  'TurnPlaybackRuntime',
  'createResolutionTimelinePanel',
  'compilePresentationTimeline',
  'buildPlaybackFrame',
  'playTurnResolution',
];

const APPRUNTIME_FORBIDDEN = [
  'TurnPlaybackController',
  'createTurnPlaybackController',
  'keyframes',
  'animEvents',
  'animStep',
  'subT',
  'setResolutionPlaybackState',
  'getRenderState',
  'clearResolutionPlaybackState',
];

{
  const appSrc = readRelative('app/AppRuntime.js');
  const noComments = stripComments(appSrc);

  console.log('\n[F] AppRuntime wires expected composition components');
  for (const term of APPRUNTIME_REQUIRED) {
    assertIncludes(noComments, term, `[F] AppRuntime must contain "${term}"`);
  }

  console.log('\n[F] AppRuntime must NOT contain legacy/deleted terms');
  for (const term of APPRUNTIME_FORBIDDEN) {
    assertExcludes(noComments, term, `[F] AppRuntime must NOT contain "${term}"`);
  }
}

// ═══════════════════════════════════════════
// Test G: BattleSessionController boundary
// ═══════════════════════════════════════════

console.log('\n=== Test G: BattleSessionController boundary ===');

const BSC_ALLOWED = [
  'GameEngine',
  'lastTurnResolution',
  'CombatLogStore',
  'input lock',
];

const BSC_FORBIDDEN_IMPORTS = [
  'BattleCanvasRenderer',
  'BattleSceneStore',
  'PresentationTimelineCompiler',
  'TurnPlaybackRuntime',
  'ResolutionTimelinePanel',
];

const BSC_FORBIDDEN_TERMS = [
  '_resolutionPlaybackState',
  'getRenderState',
  'setResolutionPlaybackState',
  'clearResolutionPlaybackState',
  'keyframes',
  'animEvents',
  'animStep',
  'subT',
  'scene.effects',
];

{
  const bscSrc = readRelative('session/BattleSessionController.js');
  const noComments = stripComments(bscSrc);

  console.log('\n[G] BSC owns expected modules');
  assertIncludes(noComments, 'GameEngine', '[G] BSC owns GameEngine');
  assertIncludes(noComments, 'CombatLogStore', '[G] BSC owns CombatLogStore');

  console.log('\n[G] BSC must NOT import forbidden modules');
  for (const term of BSC_FORBIDDEN_IMPORTS) {
    assertExcludes(noComments, term, `[G] BSC must not import "${term}"`);
  }

  console.log('\n[G] BSC must NOT contain legacy terms');
  for (const term of BSC_FORBIDDEN_TERMS) {
    assertExcludes(noComments, term, `[G] BSC must not contain "${term}"`);
  }
}

// ═══════════════════════════════════════════
// Results
// ═══════════════════════════════════════════

console.log(`\n=== Results: ${pass} pass, ${fail} fail ===`);
if (fail > 0) {
  console.error('BOUNDARY VIOLATIONS DETECTED');
  process.exit(1);
} else {
  console.log('ALL TESTS PASSED');
}
