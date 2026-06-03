import { GameEngine } from '../engine/GameEngine.js';
import { buildPveRosterScenario } from '../pve/PveScenarioBuilder.js';
import { getDefaultLoadout, getDefaultRoleLoadout } from '../engine/RoleData.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

console.log('=== PVE Scenario Builder Tests ===\n');

const scenario = buildPveRosterScenario({
  seed: 77,
  heroConfigs: [
    {
      playerId: 'hero_1',
      class: '法师',
      roleId: 'mage_stargazer',
      loadoutSkillIds: getDefaultLoadout('法师'),
      roleLoadoutSkillIds: getDefaultRoleLoadout('mage_stargazer'),
    },
    {
      playerId: 'hero_2',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: getDefaultLoadout('战士'),
      roleLoadoutSkillIds: getDefaultRoleLoadout('warrior_vanguard'),
    },
  ],
});

check('builder creates pve_multi scenario', scenario.mode === 'pve_multi', scenario.mode);
check('builder preserves seed', scenario.seed === 77, JSON.stringify(scenario));
check('builder creates two teams', scenario.teams.length === 2, JSON.stringify(scenario.teams));
check('builder creates four combatants', scenario.combatants.length === 4, JSON.stringify(scenario.combatants));
check('heroes belong to player1 owner',
  scenario.combatants.filter(c => c.teamId === 'heroes').every(c => c.ownerId === 'player1' && c.control === 'human'),
  JSON.stringify(scenario.combatants));
check('enemies belong to ai owner',
  scenario.combatants.filter(c => c.teamId === 'enemies').every(c => c.ownerId === 'ai' && c.control === 'ai'),
  JSON.stringify(scenario.combatants));
check('builder assigns requested hero ids and positions',
  scenario.combatants.find(c => c.id === 'hero_1')?.position.q === -1 &&
  scenario.combatants.find(c => c.id === 'hero_2')?.position.r === -2,
  JSON.stringify(scenario.combatants));
check('builder expands fixed enemy presets',
  scenario.combatants.find(c => c.id === 'enemy_1')?.class === '战士' &&
  scenario.combatants.find(c => c.id === 'enemy_2')?.class === '射手',
  JSON.stringify(scenario.combatants));
check('builder sets team victory with friendly fire disabled',
  scenario.rules?.victory === 'team_elimination' && scenario.rules?.friendlyFire === false,
  JSON.stringify(scenario.rules));

const engine = new GameEngine();
const result = engine.initBattle(scenario);
const state = engine.getState();

check('scenario can initialize GameEngine',
  result.characterIds.length === 4 && state.characters.length === 4,
  JSON.stringify({ result, characters: state.characters.map(c => c.id) }));
