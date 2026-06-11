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
    interaction: {
      hoverEffectArea: interaction.hoverEffectArea || [],
      validTargets: interaction.validTargets || [],
      hoveredHex: interaction.hoveredHex || null,
      localSubmittedCharacterIds: interaction.localSubmittedCharacterIds || [],
      remoteSubmittedCharacterIds: interaction.remoteSubmittedCharacterIds || [],
      selectedCharacterId: interaction.selectedCharacterId || null,
      lastHoveredCharacterId: interaction.lastHoveredCharacterId || null,
    },
    effects,
    playback,
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
