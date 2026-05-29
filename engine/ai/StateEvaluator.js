import { hexDistance } from '../HexMath.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';
import { evaluateStrategicState } from './RoleStrategyEvaluator.js';

const TERMINAL_SCORE = 1000;

const RESOURCE_WEIGHTS = Object.freeze({
  qi: 10,
  rage: 12,
  ammo: 9,
  backpackAmmo: 5,
  shield: 0.03,
});

export function evaluateState(state, ownerId) {
  const self = liveCharacters(state).filter(c => c.ownerId === ownerId);
  const enemies = liveCharacters(state).filter(c => c.ownerId !== ownerId);
  const selfStrategy = evaluateStrategicState(state, ownerId).total;
  const enemyStrategy = evaluateStrategicStateForEnemies(state, ownerId);
  const terms = {
    terminal: terminalValue(self, enemies),
    resources: resourceValue(self) - resourceValue(enemies),
    threat: threatValue(self, enemies) - threatValue(enemies, self),
    position: positionValue(self, enemies) - positionValue(enemies, self),
    tempo: tempoValue(self) - tempoValue(enemies),
    strategy: selfStrategy - enemyStrategy,
  };

  return {
    total: Object.values(terms).reduce((sum, value) => sum + value, 0),
    terms,
  };
}

function liveCharacters(state) {
  return (state.characters || []).filter(c => c.alive !== false);
}

function terminalValue(self, enemies) {
  if (self.length > 0 && enemies.length === 0) return TERMINAL_SCORE;
  if (self.length === 0 && enemies.length > 0) return -TERMINAL_SCORE;
  return 0;
}

function resourceValue(chars) {
  let value = 0;
  for (const char of chars) {
    for (const [resource, weight] of Object.entries(RESOURCE_WEIGHTS)) {
      value += (char.resources?.[resource] || 0) * weight;
    }
  }
  return value;
}

function threatValue(actors, enemies) {
  let value = 0;
  for (const actor of actors) {
    for (const skillRef of actor.skills || []) {
      const profile = getSkillPrimitiveProfile(skillRef.id);
      if (!profile.tags.includes(PrimitiveTag.PRESSURE)) continue;
      if (!canAfford(actor, profile.cost)) continue;

      const reachableEnemy = enemies.some(enemy => skillCanReach(actor, profile, enemy));
      if (!reachableEnemy) continue;

      value += threatScore(profile);
    }
  }
  return value;
}

function threatScore(profile) {
  let value = 20 + Math.min(120, profile.maxPower * 0.1);
  if (profile.tags.includes(PrimitiveTag.KILL)) value += 35;
  if (profile.tags.includes(PrimitiveTag.PIERCE_THREAT)) value += 12;
  if (profile.tags.includes(PrimitiveTag.LOCK_THREAT)) value += 14;
  if (profile.tags.includes(PrimitiveTag.REACTION_THREAT)) value += 10;
  if (profile.tags.includes(PrimitiveTag.DELAYED_THREAT)) value -= 8;
  return value - profile.commitment * 1.5;
}

function positionValue(actors, enemies) {
  if (actors.length === 0 || enemies.length === 0) return 0;
  let value = 0;
  for (const actor of actors) {
    const nearest = Math.min(...enemies.map(enemy =>
      hexDistance(actor.position.q, actor.position.r, enemy.position.q, enemy.position.r)
    ));
    if (prefersCloseRange(actor)) value += Math.max(0, 4 - nearest) * 4;
    else value += Math.min(nearest, 4) * 2;
  }
  return value;
}

function prefersCloseRange(actor) {
  return (actor.skills || []).some(skillRef => {
    const profile = getSkillPrimitiveProfile(skillRef.id);
    return profile.tags.includes(PrimitiveTag.MELEE_THREAT) ||
      profile.tags.includes(PrimitiveTag.POSITION_THREAT);
  });
}

function tempoValue(chars) {
  let value = 0;
  for (const char of chars) {
    const ap = char.actionPoints;
    if (ap?.main?.used === 0) value += 6;
    if ((ap?.finesse?.total || 0) > (ap?.finesse?.used || 0)) value += 4;
    for (const buff of char.buffs || []) {
      if (buff.statusType === 'SPEED_BOOST') value += 8;
      if (buff.statusType === 'ROOTED' || buff.statusType === 'LOCKED') value -= 18;
    }
  }
  return value;
}

function canAfford(char, cost) {
  for (const [resource, amount] of Object.entries(cost)) {
    if ((char.resources?.[resource] || 0) < amount) return false;
  }
  return true;
}

function evaluateStrategicStateForEnemies(state, ownerId) {
  const enemies = (state.characters || []).filter(c => c.alive !== false && c.ownerId !== ownerId);
  let total = 0;
  for (const enemy of enemies) {
    total += evaluateStrategicState(state, enemy.ownerId).total;
  }
  return total;
}

function skillCanReach(actor, profile, enemy) {
  const dist = hexDistance(actor.position.q, actor.position.r, enemy.position.q, enemy.position.r);
  // Self-centered AOE: reach = areaRadius, not range
  if (profile.tags.includes(PrimitiveTag.AREA_THREAT) && profile.range === 0) {
    return dist <= profile.areaRadius;
  }
  // Point-target AOE (e.g. 如来神掌): max reach = range + areaRadius
  if (profile.tags.includes(PrimitiveTag.AREA_THREAT) && profile.areaRadius > 0) {
    const maxReach = (profile.range === 99 ? 6 : profile.range) + profile.areaRadius;
    return dist <= maxReach;
  }
  return profile.range === 99 || dist <= profile.range;
}
