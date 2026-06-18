import {
  ROLE_DEFS,
  buildAllowedSkillIds,
  getDefaultLoadout,
  getDefaultRoleId,
  getDefaultRoleLoadout,
  normalizePlayerConfig,
} from './RoleData.js';

const DEFAULT_RULES = {
  victory: 'team_elimination',
  friendlyFire: false,
};

function classIdPart(className) {
  if (className === '法师') return 'mage';
  if (className === '战士') return 'warrior';
  return 'shooter';
}

function className(className) {
  if (className === '法师' || className === '战士' || className === '射手') return className;
  return '法师';
}

export function makeDefaultPosition(index, teamId) {
  const lane = index % 3;
  const q = lane - 1;
  const r = teamId === 'enemies' || teamId === 'player2' ? 2 : -2;
  return { q, r };
}

export function normalizeCombatantConfig(combatant, fallbackIndex = 0) {
  const charClass = className(combatant?.class);
  const roleId = ROLE_DEFS[combatant?.roleId]?.class === charClass
    ? combatant.roleId
    : getDefaultRoleId(charClass);
  const loadoutSkillIds = Array.isArray(combatant?.loadoutSkillIds)
    ? [...combatant.loadoutSkillIds]
    : getDefaultLoadout(charClass);
  const roleLoadoutSkillIds = Array.isArray(combatant?.roleLoadoutSkillIds)
    ? [...combatant.roleLoadoutSkillIds]
    : getDefaultRoleLoadout(roleId);
  const ownerId = combatant?.ownerId || combatant?.teamId || `owner_${fallbackIndex + 1}`;
  const teamId = combatant?.teamId || ownerId;
  const position = combatant?.position || makeDefaultPosition(fallbackIndex, teamId);

  return {
    id: combatant?.id || `char_${classIdPart(charClass)}_${fallbackIndex + 1}`,
    teamId,
    ownerId,
    control: combatant?.control || 'human',
    class: charClass,
    roleId,
    loadoutSkillIds,
    roleLoadoutSkillIds,
    allowedSkillIds: buildAllowedSkillIds(charClass, roleId, loadoutSkillIds, roleLoadoutSkillIds),
    position: { q: position.q ?? 0, r: position.r ?? 0 },
    resources: combatant?.resources ? { ...combatant.resources } : undefined,
    name: combatant?.name || undefined,
    tutorialUnit: combatant?.tutorialUnit || false,
  };
}

export function buildCombatantEntity(combatant, fallbackIndex = 0) {
  return normalizeCombatantConfig(combatant, fallbackIndex);
}

function legacyPlayerCombatant(config, fallbackPlayerId, fallbackPos, legacyFullClassSkills) {
  const normalized = normalizePlayerConfig(config, fallbackPlayerId);
  const role = ROLE_DEFS[normalized.roleId];
  const playerSuffix = fallbackPlayerId === 'player1' ? 'p1' : 'p2';
  const id = !legacyFullClassSkills
    ? `char_${normalized.roleId}_${playerSuffix}`
    : `char_${classIdPart(normalized.class)}_${playerSuffix}`;

  if (legacyFullClassSkills) {
    return {
      id,
      teamId: normalized.playerId,
      ownerId: normalized.playerId,
      control: 'human',
      class: normalized.class,
      roleId: null,
      loadoutSkillIds: null,
      roleLoadoutSkillIds: null,
      allowedSkillIds: null,
      position: fallbackPos,
      name: normalized.class,
    };
  }

  return {
    id,
    teamId: normalized.playerId,
    ownerId: normalized.playerId,
    control: 'human',
    class: normalized.class,
    roleId: normalized.roleId,
    loadoutSkillIds: [...normalized.loadoutSkillIds],
    roleLoadoutSkillIds: [...normalized.roleLoadoutSkillIds],
    allowedSkillIds: buildAllowedSkillIds(
      normalized.class,
      normalized.roleId,
      normalized.loadoutSkillIds,
      normalized.roleLoadoutSkillIds
    ),
    position: fallbackPos,
    name: role?.name || normalized.class,
  };
}

export function legacyDuelToScenario(scenario = {}) {
  const usingPlayerConfigs = Array.isArray(scenario.players) && scenario.players.length >= 2;
  const p1Source = usingPlayerConfigs
    ? (scenario.players.find(p => p.playerId === 'player1') || scenario.players[0])
    : { class: scenario.player1Class || '法师', playerId: 'player1' };
  const p2Source = usingPlayerConfigs
    ? (scenario.players.find(p => p.playerId === 'player2') || scenario.players[1])
    : { class: scenario.player2Class || '战士', playerId: 'player2' };
  const p1Pos = scenario.p1Pos || { q: 1, r: -2 };
  const p2Pos = scenario.p2Pos || { q: 1, r: 1 };
  const legacyFullClassSkills = !usingPlayerConfigs;

  const combatants = [
    legacyPlayerCombatant(p1Source, 'player1', p1Pos, legacyFullClassSkills),
    legacyPlayerCombatant(p2Source, 'player2', p2Pos, legacyFullClassSkills),
  ];

  return {
    mode: scenario.mode || 'duel',
    seed: scenario.seed || 0,
    legacy: true,
    player1Id: combatants[0].id,
    player2Id: combatants[1].id,
    teams: [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ],
    combatants,
    rules: { ...DEFAULT_RULES, ...(scenario.rules || {}) },
    initialWildBullets: Array.isArray(scenario.initialWildBullets)
      ? scenario.initialWildBullets.map(b => ({ q: b.q, r: b.r, count: b.count ?? 1 }))
      : [],
  };
}

function normalizeRosterScenario(scenario = {}) {
  if (!Array.isArray(scenario.combatants) || scenario.combatants.length === 0) {
    throw new Error('pve_multi scenario requires combatants');
  }

  const combatants = scenario.combatants.map((combatant, index) => {
    if (!combatant?.teamId) throw new Error(`combatant ${combatant?.id || index} requires teamId`);
    if (!combatant?.ownerId) throw new Error(`combatant ${combatant?.id || index} requires ownerId`);
    if (!combatant?.control) throw new Error(`combatant ${combatant?.id || index} requires control`);
    return normalizeCombatantConfig(combatant, index);
  });

  const teamMap = new Map();
  for (const team of scenario.teams || []) {
    if (!team?.teamId) throw new Error('team requires teamId');
    teamMap.set(team.teamId, {
      teamId: team.teamId,
      ownerId: team.ownerId || team.teamId,
      control: team.control || 'human',
      name: team.name || team.teamId,
    });
  }
  for (const combatant of combatants) {
    if (!teamMap.has(combatant.teamId)) {
      teamMap.set(combatant.teamId, {
        teamId: combatant.teamId,
        ownerId: combatant.ownerId,
        control: combatant.control,
        name: combatant.teamId,
      });
    }
  }

  return {
    mode: scenario.mode || 'pve_multi',
    seed: scenario.seed || 0,
    legacy: false,
    teams: [...teamMap.values()],
    combatants,
    rules: { ...DEFAULT_RULES, ...(scenario.rules || {}) },
    initialWildBullets: Array.isArray(scenario.initialWildBullets)
      ? scenario.initialWildBullets.map(b => ({ q: b.q, r: b.r, count: b.count ?? 1 }))
      : [],
  };
}

export function normalizeBattleScenario(scenario = {}) {
  if (Array.isArray(scenario.combatants)) {
    return normalizeRosterScenario(scenario);
  }
  return legacyDuelToScenario(scenario);
}
