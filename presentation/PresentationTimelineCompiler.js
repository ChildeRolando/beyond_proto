// PresentationTimelineCompiler — pure compiler that converts canonical
// TurnResolution events into a PresentationTimeline (ordered list of clips).
//
// Pure data transform. No DOM, no canvas, no engine, no Date.now(), no random.
// Same input always produces the same output.
//
// Milestone 3 / Task 3.1

import { PresentationClipKind } from './PresentationClipTypes.js';

// ── Clip type derivation from projectile metadata ──

function deriveLaunchClipType(projectileType) {
  switch (projectileType) {
    case 'melee':      return PresentationClipKind.MELEE_SLASH;
    case 'stationary': return PresentationClipKind.STATIONARY_PROJECTILE_SPAWN;
    case 'aoe':        return PresentationClipKind.PROJECTILE_LAUNCH;
    default:           return PresentationClipKind.PROJECTILE_LAUNCH;
  }
}

// ── Default options ──

const DEFAULTS = Object.freeze({
  msPerEvent: 80,
  msPerProjectileStep: 80,
  minProjectileDurationMs: 120,
  impactDurationMs: 180,
  movementDurationMs: 200,
  gatherDurationMs: 300,
  damageNumberDurationMs: 500,
  deathDurationMs: 600,
});

// ── Launch clip type set (for lookup registration) ──

const LAUNCH_CLIP_TYPES = new Set([
  PresentationClipKind.PROJECTILE_LAUNCH,
  PresentationClipKind.MELEE_SLASH,
  PresentationClipKind.STATIONARY_PROJECTILE_SPAWN,
]);

/**
 * Compile a TurnResolution into a PresentationTimeline.
 *
 * @param {object} turnResolution — canonical TurnResolution (schemaVersion 2)
 * @param {object} [options]
 * @param {number} [options.msPerEvent=80]
 * @param {number} [options.msPerProjectileStep=80]
 * @param {number} [options.minProjectileDurationMs=120]
 * @param {number} [options.impactDurationMs=180]
 * @returns {object} PresentationTimeline
 */
export function compilePresentationTimeline(turnResolution, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const phases = turnResolution.phases || [];
  const turnNumber = turnResolution.turnNumber || 1;

  // Local counter — no module-level mutable state
  let clipSeq = 0;
  function nextClipId() { return `clip-${++clipSeq}`; }

  const allClips = [];
  // Track launch clips by projectileId for collision/intercept/expire timing
  const launchByProjectileId = new Map();
  // Track clips by entity for tracks grouping
  const entityClips = new Map();

  let phaseStartMs = 0;

  for (const phase of phases) {
    const events = phase.events || [];
    let phaseMaxEndMs = phaseStartMs;

    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const clip = compileEvent(event, i, phaseStartMs, launchByProjectileId, opts, nextClipId);
      if (clip) {
        allClips.push(clip);
        // Track by entity
        const entityId = clip.actorId || clip.targetId || 'unknown';
        if (!entityClips.has(entityId)) {
          entityClips.set(entityId, []);
        }
        entityClips.get(entityId).push(clip);
        // Track max end time
        const endMs = clip.startMs + clip.durationMs;
        if (endMs > phaseMaxEndMs) {
          phaseMaxEndMs = endMs;
        }
        // Register launch clips for later lookup
        if (LAUNCH_CLIP_TYPES.has(clip.clipType)) {
          const pid = clip.payload?.projectileId;
          if (pid) launchByProjectileId.set(pid, clip);
        }
      }
    }

    phaseStartMs = phaseMaxEndMs;
  }

  // Build tracks
  const tracks = [];
  for (const [entityId, clips] of entityClips) {
    tracks.push({
      trackId: `track-${entityId}`,
      entityId,
      clips: clips.map(c => c.id),
    });
  }

  const durationMs = allClips.length > 0
    ? Math.max(...allClips.map(c => c.startMs + c.durationMs))
    : 0;

  return {
    schemaVersion: 1,
    turnNumber,
    durationMs,
    tracks,
    clips: allClips,
  };
}

/**
 * Compile a single ResolutionEvent into zero or one PresentationClip.
 * Returns null for event types that don't produce clips.
 */
function compileEvent(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId) {
  switch (event.eventType) {
    case 'projectile_created':
      return compileProjectileCreated(event, eventIndex, phaseStartMs, opts, nextClipId);

    case 'projectile_collided':
      return compileProjectileCollided(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId);

    case 'projectile_intercepted':
      return compileProjectileIntercepted(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId);

    case 'projectile_expired':
      return compileProjectileExpired(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId);

    case 'character_moved':
      return compileCharacterMoved(event, eventIndex, phaseStartMs, opts, nextClipId);

    case 'resource_changed':
      return compileResourceChanged(event, eventIndex, phaseStartMs, opts, nextClipId);

    case 'damage_applied':
      return compileDamageApplied(event, eventIndex, phaseStartMs, opts, nextClipId);

    case 'character_died':
      return compileCharacterDied(event, eventIndex, phaseStartMs, opts, nextClipId);

    default:
      // Non-visualizable events produce no clip
      return null;
  }
}

