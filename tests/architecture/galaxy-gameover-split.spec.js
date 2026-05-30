import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJsPath = resolve(__dirname, '../../main.js');
let mainSrc = '';
try { mainSrc = readFileSync(mainJsPath, 'utf-8'); } catch (e) { console.error('Cannot read main.js:', e.message); }

const galaxyPath = resolve(__dirname, '../../ui/battle/GalaxyOverlayController.js');
let galaxySrc = '';
try { galaxySrc = readFileSync(galaxyPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

const gameoverPath = resolve(__dirname, '../../ui/battle/GameOverController.js');
let gameoverSrc = '';
try { gameoverSrc = readFileSync(gameoverPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

// ─── Positive: main.js imports and calls controllers ───

test('main.js imports initGalaxyOverlayController', () => {
  expect(mainSrc).toMatch(/import\s+\{[^}]*initGalaxyOverlayController[^}]*\}\s+from\s+['"]\.\/ui\/battle\/GalaxyOverlayController\.js['"]/);
});

test('main.js calls initGalaxyOverlayController', () => {
  expect(mainSrc).toMatch(/initGalaxyOverlayController\s*\(/);
});

test('main.js imports initGameOverController', () => {
  expect(mainSrc).toMatch(/import\s+\{[^}]*initGameOverController[^}]*\}\s+from\s+['"]\.\/ui\/battle\/GameOverController\.js['"]/);
});

test('main.js calls initGameOverController', () => {
  expect(mainSrc).toMatch(/initGameOverController\s*\(/);
});

// ─── Negative: main.js must NOT define galaxy/gameover DOM functions ───

test('main.js does NOT define function showGalaxyPanel', () => {
  expect(mainSrc).not.toMatch(/function\s+showGalaxyPanel\s*\(/);
});

test('main.js does NOT define function hideGalaxyPanel', () => {
  expect(mainSrc).not.toMatch(/function\s+hideGalaxyPanel\s*\(/);
});

test('main.js does NOT bind btn-galaxy-confirm', () => {
  expect(mainSrc).not.toMatch(/btn-galaxy-confirm.*addEventListener/);
});

test('main.js does NOT bind btn-galaxy-skip', () => {
  expect(mainSrc).not.toMatch(/btn-galaxy-skip.*addEventListener/);
});

test('main.js does NOT define function showGameOver', () => {
  expect(mainSrc).not.toMatch(/function\s+showGameOver\s*\(/);
});

test('main.js does NOT define function updateRematchButton', () => {
  expect(mainSrc).not.toMatch(/function\s+updateRematchButton\s*\(/);
});

test('main.js does NOT bind btn-rematch', () => {
  expect(mainSrc).not.toMatch(/btn-rematch.*addEventListener/);
});

test('main.js does NOT bind btn-lobby', () => {
  expect(mainSrc).not.toMatch(/btn-lobby.*addEventListener/);
});

test('main.js does NOT directly manipulate gameover-panel by ID', () => {
  // Catch standalone gameover-panel manipulation (outside thin callbacks)
  // Check if main.js has more than 2 references to gameover-panel
  // (allowed: at most the callback definition passed to battleSession)
  const matches = mainSrc.match(/gameover-panel/g);
  const count = matches ? matches.length : 0;
  // After refactor: only the thin hideGameOverPanel callback should remain,
  // which passes through to gameOverController. Max 1 reference allowed.
  expect(count).toBeLessThanOrEqual(1);
});

test('main.js does NOT directly manipulate galaxy-overlay by ID', () => {
  // galaxy-overlay should only be referenced inside GalaxyOverlayController
  const matches = mainSrc.match(/galaxy-overlay/g);
  const count = matches ? matches.length : 0;
  // After refactor: main.js should no longer reference galaxy-overlay at all
  expect(count).toBe(0);
});

// ─── Positive: GalaxyOverlayController.js exists and has correct structure ───

test('ui/battle/GalaxyOverlayController.js exists', () => {
  expect(galaxySrc).toBeTruthy();
});

test('GalaxyOverlayController.js exports initGalaxyOverlayController', () => {
  expect(galaxySrc).toMatch(/export\s+function\s+initGalaxyOverlayController/);
});

test('GalaxyOverlayController.js does NOT import main.js', () => {
  expect(galaxySrc).not.toMatch(/from\s+['"]\.\.\/\.\.\/main\.js['"]/);
});

test('GalaxyOverlayController.js does NOT import GameEngine', () => {
  expect(galaxySrc).not.toMatch(/import\s+\{[^}]*GameEngine[^}]*\}\s+from/);
});

// ─── Positive: GameOverController.js exists and has correct structure ───

test('ui/battle/GameOverController.js exists', () => {
  expect(gameoverSrc).toBeTruthy();
});

test('GameOverController.js exports initGameOverController', () => {
  expect(gameoverSrc).toMatch(/export\s+function\s+initGameOverController/);
});

test('GameOverController.js does NOT import main.js', () => {
  expect(gameoverSrc).not.toMatch(/from\s+['"]\.\.\/\.\.\/main\.js['"]/);
});

test('GameOverController.js does NOT import GameEngine', () => {
  expect(gameoverSrc).not.toMatch(/import\s+\{[^}]*GameEngine[^}]*\}\s+from/);
});
