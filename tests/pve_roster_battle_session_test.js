import { BattleSessionController } from '../session/BattleSessionController.js';
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

function createCallbacks() {
  const statusMessages = [];
  const routes = [];
  return {
    statusMessages,
    routes,
    computeEffectArea: () => [],
    renderAll: () => {},
    renderLog: () => {},
    clearLog: () => {},
    setSubmitStatus: text => statusMessages.push(text),
    setExecuteDisabled: () => {},
    showGameOverPanel: () => {},
    hideGameOverPanel: () => {},
    showDisconnect: () => {},
    getNetworkManager: () => null,
    getConfigMode: () => 'pve',
    isPveMode: () => true,
    setRoute: route => routes.push(route),
    appendChatMessage: () => {},
    resizeCanvas: () => {},
    animateTurn: async () => {},
  };
}

console.log('=== PVE Roster Battle Session Tests ===\n');

const scenario = buildPveRosterScenario({
  seed: 99,
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

const callbacks = createCallbacks();
const session = new BattleSessionController(callbacks);
session.startBattleFromScenario(99, scenario);

check('startBattleFromScenario routes into battle',
  callbacks.routes.at(-1) === 'battle',
  JSON.stringify(callbacks.routes));
check('startBattleFromScenario initializes four roster characters',
  session.engine.getState().characters.length === 4 && session.characterIds.length === 4,
  JSON.stringify(session.engine.getState().characters.map(c => c.id)));
check('PVE roster only lets player control heroes',
  session.getMyCharacterIds().join(',') === 'hero_1,hero_2' &&
  session.isMyCharacter('enemy_1') === false,
  JSON.stringify({ my: session.getMyCharacterIds() }));

const h1 = session.engine.submitAction('hero_1', 'mage_gather', null);
const h2 = session.engine.submitAction('hero_2', 'warrior_rage', null);
session.localSubmittedSet.add('hero_1');
session.localSubmittedSet.add('hero_2');
check('hero_1 safe action submitted', h1.success, JSON.stringify(h1));
check('hero_2 safe action submitted', h2.success, JSON.stringify(h2));

await session.submitAiAndExecutePveTurn();
session.clearTurnTimeout();

check('PVE roster battle advances after heroes and AI submit',
  session.engine.getState().turn === 2 || session.battleEnded === true,
  JSON.stringify({ turn: session.engine.getState().turn, phase: session.engine.getState().phase }));
check('PVE roster battle avoids not_all_submitted',
  callbacks.statusMessages.every(message => !String(message).includes('not_all_submitted')),
  JSON.stringify(callbacks.statusMessages));
