// ReturnToStartAction — return to start screen logic.
// Extracted from AppRuntime to keep the composition root small.

export function createReturnToStartAction({
  getEl,
  getBattleSession,
  getGameOverController,
  getStartLobbyUi,
  getTutorialManager,
  routeController,
}) {
  return function returnToStart() {
    getBattleSession()?.resetForReturnToStart();
    getTutorialManager()?.reset();
    getBattleSession()?.setTutorialManager(null);
    // Clean all overlays
    getEl('disconnect-overlay')?.classList.remove('show');
    getEl('tutorial-overlay')?.classList.remove('show');
    getEl('galaxy-overlay')?.classList.remove('show');
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
