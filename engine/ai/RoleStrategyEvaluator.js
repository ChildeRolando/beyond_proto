import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';
import { hexDistance } from '../HexMath.js';
import { evaluateGreedWindow } from './ThreatEvaluator.js';

const MARROW_LAYER_VALUE = [0, 35, 75, 120, 175, 240];
const MARROW_COSTS = [3, 4, 4, 5, 5];
const AMMO_MAX = 6;

export function evaluateRoleStrategy(engine, actorId, action, context = {}) {
  const profile = context.profile || getSkillPrimitiveProfile(action.skillId);
  const actor = context.actor || engine.registry.get(actorId);
  const stateActor = context.stateActor || engine.getState().characters.find(c => c.id === actorId);
  const enemies = context.enemies || getAliveEnemies(engine, actor);
  const turn = context.turn ?? engine.getTurnNumber?.() ?? 1;
  const hasImmediateLethal = context.hasImmediateLethal ?? false;
  const isUnderThreat = context.isUnderThreat ?? false;
  const hasLatentLethal = context.hasLatentLethal ?? false;

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
    const attackPotential = estimateAttackPotential(stateActor, enemies);
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
    if (context.isFinesseAction) {
      scoreDelta += 10;
      reasons.push('finesse_setup');
    }
  }

  // ── Generic setup penalty ──
  if (profile.tags.includes(PrimitiveTag.SETUP) && !profile.tags.includes(PrimitiveTag.PRESSURE)) {
    const followUp = estimateAttackPotential(stateActor, enemies);
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

  // ── Ammo economy: marginal reload/collect value ──
  const ammo = engine.resourceSystem.get(actorId, 'ammo') || 0;
  const backpackAmmo = engine.resourceSystem.get(actorId, 'backpackAmmo') || 0;

  const isReload = profile.tags.includes(PrimitiveTag.BUILD) &&
    (profile.resourceDelta?.ammo || 0) > 0 && !isCollectAction(profile);
  if (isReload) {
    if (ammo >= AMMO_MAX) {
      scoreDelta -= 50;
      reasons.push('ammo_full');
    } else if (backpackAmmo <= 0) {
      scoreDelta -= 30;
      reasons.push('reload_no_backpack');
    } else {
      const reloadGain = Math.min(profile.resourceDelta?.ammo || 6, AMMO_MAX - ammo, backpackAmmo);
      if (reloadGain <= 0) {
        scoreDelta -= 50;
        reasons.push('reload_zero_gain');
      } else if (ammo <= 0) {
        scoreDelta += 8;
        reasons.push('reload_needed');
      } else if (ammo < 3) {
        scoreDelta += 3;
        reasons.push('reload_marginal');
      } else {
        scoreDelta -= 10;
        reasons.push('reload_unnecessary');
      }
    }
  }

  // Collect actions: bonus when near ground resources
  if (isCollectAction(profile) && ammo < AMMO_MAX) {
    const state = engine.getState();
    const casings = state.casings || [];
    const wildBullets = state.wildBullets || [];
    let nearbyResources = 0;
    if (stateActor) {
      for (const res of [...casings, ...wildBullets]) {
        const d = hexDistance(stateActor.position.q, stateActor.position.r, res.q, res.r);
        if (d <= 3) nearbyResources += (res.count || 1);
      }
    }
    if (nearbyResources > 0) {
      scoreDelta += Math.min(35, nearbyResources * 12);
      reasons.push('nearby_resources');
    }
  }

  // Greed window for BUILD without PRESSURE
  if (profile.tags.includes(PrimitiveTag.BUILD) && !profile.tags.includes(PrimitiveTag.PRESSURE)) {
    const greedCtx = context.greedWindow || evaluateGreedWindow(engine, actorId, {
      threatState: context.threatState,
      isUnderThreat,
      hasLatentLethal,
    });
    if (greedCtx.greedy) {
      scoreDelta += 15;
      if (!reasons.includes('greed_window')) reasons.push('greed_window');
    }
    if (greedCtx.punishable) {
      scoreDelta -= 20;
      reasons.push('punishable_greed');
    }
    for (const r of greedCtx.reasons) {
      if (!reasons.includes(r)) reasons.push(r);
    }
  }

  // High-pressure skill recognition
  if (profile.tags.includes(PrimitiveTag.PRESSURE)) {
    const effectiveDamage = profile.burstDamage > 0 ? profile.burstDamage : profile.maxPower;
    if (effectiveDamage >= 300 || profile.tags.includes(PrimitiveTag.KILL)) {
      scoreDelta += 65;
      reasons.push('burst_lethal');
    } else if (effectiveDamage >= 150) {
      scoreDelta += 30;
      reasons.push('high_kill_pressure');
    }
    if (profile.hitCount >= 5) {
      scoreDelta += 10;
      reasons.push('multi_hit');
    }
  }

  // Core/role skill mild bonus
  if (actor.roleId === 'warrior_jimmy' && action.skillId.startsWith('role_jimmy_')) {
    scoreDelta += 5;
    if (!reasons.includes('jimmy_marrow')) reasons.push('core_skill');
  }

  return { scoreDelta, reasons };
}

