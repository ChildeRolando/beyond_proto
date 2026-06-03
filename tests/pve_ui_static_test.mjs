import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const appRuntimeSrc = readFileSync(new URL('../app/AppRuntime.js', import.meta.url), 'utf8');
const configViewSrc = readFileSync(new URL('../ui/config/ConfigScreenView.js', import.meta.url), 'utf8');

const mainPath = fileURLToPath(new URL('../main.js', import.meta.url));
const syntax = spawnSync(process.execPath, ['--check', mainPath], { encoding: 'utf8' });
assert.equal(
  syntax.status,
  0,
  `main.js should parse\n${syntax.stderr || syntax.stdout}`
);

assert.match(html, /id="btn-pve"/, 'PVE mode button should exist');
assert.match(html, /id="config-player-switch"/, 'config player switch container should exist');
assert.match(mainSrc, /createAppRuntime/, 'main.js should start AppRuntime');

assert.match(appRuntimeSrc, /isPveMode\s*=\s*\(\)\s*=>/, 'PVE mode guard should exist');
assert.match(appRuntimeSrc, /submitAiAndExecutePveTurn/, 'PVE should submit AI and execute local turns');
assert.match(appRuntimeSrc, /buildPveBattleScenario/, 'PVE config should build roster scenario');
assert.match(appRuntimeSrc, /startBattleFromScenario/, 'PVE config should start battle from scenario');

assert.match(configViewSrc, /hero_1/, 'PVE UI should expose hero_1 slot control');
assert.match(configViewSrc, /英雄1/, 'PVE UI should label first hero slot');
assert.match(configViewSrc, /pveEnemyPresets/, 'PVE UI should render fixed enemy presets');

console.log('pve_ui_static_test: passed');
