// Bagua formation system — deployable battle array with talisman effects
import { EvtType } from './CommandTypes.js';
import { isOnBoard, hexRing, hexSpiral } from './HexMath.js';

let _formationId = 0;

export const TalismanType = Object.freeze({
  ATTACK: 'ATTACK',     // 攻击阵符 — boosts damage
  DEFENSE: 'DEFENSE',   // 防御阵符 — absorbs damage
  SUPPORT: 'SUPPORT',   // 辅助阵符 — heals/resource regen
  CORE: 'CORE',         // 核心阵符 — structural, determines formation center
});

export class FormationSystem {
  #registry;
  #eventBus;
  #resourceSystem;
  #formations = [];

  constructor(registry, eventBus, resourceSystem) {
    this.#registry = registry;
    this.#eventBus = eventBus;
    this.#resourceSystem = resourceSystem;
  }

  get formations() { return this.#formations; }

  createFormation(ownerId, q, r, energy = 300, talismans = []) {
    if (!isOnBoard(q, r)) return null;

    const coverageHexes = hexSpiral(q, r, 1); // [[q,r], ...]
    const formation = {
      id: 'formation_' + (++_formationId),
      ownerId,
      position: { q, r, dim: 'MAIN' },
      centerQ: q,
      centerR: r,
      energy,
      coverageHexes,
      talismans: talismans.map(t => ({ ...t })),
      alive: true,
    };

    this.#formations.push(formation);
    this.#registry.register({
      id: formation.id, type: 'FORMATION', name: '八卦阵',
      position: { q, r, dim: 'MAIN' },
      alive: true, ownerId,
    });

    if (this.#resourceSystem) {
      this.#resourceSystem.initFormation(formation.id, energy);
    }

    this.#eventBus.emit(EvtType.FORMATION_DAMAGED, { formationId: formation.id, energy, ownerId });
    return formation;
  }

  getFormation(id) {
    return this.#formations.find(f => f.id === id);
  }

  getFormationAt(q, r, dim = 'MAIN') {
    return this.#formations.find(f =>
      f.alive && f.position.q === q && f.position.r === r && f.position.dim === dim);
  }

  getFormationForOwner(ownerId) {
    return this.#formations.filter(f => f.ownerId === ownerId && f.alive);
  }

  // Check if hex is covered by a formation (center + ring 1)
  isHexCovered(formationId, q, r) {
    const f = this.getFormation(formationId);
    if (!f || !f.alive) return false;
    return f.coverageHexes.some(([hq, hr]) => hq === q && hr === r);
  }

  // Check if hex is the formation center (阵眼)
  isCenterHex(formationId, q, r) {
    const f = this.getFormation(formationId);
    if (!f || !f.alive) return false;
    return f.centerQ === q && f.centerR === r;
  }

  // Get all alive formations that cover a hex (for damage absorption)
  getFormationsCovering(q, r) {
    return this.#formations.filter(f => f.alive && f.coverageHexes.some(([hq, hr]) => hq === q && hr === r));
  }

  // Destroy formation (e.g., center hex hit)
  destroyFormation(formationId) {
    const f = this.getFormation(formationId);
    if (!f || !f.alive) return;
    f.alive = false;
    const entity = this.#registry.get(formationId);
    if (entity) entity.alive = false;
    this.#eventBus.emit(EvtType.FORMATION_DAMAGED, { formationId, destroyed: true });
  }

  // Break formation at a specific hex (阵法堪破 — destroys formation whose center is at q,r)
  breakAtHex(q, r) {
    const f = this.#formations.find(f =>
      f.alive && f.centerQ === q && f.centerR === r);
    if (!f) return false;
    this.destroyFormation(f.id);
    return true;
  }

  // Check if hex is within formation area (ring 1 around center)
  isInFormation(formationId, q, r) {
    const formation = this.getFormation(formationId);
    if (!formation || !formation.alive) return false;

    const fq = formation.position.q, fr = formation.position.r;
    if (q === fq && r === fr) return true;
    // Ring 1 around center
    const ring = hexRing(fq, fr, 1);
    return ring.some(([hq, hr]) => hq === q && hr === r);
  }

  // Get talisman at a formation hex
  getTalismanAt(formationId, q, r) {
    const formation = this.getFormation(formationId);
    if (!formation) return null;
    return formation.talismans.find(t => t.q === q && t.r === r) || null;
  }

  // Install talisman at formation hex
  installTalisman(formationId, type, q, r) {
    const formation = this.getFormation(formationId);
    if (!formation) return false;

    // Remove existing talisman at this position
    formation.talismans = formation.talismans.filter(t => !(t.q === q && t.r === r));
    formation.talismans.push({ type, q, r });
    return true;
  }

  // Absorb damage with formation energy (1 energy : 100 power)
  absorbDamage(formationId, damage) {
    const formation = this.getFormation(formationId);
    if (!formation || !formation.alive) return { absorbed: 0, remaining: damage };

    const energyCost = Math.ceil(damage / 100);
    const available = Math.min(formation.energy, energyCost);
    const absorbed = available * 100;

    formation.energy -= available;
    if (absorbed > 0) {
      this.#eventBus.emit(EvtType.FORMATION_ABSORBED, { formationId, absorbed, remaining: formation.energy });
      this.#eventBus.emit(EvtType.FORMATION_DAMAGED, { formationId, energy: formation.energy, absorbed });
    }

    if (formation.energy <= 0) {
      formation.alive = false;
      this.#eventBus.emit(EvtType.FORMATION_DAMAGED, { formationId, destroyed: true });
    }

    return { absorbed, remaining: damage - absorbed };
  }

  // Get talisman effects for a hex within formation
  getTalismanEffects(formationId, q, r) {
    const talisman = this.getTalismanAt(formationId, q, r);
    if (!talisman) return {};

    switch (talisman.type) {
      case TalismanType.ATTACK:
        return { damageBoost: 100 }; // +100 damage
      case TalismanType.DEFENSE:
        return { damageReduction: 100 }; // -100 damage taken
      case TalismanType.SUPPORT:
        return { healPerTurn: 1 }; // Heal 1 qi/rage per turn
      case TalismanType.CORE:
        return { energyRegen: 1 }; // Regen 1 energy per turn
      default:
        return {};
    }
  }

  // End of turn effects
  onTurnEnd() {
    for (const formation of this.#formations) {
      if (!formation.alive) continue;
      const coreTalisman = formation.talismans.find(t => t.type === TalismanType.CORE);
      if (coreTalisman) {
        formation.energy += 1; // Core regens 1 energy/turn
      }
    }
  }

  reset() {
    for (const f of this.#formations) {
      this.#registry.unregister(f.id);
    }
    this.#formations.length = 0;
  }

  serialize() {
    return {
      formations: structuredClone(this.#formations),
    };
  }

  deserialize(data = {}) {
    this.#formations.length = 0;
    this.#formations.push(...structuredClone(data.formations || []));
    let maxFormationId = 0;
    for (const formation of this.#formations) {
      const numericId = Number(String(formation.id).replace('formation_', ''));
      if (Number.isFinite(numericId)) maxFormationId = Math.max(maxFormationId, numericId);
    }
    _formationId = Math.max(_formationId, maxFormationId);
  }
}
