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

function nonEmptyLineCount(src) {
  return src.split(/\r?\n/).filter(line => line.trim().length > 0).length;
}

const mainSrc = read('../../main.js');
const appSrc = read('../../app/AppRuntime.js');
const configSplitSrc = read('./config-session-split.spec.js');
const networkSplitSrc = read('./network-session-split.spec.js');

test('AppRuntime remains within the composition-root budget', () => {
  expect(nonEmptyLineCount(mainSrc)).toBeLessThanOrEqual(3);
  expect(nonEmptyLineCount(appSrc)).toBeLessThanOrEqual(500);
});

test('architecture specs do not keep stale deferred or mojibake assertions', () => {
  expect(configSplitSrc).not.toMatch(/deferred/i);
  expect(configSplitSrc).not.toMatch(/wiring checks deferred/i);
  expect(networkSplitSrc.includes('\u5A09\u66DE\u7B00')).toBe(false);
});

test('AppRuntime does not regain owned config or network symbols', () => {
  expect(appSrc).not.toMatch(/\blet\s+configPlayers\b/);
  expect(appSrc).not.toMatch(/\blet\s+configMode\b/);
  expect(appSrc).not.toMatch(/\blet\s+networkManager\b/);
  expect(appSrc).not.toMatch(/\bfunction\s+renderBoard\b/);
  expect(appSrc).not.toMatch(/\bnew\s+NetworkManager\b/);
  expect(appSrc).not.toMatch(/\bctx\.arc\s*\(/);
  expect(appSrc).not.toMatch(/\bctx\.fill\s*\(/);
  expect(appSrc).not.toMatch(/\brenderConfigScreenView\s*\(\{/);
});
