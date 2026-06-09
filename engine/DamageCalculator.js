// Damage resolution through defense layers
import { EvtType } from './CommandTypes.js';
import { applyShield, applyRage, applyBlock, applyFormationEnergy } from './DefenseLayers.js';

export class DamageCalculator {
  constructor(registry, eventBus, resourceSystem, formationSystem, buffManager) {
    this.registry = registry;
    this.eventBus = eventBus;
    this.resourceSystem = resourceSystem;
    this.formationSystem = formationSystem;
    this.buffManager = buffManager;
  }

  resolve(sourceId, targetId, basePower, damageType = 'PHYSICAL', flags = {}) {
    const target = this.registry.get(targetId);
    if (!target || target.alive === false) {
      return { basePower, finalDamage: 0, killed: false, preventedByBuff: false, breakdown: [] };
    }

    const targetPool = this.resourceSystem.getAll(targetId);
    const breakdown = [];
    let remaining = basePower;

    // --- Armor pierce: skip all defense layers (must come before remaining<=0 check so BREAK_ARMOR always applies) ---
    if (flags.armorPierce) {
      // BREAK_ARMOR: permanently disable target defenses (破气针)
      if (flags.flags?.includes?.('BREAK_ARMOR')) {
        this.resourceSystem.breakShield(targetId);
        this.resourceSystem.permanentlyBreakBlock(targetId);
        const pool = this.resourceSystem.getAll(targetId);
        if (pool && pool.rage !== undefined) this.resourceSystem.set(targetId, 'rage', 0);
        this.eventBus.emit(EvtType.ARMOR_PIERCED, { targetId, damage: remaining, breakArmor: true });
      } else if (flags.flags?.includes?.('DRAIN_COST')) {
        // 破气针重做：清空目标所有可消耗资源（气/怒/弹）
        const pool = this.resourceSystem.getAll(targetId);
        if (pool) {
          if (pool.qi !== undefined) this.resourceSystem.set(targetId, 'qi', 0);
          if (pool.rage !== undefined) this.resourceSystem.set(targetId, 'rage', 0);
          if (pool.ammo !== undefined) this.resourceSystem.set(targetId, 'ammo', 0);
        }
        this.eventBus.emit(EvtType.ARMOR_PIERCED, { targetId, damage: remaining, drainCost: true });
      } else if (flags.flags?.includes?.('COST_SEAL')) {
        // 引气针：撤销目标本回合已获得的cost，并封印后续获得
        const drained = this.resourceSystem.drainTurnCostGains(targetId);
        if (this.buffManager) this.buffManager.apply(targetId, 'COST_SEALED', 1, sourceId);
        this.eventBus.emit(EvtType.ARMOR_PIERCED, { targetId, damage: remaining, costSeal: true, drained });
      } else {
        this.eventBus.emit(EvtType.ARMOR_PIERCED, { targetId, damage: remaining });
      }
      const finalDamage = remaining;
      const killed = this._applyDamage(target, targetId, finalDamage, sourceId, flags);
      breakdown.push({ layer: 'ARMOR_PIERCE', absorbed: 0, passed: finalDamage });
      return this._result(sourceId, targetId, basePower, finalDamage, killed, breakdown, false);
    }

    // --- Pre-calc hook ---
    const preResult = this.eventBus.emit(EvtType.DAMAGE_PRE_CALC, { sourceId, targetId, damage: remaining, damageType, flags });
    if (preResult && preResult.damage !== undefined) remaining = preResult.damage;
    if (remaining <= 0) return this._result(sourceId, targetId, basePower, 0, false, breakdown, false);

    // --- Formation center destruction: happens before defense layers, regardless of absorption ---
    if (this.formationSystem) {
      const tq = target.position.q, tr = target.position.r;
      const covering = this.formationSystem.getFormationsCovering(tq, tr);
      for (const f of covering) {
        if (f.ownerId === sourceId) continue;
        if (this.formationSystem.isCenterHex(f.id, tq, tr)) {
          this.formationSystem.destroyFormation(f.id);
        }
      }
    }

    // --- Defense layer chain ---
    // Layer 1: Formation (shared shield — absorbs before personal defenses)
    let formationAbsorbed = 0;
    if (this.formationSystem) {
      const tq = target.position.q, tr = target.position.r;
      const covering = this.formationSystem.getFormationsCovering(tq, tr);
      for (const f of covering) {
        if (f.ownerId === sourceId) continue;
        // Center hex: formation already destroyed above; skip absorption
        if (this.formationSystem.isCenterHex(f.id, tq, tr)) continue;
        const fPool = this.resourceSystem.getAll(f.id);
        if (!fPool || !fPool.energy || fPool.energy <= 0) continue;
        let result = applyFormationEnergy(fPool, remaining, this.eventBus);
        formationAbsorbed += result.absorbed;
        remaining = result.remaining;
        f.energy = fPool.energy;
        if (fPool.energy <= 0) {
          this.formationSystem.destroyFormation(f.id);
        }
        if (remaining <= 0) break;
      }
    }
    breakdown.push({ layer: 'FORMATION', absorbed: formationAbsorbed, passed: remaining });
    if (remaining <= 0) return this._result(sourceId, targetId, basePower, 0, false, breakdown, false);

    // Layer 2: Sword Flight — absorbs before personal defenses (same priority as formation)
    let swordAbsorbed = 0;
    if (this.buffManager && this.buffManager.hasStatus(targetId, 'SWORD_FLIGHT')) {
      const buffs = this.buffManager.getActiveBuffs(targetId);
      const flight = buffs.find(b => b.statusType === 'SWORD_FLIGHT');
      if (flight && flight.data.swordEnergy > 0) {
        const absorb = Math.min(flight.data.swordEnergy, remaining);
        flight.data.swordEnergy -= absorb;
        swordAbsorbed = absorb;
        remaining -= absorb;
        if (flight.data.swordEnergy <= 0) {
          this.buffManager.removeByType(targetId, 'SWORD_FLIGHT');
          this.eventBus.emit(EvtType.SWORD_BROKEN, { targetId });
        }
      }
    }
    breakdown.push({ layer: 'SWORD_FLIGHT', absorbed: swordAbsorbed, passed: remaining });
    if (remaining <= 0) return this._result(sourceId, targetId, basePower, 0, false, breakdown, false);

    // Layer 3: Shield (personal)
    let result = applyShield(targetPool, remaining, this.eventBus, targetId);
    breakdown.push({ layer: 'SHIELD', absorbed: result.absorbed, passed: result.remaining });
    remaining = result.remaining;
    if (remaining <= 0) return this._result(sourceId, targetId, basePower, 0, false, breakdown, false);

    // --- Damage received hook (can modify remaining damage) ---
    const dmgResult = this.eventBus.emit(EvtType.DAMAGE_RECEIVED, {
      targetId, sourceId, damage: remaining, damageType, flags,
    });
    if (dmgResult && dmgResult.damage !== undefined) remaining = dmgResult.damage;
    if (remaining <= 0) return this._result(sourceId, targetId, basePower, 0, false, breakdown, false);

    // Layer 3: Rage mitigation
    result = applyRage(targetPool, remaining, this.eventBus);
    breakdown.push({ layer: 'RAGE', absorbed: result.absorbed, passed: result.remaining });
    remaining = result.remaining;
    if (remaining <= 0) return this._result(sourceId, targetId, basePower, 0, false, breakdown, false);

    // Layer 4: Block
    result = applyBlock(targetPool, remaining, this.eventBus);
    breakdown.push({ layer: 'BLOCK', absorbed: result.absorbed, passed: result.remaining });
    remaining = result.remaining;
    if (remaining <= 0) return this._result(sourceId, targetId, basePower, 0, false, breakdown, false);

    // --- Apply remaining damage ---
    const killed = remaining > 0 ? this._applyDamage(target, targetId, remaining, sourceId, flags) : false;

    return this._result(sourceId, targetId, basePower, remaining, killed, breakdown, false);
  }

