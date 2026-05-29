import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';
import { hexDistance } from '../HexMath.js';

const MARROW_LAYER_VALUE = [0, 35, 75, 120, 175, 240];
const MARROW_COSTS = [3, 4, 4, 5, 5];

export function evaluateRoleStrategy(engine, actorId, action, context = {}) {
  const profile = context.profile || getSkillPrimitiveProfile(action.skillId);
  const actor = context.actor || engine.registry.get(actorId);
  const stateActor = context.stateActor || engine.getState().characters.find(c => c.id === actorId);
  const enemies = context.enemies || getAliveEnemies(engine, actor);
  const turn = context.turn ?? engine.getTurnNumber?.() ?? 1;
  const hasImmediateLethal = context.hasImmediateLethal ?? false;
  const isUnderThreat = context.isUnderThreat ?? false;

  const reasons = [];
  let scoreDelta = 0;

  // ── Jimmy: encourage wine drinking ──
  if (actor.roleId === 'warrior_jimmy' &&
      (profile.tags.includes(PrimitiveTag.SCALING_THREAT) || profile.tags.includes(PrimitiveTag.INVEST))) {
    const marrowBuf = (stateActor?.buffs || []).find(b => b.statusType === 'JIMMY_MARROW');
    const layer = marrowBuf?.data?.layer || 0;
    if (layer < 5) {
      const cost = MARROW_COSTS[layer] || 5;
      const rage = engine.resourceSystem.get(actorId, 'rage') || 0;
      if (rage >= cost) {
        scoreDelta += 50;
        reasons.push('jimmy_marrow');

        if (!isUnderThreat && !hasImmediateLethal) {
          scoreDelta += 20;
          reasons.push('safe_scaling');
        }
        if (isUnderThreat) {
          scoreDelta -= 40;
          reasons.push('unsafe_drink');
        }
        if (hasImmediateLethal) {
          scoreDelta -= 40;
          reasons.push('lethal_available');
        }
        // Check post-drink resources — can still defend?
        const postRage = rage - cost;
        const hasPressureSkill = (stateActor?.skills || []).some(sr => {
          const p = getSkillPrimitiveProfile(sr.id);
          return p.tags.includes(PrimitiveTag.PRESSURE) && !Object.entries(p.cost).some(([r, a]) => (engine.resourceSystem.get(actorId, r) || 0) < a);
        });
        if (postRage >= 1 || hasPressureSkill) {
          scoreDelta += 10;
          reasons.push('post_drink_ok');
        }
      }
    }
  }

  // ── Shooter: penalize empty setup ──
  if (profile.tags.includes(PrimitiveTag.SETUP) && !profile.tags.includes(PrimitiveTag.PRESSURE)) {
    const attackPotential = estimateAttackPotential(stateActor, enemies, engine);
    const ammo = engine.resourceSystem.get(actorId, 'ammo') || 0;
    const backpack = engine.resourceSystem.get(actorId, 'backpackAmmo') || 0;

    if (attackPotential <= 0) {
      scoreDelta -= 25;
      reasons.push('empty_setup');
    }
    if (ammo <= 0) {
      scoreDelta -= 30;
      reasons.push('no_ammo_setup');
      if (backpack > 0) {
        scoreDelta -= 20;
        reasons.push('should_reload');
      }
    }
    if (attackPotential > 0 && ammo > 0) {
      scoreDelta -= 15;
      reasons.push('attack_better');
    }
    if (attackPotential > 0 && enemies.length > 0) {
      const nearestDist = Math.min(...enemies.map(en =>
        hexDistance(stateActor.position.q, stateActor.position.r, en.position.q, en.position.r)
      ));
      if (nearestDist > 3 && attackPotential > 30) {
        scoreDelta += 10;
        reasons.push('setup_for_range');
      }
    }
    // If this is a finesse optional action and main already PRESSURE/BUILD
    if (context.isFinesseAction) {
      scoreDelta += 10;
      reasons.push('finesse_setup');
    }
  }

  // ── Generic setup penalty ──
  if (profile.tags.includes(PrimitiveTag.SETUP) && !profile.tags.includes(PrimitiveTag.PRESSURE)) {
    const followUp = estimateAttackPotential(stateActor, enemies, engine);
    if (followUp <= 0) {
      scoreDelta -= 15;
      if (!reasons.includes('empty_setup')) reasons.push('no_follow_up');
    }
    if (isUnderThreat) {
      scoreDelta -= 20;
      reasons.push('threatened_setup');
    }
    if (hasImmediateLethal) {
      scoreDelta -= 25;
      reasons.push('lethal_better');
    }
  }

  // ── Reload encouragement when empty ──
  const isReload = profile.tags.includes(PrimitiveTag.BUILD) &&
    (profile.resourceDelta?.ammo || 0) > 0 &&
    (engine.resourceSystem.get(actorId, 'ammo') || 0) <= 0;
  if (isReload) {
    scoreDelta += 20;
    reasons.push('reload_needed');
  }

  // ── Core/role skill mild bonus ──
  if (actor.roleId === 'warrior_jimmy' && action.skillId.startsWith('role_jimmy_')) {
    scoreDelta += 5;
    if (!reasons.includes('jimmy_marrow')) reasons.push('core_skill');
  }

  return { scoreDelta, reasons };
}

