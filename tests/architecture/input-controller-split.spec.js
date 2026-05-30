import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJsPath = resolve(__dirname, '../../main.js');
let mainSrc = '';
try { mainSrc = readFileSync(mainJsPath, 'utf-8'); } catch (e) { console.error('Cannot read main.js:', e.message); }
const appRuntimePath = resolve(__dirname, '../../app/AppRuntime.js');
let appSrc = '';
try { appSrc = readFileSync(appRuntimePath, 'utf-8'); } catch (e) { console.error('Cannot read AppRuntime.js:', e.message); }

const bicPath = resolve(__dirname, '../../ui/battle/BattleInputController.js');
let bicSrc = '';
try { bicSrc = readFileSync(bicPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

// ─── Positive: main.js imports and calls BattleInputController ───

test('AppRuntime.js imports initBattleInputController', () => {
  expect(appSrc).toMatch(/import\s+\{[^}]*initBattleInputController[^}]*\}\s+from\s+['"]\.\.\/ui\/battle\/BattleInputController\.js['"]/);
});

test('AppRuntime.js calls initBattleInputController', () => {
  expect(appSrc).toMatch(/initBattleInputController\s*\(/);
});

// ─── Negative: main.js must NOT contain raw event listeners ───

test('main.js does NOT contain canvas.addEventListener(\'click\'', () => {
  expect(mainSrc).not.toMatch(/canvas\.addEventListener\s*\(\s*['"]click['"]/);
});

test('main.js does NOT contain canvas.addEventListener(\'mousemove\'', () => {
  expect(mainSrc).not.toMatch(/canvas\.addEventListener\s*\(\s*['"]mousemove['"]/);
});

test('main.js does NOT contain document.addEventListener(\'keydown\'', () => {
  expect(mainSrc).not.toMatch(/document\.addEventListener\s*\(\s*['"]keydown['"]/);
});

test('main.js keyboard handler does NOT use char.skills.filter', () => {
  // Pattern: accessing .skills on a registry entity (which has no .skills)
  // This was the Digit1 hotkey bug pattern
  expect(mainSrc).not.toMatch(/char\.skills\.filter/);
});

// ─── Positive: BattleInputController.js exists and has correct structure ───

test('ui/battle/BattleInputController.js exists', () => {
  expect(bicSrc).toBeTruthy();
});

test('BattleInputController.js exports initBattleInputController', () => {
  expect(bicSrc).toMatch(/export\s+function\s+initBattleInputController/);
});

test('BattleInputController.js does NOT import main.js', () => {
  expect(bicSrc).not.toMatch(/from\s+['"]\.\.\/\.\.\/main\.js['"]/);
});

test('BattleInputController.js does NOT import GameEngine', () => {
  expect(bicSrc).not.toMatch(/import\s+\{[^}]*GameEngine[^}]*\}\s+from/);
});

test('BattleInputController.js does NOT call new GameEngine', () => {
  expect(bicSrc).not.toMatch(/new\s+GameEngine\s*\(/);
});

test('BattleInputController.js does NOT call engine.executeTurn', () => {
  expect(bicSrc).not.toMatch(/engine\.executeTurn\s*\(/);
});

test('BattleInputController.js does NOT call engine.submitAction', () => {
  expect(bicSrc).not.toMatch(/engine\.submitAction\s*\(/);
});
