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

  assert.equal(controller.getCurrentConfigPlayer(), 'player1');
  assert.equal(renderContexts.at(-1)?.legacyPveMode, false);
  assert.equal(renderContexts.at(-1)?.configPlayers?.player1?.playerId, 'player1');
  assert.equal(renderContexts.at(-1)?.configPlayers?.player2?.playerId, 'player2');
  assert.equal(controller.canStartBattle(), false);

  controller.setActiveClass('射手');
  controller.toggleLockCurrent();
  assert.equal(controller.canStartBattle(), false);

  controller.setCurrentConfigPlayer('player2');
  controller.setActiveClass('法师');
  controller.toggleLockCurrent();
  assert.equal(controller.canStartBattle(), true);

  const configs = controller.getBattlePlayerConfigs();
  assert.equal(configs.length, 2);
  assert.equal(configs[0].playerId, 'player1');
  assert.equal(configs[1].playerId, 'player2');
  assert.notEqual(configs[0].class, configs[1].class);
}

{
  const { controller } = createController();
  controller.showConfigScreen('local_solo');

  assert.equal(controller.getCurrentConfigPlayer(), 'player1');
  assert.equal(controller.activeConfig().playerId, 'player1');
  assert.equal(controller.activeConfig().playerId === 'player1', true);

  controller.toggleLockCurrent();
  assert.equal(controller.canStartBattle(), true);

  const configs = controller.getBattlePlayerConfigs();
  assert.equal(configs.length, 2);
  assert.equal(configs[0].playerId, 'player1');
  assert.equal(configs[1].playerId, 'player2');
}

console.log('local_solo_vs_coop_config_test: passed');
