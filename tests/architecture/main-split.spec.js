import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJsPath = resolve(__dirname, '../../main.js');
let mainJsContent = '';
try { mainJsContent = readFileSync(mainJsPath, 'utf-8'); } catch (e) { console.error('Cannot read main.js:', e.message); }
const appRuntimePath = resolve(__dirname, '../../app/AppRuntime.js');
let appJsContent = '';
try { appJsContent = readFileSync(appRuntimePath, 'utf-8'); } catch (e) { console.error('Cannot read AppRuntime.js:', e.message); }

// ─── Positive assertions (must pass after refactor) ───

test('AppRuntime.js imports renderBattlePanelsView from BattlePanelsView.js', () => {
  expect(appJsContent).toMatch(/import\s+\{[^}]*renderBattlePanelsView[^}]*\}\s+from\s+['"]\.\.\/ui\/battle\/BattlePanelsView\.js['"]/);
});

test('AppRuntime.js calls renderBattlePanelsView', () => {
  expect(appJsContent).toMatch(/renderBattlePanelsView\s*\(/);
});

// ─── Negative assertions (must NOT contain old function definitions) ───

const FORBIDDEN_DEFINITIONS = [
  { name: 'renderLegacyPanels',    pattern: /function\s+renderLegacyPanels\s*\(/ },
  { name: 'renderInfoPanel',       pattern: /function\s+renderInfoPanel\s*\(/ },
  { name: 'renderSelectedUnitDrawer', pattern: /function\s+renderSelectedUnitDrawer\s*\(/ },
  { name: 'renderHoverInspector',  pattern: /function\s+renderHoverInspector\s*\(/ },
  { name: 'renderActionDock',      pattern: /function\s+renderActionDock\s*\(/ },
  { name: 'renderRightSidebarTabs', pattern: /function\s+renderRightSidebarTabs\s*\(/ },
  { name: 'wireActionDock',        pattern: /function\s+wireActionDock\s*\(/ },
];

for (const { name, pattern } of FORBIDDEN_DEFINITIONS) {
  test(`main.js does NOT define function ${name}`, () => {
    expect(mainJsContent).not.toMatch(pattern);
  });
}
