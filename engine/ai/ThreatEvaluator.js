import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';
import { hexDistance } from '../HexMath.js';

export function evaluateThreatState(state, ownerId, options = {}) {
  const self = (state.characters || []).filter(c => c.alive !== false && c.ownerId === ownerId);
  const enemies = (state.characters || []).filter(c => c.alive !== false && c.ownerId !== ownerId);

  const result = {
    immediateLethal: false,
    latentLethalThreat: false,
    underThreat: false,
    threatScore: 0,
    lethalThreats: [],
    details: {},
  };

  for (const char of self) {
    const charThreat = evaluateCharThreat(char, enemies);
    if (charThreat.immediateLethal) result.immediateLethal = true;
    if (charThreat.latentLethalThreat) result.latentLethalThreat = true;
    result.threatScore += charThreat.threatScore;
    result.lethalThreats.push(...charThreat.lethalThreats);
    result.details[char.id] = charThreat;
  }

  // Check if under threat from enemy attacks
  for (const char of self) {
    for (const enemy of enemies) {
      if (!enemy.skills) continue;
      for (const sr of enemy.skills) {
        const p = getSkillPrimitiveProfile(sr.id);
        if (!p.tags.includes(PrimitiveTag.PRESSURE)) continue;
        let affordable = true;
        for (const [res, amt] of Object.entries(p.cost)) {
          if ((enemy.resources?.[res] || 0) < amt) { affordable = false; break; }
        }
        if (!affordable) continue;
        const d = hexDistance(char.position.q, char.position.r, enemy.position.q, enemy.position.r);
        const reach = p.range === 99 ? 6 : p.range;
        if (d <= reach + p.areaRadius) {
          result.underThreat = true;
          break;
        }
      }
      if (result.underThreat) break;
    }
  }

  return result;
}

function evaluateCharThreat(char, enemies) {
  const result = {
    immediateLethal: false,
    latentLethalThreat: false,
    threatScore: 0,
    lethalThreats: [],
  };

  const skills = char.skills || [];
  const resources = char.resources || {};

  for (const skillRef of skills) {
    const p = getSkillPrimitiveProfile(skillRef.id);
    if (!p.tags.includes(PrimitiveTag.PRESSURE)) continue;

    let affordable = true;
    for (const [res, amt] of Object.entries(p.cost)) {
      if ((resources[res] || 0) < amt) { affordable = false; break; }
    }
    if (!affordable) continue;

    const inRange = enemies.some(en => {
      const d = hexDistance(char.position.q, char.position.r, en.position.q, en.position.r);
      const reach = p.range === 99 ? 6 : p.range;
      return d <= reach + p.areaRadius;
    });
    if (!inRange) continue;

    // Use burstDamage for multi-hit attacks, maxPower for single-hit
    const effectiveDamage = p.burstDamage > 0 ? p.burstDamage : p.maxPower;
    const threatValue = effectiveDamage * 0.6 + p.hitCount * 8;

    if (effectiveDamage >= 300 || p.tags.includes(PrimitiveTag.KILL)) {
      result.immediateLethal = true;
      result.latentLethalThreat = true;
      result.lethalThreats.push({
        skillId: skillRef.id,
        damage: effectiveDamage,
        hits: p.hitCount || 1,
        type: 'lethal',
      });
    } else if (effectiveDamage >= 150) {
      result.latentLethalThreat = true;
      result.lethalThreats.push({
        skillId: skillRef.id,
        damage: effectiveDamage,
        hits: p.hitCount || 1,
        type: 'high_threat',
      });
    }

    result.threatScore += threatValue;
  }

  return result;
}

export function evaluateActionThreat(engine, actorId, action, context = {}) {
  const profile = context.profile || getSkillPrimitiveProfile(action.skillId);
  const stateActor = context.stateActor || engine.getState().characters.find(c => c.id === actorId);
  const enemies = context.enemies || [];

  const result = {
    immediateLethal: false,
    latentThreat: false,
    killPressure: 0,
    reasons: [],
  };

  if (!profile.tags.includes(PrimitiveTag.PRESSURE)) return result;

  const effectiveDamage = profile.burstDamage > 0 ? profile.burstDamage : profile.maxPower;

  if (effectiveDamage >= 300 || profile.tags.includes(PrimitiveTag.KILL)) {
    result.immediateLethal = true;
    result.latentThreat = true;
    result.reasons.push('burst_lethal');
  } else if (effectiveDamage >= 150) {
    result.latentThreat = true;
    result.reasons.push('high_kill_pressure');
  }

  result.killPressure = effectiveDamage * 0.6 + profile.hitCount * 8;

  // Check if any enemy is in range
  if (stateActor && enemies.length > 0) {
    const inRange = enemies.some(en => {
      const d = hexDistance(stateActor.position.q, stateActor.position.r, en.position.q, en.position.r);
      const reach = profile.range === 99 ? 6 : profile.range;
      return d <= reach + profile.areaRadius;
    });
    if (inRange && result.latentThreat) {
      result.reasons.push('in_range_threat');
    }
  }

  return result;
}

export function evaluateGreedWindow(engine, actorId, context = {}) {
  const threatState = context.threatState || evaluateThreatState(engine.getState(), engine.getCharacterOwner(actorId));
  const isUnderThreat = context.isUnderThreat ?? threatState.underThreat;
  const hasLatentLethal = context.hasLatentLethal ?? threatState.latentLethalThreat;

  const result = {
    greedy: false,
    punishable: false,
    reasons: [],
  };

  if (hasLatentLethal && !isUnderThreat) {
    result.greedy = true;
    result.reasons.push('retained_lethal_threat');
    result.reasons.push('greed_window');
  }

  if (isUnderThreat) {
    result.punishable = true;
    if (hasLatentLethal) {
      result.reasons.push('unsafe_greed');
    } else {
      result.reasons.push('punishable_greed');
    }
  }

  return result;
}
