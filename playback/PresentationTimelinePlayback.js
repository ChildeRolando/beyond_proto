// PresentationTimelinePlayback — pure adapter that converts a
// PresentationTimeline + currentTimeMs into a PlaybackFrame.
//
// Pure data transform. No DOM, no canvas, no engine, no Date.now(), no random.
// Does NOT mutate the timeline or its clips.
//
// Milestone 3 / Task 3.3

import { createPlaybackFrame } from './PlaybackFrame.js';
import { clonePlainData } from '../presentation/BattleScene.js';

/**
 * Build a PlaybackFrame at a given time position in the timeline.
 *
 * Rules:
 *  - timeMs is clamped to [0, timeline.durationMs]
 *  - activeClips = clips where startMs <= timeMs < startMs + durationMs
 *  - effects are derived from active clips with progress [0,1]
 *  - All output data is deep-cloned; mutating the frame does NOT affect the
 *    original timeline or its clips.
 *
 * @param {object} timeline — PresentationTimeline from PresentationTimelineCompiler
 * @param {number} timeMs — current playback time in milliseconds
 * @param {object} [options] — reserved for future use
 * @returns {object} PlaybackFrame
 */
export function buildPlaybackFrame(timeline, timeMs, options = {}) {
  const durationMs = timeline?.durationMs || 0;
  const clampedTime = clamp(timeMs, 0, durationMs);
  const clips = timeline?.clips || [];

  // Active clips: startMs <= timeMs < startMs + durationMs
  const activeClips = [];
  for (const clip of clips) {
    if (clampedTime >= clip.startMs && clampedTime < clip.startMs + clip.durationMs) {
      activeClips.push(clip);
    }
  }

  // Derive IDs (deduped)
  const activeClipIds = activeClips.map(c => c.id);
  const activeActionIds = [...new Set(
    activeClips.map(c => c.actionId).filter(Boolean)
  )];

  // Map active clips to lightweight effects
  const effects = activeClips.map(clip => {
    const clipDuration = clip.durationMs || 1;
    const progress = clamp((clampedTime - clip.startMs) / clipDuration, 0, 1);

    return {
      id: `fx-${clip.id}`,
      effectType: clip.clipType,
      clipId: clip.id,
      sourceEventId: clip.sourceEventId,
      actionId: clip.actionId,
      actorId: clip.actorId,
      targetId: clip.targetId,
      progress,
      payload: clonePlainData(clip.payload),
    };
  });

  // activeClips are deep-cloned so frame consumers cannot mutate the original timeline
  const safeActiveClips = activeClips.map(c => clonePlainData(c));

  return createPlaybackFrame({
    timeMs: clampedTime,
    durationMs,
    phaseId: null,
    activeActionIds,
    activeClipIds,
    activeClips: safeActiveClips,
    sceneState: null,
    effects,
  });
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ── Class-based API ──

export class PresentationTimelinePlayback {
  #timeline = null;
  #timeMs = 0;

  /**
   * @param {object} timeline — PresentationTimeline from PresentationTimelineCompiler
   */
  constructor(timeline) {
    this.#timeline = timeline || { schemaVersion: 1, turnNumber: 0, durationMs: 0, tracks: [], clips: [] };
  }

  /**
   * Seek to a specific time position.
   * @param {number} timeMs
   * @returns {this}
   */
  seek(timeMs) {
    this.#timeMs = timeMs;
    return this;
  }

  /**
   * Get the current PlaybackFrame.
   * @returns {object} PlaybackFrame
   */
  getFrame() {
    return buildPlaybackFrame(this.#timeline, this.#timeMs);
  }

  /**
   * Return the current time position without building a frame.
   * @returns {number}
   */
  getCurrentTime() {
    return this.#timeMs;
  }

  /**
   * Return the total timeline duration.
   * @returns {number}
   */
  getDuration() {
    return this.#timeline?.durationMs || 0;
  }
}
