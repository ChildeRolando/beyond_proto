import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJsPath = resolve(__dirname, '../../main.js');
let src = '';
try { src = readFileSync(mainJsPath, 'utf-8'); } catch (e) { console.error('Cannot read main.js:', e.message); }

// Positive assertions
test('main.js imports initStartLobbyController', () => {
  expect(src).toMatch(/import\s+\{[^}]*initStartLobbyController[^}]*\}\s+from\s+['"]\.\/ui\/start\/StartLobbyController\.js['"]/);
});
test('main.js calls initStartLobbyController', () => {
  expect(src).toMatch(/initStartLobbyController\s*\(/);
});

// Negative: must NOT define these functions directly
const FORBIDDEN = [
  { name: 'showTutorial', re: /function\s+showTutorial\s*\(/ },
  { name: 'hideTutorial', re: /function\s+hideTutorial\s*\(/ },
  { name: 'updateHostStatus', re: /function\s+updateHostStatus\s*\(/ },
  { name: 'updateJoinStatus', re: /function\s+updateJoinStatus\s*\(/ },
  { name: 'resetConnectionUI', re: /function\s+resetConnectionUI\s*\(/ },
];
for (const { name, re } of FORBIDDEN) {
  test('main.js does NOT define ' + name, () => { expect(src).not.toMatch(re); });
}

// Negative: must NOT directly addEventListener on these button IDs
const FORBIDDEN_BTN = [
  'btn-local', 'btn-pve', 'btn-tutorial', 'tutorial-close',
  'btn-help-top', 'btn-p2p', 'btn-back-start',
  'btn-create-room', 'btn-join-room',
];
for (const id of FORBIDDEN_BTN) {
  const re = new RegExp("getElementById\\('" + id + "'\\)\\.addEventListener");
  test('main.js does NOT bind ' + id + ' directly', () => { expect(src).not.toMatch(re); });
}

// Negative: must NOT call resetConnectionUI() without startLobbyUi. prefix
test('main.js does NOT call bare resetConnectionUI()', () => {
  // Match resetConnectionUI() that is NOT preceded by startLobbyUi.
  expect(src).not.toMatch(/(?<!startLobbyUi\.)resetConnectionUI\s*\(/);
});
