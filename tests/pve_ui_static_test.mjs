import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const appRuntimeSrc = readFileSync(new URL('../app/AppRuntime.js', import.meta.url), 'utf8');
const configViewSrc = readFileSync(new URL('../ui/config/ConfigScreenView.js', import.meta.url), 'utf8');
const battlePanelsViewSrc = readFileSync(new URL('../ui/battle/BattlePanelsView.js', import.meta.url), 'utf8');
const battleScreenCss = readFileSync(new URL('../styles/battle-screen.css', import.meta.url), 'utf8');

const mainPath = fileURLToPath(new URL('../main.js', import.meta.url));
const battlePanelsViewPath = fileURLToPath(new URL('../ui/battle/BattlePanelsView.js', import.meta.url));
const syntax = spawnSync(process.execPath, ['--check', mainPath], { encoding: 'utf8' });
assert.equal(
  syntax.status,
  0,
  `main.js should parse\n${syntax.stderr || syntax.stdout}`
);
const battlePanelsSyntax = spawnSync(process.execPath, ['--check', battlePanelsViewPath], { encoding: 'utf8' });
assert.equal(
  battlePanelsSyntax.status,
  0,
  `BattlePanelsView.js should parse\n${battlePanelsSyntax.stderr || battlePanelsSyntax.stdout}`
);

assert.match(html, /id="btn-local-duel"/, 'local duel button should exist');
assert.match(html, /id="btn-local-coop"/, 'local coop button should exist');
assert.match(html, /id="btn-local-solo"/, 'local solo button should exist');
assert.match(html, /id="btn-p2p-duel"/, 'P2P duel button should exist');
assert.match(html, /id="btn-p2p-coop"/, 'P2P coop button should exist');
assert.match(html, /id="btn-pve"[^>]*display:none/, 'legacy PVE button should be hidden compatibility only');
assert.match(html, /id="config-player-switch"/, 'config player switch container should exist');
assert.match(mainSrc, /createAppRuntime/, 'main.js should start AppRuntime');

assert.match(appRuntimeSrc, /isPveMode\s*=\s*\(\)\s*=>/, 'PVE mode guard should exist');
assert.match(appRuntimeSrc, /submitAiAndExecutePveTurn/, 'PVE should submit AI and execute local turns');
assert.match(appRuntimeSrc, /buildPveBattleScenario/, 'PVE config should build roster scenario');
assert.match(appRuntimeSrc, /startBattleFromScenario/, 'PVE config should start battle from scenario');

assert.match(configViewSrc, /hero_1/, 'PVE UI should expose hero_1 slot control');
assert.match(configViewSrc, /英雄1/, 'PVE UI should label first hero slot');
assert.match(configViewSrc, /pveEnemyPresets/, 'PVE UI should render fixed enemy presets');

assert.match(battlePanelsViewSrc, /renderSkillTooltipCard/, 'skill tooltip should use a structured card renderer');
assert.match(battlePanelsViewSrc, /btn\.dataset\.skill/, 'skill tooltip should resolve skill data from the hovered skill id');
assert.match(battlePanelsViewSrc, /SKILLS\[skillId\]/, 'skill tooltip should read canonical skill metadata');
assert.doesNotMatch(
  battlePanelsViewSrc,
  /tooltip\.innerHTML\s*=\s*`\$\{title\s*\?\s*`<strong>/,
  'skill tooltip should not render as a plain title/body text box'
);
for (const className of [
  'skill-tooltip-card',
  'skill-tooltip-header',
  'skill-tooltip-icon',
  'skill-tooltip-meta',
  'skill-tooltip-body',
  'skill-tooltip-stat-grid',
  'skill-tooltip-highlight'
]) {
  assert.match(battlePanelsViewSrc, new RegExp(className), `BattlePanelsView should render ${className}`);
  assert.match(battleScreenCss, new RegExp(`\\.${className}|#skill-tooltip`), `battle CSS should style ${className}`);
}

console.log('pve_ui_static_test: passed');
