// Role definitions and loadout rules.
// Roles sit on top of classes: class controls resources, role controls identity
// and extra role skills.
import { SKILLS, SKILLS_BY_CLASS } from './SkillData.js';

export const LOADOUT_SIZE = 8;

export const ROLE_TRAITS = {
  gunfighter_finesse: {
    id: 'gunfighter_finesse',
    name: '灵巧',
    desc: '每回合可额外提交一个cost0行动，且不挤占付费主行动。',
  },
  gunfighter_rapid_fire: {
    id: 'gunfighter_rapid_fire',
    name: '速射',
    desc: '围绕额外cost0行动压缩射手节奏。',
  },
  helldiver_laser_weapon: {
    id: 'helldiver_laser_weapon',
    name: '激光武器',
    desc: '弹药会自动蓄能，且没有弹药上限。机制占位。',
  },
  helldiver_priority_ready: {
    id: 'helldiver_priority_ready',
    name: '优先战备',
    desc: '呼叫技能冷却减少。机制占位。',
  },
  helldiver_fast_ready: {
    id: 'helldiver_fast_ready',
    name: '快速战备',
    desc: '呼叫技能速度提高。机制占位。',
  },
  jimmy_breathing: {
    id: 'jimmy_breathing',
    name: '呼吸法',
    desc: '奇偶回合在怒气、距离、消耗间切换强化。机制占位。',
  },
  mirror_slippery: {
    id: 'mirror_slippery',
    name: '脚底抹油',
    desc: '次元之门不占用行动点。机制占位。',
  },
  mirror_dimension_child: {
    id: 'mirror_dimension_child',
    name: '次元之子',
    desc: '独处于次元时获得次元token。机制占位。',
  },
  mirror_dimension_lord: {
    id: 'mirror_dimension_lord',
    name: '次元之主',
    desc: '积累token后解锁次元系永久强化。机制占位。',
  },
  mirror_phase_sling: {
    id: 'mirror_phase_sling',
    name: '相位弹弓',
    desc: '技能穿过次元门后加速并提高威力。机制占位。',
  },
  placeholder_adapt: {
    id: 'placeholder_adapt',
    name: '预留特质',
    desc: '用于占位角色的职业特质。机制占位。',
  },
};

export const ROLE_DEFS = {
  mage_mirror: {
    id: 'mage_mirror',
    name: '镜',
    class: '法师',
    portraitTheme: 'violet',
    traitIds: ['mirror_slippery', 'mirror_dimension_child', 'mirror_dimension_lord', 'mirror_phase_sling'],
    roleSkillIds: ['role_mirror_return_jump', 'role_mirror_phase_sync'],
    description: '围绕次元门、token和相位攻击成长的法师角色。',
    plannedMechanics: '次元token、无行动穿越、次元免疫、相位加速。',
  },
  mage_stargazer: {
    id: 'mage_stargazer',
    name: '观星者',
    class: '法师',
    portraitTheme: 'indigo',
    traitIds: ['placeholder_adapt'],
    roleSkillIds: ['role_stargazer_orbit'],
    description: '占位法师角色，用于验证角色轮播容量。',
    plannedMechanics: '星象蓄力和延迟落点。',
  },
  mage_gatekeeper: {
    id: 'mage_gatekeeper',
    name: '门徒',
    class: '法师',
    portraitTheme: 'cyan',
    traitIds: ['placeholder_adapt'],
    roleSkillIds: ['role_gatekeeper_anchor'],
    description: '占位法师角色，用于后续空间控制设计。',
    plannedMechanics: '门锚、换位和空间标记。',
  },

  warrior_jimmy: {
    id: 'warrior_jimmy',
    name: '吉米',
    class: '战士',
    portraitTheme: 'crimson',
    traitIds: ['jimmy_breathing'],
    roleSkillIds: ['role_jimmy_marrow_wine'],
    description: '通过呼吸节奏和洗髓层数成长的战士角色。',
    plannedMechanics: '奇偶回合强化、洗髓永久成长、局内升级。',
  },
  warrior_duelist: {
    id: 'warrior_duelist',
    name: '逐风剑客',
    class: '战士',
    portraitTheme: 'amber',
    traitIds: ['placeholder_adapt'],
    roleSkillIds: ['role_duelist_windstep'],
    description: '占位战士角色，用于后续高速近战设计。',
    plannedMechanics: '连斩、闪避和追击。',
  },
  warrior_vanguard: {
    id: 'warrior_vanguard',
    name: '破阵武者',
    class: '战士',
    portraitTheme: 'steel',
    traitIds: ['placeholder_adapt'],
    roleSkillIds: ['role_vanguard_breakline'],
    description: '占位战士角色，用于后续破阵抗压设计。',
    plannedMechanics: '阵法压制和前排减伤。',
  },

  shooter_gunfighter: {
    id: 'shooter_gunfighter',
    name: '枪侠',
    class: '射手',
    portraitTheme: 'copper',
    traitIds: ['gunfighter_finesse', 'gunfighter_rapid_fire'],
    roleSkillIds: [],
    description: '用灵巧行动和速射压缩射击节奏的射手角色。',
    plannedMechanics: '每回合一个额外cost0行动点；残影多动和cost行动连发待后续扩展。',
  },
  shooter_helldiver: {
    id: 'shooter_helldiver',
    name: '绝地潜兵',
    class: '射手',
    portraitTheme: 'olive',
    traitIds: ['helldiver_laser_weapon', 'helldiver_priority_ready', 'helldiver_fast_ready'],
    roleSkillIds: ['role_helldiver_supply_drop', 'role_helldiver_precision_strike'],
    description: '使用呼叫补给和精准轰炸控制战场的射手角色。',
    plannedMechanics: '呼叫技能、冷却、每场次数、弹药自动蓄能。',
  },
  shooter_yan: {
    id: 'shooter_yan',
    name: '燕双鹰',
    class: '射手',
    portraitTheme: 'navy',
    traitIds: ['placeholder_adapt'],
    roleSkillIds: ['role_yan_empty_gun'],
    description: '通过心理博弈封锁对手攻击的射手角色。',
    plannedMechanics: '选定角色，本回合若其攻击则取消攻击但不返还费用。',
  },
};

