// BattleScene — canonical render scene for BattleCanvasRenderer.
// Pure data contract. Must not import GameEngine, BattleSessionController,
// DOM, canvas, or renderer code.
//
// A BattleScene is the single source of truth for what the renderer draws.
// It is produced by BattleSceneStore (live mode or playback mode) and
// consumed exclusively by BattleCanvasRenderer.render(scene).

/**
 * Deep-clone plain JSON-compatible data (POJOs, arrays, primitives).
 * Uses structuredClone when available; falls back to JSON round-trip.
 * Does NOT support functions, DOM nodes, or class instances.
 *
 * @param {*} value
 * @returns {*} deep copy
 */
export function clonePlainData(value) {
  if (value === null || value === undefined) return value;
  // Prefer structuredClone (Node 17+, modern browsers)
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch (_e) {
      // Fall through to JSON fallback (e.g. if value has non-cloneable parts)
    }
  }
  // JSON fallback: handles POJOs, arrays, primitives
  return JSON.parse(JSON.stringify(value));
}

/**
 * Create a canonical BattleScene object with safe defaults.
 * All inputs are deep-cloned — mutating the returned scene does NOT
 * affect the original inputs or the store's internal state.
 *
 * @param {object} opts
 * @param {'live'|'playback'} [opts.mode='live']
 * @param {object|null} [opts.state=null]
 * @param {object} [opts.interaction={}]
 * @param {Array} [opts.effects=[]]
 * @param {object|null} [opts.playback=null]
 * @returns {object} BattleScene
 */
export function createBattleScene({
  mode = 'live',
  state = null,
  interaction = {},
  effects = [],
  playback = null,
} = {}) {
  // Deep-clone all inputs so the returned scene is fully isolated.
  const rawState = state ? clonePlainData(state) : {};
  const safeState = rawState;
  const safeEffects = clonePlainData(effects || []);
  const safePlayback = playback ? clonePlainData(playback) : null;

  // Interaction: merge defaults then deep-clone
  const mergedInteraction = {
    hoverEffectArea: [],
    validTargets: [],
    tutorialHints: [],
    hoveredHex: null,
    localSubmittedCharacterIds: [],
    remoteSubmittedCharacterIds: [],
    selectedCharacterId: null,
    lastHoveredCharacterId: null,
    ...interaction,
  };
  const safeInteraction = clonePlainData(mergedInteraction);

  return {
    mode,
    turn: safeState.turn ?? null,
    phase: safeState.phase ?? null,
    teams: safeState.teams || [],
    rules: safeState.rules || null,
    entities: safeState.entities || [],
    characters: safeState.characters || [],
    projectiles: safeState.projectiles || [],
    casings: safeState.casings || [],
    wildBullets: safeState.wildBullets || [],
    logs: safeState.logs || [],
    interaction: safeInteraction,
    effects: safeEffects,
    playback: safePlayback,
  };
}

/**
 * Type guard: returns true if value is a valid BattleScene shape.
 * @param {*} value
 * @returns {boolean}
 */
export function isBattleScene(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.characters));
}
