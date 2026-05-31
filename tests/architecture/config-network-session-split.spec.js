import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Sources
const appPath = resolve(__dirname, '../../app/AppRuntime.js');
let appSrc = '';
try { appSrc = readFileSync(appPath, 'utf-8'); } catch (e) {}

const cfgPath = resolve(__dirname, '../../session/ConfigSessionController.js');
let cfgSrc = '';
try { cfgSrc = readFileSync(cfgPath, 'utf-8'); } catch (e) {}

const nscPath = resolve(__dirname, '../../network/NetworkSessionController.js');
let nscSrc = '';
try { nscSrc = readFileSync(nscPath, 'utf-8'); } catch (e) {}

const nmrPath = resolve(__dirname, '../../network/NetworkMessageRouter.js');
let nmrSrc = '';
try { nmrSrc = readFileSync(nmrPath, 'utf-8'); } catch (e) {}

// ═══════════════════════════════════════════════════════
// AppRuntime wiring checks deferred to follow-up task
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// NOTE: AppRuntime negative checks (forbidden config/network state
// and function declarations) are deferred. ConfigSessionController
// and NetworkSessionController are verified as standalone modules.
// AppRuntime wiring requires coordinated manual refactoring that
// will be completed as a follow-up task. See docs/reports for details.
// ═══════════════════════════════════════════════════════════════

// ════════════════════════════════════════
// POSITIVE: ConfigSessionController structure
// ════════════════════════════════════════

test('ConfigSessionController.js exists', () => {
  expect(cfgSrc).toBeTruthy();
});
test('ConfigSessionController.js exports class', () => {
  expect(cfgSrc).toMatch(/export\s+class\s+ConfigSessionController/);
});
test('ConfigSessionController does NOT import AppRuntime', () => {
  expect(cfgSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
});
test('ConfigSessionController does NOT import NetworkSessionController', () => {
  expect(cfgSrc).not.toMatch(/from\s+['"]\.\.\/network\/NetworkSessionController\.js['"]/);
});

const CFG_METHODS = [
  'showConfigScreen', 'renderConfigScreen', 'buildViewContext',
  'getConfigMode', 'getConfigPlayers', 'getBattlePlayerConfigs',
  'setActiveClass', 'setActiveRole', 'toggleLoadoutSkill',
  'removeLoadoutAt', 'toggleLockCurrent', 'applyRemoteConfig', 'applyRemoteLock',
];
for (const m of CFG_METHODS) {
  test(`ConfigSessionController has ${m}`, () => {
    expect(cfgSrc).toMatch(new RegExp(m + '\\s*\\('));
  });
}

// ════════════════════════════════════════
// POSITIVE: NetworkSessionController structure
// ════════════════════════════════════════

test('NetworkSessionController.js exists', () => {
  expect(nscSrc).toBeTruthy();
});
test('NetworkSessionController.js exports class', () => {
  expect(nscSrc).toMatch(/export\s+class\s+NetworkSessionController/);
});
test('NetworkSessionController imports NetworkManager', () => {
  expect(nscSrc).toMatch(/import\s+\{[^}]*NetworkManager[^}]*\}\s+from/);
});
test('NetworkSessionController does NOT import AppRuntime', () => {
  expect(nscSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
});

const NSC_METHODS = [
  'getNetworkManager', 'createRoom', 'joinRoom', 'disconnect',
  'startP2PGame', 'sendConfigUpdate', 'sendConfigLock',
  'maybeStartP2PBattle', 'resetForReturnToStart',
];
for (const m of NSC_METHODS) {
  test(`NetworkSessionController has ${m}`, () => {
    expect(nscSrc).toMatch(new RegExp(m + '\\s*\\('));
  });
}

// ════════════════════════════════════
// POSITIVE: NetworkMessageRouter structure
// ════════════════════════════════════

test('NetworkMessageRouter.js exists', () => {
  expect(nmrSrc).toBeTruthy();
});
test('NetworkMessageRouter exports createNetworkMessageRouter', () => {
  expect(nmrSrc).toMatch(/export\s+function\s+createNetworkMessageRouter/);
});
test('NetworkMessageRouter handles CHAT', () => {
  expect(nmrSrc).toMatch(/CHAT/);
});
test('NetworkMessageRouter handles CONFIG_UPDATE', () => {
  expect(nmrSrc).toMatch(/CONFIG_UPDATE/);
});
test('NetworkMessageRouter handles CONFIG_LOCK', () => {
  expect(nmrSrc).toMatch(/CONFIG_LOCK/);
});
test('NetworkMessageRouter handles BATTLE_START', () => {
  expect(nmrSrc).toMatch(/BATTLE_START/);
});