export function getRolesByClass(className) {
  return Object.values(ROLE_DEFS).filter(role => role.class === className);
}

export function getDefaultRoleId(className) {
  return getRolesByClass(className)[0]?.id || null;
}

export function getDefaultLoadout(className) {
  return (SKILLS_BY_CLASS[className] || [])
    .filter(skillId => SKILLS[skillId] && !SKILLS[skillId].hidden)
    .slice(0, LOADOUT_SIZE);
}

export function validateLoadout(className, skillIds, size = LOADOUT_SIZE) {
  if (!Array.isArray(skillIds)) return { ok: false, reason: 'loadout_not_array' };
  if (skillIds.length > size) return { ok: false, reason: 'loadout_too_large' };

  const seen = new Set();
  for (const skillId of skillIds) {
    if (seen.has(skillId)) return { ok: false, reason: 'duplicate_skill', skillId };
    seen.add(skillId);

    const skill = SKILLS[skillId];
    if (!skill) return { ok: false, reason: 'unknown_skill', skillId };
    if (skill.hidden) return { ok: false, reason: 'hidden_skill', skillId };
    if (skill.class !== className) return { ok: false, reason: 'cross_class_skill', skillId };
  }
  return { ok: true };
}

export function normalizePlayerConfig(config, fallbackPlayerId = 'player1') {
  const className = config?.class || '法师';
  const roleId = ROLE_DEFS[config?.roleId]?.class === className
    ? config.roleId
    : getDefaultRoleId(className);
  const rawLoadout = Array.isArray(config?.loadoutSkillIds)
    ? config.loadoutSkillIds
    : getDefaultLoadout(className);
  const validation = validateLoadout(className, rawLoadout);
  const loadoutSkillIds = validation.ok ? [...rawLoadout] : getDefaultLoadout(className);

  return {
    playerId: config?.playerId || fallbackPlayerId,
    class: className,
    roleId,
    loadoutSkillIds,
    locked: Boolean(config?.locked),
  };
}

export function getRoleTraits(roleId) {
  const role = ROLE_DEFS[roleId];
  if (!role) return [];
  return role.traitIds.map(id => ROLE_TRAITS[id]).filter(Boolean);
}

export function getRoleSkillIds(roleId) {
  return ROLE_DEFS[roleId]?.roleSkillIds || [];
}

export function buildAllowedSkillIds(className, roleId, loadoutSkillIds) {
  const allowed = new Set([...(loadoutSkillIds || []), ...getRoleSkillIds(roleId)]);

  // Hidden skills are internal follow-ups listed in the class pool, such as
  // 丧钟·响 and 大荒星陨·坠. Passive role markers stay unavailable.
  for (const skillId of SKILLS_BY_CLASS[className] || []) {
    const skill = SKILLS[skillId];
    if (skill?.hidden) allowed.add(skillId);
  }
  return [...allowed];
}
