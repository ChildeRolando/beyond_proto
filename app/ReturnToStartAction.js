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
    getEl('disconnect-overlay')?.classList.remove('show');
    getGameOverController()?.hide();
    routeController.setRoute('start');
    getStartLobbyUi()?.hideRoomSetup();
    getStartLobbyUi()?.resetConnectionUI();
  };
}
