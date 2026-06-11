// BattleScenePipeline — thin live-mode adapter that wires engine state
// + interaction into BattleSceneStore + BattleCanvasRenderer.render(scene).
//
// Pure glue layer. Does NOT read GameEngine directly — receives it via DI.
// Does NOT import presentation/playback Timeline or Compiler.
// Does NOT restore keyframes/animEvents.
//
// Milestone 3 / Task 3.5

/**
 * Build and render a live BattleScene from the current engine and session state.
 *
 * Flow:
 *   engine.getState()
 *   → sceneStore.setBaseState(state)
 *   → sceneStore.setInteraction(battleSession.getRenderViewState())
 *   → sceneStore.getScene()
 *   → renderer.render(scene)
 *
 * @param {object} opts
 * @param {object} opts.engine — GameEngine instance (only getState() is called)
 * @param {object} opts.battleSession — session with getRenderViewState()
 * @param {object} opts.sceneStore — BattleSceneStore instance
 * @param {object} opts.renderer — BattleCanvasRenderer instance
 */
export function renderLiveBattleScene({ engine, battleSession, sceneStore, renderer }) {
  // 1. Capture stable battle state
  const state = engine?.getState?.();
  if (state) {
    sceneStore.setBaseState(state);
  }

  // 2. Capture UI interaction state
  const interaction = battleSession?.getRenderViewState?.() || {};
  sceneStore.setInteraction(interaction);

  // 3. Build scene
  const scene = sceneStore.getScene();

  // 4. Render
  renderer?.render(scene);
}
