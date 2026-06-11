// Turn resolution pipeline: PLAN → RESOLVE → EFFECTS → CLEANUP
import { CmdType, EvtType } from './CommandTypes.js';
import { hexDistance, hexLine, hexNeighbors, hexSpiral, isOnBoard } from './HexMath.js';
import { HookName } from './BuffHooks.js';
import { STATUS_DEFS } from './StatusEffectDefs.js';
import { SKILLS } from './SkillData.js';
import { getDefaultRoleLoadout } from './RoleData.js';
import { canAffectCharacter, getAliveTeamIds } from './TeamResolver.js';
import { ResolutionEventRecorder } from './resolution/ResolutionEventRecorder.js';

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
  #getRules = null;
  #turnNumber = 1;
  #phase = TurnPhase.PLAN;
  #resolutionRecorder = null;
  #eventRecorder = null;  // ResolutionEventRecorder — structured EventBus-based events
  #delayedCommands = [];
  #pendingFlags = new Map(); // entityId → { pendingQi, ... }
  #jumpReturns = new Map();  // entityId → { q, r } for end-of-turn jump return
  #lastHitByActor = new Map(); // actorId → boolean (did their last attack hit?)
  #shieldHitEntities = new Set(); // entityIds whose shield was hit this turn
  #hitEntities = new Set();       // entityIds hit by any damage contact this turn (for 盛怒 cancel)
  #submittedChars = new Set();   // charIds that submitted this turn
  #resourceFailed = new Set();  // sequenceIds whose resource cost check failed at exec time
  #canceledSequences = new Set(); // sequenceIds canceled by interruption/reaction effects
  #projectileAttackers = new Set(); // actorIds that fired projectiles this speed tier
  #legacyPhaseEvents = [];           // legacy events for attack finalization (not player-facing)
  #lastActionContext = null;          // saved action context for projectile damage attribution
  #usedActionIds = new Set();         // actionIds that have started cooldown/used this turn
  #cooldownSnapshot = null;           // pre-turn cooldown state for tick exclusion
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
    this.#getRules = deps.getRules || null;

    // Track shield hits for pendingQi resolution
    this.#eventBus.on(EvtType.SHIELD_ABSORBED, (data) => {
      const targetId = data.entityId || data.targetId;
      if (targetId) this.#shieldHitEntities.add(targetId);
    });
    // Track damage contact for 盛怒 cancel: any DAMAGE_DEALT means target was contacted
    // (even basePower=0 armor-pierce hits). Also track ARMOR_PIERCED.
    // Also means 心眼 weak point: check on every damage event
    this.#eventBus.on(EvtType.DAMAGE_DEALT, (data) => {
      if (data.targetId) {
        this.#hitEntities.add(data.targetId);
      }
      if (data.sourceId && data.targetId) {
        this._checkMindsEyeOnDamage(data.sourceId, data.targetId);
      }
    });
    // ARMOR_PIERCED also counts as a hit (破气针 with power=0 still contacts target)
    this.#eventBus.on(EvtType.ARMOR_PIERCED, (data) => {
      if (data.targetId) this.#hitEntities.add(data.targetId);
    });
    // 引刀: refresh 居合斩 CD when INDRA_BLADE is applied
    this.#eventBus.on(EvtType.STATUS_APPLIED, (data) => {
      if (data.statusType === 'INDRA_BLADE' && data.entityId) {
        this.#skillCooldowns?.resetCooldown(data.entityId, 'warrior_iaido');
        const char = this.#registry.get(data.entityId);
        this.#logger?.log(`${char?.name || data.entityId} 引刀：居合斩CD刷新`, 'rg');
      }
    });

    // Structured event recorder — captures EventBus events as ResolutionEvents
    this.#eventRecorder = new ResolutionEventRecorder(this.#eventBus, this.#registry);
  }

  get turnNumber() { return this.#turnNumber; }
  get phase() { return this.#phase; }

  setGalaxyProvider(fn) { this.#galaxyProvider = fn; }
  setResolutionRecorder(recorder = null) { this.#resolutionRecorder = recorder; }
  clearResolutionRecorder() { this.#resolutionRecorder = null; }

  _getRules() {
    return this.#getRules?.() || {};
  }

  _canAttackAffect(source, target, policy = null) {
    const rules = this._getRules();
    const friendlyFire = Boolean(rules.friendlyFire);
    return canAffectCharacter({
      source,
      target,
      policy: policy || (friendlyFire ? 'allExceptSelf' : 'enemyOnly'),
      friendlyFire,
    });
  }

  // Called by UI when both players have submitted
  async executeTurn() {
    this.#shieldHitEntities.clear();
    this.#hitEntities.clear();
    this.#submittedChars.clear();
    this.#resourceFailed.clear();
    this.#canceledSequences.clear();
    this.#projectileAttackers.clear();
    this.#usedActionIds.clear();
    // Snapshot pre-turn cooldown state so new cooldowns don't tick this turn
    this.#cooldownSnapshot = this.#skillCooldowns ? this.#skillCooldowns.serialize() : null;
    this.#logger?.setTurn(this.#turnNumber);
    this.#logger?.log(`=== 第 ${this.#turnNumber} 回合 ===`, 'turn');
    this.#phase = TurnPhase.RESOLVE;
    this.#resolutionRecorder?.onTurnStart?.({ turnNumber: this.#turnNumber });
    this.#eventRecorder?.startTurn(this.#turnNumber);

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
    const groups = { 4: [], 3: [], 2: [], 1: [], 0: [] };
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
    for (const spd of [4, 3, 2, 1, 0]) {
      groups[spd].sort((a, b) => (a.actorId || '').localeCompare(b.actorId || ''));
    }
    this.#speedGroups = groups;

    // Process delayed commands from previous turns before speed-tier loop
    // (so created projectiles are resolved during this turn's projectile steps)
    this._processDelayedCommands();

    // --- RESOLVE: Execute by speed tier 3→2→1→0 ---
    for (const spd of [4, 3, 2, 1, 0]) {
      if (this.#phase === TurnPhase.BATTLE_END) break;
      this.#currentAnimStep = 3 - spd;
      this.#eventBus.emit(EvtType.SPEED_TIER_START, { speed: spd });

      const cmds = groups[spd];
      let phaseRecord = null;
      if (cmds.length > 0) {
        phaseRecord = this.#resolutionRecorder?.onPhaseStart?.({ speed: spd, commandCount: cmds.length }) || null;
        if (phaseRecord && this.#eventRecorder) {
          this.#eventRecorder.setCurrentPhaseRecord(phaseRecord);
        }
      }
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
        const beforeActor = this.#registry.get(cmd.actorId);
        // Record action_declared before execution (dedup handled by EventRecorder)
        if (phaseRecord && this.#eventRecorder) {
          const actionId = cmd.actionId || cmd.sequenceId || cmd.id || null;
          const skill = cmd.skillId ? SKILLS[cmd.skillId] : null;
          this.#eventRecorder.setActionContext(actionId, cmd.actorId, cmd.skillId, cmd.sequenceId);
          this.#lastActionContext = { actionId, actorId: cmd.actorId, skillId: cmd.skillId, commandId: cmd.sequenceId };
          this.#eventRecorder.recordActionDeclared(
            cmd.actorId, cmd.skillId, actionId, cmd.targetPos || null, skill?.name || null
          );
        }
        this._executeCommand(cmd);
        if (phaseRecord) {
          const legacyEvent = this._createResolutionEvent(cmd, spd, this.#legacyPhaseEvents.length, beforeActor);
          if (this.#eventRecorder) {
            // EventRecorder captures canonical events from EventBus.
            // Legacy events go to a debug array for attack finalization, NOT player-facing phase.events.
            this.#legacyPhaseEvents.push(legacyEvent);
          } else {
            phaseRecord.events.push(legacyEvent);
          }
        }
      }

      // Resolve projectiles at this speed tier (advance full path, check body contact).
      // Clear action context during resolution so EventBus DAMAGE_DEALT events
      // don't get the stale actionId; we record damage from results.hits instead.
      if (this.#eventRecorder && this.#lastActionContext) {
        this.#eventRecorder.setActionContext(null, null, null, null);
      }
      // Snapshot alive projectile IDs before resolution so we can detect expired ones.
      const preProjIds = this.#projectileCalculator
        ? new Set((this.#projectileCalculator.getProjectiles?.() || []).map(p => p.id))
        : new Set();
      if (this.#projectileCalculator) {
        const results = this.#projectileCalculator.resolveStep(
          spd, this.#registry, this.#damageCalculator, this.#buffManager, { rules: this._getRules() }
        );

        for (const r of results.hits) {
          if (r.hit) this.#lastHitByActor.set(r.ownerId, true);
        }
        for (const r of results.interceptions) {
          if (r.intercepted && r.interceptorId) {
            this.#lastHitByActor.set(r.interceptorId, true);
          }
        }

        // Record projectile and damage events with correct actionId from hit results.
        // (EventBus DAMAGE_DEALT uses stale actionContext; we override with accurate actionId.)
        if (this.#eventRecorder && phaseRecord) {
          const hitProjIds = new Set();
          // Track which actionIds have damage recorded so we skip stale EventBus duplicates
          const damagedActionIds = new Set();
          for (const r of results.hits) {
            if (r.projectileId) {
              hitProjIds.add(r.projectileId);
              if (r.hit) {
                this.#eventRecorder.recordProjectileCollided(
                  r.projectileId, r.targetId, null, r.damage
                );
                // Set action context to the projectile's actionId, then record damage and death
                if (r.actionId) {
                  const actor = this.#registry.get(r.ownerId);
                  const target = this.#registry.get(r.targetId);
                  this.#eventRecorder.record({
                    id: `rev-dmg-${r.projectileId}`,
                    eventType: 'damage_applied',
                    actionId: r.actionId,
                    actorId: r.ownerId,
                    targetId: r.targetId,
                    targetName: target?.name || null,
                    finalDamage: r.damage ?? null,
                    result: r.killed ? 'killed' : 'hit',
                  });
                  if (r.killed) {
                    this.#eventRecorder.record({
                      id: `rev-death-${r.projectileId}`,
                      eventType: 'character_died',
                      actionId: r.actionId,
                      actorId: r.ownerId,
                      targetId: r.targetId,
                      targetName: target?.name || null,
                      finalDamage: r.damage ?? null,
                    });
                  }
                  damagedActionIds.add(r.actionId);
                }
              }
            }
          }
          for (const r of results.interceptions) {
            if (r.projectileId) {
              hitProjIds.add(r.projectileId);
              if (r.intercepted) {
                this.#eventRecorder.recordProjectileIntercepted(
                  r.projectileId, r.interceptorId, r.interceptPower
                );
              }
            }
          }
          // Record projectile-vs-projectile collisions (相杀, 贯穿) as canonical events
          for (const c of results.collisions || []) {
            if (c.projectileId) {
              hitProjIds.add(c.projectileId);
              if (c.type === 'mutual_destroy') {
                this.#eventRecorder.record({
                  id: `rev-collide-${c.projectileId}`,
                  eventType: 'projectile_collided',
                  projectileId: c.projectileId,
                  targetId: c.otherProjectileId,
                  collisionType: c.type,
                  isMelee: c.flags?.includes('MELEE') || false,
                  otherIsMelee: c.otherFlags?.includes('MELEE') || false,
                  power: c.power,
                  otherPower: c.otherPower,
                  ownerId: c.ownerId,
                  otherOwnerId: c.otherOwnerId,
                  actionId: c.actionId,
                });
              } else if (c.type === 'overpowered') {
                this.#eventRecorder.record({
                  id: `rev-collide-${c.projectileId}`,
                  eventType: 'projectile_collided',
                  projectileId: c.projectileId,
                  targetId: c.otherProjectileId,
                  collisionType: c.type,
                  isMelee: c.flags?.includes('MELEE') || false,
                  otherIsMelee: c.otherFlags?.includes('MELEE') || false,
                  power: c.power,
                  otherPower: c.otherPower,
                  ownerId: c.ownerId,
                  otherOwnerId: c.otherOwnerId,
                  actionId: c.actionId,
                });
              }
            }
          }
          // Record projectile_expired for projectiles that existed before resolution
          // but are no longer alive after (resolveStep filters dead projectiles out).
          // Also include projectiles marked !alive that are still in the list.
          const postProjs = this.#projectileCalculator.getProjectiles?.() || [];
          const postProjIds = new Set(postProjs.map(p => p.id));
          for (const pid of preProjIds) {
            if (!hitProjIds.has(pid) && !postProjIds.has(pid)) {
              this.#eventRecorder.recordProjectileExpired(pid, null);
            }
          }
          // Also check projectiles in the post list that are dead but not in hitProjIds
          for (const p of postProjs) {
            if (!p.alive && !hitProjIds.has(p.id)) {
              this.#eventRecorder.recordProjectileExpired(p.id, null);
            }
          }
          // Restore action context to last command (for subsequent EventBus events)
          if (this.#lastActionContext) {
            this.#eventRecorder.setActionContext(
              this.#lastActionContext.actionId, this.#lastActionContext.actorId,
              this.#lastActionContext.skillId, this.#lastActionContext.commandId
            );
          }
        }

        // Build per-action result map from projectile hits
        const resultByAction = new Map();
        for (const r of results.hits) {
          if (r.actionId) {
            const entry = resultByAction.get(r.actionId) || {
              hit: false, targetId: null, targetName: null, killed: false, damage: 0,
            };
            if (r.hit) entry.hit = true;
            if (r.killed) entry.killed = true;
            if (r.damage) entry.damage = (entry.damage || 0) + (r.damage || 0);
            if (r.targetId) { entry.targetId = r.targetId; entry.targetName = r.targetName; }
            resultByAction.set(r.actionId, entry);
          }
        }

        // Also incorporate projectile-vs-projectile collisions into resultByAction.
        // MELEE projectiles that collide with enemy projectiles count as hits
        // (prevents 挥空 and ensures GAIN_RESOURCE ON_HIT fires).
        for (const c of results.collisions || []) {
          if (!c.flags?.includes('MELEE')) continue;
          if (!c.actionId) continue;
          if (c.ownerId === c.otherOwnerId) continue;
          const entry = resultByAction.get(c.actionId) || {
            hit: false, targetId: null, targetName: null, killed: false, damage: 0,
          };
          entry.hit = true;
          entry.hitProjectile = true;
          resultByAction.set(c.actionId, entry);
          this.#lastHitByActor.set(c.ownerId, true);
        }

        // Finalize pending attack events.
        // When EventRecorder is active, work on #legacyPhaseEvents (not player-facing).
        const attackEvents = this.#eventRecorder ? this.#legacyPhaseEvents : (phaseRecord?.events || []);
        for (const evt of attackEvents) {
          if (evt.type !== 'attack' || evt.result !== 'pending') continue;

          if (evt.actionId) {
            const result = resultByAction.get(evt.actionId);
            if (result) {
              evt.result = result.hit ? 'hit' : 'miss';
              if (result.targetId) { evt.targetId = result.targetId; evt.targetName = result.targetName; }
              if (result.killed) evt.killed = true;
              if (result.damage) evt.damage = result.damage;
              this.#lastHitByActor.set(evt.actorId, result.hit);
            } else {
              evt.result = 'miss';
              this.#lastHitByActor.set(evt.actorId, false);
            }
          } else {
            if (this.#lastHitByActor.has(evt.actorId)) {
              evt.result = this.#lastHitByActor.get(evt.actorId) ? 'hit' : 'miss';
            } else {
              this.#lastHitByActor.set(evt.actorId, false);
              evt.result = 'miss';
            }
          }
        }
      }

      // Dispatch ON_ATTACK_MISSED per-action, and record action_failed for misses.
      const missSourceEvents = this.#eventRecorder ? this.#legacyPhaseEvents : (phaseRecord?.events || []);
      for (const evt of missSourceEvents) {
        if (evt.type !== 'attack') continue;
        if (evt.result !== 'miss') continue;
        const attacker = this.#registry.get(evt.actorId);
        if (attacker) {
          const icon = evt.skillId && SKILLS[evt.skillId]?.type === '射击' ? '🔮' : '⚔';
          this.#logger?.log(`${attacker.name || evt.actorId} ${icon} 挥空`, 's');
        }
        const missCtx = this.#buffManager.dispatch(HookName.ON_ATTACK_MISSED, {
          attackerId: evt.actorId,
          actionId: evt.actionId,
        });
        this._processDeathWindReloads(missCtx);

        // Record action_failed for canonical event stream
        if (this.#eventRecorder && phaseRecord) {
          this.#eventRecorder.recordActionFailed(
            evt.actionId, evt.actorId, evt.skillId, 'miss'
          );
        }
      }
      // Clear legacy events after processing
      this.#legacyPhaseEvents = [];
      this.#projectileAttackers.clear();

      // Now execute deferred ON_HIT GAIN_RESOURCE commands
      for (const cmd of deferredGains) {
        if (this.#phase === TurnPhase.BATTLE_END) break;
        const beforeActor = this.#registry.get(cmd.actorId);
        this._executeCommand(cmd);
        if (phaseRecord) {
          const legacyEvent = this._createResolutionEvent(cmd, spd, this.#legacyPhaseEvents.length, beforeActor);
          if (this.#eventRecorder) {
            this.#legacyPhaseEvents.push(legacyEvent);
          } else {
            phaseRecord.events.push(legacyEvent);
          }
        }
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
      if (phaseRecord) {
        this.#resolutionRecorder?.onPhaseEnd?.(phaseRecord);
      }
    }

    // If battle ended during the speed-tier loop, preserve BATTLE_END phase
    if (this.#phase === TurnPhase.BATTLE_END) {
      this._cleanup();
      this.#eventBus.emit(EvtType.TURN_END, { turn: this.#turnNumber });
      return;
    }

    // --- END OF TURN phase (recorded as structured events) ---
    // Open an end_of_turn phase so delayed gains, buff ticks, etc.
    // are captured as ResolutionEvents.
    // Use the legacy recorder's onPhaseStart so the phase is added to resolution.phases.
    let eotPhaseRecord = null;
    if (this.#resolutionRecorder) {
      eotPhaseRecord = this.#resolutionRecorder.onPhaseStart?.({ speed: null }) || null;
      // Tag the phase as end_of_turn so canonical events record the correct phaseKind
      if (eotPhaseRecord) eotPhaseRecord.phaseKind = 'end_of_turn';
    }
    if (!eotPhaseRecord && this.#eventRecorder) {
      eotPhaseRecord = this.#eventRecorder.startPhase(null, 'end_of_turn', 0);
    }
    if (eotPhaseRecord && this.#eventRecorder) {
      this.#eventRecorder.setCurrentPhaseRecord(eotPhaseRecord);
    }

    // --- EFFECTS ---
    this.#phase = TurnPhase.EFFECTS;
    // Clear action context — EOT events (buff ticks, delayed gains) are not
    // attributed to the last command. Events that SHOULD be attributed to a
    // specific action (e.g. pendingQi from mage_gather) carry sourceActionId
    // in their pendingFlags and restore it temporarily.
    if (this.#eventRecorder) {
      this.#eventRecorder.setActionContext(null, null, null, null);
      this.#lastActionContext = null;
    }
    this._processDelayedCommands();
    this._resolveEndOfTurnEffects();

    // Close the end_of_turn phase
    if (eotPhaseRecord && this.#resolutionRecorder) {
      this.#resolutionRecorder?.onPhaseEnd?.(eotPhaseRecord);
    }

    // --- CLEANUP ---
    this.#phase = TurnPhase.CLEANUP;
    this._cleanup();

    this.#turnNumber++;
    this.#phase = TurnPhase.PLAN;
    this.#actionPointSystem?.resetTurn();
    // Tick skill cooldowns — only pre-existing ones (not cooldowns started this turn)
    if (this.#skillCooldowns && this.#cooldownSnapshot) {
      // Reconstruct the pre-turn cooldown state and tick only those entries
      for (const e of this.#registry.characters()) {
        if (e.alive === false) continue;
        const charId = e.id;
        const preEntries = (this.#cooldownSnapshot.cooldowns || []).find(([cid]) => cid === charId);
        if (!preEntries) continue;
        const preMap = new Map(preEntries[1]);
        for (const [skillId, remaining] of preMap) {
          if (remaining > 0) {
            // Only reduce if the cooldown existed before this turn (not a new one)
            const currentRemaining = this.#skillCooldowns.getRemaining(charId, skillId);
            if (currentRemaining > 0) {
              this.#skillCooldowns.reduceCooldown(charId, skillId, 1);
            }
          }
        }
      }
    }
    this.#cooldownSnapshot = null;

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

    // 余波消费: 仅免费释放时消耗1层 (consumeAftershock flag 由SkillResolver标记)
    if (cmd.skillId === 'mage_small_qi_blast' && cmd.payload?.consumeAftershock) {
      const before = this.#buffManager.getStacks(cmd.actorId, 'AFTERSHOCK');
      if (before > 0) {
        this.#buffManager.consumeStack(cmd.actorId, 'AFTERSHOCK', 1);
        const after = this.#buffManager.getStacks(cmd.actorId, 'AFTERSHOCK');
        const actor = this.#registry.get(cmd.actorId);
        if (after > 0) {
          this.#logger?.log(`${actor?.name || cmd.actorId} 余波消耗1层（剩${after}层）`, 's');
        } else {
          this.#logger?.log(`${actor?.name || cmd.actorId} 余波耗尽`, 's');
        }
      }
    }

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
        case CmdType.WINDSTEP_SLASH:
          this._execWindstepSlash(cmd);
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
        case CmdType.METEOR_DROP:
          this._execMeteorDrop(cmd);
          break;
        default:
          break;
      }

    // Start cooldown + consume limited use — once per actionId, not per command.
    // Skip if this action's resource cost check failed at execution time.
    if (this.#skillCooldowns && !this.#resourceFailed.has(cmd.sequenceId)) {
      const actionKey = cmd.actionId || cmd.sequenceId;
      if (actionKey && !this.#usedActionIds.has(actionKey)) {
        this.#usedActionIds.add(actionKey);
        const execSkill = SKILLS[cmd.skillId];
        if (execSkill?.cooldown) {
          const actor = this.#registry.get(cmd.actorId);
          if (actor) {
            const haste = this._getSkillHaste(actor, cmd.skillId);
            this.#skillCooldowns.startCooldown(cmd.actorId, cmd.skillId, execSkill.cooldown, haste);
          }
        }
        this.#skillCooldowns.consumeUse(cmd.actorId, cmd.skillId);
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
      CmdType.WINDSTEP_SLASH,
    ].includes(cmd.type);
  }

  _isImmediateAttack(cmd) {
    // Only attacks whose result is known at execution time.
    // ATTACK_MELEE / WINDSTEP_SLASH create projectiles for body-contact
    // resolution — they are deferred, not immediate.
    return [
      CmdType.ATTACK_AOE_SELF,
      CmdType.ATTACK_AOE_PATH,
    ].includes(cmd.type);
  }

  _getResolutionEventType(cmd) {
    switch (cmd.type) {
      case CmdType.MOVE_WALK:
      case CmdType.MOVE_TELEPORT:
      case CmdType.MOVE_DASH:
      case CmdType.MOVE_PULL:
      case CmdType.MOVE_GRAPNEL:
      case CmdType.WINDSTEP_SLASH:
        return 'move';
      case CmdType.ATTACK_MELEE:
      case CmdType.ATTACK_PROJECTILE:
      case CmdType.ATTACK_AOE_SELF:
      case CmdType.ATTACK_AOE_PATH:
      case CmdType.ATTACK_AOE_TARGET:
      case CmdType.SPAWN_STATIONARY_AOE:
        return 'attack';
      case CmdType.GAIN_RESOURCE:
      case CmdType.CONSUME_RESOURCE:
        return 'resource';
      case CmdType.APPLY_STATUS:
      case CmdType.REMOVE_STATUS:
        return 'status';
      case CmdType.CREATE_GATE:
      case CmdType.CREATE_FORMATION:
      case CmdType.BREAK_FORMATION:
      case CmdType.DROP_SUPPLY_CRATE:
      case CmdType.DELAYED_SKILL:
      case CmdType.GALAXY_SUBTURN:
      case CmdType.MARROW_UPGRADE:
      case CmdType.MULTI_CAST:
      case CmdType.PASS:
        return 'utility';
      default:
        return 'command';
    }
  }

  _createResolutionEvent(cmd, speed, index, beforeActor) {
    const afterActor = this.#registry.get(cmd.actorId);
    const actionId = cmd.actionId || cmd.sequenceId || cmd.id || null;
    const legacyType = this._getResolutionEventType(cmd);
    const event = {
      id: cmd.sequenceId ? `${cmd.sequenceId}:${index}` : `${this.#turnNumber}-${speed}-${index}-${cmd.type}-${cmd.actorId || 'system'}`,
      actionId,
      eventType: this._mapLegacyTypeToEventType(legacyType, cmd),
      type: legacyType,  // legacy compatibility
      actorId: cmd.actorId || null,
      skillId: cmd.skillId || null,
      speed,
    };

    if (cmd.targetPos) {
      event.targetPos = { q: cmd.targetPos.q, r: cmd.targetPos.r };
    }

    if (legacyType === 'move') {
      event.eventType = 'character_moved';
      const beforePos = beforeActor?.position;
      const afterPos = afterActor?.position;
      if (beforePos) event.from = { q: beforePos.q, r: beforePos.r };
      if (afterPos) event.to = { q: afterPos.q, r: afterPos.r };
      if (!event.to && event.targetPos) event.to = { ...event.targetPos };
    }

    if (legacyType === 'attack') {
      // Capture target info from the registry at event creation time
      if (cmd.targetPos) {
        const targetChar = this.#registry.characters().find(
          c => c.position.q === cmd.targetPos.q && c.position.r === cmd.targetPos.r && c.alive !== false
        );
        if (targetChar) {
          event.targetId = targetChar.id;
          event.targetName = targetChar.name || targetChar.id;
        }
      }

      // Deferred attacks — hit result depends on projectile/body-contact resolution
      const isDeferred = cmd.type === CmdType.ATTACK_MELEE ||
        cmd.type === CmdType.ATTACK_PROJECTILE ||
        cmd.type === CmdType.ATTACK_AOE_TARGET;
      if (isDeferred) {
        event.result = 'pending';
      } else {
        event.result = this.#lastHitByActor.has(cmd.actorId)
          ? (this.#lastHitByActor.get(cmd.actorId) ? 'hit' : 'miss')
          : 'pending';
      }
    }

    if (legacyType === 'resource') {
      // Do NOT auto-promote to resource_changed — these legacy events lack delta.
      // The EventBus RESOURCE_CHANGED → resource_changed events (from the
      // ResolutionEventRecorder) have correct signed delta and take precedence.
      event.eventType = null;
      event.resource = cmd.payload?.resource || null;
      event.amount = cmd.payload?.amount ?? null;
      event.condition = cmd.payload?.condition || null;
    }

    return event;
  }

  /** Map legacy coarse type to canonical ResolutionEventType. */
  _mapLegacyTypeToEventType(legacyType, _cmd) {
    switch (legacyType) {
      case 'move': return 'character_moved';
      case 'resource': return 'resource_changed';
      case 'status': return 'status_applied';
      // 'attack' and 'utility' don't map 1:1 — set by finalizer or recorder
      default: return null;
    }
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
    this.#resourceSystem.recordCostGain(cmd.actorId, resource, finalAmount);
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

    // 小气功波: paying cost grants 2 余波 stacks (上限2)
    if (cmd.skillId === 'mage_small_qi_blast' && cmd.payload.resource === 'qi') {
      const inst = this.#buffManager.addStack(cmd.actorId, 'AFTERSHOCK', 2, 2, -1, cmd.actorId);
      const total = inst?.data?.stacks || 0;
      const actor = this.#registry.get(cmd.actorId);
      this.#logger?.log(`${actor?.name || cmd.actorId} 余波 +2（共${total}层）`, 's');
    }
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
      if (!this._canAttackAffect(actor, e)) continue;
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
      this.#logger?.log(`${actor?.name || cmd.actorId} ⚔ 距离过远，挥空`, 's');
      return;
    }

    // Resolve power (with hook for Jimmy marrow etc.)
    let power = typeof cmd.payload.power === 'number'
      ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
      : cmd.payload.power;

    // Consume INDRA_BLADE for 居合斩 (cost already reduced to 0 by SkillResolver)
    if (this.#buffManager.hasStatus(cmd.actorId, 'INDRA_BLADE')) {
      this.#buffManager.removeByType(cmd.actorId, 'INDRA_BLADE');
      this.#logger?.log(`${actor?.name || cmd.actorId} 引刀解放！居合斩`, 'rg');
    }

    // Create melee projectile — handles same-hex and ranged via body-contact system
    if (this.#projectileCalculator) {
      const effectiveSpeed = cmd.subSpeed ?? 1;
      const flags = forceHit ? ['MELEE', 'SURE_HIT'] : ['MELEE'];
      const actionId = cmd.actionId || cmd.sequenceId || null;
      const proj = this.#projectileCalculator.createProjectile(
        cmd.actorId, originQ, originR, targetQ, targetR, power, effectiveSpeed, flags, actionId
      );
      if (proj && this.#eventRecorder) {
        this.#eventRecorder.recordProjectileCreated(
          proj.id, cmd.actorId, cmd.skillId, actionId,
          { q: originQ, r: originR }, { q: targetQ, r: targetR }, power, effectiveSpeed
        );
      }
    }

    // lastHitByActor will be set on body contact via projectile resolution
    this.#logger?.log(`${actor?.name || cmd.actorId} ⚔ 斩击！威${power}`, 'rg');
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
      if (!this._canAttackAffect(actor, e)) continue;
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
      const actionId = cmd.actionId || cmd.sequenceId || null;
      const proj = this.#projectileCalculator.createProjectile(cmd.actorId, fromQ, fromR, toQ, toR, power, effectiveSpeed, cmd.payload.flags || [], actionId);
      if (proj && this.#eventRecorder) {
        this.#eventRecorder.recordProjectileCreated(
          proj.id, cmd.actorId, cmd.skillId, actionId,
          { q: fromQ, r: fromR }, { q: toQ, r: toR }, power, effectiveSpeed
        );
      }
    }

    // lastHitByActor will be set on body contact via projectile resolution
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
      if (!this._canAttackAffect(actor, e)) continue;
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
      const actionId = cmd.actionId || cmd.sequenceId || null;
      const proj = this.#projectileCalculator.createProjectile(cmd.actorId, fromQ, fromR, toQ, toR, power, effectiveSpeed, [aoeFlag], actionId);
      if (proj && this.#eventRecorder) {
        this.#eventRecorder.recordProjectileCreated(
          proj.id, cmd.actorId, cmd.skillId, actionId,
          { q: fromQ, r: fromR }, { q: toQ, r: toR }, power, effectiveSpeed
        );
      }
    }

    // lastHitByActor will be set on body contact via projectile resolution
    this.#logger?.log(`${actor?.name || cmd.actorId} 💥 目标AOE！威${power} 半径${radius}`, 'rg');
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
      if (!this._canAttackAffect(actor, e)) continue;
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
        const actionId = cmd.actionId || cmd.sequenceId || null;
        const proj = this.#projectileCalculator.createProjectile(
          cmd.actorId, hq, hr, hq, hr, power, speed, ['STATIONARY'], actionId
        );
        if (proj && this.#eventRecorder) {
          this.#eventRecorder.recordProjectileCreated(
            proj.id, cmd.actorId, cmd.skillId, actionId,
            { q: hq, r: hr }, { q: hq, r: hr }, power, speed
          );
        }
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
        if (!this._canAttackAffect(actor, e)) continue;
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
    const actor = this.#registry.get(cmd.actorId);
    const targetRef = cmd.payload.targetRef || 'SELF';
    let targetId = cmd.actorId;

    if (targetRef === 'TARGET' && cmd.targetPos) {
      const entities = this.#registry.getAt(cmd.targetPos.q, cmd.targetPos.r);
      const targetChar = entities.find(e =>
        e.type === 'CHARACTER' &&
        e.alive !== false &&
        this._canAttackAffect(actor, e)
      );
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

  _execMeteorDrop(cmd) {
    const actor = this.#registry.get(cmd.actorId);
    if (!actor || actor.alive === false) return;

    // Read target position from METEOR_ASCENDING buff data
    const buffs = this.#buffManager.getActiveBuffs(cmd.actorId);
    const meteor = buffs.find(b => b.statusType === 'METEOR_ASCENDING');
    if (!meteor || meteor.data.targetQ == null || meteor.data.targetR == null) return;

    const targetQ = meteor.data.targetQ;
    const targetR = meteor.data.targetR;
    const fromQ = actor.position.q;
    const fromR = actor.position.r;

    const from = { q: fromQ, r: fromR };
    const to = { q: targetQ, r: targetR };

    this.#registry.updatePosition(cmd.actorId, fromQ, fromR, targetQ, targetR);

    this.#eventBus.emit(EvtType.MOVEMENT_COMPLETE, {
      entityId: cmd.actorId,
      from,
      to,
    });

    this.#logger?.log('☄ 大荒星陨！降临', 'die');

    // 1-radius AOE damage
    let hit = false;
    for (const other of this.#registry.characters()) {
      if (other.id === cmd.actorId || other.alive === false) continue;
      if (!this._canAttackAffect(actor, other)) continue;
      if (hexDistance(targetQ, targetR, other.position.q, other.position.r) <= 1) {
        const result = this.#damageCalculator.resolve(cmd.actorId, other.id, 700, 'PHYSICAL');
        if (result.killed || result.finalDamage > 0) hit = true;
      }
    }

    // Remove the buff and mark for hit tracking
    this.#buffManager.removeByType(cmd.actorId, 'METEOR_ASCENDING');
    this.#lastHitByActor.set(cmd.actorId, hit);
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
        // Save source actionId + skillId so EOT qi gain is attributed to the correct action
        if (this.#lastActionContext?.actionId) {
          this.#pendingFlags.get(cmd.actorId)._pendingQiSourceActionId = this.#lastActionContext.actionId;
          if (this.#lastActionContext.skillId) {
            this.#pendingFlags.get(cmd.actorId)._pendingQiSourceSkillId = this.#lastActionContext.skillId;
          }
        }
      }
      // Save action context for pendingRage so EOT rage gain is attributed to the correct action
      if (cmd.payload.flag === 'pendingRage') {
        if (this.#lastActionContext?.actionId) {
          this.#pendingFlags.get(cmd.actorId)._pendingRageSourceActionId = this.#lastActionContext.actionId;
          if (this.#lastActionContext.skillId) {
            this.#pendingFlags.get(cmd.actorId)._pendingRageSourceSkillId = this.#lastActionContext.skillId;
          }
        }
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
      if (e.type === 'CHARACTER' && e.alive !== false && this._canAttackAffect(actor, e)) {
        // Cancel target's pending commands at slower speed tiers (interrupt)
        this.#commandQueue.cancelByActor(e.id, cmd.speed);
        // Also cancel from current turn's speed groups (already built before tier loop)
        if (this.#speedGroups) {
          for (const spd of [0, 1, 2]) {
            if (spd >= cmd.speed) continue;
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
    // 大荒星陨 is now resolved at speed 2 via _execMeteorDrop (METEOR_DROP command).
    // Other turn-start effects remain here.
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
          if (target.type === 'CHARACTER' && target.alive !== false && this._canAttackAffect(e, target)) {
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
            if (other.type === 'CHARACTER' && other.alive !== false && this._canAttackAffect(e, other)) {
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
          const projResults = this.#projectileCalculator.resolveStep(2, this.#registry, this.#damageCalculator, this.#buffManager, { rules: this._getRules() });
          for (const r of projResults.hits) { if (r.hit) this.#lastHitByActor.set(r.ownerId, true); }
          for (const r of projResults.interceptions) { if (r.intercepted && r.interceptorId) this.#lastHitByActor.set(r.interceptorId, true); }

          // Dispatch ON_ATTACK_MISSED for galaxy projectile attackers.
          // Actor-level check is safe here: galaxy subturns are single-character,
          // so same-actor multi-attack attribution is not applicable.
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
          // Restore source action context so qi gain is attributed to the right action
          const srcActionId = flags._pendingQiSourceActionId || null;
          const srcSkillId = flags._pendingQiSourceSkillId || null;
          if (this.#eventRecorder && srcActionId) {
            this.#eventRecorder.setActionContext(srcActionId, entityId, srcSkillId, null);
          }
          const ctx = this.#buffManager.dispatch(HookName.ON_RESOURCE_GAIN, {
            entityId, resource: 'qi', amount: 1,
          });
          const finalAmount = ctx?.amount ?? 1;
          this.#resourceSystem.add(entityId, 'qi', finalAmount);
          // Clear context again after recording
          if (this.#eventRecorder && srcActionId) {
            this.#eventRecorder.setActionContext(null, null, null, null);
          }
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

      // 盛怒 resolution: pendingRage → if not hit this turn, gain 2 rage; if hit, cancel
      if (flags.pendingRage) {
        const wasHit = this.#hitEntities.has(entityId);
        if (!wasHit) {
          const srcActionId = flags._pendingRageSourceActionId || null;
          const srcSkillId = flags._pendingRageSourceSkillId || null;
          if (this.#eventRecorder && srcActionId) {
            this.#eventRecorder.setActionContext(srcActionId, entityId, srcSkillId, null);
          }
          const ctx = this.#buffManager.dispatch(HookName.ON_RESOURCE_GAIN, {
            entityId, resource: 'rage', amount: 2,
          });
          const finalAmount = ctx?.amount ?? 2;
          this.#resourceSystem.add(entityId, 'rage', finalAmount);
          this.#resourceSystem.recordCostGain(entityId, 'rage', finalAmount);
          if (this.#eventRecorder && srcActionId) {
            this.#eventRecorder.setActionContext(null, null, null, null);
          }
          this.#logger?.log(`🔥 盛怒成功 +${finalAmount}怒`, 'rage');
        } else {
          this.#logger?.log('🔥 盛怒被打断，未获怒气', 'sh');
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
    // Clear per-turn cost gain tracking
    this.#resourceSystem.clearTurnCostGains();
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
    // Refresh 心眼 weak points each turn
    this._applyMindsEyeWeakPoints();
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

  _execWindstepSlash(cmd) {
    if (!cmd.targetPos) return;
    const actor = this.#registry.get(cmd.actorId);
    if (!actor) return;
    const toQ = cmd.targetPos.q, toR = cmd.targetPos.r;
    if (!isOnBoard(toQ, toR)) return;

    // Move to target
    const fromQ = actor.position.q, fromR = actor.position.r;
    this.#registry.updatePosition(actor.id, fromQ, fromR, toQ, toR);

    // Find nearest target within radius 1: characters first, then projectiles
    const power = typeof cmd.payload.power === 'number'
      ? this.#buffManager.getEffectivePower(cmd.actorId, cmd.payload.power)
      : (cmd.payload.power || 100);
    const radius = cmd.payload.radius || 1;

    let bestTarget = null;
    let bestDist = Infinity;
    let bestIsChar = false;

    // Priority 1: enemy characters
    for (const e of this.#registry.characters()) {
      if (e.alive === false || e.id === cmd.actorId) continue;
      if (!this._canAttackAffect(actor, e)) continue;
      const d = hexDistance(toQ, toR, e.position.q, e.position.r);
      if (d <= radius && d < bestDist) {
        bestDist = d; bestTarget = e; bestIsChar = true;
      }
    }
    // Priority 2: enemy projectiles
    if (!bestTarget && this.#projectileCalculator) {
      const projs = this.#projectileCalculator.getProjectiles?.() || [];
      for (const p of projs) {
        const owner = this.#registry.get(p.ownerId);
        if (!p.alive || !owner || !this._canAttackAffect(actor, owner, 'enemyOnly')) continue;
        const pq = p.path?.[p.stepIndex]?.[0] ?? p.fromQ;
        const pr = p.path?.[p.stepIndex]?.[1] ?? p.fromR;
        const d = hexDistance(toQ, toR, pq, pr);
        if (d <= radius && d < bestDist) {
          bestDist = d; bestTarget = p; bestIsChar = false;
        }
      }
    }

    if (bestTarget && bestIsChar) {
      // Fire melee projectile from post-teleport position — goes through body-contact
      // system so 纳刀 interception and 心眼 direction check work correctly
      this.#lastHitByActor.set(cmd.actorId, false); // determined on body contact
      const actionId = cmd.actionId || cmd.sequenceId || null;
      this.#projectileCalculator?.createProjectile(
        cmd.actorId, toQ, toR, bestTarget.position.q, bestTarget.position.r,
        power, 1, ['MELEE'], actionId
      );
      const skillName = SKILLS[cmd.skillId]?.name || '风步';
      this.#logger?.log(`${actor?.name || cmd.actorId} ${skillName}(${toQ},${toR})→${bestTarget.name || '?'} 威${power}`, 'rg');
    } else if (bestTarget && !bestIsChar) {
      const iPq = bestTarget.path?.[bestTarget.stepIndex]?.[0] ?? bestTarget.fromQ;
      const iPr = bestTarget.path?.[bestTarget.stepIndex]?.[1] ?? bestTarget.fromR;
      const intercepted = this.#projectileCalculator?.interceptAt?.(iPq, iPr, power);
      if (intercepted) {
        this.#logger?.log(`${actor?.name || cmd.actorId} ${SKILLS[cmd.skillId]?.name || '风步'}斩破弹体(${iPq},${iPr}) 威${power}`, 'rg');
      } else {
        this.#logger?.log(`${actor?.name || cmd.actorId} ${SKILLS[cmd.skillId]?.name || '风步'}削弱弹体(${iPq},${iPr}) -${power}`, 'rg');
      }
    } else {
      this.#logger?.log(`${actor?.name || cmd.actorId} ${SKILLS[cmd.skillId]?.name || '风步'}位移(${fromQ},${fromR})→(${toQ},${toR}) 无目标`, 'mv');
    }
  }

  // 心眼 weak point: triggered by any damage event (melee, projectile, AOE, windstep)
  _checkMindsEyeOnDamage(attackerId, targetId) {
    const attacker = this.#registry.get(attackerId);
    const target = this.#registry.get(targetId);
    if (!attacker || !target) return;
    const fromQ = attacker.position.q, fromR = attacker.position.r;
    const toQ = target.position.q, toR = target.position.r;
    this._checkMindsEyeHit(attackerId, targetId, fromQ, fromR, toQ, toR);
  }

  // 心眼 weak point: check if hit direction matches, apply bonuses
  _checkMindsEyeHit(attackerId, targetId, fromQ, fromR, toQ, toR) {
    const attacker = this.#registry.get(attackerId);
    if (!attacker || !this._hasTraitInLoadout(attacker, 'trait_duelist_minds_eye')) return;
    // Get weak point directions on target
    const target = this.#registry.get(targetId);
    if (!target) return;
    const wpBuffs = this.#buffManager.getActiveBuffs(targetId);
    const wp = wpBuffs.find(b => b.statusType === 'WEAK_POINT');
    if (!wp || !wp.data?.directions) return;
    // Determine which hex direction from target the attacker hit from
    const dirs = [[1,0],[1,-1],[0,-1],[-1,0],[-1,1],[0,1]];
    const dq = fromQ - target.position.q, dr = fromR - target.position.r;
    let hitDirIdx = -1;
    if (dq === 0 && dr === 0) {
      // Same hex: hits all directions — weak point triggers from any marked direction
      hitDirIdx = wp.data.directions[0];
    } else {
      hitDirIdx = dirs.findIndex(([ddq, ddr]) => dq === ddq && dr === ddr);
    }
    if (hitDirIdx < 0 || !wp.data.directions.includes(hitDirIdx)) return;
    // Weak point hit!
    this.#resourceSystem.add(attackerId, 'rage', 1);
    this.#logger?.log(`${attacker?.name || attackerId} 心眼弱点击破→${target?.name || targetId} +1怒`, 'rg');
    // Reduce 逐风步 cooldown by 1
    this.#skillCooldowns?.reduceCooldown(attackerId, 'role_duelist_windstep', 1);
    this.#logger?.log(`${attacker?.name || attackerId} 逐风步 CD-1`, 'rg');
    // Remove hit direction immediately, restore at start of next-next turn
    wp.data.directions = wp.data.directions.filter(d => d !== hitDirIdx);
    if (!wp.data.pendingRefresh) wp.data.pendingRefresh = {};
    wp.data.pendingRefresh[hitDirIdx] = 2;
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
    const aliveTeamIds = getAliveTeamIds(this.#registry);
    if (aliveTeamIds.length <= 1) {
      this.#phase = TurnPhase.BATTLE_END;
      const winner = aliveTeamIds[0] || 'draw';
      const rules = this._getRules();
      this.#eventBus.emit(EvtType.BATTLE_END, { winner, winnerTeamId: winner, suppressGameOver: Boolean(rules.suppressGameOverPanel) });
      if (!rules.suppressGameOverPanel) {
        this.#logger?.log('\n⚡ 战斗结束！胜者: ' + winner, 'die');
      }
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

    // ── Check cooldown / limited uses BEFORE consuming action points ──
    const skill = SKILLS[skillId];
    if (this.#skillCooldowns) {
      if (skill?.cooldown && !this.#skillCooldowns.isReady(characterId, skillId)) {
        return { success: false, error: 'skill_on_cooldown' };
      }
      if (this.#skillCooldowns.isExhausted(characterId, skillId)) {
        return { success: false, error: 'skill_exhausted' };
      }
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

    const actionId = finalSequence.id || `action_${this.#turnNumber}_${characterId}_${Date.now()}`;
    finalSequence.actionId = actionId;
    for (const cmd of finalSequence.commands) {
      cmd.actionId = actionId;
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

  // Test-only: resolve + enqueue without action-point validation.
  // Used by __resolutionTest.forceSubmitAction for same-actor multi-attack tests.
  forceSubmitForTest(characterId, skillId, targetPos) {
    if (!this.#skillResolver) return { success: false, error: 'no_skill_resolver' };
    const result = this.#skillResolver.resolve(skillId, characterId, targetPos ?? null);
    if (!result.success) return result;
    // Use the same enqueue path as submitAction
    this.#commandQueue.enqueueSequence(result.sequence);
    this.#submittedChars.add(characterId);
    // Apply cooldown if the skill has one (action-level, once per submit)
    const skill = SKILLS[skillId];
    if (skill?.cooldown && this.#skillCooldowns) {
      const actor = this.#registry.get(characterId);
      const haste = actor ? this._getSkillHaste(actor, skillId) : 0;
      this.#skillCooldowns.startCooldown(characterId, skillId, skill.cooldown, haste);
    }
    if (skill?.maxUses && this.#skillCooldowns) {
      this.#skillCooldowns.consumeUse(characterId, skillId);
    }
    return { success: true, sequence: result.sequence };
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
    this._applyMindsEyeWeakPoints();
  }

  // Apply 心眼 weak points to all enemies of duelist characters
  _applyMindsEyeWeakPoints() {
    const duelists = [...this.#registry.characters()].filter(c =>
      c.alive !== false && this._hasTraitInLoadout(c, 'trait_duelist_minds_eye')
    );
    if (duelists.length === 0) return;
    const allDirs = [0, 1, 2, 3, 4, 5];
    for (const enemy of this.#registry.characters()) {
      if (enemy.alive === false) continue;
      if (!duelists.some(d => this._canAttackAffect(d, enemy, 'enemyOnly'))) continue;
      // Apply or refresh weak points
      if (!this.#buffManager.hasStatus(enemy.id, 'WEAK_POINT')) {
        const shuffled = [...allDirs].sort(() => Math.random() - 0.5);
        this.#buffManager.apply(enemy.id, 'WEAK_POINT', -1, enemy.id, { directions: shuffled.slice(0, 2) });
      }
      // Process delayed weak point restorations
      const wpBuffs2 = this.#buffManager.getActiveBuffs(enemy.id);
      const wpEntry = wpBuffs2.find(b => b.statusType === 'WEAK_POINT');
      if (wpEntry?.data?.pendingRefresh) {
        const refresh = wpEntry.data.pendingRefresh;
        for (const dirStr of Object.keys(refresh)) {
          refresh[dirStr]--;
          if (refresh[dirStr] <= 0) {
            const candidates = allDirs.filter(d => !wpEntry.data.directions.includes(d));
            if (candidates.length > 0) {
              const newDir = candidates[Math.floor(Math.random() * candidates.length)];
              wpEntry.data.directions.push(newDir);
            }
            delete refresh[dirStr];
          }
        }
        if (Object.keys(refresh).length === 0) delete wpEntry.data.pendingRefresh;
      }
    }
  }

  reset() {
    this.#turnNumber = 1;
    this.#phase = TurnPhase.PLAN;
    this.#resolutionRecorder = null;
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
