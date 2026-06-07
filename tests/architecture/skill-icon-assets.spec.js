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

const skillIconSrc = read('../../ui/shared/SkillIconAssets.js');
const battlePanelsSrc = read('../../ui/battle/BattlePanelsView.js');
const appSrc = read('../../app/AppRuntime.js');

test('SkillIconAssets exports shared cache helpers', () => {
  expect(skillIconSrc).toMatch(/export\s+function\s+getSkillIconSrc\s*\(/);
  expect(skillIconSrc).toMatch(/export\s+function\s+getCachedSkillIconImage\s*\(/);
  expect(skillIconSrc).toMatch(/export\s+function\s+seedSkillIconCacheFromPreloader\s*\(/);
  expect(skillIconSrc).toMatch(/export\s+function\s+getSkillIconImageCache\s*\(/);
  expect(skillIconSrc).toMatch(/export\s+function\s+clearSkillIconImageCacheForTests\s*\(/);
  expect(skillIconSrc).toMatch(/const\s+skillIconImageCache\s*=\s*new\s+Map\s*\(/);
});

test('BattlePanelsView uses SkillIconAssets instead of direct skill.icon image tags', () => {
  expect(battlePanelsSrc).toMatch(/import\s+\{[^}]*getSkillIconSrc[^}]*\}\s+from\s+['"]\.\.\/shared\/SkillIconAssets\.js['"]/);
  expect(battlePanelsSrc).toMatch(/export\s+function\s+skillGlyph\s*\(\s*skill\s*\)/);
  expect(battlePanelsSrc).toMatch(/class="skill-icon-img"/);
  expect(battlePanelsSrc).not.toMatch(/<img[^>]+src="\$\{escapeHTML\(skill\.icon\)\}"/);
  expect(battlePanelsSrc).toMatch(/getSkillIconSrc\s*\(\s*skill\s*\)/);
});

test('AppRuntime seeds the skill icon cache from the asset preloader', () => {
  expect(appSrc).toMatch(/import\s+\{\s*seedSkillIconCacheFromPreloader\s*\}\s+from\s+['"]\.\.\/ui\/shared\/SkillIconAssets\.js['"]/);
  expect(appSrc).toMatch(/seedSkillIconCacheFromPreloader\s*\(\s*assetPreloader\.cache\s*\)/);
});
