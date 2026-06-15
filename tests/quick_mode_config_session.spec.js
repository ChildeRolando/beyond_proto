import { test, expect } from 'playwright/test';
import { ConfigSessionController } from '../session/ConfigSessionController.js';
import { GameMode } from '../app/GameModes.js';
import { QUICK_MODE_LOADOUTS } from '../engine/QuickModePreset.js';
import {
  LOADOUT_SIZE,
  ROLE_LOADOUT_SIZE,
  ROLE_DEFS,
  getDefaultLoadout,
  getDefaultRoleLoadout,
  getDefaultRoleId,
  getRolesByClass,
  normalizePlayerConfig,
  validateLoadout,
  validateRoleLoadout,
} from '../engine/RoleData.js';

function createConfigSession() {
  const sentUpdates = [];
  const sentLocks = [];
  const routes = [];
  const controller = new ConfigSessionController({
    routeController: {
      setRoute: (route) => routes.push(route),
    },
    battleSession: {
      resetForConfigScreen: () => {},
    },
    getNetworkManager: () => ({ myPlayerId: 'player1', roomCode: 'ABCD' }),
    renderConfigScreenView: () => {},
    sendConfigUpdate: () => sentUpdates.push(true),
    sendConfigLock: () => sentLocks.push(true),
    maybeStartP2PBattle: () => {},
    callbacks: {},
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
  return { controller, sentUpdates, sentLocks, routes };
}

test('quick mode class changes generate fixed quick battle configs without roles', () => {
  const { controller } = createConfigSession();

  controller.showConfigScreen(GameMode.P2P_DUEL);
  controller.setP2PSubMode('quick');
  controller.setActiveClass('射手');

  const [player1, player2] = controller.getBattlePlayerConfigs();
  expect(player1).toMatchObject({
    playerId: 'player1',
    class: '射手',
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['射手'],
    roleLoadoutSkillIds: [],
    locked: true,
    quickMode: true,
  });
  expect(player2).toMatchObject({
    playerId: 'player2',
    class: '战士',
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['战士'],
    roleLoadoutSkillIds: [],
    locked: true,
    quickMode: true,
  });
});

test('draft mode keeps role loadout configs instead of applying quick presets', () => {
  const { controller } = createConfigSession();

  controller.showConfigScreen(GameMode.P2P_DUEL);
  controller.setP2PSubMode('draft');
  const before = controller.getBattlePlayerConfigs()[0];

  expect(before.quickMode).toBeUndefined();
  expect(before.roleId).toBeTruthy();
  expect(before.loadoutSkillIds).toHaveLength(LOADOUT_SIZE);
  expect(before.roleLoadoutSkillIds).toHaveLength(ROLE_LOADOUT_SIZE);
  expect(before.loadoutSkillIds).not.toEqual(QUICK_MODE_LOADOUTS[before.class]);
});

test('quick mode lock toggles without requiring full draft loadouts', () => {
  const { controller, sentLocks } = createConfigSession();

  controller.showConfigScreen(GameMode.P2P_DUEL);
  controller.setP2PSubMode('quick');
  controller.toggleLockCurrent();

  expect(controller.getConfigPlayers().player1.locked).toBe(true);
  expect(controller.getBattlePlayerConfigs()[0].locked).toBe(true);
  expect(sentLocks).toEqual([true]);
});
