import { SKILLS } from '../SkillData.js';

export const PrimitiveTag = Object.freeze({
  KILL: 'KILL',
  PRESSURE: 'PRESSURE',
  DEFEND: 'DEFEND',
  ESCAPE: 'ESCAPE',
  BUILD: 'BUILD',
  INVEST: 'INVEST',
  CONTROL: 'CONTROL',
  DENY: 'DENY',
  SETUP: 'SETUP',
  COUNTER: 'COUNTER',
  BAIT: 'BAIT',
  STALL: 'STALL',

  LOW_COMMIT: 'LOW_COMMIT',
  COMMIT: 'COMMIT',
  HIGH_COMMIT: 'HIGH_COMMIT',
  ALL_IN: 'ALL_IN',
  GREED: 'GREED',

  MELEE_THREAT: 'MELEE_THREAT',
  PROJECTILE_THREAT: 'PROJECTILE_THREAT',
  AREA_THREAT: 'AREA_THREAT',
  DELAYED_THREAT: 'DELAYED_THREAT',
  LOCK_THREAT: 'LOCK_THREAT',
  PIERCE_THREAT: 'PIERCE_THREAT',
  RESOURCE_THREAT: 'RESOURCE_THREAT',
  POSITION_THREAT: 'POSITION_THREAT',
  SCALING_THREAT: 'SCALING_THREAT',
  REACTION_THREAT: 'REACTION_THREAT',

  AVOID_MELEE: 'AVOID_MELEE',
  AVOID_PROJECTILE: 'AVOID_PROJECTILE',
  BLOCK_DAMAGE: 'BLOCK_DAMAGE',
  INTERCEPT_PROJECTILE: 'INTERCEPT_PROJECTILE',
  BREAK_DEFENSE: 'BREAK_DEFENSE',
  DISRUPT_GREED: 'DISRUPT_GREED',
  DISRUPT_SETUP: 'DISRUPT_SETUP',
  DISRUPT_SCALING: 'DISRUPT_SCALING',
  ANSWER_AREA: 'ANSWER_AREA',
  ANSWER_LOCK: 'ANSWER_LOCK',
});

const ATTACK_EFFECTS = new Set([
  'ATTACK_MELEE',
  'ATTACK_PROJECTILE',
  'ATTACK_AOE_SELF',
  'ATTACK_AOE_PATH',
  'ATTACK_AOE_TARGET',
  'ATTACK_LINE',
  'SPAWN_STATIONARY_AOE',
]);

const MOVE_EFFECTS = new Set(['MOVE_WALK', 'MOVE_TELEPORT', 'MOVE_DASH', 'MOVE_GRAPNEL']);
const RESOURCE_STATUS = new Set(['BREATH_TIDE', 'MULTI_CAST_PENDING']);
const CONTROL_STATUS = new Set(['ROOTED', 'LOCKED', 'YAN_EMPTY_GUN']);
const DEFENSE_STATUS = new Set(['SHIELD_ACTIVE', 'BLOCKING', 'SHEATHED', 'COVERING_FIRE']);

export function getSkillPrimitiveProfile(skillId) {
  const skill = SKILLS[skillId];
  if (!skill) return emptyProfile(skillId);

  const profile = emptyProfile(skillId);
  profile.speed = skill.speed ?? 1;
  profile.range = skill.targeting?.range ?? 0;
  profile.areaRadius = skill.targeting?.radius ?? 0;
  profile.commitment = commitmentFromCost(skill.cost || {});
  profile.cost = normalizedCost(skill.cost || {});

  for (const effect of skill.effects || []) {
    applyEffect(profile, effect, skill);
  }

  applyDerivedTags(profile, skill);
  profile.tags = [...profile._tags];
  delete profile._tags;
  return profile;
}

export function skillHasTag(skillId, tag) {
  return getSkillPrimitiveProfile(skillId).tags.includes(tag);
}

function emptyProfile(skillId) {
  return {
    skillId,
    tags: [],
    _tags: new Set(),
    cost: {},
    resourceDelta: {},
    maxPower: 0,
    attackParts: 0,
    commitment: 0,
    speed: 1,
    range: 0,
    areaRadius: 0,
  };
}