export function evaluateStrategicState(state, ownerId) {
  const self = (state.characters || []).filter(c => c.alive !== false && c.ownerId === ownerId);
  const enemies = (state.characters || []).filter(c => c.alive !== false && c.ownerId !== ownerId);
  if (self.length === 0) return { total: -200, details: { eliminated: true } };

  let total = 0;
  const details = {};

  for (const char of self) {
    // Jimmy marrow value
    if (char.roleId === 'warrior_jimmy') {
      const marrow = (char.buffs || []).find(b => b.statusType === 'JIMMY_MARROW');
      const layer = marrow?.data?.layer || 0;
      const marrowValue = MARROW_LAYER_VALUE[layer] || 240;
      details.marrowLayer = layer;
      details.marrowValue = marrowValue;
      total += marrowValue;
    }

    // Setup realization value
    const hasSpeedBoost = (char.buffs || []).some(b => b.statusType === 'SPEED_BOOST');
    const hasSureHit = (char.buffs || []).some(b => b.statusType === 'SURE_HIT');
    const hasSheathed = (char.buffs || []).some(b => b.statusType === 'SHEATHED');
    const hasBellPending = (char.buffs || []).some(b => b.statusType === 'BELL_PENDING');
    const hasCoveringFire = (char.buffs || []).some(b => b.statusType === 'COVERING_FIRE');

    if (hasSpeedBoost) {
      const ap = estimateAttackPotential(char, enemies);
      total += ap > 0 ? 12 : 3;
      details.speedBoostValue = ap > 0 ? 12 : 3;
    }
    if (hasSureHit) {
      const ap = estimateAttackPotential(char, enemies);
      total += ap > 20 ? 15 : 5;
      details.sureHitValue = ap > 20 ? 15 : 5;
    }
    if (hasSheathed) {
      const enemyHasProjectile = enemies.some(en =>
        (en.skills || []).some(sr => {
          const p = getSkillPrimitiveProfile(sr.id);
          return p.tags.includes(PrimitiveTag.PROJECTILE_THREAT) || p.tags.includes(PrimitiveTag.MELEE_THREAT);
        })
      );
      total += enemyHasProjectile ? 18 : 6;
      details.sheathedValue = enemyHasProjectile ? 18 : 6;
    }
    if (hasBellPending) {
      const ammo = char.resources?.ammo || 0;
      total += ammo > 0 ? 10 : 4;
      details.bellPendingValue = ammo > 0 ? 10 : 4;
    }
    if (hasCoveringFire) {
      const enemyPressureNear = enemies.some(en => {
        const d = hexDistance(char.position.q, char.position.r, en.position.q, en.position.r);
        return d <= 3;
      });
      total += enemyPressureNear ? 12 : 4;
      details.coveringFireValue = enemyPressureNear ? 12 : 4;
    }
  }

  // Enemy marrow scaling threat
  for (const enemy of enemies) {
    if (enemy.roleId === 'warrior_jimmy') {
      const marrow = (enemy.buffs || []).find(b => b.statusType === 'JIMMY_MARROW');
      const layer = marrow?.data?.layer || 0;
      total -= MARROW_LAYER_VALUE[layer] * 0.5;
    }
  }

  details.total = total;
  return { total, details };
}

function getAliveEnemies(engine, actor) {
  return [...engine.registry.characters()].filter(c =>
    c.alive !== false &&
    c.ownerId !== actor.ownerId &&
    (c.position?.dim || 'real') === (actor.position?.dim || 'real')
  );
}

export function estimateAttackPotential(stateActor, enemies, engineOrResources) {
  if (!stateActor || !enemies || enemies.length === 0) return 0;
  const skills = stateActor.skills || [];
  const resources = stateActor.resources || {};

  let potential = 0;
  for (const skillRef of skills) {
    const p = getSkillPrimitiveProfile(skillRef.id);
    if (!p.tags.includes(PrimitiveTag.PRESSURE)) continue;

    let affordable = true;
    for (const [res, amt] of Object.entries(p.cost)) {
      if ((resources[res] || 0) < amt) { affordable = false; break; }
    }
    if (!affordable) continue;

    const reachable = enemies.some(en => {
      const d = hexDistance(stateActor.position.q, stateActor.position.r, en.position.q, en.position.r);
      if (p.range === 99) return true;
      if (p.tags.includes(PrimitiveTag.AREA_THREAT)) return d <= p.range + p.areaRadius;
      return d <= p.range;
    });

    if (reachable) {
      potential += 20 + Math.min(120, p.maxPower * 0.1);
      if (p.tags.includes(PrimitiveTag.KILL)) potential += 30;
      if (p.tags.includes(PrimitiveTag.PIERCE_THREAT)) potential += 12;
    }
  }
  return potential;
}
