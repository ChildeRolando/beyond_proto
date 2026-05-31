import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(relPath) {
  try {
    return readFileSync(resolve(__dirname, relPath), 'utf8');
  } catch {
    return '';
  }
}

const battleSessionSrc = read('../../session/BattleSessionController.js');
const rendererSrc = read('../../ui/battle/BattleCanvasRenderer.js');

test('BattleSessionController exposes a render view snapshot', () => {
  expect(battleSessionSrc).toMatch(/getRenderViewState\s*\(/);
});

test('BattleCanvasRenderer consumes the render view snapshot instead of mutable battle fields', () => {
  expect(rendererSrc).toMatch(/getRenderViewState\s*\(/);
  expect(rendererSrc).not.toMatch(/battleSession\.hoverEffectArea/);
  expect(rendererSrc).not.toMatch(/battleSession\.validTargets/);
  expect(rendererSrc).not.toMatch(/battleSession\.hoveredHex/);
  expect(rendererSrc).not.toMatch(/battleSession\.localSubmittedSet/);
  expect(rendererSrc).not.toMatch(/battleSession\.remoteSubmittedSet/);
});