function applyEffect(profile, effect, skill) {
  if (ATTACK_EFFECTS.has(effect.cmd)) applyAttackEffect(profile, effect, skill);
  if (MOVE_EFFECTS.has(effect.cmd)) {
    // 折返跃迁: temporary dodge, not real repositioning
    const isJumpReturn = (skill.effects || []).some(e => e.cmd === 'SET_FLAG' && e.flag === 'jumpReturn');
    if (isJumpReturn) {
      addTag(profile, PrimitiveTag.DEFEND);
      addTag(profile, PrimitiveTag.AVOID_PROJECTILE);
      // Don't tag ESCAPE / AVOID_MELEE / ANSWER_AREA — net position unchanged
    } else {
      applyMoveEffect(profile, effect);
    }
  }

  if (effect.cmd === 'GAIN_RESOURCE') {
    addTag(profile, PrimitiveTag.BUILD);
    addDelta(profile, effect.resource, numeric(effect.amount));
  }
  // 翻滚/钩锁 pick up casings — shooter's actual gathering actions
  if (effect.cmd === 'COLLECT_CASINGS') {
    addTag(profile, PrimitiveTag.BUILD);
    const estimated = effect.area === 'PATH' ? 2 : 1;
    addDelta(profile, 'backpackAmmo', estimated);
  }
  if (effect.cmd === 'SET_FLAG' && effect.flag === 'pendingQi') {
    addTag(profile, PrimitiveTag.BUILD);
    addDelta(profile, 'qi', 1);
  }
  if (effect.cmd === 'CONSUME_RESOURCE') {
    addDelta(profile, effect.resource, -numeric(effect.amount));
  }
  if (effect.cmd === 'APPLY_STATUS') applyStatusEffect(profile, effect);
  if (effect.cmd === 'DELAYED_SKILL') {
    addTag(profile, PrimitiveTag.SETUP);
    addTag(profile, PrimitiveTag.DELAYED_THREAT);
  }
  if (effect.cmd === 'CREATE_FORMATION' || effect.cmd === 'CREATE_GATE' || effect.cmd === 'MULTI_CAST') {
    addTag(profile, PrimitiveTag.SETUP);
  }
  if (effect.cmd === 'BREAK_FORMATION') {
    addTag(profile, PrimitiveTag.DENY);
    addTag(profile, PrimitiveTag.DISRUPT_SETUP);
  }
  if (effect.cmd === 'MOVE_PULL') {
    addTag(profile, PrimitiveTag.CONTROL);
    addTag(profile, PrimitiveTag.POSITION_THREAT);
  }
  if (effect.cmd === 'GALAXY_SUBTURN') {
    addTag(profile, PrimitiveTag.INVEST);
    addTag(profile, PrimitiveTag.SCALING_THREAT);
  }
}

function applyAttackEffect(profile, effect, skill) {
  addTag(profile, PrimitiveTag.PRESSURE);
  profile.attackParts += 1;
  profile.maxPower = Math.max(profile.maxPower, numeric(effect.power));
  profile.areaRadius = Math.max(profile.areaRadius, numeric(effect.radius));

  if (effect.cmd === 'ATTACK_MELEE') addTag(profile, PrimitiveTag.MELEE_THREAT);
  if (effect.cmd === 'ATTACK_PROJECTILE' || effect.cmd === 'ATTACK_LINE') addTag(profile, PrimitiveTag.PROJECTILE_THREAT);
  if (['ATTACK_AOE_SELF', 'ATTACK_AOE_PATH', 'ATTACK_AOE_TARGET', 'SPAWN_STATIONARY_AOE'].includes(effect.cmd)) {
    addTag(profile, PrimitiveTag.AREA_THREAT);
  }
  if ((effect.flags || []).includes('ARMOR_PIERCE')) {
    addTag(profile, PrimitiveTag.PIERCE_THREAT);
    addTag(profile, PrimitiveTag.BREAK_DEFENSE);
  }
  if ((effect.flags || []).includes('BREAK_ARMOR')) {
    addTag(profile, PrimitiveTag.BREAK_DEFENSE);
  }
  if (effect.power === 'SHIELD_CURRENT') {
    addTag(profile, PrimitiveTag.COUNTER);
    addTag(profile, PrimitiveTag.REACTION_THREAT);
  }
  if (skill.targeting?.shape === 'AOE_SELF') addTag(profile, PrimitiveTag.AREA_THREAT);
}

