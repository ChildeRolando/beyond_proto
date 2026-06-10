// Defense layer chain — each layer absorbs damage and returns what passes through
import { EvtType } from './CommandTypes.js';

// Layer order: Shield → Rage → Block → Formation
// All bypassable by 穿甲 (armorPierce flag)

export function applyShield(targetPool, incomingDamage, eventBus, targetId) {
  if (!targetPool.shieldActive || targetPool.shield <= 0) return { absorbed: 0, remaining: incomingDamage };
  const absorbed = Math.min(targetPool.shield, incomingDamage);
  targetPool.shield -= absorbed;
  eventBus.emit(EvtType.SHIELD_ABSORBED, { entityId: targetId, absorbed, remaining: targetPool.shield });
  return { absorbed, remaining: incomingDamage - absorbed };
}

export function applyRage(targetPool, incomingDamage, eventBus, targetId) {
  if (!targetPool.rage || targetPool.rage <= 0 || incomingDamage <= 0) {
    return { absorbed: 0, remaining: incomingDamage };
  }

  // 1 rage = up to 50 damage mitigation
  const maxAbsorb = targetPool.rage * 50;
  const absorbed = Math.min(maxAbsorb, incomingDamage);
  const rageUsed = Math.ceil(absorbed / 50);

  targetPool.rage -= rageUsed;

  eventBus.emit(EvtType.RAGE_MITIGATED, {
    entityId: targetId,
    absorbed,
    rageUsed,
    remaining: targetPool.rage,
  });

  return {
    absorbed,
    remaining: incomingDamage - absorbed,
  };
}

export function applyBlock(targetPool, incomingDamage, eventBus, targetId) {
  // Shooter block: 300 power, permanent until broken by 破气针
  if (!targetPool || targetPool.blockActive !== true) return { absorbed: 0, remaining: incomingDamage };
  const blockPower = 300;
  const absorbed = Math.min(blockPower, incomingDamage);
  eventBus.emit(EvtType.BLOCK_TRIGGERED, { entityId: targetId, absorbed });
  return { absorbed, remaining: incomingDamage - absorbed };
}

export function applyFormationEnergy(formationPool, incomingDamage, eventBus, targetId) {
  if (!formationPool || !formationPool.energy || formationPool.energy <= 0) return { absorbed: 0, remaining: incomingDamage };
  // 1 energy = 1 damage
  const maxAbsorb = formationPool.energy;
  const absorbed = Math.min(maxAbsorb, incomingDamage);
  if (absorbed <= 0 || isNaN(absorbed)) return { absorbed: 0, remaining: incomingDamage };
  const energyUsed = absorbed;
  formationPool.energy -= energyUsed;
  eventBus.emit(EvtType.FORMATION_ABSORBED, { entityId: targetId, absorbed, energyUsed, remaining: formationPool.energy });
  return { absorbed, remaining: incomingDamage - absorbed };
}
