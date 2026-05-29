import { hexDistance, hexNeighbors } from '../HexMath.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from './PrimitiveProfile.js';

const BOARD_MIN = -3, BOARD_MAX = 3;

function hexKey(q, r) { return `${q},${r}`; }

export function buildTacticalMap(engine, actorId, options = {}) {
  const actor = engine.registry.get(actorId);
  if (!actor || actor.alive === false) return emptyMap();

  const state = engine.getState();
  const enemies = (state.characters || []).filter(c =>
    c.alive !== false && c.ownerId !== actor.ownerId && c.position?.dim === (actor.position?.dim || 'real')
  );

  const dangerByHex = new Map();
  const opportunityByHex = new Map();
  const reasonByHex = new Map();

  const actorPos = actor.position;

  // --- DANGER: from enemy skills ---
  for (const enemy of enemies) {
    if (!enemy.skills) continue;
    const enemyPos = enemy.position;
    for (const skillRef of enemy.skills) {
      const profile = getSkillPrimitiveProfile(skillRef.id);
      const range = profile.range === 99 ? 6 : profile.range;
      const areaR = profile.areaRadius || 0;

      if (profile.tags.includes(PrimitiveTag.PRESSURE)) {
        if (profile.tags.includes(PrimitiveTag.MELEE_THREAT)) {
          // Melee danger: close to enemy = dangerous
          for (let q = BOARD_MIN; q <= BOARD_MAX; q++) {
            for (let r = BOARD_MIN; r <= BOARD_MAX; r++) {
              const d = hexDistance(q, r, enemyPos.q, enemyPos.r);
              if (d <= 1) {
                const danger = (4 - d) * 3;
                addDanger(dangerByHex, reasonByHex, q, r, danger, 'enemy_melee');
              }
            }
          }
        }
        if (profile.tags.includes(PrimitiveTag.AREA_THREAT)) {
          const maxReach = range + areaR;
          for (let q = BOARD_MIN; q <= BOARD_MAX; q++) {
            for (let r = BOARD_MIN; r <= BOARD_MAX; r++) {
              const d = hexDistance(q, r, enemyPos.q, enemyPos.r);
              if (d <= maxReach) {
                const danger = Math.max(0, 6 - d) * 2;
                addDanger(dangerByHex, reasonByHex, q, r, danger, 'enemy_aoe');
              }
            }
          }
        }
        if (profile.tags.includes(PrimitiveTag.PROJECTILE_THREAT)) {
          // Line threat: danger along path from enemy toward actor
          for (let q = BOARD_MIN; q <= BOARD_MAX; q++) {
            for (let r = BOARD_MIN; r <= BOARD_MAX; r++) {
              const d = hexDistance(q, r, enemyPos.q, enemyPos.r);
              if (d <= range) {
                const danger = Math.max(0, range - d) * 2;
                addDanger(dangerByHex, reasonByHex, q, r, danger, 'enemy_projectile');
              }
            }
          }
        }
      }
      if (profile.tags.includes(PrimitiveTag.CONTROL) || profile.tags.includes(PrimitiveTag.LOCK_THREAT)) {
        for (let q = BOARD_MIN; q <= BOARD_MAX; q++) {
          for (let r = BOARD_MIN; r <= BOARD_MAX; r++) {
            const d = hexDistance(q, r, enemyPos.q, enemyPos.r);
            if (d <= range) {
              addDanger(dangerByHex, reasonByHex, q, r, (4 - d) * 2, 'enemy_control');
            }
          }
        }
      }
    }
  }

  // --- DANGER: from active projectiles ---
  const projectiles = engine.projectileCalculator?.projectiles || [];
  for (const proj of projectiles) {
    if (!proj.alive) continue;
    const isHostile = proj.ownerId !== actor.id && !enemies.some(e => e.id === proj.ownerId);
    // Hostile or friendly-fire-capable: mark danger on remaining path
    for (let i = proj.stepIndex; i < proj.path.length; i++) {
      const [pq, pr] = proj.path[i];
      const danger = 5 + (proj.power || 0) * 0.02;
      addDanger(dangerByHex, reasonByHex, pq, pr, danger, 'active_projectile');
    }
  }

  // --- OPPORTUNITY: positioning ---
  const prefersMelee = (actor.skills || []).some(sid => {
    const p = getSkillPrimitiveProfile(typeof sid === 'object' ? sid.id : sid);
    return p.tags.includes(PrimitiveTag.MELEE_THREAT) || p.tags.includes(PrimitiveTag.POSITION_THREAT);
  });

  for (let q = BOARD_MIN; q <= BOARD_MAX; q++) {
    for (let r = BOARD_MIN; r <= BOARD_MAX; r++) {
      if (enemies.length === 0) continue;
      const nearestEnemyDist = Math.min(...enemies.map(en =>
        hexDistance(q, r, en.position.q, en.position.r)
      ));
      if (prefersMelee) {
        const opp = (4 - nearestEnemyDist) * 3;
        if (opp > 0) addOpp(opportunityByHex, reasonByHex, q, r, opp, 'melee_proximity');
      } else {
        const opp = Math.min(nearestEnemyDist, 4) * 2;
        if (opp > 0) addOpp(opportunityByHex, reasonByHex, q, r, opp, 'ranged_spacing');
      }
    }
  }

  // --- OPPORTUNITY: ground resources ---
  const groundResources = [
    ...(state.casings || []).map(c => ({ q: c.q, r: c.r })),
    ...(state.wildBullets || []).map(b => ({ q: b.q, r: b.r })),
  ];
  for (let q = BOARD_MIN; q <= BOARD_MAX; q++) {
    for (let r = BOARD_MIN; r <= BOARD_MAX; r++) {
      for (const res of groundResources) {
        if (hexDistance(q, r, res.q, res.r) <= 1) {
          addOpp(opportunityByHex, reasonByHex, q, r, 5, 'near_resource');
        }
      }
    }
  }

  // --- OPPORTUNITY: WEAK_POINT direction ---
  for (const enemy of enemies) {
    const wpBuffs = (enemy.buffs || []).filter(b => b.statusType === 'WEAK_POINT');
    for (const wp of wpBuffs) {
      const dirs = wp.data?.directions || [];
      if (dirs.length === 0) continue;
      // Hex direction vectors: attacker position relative to target
      const hexDirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
      for (const dirIdx of dirs) {
        const [ddq, ddr] = hexDirs[dirIdx];
        // The hex from which an attack would hit this weak point
        const wq = enemy.position.q + ddq;
        const wr = enemy.position.r + ddr;
        addOpp(opportunityByHex, reasonByHex, wq, wr, 8, 'weak_point');
      }
    }
  }

  return { dangerByHex, opportunityByHex, reasonByHex };
}

