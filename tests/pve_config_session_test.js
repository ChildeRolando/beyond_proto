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

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}`);
}

function cloneConfig(cfg) {
  return {
    playerId: cfg.playerId,
    class: cfg.class,
    roleId: cfg.roleId,
    loadoutSkillIds: [...cfg.loadoutSkillIds],
    roleLoadoutSkillIds: [...(cfg.roleLoadoutSkillIds || [])],
    locked: Boolean(cfg.locked),
  };
}

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
    cloneConfig,
  });
  return { controller, renderContexts };
}

console.log('=== PVE Config Session Tests ===\n');

const { controller, renderContexts } = createController();
controller.showConfigScreen('pve');

const slots = controller.getPveHeroSlots();
check('PVE mode creates hero_1 and hero_2 slots',
  slots.length === 2 && slots[0].playerId === 'hero_1' && slots[1].playerId === 'hero_2',
  JSON.stringify(slots));
check('PVE starts on hero_1 slot',
  controller.getCurrentConfigPlayer() === 'hero_1' && controller.activePveHeroConfig().playerId === 'hero_1',
  JSON.stringify({ current: controller.getCurrentConfigPlayer(), active: controller.activePveHeroConfig() }));

controller.setActiveClass('射手');
controller.setCurrentPveHeroSlot('hero_2');
check('hero slot configs are independent',
  controller.getPveHeroSlots()[0].class === '射手' && controller.activePveHeroConfig().class === '战士',
  JSON.stringify(controller.getPveHeroSlots()));

check('PVE cannot start before both hero slots are locked',
  controller.canStartBattle() === false,
  JSON.stringify(controller.getPveHeroSlots()));

controller.setCurrentPveHeroSlot('hero_1');
controller.toggleLockCurrent();
check('PVE still cannot start after one hero lock',
  controller.canStartBattle() === false,
  JSON.stringify(controller.getPveHeroSlots()));

controller.setCurrentPveHeroSlot('hero_2');
controller.toggleLockCurrent();
check('PVE can start after both hero slots are locked',
  controller.canStartBattle() === true,
  JSON.stringify(controller.getPveHeroSlots()));

const scenario = controller.buildPveBattleScenario(88);
check('PVE config builds pve_multi scenario',
  scenario.mode === 'pve_multi' && scenario.seed === 88,
  JSON.stringify(scenario));
check('PVE scenario includes hero and enemy combatants',
  scenario.combatants.map(c => c.id).join(',') === 'hero_1,hero_2,enemy_1,enemy_2',
  JSON.stringify(scenario.combatants));
check('PVE view context exposes hero slots and fixed enemies',
  renderContexts.at(-1)?.pveHeroSlots?.length === 2 && renderContexts.at(-1)?.pveEnemyPresets?.length === 2,
  JSON.stringify(renderContexts.at(-1)));
