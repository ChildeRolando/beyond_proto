// StartModeActions — start lobby mode transition actions.
// Extracted from AppRuntime to keep the composition root small.

export function createStartModeActions({
  getConfigSession,
  getNetworkSession,
  battleRender,
  getTutorialManager,
  lifecycle,
  getGameModeEnum,
}) {
  function startLocalConfig(mode, headerText, headerLabels = {}) {
    getNetworkSession()?.disconnect();
    const configSession = getConfigSession();
    configSession.resetPlayerConfigs();
    battleRender.setBattleHeader(headerText, 'local', false, headerLabels);
    configSession.showConfigScreen(mode);
  }

  function startLegacyPveConfig() {
    getNetworkSession()?.disconnect();
    const configSession = getConfigSession();
    configSession.resetPlayerConfigs();
    battleRender.setBattleHeader('PVE', 'local', false, { leftLabel: 'P1', rightLabel: 'AI' });
    configSession.showConfigScreen('pve');
  }

  function startP2PConfig(mode, headerText, subMode = 'draft') {
    getNetworkSession()?.disconnect();
    const configSession = getConfigSession();
    configSession.resetPlayerConfigs();
    configSession.setConfigMode(mode);
    configSession.setP2PSubMode(subMode);
    battleRender.setBattleHeader(headerText, 'p2p', true);
  }

  function startTutorial() {
    getNetworkSession()?.disconnect();
    getTutorialManager().reset();
    lifecycle.startTutorialLevel('tutorial_move_execute');
  }

  function backStart() {
    getNetworkSession()?.disconnect();
  }

  function createRoom({ serverAddr, ui }) {
    return getNetworkSession()?.createRoom({ serverAddr, ui });
  }

  function joinRoom({ roomCode, serverAddr, ui }) {
    return getNetworkSession()?.joinRoom({ roomCode, serverAddr, ui });
  }

  return {
    startLocalConfig,
    startLegacyPveConfig,
    startP2PConfig,
    startTutorial,
    backStart,
    createRoom,
    joinRoom,
  };
}
