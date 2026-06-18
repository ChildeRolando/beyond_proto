// ResolutionEventRecorder — listens to EventBus domain events during turn
// execution and converts them into structured ResolutionEvents.
//
// Pure recorder — does NOT mutate combat state, does NOT render text.
// Compatible with the existing #resolutionRecorder callback interface
// used by TurnResolutionBuilder.

import { EvtType } from '../CommandTypes.js';
import { ResolutionEventType, normalizeResolutionEvent, assertResolutionEvent } from './ResolutionEventTypes.js';

let _eventIdCounter = 0;
function nextEventId() { return `rev-${++_eventIdCounter}`; }

export class ResolutionEventRecorder {
  #eventBus = null;
  #listenerIds = [];
  #currentPhase = null;
  #currentTurn = 1;
  #actionContext = null;       // { actionId, actorId, skillId, commandId }
  #phases = [];
  #enabled = false;
  #registry = null;            // optional: for actor name lookups
  #declaredActionIds = new Set(); // dedup: one action_declared per actionId per turn
  #projectileTable = new Map();

  constructor(eventBus, registry = null) {
    this.#eventBus = eventBus;
    this.#registry = registry;
  }

  // ─── Public API (compatible with existing recorder interface) ───

  /** Start recording a new turn. */
  startTurn(turnNumber) {
    this.#currentTurn = turnNumber || 1;
    this.#phases = [];
    this.#actionContext = null;
    this.#currentPhase = null;
    this.#declaredActionIds = new Set();
    this.#projectileTable = new Map();
    this._attachListeners();
    this.#enabled = true;
  }

  /** Start a new speed phase. Returns the phase object (compat with onPhaseStart). */
  startPhase(speed, kind = 'speed', commandCount = 0) {
    const phase = {
      speed: speed ?? null,
      phaseKind: kind,
      commandCount,
      events: [],
      summary: '',
      actionCount: 0,
      actions: [],
      beforeSnapshot: null,
      afterSnapshot: null,
    };
    this.#phases.push(phase);
    this.#currentPhase = phase;
    return phase;
  }

  /** Set an externally-managed phase as the current event target. */
  setCurrentPhaseRecord(phaseRecord) {
    this.#currentPhase = phaseRecord;
  }

  /** Set the current action context so recorded events reference it. */
  setActionContext(actionId, actorId, skillId, commandId) {
    this.#actionContext = { actionId, actorId, skillId, commandId };
  }

