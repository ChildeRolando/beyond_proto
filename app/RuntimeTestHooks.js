// RuntimeTestHooks — window.__testHooks and window.returnToStart installation.
// Extracted from AppRuntime to keep the composition root small.

export function installRuntimeTestHooks({
  getConfigSession,
  getBattleSession,
  getTutorialManager,
  routeController,
  routeNetworkMessage,
  returnToStart,
}) {
  window.__testHooks = window.__testHooks || {};
  window.__testHooks.routeNetworkMessage = (payload) => routeNetworkMessage(payload);
  window.__testHooks.getConfigSnapshot = () => {
    const configSession = getConfigSession();
    return {
      mode: configSession.getConfigMode(),
      currentPlayer: configSession.getCurrentConfigPlayer(),
      players: structuredClone(configSession.getConfigPlayers()),
      battleConfigs: structuredClone(configSession.getBattleConfigs()),
    };
  };

  window.__tutorialTest = {
    getState: () => {
      const battleSession = getBattleSession();
      return {
        route: routeController.getRoute(),
        ...(battleSession.getTutorialState?.() || {}),
        battle: structuredClone(battleSession.engine.getState()),
      };
    },
    getCurrentStep: () => getBattleSession().getTutorialState?.()?.stepId || null,
    getCurrentLevel: () => getBattleSession().getTutorialState?.()?.levelId || null,
    selectUnit: (charId) => getBattleSession().setSelectedCharacterId(charId),
    getSelectedUnitId: () => getBattleSession().selectedCharacterId || null,
    selectSkill: (skillId) => {
      const battleSession = getBattleSession();
      const charId = battleSession.getTutorialState?.()?.playerCharacterIds?.[0] || battleSession.getMyCharacterIds()[0];
      return battleSession.selectSkill(charId, skillId);
    },
    canTargetHex: (q, r) => getBattleSession().tutorialManager?.canTargetHex?.(q, r) || false,
    chooseHex: (q, r) => {
      const battleSession = getBattleSession();
      const charId = battleSession.selectedSkill?.charId || battleSession.getTutorialState?.()?.playerCharacterIds?.[0];
      const skillId = battleSession.selectedSkill?.skillId;
      if (!charId || !skillId) return { success: false, error: 'no_selection' };
      return battleSession.submitAction(charId, skillId, { q, r });
    },
    executeTurn: async () => {
      const battleSession = getBattleSession();
      const result = await battleSession.executeLocalTurn();
      // renderTutorialHud will be called by renderAll which is called by executeLocalTurn
      return result;
    },
    getUnit: (id) => structuredClone(getBattleSession().engine.getState().characters.find(c => c.id === id) || null),
  };

  window.returnToStart = returnToStart;
}