function applyMoveEffect(profile, effect) {
  addTag(profile, PrimitiveTag.ESCAPE);
  addTag(profile, PrimitiveTag.AVOID_MELEE);
  addTag(profile, PrimitiveTag.AVOID_PROJECTILE);
  addTag(profile, PrimitiveTag.ANSWER_AREA);
  if (effect.cmd === 'MOVE_DASH' || effect.cmd === 'MOVE_GRAPNEL') {
    addTag(profile, PrimitiveTag.POSITION_THREAT);
  }
}

function applyStatusEffect(profile, effect) {
  const status = effect.status;
  if (RESOURCE_STATUS.has(status)) {
    addTag(profile, PrimitiveTag.INVEST);
    addTag(profile, PrimitiveTag.SCALING_THREAT);
  }
  if (CONTROL_STATUS.has(status)) {
    addTag(profile, PrimitiveTag.CONTROL);
    addTag(profile, PrimitiveTag.LOCK_THREAT);
    addTag(profile, PrimitiveTag.DENY);
  }
  if (DEFENSE_STATUS.has(status)) {
    addTag(profile, PrimitiveTag.DEFEND);
    addTag(profile, PrimitiveTag.STALL);
    addTag(profile, PrimitiveTag.BLOCK_DAMAGE);
    addTag(profile, PrimitiveTag.AVOID_PROJECTILE);
  }
  if (status === 'SHEATHED' || status === 'COVERING_FIRE') {
    addTag(profile, PrimitiveTag.INTERCEPT_PROJECTILE);
  }
  if (status === 'SPEED_BOOST') {
    addTag(profile, PrimitiveTag.SETUP);
  }
  if (status === 'SURE_HIT') {
    addTag(profile, PrimitiveTag.SETUP);
    addTag(profile, PrimitiveTag.PRESSURE);
  }
}

function applyDerivedTags(profile, skill) {
  if (profile.maxPower >= 500) addTag(profile, PrimitiveTag.KILL);
  if (profile.commitment === 0) addTag(profile, PrimitiveTag.LOW_COMMIT);
  else if (profile.commitment <= 3) addTag(profile, PrimitiveTag.COMMIT);
  else if (profile.commitment <= 6) addTag(profile, PrimitiveTag.HIGH_COMMIT);
  else addTag(profile, PrimitiveTag.ALL_IN);

  const hasCost = profile.commitment > 0;
  const hasImmediatePressure = profile._tags.has(PrimitiveTag.PRESSURE);
  if (hasCost && !hasImmediatePressure && (profile._tags.has(PrimitiveTag.BUILD) || profile._tags.has(PrimitiveTag.INVEST) || profile._tags.has(PrimitiveTag.SETUP))) {
    addTag(profile, PrimitiveTag.GREED);
  }
  if (!hasImmediatePressure && (profile._tags.has(PrimitiveTag.INVEST) || profile._tags.has(PrimitiveTag.SCALING_THREAT))) {
    addTag(profile, PrimitiveTag.DISRUPT_GREED);
  }
  if (skill.targeting?.shape === 'SELF' && profile._tags.has(PrimitiveTag.AREA_THREAT)) {
    addTag(profile, PrimitiveTag.COUNTER);
  }
}

function normalizedCost(cost) {
  const result = {};
  for (const [resource, amount] of Object.entries(cost)) {
    result[resource] = numeric(amount);
  }
  return result;
}

function commitmentFromCost(cost) {
  return Object.values(cost).reduce((sum, amount) => sum + numeric(amount), 0);
}

function addDelta(profile, resource, amount) {
  if (!resource || amount === 0) return;
  profile.resourceDelta[resource] = (profile.resourceDelta[resource] || 0) + amount;
}

function addTag(profile, tag) {
  profile._tags.add(tag);
}

function numeric(value) {
  return typeof value === 'number' ? value : 0;
}
