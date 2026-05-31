import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const nscPath = resolve(__dirname, '../../network/NetworkSessionController.js');
let nscSrc = '';
try { nscSrc = readFileSync(nscPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

const nmrPath = resolve(__dirname, '../../network/NetworkMessageRouter.js');
let nmrSrc = '';
try { nmrSrc = readFileSync(nmrPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

// ─── NetworkSessionController ───

test('network/NetworkSessionController.js exists', () => {
  expect(nscSrc).toBeTruthy();
});

test('NetworkSessionController.js exports class', () => {
  expect(nscSrc).toMatch(/export\s+class\s+NetworkSessionController/);
});

test('NetworkSessionController.js imports NetworkManager', () => {
  expect(nscSrc).toMatch(/import\s+\{[^}]*NetworkManager[^}]*\}\s+from/);
});

test('NetworkSessionController.js does NOT import main.js or AppRuntime', () => {
  expect(nscSrc).not.toMatch(/from\s+['"]\.\.\/main\.js['"]/);
  expect(nscSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
});

const NSC_METHODS = [
  'getNetworkManager', 'hasNetwork', 'getMyPlayerId', 'disconnect',
  'createRoom', 'joinRoom', 'sendConfigUpdate', 'sendConfigLock',
  'maybeStartP2PBattle', 'resetForReturnToStart',
];

for (const m of NSC_METHODS) {
  test(`NetworkSessionController.js has ${m} method`, () => {
    expect(nscSrc).toMatch(new RegExp(m + '\\s*\\('));
  });
}

test('NetworkSessionController.js uses a sane P2P class fallback', () => {
  expect(nscSrc).toMatch(/['"]法师['"]/);
  expect(nscSrc).not.toMatch(/娉曞笀/);
});

// ─── NetworkMessageRouter ───

test('network/NetworkMessageRouter.js exists', () => {
  expect(nmrSrc).toBeTruthy();
});

test('NetworkMessageRouter.js exports createNetworkMessageRouter', () => {
  expect(nmrSrc).toMatch(/export\s+function\s+createNetworkMessageRouter/);
});

test('NetworkMessageRouter.js does NOT import main.js or AppRuntime', () => {
  expect(nmrSrc).not.toMatch(/from\s+['"]\.\.\/main\.js['"]/);
  expect(nmrSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
});

test('NetworkMessageRouter.js handles CHAT payload', () => {
  expect(nmrSrc).toMatch(/CHAT/);
});

test('NetworkMessageRouter.js handles CONFIG_UPDATE payload', () => {
  expect(nmrSrc).toMatch(/CONFIG_UPDATE/);
});

test('NetworkMessageRouter.js handles BATTLE_START payload', () => {
  expect(nmrSrc).toMatch(/BATTLE_START/);
});
