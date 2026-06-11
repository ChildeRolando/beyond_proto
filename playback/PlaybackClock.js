// PlaybackClock — injectable wall-clock wrappers for TurnPlaybackRuntime.
// Pure data module. No DOM, no window, no document by default.
//
// Milestone o4.1

/**
 * Create a clock instance with injectable timing functions.
 * All functions are replaceable for deterministic testing.
 *
 * @param {object} [options]
 * @param {function} [options.requestFrame] — like requestAnimationFrame(cb→id)
 * @param {function} [options.cancelFrame]  — like cancelAnimationFrame(id)
 * @param {function} [options.now]          — like performance.now()→ms
 * @returns {{ requestFrame: function, cancelFrame: function, now: function }}
 */
export function createPlaybackClock({
  requestFrame = (cb) => setTimeout(cb, 16),
  cancelFrame = (id) => clearTimeout(id),
  now = () => Date.now(),
} = {}) {
  return { requestFrame, cancelFrame, now };
}