// ── Per-event-type compilers ──

function compileProjectileCreated(event, eventIndex, phaseStartMs, opts, nextClipId) {
  const meta = event.metadata || {};
  const projectileType = meta.projectileType || event.projectileType || 'projectile';
  const path = meta.path || [];
  const clipType = deriveLaunchClipType(projectileType);

  const pathLength = path.length > 0 ? path.length : 2; // min 2 for from→to
  const durationMs = Math.max(opts.minProjectileDurationMs, pathLength * opts.msPerProjectileStep);
  const startMs = phaseStartMs;

  return {
    id: nextClipId(),
    clipType,
    sourceEventId: event.id,
    actionId: event.actionId,
    actorId: event.actorId,
    targetId: null,
    startMs,
    durationMs,
    payload: {
      projectileId: event.projectileId,
      path,
      flags: meta.flags || [],
      speed: meta.speed ?? null,
      isMelee: meta.isMelee || false,
      projectileType,
      from: event.from,
      to: event.to,
      basePower: event.basePower ?? null,
    },
  };
}

function compileProjectileCollided(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId) {
  const meta = event.metadata || {};

  // Determine if this is a clash (projectile-vs-projectile) or impact (hit target)
  if (meta.collisionType) {
    return compileClash(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId);
  }
  if (meta.hitType) {
    return compileImpact(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId);
  }

  // Fallback: treat as impact if there's a targetId
  if (event.targetId) {
    return compileImpact(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId);
  }

  return null;
}

function compileImpact(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId) {
  const meta = event.metadata || {};
  const launch = launchByProjectileId.get(event.projectileId);
  const startMs = launch
    ? launch.startMs + launch.durationMs
    : phaseStartMs + eventIndex * opts.msPerEvent;

  return {
    id: nextClipId(),
    clipType: PresentationClipKind.PROJECTILE_IMPACT,
    sourceEventId: event.id,
    actionId: event.actionId || meta.actionId || null,
    actorId: meta.ownerId || launch?.actorId || null,
    targetId: event.targetId,
    startMs,
    durationMs: opts.impactDurationMs,
    payload: {
      projectileId: event.projectileId,
      targetId: event.targetId,
      contactPos: meta.contactPos || event.targetPos || null,
      hitType: meta.hitType || 'body_contact',
      finalDamage: event.finalDamage ?? null,
      flags: meta.flags || [],
      isMelee: meta.isMelee || false,
    },
  };
}

function compileClash(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId) {
  const meta = event.metadata || {};
  const launch = launchByProjectileId.get(event.projectileId);
  const startMs = launch
    ? launch.startMs + launch.durationMs
    : phaseStartMs + eventIndex * opts.msPerEvent;

  // targetId is the other projectile id in clash events
  const otherProjectileId = event.targetId || null;

  return {
    id: nextClipId(),
    clipType: PresentationClipKind.PROJECTILE_CLASH,
    sourceEventId: event.id,
    actionId: event.actionId || null,
    actorId: meta.ownerId || launch?.actorId || null,
    targetId: meta.otherOwnerId || null,
    startMs,
    durationMs: opts.impactDurationMs,
    payload: {
      projectileId: event.projectileId,
      otherProjectileId,
      collisionType: meta.collisionType,
      contactPos: meta.contactPos || null,
      power: meta.power ?? null,
      otherPower: meta.otherPower ?? null,
      isMelee: meta.isMelee || false,
      otherIsMelee: meta.otherIsMelee || false,
    },
  };
}

function compileProjectileIntercepted(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId) {
  const meta = event.metadata || {};
  const launch = launchByProjectileId.get(event.projectileId);
  const startMs = launch
    ? launch.startMs + launch.durationMs
    : phaseStartMs + eventIndex * opts.msPerEvent;

  return {
    id: nextClipId(),
    clipType: PresentationClipKind.PROJECTILE_INTERCEPT,
    sourceEventId: event.id,
    actionId: event.actionId || null,
    actorId: event.targetId || null,  // interceptor is the actor
    targetId: null,
    startMs,
    durationMs: opts.impactDurationMs,
    payload: {
      projectileId: event.projectileId,
      interceptorId: event.targetId,
      interceptPower: meta.interceptPower ?? event.basePower ?? null,
      projectilePower: meta.projectilePower ?? null,
      interceptType: meta.interceptType || 'buff_intercept',
    },
  };
}

function compileProjectileExpired(event, eventIndex, phaseStartMs, launchByProjectileId, opts, nextClipId) {
  const meta = event.metadata || {};
  const launch = launchByProjectileId.get(event.projectileId);
  const startMs = launch
    ? launch.startMs + launch.durationMs
    : phaseStartMs + eventIndex * opts.msPerEvent;

  return {
    id: nextClipId(),
    clipType: PresentationClipKind.PROJECTILE_EXPIRE,
    sourceEventId: event.id,
    actionId: event.actionId || null,
    actorId: launch?.actorId || null,
    targetId: null,
    startMs,
    durationMs: opts.msPerEvent,
    payload: {
      projectileId: event.projectileId,
      reason: event.reason || 'unknown',
      lastPos: meta.lastPos || null,
    },
  };
}

