// Turn resolution pipeline: PLAN → RESOLVE → EFFECTS → CLEANUP
import { CmdType, EvtType } from './CommandTypes.js';
import { hexDistance, hexLine, hexNeighbors, hexSpiral, isOnBoard } from './HexMath.js';
import { HookName } from './BuffHooks.js';
import { STATUS_DEFS } from './StatusEffectDefs.js';
import { SKILLS } from './SkillData.js';
import { getDefaultRoleLoadout } from './RoleData.js';

export const TurnPhase = Object.freeze({
  PLAN: 'PLAN',
  RESOLVE: 'RESOLVE',
  EFFECTS: 'EFFECTS',
  CLEANUP: 'CLEANUP',
  BATTLE_END: 'BATTLE_END',
});

export class TurnManager {
  #registry;
  #eventBus;
  #commandQueue;
  #buffManager;
  #damageCalculator;
  #resourceSystem;
  #actionPointSystem;
  #skillCooldowns;
  #logger;
  #skillResolver = null;
  #movementSystem = null;
  #projectileCalculator = null;
  #galaxyProvider = null;
  #dimensionSystem = null;
  #formationSystem = null;
  #turnNumber = 1;
  #phase = TurnPhase.PLAN;
  #delayedCommands = [];
  #pendingFlags = new Map(); // entityId → { pendingQi, ... }
  #jumpReturns = new Map();  // entityId → { q, r } for end-of-turn jump return
  #lastHitByActor = new Map(); // actorId → boolean (did their last attack hit?)
  #shieldHitEntities = new Set(); // entityIds whose shield was hit this turn
  #submittedChars = new Set();   // charIds that submitted this turn
  #resourceFailed = new Set();  // sequenceIds whose resource cost check failed at exec time
  #canceledSequences = new Set(); // sequenceIds canceled by interruption/reaction effects
  #projectileAttackers = new Set(); // actorIds that fired projectiles this speed tier
  #currentAnimStep = 0;
  #speedGroups = null;

