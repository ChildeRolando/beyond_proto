// Projectile path tracing, collision, interception, body contact, and animation keyframes
import { hexLine, hexDistance, hexSpiral, isOnBoard } from './HexMath.js';
import { EvtType } from './CommandTypes.js';
import { HookName } from './BuffHooks.js';
import { canAffectCharacter } from './TeamResolver.js';

let _projId = 0;

// Deterministic PRNG — same seed produces same sequence on both sides
function seededRandom(seed) {
  let s = seed | 0;
  return function() {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

export class ProjectileCalculator {
  #projectiles = [];
  #casings = new Map();
  #supplyCrates = new Map();     // posKey → count (worth 3 backpack each)
  #wildBullets = new Map();      // posKey → count
  #wildBulletsCollected = 0;
  #lastInterceptions = [];
  #lastHits = [];
  #lastCollisions = [];     // projectile-vs-projectile collisions (相杀, 贯穿)
  #logger;

  constructor(logger) {
    this.#logger = logger;
  }

  get projectiles() { return this.#projectiles; }
  get activeCount() { return this.#projectiles.filter(p => p.alive).length; }

  getProjectiles() { return this.#projectiles; }
  destroyProjectile(id) {
    const p = this.#projectiles.find(p => p.id === id);
    if (p) p.alive = false;
  }

  createProjectile(ownerId, fromQ, fromR, toQ, toR, power, speed, flags = [], actionId = null) {
    let path = hexLine(fromQ, fromR, toQ, toR);
    const isStationary = flags.includes('STATIONARY');
    const isMelee = flags.includes('MELEE');
    if (path.length < 2 && !isStationary) {
      // Same-hex melee: duplicate the hex so the projectile advances and triggers body contact
      if (isMelee && path.length === 1) {
        path = [[path[0][0], path[0][1]], [path[0][0], path[0][1]]];
      } else {
        return null;
      }
    }

    const proj = {
      id: 'proj_' + (++_projId),
      ownerId,
      actionId,
      path,
      stepIndex: 0,
      power,
      speed: speed ?? 1,
      flags,
      alive: true,
      fromQ, fromR,
      toQ, toR,
    };

    this.#projectiles.push(proj);

    if (flags.includes('CASING_DROP')) {
      this._dropCasing(fromQ, fromR);
    }

    return proj;
  }

  // Comprehensive projectile resolution: advance through full path, checking body contact at each hex
  resolveStep(speedTier, registry, damageCalculator, buffManager, options = {}) {
    this.#lastInterceptions = [];
    this.#lastHits = [];
    this.#lastCollisions = [];
    const active = this.#projectiles.filter(p => p.alive && p.speed === speedTier);
    if (active.length === 0) return { interceptions: [], hits: [] };

    // Advance all projectiles one step at a time, checking cross-collisions after each step.
    // The outer loop runs until all projectiles reach their destinations (or are destroyed).
    // Projectiles with SURE_HIT homing may extend their paths mid-flight.
    let maxSteps = 0;
    for (const proj of active) {
      const rem = proj.path.length - 1 - proj.stepIndex;
      if (rem > maxSteps) maxSteps = rem;
    }

    for (let s = 0; s < maxSteps; s++) {
      // --- SURE_HIT homing: extend paths for projectiles that reached destination without hitting ---
      for (const proj of active) {
        if (!proj.alive) continue;
        if (proj.stepIndex < proj.path.length - 1) continue;
        // At path end — check for SURE_HIT target to home in on
        const [pq, pr] = proj.path[proj.stepIndex];
        for (const entity of registry.characters()) {
          if (entity.alive === false || entity.id === proj.ownerId) continue;
          const acqCtx = buffManager.dispatch(HookName.ON_TARGET_ACQUIRE, {
            sourceId: proj.ownerId, targetId: entity.id, forceHit: false,
          });
          if (acqCtx?.forceHit) {
            const tq = entity.position.q, tr = entity.position.r;
            if (tq !== pq || tr !== pr) {
              const newSeg = hexLine(pq, pr, tq, tr);
              proj.path.push(...newSeg.slice(1));
              this.#logger?.log('🎯 必中！弹体追踪目标新位置', 'rg');
            }
            break;
          }
        }
      }

      // Recompute maxSteps (paths may have been extended by homing)
      maxSteps = s;
      for (const proj of active) {
        if (!proj.alive) continue;
        const rem = proj.path.length - 1 - proj.stepIndex;
        if (s + rem > maxSteps) maxSteps = s + rem;
      }

      // --- Advance all alive projectiles by one step ---
      for (const proj of active) {
        if (!proj.alive) continue;
        if (proj.stepIndex >= proj.path.length - 1) continue;

        proj.stepIndex++;
        const [q, r] = proj.path[proj.stepIndex];
      }

      // --- Check crossing collisions BEFORE body contact (melee-melee swaps annihilate) ---
      this._checkCrossings();

      // --- Body contact for projectiles that survived crossing check ---
      for (const proj of active) {
        if (!proj.alive) continue;
        const [q, r] = proj.path[proj.stepIndex];
        this._checkBodyContactAt(proj, q, r, registry, damageCalculator, buffManager, options);
      }

      // --- Same-hex collisions AFTER body contact (melee hits target before stationary collision) ---
      this._checkCollisions();

      // Remove dead projectiles from active set
      for (let i = active.length - 1; i >= 0; i--) {
        if (!active[i].alive) active.splice(i, 1);
      }
    }

    // Stationary projectiles: check body contact at their hex, then expire
    const stationaryProjs = this.#projectiles.filter(
      p => p.alive && p.flags.includes('STATIONARY') && p.speed === speedTier
    );
    for (const proj of stationaryProjs) {
      const [q, r] = proj.path[proj.stepIndex];
      this._checkBodyContactAt(proj, q, r, registry, damageCalculator, buffManager, options);
    }
    this._checkCollisions();
    for (const proj of stationaryProjs) {
      if (proj.alive) {
        proj.alive = false;
      }
    }

    // After all steps done: expire any projectiles that ran out of path (stuck, no homing target)
    for (const proj of active) {
      if (!proj.alive) continue;
      if (proj.stepIndex >= proj.path.length - 1) {
        proj.alive = false;
      }
    }

    this.#projectiles = this.#projectiles.filter(p => p.alive);
    return { interceptions: this.#lastInterceptions, hits: this.#lastHits, collisions: this.#lastCollisions };
  }

  // Internal: check projectiles sharing same hex → power annihilation
  _checkCollisions() {
    const destroyed = new Set();
    const byHex = new Map();

    for (const proj of this.#projectiles) {
      if (!proj.alive || destroyed.has(proj.id)) continue;
      const [q, r] = proj.path[proj.stepIndex];
      const key = `${q},${r}`;
      if (!byHex.has(key)) byHex.set(key, []);
      byHex.get(key).push(proj);
    }

    for (const [key, projs] of byHex) {
      if (projs.length < 2) continue;
      projs.sort((a, b) => b.power - a.power);
      const [cq, cr] = key.split(',').map(Number);

      for (let i = 0; i < projs.length; i++) {
        if (!projs[i].alive || destroyed.has(projs[i].id)) continue;
        for (let j = i + 1; j < projs.length; j++) {
          if (!projs[j].alive || destroyed.has(projs[j].id)) continue;
          if (projs[i].ownerId === projs[j].ownerId) continue;

          const strong = projs[i], weak = projs[j];
          const strongMelee = strong.flags.includes('MELEE');
          const weakMelee = weak.flags.includes('MELEE');
          if (strong.power === weak.power) {
            strong.alive = false;
            weak.alive = false;
            destroyed.add(strong.id);
            destroyed.add(weak.id);
            const tag = (strongMelee || weakMelee) ? '⚔💥 斩击相杀！' : '💥 弹体相杀！';
            this.#logger?.log(`${tag}威${strong.power} vs 威${weak.power}`, 'die');
            // Record canonical collision events
            this.#lastCollisions.push({
              type: 'mutual_destroy',
              projectileId: strong.id, otherProjectileId: weak.id,
              power: strong.power, otherPower: weak.power,
              q: cq, r: cr,
              ownerId: strong.ownerId, actionId: strong.actionId, flags: [...strong.flags],
              otherOwnerId: weak.ownerId, otherActionId: weak.actionId, otherFlags: [...weak.flags],
            });
            this.#lastCollisions.push({
              type: 'mutual_destroy',
              projectileId: weak.id, otherProjectileId: strong.id,
              power: weak.power, otherPower: strong.power,
              q: cq, r: cr,
              ownerId: weak.ownerId, actionId: weak.actionId, flags: [...weak.flags],
              otherOwnerId: strong.ownerId, otherActionId: strong.actionId, otherFlags: [...strong.flags],
            });
          } else {
            weak.alive = false;
            destroyed.add(weak.id);
            const tag = (strongMelee || weakMelee) ? '⚔💥 斩击贯穿！' : '💥 弹体贯穿！';
            this.#logger?.log(`${tag}余威${strong.power}(不降威)`, 'sh');
            // Record canonical collision events for both projectiles
            this.#lastCollisions.push({
              type: 'overpowered',
              projectileId: weak.id, otherProjectileId: strong.id,
              power: weak.power, otherPower: strong.power,
              q: cq, r: cr,
              ownerId: weak.ownerId, actionId: weak.actionId, flags: [...weak.flags],
              otherOwnerId: strong.ownerId, otherActionId: strong.actionId, otherFlags: [...strong.flags],
            });
            // Also record for the strong (surviving) projectile — it made contact
            this.#lastCollisions.push({
              type: 'overpowered',
              projectileId: strong.id, otherProjectileId: weak.id,
              power: strong.power, otherPower: weak.power,
              q: cq, r: cr,
              ownerId: strong.ownerId, actionId: strong.actionId, flags: [...strong.flags],
              otherOwnerId: weak.ownerId, otherActionId: weak.actionId, otherFlags: [...weak.flags],
            });
          }
        }
      }
    }
  }

  // Check projectiles that swapped positions in this step (crossing annihilation, e.g. melee-melee)
  _checkCrossings() {
    const destroyed = new Set();
    for (let i = 0; i < this.#projectiles.length; i++) {
      const a = this.#projectiles[i];
      if (!a.alive || destroyed.has(a.id) || a.stepIndex < 1) continue;
      const [aCurQ, aCurR] = a.path[a.stepIndex];
      const [aPrevQ, aPrevR] = a.path[a.stepIndex - 1];
      for (let j = i + 1; j < this.#projectiles.length; j++) {
        const b = this.#projectiles[j];
        if (!b.alive || destroyed.has(b.id) || b.stepIndex < 1) continue;
        if (a.ownerId === b.ownerId) continue;
        const [bCurQ, bCurR] = b.path[b.stepIndex];
        const [bPrevQ, bPrevR] = b.path[b.stepIndex - 1];
        if (aCurQ === bPrevQ && aCurR === bPrevR && bCurQ === aPrevQ && bCurR === aPrevR) {
          if (a.power === b.power) {
            a.alive = false; b.alive = false;
            destroyed.add(a.id); destroyed.add(b.id);
            const tag = (a.flags.includes('MELEE') || b.flags.includes('MELEE')) ? '⚔💥 斩击相杀！' : '💥 弹体交错！';
            this.#logger?.log(`${tag}威${a.power} vs 威${b.power}`, 'die');
            this.#lastCollisions.push({
              type: 'mutual_destroy', projectileId: a.id, otherProjectileId: b.id,
              power: a.power, otherPower: b.power,
              q: (aCurQ + bCurQ) / 2, r: (aCurR + bCurR) / 2,
              ownerId: a.ownerId, actionId: a.actionId, flags: [...a.flags],
              otherOwnerId: b.ownerId, otherActionId: b.actionId, otherFlags: [...b.flags],
            });
            this.#lastCollisions.push({
              type: 'mutual_destroy', projectileId: b.id, otherProjectileId: a.id,
              power: b.power, otherPower: a.power,
              q: (aCurQ + bCurQ) / 2, r: (aCurR + bCurR) / 2,
              ownerId: b.ownerId, actionId: b.actionId, flags: [...b.flags],
              otherOwnerId: a.ownerId, otherActionId: a.actionId, otherFlags: [...a.flags],
            });
          } else {
            const strong = a.power > b.power ? a : b;
            const weak = a.power > b.power ? b : a;
            weak.alive = false;
            destroyed.add(weak.id);
            const strongMelee = strong.flags.includes('MELEE') || weak.flags.includes('MELEE');
            const tag = strongMelee ? '⚔💥 斩击贯穿！' : '💥 弹体贯穿！';
            this.#logger?.log(`${tag}余威${strong.power}(不降威)`, 'sh');
            this.#lastCollisions.push({
              type: 'overpowered', projectileId: weak.id, otherProjectileId: strong.id,
              power: weak.power, otherPower: strong.power,
              q: weak.path[weak.stepIndex][0], r: weak.path[weak.stepIndex][1],
              ownerId: weak.ownerId, actionId: weak.actionId, flags: [...weak.flags],
              otherOwnerId: strong.ownerId, otherActionId: strong.actionId, otherFlags: [...strong.flags],
            });
            // Also record for the strong (surviving) projectile
            this.#lastCollisions.push({
              type: 'overpowered', projectileId: strong.id, otherProjectileId: weak.id,
              power: strong.power, otherPower: weak.power,
              q: strong.path[strong.stepIndex][0], r: strong.path[strong.stepIndex][1],
              ownerId: strong.ownerId, actionId: strong.actionId, flags: [...strong.flags],
              otherOwnerId: weak.ownerId, otherActionId: weak.actionId, otherFlags: [...weak.flags],
            });
          }
        }
      }
    }
  }

  // Check buff interception and body contact for a projectile at a specific hex
  _checkBodyContactAt(proj, q, r, registry, damageCalculator, buffManager, options = {}) {
    // Check buff interception at this hex
    let intercepted = false;
    for (const entity of registry.characters()) {
      if (entity.alive === false || entity.id === proj.ownerId) continue;
      const dist = hexDistance(entity.position.q, entity.position.r, q, r);

      const ctx = buffManager.dispatch(HookName.ON_PROJECTILE_ENTER_RANGE, {
        entityId: entity.id,
        projectileId: proj.id,
        projectileQ: q, projectileR: r,
        projectilePower: proj.power,
        projectileOwnerId: proj.ownerId,
        distance: dist,
        intercepted: false,
        interceptPower: 0,
      });

      if (ctx?.intercepted) {
        const ip = ctx.interceptPower || 300;
        this.#lastInterceptions.push({
          projectileId: proj.id, interceptorId: entity.id,
          intercepted: true, interceptPower: ip, projectilePower: proj.power,
        });

        if (ip >= proj.power) {
          proj.alive = false;
          // 纳刀斩破弹体 → 获得引刀（刷新居合斩CD，下次居合斩cost=0）
          buffManager.apply(entity.id, 'INDRA_BLADE', 2, entity.id);
          const ownerName = registry.get(proj.ownerId)?.name || proj.ownerId;
          const meleeTag = proj.flags.includes('MELEE') ? '斩击' : '弹体';
          this.#logger?.log(`${entity.name || entity.id} ⚔ 拦截(${ownerName})！威${ip}斩破${meleeTag}威${proj.power} → 引刀`, 'rg');
          return;
        } else {
          proj.power -= ip;
          const meleeTag = proj.flags.includes('MELEE') ? '斩击' : '弹体';
          this.#logger?.log(`${entity.name || entity.id} ⚔ 拦截削弱！${meleeTag}降至威${proj.power}`, 'rg');
        }
        intercepted = true;
        break;
      }
    }
    if (intercepted || !proj.alive) return;

    // Check body contact at this hex
    const entities = registry.getAt(q, r);
    let hit = false;
    let targetId = null;
    let resultKilled = false;
    let resultDamage = 0;
    let targetName = null;
    const isAoe = proj.flags.includes('AOE_RADIUS_1');
    const source = registry.get(proj.ownerId);
    const friendlyFire = Boolean(options.rules?.friendlyFire);
    const defaultPolicy = friendlyFire ? 'allExceptSelf' : 'enemyOnly';
    const canHit = (target) => canAffectCharacter({
      source,
      target,
      policy: options.policy || defaultPolicy,
      friendlyFire,
    });

    if (isAoe) {
      const hasBody = entities.some(e => e.type === 'CHARACTER' && e.alive !== false && canHit(e));
      if (hasBody) {
        for (const entity of registry.characters()) {
          if (entity.alive === false || !canHit(entity)) continue;
          if (hexDistance(entity.position.q, entity.position.r, q, r) <= 1) {
            const result = damageCalculator.resolve(
              proj.ownerId, entity.id, proj.power, 'PHYSICAL',
              { projectile: true, flags: proj.flags }
            );
            if (result.killed || result.finalDamage > 0) {
              hit = true;
              resultKilled = resultKilled || result.killed;
              resultDamage += result.finalDamage || 0;
            }
          }
        }
        proj.alive = false;
        const aoeOwnerName = registry.get(proj.ownerId)?.name || proj.ownerId;
        this.#logger?.log(`${aoeOwnerName} 💥 弹体爆裂AOE！威${proj.power}`, 'sh');
      }
    } else {
      for (const e of entities) {
        if (e.type !== 'CHARACTER' || e.alive === false || !canHit(e)) continue;

        const acqCtx = buffManager.dispatch(HookName.ON_TARGET_ACQUIRE, {
          sourceId: proj.ownerId, targetId: e.id, forceHit: false,
        });
        const isArmorPierce = proj.flags.includes('ARMOR_PIERCE');
        const result = damageCalculator.resolve(
          proj.ownerId, e.id, proj.power, 'PHYSICAL',
          { projectile: true, flags: proj.flags, armorPierce: isArmorPierce }
        );

        hit = true;
        targetId = e.id;
        targetName = e.name || e.id;
        resultKilled = result.killed || false;
        resultDamage = result.finalDamage || 0;
        proj.alive = false;
        const atkName = registry.get(proj.ownerId)?.name || proj.ownerId;
        const tgtName = e.name || e.id;
        const isMeleeHit = proj.flags.includes('MELEE');
        if (result.killed) {
          this.#logger?.log(`${atkName} ${isMeleeHit ? '⚔' : '🔮'}→${tgtName} 击杀！威${proj.power}`, 'die');
        } else if (result.finalDamage > 0) {
          this.#logger?.log(`${atkName} ${isMeleeHit ? '⚔' : '🔮'}→${tgtName} 命中 ${result.finalDamage}伤害 威${proj.power}`, 'sh');
        } else {
          const absLayers = (result.breakdown || []).filter(b => b.absorbed > 0).map(b => b.layer).join('+');
          this.#logger?.log(`${atkName} ${isMeleeHit ? '⚔' : '🔮'}→${tgtName} 被${absLayers || '防御'}吸收 威${proj.power}`, 'sh');
        }
        break;
      }
    }

    this.#lastHits.push({
      ownerId: proj.ownerId, projectileId: proj.id, actionId: proj.actionId || null,
      targetId: targetId || null,
      targetName: targetName || null,
      hit,
      killed: resultKilled,
      damage: resultDamage,
      q, r,
      isAoe,
      isMelee: proj.flags.includes('MELEE') || false,
      flags: [...proj.flags],
    });
  }

  // Melee intercept: check if a projectile at (q,r) can be destroyed by melee
  interceptAt(q, r, meleePower) {
    for (const proj of this.#projectiles) {
      if (!proj.alive) continue;
      const [pq, pr] = proj.path[proj.stepIndex];
      if (pq === q && pr === r) {
        if (meleePower >= proj.power) {
          proj.alive = false;
          return true;
        } else {
          proj.power -= meleePower;
          return false;
        }
      }
    }
    return false;
  }

  getLastInterceptions() { return this.#lastInterceptions; }
  getLastHits() { return this.#lastHits; }

  // Casing management
  _dropCasing(q, r) {
    const key = `${q},${r}`;
    this.#casings.set(key, (this.#casings.get(key) || 0) + 1);
  }

  _dropSupplyCrate(q, r) {
    const key = `${q},${r}`;
    this.#supplyCrates.set(key, (this.#supplyCrates.get(key) || 0) + 1);
  }

  collectCasings(q, r, area = 'ADJACENT') {
    let collected = 0;
    const toCheck = new Set();
    toCheck.add(`${q},${r}`);
    for (const [nq, nr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      toCheck.add(`${q + nq},${r + nr}`);
    }
    for (const key of toCheck) {
      const count = this.#casings.get(key) || 0;
      if (count > 0) {
        collected += count;
        this.#casings.delete(key);
      }
      const crateCount = this.#supplyCrates.get(key) || 0;
      if (crateCount > 0) {
        collected += crateCount * 3;
        this.#supplyCrates.delete(key);
      }
    }
    return collected;
  }

  collectCasingsAlongPath(pathHexes) {
    const toCheck = new Set();
    for (const [pq, pr] of pathHexes) {
      toCheck.add(`${pq},${pr}`);
      for (const [nq, nr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        toCheck.add(`${pq + nq},${pr + nr}`);
      }
    }
    let collected = 0;
    for (const key of toCheck) {
      const count = this.#casings.get(key) || 0;
      if (count > 0) {
        collected += count;
        this.#casings.delete(key);
      }
      const crateCount = this.#supplyCrates.get(key) || 0;
      if (crateCount > 0) {
        collected += crateCount * 3;
        this.#supplyCrates.delete(key);
      }
    }
    return collected;
  }

  getCasingsAt(q, r) {
    return (this.#casings.get(`${q},${r}`) || 0) + (this.#supplyCrates.get(`${q},${r}`) || 0) * 3;
  }

  // Wild bullet management
  spawnWildBullets(count, registry, seed = 0, friendlyHalf = null) {
    const occupied = new Set();
    for (const c of registry.characters()) {
      if (c.alive !== false) occupied.add(`${c.position.q},${c.position.r}`);
    }
    for (const key of this.#wildBullets.keys()) occupied.add(key);

    const friendlyHexes = [];
    const enemyHexes = [];
    for (const [hq, hr] of hexSpiral(0, 0, 3)) {
      if (!isOnBoard(hq, hr)) continue;
      if (occupied.has(`${hq},${hr}`)) continue;
      if (friendlyHalf === 'upper' && hr <= 0) friendlyHexes.push([hq, hr]);
      else if (friendlyHalf === 'lower' && hr > 0) friendlyHexes.push([hq, hr]);
      else enemyHexes.push([hq, hr]);
    }

    const rng = seededRandom(seed);
    let spawned = 0;

    // Spawn half in friendly zone first
    const friendlyCount = Math.floor(count / 2);
    for (let i = 0; i < friendlyCount && friendlyHexes.length > 0; i++) {
      const idx = Math.floor(rng() * friendlyHexes.length);
      const [wq, wr] = friendlyHexes[idx];
      friendlyHexes.splice(idx, 1);
      this.#wildBullets.set(`${wq},${wr}`, (this.#wildBullets.get(`${wq},${wr}`) || 0) + 1);
      spawned++;
    }

    // Remaining from all available (friendly + enemy)
    const remaining = [...friendlyHexes, ...enemyHexes];
    for (let i = spawned; i < count && remaining.length > 0; i++) {
      const idx = Math.floor(rng() * remaining.length);
      const [wq, wr] = remaining[idx];
      remaining.splice(idx, 1);
      this.#wildBullets.set(`${wq},${wr}`, (this.#wildBullets.get(`${wq},${wr}`) || 0) + 1);
      spawned++;
    }
    return spawned;
  }

  collectWildBullets(q, r, area = 'ADJACENT') {
    let collected = 0;
    const toCheck = new Set();
    toCheck.add(`${q},${r}`);
    for (const [nq, nr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
      toCheck.add(`${q + nq},${r + nr}`);
    }
    for (const key of toCheck) {
      const count = this.#wildBullets.get(key) || 0;
      if (count > 0) {
        collected += count;
        this.#wildBullets.delete(key);
      }
    }
    this.#wildBulletsCollected += collected;
    return collected;
  }

  collectWildBulletsAlongPath(pathHexes) {
    const toCheck = new Set();
    for (const [pq, pr] of pathHexes) {
      toCheck.add(`${pq},${pr}`);
      for (const [nq, nr] of [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]) {
        toCheck.add(`${pq + nq},${pr + nr}`);
      }
    }
    let collected = 0;
    for (const key of toCheck) {
      const count = this.#wildBullets.get(key) || 0;
      if (count > 0) {
        collected += count;
        this.#wildBullets.delete(key);
      }
    }
    this.#wildBulletsCollected += collected;
    return collected;
  }

  getWildBullets() {
    const result = [];
    for (const [key, count] of this.#wildBullets) {
      const [q, r] = key.split(',').map(Number);
      result.push({ q, r, count });
    }
    return result;
  }

  getWildBulletsCollected() { return this.#wildBulletsCollected; }
  clearWildBulletsCollected() { this.#wildBulletsCollected = 0; }

  reset() {
    this.#projectiles.length = 0;
    this.#casings.clear();
    this.#supplyCrates.clear();
    this.#wildBullets.clear();
    this.#wildBulletsCollected = 0;
    this.#lastInterceptions.length = 0;
    this.#lastHits.length = 0;
  }

  serialize() {
    return {
      projectiles: structuredClone(this.#projectiles),
      casings: [...this.#casings.entries()],
      supplyCrates: [...this.#supplyCrates.entries()],
      wildBullets: [...this.#wildBullets.entries()],
      wildBulletsCollected: this.#wildBulletsCollected,
      lastInterceptions: structuredClone(this.#lastInterceptions),
      lastHits: structuredClone(this.#lastHits),
    };
  }

  deserialize(data = {}) {
    this.reset();
    this.#projectiles.push(...structuredClone(data.projectiles || []));
    this.#casings = new Map(data.casings || []);
    this.#supplyCrates = new Map(data.supplyCrates || []);
    this.#wildBullets = new Map(data.wildBullets || []);
    this.#wildBulletsCollected = data.wildBulletsCollected || 0;
    this.#lastInterceptions.push(...structuredClone(data.lastInterceptions || []));
    this.#lastHits.push(...structuredClone(data.lastHits || []));

    let maxProjectileId = 0;
    for (const projectile of this.#projectiles) {
      const numericId = Number(String(projectile.id).replace('proj_', ''));
      if (Number.isFinite(numericId)) maxProjectileId = Math.max(maxProjectileId, numericId);
    }
    _projId = Math.max(_projId, maxProjectileId);
  }
}
