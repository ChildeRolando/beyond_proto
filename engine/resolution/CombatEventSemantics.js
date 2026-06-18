import { ResolutionEventType } from './ResolutionEventTypes.js';

export const EventLayer = Object.freeze({
  PHYSICS: 'physics',
  RESOLUTION: 'resolution',
  PRESENTATION: 'presentation',
});

export const ResolutionOutcome = Object.freeze({
  ACTION_DECLARED: 'action_declared',
  COST_PAID: 'cost_paid',
  RESOURCE_CHANGED: 'resource_changed',
  CHARACTER_MOVED: 'character_moved',
  PROJECTILE_SPAWNED: 'projectile_spawned',
  PROJECTILE_COLLIDED: 'projectile_collided',
  PROJECTILE_MUTUAL_DESTRUCTION: 'projectile_mutual_destruction',
  PROJECTILE_INTERCEPTED: 'projectile_intercepted',
  DAMAGE_APPLIED: 'damage_applied',
  DAMAGE_ABSORBED: 'damage_absorbed',
  CHARACTER_DIED: 'character_died',
  STATUS_APPLIED: 'status_applied',
  STATUS_REMOVED: 'status_removed',
  STATUS_EXPIRED: 'status_expired',
  ACTION_NO_EFFECT: 'action_no_effect',
  ACTION_FAILED: 'action_failed',
  BATTLE_ENDED: 'battle_ended',
});

export const PresentationKind = Object.freeze({
  DECLARE_ACTION: 'declare_action',
  PAY_COST: 'pay_cost',
  MOVE: 'move',
  FIRE_PROJECTILE: 'fire_projectile',
  PROJECTILE_MUTUAL_DESTRUCTION: 'projectile_mutual_destruction',
  PROJECTILE_COLLISION: 'projectile_collision',
  PROJECTILE_INTERCEPTED: 'projectile_intercepted',
  DAMAGE: 'damage',
  ABSORB: 'absorb',
  KILL: 'kill',
  GAIN_STATUS: 'gain_status',
  LOSE_STATUS: 'lose_status',
  MISS: 'miss',
  FAIL: 'fail',
  BATTLE_END: 'battle_end',
});

export function isProjectileCollisionOutcome(event) {
  return event?.eventType === ResolutionEventType.PROJECTILE_COLLIDED
    || event?.semanticOutcome === ResolutionOutcome.PROJECTILE_COLLIDED
    || event?.semanticOutcome === ResolutionOutcome.PROJECTILE_MUTUAL_DESTRUCTION;
}

export function isProjectileMutualDestruction(event) {
  return event?.semanticOutcome === ResolutionOutcome.PROJECTILE_MUTUAL_DESTRUCTION
    || (
      event?.eventType === ResolutionEventType.PROJECTILE_COLLIDED
      && (event.metadata?.collisionType || event.collisionType) === 'mutual_destroy'
    );
}

export function isActionFailure(event) {
  return event?.eventType === ResolutionEventType.ACTION_FAILED
    || event?.semanticOutcome === ResolutionOutcome.ACTION_FAILED
    || event?.semanticOutcome === ResolutionOutcome.ACTION_NO_EFFECT;
}

export function isTrueMiss(event) {
  if (!isActionFailure(event)) return false;
  if (event?.semanticOutcome === ResolutionOutcome.ACTION_NO_EFFECT) return true;
  const reason = event?.reason || event?.result;
  return reason === 'miss' || reason === 'no_effect';
}