// ── Movement / resource / damage / death compilers (Task 8.3) ──

/**
 * Compile a character_moved event into a movement clip.
 * Clip type is derived from metadata.movementType; defaults to 'walk'.
 */
function compileCharacterMoved(event, eventIndex, phaseStartMs, opts, nextClipId) {
  const meta = event.metadata || {};
  const movementType = meta.movementType || 'walk';
  let clipType;
  switch (movementType) {
    case 'dash':     clipType = PresentationClipKind.DASH; break;
    case 'teleport': clipType = PresentationClipKind.TELEPORT; break;
    case 'walk':
    default:         clipType = PresentationClipKind.WALK; break;
  }

  const path = meta.path || (event.from && event.to ? [event.from, event.to] : []);
  const pathLength = path.length > 0 ? path.length : 2;
  const durationMs = Math.max(opts.movementDurationMs, pathLength * opts.msPerProjectileStep);
  const startMs = phaseStartMs;

  return {
    id: nextClipId(),
    clipType,
    sourceEventId: event.id,
    actionId: event.actionId || null,
    actorId: event.actorId || event.subjectId || null,
    targetId: null,
    startMs,
    durationMs,
    payload: {
      from: event.from || null,
      to: event.to || null,
      path: path.length > 0 ? path : null,
      movementType,
    },
  };
}

/**
 * Compile a resource_changed event into a gather clip.
 * Only positive deltas (gain) produce gather visuals.
 * Returns null for non-positive deltas (consumption is not a gather animation).
 */
function compileResourceChanged(event, eventIndex, phaseStartMs, opts, nextClipId) {
  const delta = event.delta ?? 0;
  if (delta <= 0) return null; // consumption is not a gather visual

  const position = event.targetPos || event.from || event.to || null;
  const resource = event.resource || 'unknown';
  const color = resourceColor(resource);
  const startMs = phaseStartMs + eventIndex * opts.msPerEvent;

  return {
    id: nextClipId(),
    clipType: PresentationClipKind.GATHER,
    sourceEventId: event.id,
    actionId: event.actionId || null,
    actorId: event.actorId || event.subjectId || null,
    targetId: null,
    startMs,
    durationMs: opts.gatherDurationMs,
    payload: {
      position,
      resource,
      amount: delta,
      color,
    },
  };
}

/**
 * Compile a damage_applied event into a damage_number clip.
 */
function compileDamageApplied(event, eventIndex, phaseStartMs, opts, nextClipId) {
  const value = event.finalDamage ?? event.delta ?? 0;
  const position = event.targetPos || event.to || null;
  const startMs = phaseStartMs + eventIndex * opts.msPerEvent;

  return {
    id: nextClipId(),
    clipType: PresentationClipKind.DAMAGE_NUMBER,
    sourceEventId: event.id,
    actionId: event.actionId || null,
    actorId: event.actorId || null,
    targetId: event.targetId || event.subjectId || null,
    startMs,
    durationMs: opts.damageNumberDurationMs,
    payload: {
      value,
      position,
      targetId: event.targetId || event.subjectId || null,
    },
  };
}

/**
 * Compile a character_died event into a death clip.
 */
function compileCharacterDied(event, eventIndex, phaseStartMs, opts, nextClipId) {
  const position = event.targetPos || event.from || event.to || null;
  const startMs = phaseStartMs + eventIndex * opts.msPerEvent;

  return {
    id: nextClipId(),
    clipType: PresentationClipKind.DEATH,
    sourceEventId: event.id,
    actionId: event.actionId || null,
    actorId: event.actorId || null,
    targetId: event.targetId || event.subjectId || null,
    startMs,
    durationMs: opts.deathDurationMs,
    payload: {
      targetId: event.targetId || event.subjectId || null,
      position,
    },
  };
}

/**
 * Return a CSS color string for a resource type.
 */
function resourceColor(resource) {
  switch (resource) {
    case 'qi':   return '#8b5cf6';
    case 'rage': return '#ffcc66';
    case 'hp':   return '#ff6666';
    default:     return '#cccccc';
  }
}

// ── Class-based API (alternative entry point) ──

export class PresentationTimelineCompiler {
  /**
   * @param {object} [options] — default timing options
   */
  constructor(options = {}) {
    this.options = { ...DEFAULTS, ...options };
  }

  /**
   * Compile a TurnResolution into a PresentationTimeline.
   * @param {object} turnResolution
   * @param {object} [overrides] — per-call timing overrides
   * @returns {object} PresentationTimeline
   */
  compile(turnResolution, overrides = {}) {
    const opts = { ...this.options, ...overrides };
    return compilePresentationTimeline(turnResolution, opts);
  }
}
