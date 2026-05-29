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
  #buffManager = null;
  #gunfighterCooldown = new Map(); // characterId -> turns remaining

  constructor(buffManager = null) {
    this.#buffManager = buffManager;
  }

  resetTurn() {
    this.#used.clear();
    for (const [id, cd] of this.#gunfighterCooldown) {
      if (cd > 0) this.#gunfighterCooldown.set(id, cd - 1);
    }
  }

  getAllowance(character) {
    const hasGunfighter = character?.roleLoadoutSkillIds?.includes('trait_gunfighter_finesse') || false;
    let gunfighterReady = false;
    if (hasGunfighter) {
      if (!this.#gunfighterCooldown.has(character.id)) {
        this.#gunfighterCooldown.set(character.id, 1); // first turn: not ready
      }
      gunfighterReady = this.#gunfighterCooldown.get(character.id) === 0;
    }
    const hasMarrowMove = this.#buffManager?.hasStatus(character.id, 'JIMMY_MARROW_MOVE') || false;
    return {
      main: 1,
      finesse: (gunfighterReady || hasMarrowMove) ? 1 : 0,
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
    const isMovement = SKILLS[skillId]?.type === '移动';
    const isMarrowWine = skillId === 'role_jimmy_marrow_wine';

    const hasMarrowMove = this.#buffManager?.hasStatus(character.id, 'JIMMY_MARROW_MOVE') || false;
    const hasGunfighter = character?.roleLoadoutSkillIds?.includes('trait_gunfighter_finesse') || false;

    // Jimmy marrow move: movement and 易经洗髓酒 use finesse slot before main
    if (isMovement && hasMarrowMove && state.finesse.used < state.finesse.total && totalCost === 0) {
      return { ok: true, slot: 'finesse' };
    }
    // 易经洗髓酒 with JIMMY_MARROW_MOVE: always uses finesse, cost is paid via CONSUME_RESOURCE
    if (isMarrowWine && hasMarrowMove && state.finesse.used < state.finesse.total) {
      return { ok: true, slot: 'finesse' };
    }

    if (state.main.used < state.main.total) {
      return { ok: true, slot: 'main' };
    }

    // Gunfighter finesse: any cost-0 action can use the finesse slot
    if (hasGunfighter && state.finesse.used < state.finesse.total && totalCost === 0) {
      return { ok: true, slot: 'finesse' };
    }

    const used = this.#used.get(character.id);
    if (hasGunfighter && state.finesse.used < state.finesse.total && used?.mainSkillCost === 0 && totalCost > 0) {
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

    // Gunfighter finesse has a 2-turn cooldown after use
    const hasGunfighter = character?.roleLoadoutSkillIds?.includes('trait_gunfighter_finesse') || false;
    if (hasGunfighter && (result.slot === 'finesse' || result.slot === 'main_reassign')) {
      this.#gunfighterCooldown.set(character.id, 2);
    }

    return { ok: true, slot: result.slot, state: this.getState(character) };
  }

  isRequiredReady(character) {
    return this.getState(character).requiredReady;
  }

  isGunfighterReady(characterId) {
    if (!this.#gunfighterCooldown.has(characterId)) {
      this.#gunfighterCooldown.set(characterId, 1);
    }
    return this.#gunfighterCooldown.get(characterId) === 0;
  }

  serialize() {
    return {
      used: [...this.#used.entries()].map(([id, value]) => [id, { ...value }]),
      gunfighterCooldown: [...this.#gunfighterCooldown.entries()],
    };
  }

  deserialize(data = {}) {
    this.#used.clear();
    this.#gunfighterCooldown.clear();
    for (const [id, value] of data.used || []) {
      this.#used.set(id, { ...value });
    }
    for (const [id, cooldown] of data.gunfighterCooldown || []) {
      this.#gunfighterCooldown.set(id, cooldown);
    }
  }
}
