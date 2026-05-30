import { hexDistance } from '../../HexMath.js';
import { SKILLS } from '../../SkillData.js';
import { TARGET_SELF, ACTION_COUNT } from './ActionEncoder.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from '../../ai/PrimitiveProfile.js';

const BOARD_HEX_COUNT = 37;

export function buildActionMask(engine, characterId, actionEncoder) {
  const mask = new Uint8Array(ACTION_COUNT);
  const state = engine.getState();
  const character = state.characters?.find(c => c.id === characterId);
  if (!character || character.alive === false) return mask;

  const skills = character.skills || [];
  const position = character.position;

  for (let slot = 0; slot < 10; slot++) {
    if (slot >= skills.length) continue;

    const skillId = skills[slot].id;
    const skill = SKILLS[skillId];
    if (!skill || skill.hidden || skill.isTrait) continue;

    // Affordability — use effective cost (handles Jimmy marrow dynamic cost)
    const effectiveCost = getEffectiveSkillCost(engine, characterId, skill);
    if (!engine.resourceSystem.canAfford(characterId, effectiveCost)) continue;

    // Effect-level resource consumption (e.g. CONSUME_RESOURCE amount:'ALL')
    if (!hasSufficientEffectResources(engine, characterId, skill)) continue;

    // Action point check
    const apResult = engine.canSubmitAction(characterId, skillId);
    if (!apResult.ok) continue;

    const targeting = skill.targeting || {};
    const shape = targeting.shape || 'SELF';

    if (shape === 'SELF' || shape === 'AOE_SELF') {
      const idx = actionEncoder.encode({ skillSlot: slot, targetIndex: TARGET_SELF });
      if (idx >= 0) mask[idx] = 1;
    } else {
      const range = engine.getEffectiveRange(characterId, targeting.range ?? 0);
      const filter = targeting.filter;
      const occupiable = isPureReposition(skillId);

      for (let ti = 0; ti < BOARD_HEX_COUNT; ti++) {
        const hex = actionEncoder._hexIndex.indexToHex(ti);
        if (!hex) continue;
        const { q, r } = hex;
        if (q === position.q && r === position.r) continue;
        if (range !== 99 && hexDistance(position.q, position.r, q, r) > range) continue;
        if (!passesTargetFilter(engine, character, q, r, filter, occupiable)) continue;
        const idx = actionEncoder.encode({ skillSlot: slot, targetIndex: ti });
        if (idx >= 0) mask[idx] = 1;
      }
    }
  }

  return mask;
}

function isPureReposition(skillId) {
  const profile = getSkillPrimitiveProfile(skillId);
  return profile.tags.includes(PrimitiveTag.ESCAPE) &&
    !profile.tags.includes(PrimitiveTag.PRESSURE) &&
    !profile.tags.includes(PrimitiveTag.CONTROL);
}

function passesTargetFilter(engine, character, q, r, filter, occupiable) {
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

function getEffectiveSkillCost(engine, characterId, skill) {
  if (skill.id === 'role_jimmy_marrow_wine') {
    const costs = [3, 4, 4, 5, 5];
    const buffs = engine.buffManager?.getActiveBuffs(characterId) || [];
    const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
    const layer = marrow?.data?.layer || 0;
    return { rage: layer < costs.length ? costs[layer] : 999 };
  }
  return skill.cost || {};
}

function hasSufficientEffectResources(engine, characterId, skill) {
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
