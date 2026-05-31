import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(path) {
  try {
    return readFileSync(resolve(__dirname, path), 'utf-8');
  } catch {
    return '';
  }
}

const appSrc = read('../../app/AppRuntime.js');
const cfgSrc = read('../../session/ConfigSessionController.js');
const nscSrc = read('../../network/NetworkSessionController.js');
const nmrSrc = read('../../network/NetworkMessageRouter.js');

test('AppRuntime wires config + network controllers', () => {
  expect(appSrc).toMatch(/import\s+\{\s*ConfigSessionController\s*\}\s+from\s+['"]\.\.\/session\/ConfigSessionController\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*NetworkSessionController\s*\}\s+from\s+['"]\.\.\/network\/NetworkSessionController\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*createNetworkMessageRouter\s*\}\s+from\s+['"]\.\.\/network\/NetworkMessageRouter\.js['"]/);
  expect(appSrc).toMatch(/new\s+ConfigSessionController\s*\(/);
  expect(appSrc).toMatch(/new\s+NetworkSessionController\s*\(/);
  expect(appSrc).toMatch(/createNetworkMessageRouter\s*\(/);
});

test('AppRuntime drops config and network ownership', () => {
  expect(appSrc).not.toMatch(/\blet\s+configMode\b/);
  expect(appSrc).not.toMatch(/\blet\s+currentConfigPlayer\b/);
  expect(appSrc).not.toMatch(/\blet\s+configLoadoutOpen\b/);
  expect(appSrc).not.toMatch(/\blet\s+hoverRoleId\b/);
  expect(appSrc).not.toMatch(/\blet\s+battleConfigs\b/);
  expect(appSrc).not.toMatch(/\blet\s+configPlayers\b/);
  expect(appSrc).not.toMatch(/\blet\s+networkManager\b/);
  expect(appSrc).not.toMatch(/\blet\s+remoteClassPick\b/);
  expect(appSrc).not.toMatch(/\blet\s+battleSeed\b/);
  expect(appSrc).not.toMatch(/\blet\s+pendingMyClass\b/);
  expect(appSrc).not.toMatch(/\blet\s+pendingRemoteRematchClass\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+makeDefaultPlayerConfig\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+cloneConfig\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+activeConfig\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+isConfigEditable\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+setActiveClass\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+setActiveRole\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+shiftRole\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+toggleLoadoutSkill\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+toggleRoleLoadoutSkill\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+removeLoadoutAt\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+renderConfigScreen\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+getBattlePlayerConfigs\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+startP2PGame\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+onClassPick\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+tryInitWithClasses\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+sendConfigUpdate\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+sendConfigLock\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+maybeStartP2PBattle\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+handleNetworkMessage\b/);
  expect(appSrc).not.toMatch(/\bnew\s+NetworkManager\b/);
  expect(appSrc).not.toMatch(/renderConfigScreenView\s*\(\{/);
});

test('ConfigSessionController keeps config ownership', () => {
  expect(cfgSrc).toMatch(/export\s+class\s+ConfigSessionController/);
  expect(cfgSrc).toMatch(/renderConfigScreen\s*\(/);
  expect(cfgSrc).toMatch(/normalizeForPlayer\s*\(/);
  expect(cfgSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
  expect(cfgSrc).not.toMatch(/from\s+['"]\.\.\/network\/NetworkSessionController\.js['"]/);
});

test('NetworkSessionController keeps network ownership', () => {
  expect(nscSrc).toMatch(/export\s+class\s+NetworkSessionController/);
  expect(nscSrc).toMatch(/startP2PGame\s*\(/);
  expect(nscSrc).toMatch(/onClassPick\s*\(/);
  expect(nscSrc).toMatch(/tryInitWithClasses\s*\(/);
  expect(nscSrc).toMatch(/getNetworkManager\s*\(/);
  expect(nscSrc).toMatch(/createRoom\s*\(/);
  expect(nscSrc).toMatch(/joinRoom\s*\(/);
  expect(nscSrc).toMatch(/maybeStartP2PBattle\s*\(/);
  expect(nscSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
  expect(nscSrc).not.toMatch(/from\s+['"]\.\.\/session\/ConfigSessionController\.js['"]/);
});

test('NetworkMessageRouter routes payloads without AppRuntime imports', () => {
  expect(nmrSrc).toMatch(/export\s+function\s+createNetworkMessageRouter/);
  expect(nmrSrc).toMatch(/CHAT/);
  expect(nmrSrc).toMatch(/CONFIG_UPDATE/);
  expect(nmrSrc).toMatch(/CONFIG_LOCK/);
  expect(nmrSrc).toMatch(/BATTLE_START/);
  expect(nmrSrc).not.toMatch(/from\s+['"]\.\.\/app\/AppRuntime\.js['"]/);
});
