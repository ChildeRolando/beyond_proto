// PlaybackFrame — a single frame emitted by TurnPlaybackRuntime.
// Pure data contract. Must not import GameEngine, BattleSessionController,
// DOM, canvas, or renderer code.
//
// TurnPlaybackRuntime advances playback time through a PresentationTimeline
// and emits one PlaybackFrame per animation tick. BattleSceneStore consumes
// PlaybackFrame to produce the BattleScene for rendering.

/**
 * Create a canonical PlaybackFrame.
 *
 * @param {object} opts
 * @param {number} [opts.timeMs=0] — current playback time in milliseconds
 * @param {number} [opts.durationMs=0] — total duration of this frame
 * @param {string|null} [opts.phaseId=null]
 * @param {string[]} [opts.activeActionIds=[]]
 * @param {string[]} [opts.activeClipIds=[]] — clip ids active at this time (Milestone 3)
 * @param {Array} [opts.activeClips=[]] — active clip objects at this time (Milestone 3)
 * @param {object|null} [opts.sceneState=null] — interpolated scene state at this time
 * @param {Array} [opts.effects=[]] — active visual effects at this time
 * @returns {object} PlaybackFrame
 */
export function createPlaybackFrame({
  timeMs = 0,
  durationMs = 0,
  phaseId = null,
  activeActionIds = [],
  activeClipIds = [],
  activeClips = [],
  sceneState = null,
  effects = [],
} = {}) {
  return {
    mode: 'playback',
    timeMs,
    durationMs,
    phaseId,
    activeActionIds,
    activeClipIds,
    activeClips,
    sceneState,
    effects,
  };
}

/**
 * Type guard: returns true if value is a valid PlaybackFrame shape.
 * @param {*} value
 * @returns {boolean}
 */
export function isPlaybackFrame(value) {
  return Boolean(
    value &&
    value.mode === 'playback' &&
    typeof value.timeMs === 'number' &&
    Array.isArray(value.effects)
  );
}

/**
 * Returns the playback progress as a number between 0 and 1.
 * @param {object} frame
 * @returns {number} 0..1
 */
export function getPlaybackProgress(frame) {
  if (!frame || !frame.durationMs) return 0;
  return Math.max(0, Math.min(1, frame.timeMs / frame.durationMs));
}
