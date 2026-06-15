export const QUICK_MODE_LOADOUTS = Object.freeze({
  '法师': Object.freeze([
    'mage_gather',
    'mage_small_qi_blast',
    'mage_qi_siphon',
    'mage_burst',
    'mage_teleport',
    'mage_reactive',
  ]),
  '战士': Object.freeze([
    'warrior_rage',
    'warrior_pressure',
    'warrior_dash',
    'warrior_slash',
    'warrior_sheathe',
    'warrior_iaido',
  ]),
  '射手': Object.freeze([
    'shooter_roll',
    'shooter_reload',
    'shooter_hook',
    'shooter_attack',
    'shooter_gun_dance',
    'shooter_iaido',
  ]),
});

function requireQuickModeLoadout(className) {
  const loadout = QUICK_MODE_LOADOUTS[className];
  if (!loadout) throw new Error(`Unknown quick mode class: ${className}`);
  return loadout;
}

function createQuickModePlayer(playerId, className) {
  const loadout = requireQuickModeLoadout(className);
  return {
    playerId,
    class: className,
    roleId: null,
    loadoutSkillIds: [...loadout],
    roleLoadoutSkillIds: [],
    locked: true,
    quickMode: true,
  };
}

export function createQuickModePlayers({ player1Class, player2Class }) {
  return [
    createQuickModePlayer('player1', player1Class),
    createQuickModePlayer('player2', player2Class),
  ];
}
