// GameOverController — owns game over panel DOM, rematch button, lobby button.
// Delegates business logic to callbacks (setRoute, showConfigScreen, etc.).
// Does NOT import GameEngine, does NOT mutate battle session state directly.

/**
 * Initialize game over controller. Binds DOM buttons and manages
 * #gameover-panel show/hide.
 *
 * @param {Object} ctx
 * @param {BattleSessionController} ctx.battleSession
 * @param {Function} ctx.getNetworkManager - () => NetworkManager | null
 * @param {Function} ctx.getCurrentGameMode - () => string (exact mode e.g. 'local_solo', 'local_coop')
 * @param {Object} ctx.startLobbyUi - start lobby controller instance
 * @param {Object} ctx.callbacks
 * @param {Function} ctx.callbacks.setRoute - (route) => void
 * @param {Function} ctx.callbacks.showConfigScreen - (mode) => void
 * @param {Function} ctx.callbacks.startBattleFromConfigs - (seed, players) => void
 * @param {Function} ctx.callbacks.resetNetworkState - () => void (resets rematch state, disconnects)
 * @param {Function} ctx.callbacks.getBattlePlayerConfigs - () => config[]
 * @param {Function} ctx.callbacks.returnToStart - () => void (unified return to start screen)
 * @returns {Object} controller handle
 */
export function initGameOverController(ctx) {
  const { battleSession, getNetworkManager, getCurrentGameMode, startLobbyUi, callbacks } = ctx;
  const { setRoute, showConfigScreen, startBattleFromConfigs, resetNetworkState, getBattlePlayerConfigs, returnToStart } = callbacks;

  let opponentReadyForRematch = false;

  // ─── Show game over panel ───

  function show(winner) {
    battleSession.clearTurnTimeout();
    document.getElementById('btn-execute').disabled = true;
    document.getElementById('submit-status').textContent = '战斗已结束';
    const winnerText = winner === 'player1' ? '玩家1' : winner === 'player2' ? '玩家2' : '平局';
    document.getElementById('gameover-winner').textContent = `胜者: ${winnerText}`;
    document.getElementById('rematch-class-p1').value = battleSession.player1Class;
    document.getElementById('rematch-class-p2').value = battleSession.player2Class;
    document.getElementById('btn-rematch').disabled = false;
    updateRematchButton();

    document.getElementById('go-p1-pick').style.display = 'none';
    document.getElementById('go-p2-pick').style.display = 'none';

    document.getElementById('gameover-panel').classList.add('show');
  }

  function hide() {
    document.getElementById('gameover-panel').classList.remove('show');
  }

  function updateRematchButton() {
    const btn = document.getElementById('btn-rematch');
    if (opponentReadyForRematch) {
      btn.textContent = '对手已准备，重新开始';
    } else {
      btn.textContent = '重新开始';
    }
  }

  function setOpponentReadyForRematch(ready) {
    opponentReadyForRematch = ready;
    updateRematchButton();
  }

  // ─── Rematch button ───

  document.getElementById('btn-rematch').addEventListener('click', () => {
    const isP2P = getNetworkManager() && getNetworkManager().mode !== 'local';
    const currentMode = getCurrentGameMode();
    hide();
    battleSession.resetForConfigScreen();
    document.getElementById('btn-execute').disabled = true;
    document.getElementById('submit-status').textContent = '等待配置...';
    document.getElementById('log').innerHTML = '';
    battleSession.clearTurnTimeout();
    showConfigScreen(isP2P ? 'p2p' : currentMode);
  });

  // ─── Lobby button ───

  document.getElementById('btn-lobby').addEventListener('click', () => {
    returnToStart();
  });

  // ─── Expose test hook for E2E ───

  if (window.__testHooks) {
    window.__testHooks._gameOverShown = false;
    const origShow = show;
    show = function(winner) {
      window.__testHooks._gameOverShown = true;
      origShow(winner);
    };
  }

  return { show, hide, updateRematchButton, setOpponentReadyForRematch };
}
