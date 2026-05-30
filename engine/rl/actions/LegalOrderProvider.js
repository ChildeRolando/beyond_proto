// Generates valid BattleOrder[] for a given playerKey from a BattleView.
// Rule-based: checks affordability, action points, targeting, range.
// No heuristic scoring, no CandidateGenerator dependency.

import { SKILLS } from '../../SkillData.js';
import { hexDistance } from '../../HexMath.js';
import { TARGET_SELF } from './ActionEncoder.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from '../../ai/PrimitiveProfile.js';
import { HexIndex } from '../features/HexIndex.js';
import { BattleOrder } from './BattleOrder.js';

const BOARD_HEX_COUNT = 37;
const _defaultHexIndex = new HexIndex();

export function getValidOrders(battleView, playerKey, options = {}) {
  const engine = battleView.getRawEngineForDebug();
  const actor = battleView.getActor(playerKey);
  if (!actor) return [];

  const skills = actor.skills || [];
  const position = actor.position;
  const orders = [];

  for (let slot = 0; slot < 10; slot++) {
    if (slot >= skills.length) continue;

    const skillId = skills[slot].id;
    const skill = SKILLS[skillId];
    if (!skill || skill.hidden || skill.isTrait) continue;

    // Cost check
    const effectiveCost = _getEffectiveSkillCost(engine, actor.id, skill);
    if (!engine.resourceSystem.canAfford(actor.id, effectiveCost)) continue;

    // Effect-level resource check
    if (!_hasSufficientEffectResources(engine, actor.id, skill)) continue;

    // Action point check
    const apResult = engine.canSubmitAction(actor.id, skillId);
    if (!apResult.ok) continue;

    const targeting = skill.targeting || {};
    const shape = targeting.shape || 'SELF';

    if (shape === 'SELF' || shape === 'AOE_SELF') {
      orders.push(new BattleOrder({
        playerKey,
        actorId: actor.id,
        skillId,
        skillSlot: slot,
        targetIndex: TARGET_SELF,
        targetPos: null,
        targetKind: 'SELF',
      }));
    } else {
      const range = engine.getEffectiveRange(actor.id, targeting.range ?? 0);
      const filter = targeting.filter;
      const occupiable = _isPureReposition(skillId);
      const hexIndex = (options.actionEncoder?._hexIndex) || _defaultHexIndex;

      for (let ti = 0; ti < BOARD_HEX_COUNT; ti++) {
        const hex = hexIndex.indexToHex(ti);
        if (!hex) continue;
        const { q, r } = hex;
        if (q === position.q && r === position.r) continue;
        if (range !== 99 && hexDistance(position.q, position.r, q, r) > range) continue;
        if (!_passesTargetFilter(engine, actor, q, r, filter, occupiable)) continue;

        orders.push(new BattleOrder({
          playerKey,
          actorId: actor.id,
          skillId,
          skillSlot: slot,
          targetIndex: ti,
          targetPos: { q, r },
          targetKind: 'HEX',
        }));
      }
    }
  }

  return orders;
}

// ─── Internal helpers (mirror ActionMask.js) ───

function _getEffectiveSkillCost(engine, characterId, skill) {
  if (skill.id === 'role_jimmy_marrow_wine') {
    const costs = [3, 4, 4, 5, 5];
    const buffs = engine.buffManager?.getActiveBuffs(characterId) || [];
    const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
    const layer = marrow?.data?.layer || 0;
    return { rage: layer < costs.length ? costs[layer] : 999 };
  }
  return skill.cost || {};
}

function _hasSufficientEffectResources(engine, characterId, skill) {
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

function _isPureReposition(skillId) {
  const profile = getSkillPrimitiveProfile(skillId);
  return profile.tags.includes(PrimitiveTag.ESCAPE) &&
    !profile.tags.includes(PrimitiveTag.PRESSURE) &&
    !profile.tags.includes(PrimitiveTag.CONTROL);
}

function _passesTargetFilter(engine, character, q, r, filter, occupiable) {
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
