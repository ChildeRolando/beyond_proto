import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const appRuntimePath = resolve(__dirname, '../../app/AppRuntime.js');
let appSrc = '';
try { appSrc = readFileSync(appRuntimePath, 'utf-8'); } catch (e) { console.error('Cannot read AppRuntime.js:', e.message); }

const routeCtrlPath = resolve(__dirname, '../../app/RouteController.js');
let routeSrc = '';
try { routeSrc = readFileSync(routeCtrlPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

const mainJsPath = resolve(__dirname, '../../main.js');
let mainSrc = '';
try { mainSrc = readFileSync(mainJsPath, 'utf-8'); } catch (e) { console.error('Cannot read main.js:', e.message); }

// ─── Positive: AppRuntime imports and uses RouteController ───

test('AppRuntime.js imports RouteController', () => {
  expect(appSrc).toMatch(/import\s+\{[^}]*RouteController[^}]*\}\s+from\s+['"]\.\/RouteController\.js['"]/);
});

test('AppRuntime.js instantiates RouteController', () => {
  expect(appSrc).toMatch(/new\s+RouteController\s*\(/);
});

// ─── Negative: AppRuntime must NOT define route logic ───

test('AppRuntime.js does NOT declare let currentRoute', () => {
  expect(appSrc).not.toMatch(/let\s+currentRoute\b/);
});

test('AppRuntime.js does NOT define function setRoute', () => {
  expect(appSrc).not.toMatch(/function\s+setRoute\s*\(/);
});

test('AppRuntime.js does NOT directly toggle start-screen display', () => {
  expect(appSrc).not.toMatch(/start-screen.*style\.display/);
});

test('AppRuntime.js does NOT directly toggle config-screen display', () => {
  expect(appSrc).not.toMatch(/config-screen.*style\.display/);
});

test('AppRuntime.js does NOT directly toggle app display', () => {
  expect(appSrc).not.toMatch(/\bapp\b.*style\.display.*battle/);
});

// ─── Positive: RouteController.js exists and has correct structure ───

test('app/RouteController.js exists', () => {
  expect(routeSrc).toBeTruthy();
});

test('RouteController.js exports class RouteController', () => {
  expect(routeSrc).toMatch(/export\s+class\s+RouteController/);
});

test('RouteController.js has setRoute method', () => {
  expect(routeSrc).toMatch(/setRoute\s*\(/);
});

test('RouteController.js has getRoute method', () => {
  expect(routeSrc).toMatch(/getRoute\s*\(/);
});

// ─── main.js is still 2 lines ───

test('main.js is still a 2-line composition root', () => {
  const lines = mainSrc.split('\n').filter(l => l.trim());
  expect(lines.length).toBeLessThanOrEqual(3);
});
