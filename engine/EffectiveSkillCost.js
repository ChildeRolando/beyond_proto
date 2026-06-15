// Effective skill cost helper — mirrors SkillResolver cost logic.
// Used by UI (BattlePanelsView) and engine (SkillResolver) to avoid rule fork.
// Returns { cost: { resource: amount }, free: boolean }
import { SKILLS } from './SkillData.js';

export function getEffectiveSkillCost(skillId, actorState) {
  const buffs = actorState?.buffs || [];
  const hasBuff = (type) => buffs.some(b => b.statusType === type);
  const getStacks = (type) => {
    const b = buffs.find(b => b.statusType === type);
    return b?.data?.stacks || b?.stacks || 0;
  };

  // mage_small_qi_blast + AFTERSHOCK stacks > 0 → free
  if (skillId === 'mage_small_qi_blast') {
    if (getStacks('AFTERSHOCK') > 0) {
      return { cost: {}, free: true, reason: 'AFTERSHOCK' };
    }
    return { cost: { qi: 1 }, free: false };
  }

  // warrior_iaido + INDRA_BLADE → free
  if (skillId === 'warrior_iaido') {
    if (hasBuff('INDRA_BLADE')) {
      return { cost: {}, free: true, reason: 'INDRA_BLADE' };
    }
    return { cost: { rage: 3 }, free: false };
  }

  // role_jimmy_marrow_wine — dynamic cost based on marrow layer
  if (skillId === 'role_jimmy_marrow_wine') {
    const costs = [3, 4, 4, 5, 5];
    const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
    const layer = marrow?.data?.layer || 0;
    const rageCost = layer < costs.length ? costs[layer] : 0;
    return { cost: rageCost > 0 ? { rage: rageCost } : {}, free: rageCost === 0 };
  }

  // PREDATORY_STEP_READY: next movement skill is free
  if (hasBuff('PREDATORY_STEP_READY')) {
    const skill = SKILLS[skillId];
    if (skill && skill.type === '移动') {
      return { cost: {}, free: true, reason: 'PREDATORY_STEP_READY' };
    }
  }

  // Default: no dynamic cost modification
  return null; // signals "use raw skill.cost"
}
