// Role definitions and loadout rules.
// Roles sit on top of classes: class controls resources, role controls identity
// and extra role skills.
import { SKILLS, SKILLS_BY_CLASS } from './SkillData.js';

export const LOADOUT_SIZE = 8;
export const ROLE_LOADOUT_SIZE = 2;

export const ROLE_TRAITS = {
  gunfighter_finesse:    { id: 'gunfighter_finesse',    name: '灵巧' },
  gunfighter_strong:     { id: 'gunfighter_strong',     name: '强者' },
  helldiver_laser_weapon:  { id: 'helldiver_laser_weapon',  name: '激光武器' },
  helldiver_priority_ready:{ id: 'helldiver_priority_ready',name: '优先战备' },
  helldiver_fast_ready:  { id: 'helldiver_fast_ready',  name: '快速战备' },
  helldiver_speed_draw:  { id: 'helldiver_speed_draw',  name: '全凭手速' },
  jimmy_breathing:       { id: 'jimmy_breathing',       name: '呼吸法' },
  jimmy_marrow:          { id: 'jimmy_marrow',          name: '易经洗髓酒' },
  mirror_slippery:       { id: 'mirror_slippery',       name: '脚底抹油' },
  mirror_dimension_child:{ id: 'mirror_dimension_child',name: '次元之子' },
  mirror_dimension_lord: { id: 'mirror_dimension_lord', name: '次元之主' },
  mirror_phase_sling:    { id: 'mirror_phase_sling',    name: '相位弹弓' },
  yan_death_wind:        { id: 'yan_death_wind',        name: '死亡如风' },
  duelist_minds_eye:     { id: 'duelist_minds_eye',     name: '心眼' },
  placeholder_adapt:     { id: 'placeholder_adapt',     name: '预留特质' },
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
    description: '通过呼吸节奏和主动喝洗髓酒成长的战士角色。',
    plannedMechanics: '呼吸法奇偶回合切换、洗髓五层主动突破(怒3/4/4/5/5)。',
  },
  warrior_duelist: {
    id: 'warrior_duelist',
    name: '逐风客',
    class: '战士',
    portraitTheme: 'amber',
    traitIds: ['duelist_minds_eye'],
    roleSkillIds: ['role_duelist_windstep'],
    description: '通过心眼弱点击破和逐风步穿梭斩击的高速近战角色。',
    plannedMechanics: '弱点标记方向判断、逐风步位移自动索敌、弱点击破回怒减CD。',
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
    traitIds: ['gunfighter_finesse', 'gunfighter_strong'],
    roleSkillIds: [],
    description: '用灵巧行动和强者被动压缩射击节奏的射手角色。',
    plannedMechanics: '每回合一个额外cost0行动点；残影多动和cost行动连发待后续扩展。',
  },
  shooter_helldiver: {
    id: 'shooter_helldiver',
    name: '绝地潜兵',
    class: '射手',
    portraitTheme: 'olive',
    traitIds: ['helldiver_laser_weapon', 'helldiver_priority_ready', 'helldiver_fast_ready', 'helldiver_speed_draw'],
    roleSkillIds: ['role_helldiver_supply_drop', 'role_helldiver_bombardment'],
    description: '通过呼叫补给空投、呼叫轰炸和技能急速控制战场的射手角色。',
    plannedMechanics: '补给箱拾取、延迟轰炸、技能冷却与急速、呼叫灵巧化。',
  },
  shooter_yan: {
    id: 'shooter_yan',
    name: '燕双鹰',
    class: '射手',
    portraitTheme: 'navy',
    traitIds: ['yan_death_wind'],
    roleSkillIds: ['role_yan_empty_gun'],
    description: '通过心理博弈封锁对手攻击，对手攻击落空时自动上弹的射手角色。',
    plannedMechanics: '死亡如风被动装填、我赌你的枪里没有子弹攻击取消。',
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
    .filter(skillId => SKILLS[skillId] && !SKILLS[skillId].hidden && !SKILLS[skillId].isTrait)
    .slice(0, LOADOUT_SIZE);
}

export function getDefaultRoleLoadout(roleId) {
  const skillIds = getRoleSkillPool(roleId);
  return skillIds.slice(0, ROLE_LOADOUT_SIZE);
}

// All selectable role skills (traits + active) for a given role
export function getRoleSkillPool(roleId) {
  const role = ROLE_DEFS[roleId];
  if (!role) return [];
  const pool = [];
  for (const traitId of role.traitIds) {
    const skillId = 'trait_' + traitId;
    if (SKILLS[skillId]) pool.push(skillId);
  }
  for (const skillId of role.roleSkillIds) {
    if (SKILLS[skillId] && !pool.includes(skillId)) pool.push(skillId);
  }
  return pool;
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
    if (skill.isTrait) return { ok: false, reason: 'trait_in_class_loadout', skillId };
  }
  return { ok: true };
}

export function validateRoleLoadout(roleId, skillIds, size = ROLE_LOADOUT_SIZE) {
  if (!Array.isArray(skillIds)) return { ok: false, reason: 'loadout_not_array' };
  if (skillIds.length > size) return { ok: false, reason: 'loadout_too_large' };

  const pool = getRoleSkillPool(roleId);
  const seen = new Set();
  for (const skillId of skillIds) {
    if (seen.has(skillId)) return { ok: false, reason: 'duplicate_skill', skillId };
    seen.add(skillId);

    const skill = SKILLS[skillId];
    if (!skill) return { ok: false, reason: 'unknown_skill', skillId };
    if (skill.hidden) return { ok: false, reason: 'hidden_skill', skillId };
    if (!pool.includes(skillId)) return { ok: false, reason: 'skill_not_for_role', skillId };
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

  const rawRoleLoadout = Array.isArray(config?.roleLoadoutSkillIds)
    ? config.roleLoadoutSkillIds
    : getDefaultRoleLoadout(roleId);
  const roleValidation = validateRoleLoadout(roleId, rawRoleLoadout);
  const roleLoadoutSkillIds = roleValidation.ok ? [...rawRoleLoadout] : getDefaultRoleLoadout(roleId);

  return {
    playerId: config?.playerId || fallbackPlayerId,
    class: className,
    roleId,
    loadoutSkillIds,
    roleLoadoutSkillIds,
    locked: Boolean(config?.locked),
  };
}

export function getRoleTraits(roleId) {
  const role = ROLE_DEFS[roleId];
  if (!role) return [];
  return role.traitIds.map(traitId => {
    const base = ROLE_TRAITS[traitId];
    if (!base) return null;
    const skill = SKILLS['trait_' + traitId];
    return { id: base.id, name: skill?.name || base.name, desc: skill?.desc || '' };
  }).filter(Boolean);
}

export function getRoleSkillIds(roleId) {
  return ROLE_DEFS[roleId]?.roleSkillIds || [];
}

export function buildAllowedSkillIds(className, roleId, loadoutSkillIds, roleLoadoutSkillIds) {
  const allowed = new Set([...(loadoutSkillIds || []), ...(roleLoadoutSkillIds || [])]);

  // Hidden skills are internal follow-ups listed in the class pool, such as
  // 丧钟·响 and 大荒星陨·坠.
  for (const skillId of SKILLS_BY_CLASS[className] || []) {
    const skill = SKILLS[skillId];
    if (skill?.hidden) allowed.add(skillId);
  }

  // Remove trait skills — they are passive markers, never submitted as actions
  for (const skillId of [...allowed]) {
    if (SKILLS[skillId]?.isTrait) allowed.delete(skillId);
  }

  return [...allowed];
}
