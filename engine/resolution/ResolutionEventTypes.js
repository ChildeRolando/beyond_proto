// ResolutionEventTypes — canonical event type registry for TurnResolution.
// Defines the legal state/event space. All phase.events items must carry a
// valid eventType from this registry.

export const ResolutionEventType = Object.freeze({
  // ── Action lifecycle ──
  ACTION_DECLARED: 'action_declared',
  ACTION_FAILED:   'action_failed',

  // ── Resources ──
  RESOURCE_CHANGED: 'resource_changed',

  // ── Status ──
  STATUS_APPLIED:  'status_applied',
  STATUS_REMOVED:  'status_removed',
  STATUS_EXPIRED:  'status_expired',

  // ── Projectiles ──
  PROJECTILE_CREATED:     'projectile_created',
  PROJECTILE_MOVED:       'projectile_moved',
  PROJECTILE_COLLIDED:    'projectile_collided',
  PROJECTILE_INTERCEPTED: 'projectile_intercepted',
  PROJECTILE_EXPIRED:     'projectile_expired',

  // ── Movement ──
  CHARACTER_MOVED: 'character_moved',

  // ── Damage ──
  DAMAGE_APPLIED:  'damage_applied',
  DAMAGE_ABSORBED: 'damage_absorbed',

  // ── Death ──
  CHARACTER_DIED: 'character_died',

  // ── Battle lifecycle ──
  TURN_STARTED: 'turn_started',
  BATTLE_ENDED: 'battle_ended',
});

function inferLegacySemanticFields(event) {
  const collisionType = event?.metadata?.collisionType || event?.collisionType || null;
  if (event?.eventType === ResolutionEventType.PROJECTILE_COLLIDED && collisionType === 'mutual_destroy') {
    return {
      semanticLayer: 'physics',
      semanticOutcome: 'projectile_mutual_destruction',
      presentationKind: 'projectile_mutual_destruction',
    };
  }
  if (event?.eventType === ResolutionEventType.ACTION_FAILED) {
    return {
      semanticLayer: 'resolution',
      semanticOutcome: 'action_no_effect',
      presentationKind: 'miss',
    };
  }
  return {
    semanticLayer: event?.semanticLayer || null,
    semanticOutcome: event?.semanticOutcome || null,
    presentationKind: event?.presentationKind || null,
  };
}

const VALID_TYPES = new Set(Object.values(ResolutionEventType));

/**
 * Returns true if the given string is a registered ResolutionEventType.
 */
export function isResolutionEventType(type) {
  return VALID_TYPES.has(type);
}

/**
 * Normalize a raw event object to the canonical ResolutionEvent shape.
 * Fills in defaults for missing fields and ensures eventType is valid.
 * Returns a new object (does not mutate input).
 */
export function normalizeResolutionEvent(raw = {}) {
  const eventType = isResolutionEventType(raw.eventType)
    ? raw.eventType
    : (isResolutionEventType(raw.type) ? raw.type : null);

  const normalized = {
    id:            raw.id            || null,
    // Only use the pre-validated eventType — do NOT fall back to raw.type
    // (legacy coarse types like 'attack' are not valid ResolutionEventTypes)
    eventType,

    turnNumber:    raw.turnNumber    ?? null,
    phaseSpeed:    raw.phaseSpeed    ?? raw.speed ?? null,
    phaseKind:     raw.phaseKind     || 'speed',

    actionId:      raw.actionId      || null,
    commandId:     raw.commandId     || null,
    actorId:       raw.actorId       || null,
    skillId:       raw.skillId       || null,

    subjectId:     raw.subjectId     || raw.actorId || null,
    targetId:      raw.targetId      || null,
    targetName:    raw.targetName    || null,

    targetPos:     raw.targetPos     || null,
    from:          raw.from          || null,
    to:            raw.to            || null,

    resource:      raw.resource      || null,
    delta:         raw.delta         ?? null,
    oldValue:      raw.oldValue      ?? raw.old ?? null,
    newValue:      raw.newValue      ?? raw.new ?? null,

    statusId:      raw.statusId      || raw.statusType || null,
    statusName:    raw.statusName    || null,
    duration:      raw.duration      ?? null,

    projectileId:  raw.projectileId  || null,
    projectileType: raw.projectileType || null,

    damageType:    raw.damageType    || null,
    basePower:     raw.basePower     ?? null,
    finalDamage:   raw.finalDamage   ?? raw.damage ?? null,
    absorbed:      raw.absorbed      ?? null,
    layer:         raw.layer         || null,

    result:        raw.result        || null,
    reason:        raw.reason        || null,

    semanticLayer: raw.semanticLayer || null,
    semanticOutcome: raw.semanticOutcome || null,
    presentationKind: raw.presentationKind || null,
    involvedActionIds: Array.isArray(raw.involvedActionIds) ? [...raw.involvedActionIds] : null,
    involvedProjectileIds: Array.isArray(raw.involvedProjectileIds) ? [...raw.involvedProjectileIds] : null,

    // Legacy compat: keep old coarse type for code that hasn't migrated yet
    _legacyType:   raw.type          || null,

    // ── Stable actor metadata (from recordActionDeclared) ──
    actorName:     raw.actorName     || null,
    actorOwnerId:  raw.actorOwnerId  || null,
    actorClass:    raw.actorClass    || null,
    actorRoleId:   raw.actorRoleId   || null,
    actorIcon:     raw.actorIcon     || null,
    skillName:     raw.skillName     || null,

    metadata:      raw.metadata      || null,
  };
  return {
    ...normalized,
    ...inferLegacySemanticFields(normalized),
  };
}

/**
 * Lightweight assertion — throws if eventType is not a valid ResolutionEventType.
 * Passes through the event unchanged on success.
 */
export function assertResolutionEvent(event) {
  if (!event || !isResolutionEventType(event.eventType)) {
    const label = event?.eventType || event?.type || String(event);
    throw new Error(`Invalid ResolutionEvent: eventType "${label}" is not registered`);
  }
  return event;
}