  constructor(deps) {
    this.#registry = deps.registry;
    this.#eventBus = deps.eventBus;
    this.#commandQueue = deps.commandQueue;
    this.#buffManager = deps.buffManager;
    this.#damageCalculator = deps.damageCalculator;
    this.#resourceSystem = deps.resourceSystem;
    this.#actionPointSystem = deps.actionPointSystem || null;
    this.#skillCooldowns = deps.skillCooldowns || null;
    this.#logger = deps.logger;
    this.#skillResolver = deps.skillResolver || null;
    this.#movementSystem = deps.movementSystem || null;
    this.#projectileCalculator = deps.projectileCalculator || null;
    this.#dimensionSystem = deps.dimensionSystem || null;
    this.#formationSystem = deps.formationSystem || null;

    // Track shield hits for pendingQi resolution
    this.#eventBus.on(EvtType.SHIELD_ABSORBED, (data) => {
      if (data.targetId) this.#shieldHitEntities.add(data.targetId);
    });
  }

  get turnNumber() { return this.#turnNumber; }
  get phase() { return this.#phase; }

  setGalaxyProvider(fn) { this.#galaxyProvider = fn; }

  // Called by UI when both players have submitted
  async executeTurn() {
    this.#shieldHitEntities.clear();
    this.#submittedChars.clear();
    this.#resourceFailed.clear();
    this.#canceledSequences.clear();
    this.#projectileAttackers.clear();
    this.#logger?.setTurn(this.#turnNumber);
    this.#logger?.log(`=== 第 ${this.#turnNumber} 回合 ===`, 'turn');
    this.#phase = TurnPhase.RESOLVE;

    // Set current turn for buff timing (buffs applied this turn won't be ticked)
    this.#buffManager.setCurrentTurn(this.#turnNumber);

    // Dispatch ON_TURN_START hook (for 大荒星陨 resolution)
    const turnStartCtx = this.#buffManager.dispatch(HookName.ON_TURN_START, { turn: this.#turnNumber });
    this._resolveTurnStartEffects(turnStartCtx);

    this.#eventBus.emit(EvtType.TURN_START, { turn: this.#turnNumber });

    // --- PLAN: Validate ---
    const { valid } = this.#commandQueue.validateAll(this.#registry, this.#resourceSystem);

    // Group by speed, then sort deterministically within each tier by actorId
    // to guarantee P2P lockstep regardless of submission order. Commands from
    // the same actor stay in their original sequence order (important for
    // intra-sequence dependencies like ATTACK_MELEE before GAIN_RESOURCE ON_HIT).
    const groups = { 3: [], 2: [], 1: [], 0: [] };
    const loggedSeqs = new Set();
    for (const { speed, command } of valid) {
      groups[speed].push(command);
      if (command.skillId && command.sequenceId && !loggedSeqs.has(command.sequenceId)) {
        loggedSeqs.add(command.sequenceId);
        const char = this.#registry.get(command.actorId);
        const skillName = SKILLS[command.skillId]?.name || command.skillId;
        this.#logger?.log(`${char?.name || command.actorId} → ${skillName}`, 'action');
      }
    }
    for (const spd of [3, 2, 1, 0]) {
      groups[spd].sort((a, b) => (a.actorId || '').localeCompare(b.actorId || ''));
    }
    this.#speedGroups = groups;

    // Process delayed commands from previous turns before speed-tier loop
    // (so created projectiles are resolved during this turn's projectile steps)
    this._processDelayedCommands();

    // --- RESOLVE: Execute by speed tier 3→2→1→0 ---
    for (const spd of [3, 2, 1, 0]) {
      if (this.#phase === TurnPhase.BATTLE_END) break;
      this.#currentAnimStep = 3 - spd;
      this.#eventBus.emit(EvtType.SPEED_TIER_START, { speed: spd });

      const cmds = groups[spd];
      // 悬剑落剑 at speed 2 (runs before commands)
      if (spd === 2) { this._resolveSwordHangingDrop(); }

      // Separate ON_HIT GAIN_RESOURCE — defer until after projectiles resolve
      // so #lastHitByActor reflects projectile/melee body-contact results.
      const deferredGains = [];
      for (const cmd of cmds) {
        if (this.#phase === TurnPhase.BATTLE_END) break;
        if (cmd.type === CmdType.GAIN_RESOURCE && cmd.payload.condition === 'ON_HIT') {
          deferredGains.push(cmd);
          continue;
        }
        this._executeCommand(cmd);
      }

      // Resolve projectiles at this speed tier (advance full path, check body contact)
      if (this.#projectileCalculator) {
        const results = this.#projectileCalculator.resolveStep(
          spd, this.#registry, this.#damageCalculator, this.#buffManager
        );

        for (const r of results.hits) {
          if (r.hit) this.#lastHitByActor.set(r.ownerId, true);
        }
        for (const r of results.interceptions) {
          if (r.intercepted && r.interceptorId) {
            this.#lastHitByActor.set(r.interceptorId, true);
          }
        }

        // Dispatch ON_ATTACK_MISSED for projectile attackers that didn't hit
        for (const attackerId of this.#projectileAttackers) {
          if (!this.#lastHitByActor.get(attackerId)) {
            const missCtx = this.#buffManager.dispatch(HookName.ON_ATTACK_MISSED, { attackerId });
            this._processDeathWindReloads(missCtx);
          }
        }
      }
      this.#projectileAttackers.clear();

      // Now execute deferred ON_HIT GAIN_RESOURCE commands
      for (const cmd of deferredGains) {
        if (this.#phase === TurnPhase.BATTLE_END) break;
        this._executeCommand(cmd);
      }

      // 御剑 auto-move at speed 2 — runs AFTER commands so freshly-applied SWORD_FLIGHT is visible
      if (spd === 2) { this._resolveSwordFlightAutoMove(); }

      // Check win
      if (this._checkWinCondition()) break;

      // Galaxy sub-phase at speed 2 (after normal speed-2 processing)
      if (spd === 2 && this.#galaxyProvider) {
        await this._resolveGalaxySubPhase(groups);
      }

      this.#eventBus.emit(EvtType.SPEED_TIER_END, { speed: spd });
    }

    // If battle ended during the speed-tier loop, preserve BATTLE_END phase
    if (this.#phase === TurnPhase.BATTLE_END) {
      this._cleanup();
      this.#eventBus.emit(EvtType.TURN_END, { turn: this.#turnNumber });
      return;
    }

    // --- EFFECTS ---
    this.#phase = TurnPhase.EFFECTS;
    this._processDelayedCommands();
    this._resolveEndOfTurnEffects();

    // --- CLEANUP ---
    this.#phase = TurnPhase.CLEANUP;
    this._cleanup();

    this.#turnNumber++;
    this.#phase = TurnPhase.PLAN;
    this.#actionPointSystem?.resetTurn();
    // Tick skill cooldowns for all characters
    if (this.#skillCooldowns) {
      for (const e of this.#registry.characters()) {
        if (e.alive !== false) this.#skillCooldowns.tick(e.id);
      }
    }

    // Apply per-role passives for the new turn (before players plan actions)
    this._applyTurnStartRolePassives();

    this.#eventBus.emit(EvtType.TURN_END, { turn: this.#turnNumber - 1 });
  }

  // --- Command execution ---
  _executeCommand(cmd) {
    const actor = this.#registry.get(cmd.actorId);
    if (!actor || actor.alive === false) return;

    // Skip action commands if resource cost check failed for this command's sequence
    if (this.#resourceFailed.has(cmd.sequenceId) &&
        cmd.type !== CmdType.GAIN_RESOURCE &&
        cmd.type !== CmdType.CONSUME_RESOURCE) {
      return;
    }
    if (this.#canceledSequences.has(cmd.sequenceId)) return;

    if (this._shouldCancelAttackByYan(cmd)) {
      this.#canceledSequences.add(cmd.sequenceId);
      this.#buffManager.removeByType(cmd.actorId, 'YAN_EMPTY_GUN');
      this.#lastHitByActor.set(cmd.actorId, false);
      this.#logger?.log('我赌你的枪里没有子弹：攻击取消，费用不返还', 'warn');
      return;
    }

    // Before-action hook
    const beforeCtx = this.#buffManager.dispatch(HookName.ON_BEFORE_ACTION, {
      entityId: cmd.actorId, command: cmd,
    });
    if (beforeCtx === false) return;

    switch (cmd.type) {
        case CmdType.GAIN_RESOURCE:
          this._execGainResource(cmd);
          break;
        case CmdType.CONSUME_RESOURCE:
          this._execConsumeResource(cmd);
          break;
        case CmdType.MOVE_WALK:
          this._execMoveWalk(cmd);
          break;
        case CmdType.MOVE_TELEPORT:
          this._execMoveTeleport(cmd);
          break;
        case CmdType.MOVE_DASH:
          this._execMoveDash(cmd);
          break;
        case CmdType.ATTACK_MELEE:
          this._execAttackMelee(cmd);
          break;
        case CmdType.ATTACK_PROJECTILE:
          this._execAttackProjectile(cmd);
          this.#projectileAttackers.add(cmd.actorId);
          break;
        case CmdType.ATTACK_AOE_SELF:
          this._execAttackAoeSelf(cmd);
          break;
        case CmdType.ATTACK_AOE_PATH:
          this._execAttackAoePath(cmd);
          break;
        case CmdType.APPLY_STATUS:
          this._execApplyStatus(cmd);
          break;
        case CmdType.REMOVE_STATUS:
          this._execRemoveStatus(cmd);
          break;
        case CmdType.DEFEND:
          this._execDefend(cmd);
          break;
        case CmdType.DELAYED_SKILL:
          this._execDelayedSkill(cmd);
          break;
        case CmdType.PASS:
          this._execPass(cmd);
          break;
        case CmdType.CREATE_GATE:
          this._execCreateGate(cmd);
          break;
        case CmdType.CREATE_FORMATION:
          this._execCreateFormation(cmd);
          break;
        case CmdType.BREAK_FORMATION:
          this._execBreakFormation(cmd);
          break;
        case CmdType.MARROW_UPGRADE:
          this._execMarrowUpgrade(cmd);
          break;
        case CmdType.DROP_SUPPLY_CRATE:
          this._execDropSupplyCrate(cmd);
          break;
        case CmdType.MULTI_CAST:
          this._execMultiCast(cmd);
          break;
        case CmdType.GALAXY_SUBTURN:
          this._execGalaxySubturn(cmd);
          break;
        case CmdType.ATTACK_AOE_TARGET:
          this._execAttackAoeTarget(cmd);
          this.#projectileAttackers.add(cmd.actorId);
          break;
        case CmdType.MOVE_PULL:
          this._execMovePull(cmd);
          break;
        case CmdType.MOVE_GRAPNEL:
          this._execMoveGrapnel(cmd);
          break;
        case CmdType.SPAWN_STATIONARY_AOE:
          this._execSpawnStationaryAoe(cmd);
          this.#projectileAttackers.add(cmd.actorId);
          break;
        default:
          break;
      }

    // Start cooldown if skill has one
    const execSkill = SKILLS[cmd.skillId];
    if (execSkill?.cooldown && this.#skillCooldowns) {
      const actor = this.#registry.get(cmd.actorId);
      if (actor) {
        const haste = this._getSkillHaste(actor, cmd.skillId);
        this.#skillCooldowns.startCooldown(cmd.actorId, cmd.skillId, execSkill.cooldown, haste);
      }
    }

    // After-action hook
    this.#buffManager.dispatch(HookName.ON_AFTER_ACTION, {
      entityId: cmd.actorId, command: cmd,
    });

    // Dispatch ON_ATTACK_MISSED for immediate attacks that missed
    if (this._isImmediateAttack(cmd) && !this.#lastHitByActor.get(cmd.actorId)) {
      const missCtx = this.#buffManager.dispatch(HookName.ON_ATTACK_MISSED, { attackerId: cmd.actorId });
      this._processDeathWindReloads(missCtx);
    }
  }

  _isAttackCommand(cmd) {
    return [
      CmdType.ATTACK_MELEE,
      CmdType.ATTACK_PROJECTILE,
      CmdType.ATTACK_AOE_SELF,
      CmdType.ATTACK_AOE_PATH,
      CmdType.ATTACK_AOE_TARGET,
      CmdType.SPAWN_STATIONARY_AOE,
    ].includes(cmd.type);
  }

  _isImmediateAttack(cmd) {
    return [
      CmdType.ATTACK_MELEE,
      CmdType.ATTACK_AOE_SELF,
      CmdType.ATTACK_AOE_PATH,
    ].includes(cmd.type);
  }

  _processDeathWindReloads(ctx) {
    if (ctx._deathWindReloads) {
      for (const entityId of ctx._deathWindReloads) {
        this.#resourceSystem.addBackpackAmmo(entityId, 1);
        const loaded = this.#resourceSystem.reloadFromBackpack(entityId);
        if (loaded > 0) {
          this.#logger?.log(`死亡如风：获得1弹 + 自动装填 +${loaded}弹`, 's');
        } else {
          this.#logger?.log(`死亡如风：获得1弹（背包空，未装填）`, 's');
        }
      }
    }
  }

  _shouldCancelAttackByYan(cmd) {
    return this._isAttackCommand(cmd) && this.#buffManager.hasStatus(cmd.actorId, 'YAN_EMPTY_GUN');
  }

  // --- Individual command executors ---
  _execGainResource(cmd) {
    let { resource, amount, condition } = cmd.payload;
    if (condition === 'ON_HIT') {
      if (!this.#lastHitByActor.get(cmd.actorId)) return; // no hit, no gain
    }
    if (amount === 'RELOAD') {
      const loaded = this.#resourceSystem.reloadFromBackpack(cmd.actorId);
      this.#logger?.log(`装填 +${loaded}弹`, 's');
      return;
    }
    const ctx = this.#buffManager.dispatch(HookName.ON_RESOURCE_GAIN, {
      entityId: cmd.actorId, resource, amount,
    });
    const finalAmount = ctx?.amount ?? amount;
    if (resource === 'backpackAmmo') {
      this.#resourceSystem.addBackpackAmmo(cmd.actorId, finalAmount);
      this.#logger?.log(`背包弹药 +${finalAmount}`, 's');
      return;
    }
    this.#resourceSystem.add(cmd.actorId, resource, finalAmount);
    // Record gather animation event
    if (finalAmount > 0 && resource !== 'ammo') {
      const actor = this.#registry.get(cmd.actorId);
      if (actor) {
        const color = resource === 'qi' ? '#8b5cf6' : resource === 'rage' ? '#e05555' : '#d4943a';
        this.#projectileCalculator?.addAnimEvent({
          event: 'gather', step: this.#currentAnimStep, duration: 2,
          q: actor.position.q, r: actor.position.r, color, amount: finalAmount,
        });
      }
    }
  }

  _execConsumeResource(cmd) {
    let amount = cmd.payload.amount;
    if (amount === 'ALL') {
      if (cmd.payload.resource === 'ammo') {
        // consumeAllAmmo handles both the check and the consumption
        const current = this.#resourceSystem.getAmmo(cmd.actorId);
        if (current <= 0) return;
        amount = this.#resourceSystem.consumeAllAmmo(cmd.actorId);
        if (!this.#pendingFlags.has(cmd.actorId)) this.#pendingFlags.set(cmd.actorId, {});
        this.#pendingFlags.get(cmd.actorId).consumedAmmo = amount;
        return; // consumeAllAmmo already deducted — skip subtract below
      } else {
        amount = this.#resourceSystem.get(cmd.actorId, cmd.payload.resource);
      }
      if (amount <= 0) return;
    }
    // Re-check affordability at execution time (resources may have changed from damage)
    const cost = { [cmd.payload.resource]: amount };
    if (!this.#resourceSystem.canAfford(cmd.actorId, cost)) {
      const actor = this.#registry.get(cmd.actorId);
      this.#logger?.log(`${actor?.name || cmd.actorId} 资源不足，技能发动失败`, 'warn');
      this.#resourceFailed.add(cmd.sequenceId);
      return;
    }
    this.#resourceSystem.subtract(cmd.actorId, cmd.payload.resource, amount);
  }

  _execMoveWalk(cmd) {
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    const fromQ = actor.position.q, fromR = actor.position.r;
    const toQ = cmd.targetPos.q, toR = cmd.targetPos.r;
    const effectiveRange = this.#buffManager.getEffectiveMoveRange(cmd.actorId, cmd.payload.range || 1);
    const dist = hexDistance(fromQ, fromR, toQ, toR);
    if (dist > effectiveRange || !isOnBoard(toQ, toR)) return;
    if (toQ === fromQ && toR === fromR) return;

    // Buff: check blocked (定身, 锁定)
    if (this.#buffManager.isBlocked(cmd.actorId, HookName.ON_BEFORE_MOVE)) return;

    this.#registry.updatePosition(cmd.actorId, fromQ, fromR, toQ, toR);
    this.#eventBus.emit(EvtType.MOVEMENT_COMPLETE, { entityId: cmd.actorId, from: { q: fromQ, r: fromR }, to: { q: toQ, r: toR } });
    this.#projectileCalculator?.addAnimEvent({
      event: 'walk', step: this.#currentAnimStep,
      fromQ, fromR, toQ, toR, charId: cmd.actorId,
    });
  }

  _execMoveTeleport(cmd) {
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;
    if (this.#buffManager.isBlocked(cmd.actorId, HookName.ON_BEFORE_MOVE)) return;
    const fromQ = actor.position.q, fromR = actor.position.r;
    if (!isOnBoard(cmd.targetPos.q, cmd.targetPos.r)) return;

    this.#registry.updatePosition(cmd.actorId, fromQ, fromR, cmd.targetPos.q, cmd.targetPos.r);
    this.#projectileCalculator?.addAnimEvent({
      event: 'teleport', step: this.#currentAnimStep,
      fromQ, fromR, toQ: cmd.targetPos.q, toR: cmd.targetPos.r, charId: cmd.actorId,
    });
  }

  _execMoveDash(cmd) {
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    const fromQ = actor.position.q, fromR = actor.position.r;
    const targetQ = cmd.targetPos.q, targetR = cmd.targetPos.r;
    const away = cmd.payload.direction === 'AWAY_FROM_TARGET';
    const steps = cmd.payload.distance || 1;

    // Use hexLine to determine direction, then move `steps` in that direction.
    // This avoids the distance-maximization tie-breaking that always defaults to RIGHT.
    let dirQ, dirR;
    if (away) {
      const line = hexLine(targetQ, targetR, fromQ, fromR);
      if (line.length < 2) return;
      dirQ = line[1][0] - line[0][0];
      dirR = line[1][1] - line[0][1];
    } else {
      const line = hexLine(fromQ, fromR, targetQ, targetR);
      if (line.length < 2) return;
      dirQ = line[1][0] - line[0][0];
      dirR = line[1][1] - line[0][1];
    }

    let curQ = fromQ, curR = fromR;
    for (let s = 0; s < steps; s++) {
      const nq = curQ + dirQ, nr = curR + dirR;
      if (!isOnBoard(nq, nr)) break;
      curQ = nq; curR = nr;
    }

    if (curQ === fromQ && curR === fromR) return;

    this.#registry.updatePosition(cmd.actorId, fromQ, fromR, curQ, curR);
    this.#eventBus.emit(EvtType.MOVEMENT_COMPLETE, { entityId: cmd.actorId, from: { q: fromQ, r: fromR }, to: { q: curQ, r: curR } });
    this.#projectileCalculator?.addAnimEvent({
      event: 'dash', step: this.#currentAnimStep,
      fromQ, fromR, toQ: curQ, toR: curR, charId: cmd.actorId,
    });
  }

  _execAttackMelee(cmd) {
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    const originQ = actor.position.q, originR = actor.position.r;
    let targetQ = cmd.targetPos.q, targetR = cmd.targetPos.r;

    // SURE_HIT: redirect melee to target's current position (handles displacement)
    let forceHit = false;
    for (const e of this.#registry.characters()) {
      if (e.alive === false || e.id === cmd.actorId) continue;
      const acqCtx = this.#buffManager.dispatch(HookName.ON_TARGET_ACQUIRE, {
        sourceId: cmd.actorId, targetId: e.id, forceHit: false,
      });
      if (acqCtx?.forceHit) {
        targetQ = e.position.q; targetR = e.position.r;
        forceHit = true;
        break;
      }
    }

    const dist = hexDistance(originQ, originR, targetQ, targetR);
    if (dist > this.#buffManager.getEffectiveRange(cmd.actorId, cmd.payload.range || 1)) {
      this.#logger?.log('⚔ 距离过远，挥空', 's');
      return;
    }

    // Resolve power (with hook for Jimmy marrow etc.)
    let power = typeof cmd.payload.power === 'number'
      ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
      : cmd.payload.power;

    // Consume SHEATHED for enhanced melee (居合斩)
    if (cmd.payload.consumeSheathed && this.#buffManager.hasStatus(cmd.actorId, 'SHEATHED')) {
      // Remove SHEATHED buff and enhance the attack
      this.#buffManager.removeByStatus(cmd.actorId, 'SHEATHED');
      cmd.payload.range = 2; // enhanced range
      // Refund the rage cost (cost becomes 0)
      this.#resourceSystem?.add(cmd.actorId, 'rage', 3);
      this.#logger?.log('纳刀解放！居合斩强化', 'rg');
    }

    // Same-hex melee: resolve directly (projectile path would be empty)
    if (targetQ === originQ && targetR === originR) {
      const entities = this.#registry.getAt(targetQ, targetR);
      let hit = false;
      for (const e of entities) {
        if (e.type === 'CHARACTER' && e.id !== cmd.actorId && e.alive !== false) {
          const result = this.#damageCalculator.resolve(cmd.actorId, e.id, power, 'PHYSICAL', {});
          if (result.killed || result.finalDamage > 0) hit = true;
          this.#logger?.log('⚔ 斩击命中！威' + power, 'rg');
        }
      }
      this.#lastHitByActor.set(cmd.actorId, hit);
      if (!hit) this.#logger?.log('⚔ 挥空', 's');
      return;
    }

    // Create melee projectile — travels along path, can collide with enemy projectiles,
    // resolves body contact when reaching target hex.
    if (this.#projectileCalculator) {
      const effectiveSpeed = cmd.subSpeed ?? 1;
      const flags = forceHit ? ['MELEE', 'SURE_HIT'] : ['MELEE'];
      this.#projectileCalculator.createProjectile(
        cmd.actorId, originQ, originR, targetQ, targetR, power, effectiveSpeed, flags
      );
    }

    this.#lastHitByActor.set(cmd.actorId, false); // determined on body contact
    this.#logger?.log('⚔ 斩击！威' + power, 'rg');
  }

  _execAttackProjectile(cmd) {
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    const fromQ = actor.position.q, fromR = actor.position.r;
    let toQ = cmd.targetPos.q, toR = cmd.targetPos.r;
    let power = typeof cmd.payload.power === 'number'
      ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
      : cmd.payload.power;

    // Resolve SHIELD_CURRENT: consume all shield as projectile power
    if (power === 'SHIELD_CURRENT') {
      power = this.#resourceSystem.getShield(cmd.actorId);
      this.#resourceSystem.setShield(cmd.actorId, 0);
    }

    // SURE_HIT: redirect projectile to target's current position (handles displacement)
    for (const e of this.#registry.characters()) {
      if (e.alive === false || e.id === cmd.actorId) continue;
      const acqCtx = this.#buffManager.dispatch(HookName.ON_TARGET_ACQUIRE, {
        sourceId: cmd.actorId, targetId: e.id, forceHit: false,
      });
      if (acqCtx?.forceHit) {
        toQ = e.position.q; toR = e.position.r;
        break;
      }
    }

    // Projectile speed defaults to effective command speed (subSpeed may be boosted by SPEED_BOOST)
    const effectiveSpeed = cmd.subSpeed ?? cmd.payload.projectileSpeed ?? 1;

    if (this.#projectileCalculator) {
      this.#projectileCalculator.createProjectile(cmd.actorId, fromQ, fromR, toQ, toR, power, effectiveSpeed, cmd.payload.flags || []);
    }

    this.#lastHitByActor.set(cmd.actorId, false); // determined later on body contact
  }

  _execAttackAoeTarget(cmd) {
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    const fromQ = actor.position.q, fromR = actor.position.r;
    let toQ = cmd.targetPos.q, toR = cmd.targetPos.r;
    let power = typeof cmd.payload.power === 'number'
      ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
      : cmd.payload.power;

    // SURE_HIT: redirect to target's current position
    for (const e of this.#registry.characters()) {
      if (e.alive === false || e.id === cmd.actorId) continue;
      const acqCtx = this.#buffManager.dispatch(HookName.ON_TARGET_ACQUIRE, {
        sourceId: cmd.actorId, targetId: e.id, forceHit: false,
      });
      if (acqCtx?.forceHit) {
        toQ = e.position.q; toR = e.position.r;
        break;
      }
    }

    const effectiveSpeed = cmd.subSpeed ?? cmd.payload.projectileSpeed ?? 1;
    const radius = cmd.payload.radius || 1;
    const aoeFlag = radius === 1 ? 'AOE_RADIUS_1' : 'AOE_RADIUS_1';

    if (this.#projectileCalculator) {
      this.#projectileCalculator.createProjectile(cmd.actorId, fromQ, fromR, toQ, toR, power, effectiveSpeed, [aoeFlag]);
    }

    this.#lastHitByActor.set(cmd.actorId, false); // determined later on body contact
    this.#logger?.log('💥 目标AOE！威' + power + ' 半径' + radius, 'rg');
  }

  _execAttackAoeSelf(cmd) {
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    let power = typeof cmd.payload.power === 'number'
      ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
      : cmd.payload.power;
    if (power === 'SHIELD_CURRENT') {
      power = this.#resourceSystem.getShield(cmd.actorId);
      this.#resourceSystem.setShield(cmd.actorId, 0);
    }

    let hit = false;
    const q = actor.position.q, r = actor.position.r;
    for (const e of this.#registry.entities()) {
      if (e.type !== 'CHARACTER' || e.id === cmd.actorId || e.alive === false) continue;
      if (hexDistance(q, r, e.position.q, e.position.r) <= (cmd.payload.radius || 1)) {
        let targetPower = power;
        // Check sheathe/block interception per target (same hook as projectile system)
        const ctx = this.#buffManager.dispatch(HookName.ON_PROJECTILE_ENTER_RANGE, {
          entityId: e.id,
          projectileId: null,
          projectileQ: e.position.q, projectileR: e.position.r,
          projectilePower: power,
          projectileOwnerId: cmd.actorId,
          distance: 0,
          intercepted: false,
          interceptPower: 0,
        });
        if (ctx?.intercepted) {
          const ip = ctx.interceptPower || 300;
          if (ip >= targetPower) {
            this.#logger?.log(`⚔ 纳刀拦截！威${ip}斩破AOE威${targetPower}`, 'rg');
            hit = true; // interception breaks sheathe, counts as "hit"
            continue;
          }
          targetPower -= ip;
          this.#logger?.log(`⚔ 纳刀削弱！AOE降至威${targetPower}`, 'rg');
        }
        const result = this.#damageCalculator.resolve(cmd.actorId, e.id, targetPower);
        if (result.killed || result.finalDamage > 0) hit = true;
      }
    }
    this.#lastHitByActor.set(cmd.actorId, hit);
    if (hit) this._handleOnHitGain(cmd);
  }

  _execSpawnStationaryAoe(cmd) {
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    const q = cmd.targetPos ? cmd.targetPos.q : actor.position.q;
    const r = cmd.targetPos ? cmd.targetPos.r : actor.position.r;
    const radius = cmd.payload.radius || 1;
    let power = typeof cmd.payload.power === 'number'
      ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
      : cmd.payload.power;
    const speed = cmd.speed || cmd.subSpeed || 1;
    const includeCenter = cmd.payload.includeCenter || false;

    if (power === 'SHIELD_CURRENT') {
      power = this.#resourceSystem.getShield(cmd.actorId);
      this.#resourceSystem.setShield(cmd.actorId, 0);
    }

    if (cmd.payload.dropCasing && this.#projectileCalculator) {
      this.#projectileCalculator._dropCasing(q, r);
    }

    let hexes = hexSpiral(q, r, radius);
    if (!includeCenter) {
      hexes = hexes.filter(([hq, hr]) => !(hq === q && hr === r));
    }

    for (const [hq, hr] of hexes) {
      if (this.#projectileCalculator) {
        this.#projectileCalculator.createProjectile(
          cmd.actorId, hq, hr, hq, hr, power, speed, ['STATIONARY']
        );
      }
    }

  }

  _execAttackAoePath(cmd) {
    const actor = this.#registry.get(cmd.actorId);
    if (!actor || !cmd.targetPos) return;

    const fromQ = actor.position.q, fromR = actor.position.r;
    const toQ = cmd.targetPos.q, toR = cmd.targetPos.r;

    // Hit all enemies along the path
    const path = hexLine(fromQ, fromR, toQ, toR);
    let hit = false;
    for (const [pq, pr] of path) {
      const entities = this.#registry.getAt(pq, pr);
      for (const e of entities) {
        if (e.type !== 'CHARACTER' || e.id === cmd.actorId || e.alive === false) continue;
        const effectivePower = typeof cmd.payload.power === 'number'
          ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
          : cmd.payload.power;
        const result = this.#damageCalculator.resolve(cmd.actorId, e.id, effectivePower);
        if (result.killed || result.finalDamage > 0) hit = true;
      }
    }
    this.#lastHitByActor.set(cmd.actorId, hit);
    if (hit) this._handleOnHitGain(cmd);
  }

  _execApplyStatus(cmd) {
    const targetRef = cmd.payload.targetRef || 'SELF';
    let targetId = cmd.actorId;

    if (targetRef === 'TARGET' && cmd.targetPos) {
      const entities = this.#registry.getAt(cmd.targetPos.q, cmd.targetPos.r);
      const targetChar = entities.find(e => e.type === 'CHARACTER' && e.id !== cmd.actorId && e.alive !== false);
      if (targetChar) targetId = targetChar.id;
    } else if (targetRef !== 'SELF') {
      targetId = cmd.targetIds?.[0] || cmd.actorId;
    }

    // Resolve placeholder values in data (TARGET_Q → actual q, TARGET_R → actual r)
    const resolvedData = { ...(cmd.payload.data || {}) };
    for (const [key, val] of Object.entries(resolvedData)) {
      if (val === 'TARGET_Q' && cmd.targetPos) resolvedData[key] = cmd.targetPos.q;
      if (val === 'TARGET_R' && cmd.targetPos) resolvedData[key] = cmd.targetPos.r;
    }

    this.#buffManager.apply(targetId, cmd.payload.status, cmd.payload.duration, cmd.actorId, resolvedData);

    // Shield activation: set resource pool flag so DamageCalculator can use it
    if (cmd.payload.status === 'SHIELD_ACTIVE') {
      this.#resourceSystem.setShieldActive(targetId, true);
    }

    // Block activation: archer 格挡 skill enables block
    if (cmd.payload.status === 'BLOCKING') {
      this.#resourceSystem.activateBlock(targetId);
    }

  }

  _execRemoveStatus(cmd) {
    const targetRef = cmd.payload.targetRef || 'SELF';
    let targetId = cmd.actorId;
    this.#buffManager.removeByType(targetId, cmd.payload.status);
  }

  _execDefend(cmd) {
    const defType = cmd.payload.defenseType || 'BLOCKING';
    const duration = cmd.payload.amount || 1;
    this.#buffManager.apply(cmd.actorId, defType, duration, cmd.actorId);
    this.#lastHitByActor.set(cmd.actorId, false);
  }

  _execDelayedSkill(cmd) {
    const pending = this.#pendingFlags.get(cmd.actorId) || {};
    const consumedAmmo = pending.consumedAmmo || 0;
    this.#delayedCommands.push({
      ...cmd,
      resolveTurn: this.#turnNumber + (cmd.payload.resolveInTurns || 1),
      payload: { ...cmd.payload, consumedAmmo },
    });
    if (pending.consumedAmmo) delete pending.consumedAmmo;
  }

  _execPass(cmd) {
    if (cmd.payload?.placeholderMessage) {
      this.#logger?.log(cmd.payload.placeholderMessage, 'warn');
    }
    if (cmd.payload?.flag) {
      if (!this.#pendingFlags.has(cmd.actorId)) this.#pendingFlags.set(cmd.actorId, {});
      this.#pendingFlags.get(cmd.actorId)[cmd.payload.flag] = cmd.payload.value;
      // Save position for end-of-turn jump return
      if (cmd.payload.flag === 'jumpReturn') {
        const actor = this.#registry.get(cmd.actorId);
        if (actor) {
          this.#jumpReturns.set(cmd.actorId, { q: actor.position.q, r: actor.position.r });
        }
      }
      // Record gather animation when gathering is flagged (e.g., mage shield → qi)
      if (cmd.payload.flag === 'pendingQi') {
        // Store the anim step so the gather effect plays at the correct time
        // (only if qi is actually gained at end-of-turn, after shield-hit check)
        this.#pendingFlags.get(cmd.actorId)._gatherAnimStep = this.#currentAnimStep;
      }
    }
    if (cmd.payload?.collectCasings && this.#projectileCalculator) {
      const actor = this.#registry.get(cmd.actorId);
      if (!actor) return;
      const area = cmd.payload.area || 'ADJACENT';
      const collected = this.#projectileCalculator.collectCasings(actor.position.q, actor.position.r, area);
      const wildCollected = this.#projectileCalculator.collectWildBullets(actor.position.q, actor.position.r, area);
      const total = collected + wildCollected;
      if (total > 0) {
        this.#resourceSystem.addBackpackAmmo(cmd.actorId, total);
        if (collected > 0) this.#logger?.log(`捡起弹壳 +${collected}`, 's');
        if (wildCollected > 0) this.#logger?.log(`捡起野生子弹 +${wildCollected}`, 's');
      }
    }
  }

  _execCreateGate(cmd) {
    if (!this.#dimensionSystem || !cmd.targetPos) return;
    this.#dimensionSystem.createGate(cmd.targetPos.q, cmd.targetPos.r, cmd.payload.orientation || 0);
    this.#logger?.log(`次元之门开启于 (${cmd.targetPos.q},${cmd.targetPos.r})`, 's');
  }

  _execCreateFormation(cmd) {
    if (!this.#formationSystem) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;
    const tq = cmd.targetPos ? cmd.targetPos.q : actor.position.q;
    const tr = cmd.targetPos ? cmd.targetPos.r : actor.position.r;
    this.#formationSystem.createFormation(cmd.actorId, tq, tr, cmd.payload.energy || 300, cmd.payload.talismans || []);
    this.#logger?.log(`八卦阵展开 能量${cmd.payload.energy || 300}`, 's');
  }

  _execBreakFormation(cmd) {
    if (!this.#formationSystem) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;
    const tq = cmd.targetPos ? cmd.targetPos.q : actor.position.q;
    const tr = cmd.targetPos ? cmd.targetPos.r : actor.position.r;
    const broken = this.#formationSystem.breakAtHex(tq, tr);
    this.#logger?.log(broken ? '阵法堪破！法阵破碎' : '堪破失败：此处无阵眼', 's');
  }

  _execMultiCast(cmd) {
    // Multi-cast is handled by ON_BEFORE_ACTION hook (MULTI_CAST_PENDING)
    // This command type simply sets up the pending status
    this.#buffManager.apply(cmd.actorId, 'MULTI_CAST_PENDING', 1, cmd.actorId, { repeatCount: cmd.payload.repeatCount || 2 });
  }

  _execGalaxySubturn(cmd) {
    // Galaxy subturn: grant extra turns that resolve simultaneously
    // Simplified: apply a buff that allows extra command submissions
    this.#buffManager.apply(cmd.actorId, 'GALAXY_PENDING', 1, cmd.actorId, { extraTurns: cmd.payload.repeatCount || 3 });
  }

  _execMovePull(cmd) {
    if (!cmd.targetPos || !this.#movementSystem) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    // Find the target entity at targetPos and pull it toward actor
    const entities = this.#registry.getAt(cmd.targetPos.q, cmd.targetPos.r);
    for (const e of entities) {
      if (e.type === 'CHARACTER' && e.id !== cmd.actorId && e.alive !== false) {
        // Cancel target's pending commands at slower speed tiers (interrupt)
        this.#commandQueue.cancelByActor(e.id, cmd.speed);
        // Also cancel from current turn's speed groups (already built before tier loop)
        if (this.#speedGroups) {
          for (const spd of [0, 1]) {
            if (cmd.speed >= 0 && spd >= cmd.speed) continue;
            this.#speedGroups[spd] = this.#speedGroups[spd].filter(c => c.actorId !== e.id);
          }
        }
        // Apply 禁锢 (immobilize) for 1 turn
        this.#buffManager.apply(e.id, 'IMMOBILIZED', 1, cmd.actorId);
        const result = this.#movementSystem.resolvePull(actor.position.q, actor.position.r, e.position.q, e.position.r);
        this.#registry.updatePosition(e.id, e.position.q, e.position.r, result.q, result.r);
        this.#eventBus.emit(EvtType.MOVEMENT_COMPLETE, { entityId: e.id, from: { q: e.position.q, r: e.position.r }, to: { q: result.q, r: result.r } });
        this.#logger?.log('无情铁手！拉至身前 + 禁锢', 'rg');
        break;
      }
    }
  }

  _execMoveGrapnel(cmd) {
    // Grapnel: shooter hooks to target hex, drops casing at origin, collects casings + wild bullets along path
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;
    if (this.#buffManager.isBlocked(cmd.actorId, HookName.ON_BEFORE_MOVE)) return;
    const fromQ = actor.position.q, fromR = actor.position.r;
    if (!isOnBoard(cmd.targetPos.q, cmd.targetPos.r)) return;
    this.#projectileCalculator?._dropCasing(fromQ, fromR);
    const path = hexLine(fromQ, fromR, cmd.targetPos.q, cmd.targetPos.r);
    const collected = this.#projectileCalculator?.collectCasingsAlongPath(path) || 0;
    const wildCollected = this.#projectileCalculator?.collectWildBulletsAlongPath(path) || 0;
    const total = collected + wildCollected;
    if (total > 0) {
      this.#resourceSystem.addBackpackAmmo(cmd.actorId, total);
      if (collected > 0) this.#logger?.log(`钩锁途中捡起弹壳 +${collected}`, 's');
      if (wildCollected > 0) this.#logger?.log(`钩锁途中捡起野生子弹 +${wildCollected}`, 's');
    }
    this.#registry.updatePosition(cmd.actorId, fromQ, fromR, cmd.targetPos.q, cmd.targetPos.r);
    this.#projectileCalculator?.addAnimEvent({
      event: 'grapple', step: this.#currentAnimStep,
      fromQ, fromR, toQ: cmd.targetPos.q, toR: cmd.targetPos.r, charId: cmd.actorId,
    });
  }

  // --- Turn-start hook resolution ---
  _resolveTurnStartEffects(turnStartCtx) {
    for (const e of this.#registry.characters()) {
      if (e.alive === false) continue;

      // 大荒星陨: airborne → charge at target, 3-radius AOE 500
      if (this.#buffManager.hasStatus(e.id, 'METEOR_ASCENDING')) {
        const buffs = this.#buffManager.getActiveBuffs(e.id);
        const meteor = buffs.find(b => b.statusType === 'METEOR_ASCENDING');
        if (meteor && meteor.data.targetQ != null) {
          // Teleport to target, then AOE
          const fromQ = e.position.q, fromR = e.position.r;
          this.#registry.updatePosition(e.id, fromQ, fromR, meteor.data.targetQ, meteor.data.targetR);
          this.#logger?.log('☄ 大荒星陨！降临', 'die');

          // 1-radius AOE 700
          for (const other of this.#registry.characters()) {
            if (other.id === e.id || other.alive === false) continue;
            if (hexDistance(meteor.data.targetQ, meteor.data.targetR, other.position.q, other.position.r) <= 1) {
              this.#damageCalculator.resolve(e.id, other.id, 700, 'PHYSICAL');
            }
          }
          this.#buffManager.removeByType(e.id, 'METEOR_ASCENDING');
          this.#lastHitByActor.set(e.id, true);
        }
      }
    }
  }

  // 悬剑落剑: instant kill at speed-2 phase
  _resolveSwordHangingDrop() {
    for (const e of this.#registry.characters()) {
      if (e.alive === false) continue;
      if (!this.#buffManager.hasStatus(e.id, 'SWORD_HANGING')) continue;
      const buffs = this.#buffManager.getActiveBuffs(e.id);
      const sword = buffs.find(b => b.statusType === 'SWORD_HANGING');
      if (sword && sword.data.targetQ != null) {
        const entities = this.#registry.getAt(sword.data.targetQ, sword.data.targetR);
        for (const target of entities) {
          if (target.type === 'CHARACTER' && target.id !== e.id && target.alive !== false) {
            target.alive = false;
            this.#eventBus.emit(EvtType.CHARACTER_DIED, { targetId: target.id, sourceId: e.id });
            this.#logger?.log('⚔ 落剑！即死', 'die');
          }
        }
        this.#buffManager.removeByType(e.id, 'SWORD_HANGING');
        this.#lastHitByActor.set(e.id, true);
      }
    }
  }

  // 御剑: auto-move 2 hexes per turn at speed-2 phase
  _resolveSwordFlightAutoMove() {
    for (const e of this.#registry.characters()) {
      if (!this.#buffManager.hasStatus(e.id, 'SWORD_FLIGHT')) continue;
      const buffs = this.#buffManager.getActiveBuffs(e.id);
      const flight = buffs.find(b => b.statusType === 'SWORD_FLIGHT');
      if (!flight || flight.data.remaining <= 0) continue;
      const dir = flight.data.direction || 0;
      const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
      const [dq, dr] = dirs[dir % 6];
      const swordPower = flight.data.swordPower || 300;
      let blocked = false;
      for (let step = 0; step < 2; step++) {
        const nq = e.position.q + dq, nr = e.position.r + dr;
        if (!isOnBoard(nq, nr)) {
          flight.data.remaining = 0;
          this.#buffManager.removeByType(e.id, 'SWORD_FLIGHT');
          this.#logger?.log('御剑撞墙停止', 's');
          blocked = true;
          break;
        }
        this.#registry.updatePosition(e.id, e.position.q, e.position.r, nq, nr);
        // Sword energy consumed on hit (offensive) — same pool as defensive absorption
        if (flight.data.swordEnergy > 0) {
          const entitiesAt = this.#registry.getAt(nq, nr);
          for (const other of entitiesAt) {
            if (other.type === 'CHARACTER' && other.id !== e.id && other.alive !== false) {
              this.#damageCalculator.resolve(e.id, other.id, swordPower, 'PHYSICAL');
              flight.data.swordEnergy = Math.max(0, flight.data.swordEnergy - swordPower);
              this.#logger?.log('🗡 御剑撞击！威' + swordPower + ' 余能' + flight.data.swordEnergy, 'sh');
            }
          }
        }
        // Sword broken — stop flight
        if (flight.data.swordEnergy <= 0) {
          flight.data.remaining = 0;
          this.#buffManager.removeByType(e.id, 'SWORD_FLIGHT');
          this.#logger?.log('御剑能量耗尽', 's');
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        flight.data.remaining -= 1;
        if (flight.data.remaining <= 0) {
          this.#buffManager.removeByType(e.id, 'SWORD_FLIGHT');
          this.#logger?.log('御剑停止', 's');
        }
      }
    }
  }


  // Galaxy sub-phase: grant extra actions at speed-2, speed-capped at 2
  async _resolveGalaxySubPhase(groups) {
    const galaxyChars = [];
    for (const c of this.#registry.characters()) {
      if (c.alive !== false && this.#buffManager.hasStatus(c.id, 'GALAXY_PENDING')) {
        galaxyChars.push(c);
      }
    }
    if (galaxyChars.length === 0) return;

    this.#logger?.log('银河远征子回合开始', 'turn');
    this.#eventBus.emit(EvtType.GALAXY_SUBPHASE_START, { charIds: galaxyChars.map(c => c.id) });

    for (const char of galaxyChars) {
      if (this.#phase === TurnPhase.BATTLE_END) break;

      const buffs = this.#buffManager.getActiveBuffs(char.id);
      const galaxyBuffs = buffs.filter(b => b.statusType === 'GALAXY_PENDING');
      let totalActions = 0;
      for (const gb of galaxyBuffs) totalActions += gb.data?.extraTurns || 3;
      this.#buffManager.removeByType(char.id, 'GALAXY_PENDING');

      for (let i = 0; i < totalActions; i++) {
        if (this.#phase === TurnPhase.BATTLE_END) break;
        this.#logger?.log(`银河远征 行动 ${i + 1}/${totalActions} [${char.name || char.id}]`, 'action');

        this.#eventBus.emit(EvtType.GALAXY_ACTION_PROMPT, { charId: char.id, index: i, total: totalActions });
        const galaxyAction = await this.#galaxyProvider(char.id);
        if (!galaxyAction) { this.#logger?.log('银河远征 超时/跳过', 's'); break; }

        const result = this.#skillResolver.resolve(galaxyAction.skillId, char.id, galaxyAction.targetPos, { skipCostCheck: true });
        if (!result.success) { this.#logger?.log(`银河远征 技能无效: ${result.error}`, 's'); continue; }

        // Apply ON_SPEED_CALCULATE hook (SPEED_BOOST)
        for (const cmd of result.sequence.commands) {
          const spdCtx = this.#buffManager.dispatch(HookName.ON_SPEED_CALCULATE, {
            entityId: char.id,
            speed: cmd.subSpeed ?? result.sequence.totalSpeed,
          });
          if (spdCtx?.speed !== undefined) cmd.subSpeed = spdCtx.speed;
        }

        // Speed-cap at 2 and distribute
        const deferredGains = [];
        for (const cmd of result.sequence.commands) {
          if (cmd.subSpeed !== null && cmd.subSpeed !== undefined) {
            cmd.subSpeed = Math.min(cmd.subSpeed, 2);
          }
          const effectiveSpeed = Math.min(cmd.subSpeed ?? result.sequence.totalSpeed, 2);

          if (effectiveSpeed === 2) {
            if (cmd.type === CmdType.GAIN_RESOURCE && cmd.payload.condition === 'ON_HIT') {
              deferredGains.push(cmd);
            } else {
              this._executeCommand(cmd);
            }
          } else {
            groups[effectiveSpeed].push(cmd);
          }
        }

        // Resolve projectiles from speed-2 galaxy commands
        if (this.#projectileCalculator) {
          const projResults = this.#projectileCalculator.resolveStep(2, this.#registry, this.#damageCalculator, this.#buffManager);
          for (const r of projResults.hits) { if (r.hit) this.#lastHitByActor.set(r.ownerId, true); }
          for (const r of projResults.interceptions) { if (r.intercepted && r.interceptorId) this.#lastHitByActor.set(r.interceptorId, true); }

          // Dispatch ON_ATTACK_MISSED for galaxy projectile attackers that didn't hit
          for (const attackerId of this.#projectileAttackers) {
            if (!this.#lastHitByActor.get(attackerId)) {
              const missCtx = this.#buffManager.dispatch(HookName.ON_ATTACK_MISSED, { attackerId });
              this._processDeathWindReloads(missCtx);
            }
          }
        }
        this.#projectileAttackers.clear();

        // Execute deferred ON_HIT gains for galaxy commands
        for (const cmd of deferredGains) {
          if (this.#phase === TurnPhase.BATTLE_END) break;
          this._executeCommand(cmd);
        }

        if (this._checkWinCondition()) break;
      }
      if (this.#phase === TurnPhase.BATTLE_END) break;
    }

    // Re-sort groups[1] and [0] for P2P determinism (galaxy commands were appended)
    for (const spd of [1, 0]) {
      groups[spd].sort((a, b) => (a.actorId || '').localeCompare(b.actorId || ''));
    }

    this.#eventBus.emit(EvtType.GALAXY_SUBPHASE_END, {});
  }

  // --- Post-turn resolution ---
  _resolveEndOfTurnEffects() {
    // Qi gain resolution: pendingQi → if shield wasn't hit, gain 1 qi
    for (const [entityId, flags] of this.#pendingFlags) {
      if (flags.pendingQi) {
        const mageShieldHit = this.#shieldHitEntities.has(entityId);
        if (!mageShieldHit) {
          const ctx = this.#buffManager.dispatch(HookName.ON_RESOURCE_GAIN, {
            entityId, resource: 'qi', amount: 1,
          });
          const finalAmount = ctx?.amount ?? 1;
          this.#resourceSystem.add(entityId, 'qi', finalAmount);
          const animStep = flags._gatherAnimStep ?? this.#currentAnimStep;
          const gatherActor = this.#registry.get(entityId);
          if (gatherActor && finalAmount > 0) {
            this.#projectileCalculator?.addAnimEvent({
              event: 'gather', step: animStep, duration: 2,
              q: gatherActor.position.q, r: gatherActor.position.r, color: '#8b5cf6', amount: finalAmount,
            });
          }
          this.#logger?.log(`🔮 集气成功 +${finalAmount}气`, 'qi');
        } else {
          this.#logger?.log('🔮 护盾受击，未获气', 'sh');
        }
      }
    }

    // Deactivate shield at end of each turn (shield only lasts for the turn it's cast)
    for (const e of this.#registry.characters()) {
      this.#resourceSystem.setShieldActive(e.id, false);
    }

    // Jump return: teleport entities back to their saved positions
    for (const [entityId, pos] of this.#jumpReturns) {
      const actor = this.#registry.get(entityId);
      if (actor && actor.alive !== false) {
        const fromQ = actor.position.q, fromR = actor.position.r;
        this.#registry.updatePosition(entityId, fromQ, fromR, pos.q, pos.r);
        this.#eventBus.emit(EvtType.MOVEMENT_COMPLETE, { entityId, from: { q: fromQ, r: fromR }, to: { q: pos.q, r: pos.r } });
        this.#projectileCalculator?.addAnimEvent({
          event: 'teleport', step: this.#currentAnimStep,
          fromQ, fromR, toQ: pos.q, toR: pos.r, charId: entityId,
        });
        this.#logger?.log(`↩ 跃迁返回 (${pos.q},${pos.r})`, 'mv');
      }
    }
    this.#jumpReturns.clear();

    this.#pendingFlags.clear();
  }

  _processDelayedCommands() {
    const toProcess = this.#delayedCommands.filter(c => c.resolveTurn === this.#turnNumber);
    for (const cmd of toProcess) {
      if (cmd.type === CmdType.DELAYED_SKILL && cmd.payload.skillId && this.#skillResolver) {
        const actor = this.#registry.get(cmd.actorId);
        if (actor && actor.alive !== false) {
          const repeatCount = cmd.payload.consumedAmmo || 1;
          const result = this.#skillResolver.resolveMultiCast(
            cmd.payload.skillId, cmd.actorId, cmd.targetPos, repeatCount
          );
          if (result.success) {
            for (const subCmd of result.sequence.commands) {
              this._executeCommand(subCmd);
            }
          }
        }
      } else {
        this._executeCommand(cmd);
      }
    }
    this.#delayedCommands = this.#delayedCommands.filter(c => c.resolveTurn !== this.#turnNumber);
  }

  _cleanup() {
    this._resolveRoleCleanupEffects();
    // Tick buff durations
    this.#buffManager.tickDurations(this.#turnNumber);
    this._clearEndOfTurnRoleStatuses();
    // Clear queue
    this.#commandQueue.clearAll();
    // Respawn wild bullets if shooter present
    if (this.#projectileCalculator) {
      const shooter = [...this.#registry.characters()].find(
        c => c.alive !== false && c.class === '射手'
      );
      if (shooter) {
        const toRespawn = this.#projectileCalculator.getWildBulletsCollected();
        if (toRespawn > 0) {
          this.#projectileCalculator.clearWildBulletsCollected();
          const friendlyHalf = shooter.position.r < 0 ? 'upper' : 'lower';
          this.#projectileCalculator.spawnWildBullets(toRespawn, this.#registry, this.#turnNumber, friendlyHalf);
        }
      }
    }
  }

  _resolveRoleCleanupEffects() {
    for (const e of this.#registry.characters()) {
      if (e.alive === false) continue;
      if (e.roleId === 'shooter_helldiver' && this._hasTraitInLoadout(e, 'trait_helldiver_laser_weapon')) {
        this.#resourceSystem.addBackpackAmmo(e.id, 1);
        this.#logger?.log('绝地潜兵激光武器蓄能 背包+1', 's');
      }
    }
  }

  // Apply per-role passives at turn start
  _applyTurnStartRolePassives() {
    for (const e of this.#registry.characters()) {
      if (e.alive === false) continue;

      // Jimmy 呼吸法: toggle breathing status based on turn parity
      if (e.roleId === 'warrior_jimmy') {
        if (this._hasTraitInLoadout(e, 'trait_jimmy_breathing')) {
          const isOdd = this.#turnNumber % 2 === 1;
          this.#buffManager.removeByType(e.id, 'JIMMY_BREATH_IN');
          this.#buffManager.removeByType(e.id, 'JIMMY_BREATH_OUT');
          if (isOdd) {
            this.#buffManager.apply(e.id, 'JIMMY_BREATH_IN', -1, e.id);
            this.#logger?.log('吉米 呼吸法·吸：怒气获得+1 攻击距离-1', 'rg');
          } else {
            this.#buffManager.apply(e.id, 'JIMMY_BREATH_OUT', -1, e.id);
            this.#logger?.log('吉米 呼吸法·呼：攻击距离+1 怒气获得-1', 'rg');
          }
        }

        // 洗髓·气: turn start rage gain from marrow tiers
        if (this.#buffManager.hasStatus(e.id, 'JIMMY_MARROW_QI')) {
          this.#resourceSystem.add(e.id, 'rage', 1);
          this.#logger?.log('吉米 洗髓·气：回合开始怒+1', 'rage');
        }
        if (this.#buffManager.hasStatus(e.id, 'JIMMY_MARROW_QI2')) {
          this.#resourceSystem.add(e.id, 'rage', 1);
          this.#logger?.log('吉米 洗髓·气II：回合开始怒+1', 'rage');
        }
      }

      // Gunfighter finesse: apply readiness indicator when slot is available
      if (e.roleId === 'shooter_gunfighter' && this._hasTraitInLoadout(e, 'trait_gunfighter_finesse')) {
        if (this.#actionPointSystem?.isGunfighterReady(e.id)) {
          if (!this.#buffManager.hasStatus(e.id, 'FINESSE_READY')) {
            this.#buffManager.apply(e.id, 'FINESSE_READY', 1, e.id);
          }
        }
      }

      // Yan 死亡如风: apply permanent passive once
      if (e.roleId === 'shooter_yan' && this._hasTraitInLoadout(e, 'trait_yan_death_wind') && !this.#buffManager.hasStatus(e.id, 'YAN_DEATH_WIND')) {
        this.#buffManager.apply(e.id, 'YAN_DEATH_WIND', -1, e.id);
        this.#logger?.log('燕双鹰 死亡如风：对手攻击落空时自动装填', 's');
      }
    }
  }

  // Check if a trait skill is in the character's role loadout.
  // Returns true when roleLoadoutSkillIds is null (non-config battles) to preserve backward compat.
  _hasTraitInLoadout(char, traitSkillId) {
    if (!char.roleLoadoutSkillIds) {
      // Backward compat: only default traits active (first ROLE_LOADOUT_SIZE from pool)
      const defaults = char.roleId ? getDefaultRoleLoadout(char.roleId) : [];
      return defaults.includes(traitSkillId);
    }
    return char.roleLoadoutSkillIds.includes(traitSkillId);
  }

  // Compute total skill haste for a given skill (global + single-skill)
  _getSkillHaste(actor, skillId) {
    let total = 0;
    // Fast Ready: +50 haste for call-in type skills
    if (this._hasTraitInLoadout(actor, 'trait_helldiver_fast_ready')) {
      const skill = SKILLS[skillId];
      if (skill && (skillId === 'role_helldiver_supply_drop' || skillId === 'role_helldiver_bombardment')) {
        total += 50;
      }
    }
    return total;
  }

  // Jimmy 易经洗髓酒: cost is paid via CONSUME_RESOURCE (injected by SkillResolver)
  _execMarrowUpgrade(cmd) {
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;

    const rewards = ['JIMMY_MARROW_QI', 'JIMMY_MARROW_RANGE', 'JIMMY_MARROW_MOVE', 'JIMMY_MARROW_QI2', 'JIMMY_MARROW_POWER'];
    const rewardNames = ['每回合怒+1', '攻击距离+1', '移动/易经洗髓酒视为灵巧', '每回合怒+1', '威力+100'];

    // Apply JIMMY_MARROW tracker if not present
    if (!this.#buffManager.hasStatus(actor.id, 'JIMMY_MARROW')) {
      this.#buffManager.apply(actor.id, 'JIMMY_MARROW', -1, actor.id, { layer: 0 });
    }

    const buffs = this.#buffManager.getActiveBuffs(actor.id);
    const marrow = buffs.find(b => b.statusType === 'JIMMY_MARROW');
    if (!marrow) return;

    const layer = marrow.data.layer || 0;
    if (layer >= rewards.length) {
      this.#logger?.log('吉米 洗髓已满五层，无法继续突破', 'rg');
      return;
    }

    this.#buffManager.apply(actor.id, rewards[layer], -1, actor.id);
    marrow.data.layer = layer + 1;
    this.#logger?.log(`吉米 洗髓突破！获得${rewardNames[layer]} (第${layer + 1}层)`, 'rg');
  }

  _execDropSupplyCrate(cmd) {
    if (!cmd.targetPos) return;
    this.#projectileCalculator?._dropSupplyCrate(cmd.targetPos.q, cmd.targetPos.r);
    this.#logger?.log(`补给箱空投降落 (${cmd.targetPos.q},${cmd.targetPos.r})`, 's');
  }

  _clearEndOfTurnRoleStatuses() {
    for (const e of this.#registry.characters()) {
      if (this.#buffManager.hasStatus(e.id, 'YAN_EMPTY_GUN')) {
        const drained = this.#resourceSystem.drainAll(e.id);
        const parts = []; for (const [res, val] of Object.entries(drained)) { if (val > 0) parts.push(`${res} ${val}`); }
        this.#logger?.log(`我赌你的枪里没有子弹：目标未发起攻击，剥夺全部资源${parts.length ? ' (' + parts.join(', ') + ')' : ''}`, 'warn');
        this.#buffManager.removeByType(e.id, 'YAN_EMPTY_GUN');
      }
    }
  }

  _checkWinCondition() {
    const aliveChars = [...this.#registry.characters()].filter(c => c.alive !== false);
    if (aliveChars.length <= 1) {
      this.#phase = TurnPhase.BATTLE_END;
      const winner = aliveChars[0]?.ownerId || 'draw';
      this.#eventBus.emit(EvtType.BATTLE_END, { winner });
      this.#logger?.log('\n⚡ 战斗结束！胜者: ' + winner, 'die');
      return true;
    }
    return false;
  }

  _handleOnHitGain(cmd) {
    this.#lastHitByActor.set(cmd.actorId, true);
  }

  _getForcedSkillId(characterId) {
    const buffs = this.#buffManager.getActiveBuffs(characterId);
    for (const buff of buffs) {
      const def = STATUS_DEFS[buff.statusType];
      if (def?.forcedSkillId !== undefined) return def.forcedSkillId;
    }
    return undefined;
  }

  _isSubmitted(characterId) {
    return this.#submittedChars.has(characterId);
  }

  // --- Input ---
  submitAction(characterId, skillId, targetPos) {
    if (this.#phase === TurnPhase.BATTLE_END) return { success: false, error: 'battle_ended' };
    if (!this.#skillResolver) return { success: false, error: 'no_skill_resolver' };

    // Check forced action: if character has a buff with forcedSkillId, only that skill is allowed
    const forcedSkillId = this._getForcedSkillId(characterId);
    if (forcedSkillId !== undefined) {
      if (forcedSkillId === null) return { success: false, error: 'forced_pass' };
      if (skillId !== forcedSkillId) return { success: false, error: 'forced_action', forcedSkillId };
    }

    // Compute pending resource gains from already-submitted commands
    const pendingGains = this._getPendingResourceGains(characterId);

    const result = this.#skillResolver.resolve(skillId, characterId, targetPos,
      Object.keys(pendingGains).length > 0 ? { pendingResources: pendingGains } : {});
    if (!result.success) return result;

    const actor = this.#registry.get(characterId);
    const actionPoint = this.#actionPointSystem?.consume(actor, skillId);
    if (actionPoint && !actionPoint.ok) {
      return { success: false, error: actionPoint.reason };
    }

    // Check skill cooldown
    const skill = SKILLS[skillId];
    if (skill?.cooldown && this.#skillCooldowns) {
      const haste = this._getSkillHaste(actor, skillId);
      if (!this.#skillCooldowns.isReady(characterId, skillId)) {
        const remaining = this.#skillCooldowns.getRemaining(characterId, skillId);
        return { success: false, error: `skill_on_cooldown (${remaining} turns remaining)` };
      }
    }

    // Remove finesse indicator when the finesse slot is consumed
    if (actionPoint && (actionPoint.slot === 'finesse' || actionPoint.slot === 'main_reassign')) {
      this.#buffManager.removeByType(actor.id, 'FINESSE_READY');
    }

    // Set current turn for buff timing checks
    this.#buffManager.setCurrentTurn(this.#turnNumber);

    // Check for multi-cast BEFORE enqueuing (MULTI_CAST_PENDING)
    const mcCtx = this.#buffManager.dispatch(HookName.ON_BEFORE_ACTION, {
      entityId: characterId, command: null,
    });
    const multiCast = mcCtx?.multiCast || 1;

    let finalSequence;
    if (multiCast > 1) {
      const mcResult = this.#skillResolver.resolveMultiCast(skillId, characterId, targetPos, multiCast);
      if (!mcResult.success) return mcResult;
      finalSequence = mcResult.sequence;
      this.#buffManager.removeByType(characterId, 'MULTI_CAST_PENDING');
    } else {
      finalSequence = result.sequence;
    }

    // Apply speed buffs (SPEED_BOOST: +1 speed tier)
    for (const cmd of finalSequence.commands) {
      const spdCtx = this.#buffManager.dispatch(HookName.ON_SPEED_CALCULATE, {
        entityId: characterId, speed: cmd.subSpeed ?? finalSequence.totalSpeed,
      });
      if (spdCtx?.speed !== undefined) {
        cmd.subSpeed = spdCtx.speed;
      }
    }

    this.#commandQueue.enqueueSequence(finalSequence);
    this.#submittedChars.add(characterId);
    return { success: true, sequence: finalSequence, actionPoint };
  }

  // Scan queued commands for pending GAIN_RESOURCE, for pre-spend preview
  _getPendingResourceGains(characterId) {
    const gains = {};
    for (const speed of this.#commandQueue.speeds()) {
      for (const cmd of this.#commandQueue.getTier(speed)) {
        if (cmd.actorId !== characterId) continue;
        if (cmd.type === CmdType.GAIN_RESOURCE) {
          const res = cmd.payload.resource;
          const amt = typeof cmd.payload.amount === 'number' ? cmd.payload.amount : 0;
          gains[res] = (gains[res] || 0) + amt;
        }
      }
    }
    return gains;
  }

  autoSubmitForcedActions() {
    const submitted = [];
    for (const c of this.#registry.characters()) {
      if (c.alive === false) continue;
      const forcedId = this._getForcedSkillId(c.id);
      if (forcedId !== undefined && !this._isSubmitted(c.id)) {
        if (forcedId === null) {
          this.submitAction(c.id, 'warrior_formation_break', null);
        } else {
          this.submitAction(c.id, forcedId, null);
        }
        submitted.push(c.id);
      }
    }
    return submitted;
  }

  // Apply initial role passives at battle start (turn 1 planning phase)
  initRolePassives() {
    this._applyTurnStartRolePassives();
  }

  reset() {
    this.#turnNumber = 1;
    this.#phase = TurnPhase.PLAN;
    this.#delayedCommands.length = 0;
    this.#pendingFlags.clear();
    this.#lastHitByActor.clear();
    this.#shieldHitEntities.clear();
    this.#submittedChars.clear();
    this.#resourceFailed.clear();
    this.#canceledSequences.clear();
    this.#jumpReturns.clear();
    this.#speedGroups = null;
    this.#actionPointSystem?.resetTurn();
    this.#commandQueue.clearAll();
  }

  serialize() {
    return {
      turnNumber: this.#turnNumber,
      phase: this.#phase,
      delayedCommands: structuredClone(this.#delayedCommands),
      pendingFlags: [...this.#pendingFlags.entries()].map(([id, flags]) => [id, { ...flags }]),
      jumpReturns: [...this.#jumpReturns.entries()].map(([id, pos]) => [id, { ...pos }]),
      lastHitByActor: [...this.#lastHitByActor.entries()],
      shieldHitEntities: [...this.#shieldHitEntities],
      submittedChars: [...this.#submittedChars],
      resourceFailed: [...this.#resourceFailed],
      canceledSequences: [...this.#canceledSequences],
      projectileAttackers: [...this.#projectileAttackers],
      currentAnimStep: this.#currentAnimStep,
    };
  }

  deserialize(data = {}) {
    this.#turnNumber = data.turnNumber || 1;
    this.#phase = data.phase || TurnPhase.PLAN;
    this.#delayedCommands = structuredClone(data.delayedCommands || []);
    this.#pendingFlags.clear();
    for (const [id, flags] of data.pendingFlags || []) this.#pendingFlags.set(id, { ...flags });
    this.#jumpReturns.clear();
    for (const [id, pos] of data.jumpReturns || []) this.#jumpReturns.set(id, { ...pos });
    this.#lastHitByActor.clear();
    for (const [id, hit] of data.lastHitByActor || []) this.#lastHitByActor.set(id, hit);
    this.#shieldHitEntities = new Set(data.shieldHitEntities || []);
    this.#submittedChars = new Set(data.submittedChars || []);
    this.#resourceFailed = new Set(data.resourceFailed || []);
    this.#canceledSequences = new Set(data.canceledSequences || []);
    this.#projectileAttackers = new Set(data.projectileAttackers || []);
    this.#currentAnimStep = data.currentAnimStep || 0;
    this.#speedGroups = null;
  }
}
