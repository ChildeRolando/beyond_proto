import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJsPath = resolve(__dirname, '../../main.js');
let mainSrc = '';
try { mainSrc = readFileSync(mainJsPath, 'utf-8'); } catch (e) { console.error('Cannot read main.js:', e.message); }

// ─── Positive assertions (these FAIL before refactor, PASS after) ───

test('main.js imports BattleSessionController', () => {
  expect(mainSrc).toMatch(/import\s+\{[^}]*BattleSessionController[^}]*\}\s+from\s+['"]\.\/session\/BattleSessionController\.js['"]/);
});

test('main.js instantiates BattleSessionController', () => {
  expect(mainSrc).toMatch(/new\s+BattleSessionController\s*\(/);
});

// ─── Negative: must NOT import GameEngine directly ───

test('main.js does NOT import GameEngine directly', () => {
  expect(mainSrc).not.toMatch(/import\s+\{[^}]*GameEngine[^}]*\}\s+from/);
});

test('main.js does NOT call new GameEngine', () => {
  expect(mainSrc).not.toMatch(/new\s+GameEngine\s*\(/);
});

// ─── Negative: must NOT define these battle lifecycle functions directly ───

const FORBIDDEN_FUNCTIONS = [
  { name: 'initGame', re: /function\s+initGame\s*\(/ },
  { name: 'startBattleFromConfigs', re: /function\s+startBattleFromConfigs\s*\(/ },
  { name: 'startTurnTimeout', re: /function\s+startTurnTimeout\s*\(/ },
  { name: 'clearTurnTimeout', re: /function\s+clearTurnTimeout\s*\(/ },
  { name: 'selectSkill', re: /function\s+selectSkill\s*\(/ },
  { name: 'viewOpponentSkill', re: /function\s+viewOpponentSkill\s*\(/ },
  { name: 'submitAction', re: /function\s+submitAction\s*\(/ },
  { name: 'executeLocalTurn', re: /function\s+executeLocalTurn\s*\(/ },
  { name: 'submitAiAndExecutePveTurn', re: /function\s+submitAiAndExecutePveTurn\s*\(/ },
  { name: 'executeP2PTurn', re: /function\s+executeP2PTurn\s*\(/ },
  { name: 'handleRemoteAction', re: /function\s+handleRemoteAction\s*\(/ },
  { name: 'updateSubmitStatus', re: /function\s+updateSubmitStatus\s*\(/ },
  { name: 'markP2PReady', re: /function\s+markP2PReady\s*\(/ },
  { name: 'maybeAutoReadyP2P', re: /function\s+maybeAutoReadyP2P\s*\(/ },
  { name: 'getMyCharacterIds', re: /function\s+getMyCharacterIds\s*\(/ },
  { name: 'isMyCharacter', re: /function\s+isMyCharacter\s*\(/ },
  { name: 'getCharacterState', re: /function\s+getCharacterState\s*\(/ },
  { name: 'getPreviewOrigin', re: /function\s+getPreviewOrigin\s*\(/ },
  { name: 'clearPlannedActions', re: /function\s+clearPlannedActions\s*\(/ },
  { name: 'canSubmitForChar', re: /function\s+canSubmitForChar\s*\(/ },
  { name: 'isRequiredActionReady', re: /function\s+isRequiredActionReady\s*\(/ },
  { name: 'hasOptionalActionAvailable', re: /function\s+hasOptionalActionAvailable\s*\(/ },
  { name: 'areMyRequiredActionsReady', re: /function\s+areMyRequiredActionsReady\s*\(/ },
  { name: 'hasAnyMyOptionalActionAvailable', re: /function\s+hasAnyMyOptionalActionAvailable\s*\(/ },
  { name: 'visibleSkillsForChar', re: /function\s+visibleSkillsForChar\s*\(/ },
];

for (const { name, re } of FORBIDDEN_FUNCTIONS) {
  test(`main.js does NOT define ${name}`, () => {
    expect(mainSrc).not.toMatch(re);
  });
}

// ─── Negative: must NOT declare these battle state variables at top level ───

const FORBIDDEN_STATE = [
  { name: 'let selectedSkill', re: /^\s*let\s+selectedSkill\b/m },
  { name: 'let viewingSkill', re: /^\s*let\s+viewingSkill\b/m },
  { name: 'let validTargets', re: /^\s*let\s+validTargets\b/m },
  { name: 'let hoveredHex', re: /^\s*let\s+hoveredHex\b/m },
  { name: 'let hoverEffectArea', re: /^\s*let\s+hoverEffectArea\b/m },
  { name: 'let selectedCharacterId', re: /^\s*let\s+selectedCharacterId\b/m },
  { name: 'let lastHoveredCharacterId', re: /^\s*let\s+lastHoveredCharacterId\b/m },
  { name: 'let activeSidebarTab', re: /^\s*let\s+activeSidebarTab\b/m },
  { name: 'let turnTimeoutId', re: /^\s*let\s+turnTimeoutId\b/m },
  { name: 'let battleEnded', re: /^\s*let\s+battleEnded\b/m },
  { name: 'let battleActive', re: /^\s*let\s+battleActive\b/m },
  { name: 'let pveAiRunning', re: /^\s*let\s+pveAiRunning\b/m },
  { name: 'let localSubmittedSet', re: /^\s*let\s+localSubmittedSet\b/m },
  { name: 'let remoteSubmittedSet', re: /^\s*let\s+remoteSubmittedSet\b/m },
  { name: 'let characterIds', re: /^\s*let\s+characterIds\b/m },
  { name: 'const plannedActions', re: /^\s*const\s+plannedActions\b/m },
  { name: 'const skillPages', re: /^\s*const\s+skillPages\b/m },
  { name: 'let skillsPerPage', re: /^\s*let\s+skillsPerPage\b/m },
  { name: 'let galaxyActive', re: /^\s*let\s+galaxyActive\b/m },
  { name: 'let galaxyCharId', re: /^\s*let\s+galaxyCharId\b/m },
  { name: 'let galaxySelectedSkill', re: /^\s*let\s+galaxySelectedSkill\b/m },
  { name: 'let galaxyActionIndex', re: /^\s*let\s+galaxyActionIndex\b/m },
  { name: 'let galaxyActionTotal', re: /^\s*let\s+galaxyActionTotal\b/m },
  { name: 'let player1Class', re: /^\s*let\s+player1Class\b/m },
  { name: 'let player2Class', re: /^\s*let\s+player2Class\b/m },
];

for (const { name, re } of FORBIDDEN_STATE) {
  test(`main.js does NOT declare ${name} at top level`, () => {
    expect(mainSrc).not.toMatch(re);
  });
}

// ─── Positive: BattleSessionController.js exists and exports class ───

const bscPath = resolve(__dirname, '../../session/BattleSessionController.js');
let bscSrc = '';
try { bscSrc = readFileSync(bscPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

test('session/BattleSessionController.js exists', () => {
  expect(bscSrc).toBeTruthy();
});

test('BattleSessionController.js exports class BattleSessionController', () => {
  expect(bscSrc).toMatch(/export\s+class\s+BattleSessionController/);
});

test('BattleSessionController.js imports GameEngine', () => {
  expect(bscSrc).toMatch(/import\s+\{[^}]*GameEngine[^}]*\}\s+from/);
});

// Required public API methods (check for method-like definitions)
const REQUIRED_METHODS = [
  'initGame', 'startBattleFromConfigs', 'resetBattleSession',
  'selectSkill', 'viewOpponentSkill', 'submitAction',
  'executeLocalTurn', 'updateSubmitStatus',
  'getMyCharacterIds', 'isMyCharacter', 'canSubmitForChar',
  'visibleSkillsForChar', 'getBattlePanelsContext',
];

for (const methodName of REQUIRED_METHODS) {
  test(`BattleSessionController.js has ${methodName} method`, () => {
    // Match method definition: methodName( or methodName (
    expect(bscSrc).toMatch(new RegExp(methodName + '\\s*\\('));
  });
}