  _applyDamage(target, targetId, damage, sourceId, flags) {
    if (damage <= 0) return false;

    // Default model: one-hit-kill.
    // If a character has no hp resource, any damage > 0 kills them.
    // Characters with hp resource use traditional HP subtraction
    // (legacy support only — the canonical game has no HP).
    const pool = this.resourceSystem.getAll(targetId);
    const hasHp = pool && Object.prototype.hasOwnProperty.call(pool, 'hp');

    if (hasHp) {
      const currentHp = pool.hp ?? 0;
      const nextHp = Math.max(0, currentHp - damage);
      this.resourceSystem.set(targetId, 'hp', nextHp);
      if (nextHp > 0) {
        return false; // survived with HP remaining
      }
      // HP reached 0 — fall through to kill
    }

    // No HP, or HP exhausted: one-hit-kill
    if (damage > 0) {
      target.alive = false;
      this.eventBus.emit(EvtType.CHARACTER_DIED, { targetId, sourceId, finalDamage: damage });
      return true;
    }

    return false;
  }

  _result(sourceId, targetId, basePower, finalDamage, killed, breakdown, preventedByBuff) {
    this.eventBus.emit(EvtType.DAMAGE_DEALT, {
      sourceId, targetId, basePower, finalDamage, killed, breakdown, preventedByBuff,
    });
    return { sourceId, targetId, basePower, finalDamage, killed, breakdown, preventedByBuff };
  }
}
