// ReturnToStartAction — return to start screen logic.
// Extracted from AppRuntime to keep the composition root small.

export function createReturnToStartAction({
  getEl,
  getBattleSession,
  getGameOverController,
  getStartLobbyUi,
  getTutorialManager,
  getConfigSession,
  battleRender,
  routeController,
}) {
  return function returnToStart() {
    getBattleSession()?.resetForReturnToStart();
    getTutorialManager()?.reset();
    getBattleSession()?.setTutorialManager(null);
    // Reset config mode to prevent stale mode pollution
    getConfigSession()?.setConfigMode?.('local');
    // Clean all overlays
    getEl('disconnect-overlay')?.classList.remove('show');
    getEl('tutorial-overlay')?.classList.remove('show');
    getEl('galaxy-overlay')?.classList.remove('show');
    battleRender?.hideTutorialHud?.();
    const tutorialHud = getEl('tutorial-hud');
    if (tutorialHud) tutorialHud.style.display = 'none';
    getGameOverController()?.hide();
    routeController.setRoute('start');
    // Prefer structured reset through the start lobby UI
    if (getStartLobbyUi()?.resetTransientUi) {
      getStartLobbyUi().resetTransientUi();
    } else {
      getStartLobbyUi()?.hideRoomSetup();
      getStartLobbyUi()?.resetConnectionUI();
    }
  };
}
