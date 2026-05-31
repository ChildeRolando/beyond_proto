// NetworkMessageRouter — creates a message handler that dispatches
// network payloads to the appropriate controllers.
// Does NOT import main.js or AppRuntime.

/**
 * @param {Object} ctx
 * @param {Object} ctx.networkSession
 * @param {Object} ctx.configSession
 * @param {Function} ctx.getChatController
 * @param {Object} ctx.battleSession
 * @param {Function} ctx.getCurrentRoute
 * @param {Function} ctx.startBattleFromConfigs
 * @param {Function} ctx.renderConfigScreen
 * @returns {Function} handleNetworkMessage(payload)
 */
export function createNetworkMessageRouter(ctx) {
  const { networkSession, configSession, getChatController, battleSession, getCurrentRoute, startBattleFromConfigs, renderConfigScreen } = ctx;

  return function handleNetworkMessage(payload) {
    if (payload.type === 'CHAT') {
      const chatController = getChatController?.();
      if (chatController) chatController.appendMessage('对手', payload.text);
    } else if (payload.type === 'CONFIG_UPDATE') {
      const cfg = payload.config;
      if (cfg?.playerId && cfg.playerId !== networkSession.getMyPlayerId()) {
        configSession.applyRemoteConfig(cfg);
        renderConfigScreen();
        networkSession.maybeStartP2PBattle();
      }
    } else if (payload.type === 'CONFIG_LOCK') {
      const playerId = payload.playerId;
      if (playerId && playerId !== networkSession.getMyPlayerId() && configSession.getConfigPlayers()[playerId]) {
        configSession.applyRemoteLock(playerId, payload.locked);
        renderConfigScreen();
        networkSession.maybeStartP2PBattle();
      }
    } else if (payload.type === 'BATTLE_START') {
      if (getCurrentRoute() === 'battle' && battleSession.battleActive) return;
      if (Array.isArray(payload.players)) {
        for (const cfg of payload.players) {
          if (cfg?.playerId) configSession.applyRemoteConfig(cfg);
        }
        startBattleFromConfigs(
          payload.seed || Date.now(),
          payload.players.map((cfg, idx) => configSession.normalizeForPlayer(cfg, idx === 0 ? 'player1' : 'player2'))
        );
      }
    }
  };
}
