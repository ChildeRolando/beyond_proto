// BattleSceneStore — accumulates stable battle state, interaction state,
// playback frames, and effects; produces a BattleScene on demand via getScene().
//
// Pure data store. Does NOT read GameEngine, BattleSessionController, DOM,
// canvas, or renderer code. Does NOT mutate inputs. Does NOT advance time.
//
// Milestone 3 / Task 3.2

import { createBattleScene } from './BattleScene.js';

/**
 * Store that holds the current battle presentation state and produces
 * a BattleScene object for renderer consumption.
 *
 * Lifecycle:
 *   1. setBaseState(state)       — once per turn / after snapshot
 *   2. setInteraction(interaction) — per frame, from UI input controller
 *   3. setPlaybackFrame(frame)   — per frame, from TurnPlaybackController (optional)
 *   4. setEffects(effects)       — per frame, active presentation effects
 *   5. getScene()                — called by renderer each frame
 */
export class BattleSceneStore {
  #baseState = null;
  #interaction = {};
  #playbackFrame = null;
  #effects = [];

  /**
   * @param {object|null} [initialState=null] — initial battle state (from GameEngine.getState or snapshot)
   */
  constructor(initialState = null) {
    this.#baseState = initialState;
  }

  /** Replace the base battle state (called once per turn or on snapshot restore). */
  setBaseState(state) {
    this.#baseState = state || null;
  }

  /** Replace the UI interaction state (called each frame from the input controller). */
  setInteraction(interaction) {
    this.#interaction = interaction || {};
  }

  /** Set the current playback frame (when in playback/replay mode). */
  setPlaybackFrame(frame) {
    this.#playbackFrame = frame || null;
  }

  /** Set the active presentation effects for the current frame. */
  setEffects(effects) {
    this.#effects = effects || [];
  }

  /**
   * Produce the current BattleScene.
   *
   * - mode is 'playback' when a playbackFrame is set, otherwise 'live'.
   * - effects come from playbackFrame.effects if available, otherwise from setEffects().
   * - All inputs are shallow-cloned so the returned scene is safe to mutate.
   *
   * @returns {object} BattleScene
   */
  getScene() {
    const mode = this.#playbackFrame ? 'playback' : 'live';

    // Effects priority: playbackFrame.effects > explicit setEffects()
    const effects = this.#playbackFrame?.effects
      ? [...this.#playbackFrame.effects]
      : [...this.#effects];

    return createBattleScene({
      mode,
      state: this.#baseState,
      interaction: this.#interaction,
      effects,
      playback: this.#playbackFrame,
    });
  }

  /**
   * Reset the store to its initial empty state.
   */
  reset() {
    this.#baseState = null;
    this.#interaction = {};
    this.#playbackFrame = null;
    this.#effects = [];
  }
}

/**
 * Pure-function variant: create a BattleScene from individual inputs.
 * Useful when you don't need the store lifecycle.
 *
 * @param {object} opts
 * @param {object|null} [opts.baseState=null]
 * @param {object} [opts.interaction={}]
 * @param {object|null} [opts.playbackFrame=null]
 * @param {Array} [opts.effects=[]]
 * @returns {object} BattleScene
 */
export function createBattleSceneFromState({
  baseState = null,
  interaction = {},
  playbackFrame = null,
  effects = [],
} = {}) {
  const mode = playbackFrame ? 'playback' : 'live';
  const resolvedEffects = playbackFrame?.effects
    ? [...playbackFrame.effects]
    : [...effects];

  return createBattleScene({
    mode,
    state: baseState,
    interaction,
    effects: resolvedEffects,
    playback: playbackFrame,
  });
}
