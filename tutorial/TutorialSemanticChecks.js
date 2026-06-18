function eventsOf(resolution) {
  return (resolution?.phases || []).flatMap(phase => phase.events || []);
}

export function didActionDeclareSkill(resolution, actorId, skillId) {
  return eventsOf(resolution).some(event =>
    event.eventType === 'action_declared'
    && (!actorId || event.actorId === actorId)
    && (!skillId || event.skillId === skillId)
  );
}

export function didActionPayCost(resolution, actorId, resource, amount = null) {
  return eventsOf(resolution).some(event =>
    event.eventType === 'resource_changed'
    && (!actorId || event.actorId === actorId || event.subjectId === actorId)
    && event.resource === resource
    && event.delta < 0
    && (amount == null || Math.abs(event.delta) === amount)
  );
}

export function didActionGainStatus(resolution, actorId, statusId) {
  return eventsOf(resolution).some(event =>
    event.eventType === 'status_applied'
    && (!actorId || event.targetId === actorId || event.actorId === actorId)
    && (!statusId || event.statusId === statusId)
  );
}

export function didProjectileMutualDestruction(resolution) {
  return eventsOf(resolution).some(event =>
    event.semanticOutcome === 'projectile_mutual_destruction'
    || (
      event.eventType === 'projectile_collided'
      && event.metadata?.collisionType === 'mutual_destroy'
    )
  );
}

export function didDamageAbsorbByLayer(resolution, targetId, layer) {
  return eventsOf(resolution).some(event =>
    event.eventType === 'damage_absorbed'
    && (!targetId || event.targetId === targetId)
    && (!layer || event.layer === layer)
  );
}

export function didCharacterKill(resolution, actorId, targetId) {
  return eventsOf(resolution).some(event =>
    event.eventType === 'character_died'
    && (!actorId || event.actorId === actorId)
    && (!targetId || event.targetId === targetId)
  );
}

export function didCharacterMove(resolution, actorId) {
  return eventsOf(resolution).some(event =>
    event.eventType === 'character_moved'
    && (!actorId || event.actorId === actorId || event.subjectId === actorId)
  );
}

export function didCollectResource(resolution, actorId, resource) {
  return eventsOf(resolution).some(event =>
    event.eventType === 'resource_changed'
    && (!actorId || event.actorId === actorId || event.subjectId === actorId)
    && (!resource || event.resource === resource)
    && event.delta > 0
  );
}
