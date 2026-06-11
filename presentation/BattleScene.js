// BattleScene — canonical render scene for BattleCanvasRenderer.
// Pure data contract. Must not import GameEngine, BattleSessionController,
// DOM, canvas, or renderer code.
//
// A BattleScene is the single source of truth for what the renderer draws.
// It is produced by BattleSceneStore (live mode or playback mode) and
// consumed exclusively by BattleCanvasRenderer.render(scene).

/**
 * Create a canonical BattleScene object with safe defaults.
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
  // Shallow-clone interaction and effects so the returned scene is
  // safe to mutate without polluting the store's internal state.
  const safeInteraction = {
    hoverEffectArea: [],
    validTargets: [],
    hoveredHex: null,
    localSubmittedCharacterIds: [],
    remoteSubmittedCharacterIds: [],
    selectedCharacterId: null,
    lastHoveredCharacterId: null,
    ...interaction,
  };
  const safeEffects = [...effects];
  const safePlayback = playback ? { ...playback } : null;

  return {
    mode,
    turn: state?.turn ?? null,
    phase: state?.phase ?? null,
    teams: state?.teams || [],
    rules: state?.rules || null,
    entities: state?.entities || [],
    characters: state?.characters || [],
    projectiles: state?.projectiles || [],
    casings: state?.casings || [],
    wildBullets: state?.wildBullets || [],
    logs: state?.logs || [],
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
