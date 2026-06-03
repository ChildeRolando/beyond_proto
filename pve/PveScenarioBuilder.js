import { ENEMY_PRESETS } from './EnemyPresets.js';

const HERO_POSITIONS = [
  { q: -1, r: -2 },
  { q: 0, r: -2 },
];

const DEFAULT_ENEMY_PRESET_IDS = ['warrior_basic', 'shooter_basic'];

function cloneLoadout(ids) {
  return Array.isArray(ids) ? [...ids] : undefined;
}

function buildHeroCombatant(config, index) {
  const id = `hero_${index + 1}`;
  return {
    id,
    teamId: 'heroes',
    ownerId: 'player1',
    control: 'human',
    class: config.class,
    roleId: config.roleId,
    loadoutSkillIds: cloneLoadout(config.loadoutSkillIds),
    roleLoadoutSkillIds: cloneLoadout(config.roleLoadoutSkillIds),
    position: { ...HERO_POSITIONS[index] },
  };
}

function buildEnemyCombatant(presetId, index) {
  const preset = ENEMY_PRESETS[presetId];
  if (!preset) throw new Error(`unknown enemy preset: ${presetId}`);
  return {
    id: `enemy_${index + 1}`,
    teamId: 'enemies',
    ownerId: 'ai',
    control: 'ai',
    class: preset.class,
    position: { ...preset.position },
  };
}

export function buildPveRosterScenario({
  heroConfigs,
  enemyPresetIds = DEFAULT_ENEMY_PRESET_IDS,
  seed = Date.now(),
} = {}) {
  if (!Array.isArray(heroConfigs) || heroConfigs.length < 2) {
    throw new Error('buildPveRosterScenario requires two hero configs');
  }

  return {
    mode: 'pve_multi',
    seed,
    teams: [
      { teamId: 'heroes', ownerId: 'player1', control: 'human', name: '玩家队伍' },
      { teamId: 'enemies', ownerId: 'ai', control: 'ai', name: '敌方' },
    ],
    combatants: [
      buildHeroCombatant(heroConfigs[0], 0),
      buildHeroCombatant(heroConfigs[1], 1),
      ...enemyPresetIds.map((presetId, index) => buildEnemyCombatant(presetId, index)),
    ],
    rules: {
      victory: 'team_elimination',
      friendlyFire: false,
    },
  };
}