export function getHexTacticalScore(tacticalMap, q, r) {
  const key = hexKey(q, r);
  const danger = tacticalMap.dangerByHex?.get(key) || 0;
  const opportunity = tacticalMap.opportunityByHex?.get(key) || 0;
  return {
    danger,
    opportunity,
    score: opportunity - danger,
    reasons: tacticalMap.reasonByHex?.get(key) || [],
  };
}

function emptyMap() {
  return { dangerByHex: new Map(), opportunityByHex: new Map(), reasonByHex: new Map() };
}

function addDanger(dangerByHex, reasonByHex, q, r, amount, reason) {
  const key = hexKey(q, r);
  dangerByHex.set(key, (dangerByHex.get(key) || 0) + amount);
  addReason(reasonByHex, q, r, reason);
}

function addOpp(opportunityByHex, reasonByHex, q, r, amount, reason) {
  const key = hexKey(q, r);
  opportunityByHex.set(key, (opportunityByHex.get(key) || 0) + amount);
  addReason(reasonByHex, q, r, reason);
}

function addReason(reasonByHex, q, r, reason) {
  const key = hexKey(q, r);
  const existing = reasonByHex.get(key) || [];
  if (!existing.includes(reason)) existing.push(reason);
  reasonByHex.set(key, existing);
}