  /** Record an action_declared event for a submitted action. Deduped by actionId. */
  recordActionDeclared(actorId, skillId, actionId, targetPos, skillName) {
    if (!this.#currentPhase) return null;
    // Dedup: one action_declared per actionId per turn
    if (actionId && this.#declaredActionIds.has(actionId)) return null;
    if (actionId) this.#declaredActionIds.add(actionId);

    const actor = this.#registry?.get?.(actorId);
    return this.record({
      id: nextEventId(),
      eventType: ResolutionEventType.ACTION_DECLARED,
      actionId,
      actorId,
      skillId,
      targetPos: targetPos || null,
      actorName: actor?.name || null,
      actorOwnerId: actor?.ownerId || null,
      actorClass: actor?.class || null,
      actorRoleId: actor?.roleId || null,
      actorIcon: actor?.icon || actor?.avatar || actor?.portrait || null,
      skillName: skillName || null,
    });
  }

  /** Record an action_failed event (e.g., miss). */
  recordActionFailed(actionId, actorId, skillId, reason) {
    if (!this.#currentPhase) return null;
    return this.record({
      id: nextEventId(),
      eventType: ResolutionEventType.ACTION_FAILED,
      actionId,
      actorId,
      skillId,
      result: 'miss',
      reason: reason || 'miss',
    });
  }

  /** Record a projectile_created event with full domain metadata. */
  recordProjectileCreated(projectileId, actorId, skillId, actionId, fromPos, toPos, power, speed, metadata = null) {
    if (!this.#currentPhase) return null;
    const meta = metadata || {};
    const flags = meta.flags || [];
    const isMelee = flags.includes('MELEE');
    const projectileType = flags.includes('MELEE') ? 'melee'
      : flags.includes('STATIONARY') ? 'stationary'
      : flags.includes('AOE_RADIUS_1') ? 'aoe'
      : 'projectile';
    // Convert path from [[q,r],...] to [{q,r},...]
    const path = (meta.path || []).map(p => (Array.isArray(p) ? { q: p[0], r: p[1] } : p));
    this.#projectileTable.set(projectileId, {
      projectileId,
      actionId: actionId || null,
      actorId: actorId || null,
      from: fromPos || null,
      intendedTo: toPos || null,
      status: 'flying',
      actualEnd: null,
      endReason: null,
      collidedWith: null,
      startTime: {
        turnNumber: this.#currentTurn,
        phaseSpeed: this.#currentPhase?.speed ?? null,
        phaseKind: this.#currentPhase?.phaseKind ?? 'speed',
      },
      endTime: null,
    });
    return this.record({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_CREATED,
      actionId,
      actorId,
      skillId,
      projectileId,
      from: fromPos || null,
      to: toPos || null,
      basePower: power ?? null,
      projectileType,
      metadata: {
        path,
        flags,
        speed: meta.speed ?? speed ?? null,
        isMelee,
        projectileType,
      },
    });
  }

  /** Record a projectile_collided event (body contact or AOE explosion). */
  recordProjectileCollided(projectileId, targetId, targetPos, damage, actionId = null, metadata = null) {
    if (!this.#currentPhase) return null;
    const targetChar = targetId ? this.#registry?.get?.(targetId) : null;
    const meta = metadata || {};
    this._updateProjectileLifecycleFromCollision(projectileId, targetId, targetPos, actionId, meta);
    return this.record({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_COLLIDED,
      actionId: actionId ?? meta.actionId ?? null,
      projectileId,
      targetId,
      targetPos: targetPos || null,
      targetName: targetChar?.name || null,
      finalDamage: damage ?? null,
      metadata: {
        hitType: meta.hitType || 'body_contact',
        contactPos: meta.contactPos || (targetPos ? { q: targetPos.q, r: targetPos.r } : null),
        isMelee: meta.isMelee || false,
        flags: meta.flags || [],
        ownerId: meta.ownerId || null,
      },
    });
  }

  /** Record a projectile_expired event (disappeared without hitting).
   *  Movement is derived from projectile_created.metadata.path.
   */
  recordProjectileExpired(projectileId, reason, metadata = null) {
    if (!this.#currentPhase) return null;
    const meta = metadata || {};
    const entry = this._ensureProjectileLifecycle(projectileId);
    entry.status = 'expired';
    entry.actualEnd = meta.lastPos || entry.actualEnd || entry.intendedTo || null;
    entry.endReason = 'expired';
    entry.endTime = this._makeLifecycleTime();
    return this.record({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_EXPIRED,
      projectileId,
      reason: reason || 'unknown',
      metadata: {
        lastPos: meta.lastPos || null,
      },
    });
  }

  /** Record a projectile_intercepted event (buff-based, e.g. 纳刀). */
  recordProjectileIntercepted(projectileId, interceptorId, interceptPower, metadata = null) {
    if (!this.#currentPhase) return null;
    const meta = metadata || {};
    const entry = this._ensureProjectileLifecycle(projectileId);
    entry.status = 'intercepted';
    entry.actualEnd = meta.contactPos || entry.actualEnd || null;
    entry.endReason = 'intercepted';
    entry.collidedWith = interceptorId || null;
    entry.endTime = this._makeLifecycleTime();
    return this.record({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_INTERCEPTED,
      projectileId,
      targetId: interceptorId,
      basePower: interceptPower ?? null,
      metadata: {
        interceptPower: interceptPower ?? null,
        projectilePower: meta.projectilePower ?? null,
        interceptType: meta.interceptType || 'buff_intercept',
      },
    });
  }

  /** Manually record a pre-built event. Must have a legal eventType. */
  record(event) {
    if (!this.#currentPhase) return null;
    const normalized = normalizeResolutionEvent({
      ...event,
      turnNumber: event.turnNumber ?? this.#currentTurn,
      phaseSpeed: event.phaseSpeed ?? this.#currentPhase?.speed ?? null,
      phaseKind: event.phaseKind ?? this.#currentPhase?.phaseKind ?? 'speed',
    });
    // Enforce canonical eventType — illegal events must not enter phase.events
    assertResolutionEvent(normalized);
    this.#currentPhase.events.push(normalized);
    return normalized;
  }

  /** End the current phase. */
  endPhase(phase) {
    // no-op for now — finalization happens in finalize()
  }

  /** Stop recording and return the resolution object. */
  finalize({ initialSnapshot = null, finalSnapshot = null } = {}) {
    this.#enabled = false;
    this._detachListeners();
    this.#actionContext = null;
    this.#currentPhase = null;

    const phases = this.#phases.filter(p => p.events.length > 0);

    return {
      schemaVersion: 2,
      turnNumber: this.#currentTurn,
      phases,
      projectileResolutionFacts: this.buildProjectileResolutionFacts(),
      initialSnapshot,
      finalSnapshot,
    };
  }

  /** Cleanup — detach all listeners. */
  dispose() {
    this._detachListeners();
    this.#enabled = false;
  }

  reset() {
    this._detachListeners();
    this.#phases = [];
    this.#currentPhase = null;
    this.#actionContext = null;
    this.#currentTurn = 1;
    this.#enabled = false;
    this.#declaredActionIds = new Set();
    this.#projectileTable = new Map();
    _eventIdCounter = 0;
  }

  buildProjectileResolutionFacts() {
    return [...this.#projectileTable.values()].map(entry => ({
      projectileId: entry.projectileId,
      from: entry.from || null,
      intendedTo: entry.intendedTo || null,
      actualEnd: entry.actualEnd || entry.intendedTo || null,
      endReason: entry.endReason || null,
      collidedWith: entry.collidedWith || null,
      actionId: entry.actionId || null,
      actorId: entry.actorId || null,
      status: entry.status || 'flying',
      startTime: entry.startTime || null,
      endTime: entry.endTime || null,
    }));
  }

  // ─── EventBus → ResolutionEvent mapping ───

  _attachListeners() {
    this._detachListeners();

    const on = (evtType, handler) => {
      const id = this.#eventBus.on(evtType, handler, 100); // low priority = after engine handlers
      this.#listenerIds.push({ evtType, id });
    };

    // RESOURCE_CHANGED → resource_changed
    on(EvtType.RESOURCE_CHANGED, (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      // hp is not a legal resource in this game — reject
      if (data.resource === 'hp') return;
      // Look up character position so compileResourceChanged can produce gather clip
      const char = this.#registry?.get(data.entityId);
      const targetPos = char?.position ? { q: char.position.q, r: char.position.r } : null;
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.RESOURCE_CHANGED,
        actionId: this.#actionContext?.actionId || null,
        actorId: data.entityId,
        skillId: this.#actionContext?.skillId || null,
        subjectId: data.entityId,
        targetPos,
        resource: data.resource,
        delta: data.delta ?? null,
        oldValue: data.old ?? null,
        newValue: data.new ?? null,
        reason: data.reason || null,
      });
    });

    // DAMAGE_DEALT → damage_applied
    // Skip when actionId is null — damage is already recorded from projectile hit results
    // with the correct actionId (EventBus lacks action context during projectile resolution).
    on(EvtType.DAMAGE_DEALT, (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      if (!this.#actionContext?.actionId) return; // skip duplicate (recorded from projectile results)
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.DAMAGE_APPLIED,
        actionId: this.#actionContext.actionId,
        actorId: data.sourceId,
        targetId: data.targetId,
        basePower: data.basePower ?? null,
        finalDamage: data.finalDamage ?? null,
        result: data.killed ? 'killed' : 'hit',
        reason: data.preventedByBuff ? 'prevented_by_buff' : null,
      });
    });

    // SHIELD_ABSORBED / RAGE_MITIGATED / BLOCK_TRIGGERED / FORMATION_ABSORBED → damage_absorbed
    // These are the single canonical source — DAMAGE_DEALT.breakdown is NOT used for
    // absorption because it only fires with active actionContext (missing projectile damage).
    const absorbHandler = (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      const targetId = data.entityId || data.targetId;
      const targetChar = this.#registry?.get?.(targetId);
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.DAMAGE_ABSORBED,
        actionId: this.#actionContext?.actionId || null,
        targetId,
        targetName: targetChar?.name || null,
        layer: data._layer || null,
        absorbed: data.absorbed ?? null,
      });
    };
    on(EvtType.SHIELD_ABSORBED, (d) => absorbHandler({ ...d, _layer: 'SHIELD' }));
    on(EvtType.RAGE_MITIGATED, (d) => absorbHandler({ ...d, _layer: 'RAGE' }));
    on(EvtType.BLOCK_TRIGGERED, (d) => absorbHandler({ ...d, _layer: 'BLOCK' }));
    on(EvtType.FORMATION_ABSORBED, (d) => absorbHandler({ ...d, _layer: 'FORMATION' }));

