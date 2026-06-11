// PresentationClipTypes — canonical visual clip kinds and clip helpers.
// Pure data contract. Must not import GameEngine, BattleSessionController,
// DOM, canvas, or renderer code.
//
// PresentationTimelineCompiler converts TurnResolution into a
// PresentationTimeline (ordered list of clips). Each clip describes a
// visual/audio event with timing and payload.

export const PresentationClipKind = Object.freeze({
  PHASE:           'phase',
  ACTION_HIGHLIGHT: 'action_highlight',
  PROJECTILE:      'projectile',
  IMPACT:          'impact',
  SLASH:           'slash',
  MOVE:            'move',
  DASH:            'dash',
  TELEPORT:        'teleport',
  WALK:            'walk',
  GATHER:          'gather',
  STATUS:          'status',
  DAMAGE_NUMBER:   'damage_number',
  HIT_FLASH:       'hit_flash',
  DEATH:           'death',
});

/**
 * Returns true if kind is a registered PresentationClipKind value.
 * @param {string} kind
 * @returns {boolean}
 */
export function isPresentationClipKind(kind) {
  return Object.values(PresentationClipKind).includes(kind);
}

/**
 * Create a canonical presentation clip.
 *
 * @param {object} opts
 * @param {string|null} [opts.id=null]
 * @param {string} opts.kind — must be a PresentationClipKind value
 * @param {string|null} [opts.phaseId=null]
 * @param {string|null} [opts.actionId=null]
 * @param {number} [opts.startMs=0]
 * @param {number} [opts.durationMs=0]
 * @param {object} [opts.payload={}]
 * @returns {object} PresentationClip
 */
export function createPresentationClip({
  id,
  kind,
  phaseId = null,
  actionId = null,
  startMs = 0,
  durationMs = 0,
  payload = {},
} = {}) {
  return {
    id: id || null,
    kind,
    phaseId,
    actionId,
    startMs,
    durationMs,
    payload,
  };
}

/**
 * Returns true if the clip is active at the given playback time.
 * @param {object} clip
 * @param {number} timeMs
 * @returns {boolean}
 */
export function isActiveClip(clip, timeMs) {
  if (!clip) return false;
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs;
}
