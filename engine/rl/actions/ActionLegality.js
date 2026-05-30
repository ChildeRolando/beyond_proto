// Shared action legality helpers for RL layer.
// Used by both ActionMask.js and LegalOrderProvider.js to prevent rule drift.
//
// Known coupling: isPureRepositionSkill() still depends on engine/ai/PrimitiveProfile.js
// for pure reposition detection. Migration to skill semantics is deferred.

import { getSkillPrimitiveProfile, PrimitiveTag } from '../../ai/PrimitiveProfile.js';

const JIMMY_WINE_COSTS = [3, 4, 4, 5, 5];

export function getEffectiveSkillCost(engine, characterId, skill) {
  if (skill.id === 'role_jimmy_marrow_wine') {
    const buffs = engine.buffManager?.getActiveBuffs(characterId) || [];
    const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
    const layer = marrow?.data?.layer || 0;
    return { rage: layer < JIMMY_WINE_COSTS.length ? JIMMY_WINE_COSTS[layer] : 999 };
  }
  return skill.cost || {};
}

export function hasSufficientSkillCost(engine, characterId, skill) {
  const cost = getEffectiveSkillCost(engine, characterId, skill);
  return engine.resourceSystem.canAfford(characterId, cost);
}

export function hasSufficientEffectResources(engine, characterId, skill) {
  for (const eff of skill.effects || []) {
    if (eff.cmd !== 'CONSUME_RESOURCE') continue;
    const current = engine.resourceSystem.get(characterId, eff.resource);
    if (eff.amount === 'ALL') {
      if (current <= 0) return false;
    } else if (typeof eff.amount === 'number') {
      if (current < eff.amount) return false;
    }
  }
  return true;
}

export function isSkillSubmitAllowed(engine, characterId, skillId) {
  const result = engine.canSubmitAction(characterId, skillId);
  return result.ok === true;
}

export function isPureRepositionSkill(skillId) {
  const profile = getSkillPrimitiveProfile(skillId);
  return profile.tags.includes(PrimitiveTag.ESCAPE) &&
    !profile.tags.includes(PrimitiveTag.PRESSURE) &&
    !profile.tags.includes(PrimitiveTag.CONTROL);
}

export function passesTargetFilter(engine, character, q, r, filter, occupiable = false) {
  if (typeof filter === 'function') return filter({ q, r }, character, engine.registry);
  if (filter === 'NOT_OCCUPIED_BY_ENEMY') {
    return !engine.registry.getAt(q, r).some(entity =>
      entity.type === 'CHARACTER' && entity.alive !== false && entity.ownerId !== character.ownerId
    );
  }
  if (occupiable) {
    return !engine.registry.getAt(q, r).some(entity =>
      entity.type === 'CHARACTER' && entity.alive !== false
    );
  }
  return true;
}

export function isSkillVisibleAndSubmittable(skill) {
  if (!skill) return false;
  return !skill.hidden && !skill.isTrait;
}

export function getTargetShape(skill) {
  const targeting = skill.targeting || {};
  return targeting.shape || 'SELF';
}

export function isSelfTargetShape(shape) {
  return shape === 'SELF' || shape === 'AOE_SELF';
}

export function getEffectiveSkillRange(engine, characterId, skill) {
  const targeting = skill.targeting || {};
  return engine.getEffectiveRange(characterId, targeting.range ?? 0);
}
