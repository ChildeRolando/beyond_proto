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
const rendererSrc = read('../../ui/battle/BattleCanvasRenderer.js');
const effectsSrc = read('../../ui/battle/VisualEffects.js');
const renderCoordSrc = read('../../app/BattleRenderCoordinator.js');

test('AppRuntime wires the battle canvas renderer split', () => {
  expect(appSrc).toMatch(/import\s+\{\s*BattleCanvasRenderer\s*\}\s+from\s+['"]\.\.\/ui\/battle\/BattleCanvasRenderer\.js['"]/);
  expect(appSrc).toMatch(/import\s+\{\s*createVisualEffects\s*\}\s+from\s+['"]\.\.\/ui\/battle\/VisualEffects\.js['"]/);
  expect(appSrc).toMatch(/new\s+BattleCanvasRenderer\s*\(/);
  expect(appSrc).toMatch(/createVisualEffects\s*\(/);
  // renderBoard now delegates through BattleRenderCoordinator
  expect(renderCoordSrc).toMatch(/getBattleCanvasRenderer\s*\(\s*\)\s*\?\.\s*renderBoard\s*\(/);
  expect(appSrc).not.toMatch(/\bfunction\s+renderBoard\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawSlashArc\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawImpactEffect\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawProjectileTrail\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawGatherEffect\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawDashTrail\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawTeleportEffect\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawWalkTrail\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+drawGrappleLine\b/);
  expect(appSrc).not.toMatch(/\bctx\.arc\s*\(/);
  expect(appSrc).not.toMatch(/\bctx\.fill\s*\(/);
  expect(appSrc).not.toMatch(/\bctx\.stroke\s*\(/);
  expect(appSrc).not.toMatch(/\bctx\.fillText\s*\(/);
});

test('BattleCanvasRenderer.js exports the renderer class', () => {
  expect(rendererSrc).toMatch(/export\s+class\s+BattleCanvasRenderer/);
  expect(rendererSrc).toMatch(/resize\s*\(/);
  expect(rendererSrc).toMatch(/renderBoard\s*\(/);
  expect(rendererSrc).toMatch(/drawImpactEffect|drawSlashArc|drawProjectileTrail/);
});

test('VisualEffects.js exports the visual effects factory', () => {
  expect(effectsSrc).toMatch(/export\s+function\s+createVisualEffects/);
  expect(effectsSrc).toMatch(/drawSlashArc\s*\(/);
  expect(effectsSrc).toMatch(/drawImpactEffect\s*\(/);
  expect(effectsSrc).toMatch(/drawProjectileTrail\s*\(/);
  expect(effectsSrc).toMatch(/drawGatherEffect\s*\(/);
  expect(effectsSrc).toMatch(/drawDashTrail\s*\(/);
  expect(effectsSrc).toMatch(/drawTeleportEffect\s*\(/);
  expect(effectsSrc).toMatch(/drawWalkTrail\s*\(/);
  expect(effectsSrc).toMatch(/drawGrappleLine\s*\(/);
});
