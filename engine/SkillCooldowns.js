// Per-character skill cooldown tracking with skill haste support
// Formula: effectiveCD = Math.ceil(baseCD * 100 / (100 + totalHaste))
// Also tracks limited-use skills (maxUses per battle)
import { SKILLS } from './SkillData.js';

export class SkillCooldowns {
  #cooldowns = new Map(); // characterId -> Map(skillId -> remaining turns)
  #uses = new Map();      // characterId -> Map(skillId -> remaining uses)

  // --- Cooldown ---
  startCooldown(characterId, skillId, baseCD, globalHaste = 0, singleHaste = 0) {
    const effective = SkillCooldowns.calcEffective(baseCD, globalHaste + singleHaste);
    if (effective <= 0) return 0;
    if (!this.#cooldowns.has(characterId)) this.#cooldowns.set(characterId, new Map());
    this.#cooldowns.get(characterId).set(skillId, effective);
    return effective;
  }

  getRemaining(characterId, skillId) {
    return this.#cooldowns.get(characterId)?.get(skillId) || 0;
  }

  isReady(characterId, skillId) {
    return this.getRemaining(characterId, skillId) <= 0;
  }

  reduceCooldown(characterId, skillId, amount = 1) {
    const map = this.#cooldowns.get(characterId);
    if (!map) return;
    const remaining = map.get(skillId);
    if (remaining && remaining > 0) {
      map.set(skillId, Math.max(0, remaining - amount));
    }
  }

  tick(characterId) {
    const map = this.#cooldowns.get(characterId);
    if (!map) return;
    for (const [skillId, remaining] of map) {
      if (remaining > 0) map.set(skillId, remaining - 1);
    }
  }

  // --- Limited Uses ---
  _initUses(characterId, skillId) {
    const skill = SKILLS[skillId];
    if (!skill || !skill.maxUses) return;
    if (!this.#uses.has(characterId)) this.#uses.set(characterId, new Map());
    const map = this.#uses.get(characterId);
    if (!map.has(skillId)) map.set(skillId, skill.maxUses);
  }

  getRemainingUses(characterId, skillId) {
    this._initUses(characterId, skillId);
    const max = SKILLS[skillId]?.maxUses;
    if (!max) return Infinity;
    return this.#uses.get(characterId)?.get(skillId) ?? max;
  }

  isExhausted(characterId, skillId) {
    return this.getRemainingUses(characterId, skillId) <= 0;
  }

  consumeUse(characterId, skillId) {
    this._initUses(characterId, skillId);
    const map = this.#uses.get(characterId);
    if (!map) return;
    const current = map.get(skillId);
    if (current && current > 0) map.set(skillId, current - 1);
  }

  // --- Serialization ---
  clear() {
    this.#cooldowns.clear();
    this.#uses.clear();
  }

  serialize() {
    return {
      cooldowns: [...this.#cooldowns.entries()].map(([cid, map]) => [cid, [...map]]),
      uses: [...this.#uses.entries()].map(([cid, map]) => [cid, [...map]]),
    };
  }

  deserialize(data = {}) {
    this.#cooldowns.clear();
    this.#uses.clear();
    for (const [cid, entries] of data.cooldowns || []) {
      this.#cooldowns.set(cid, new Map(entries));
    }
    for (const [cid, entries] of data.uses || []) {
      this.#uses.set(cid, new Map(entries));
    }
  }

  static calcEffective(baseCD, totalHaste) {
    if (!totalHaste || totalHaste <= 0) return baseCD;
    return Math.ceil(baseCD * 100 / (100 + totalHaste));
  }
}
