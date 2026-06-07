import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function read(path) {
  return readFileSync(resolve(__dirname, path), 'utf-8');
}

const portraitSrc = read('../../ui/portrait/PortraitAssets.js');
const rendererSrc = read('../../ui/battle/BattleCanvasRenderer.js');
const configViewSrc = read('../../ui/config/ConfigScreenView.js');
const appSrc = read('../../app/AppRuntime.js');

test('PortraitAssets.js exports PORTRAIT_CACHE_VERSION', () => {
  expect(portraitSrc).toMatch(/export\s+const\s+PORTRAIT_CACHE_VERSION\s*=\s*['"]\d+['"]/);
});

test('PortraitAssets.js exports URL helpers', () => {
  expect(portraitSrc).toMatch(/export\s+function\s+getRoleThumbnailSrc\s*\(/);
  expect(portraitSrc).toMatch(/export\s+function\s+getRoleHeroPortraitSrc\s*\(/);
  expect(portraitSrc).toMatch(/export\s+function\s+getBattlePortraitSrc\s*\(/);
});

test('PortraitAssets.js exports shared cache functions', () => {
  expect(portraitSrc).toMatch(/export\s+function\s+getCachedBattlePortraitImage\s*\(/);
  expect(portraitSrc).toMatch(/export\s+function\s+clearPortraitImageCacheForTests\s*\(/);
});

test('PortraitAssets.js uses module-level shared cache', () => {
  expect(portraitSrc).toMatch(/const\s+portraitImageCache\s*=\s*new\s+Map\s*\(/);
});

test('portrait URLs include ?v= cache version', () => {
  expect(portraitSrc).toMatch(/\.webp\?v=\$\{cacheVersion\}/);
  expect(portraitSrc).toMatch(/\.webp\?v=\$\{cacheVersion\}/);
});

test('BattleCanvasRenderer imports from PortraitAssets', () => {
  expect(rendererSrc).toMatch(/import\s+\{[^}]*PORTRAIT_CACHE_VERSION[^}]*\}\s+from\s+['"]\.\.\/portrait\/PortraitAssets\.js['"]/);
  expect(rendererSrc).toMatch(/import\s+\{[^}]*getBattlePortraitSrc[^}]*getCachedBattlePortraitImage[^}]*getPortraitImageCache[^}]*\}\s+from\s+['"]\.\.\/portrait\/PortraitAssets\.js['"]/);
});

test('BattleCanvasRenderer constructor defaults portraitCacheVersion to PORTRAIT_CACHE_VERSION', () => {
  expect(rendererSrc).toMatch(/portraitCacheVersion\s*=\s*PORTRAIT_CACHE_VERSION/);
});

test('BattleCanvasRenderer seeds shared cache from preloaded images', () => {
  expect(rendererSrc).toMatch(/getPortraitImageCache\s*\(\s*\)/);
});

test('BattleCanvasRenderer uses getCachedBattlePortraitImage', () => {
  expect(rendererSrc).toMatch(/getCachedBattlePortraitImage\s*\(/);
});

test('ConfigScreenView imports from PortraitAssets', () => {
  expect(configViewSrc).toMatch(/import\s+\{\s*getRoleThumbnailSrc\s*,\s*getRoleHeroPortraitSrc\s*\}\s+from\s+['"]\.\.\/portrait\/PortraitAssets\.js['"]/);
});

test('ConfigScreenView does NOT define local getRoleThumbnail or getRoleHeroPortrait', () => {
  expect(configViewSrc).not.toMatch(/function\s+getRoleThumbnail\s*\(/);
  expect(configViewSrc).not.toMatch(/function\s+getRoleHeroPortrait\s*\(/);
});

test('AppRuntime imports PORTRAIT_CACHE_VERSION from PortraitAssets', () => {
  expect(appSrc).toMatch(/import\s+\{\s*PORTRAIT_CACHE_VERSION\s*\}\s+from\s+['"]\.\.\/ui\/portrait\/PortraitAssets\.js['"]/);
});

test('AppRuntime does NOT define PORTRAIT_CACHE_VERSION as local const', () => {
  expect(appSrc).not.toMatch(/const\s+PORTRAIT_CACHE_VERSION\s*=\s*['"]/);
});

test('ReturnToStartAction cleans tutorial and galaxy overlays', () => {
  const returnSrc = read('../../app/ReturnToStartAction.js');
  expect(returnSrc).toMatch(/tutorial-overlay.*classList\.remove\s*\(\s*['"]show['"]\s*\)/);
  expect(returnSrc).toMatch(/galaxy-overlay.*classList\.remove\s*\(\s*['"]show['"]\s*\)/);
});

test('StartLobbyController exposes resetTransientUi', () => {
  const startLobbySrc = read('../../ui/start/StartLobbyController.js');
  expect(startLobbySrc).toMatch(/resetTransientUi\s*\(/);
  expect(startLobbySrc).toMatch(/hideTutorial\s*\(\)/);
  expect(startLobbySrc).toMatch(/hideTutorial\b/);
  expect(startLobbySrc).toMatch(/showTutorial\b/);
});
