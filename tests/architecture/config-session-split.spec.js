import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const appRuntimePath = resolve(__dirname, '../../app/AppRuntime.js');
let appSrc = '';
try { appSrc = readFileSync(appRuntimePath, 'utf-8'); } catch (e) { console.error('Cannot read AppRuntime.js:', e.message); }

const cfgCtrlPath = resolve(__dirname, '../../session/ConfigSessionController.js');
let cfgSrc = '';
try { cfgSrc = readFileSync(cfgCtrlPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

// ─── Positive: ConfigSessionController.js exists and has correct structure ───

test('session/ConfigSessionController.js exists', () => {
  expect(cfgSrc).toBeTruthy();
});

test('ConfigSessionController.js exports class ConfigSessionController', () => {
  expect(cfgSrc).toMatch(/export\s+class\s+ConfigSessionController/);
});

test('ConfigSessionController.js does NOT import AppRuntime', () => {
  expect(cfgSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
});

test('ConfigSessionController.js does NOT import GameEngine', () => {
  expect(cfgSrc).not.toMatch(/import\s+\{[^}]*GameEngine[^}]*\}\s+from/);
});

// Required methods
const REQUIRED_METHODS = [
  'showConfigScreen', 'getConfigMode', 'getConfigPlayers', 'getBattlePlayerConfigs',
  'activeConfig', 'isConfigEditable', 'setActiveClass', 'setActiveRole',
  'toggleLoadoutSkill', 'removeLoadoutAt', 'buildViewContext',
];

for (const m of REQUIRED_METHODS) {
  test(`ConfigSessionController.js has ${m} method`, () => {
    expect(cfgSrc).toMatch(new RegExp(m + '\\s*\\('));
  });
}
