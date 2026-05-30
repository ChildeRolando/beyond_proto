import { test, expect } from 'playwright/test';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainJsPath = resolve(__dirname, '../../main.js');
let mainSrc = '';
try { mainSrc = readFileSync(mainJsPath, 'utf-8'); } catch (e) { console.error('Cannot read main.js:', e.message); }
const appRuntimePath = resolve(__dirname, '../../app/AppRuntime.js');
let appSrc = '';
try { appSrc = readFileSync(appRuntimePath, 'utf-8'); } catch (e) { console.error('Cannot read AppRuntime.js:', e.message); }

const chatPath = resolve(__dirname, '../../ui/battle/ChatController.js');
let chatSrc = '';
try { chatSrc = readFileSync(chatPath, 'utf-8'); } catch (e) { /* file may not exist yet */ }

test('AppRuntime.js imports initChatController', () => {
  expect(appSrc).toMatch(/import\s+\{[^}]*initChatController[^}]*\}\s+from\s+['"]\.\.\/ui\/battle\/ChatController\.js['"]/);
});

test('AppRuntime.js calls initChatController', () => {
  expect(appSrc).toMatch(/initChatController\s*\(/);
});

test('main.js does NOT contain chat-input addEventListener', () => {
  expect(mainSrc).not.toMatch(/chat-input.*addEventListener/);
});

test('main.js does NOT define function appendChatMessage', () => {
  expect(mainSrc).not.toMatch(/function\s+appendChatMessage\s*\(/);
});

test('ui/battle/ChatController.js exists', () => {
  expect(chatSrc).toBeTruthy();
});

test('ChatController.js exports initChatController', () => {
  expect(chatSrc).toMatch(/export\s+function\s+initChatController/);
});

test('ChatController.js does NOT import main.js', () => {
  expect(chatSrc).not.toMatch(/from\s+['"]\.\.\/\.\.\/main\.js['"]/);
});

test('ChatController.js does NOT import GameEngine', () => {
  expect(chatSrc).not.toMatch(/import\s+\{[^}]*GameEngine[^}]*\}\s+from/);
});
