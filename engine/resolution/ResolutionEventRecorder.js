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
    this._attachListeners();
    this.#enabled = true;
  }

  /** Start a new speed phase. Returns the phase object (compat with onPhaseStart). */
  startPhase(speed, kind = 'speed', commandCount = 0) {
    const phase = {
      speed,
      phaseKind: kind,
      commandCount,
      events: [],
      summary: '',
      actionCount: 0,
      actions: [],
      snapshot: null,
      viewState: null,
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
    const event = normalizeResolutionEvent({
      id: nextEventId(),
      eventType: ResolutionEventType.ACTION_DECLARED,
      turnNumber: this.#currentTurn,
      phaseSpeed: this.#currentPhase.speed,
      phaseKind: this.#currentPhase.phaseKind || 'speed',
      actionId,
      actorId,
      skillId,
      targetPos: targetPos || null,
      actorName: actor?.name || null,
      skillName: skillName || null,
    });
    this.#currentPhase.events.push(event);
    return event;
  }

  /** Record an action_failed event (e.g., miss). */
  recordActionFailed(actionId, actorId, skillId, reason) {
    if (!this.#currentPhase) return null;
    const event = normalizeResolutionEvent({
      id: nextEventId(),
      eventType: ResolutionEventType.ACTION_FAILED,
      turnNumber: this.#currentTurn,
      phaseSpeed: this.#currentPhase.speed,
      phaseKind: this.#currentPhase.phaseKind || 'speed',
      actionId,
      actorId,
      skillId,
      result: 'miss',
      reason: reason || 'miss',
    });
    this.#currentPhase.events.push(event);
    return event;
  }

  /** Record a projectile_created event. */
  recordProjectileCreated(projectileId, actorId, skillId, actionId, fromPos, toPos, power, speed) {
    if (!this.#currentPhase) return null;
    const event = normalizeResolutionEvent({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_CREATED,
      turnNumber: this.#currentTurn,
      phaseSpeed: this.#currentPhase.speed,
      phaseKind: this.#currentPhase.phaseKind || 'speed',
      actionId,
      actorId,
      skillId,
      projectileId,
      from: fromPos || null,
      to: toPos || null,
      basePower: power ?? null,
      projectileType: 'projectile',
    });
    this.#currentPhase.events.push(event);
    return event;
  }

  /** Record a projectile_collided event. */
  recordProjectileCollided(projectileId, targetId, targetPos, damage) {
    if (!this.#currentPhase) return null;
    const targetChar = targetId ? this.#registry?.get?.(targetId) : null;
    const event = normalizeResolutionEvent({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_COLLIDED,
      turnNumber: this.#currentTurn,
      phaseSpeed: this.#currentPhase.speed,
      phaseKind: this.#currentPhase.phaseKind || 'speed',
      projectileId,
      targetId,
      targetPos: targetPos || null,
      targetName: targetChar?.name || null,
      finalDamage: damage ?? null,
    });
    this.#currentPhase.events.push(event);
    return event;
  }

  /** Record a projectile_expired event (disappeared without hitting). */
  recordProjectileExpired(projectileId, reason) {
    if (!this.#currentPhase) return null;
    const event = normalizeResolutionEvent({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_EXPIRED,
      turnNumber: this.#currentTurn,
      phaseSpeed: this.#currentPhase.speed,
      phaseKind: this.#currentPhase.phaseKind || 'speed',
      projectileId,
      reason: reason || null,
    });
    this.#currentPhase.events.push(event);
    return event;
  }

  /** Record a projectile_intercepted event. */
  recordProjectileIntercepted(projectileId, interceptorId, interceptPower) {
    if (!this.#currentPhase) return null;
    const event = normalizeResolutionEvent({
      id: nextEventId(),
      eventType: ResolutionEventType.PROJECTILE_INTERCEPTED,
      turnNumber: this.#currentTurn,
      phaseSpeed: this.#currentPhase.speed,
      phaseKind: this.#currentPhase.phaseKind || 'speed',
      projectileId,
      targetId: interceptorId,
      basePower: interceptPower ?? null,
    });
    this.#currentPhase.events.push(event);
    return event;
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
  finalize({ finalViewState } = {}) {
    this.#enabled = false;
    this._detachListeners();
    this.#actionContext = null;
    this.#currentPhase = null;

    const phases = this.#phases.filter(p => p.events.length > 0);

    return {
      turnNumber: this.#currentTurn,
      phases,
      endState: finalViewState || null,
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
    _eventIdCounter = 0;
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
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.RESOURCE_CHANGED,
        actionId: this.#actionContext?.actionId || null,
        actorId: data.entityId,
        subjectId: data.entityId,
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
      // Also record absorption breakdowns
      if (Array.isArray(data.breakdown)) {
        for (const b of data.breakdown) {
          if (b.absorbed > 0) {
            const targetChar = this.#registry?.get?.(data.targetId);
            this.record({
              id: nextEventId(),
              eventType: ResolutionEventType.DAMAGE_ABSORBED,
              actionId: this.#actionContext?.actionId || null,
              actorId: data.sourceId,
              targetId: data.targetId,
              targetName: targetChar?.name || null,
              layer: b.layer || null,
              absorbed: b.absorbed,
            });
          }
        }
      }
    });

    // SHIELD_ABSORBED / RAGE_MITIGATED / BLOCK_TRIGGERED / FORMATION_ABSORBED → damage_absorbed
    const absorbHandler = (data) => {
      if (!this.#enabled || !this.#currentPhase) return;
      this.record({
        id: nextEventId(),
        eventType: ResolutionEventType.DAMAGE_ABSORBED,
        actionId: this.#actionContext?.actionId || null,
        targetId: data.entityId,
        absorbed: data.absorbed ?? null,
        layer: data._layer || null,
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
}
