import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const appRuntimeSrc = readFileSync(new URL('../app/AppRuntime.js', import.meta.url), 'utf8');
const battleSessionSrc = readFileSync(new URL('../session/BattleSessionController.js', import.meta.url), 'utf8');
const configViewSrc = readFileSync(new URL('../ui/config/ConfigScreenView.js', import.meta.url), 'utf8');
const battlePanelsViewSrc = readFileSync(new URL('../ui/battle/BattlePanelsView.js', import.meta.url), 'utf8');
const skillTooltipViewSrc = readFileSync(new URL('../ui/shared/SkillTooltipView.js', import.meta.url), 'utf8');
const battleScreenCss = readFileSync(new URL('../styles/battle-screen.css', import.meta.url), 'utf8');

const mainPath = fileURLToPath(new URL('../main.js', import.meta.url));
const battlePanelsViewPath = fileURLToPath(new URL('../ui/battle/BattlePanelsView.js', import.meta.url));
const configViewPath = fileURLToPath(new URL('../ui/config/ConfigScreenView.js', import.meta.url));
const skillTooltipViewPath = fileURLToPath(new URL('../ui/shared/SkillTooltipView.js', import.meta.url));
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
const configViewSyntax = spawnSync(process.execPath, ['--check', configViewPath], { encoding: 'utf8' });
assert.equal(
  configViewSyntax.status,
  0,
  `ConfigScreenView.js should parse\n${configViewSyntax.stderr || configViewSyntax.stdout}`
);
const skillTooltipViewSyntax = spawnSync(process.execPath, ['--check', skillTooltipViewPath], { encoding: 'utf8' });
assert.equal(
  skillTooltipViewSyntax.status,
  0,
  `SkillTooltipView.js should parse\n${skillTooltipViewSyntax.stderr || skillTooltipViewSyntax.stdout}`
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

assert.match(skillTooltipViewSrc, /renderSkillTooltipCard/, 'skill tooltip should use a structured card renderer');
assert.match(skillTooltipViewSrc, /showSkillTooltip/, 'shared tooltip view should expose hover behavior');
assert.match(battlePanelsViewSrc, /renderSkillTooltipCard/, 'battle drawer should render structured skill cards');
assert.match(battlePanelsViewSrc, /btn\.dataset\.skill/, 'skill tooltip should resolve skill data from the hovered skill id');
assert.match(skillTooltipViewSrc, /SKILLS\[skillId\]/, 'skill tooltip should read canonical skill metadata');
assert.match(configViewSrc, /showSkillTooltip/, 'config skill pool hover should use the shared card tooltip');
assert.match(configViewSrc, /config-loadout-slot-btn[^`]+data-skill/, 'config loadout slots should expose skill ids for hover cards');
assert.match(battlePanelsViewSrc, /inline:\s*true/, 'selected unit drawer should request inline skill cards instead of plain desc text');
assert.match(skillTooltipViewSrc, /resourceCostLabel/, 'skill tooltip should format resource cost labels');
assert.match(skillTooltipViewSrc, /CD状况/, 'skill tooltip stat grid should show cooldown status');
assert.match(skillTooltipViewSrc, /剩余发动次数/, 'skill tooltip stat grid should show remaining uses');
assert.match(battlePanelsViewSrc, /data-cd-remaining/, 'battle skill buttons should expose live cooldown remaining');
assert.match(battlePanelsViewSrc, /data-uses-remaining/, 'battle skill buttons should expose live remaining uses');
assert.match(battleSessionSrc, /getSkillCooldownRemaining/, 'battle panel context should expose cooldown helper');
assert.match(battleSessionSrc, /getSkillRemainingUses/, 'battle panel context should expose remaining uses helper');
assert.doesNotMatch(
  battlePanelsViewSrc + configViewSrc,
  /tooltip\.innerHTML\s*=\s*`\$\{title\s*\?\s*`<strong>/,
  'skill tooltip should not render as a plain title/body text box'
);
assert.doesNotMatch(
  skillTooltipViewSrc,
  /<span><b>速度<\/b>/,
  'skill tooltip bottom stats should not repeat speed'
);
assert.doesNotMatch(
  skillTooltipViewSrc,
  /<span><b>cost<\/b>/i,
  'skill tooltip bottom stats should not repeat cost'
);
assert.doesNotMatch(
  configViewSrc,
  /title="\$\{SKILLS\[id\]\.desc/,
  'config skill buttons should not rely on native title text previews'
);
for (const className of [
  'skill-tooltip-card',
  'skill-tooltip-card--inline',
  'skill-tooltip-header',
  'skill-tooltip-icon',
  'skill-tooltip-meta',
  'skill-tooltip-body',
  'skill-tooltip-stat-grid',
  'skill-tooltip-highlight'
]) {
  assert.match(battlePanelsViewSrc + skillTooltipViewSrc, new RegExp(className), `skill card renderer should render ${className}`);
  assert.match(battleScreenCss, new RegExp(`\\.${className}|#skill-tooltip`), `battle CSS should style ${className}`);
}

console.log('pve_ui_static_test: passed');
