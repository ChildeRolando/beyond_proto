// ProjectileResolutionCompiler — pure data transform that converts raw projectile
// events into canonical ProjectileResolutionFact[] entries.
//
// Accumulates state across phases so that a projectile created in one speed tier
// and collided in another produces a single authoritative fact.
//
// CRITICAL RULE: actualEnd must NEVER be derived from projectile_created.to.
// It is set only from collision/intercept/expire events. When actualEnd is null,
// the projectile reached its intended destination uninterrupted — but consumers
// must test for null explicitly rather than silently falling back to intendedTo.

const TERMINAL_STATUSES = new Set(['collided', 'intercepted', 'expired']);

export class ProjectileResolutionCompiler {
  /** @type {Map<string, object>} projectileId → fact entry */
  #facts = new Map();

  /**
   * Process a batch of events and return the current fact array.
   * State accumulates across calls — call reset() to clear.
   *
   * @param {Array} events — canonical ResolutionEvent[]
   * @returns {Array} ProjectileResolutionFact[]
   */
  build(events) {
    if (!events || events.length === 0) return this.getFacts();
    for (const event of events) {
      this.#processEvent(event);
    }
    return this.getFacts();
  }

  /** Return current facts snapshot (does not clear state). */
  getFacts() {
    return [...this.#facts.values()].map(entry => ({
      projectileId: entry.projectileId,
      actionId: entry.actionId || null,
      actorId: entry.actorId || null,
      from: entry.from || null,
      intendedTo: entry.intendedTo || null,
      actualEnd: entry.actualEnd || null,       // null when uninterrupted — NO intendedTo fallback
      endReason: entry.endReason || null,
      collidedWith: entry.collidedWith || null,
      status: entry.status || 'flying',
      startTime: entry.startTime || null,
      endTime: entry.endTime || null,
    }));
  }

  /** Clear all accumulated state. */
  reset() {
    this.#facts.clear();
  }

  // ─── Event handlers ───

  #processEvent(event) {
    const et = event.eventType;
    if (!et) return;

    switch (et) {
      case 'projectile_created':
        this.#handleCreated(event);
        break;
      case 'projectile_collided':
        this.#handleCollided(event);
        break;
      case 'projectile_intercepted':
        this.#handleIntercepted(event);
        break;
      case 'projectile_expired':
        this.#handleExpired(event);
        break;
      default:
        break;
    }
  }

  #handleCreated(event) {
    const pid = event.projectileId;
    if (!pid) return;
    const meta = event.metadata || {};

    this.#facts.set(pid, {
      projectileId: pid,
      actionId: event.actionId || null,
      actorId: event.actorId || null,
      from: event.from ? { q: event.from.q, r: event.from.r } : null,
      intendedTo: event.to ? { q: event.to.q, r: event.to.r } : null,
      actualEnd: null,            // MUST be set by later events, never fallback to intendedTo
      endReason: null,
      collidedWith: null,
      status: 'flying',
      startTime: _eventTime(event),
      endTime: null,
    });
  }

  #handleCollided(event) {
    const pid = event.projectileId;
    if (!pid) return;
    const meta = event.metadata || {};
    const collisionType = meta.collisionType || null;
    const hitType = meta.hitType || null;
    const contactPos = _normalizePoint(meta.contactPos || event.targetPos || null);
    const targetId = event.targetId || null;

    const entry = this.#ensureEntry(pid, event);

    if (collisionType === 'mutual_destroy') {
      entry.status = 'collided';
      entry.actualEnd = contactPos || entry.actualEnd;
      entry.endReason = 'mutual_annihilation';
      entry.collidedWith = targetId;
      entry.endTime = _eventTime(event);
      return;
    }

    if (collisionType === 'overpowered') {
      const power = meta.power;
      const otherPower = meta.otherPower;
      // This projectile is the weaker one — it was destroyed
      if (typeof power === 'number' && typeof otherPower === 'number' && power < otherPower) {
        entry.status = 'collided';
        entry.actualEnd = contactPos || entry.actualEnd;
        entry.endReason = 'intercepted';       // weaker projectile was intercepted by stronger
        entry.collidedWith = targetId;
        entry.endTime = _eventTime(event);
      }
      // Stronger projectile survives — do NOT mark as terminal
      return;
    }

    if (hitType) {
      entry.status = 'collided';
      entry.actualEnd = contactPos || entry.actualEnd;
      entry.endReason = 'hit';
      entry.collidedWith = targetId;
      entry.endTime = _eventTime(event);
      return;
    }

    // Fallback: any collision without explicit type but with target
    if (targetId && !entry.endReason) {
      entry.status = 'collided';
      entry.actualEnd = contactPos || entry.actualEnd;
      entry.endReason = 'hit';
      entry.collidedWith = targetId;
      entry.endTime = _eventTime(event);
    }
  }

  #handleIntercepted(event) {
    const pid = event.projectileId;
    if (!pid) return;
    const meta = event.metadata || {};
    const contactPos = _normalizePoint(meta.contactPos || null);

    const entry = this.#ensureEntry(pid, event);
    entry.status = 'intercepted';
    entry.actualEnd = contactPos || entry.actualEnd;
    entry.endReason = 'intercepted';
    entry.collidedWith = event.targetId || null;
    entry.endTime = _eventTime(event);
  }

  #handleExpired(event) {
    const pid = event.projectileId;
    if (!pid) return;
    const meta = event.metadata || {};
    const lastPos = _normalizePoint(meta.lastPos || null);

    const entry = this.#ensureEntry(pid, event);
    entry.status = 'expired';
    // actualEnd = last known position. If no lastPos, keep existing actualEnd (or null).
    // NEVER fall back to intendedTo.
    entry.actualEnd = lastPos || entry.actualEnd;
    entry.endReason = 'expired';
    entry.endTime = _eventTime(event);
  }

  #ensureEntry(pid, event) {
    let entry = this.#facts.get(pid);
    if (!entry) {
      entry = {
        projectileId: pid,
        actionId: event.actionId || null,
        actorId: event.actorId || null,
        from: null,
        intendedTo: null,
        actualEnd: null,
        endReason: null,
        collidedWith: null,
        status: 'flying',
        startTime: _eventTime(event),
        endTime: null,
      };
      this.#facts.set(pid, entry);
    }
    // Backfill actionId/actorId if missing
    if (!entry.actionId && event.actionId) entry.actionId = event.actionId;
    if (!entry.actorId && event.actorId) entry.actorId = event.actorId;
    return entry;
  }
}

// ─── Helpers ───

function _eventTime(event) {
  return {
    turnNumber: event.turnNumber ?? null,
    phaseSpeed: event.phaseSpeed ?? null,
    phaseKind: event.phaseKind ?? 'speed',
  };
}

function _normalizePoint(point) {
  if (!point) return null;
  if (typeof point.q === 'number' && typeof point.r === 'number') {
    return { q: point.q, r: point.r };
  }
  return null;
}

// ─── Convenience export ───

/**
 * One-shot: compile facts from all phase events.
 * @param {Array} phases — resolution phases, each with .events[]
 * @returns {Array} ProjectileResolutionFact[]
 */
export function compileAllPhases(phases) {
  const compiler = new ProjectileResolutionCompiler();
  for (const phase of phases) {
    compiler.build(phase.events || []);
  }
  return compiler.getFacts();
}
