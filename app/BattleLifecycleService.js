// BattleLifecycleService — battle lifecycle management.
// Handles battle start/reset/execute lifecycle and turn animation.
// Does NOT own complex DOM manipulation — uses renderCoordinator callbacks.

export function createBattleLifecycleService({
  getBattleSession,
  getConfigSession,
  getNetworkManager,
  isPveMode,
  renderAll,
  clearLog,
  setSubmitStatus,
  setExecuteDisabled,
  setBattleHeader,
  getTutorialManager,
}) {
  const clonePlayerConfig = (cfg) => ({
    playerId: cfg.playerId,
    class: cfg.class,
    roleId: cfg.roleId,
    loadoutSkillIds: [...cfg.loadoutSkillIds],
    roleLoadoutSkillIds: [...(cfg.roleLoadoutSkillIds || [])],
    locked: Boolean(cfg.locked),
  });

  function startBattleFromConfigs(seed = Date.now(), players = getConfigSession()?.getBattlePlayerConfigs() || []) {
    const battleSession = getBattleSession();
    const configSession = getConfigSession();
    const clonedPlayers = players.map(clonePlayerConfig);
    configSession.setBattleConfigs(clonedPlayers);
    battleSession.startBattleFromConfigs(seed, clonedPlayers);
    setExecuteDisabled(true);
    setSubmitStatus('等待提交...');
    clearLog();
    battleSession.clearTurnTimeout();
    battleSession.startTurnTimeout();
  }

  function startBattleFromScenario(seed = Date.now(), scenario) {
    const battleSession = getBattleSession();
    const configSession = getConfigSession();
    const battleScenario = { ...scenario, seed };
    configSession.setBattleConfigs(battleScenario);
    battleSession.startBattleFromScenario(seed, battleScenario);
    setExecuteDisabled(true);
    setSubmitStatus('等待提交...');
    clearLog();
    battleSession.clearTurnTimeout();
    battleSession.startTurnTimeout();
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function animateTurn() {
    const battleSession = getBattleSession();
    const keyframes = battleSession.engine.projectileCalculator.generateKeyframes();
    const animEvents = battleSession.engine.projectileCalculator.getAnimEvents();
    const projs = battleSession.engine.projectileCalculator.projectiles;
    if (keyframes.length === 0 && animEvents.length === 0 && projs.length === 0) return;

    const maxStep = Math.max(
      keyframes.reduce((max, kf) => Math.max(max, kf.step || 0), 0),
      animEvents.reduce((max, e) => Math.max(max, (e.step || 0) + (e.duration || 1) - 1), 0)
    );
    const SUBFRAMES = 4;
    const frameMs = 25;

    for (let s = 0; s <= maxStep; s++) {
      const startSub = s === 0 ? 0 : 1;
      for (let sub = startSub; sub <= SUBFRAMES; sub++) {
        await sleep(frameMs);
        renderAll(s, sub / SUBFRAMES);
      }
    }
    await sleep(200);
    renderAll(-1, 0);
    battleSession.engine.projectileCalculator.clearKeyframes?.();
    battleSession.engine.projectileCalculator.clearAnimEvents();
  }

  async function executeCurrentTurn() {
    const battleSession = getBattleSession();
    const nm = getNetworkManager();
    if (nm && nm.mode !== 'local') {
      battleSession.markP2PReady(nm);
      return;
    }
    if (isPveMode()) {
      await battleSession.submitAiAndExecutePveTurn();
      return;
    }
    await battleSession.executeLocalTurn();
  }

  function resetCurrentBattle() {
    const configSession = getConfigSession();
    const configs = configSession.getBattleConfigs() || configSession.getBattlePlayerConfigs();
    if (isPveMode() && configs?.mode === 'pve_multi') {
      startBattleFromScenario(Date.now(), configs);
      return;
    }
    startBattleFromConfigs(Date.now(), configs);
  }

  function startTutorialLevel(levelId = 'tutorial_move_execute') {
    const tutorialManager = getTutorialManager();
    const scenario = tutorialManager.start(levelId);
    getBattleSession().setTutorialManager(tutorialManager);
    setBattleHeader('教程', 'local', false);
    startBattleFromScenario(Date.now(), scenario);
    // renderAll will be called by startBattleFromScenario -> battleSession.startBattleFromScenario -> renderAll
  }

  function advanceTutorialLevel() {
    const tutorialManager = getTutorialManager();
    const state = tutorialManager?.getState?.();
    if (!state?.levelComplete) return false;
    const nextLevelId = tutorialManager?.getNextLevelId?.();
    if (nextLevelId) {
      startTutorialLevel(nextLevelId);
      return true;
    }
    return null; // caller should handle returnToStart
  }

  return {
    startBattleFromConfigs,
    startBattleFromScenario,
    animateTurn,
    executeCurrentTurn,
    resetCurrentBattle,
    startTutorialLevel,
    advanceTutorialLevel,
  };
}