export function getPresentationKind(event) {
  if (!event) return null;
  if (event.presentationKind) return event.presentationKind;
  if (isProjectileMutualDestruction(event)) return PresentationKind.PROJECTILE_MUTUAL_DESTRUCTION;

  switch (event.eventType) {
    case ResolutionEventType.ACTION_DECLARED:
      return PresentationKind.DECLARE_ACTION;
    case ResolutionEventType.ACTION_FAILED:
      return isTrueMiss(event) ? PresentationKind.MISS : PresentationKind.FAIL;
    case ResolutionEventType.RESOURCE_CHANGED:
      return (event.delta ?? 0) < 0 ? PresentationKind.PAY_COST : PresentationKind.PAY_COST;
    case ResolutionEventType.CHARACTER_MOVED:
      return PresentationKind.MOVE;
    case ResolutionEventType.PROJECTILE_CREATED:
      return PresentationKind.FIRE_PROJECTILE;
    case ResolutionEventType.PROJECTILE_COLLIDED:
      return PresentationKind.PROJECTILE_COLLISION;
    case ResolutionEventType.PROJECTILE_INTERCEPTED:
      return PresentationKind.PROJECTILE_INTERCEPTED;
    case ResolutionEventType.DAMAGE_APPLIED:
      return PresentationKind.DAMAGE;
    case ResolutionEventType.DAMAGE_ABSORBED:
      return PresentationKind.ABSORB;
    case ResolutionEventType.CHARACTER_DIED:
      return PresentationKind.KILL;
    case ResolutionEventType.STATUS_APPLIED:
      return PresentationKind.GAIN_STATUS;
    case ResolutionEventType.STATUS_REMOVED:
    case ResolutionEventType.STATUS_EXPIRED:
      return PresentationKind.LOSE_STATUS;
    case ResolutionEventType.BATTLE_ENDED:
      return PresentationKind.BATTLE_END;
    default:
      return null;
  }
}

export function inferSemanticLayer(event) {
  if (!event) return null;
  switch (event.eventType) {
    case ResolutionEventType.PROJECTILE_CREATED:
    case ResolutionEventType.PROJECTILE_MOVED:
    case ResolutionEventType.PROJECTILE_COLLIDED:
    case ResolutionEventType.PROJECTILE_EXPIRED:
    case ResolutionEventType.CHARACTER_MOVED:
      return EventLayer.PHYSICS;
    default:
      return EventLayer.RESOLUTION;
  }
}

export function inferResolutionOutcome(event) {
  if (!event) return null;
  if (isProjectileMutualDestruction(event)) return ResolutionOutcome.PROJECTILE_MUTUAL_DESTRUCTION;
  switch (event.eventType) {
    case ResolutionEventType.ACTION_DECLARED: return ResolutionOutcome.ACTION_DECLARED;
    case ResolutionEventType.ACTION_FAILED: return ResolutionOutcome.ACTION_NO_EFFECT;
    case ResolutionEventType.RESOURCE_CHANGED: return ResolutionOutcome.RESOURCE_CHANGED;
    case ResolutionEventType.CHARACTER_MOVED: return ResolutionOutcome.CHARACTER_MOVED;
    case ResolutionEventType.PROJECTILE_CREATED: return ResolutionOutcome.PROJECTILE_SPAWNED;
    case ResolutionEventType.PROJECTILE_COLLIDED: return ResolutionOutcome.PROJECTILE_COLLIDED;
    case ResolutionEventType.PROJECTILE_INTERCEPTED: return ResolutionOutcome.PROJECTILE_INTERCEPTED;
    case ResolutionEventType.DAMAGE_APPLIED: return ResolutionOutcome.DAMAGE_APPLIED;
    case ResolutionEventType.DAMAGE_ABSORBED: return ResolutionOutcome.DAMAGE_ABSORBED;
    case ResolutionEventType.CHARACTER_DIED: return ResolutionOutcome.CHARACTER_DIED;
    case ResolutionEventType.STATUS_APPLIED: return ResolutionOutcome.STATUS_APPLIED;
    case ResolutionEventType.STATUS_REMOVED: return ResolutionOutcome.STATUS_REMOVED;
    case ResolutionEventType.STATUS_EXPIRED: return ResolutionOutcome.STATUS_EXPIRED;
    case ResolutionEventType.BATTLE_ENDED: return ResolutionOutcome.BATTLE_ENDED;
    default: return null;
  }
}

export function withCombatEventSemantics(event) {
  if (!event) return event;
  const semanticOutcome = event.semanticOutcome || inferResolutionOutcome(event);
  const semanticLayer = event.semanticLayer || inferSemanticLayer(event);
  const presentationKind = event.presentationKind || getPresentationKind({ ...event, semanticOutcome, semanticLayer });
  return {
    ...event,
    semanticLayer,
    semanticOutcome,
    presentationKind,
  };
}
