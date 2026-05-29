// Per-character skill cooldown tracking with skill haste support
// Formula: effectiveCD = Math.ceil(baseCD * 100 / (100 + totalHaste))
export class SkillCooldowns {
  #cooldowns = new Map(); // characterId -> Map(skillId -> remaining turns)

  // Set a skill on cooldown for a character
  startCooldown(characterId, skillId, baseCD, globalHaste = 0, singleHaste = 0) {
    const effective = SkillCooldowns.calcEffective(baseCD, globalHaste + singleHaste);
    if (effective <= 0) return 0;
    if (!this.#cooldowns.has(characterId)) this.#cooldowns.set(characterId, new Map());
    this.#cooldowns.get(characterId).set(skillId, effective);
    return effective;
  }

  // Remaining turns on cooldown, or 0 if ready
  getRemaining(characterId, skillId) {
    return this.#cooldowns.get(characterId)?.get(skillId) || 0;
  }

  isReady(characterId, skillId) {
    return this.getRemaining(characterId, skillId) <= 0;
  }

  // Reduce a specific skill's remaining cooldown by N turns (min 0)
  reduceCooldown(characterId, skillId, amount = 1) {
    const map = this.#cooldowns.get(characterId);
    if (!map) return;
    const remaining = map.get(skillId);
    if (remaining && remaining > 0) {
      map.set(skillId, Math.max(0, remaining - amount));
    }
  }

  // Decrement all cooldowns for a character (call during CLEANUP)
  tick(characterId) {
    const map = this.#cooldowns.get(characterId);
    if (!map) return;
    for (const [skillId, remaining] of map) {
      if (remaining > 0) map.set(skillId, remaining - 1);
    }
  }

  clear() {
    this.#cooldowns.clear();
  }

  serialize() {
    return [...this.#cooldowns.entries()].map(([cid, map]) => [cid, [...map]]);
  }

  deserialize(data = []) {
    this.#cooldowns.clear();
    for (const [cid, entries] of data) {
      this.#cooldowns.set(cid, new Map(entries));
    }
  }

  static calcEffective(baseCD, totalHaste) {
    if (!totalHaste || totalHaste <= 0) return baseCD;
    return Math.ceil(baseCD * 100 / (100 + totalHaste));
  }
}
