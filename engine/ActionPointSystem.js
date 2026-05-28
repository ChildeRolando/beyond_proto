import { SKILLS } from './SkillData.js';

function skillCostTotal(skillId) {
  const skill = SKILLS[skillId];
  if (!skill) return Infinity;
  return Object.values(skill.cost || {}).reduce((sum, amount) => {
    return sum + (typeof amount === 'number' ? amount : 0);
  }, 0);
}

export class ActionPointSystem {
  #used = new Map(); // characterId -> { mainUsed, finesseUsed, mainSkillCost }

  resetTurn() {
    this.#used.clear();
  }

  getAllowance(character) {
    return {
      main: 1,
      finesse: character?.roleId === 'shooter_gunfighter' ? 1 : 0,
    };
  }

  getState(character) {
    const used = this.#used.get(character.id) || { mainUsed: 0, finesseUsed: 0, mainSkillCost: null };
    const allowance = this.getAllowance(character);
    return {
      main: { used: used.mainUsed, total: allowance.main },
      finesse: { used: used.finesseUsed, total: allowance.finesse },
      requiredReady: used.mainUsed >= allowance.main,
      canSubmit: used.mainUsed < allowance.main || used.finesseUsed < allowance.finesse,
    };
  }

  canSubmit(character, skillId) {
    if (!character || character.alive === false) return { ok: false, reason: 'actor_dead' };

    const state = this.getState(character);
    const totalCost = skillCostTotal(skillId);
    if (state.main.used < state.main.total) {
      return { ok: true, slot: 'main' };
    }

    if (state.finesse.used < state.finesse.total && totalCost === 0) {
      return { ok: true, slot: 'finesse' };
    }

    const used = this.#used.get(character.id);
    if (state.finesse.used < state.finesse.total && used?.mainSkillCost === 0 && totalCost > 0) {
      return { ok: true, slot: 'main_reassign' };
    }

    return { ok: false, reason: 'action_points_exhausted' };
  }

  consume(character, skillId) {
    const result = this.canSubmit(character, skillId);
    if (!result.ok) return result;

    const used = this.#used.get(character.id) || { mainUsed: 0, finesseUsed: 0, mainSkillCost: null };
    if (result.slot === 'finesse') used.finesseUsed += 1;
    else if (result.slot === 'main_reassign') {
      used.finesseUsed += 1;
      used.mainSkillCost = skillCostTotal(skillId);
    } else {
      used.mainUsed += 1;
      used.mainSkillCost = skillCostTotal(skillId);
    }
    this.#used.set(character.id, used);

    return { ok: true, slot: result.slot, state: this.getState(character) };
  }

  isRequiredReady(character) {
    return this.getState(character).requiredReady;
  }
}