export function evaluateAmmoEconomy(engine, actorId, options = {}) {
  const ammo = engine.resourceSystem.get(actorId, 'ammo') || 0;
  const backpackAmmo = engine.resourceSystem.get(actorId, 'backpackAmmo') || 0;
  const state = engine.getState();
  const stateActor = state.characters.find(c => c.id === actorId);
  const allGround = [...(state.casings || []), ...(state.wildBullets || [])];
  let nearbyCollectable = 0;
  if (stateActor) {
    for (const res of allGround) {
      const d = hexDistance(stateActor.position.q, stateActor.position.r, res.q, res.r);
      if (d <= 3) nearbyCollectable += (res.count || 1);
    }
  }
  return {
    ammo,
    ammoMax: AMMO_MAX,
    backpackAmmo,
    isFull: ammo >= AMMO_MAX,
    isEmpty: ammo <= 0,
    nearbyCollectable,
    canReload: backpackAmmo > 0 && ammo < AMMO_MAX,
    reloadGain: Math.min(AMMO_MAX - ammo, backpackAmmo, 6),
  };
}

export function evaluateStrategicState(state, ownerId) {
  const self = (state.characters || []).filter(c => c.alive !== false && c.ownerId === ownerId);
  const enemies = (state.characters || []).filter(c => c.alive !== false && c.ownerId !== ownerId);
  if (self.length === 0) return { total: -200, details: { eliminated: true } };

  let total = 0;
  const details = {};

  for (const char of self) {
    if (char.roleId === 'warrior_jimmy') {
      const marrow = (char.buffs || []).find(b => b.statusType === 'JIMMY_MARROW');
      const layer = marrow?.data?.layer || 0;
      const marrowValue = layer < MARROW_LAYER_VALUE.length ? MARROW_LAYER_VALUE[layer] : 240;
      details.marrowLayer = layer;
      details.marrowValue = marrowValue;
      total += marrowValue;
    }

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

function isCollectAction(profile) {
  return (profile.tags.includes(PrimitiveTag.BUILD) && profile.tags.includes(PrimitiveTag.ESCAPE)) ||
    ((profile.resourceDelta?.backpackAmmo || 0) > 0 && profile.tags.includes(PrimitiveTag.ESCAPE));
}

export function estimateAttackPotential(stateActor, enemies) {
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
      const effectiveDamage = p.burstDamage > 0 ? p.burstDamage : p.maxPower;
      potential += 20 + Math.min(120, effectiveDamage * 0.1);
      if (p.tags.includes(PrimitiveTag.KILL) || effectiveDamage >= 300) potential += 30;
      if (p.tags.includes(PrimitiveTag.PIERCE_THREAT)) potential += 12;
    }
  }
  return potential;
}