    // STATUS_APPLIED → status_applied
    on(EvtType.STATUS_APPLIED, (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.STATUS_APPLIED,
        actionId: this.#actionContext?.actionId || null,
        targetId: data.entityId || data.targetId,
        statusId: data.statusType || data.statusId,
        statusName: data.statusName || data.statusType,
        duration: data.duration ?? null,
      });
    });

    // STATUS_EXPIRED → status_expired
    on(EvtType.STATUS_EXPIRED, (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.STATUS_EXPIRED,
        actionId: this.#actionContext?.actionId || null,
        targetId: data.entityId || data.targetId,
        statusId: data.statusType || data.statusId,
        statusName: data.statusName || data.statusType,
      });
    });

    // CHARACTER_DIED → character_died
    // Skip when actionId is null — death is already recorded from projectile hit results
    // with the correct actionId (EventBus lacks action context during projectile resolution).
    on(EvtType.CHARACTER_DIED, (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      if (!this.#actionContext?.actionId) return; // skip duplicate (recorded from projectile results)
      const targetChar = this.#registry?.get?.(data.targetId);
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.CHARACTER_DIED,
        actionId: this.#actionContext.actionId,
        actorId: data.sourceId,
        targetId: data.targetId,
        targetName: targetChar?.name || null,
        finalDamage: data.finalDamage ?? null,
      });
    });

    // MOVEMENT_COMPLETE → character_moved (skip no-op moves)
    on(EvtType.MOVEMENT_COMPLETE, (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      // Skip no-op movements where from == to
      if (data.from && data.to &&
          data.from.q === data.to.q && data.from.r === data.to.r) {
        return;
      }
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.CHARACTER_MOVED,
        actionId: this.#actionContext?.actionId || null,
        actorId: data.entityId || data.charId,
        from: data.from || null,
        to: data.to || null,
      });
    });

    // BATTLE_END → battle_ended
    on(EvtType.BATTLE_END, (data) => {
      if (!this.#enabled) return;
      // Record directly to phases (not inside a speed phase) as a top-level event
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.BATTLE_ENDED,
        turnNumber: this.#currentTurn,
        phaseKind: 'battle_end',
        phaseSpeed: null,
        result: data.winner || data.winnerTeamId || null,
        reason: data.suppressGameOver ? 'tutorial_objective' : null,
      });
    });
  }

  _detachListeners() {
    for (const { evtType, id } of this.#listenerIds) {
      this.#eventBus.off(evtType, id);
    }
    this.#listenerIds = [];
  }

  _ensureProjectileLifecycle(projectileId) {
    let entry = this.#projectileTable.get(projectileId);
    if (!entry) {
      entry = {
        projectileId,
        actionId: null,
        actorId: null,
        from: null,
        intendedTo: null,
        status: 'flying',
        actualEnd: null,
        endReason: null,
        collidedWith: null,
        startTime: null,
        endTime: null,
      };
      this.#projectileTable.set(projectileId, entry);
    }
    return entry;
  }

  _makeLifecycleTime() {
    return {
      turnNumber: this.#currentTurn,
      phaseSpeed: this.#currentPhase?.speed ?? null,
      phaseKind: this.#currentPhase?.phaseKind ?? 'speed',
    };
  }

  _updateProjectileLifecycleFromCollision(projectileId, targetId, targetPos, actionId, metadata = {}) {
    const entry = this._ensureProjectileLifecycle(projectileId);
    if (actionId && !entry.actionId) entry.actionId = actionId;
    const actualEnd = metadata.contactPos || targetPos || null;
    const collisionType = metadata.collisionType || null;
    const hitType = metadata.hitType || null;
    const otherId = targetId || null;

    if (collisionType === 'mutual_destroy') {
      entry.status = 'collided';
      entry.actualEnd = actualEnd || entry.actualEnd || null;
      entry.endReason = 'mutual_annihilation';
      entry.collidedWith = otherId;
      entry.endTime = this._makeLifecycleTime();
      return;
    }

    if (collisionType === 'overpowered') {
      const power = metadata.power;
      const otherPower = metadata.otherPower;
      if (typeof power === 'number' && typeof otherPower === 'number' && power < otherPower) {
        entry.status = 'collided';
        entry.actualEnd = actualEnd || entry.actualEnd || null;
        entry.endReason = 'intercepted';
        entry.collidedWith = otherId;
        entry.endTime = this._makeLifecycleTime();
      }
      return;
    }

    if (hitType) {
      entry.status = 'collided';
      entry.actualEnd = actualEnd || entry.actualEnd || null;
      entry.endReason = 'hit';
      entry.collidedWith = otherId;
      entry.endTime = this._makeLifecycleTime();
    }
  }
}
