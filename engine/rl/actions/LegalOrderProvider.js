// Generates valid BattleOrder[] for a given playerKey from a BattleView.
// Rule-based: checks affordability, action points, targeting, range.
// No heuristic scoring, no CandidateGenerator dependency.

import { SKILLS } from '../../SkillData.js';
import { hexDistance } from '../../HexMath.js';
import { TARGET_SELF } from './ActionEncoder.js';
import { HexIndex } from '../features/HexIndex.js';
import { BattleOrder } from './BattleOrder.js';
import {
  getEffectiveSkillCost,
  hasSufficientEffectResources,
  isPureRepositionSkill,
  passesTargetFilter,
} from './ActionLegality.js';

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
    const effectiveCost = getEffectiveSkillCost(engine, actor.id, skill);
    if (!engine.resourceSystem.canAfford(actor.id, effectiveCost)) continue;

    // Effect-level resource check
    if (!hasSufficientEffectResources(engine, actor.id, skill)) continue;

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
      const occupiable = isPureRepositionSkill(skillId);
      const hexIndex = (options.actionEncoder?._hexIndex) || _defaultHexIndex;

      for (let ti = 0; ti < BOARD_HEX_COUNT; ti++) {
        const hex = hexIndex.indexToHex(ti);
        if (!hex) continue;
        const { q, r } = hex;
        if (q === position.q && r === position.r) continue;
        if (range !== 99 && hexDistance(position.q, position.r, q, r) > range) continue;
        if (!passesTargetFilter(engine, actor, q, r, filter, occupiable)) continue;

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
