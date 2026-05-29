// Defense layer chain — each layer absorbs damage and returns what passes through
import { EvtType } from './CommandTypes.js';

// Layer order: Shield → Rage → Block → Formation
// All bypassable by 穿甲 (armorPierce flag)

export function applyShield(targetPool, incomingDamage, eventBus, targetId) {
  if (!targetPool.shieldActive || targetPool.shield <= 0) return { absorbed: 0, remaining: incomingDamage };
  const absorbed = Math.min(targetPool.shield, incomingDamage);
  targetPool.shield -= absorbed;
  eventBus.emit(EvtType.SHIELD_ABSORBED, { targetId, absorbed, remaining: targetPool.shield });
  return { absorbed, remaining: incomingDamage - absorbed };
}

export function applyRage(targetPool, incomingDamage, eventBus) {
  if (!targetPool.rage || targetPool.rage <= 0) return { absorbed: 0, remaining: incomingDamage };
  // 2 rage = 100 damage mitigated
  const maxMitigate = Math.floor(targetPool.rage / 2) * 100;
  const toAbsorb = Math.min(maxMitigate, incomingDamage);
  const rageUsed = Math.ceil(toAbsorb / 50); // 1 rage = 50 power
  const actualRage = Math.min(targetPool.rage, rageUsed);
  targetPool.rage -= actualRage;
  const actualAbsorb = actualRage * 50;
  eventBus.emit(EvtType.RAGE_MITIGATED, { absorbed: actualAbsorb, rageUsed: actualRage, remaining: targetPool.rage });
  return { absorbed: actualAbsorb, remaining: incomingDamage - actualAbsorb };
}

export function applyBlock(targetPool, incomingDamage, eventBus) {
  // Shooter block: 300 power, permanent until broken by 破气针
  if (!targetPool || targetPool.blockActive !== true) return { absorbed: 0, remaining: incomingDamage };
  const blockPower = 300;
  const absorbed = Math.min(blockPower, incomingDamage);
  eventBus.emit(EvtType.BLOCK_TRIGGERED, { absorbed });
  return { absorbed, remaining: incomingDamage - absorbed };
}

export function applyFormationEnergy(formationPool, incomingDamage, eventBus) {
  if (!formationPool || !formationPool.energy || formationPool.energy <= 0) return { absorbed: 0, remaining: incomingDamage };
  // 1 energy = 1 damage
  const maxAbsorb = formationPool.energy;
  const absorbed = Math.min(maxAbsorb, incomingDamage);
  if (absorbed <= 0 || isNaN(absorbed)) return { absorbed: 0, remaining: incomingDamage };
  const energyUsed = absorbed;
  formationPool.energy -= energyUsed;
  eventBus.emit(EvtType.FORMATION_ABSORBED, { absorbed, energyUsed, remaining: formationPool.energy });
  return { absorbed, remaining: incomingDamage - absorbed };
}
