import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(path) {
  return readFileSync(resolve(__dirname, path), 'utf-8');
}

function nonEmptyLineCount(src) {
  return src.split(/\r?\n/).filter(line => line.trim().length > 0).length;
}

const mainSrc = read('../../main.js');
const appSrc = read('../../app/AppRuntime.js');
const renderCoordSrc = read('../../app/BattleRenderCoordinator.js');

test('main.js stays tiny', () => {
  expect(nonEmptyLineCount(mainSrc)).toBeLessThanOrEqual(3);
});

test('AppRuntime stays within the composition-root budget', () => {
  expect(nonEmptyLineCount(appSrc)).toBeLessThanOrEqual(500);
});

test('AppRuntime wires controllers and renderers instead of owning gameplay state', () => {
  expect(appSrc).toMatch(/import\s+\{\s*ConfigSessionController\s*\}\s+from\s+['"]\.\.\/session\/ConfigSessionController\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*NetworkSessionController\s*\}\s+from\s+['"]\.\.\/network\/NetworkSessionController\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*createNetworkMessageRouter\s*\}\s+from\s+['"]\.\.\/network\/NetworkMessageRouter\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*BattleCanvasRenderer\s*\}\s+from\s+['"]\.\.\/ui\/battle\/BattleCanvasRenderer\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*createVisualEffects\s*\}\s+from\s+['"]\.\.\/ui\/battle\/VisualEffects\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*createBattleRenderCoordinator\s*\}\s+from\s+['"]\.\/BattleRenderCoordinator\.js['"]/);
  expect(appSrc).toMatch(/new\s+ConfigSessionController\s*\(/);
  expect(appSrc).toMatch(/new\s+NetworkSessionController\s*\(/);
  expect(appSrc).toMatch(/new\s+BattleCanvasRenderer\s*\(/);
  expect(appSrc).toMatch(/createNetworkMessageRouter\s*\(/);
  expect(appSrc).toMatch(/createBattleRenderCoordinator\s*\(/);
  // renderBoard lives in BattleCanvasRenderer.js (o7.1 — coordinator uses renderLiveScene, not renderBoard)
  // AppRuntime does not directly own canvas drawing functions
  expect(renderCoordSrc).not.toMatch(/getBattleCanvasRenderer\s*\(\s*\)\s*\?\.\s*renderBoard\s*\(/);
  expect(appSrc).not.toMatch(/\blet\s+configPlayers\b/);
  expect(appSrc).not.toMatch(/\blet\s+configMode\b/);
  expect(appSrc).not.toMatch(/\blet\s+networkManager\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+renderBoard\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+setRoute\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+handleNetworkMessage\b/);
  expect(appSrc).not.toMatch(/\bnew\s+NetworkManager\b/);
  expect(appSrc).not.toMatch(/\bctx\.arc\s*\(/);
  expect(appSrc).not.toMatch(/\bctx\.fill\s*\(/);
  expect(appSrc).not.toMatch(/\bctx\.stroke\s*\(/);
  expect(appSrc).not.toMatch(/\bctx\.fillText\s*\(/);
  expect(appSrc).not.toMatch(/renderConfigScreenView\s*\(\{/);
});
