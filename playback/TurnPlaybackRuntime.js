// TurnPlaybackRuntime — pure playback runtime that drives timeline→frame
// emission over time. Replaces the time-advance / frame-emit responsibility
// of the old TurnPlaybackController.
//
// Does NOT import DOM, canvas, renderer, BattleSessionController,
// AppRuntime, GameEngine, or legacy TurnPlaybackController.
//
// Milestone o4.1

import { createPlaybackClock } from './PlaybackClock.js';

const STATUS = Object.freeze({
  IDLE:      'idle',
  PLAYING:   'playing',
  PAUSED:    'paused',
  COMPLETED: 'completed',
  STOPPED:   'stopped',
});

export class TurnPlaybackRuntime {
  #buildFrame;
  #clock;
  #timeline = null;
  #timeMs = 0;
  #status = STATUS.IDLE;
  #frameId = null;
  #lastWallTime = 0;
  #frameListeners = [];
  #completeListeners = [];

  /**
   * @param {object} [options]
   * @param {function} options.buildFrame — (timeline, timeMs) => PlaybackFrame (required)
   * @param {function} [options.requestFrame] — like requestAnimationFrame
   * @param {function} [options.cancelFrame]  — like cancelAnimationFrame
   * @param {function} [options.now]          — like performance.now
   */
  constructor({
    buildFrame,
    requestFrame,
    cancelFrame,
    now,
  } = {}) {
    if (typeof buildFrame !== 'function') {
      throw new Error('TurnPlaybackRuntime: buildFrame function is required');
    }
    this.#buildFrame = buildFrame;
    this.#clock = createPlaybackClock({ requestFrame, cancelFrame, now });
  }

  // ── Public API ──

  /**
   * Start playing a timeline from the beginning.
   * Emits frame at timeMs=0 immediately, then advances via requestFrame.
   * Completes when timeMs reaches timeline.durationMs.
   *
   * @param {object} timeline — PresentationTimeline
   */
  play(timeline) {
    this.#cancelPending();
    this.#timeline = timeline || null;
    this.#timeMs = 0;
    this.#status = STATUS.PLAYING;
    this.#lastWallTime = this.#clock.now();
    // Emit initial frame synchronously
    this.#emitCurrentFrame();
    // Start ticking
    this.#scheduleTick();
  }

  /** Pause playback. Keeps current timeMs and timeline. */
  pause() {
    if (this.#status !== STATUS.PLAYING) return;
    this.#status = STATUS.PAUSED;
    this.#cancelPending();
  }

  /** Resume playback from the current timeMs. */
  resume() {
    if (this.#status !== STATUS.PAUSED) return;
    this.#status = STATUS.PLAYING;
    this.#lastWallTime = this.#clock.now();
    this.#scheduleTick();
  }

  /**
   * Stop playback. Does NOT trigger complete.
   * State becomes 'stopped'.
   */
  stop() {
    this.#cancelPending();
    this.#status = STATUS.STOPPED;
  }

  /**
   * Skip to the end of the timeline.
   * Emits final frame at timeMs=durationMs, triggers complete,
   * state becomes 'completed'.
   */
  skipToEnd() {
    this.#cancelPending();
    const duration = this.#timeline?.durationMs || 0;
    this.#timeMs = duration;
    this.#status = STATUS.COMPLETED;
    this.#emitCurrentFrame();
    this.#notifyComplete();
  }

  /**
   * Seek to a specific time position.
   * Clamps to [0, durationMs]. Emits the frame at that position.
   * If currently playing, continues from the new position.
   *
   * @param {number} timeMs
   */
  seek(timeMs) {
    const duration = this.#timeline?.durationMs || 0;
    this.#timeMs = clamp(timeMs, 0, duration);
    // Emit frame at the new position
    if (this.#status !== STATUS.IDLE) {
      this.#emitCurrentFrame();
    }
    // Reset wall-clock reference so playback continues from here
    if (this.#status === STATUS.PLAYING) {
      this.#lastWallTime = this.#clock.now();
    }
  }

  /**
   * Register a frame listener. Called on every emitted frame.
   * @param {function} listener — (frame: PlaybackFrame) => void
   * @returns {function} unsubscribe function
   */
  onFrame(listener) {
    this.#frameListeners.push(listener);
    return () => {
      const idx = this.#frameListeners.indexOf(listener);
      if (idx >= 0) this.#frameListeners.splice(idx, 1);
    };
  }

  /**
   * Register a complete listener. Called when playback finishes naturally
   * or via skipToEnd(). NOT called on stop().
   * @param {function} listener — () => void
   * @returns {function} unsubscribe function
   */
  onComplete(listener) {
    this.#completeListeners.push(listener);
    return () => {
      const idx = this.#completeListeners.indexOf(listener);
      if (idx >= 0) this.#completeListeners.splice(idx, 1);
    };
  }

  /**
   * Return current runtime state snapshot.
   * @returns {{ status: string, timeMs: number, durationMs: number, hasTimeline: boolean }}
   */
  getState() {
    return {
      status: this.#status,
      timeMs: this.#timeMs,
      durationMs: this.#timeline?.durationMs || 0,
      hasTimeline: this.#timeline !== null,
    };
  }

  // ── Private ──

  #emitCurrentFrame() {
    if (!this.#buildFrame || !this.#timeline) return;
    const frame = this.#buildFrame(this.#timeline, this.#timeMs);
    for (const listener of this.#frameListeners) {
      try {
        listener(frame);
      } catch (_e) {
        // Swallow listener errors — don't break playback
      }
    }
  }

  #scheduleTick() {
    if (this.#status !== STATUS.PLAYING) return;
    this.#frameId = this.#clock.requestFrame(() => {
      this.#frameId = null;
      if (this.#status !== STATUS.PLAYING) return;

      const now = this.#clock.now();
      const delta = now - this.#lastWallTime;
      this.#lastWallTime = now;
      this.#timeMs += delta;

      const duration = this.#timeline?.durationMs || 0;
      if (this.#timeMs >= duration) {
        this.#timeMs = duration;
        this.#status = STATUS.COMPLETED;
        this.#emitCurrentFrame();
        this.#notifyComplete();
        return;
      }

      this.#emitCurrentFrame();
      this.#scheduleTick();
    });
  }

  #cancelPending() {
    if (this.#frameId !== null) {
      this.#clock.cancelFrame(this.#frameId);
      this.#frameId = null;
    }
  }

  #notifyComplete() {
    for (const listener of this.#completeListeners) {
      try {
        listener();
      } catch (_e) {
        // Swallow listener errors
      }
    }
  }
}

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
