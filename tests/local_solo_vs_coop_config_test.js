import assert from 'node:assert/strict';
import { ConfigSessionController } from '../session/ConfigSessionController.js';
import {
  LOADOUT_SIZE,
  ROLE_LOADOUT_SIZE,
  ROLE_DEFS,
  getDefaultLoadout,
  getDefaultRoleId,
  getDefaultRoleLoadout,
  getRolesByClass,
  normalizePlayerConfig,
  validateLoadout,
  validateRoleLoadout,
} from '../engine/RoleData.js';

function createController() {
  const renderContexts = [];
  const controller = new ConfigSessionController({
    routeController: { setRoute: () => {} },
    battleSession: { resetForConfigScreen: () => {} },
    getNetworkManager: () => null,
    renderConfigScreenView: (ctx) => renderContexts.push(ctx),
    sendConfigUpdate: () => {},
    sendConfigLock: () => {},
    maybeStartP2PBattle: () => {},
    callbacks: { hideGameOver: () => {} },
    CLASSES: ['法师', '战士', '射手'],
    PORTRAIT_CACHE_VERSION: 'test',
    ROLE_DEFS,
    LOADOUT_SIZE,
    ROLE_LOADOUT_SIZE,
    getDefaultRoleId,
    getDefaultLoadout,
    getDefaultRoleLoadout,
    getRolesByClass,
    normalizePlayerConfig,
    validateLoadout,
    validateRoleLoadout,
  });
  return { controller, renderContexts };
}

console.log('=== Local Solo vs Coop Config Tests ===\n');

{
  const { controller, renderContexts } = createController();
  controller.showConfigScreen('local_coop');

  assert.equal(controller.getCurrentConfigPlayer(), 'hero_1');
  assert.equal(controller.getPveHeroSlots().length, 2);
  assert.equal(controller.canStartBattle(), false);

  controller.setCurrentPveHeroSlot('hero_1');
  controller.toggleLockCurrent();
  assert.equal(controller.canStartBattle(), false);

  controller.setCurrentPveHeroSlot('hero_2');
  controller.toggleLockCurrent();
  assert.equal(controller.canStartBattle(), true);

  const scenario = controller.buildPveBattleScenario(88);
  assert.equal(scenario.mode, 'pve_multi');
  assert.equal(scenario.combatants.length, 4);
  assert.equal(renderContexts.at(-1)?.pveHeroSlots?.length, 2);
}

{
  const { controller } = createController();
  controller.showConfigScreen('local_solo');

  assert.equal(controller.getCurrentConfigPlayer(), 'player1');
  assert.equal(controller.activeConfig().playerId, 'player1');
  assert.equal(controller.activeConfig().playerId === 'hero_1', false);

  controller.toggleLockCurrent();
  assert.equal(controller.canStartBattle(), true);

  const configs = controller.getBattlePlayerConfigs();
  assert.equal(configs.length, 2);
  assert.equal(configs[0].playerId, 'player1');
  assert.equal(configs[1].playerId, 'player2');
}

console.log('local_solo_vs_coop_config_test: passed');
