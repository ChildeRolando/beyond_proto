// BattleRenderCoordinator — battle UI rendering and header/status DOM updates.
// Owns rendering coordination but NOT canvas drawing implementation.

import { renderBattlePanelsView } from '../ui/battle/BattlePanelsView.js';
import { renderTurnLog } from '../engine/resolution/ResolutionLogRenderer.js';

export function createBattleRenderCoordinator({
  getEl,
  getBattleSession,
  getBattleCanvasRenderer,
}) {
  const setDisplay = (id, value) => { const el = getEl(id); if (el) el.style.display = value; };
  const setText = (id, text) => {
    const el = getEl(id);
    if (el) el.textContent = text;
  };

  const hideBattleHeaderControls = () => {
    setDisplay('p1-class-select', 'none');
    setDisplay('p2-class-select', 'none');
    setDisplay('btn-start', 'none');
    setDisplay('btn-reset', '');
  };

  const setBattleHeader = (modeText, modeClass, connected = false, headerLabels = {}) => {
    const badge = getEl('mode-badge');
    if (badge) {
      badge.textContent = modeText;
      badge.className = modeClass;
    }
    setDisplay('conn-indicator', connected ? '' : 'none');
    setText('battle-left-label', headerLabels.leftLabel || 'P1');
    setText('battle-vs-label', headerLabels.vsLabel || 'vs');
    setText('battle-right-label', headerLabels.rightLabel || 'P2');
    hideBattleHeaderControls();
  };

  const setSubmitStatus = (text) => setText('submit-status', text);
  const setExecuteDisabled = (disabled) => { const btn = getEl('btn-execute'); if (btn) btn.disabled = disabled; };
  const clearLog = () => { const log = getEl('log'); if (log) log.innerHTML = ''; };
  const hideTutorialHud = () => {
    const hud = getEl('tutorial-hud');
    if (hud) hud.style.display = 'none';
  };

  const setModeBadge = (text, className) => {
    const badge = getEl('mode-badge');
    if (!badge) return;
    badge.textContent = text;
    badge.className = className;
  };

  const setConnectionIndicator = (visible) => setDisplay('conn-indicator', visible ? '' : 'none');

  const isGameOverShown = () => Boolean(getEl('gameover-panel')?.classList.contains('show'));

  function renderPanels() {
    try {
      const battleSession = getBattleSession();
      renderBattlePanelsView(battleSession.getBattlePanelsContext({
        onExecuteTurn: () => getEl('btn-execute')?.click(),
      }));
    } catch (err) {
      console.error('[renderPanels] renderBattlePanelsView failed:', err);
      throw err;
    }
  }

  function renderLog() {
    const logEl = getEl('log');
    if (!logEl) return;
    const battleSession = getBattleSession();

    // When a TurnResolution is available, use the canonical log renderer
    // so combat log and timeline share the same action summaries.
    const resolution = battleSession.getLastTurnResolution?.();
    if (resolution && resolution.phases && resolution.phases.length > 0) {
      const canonicalEntries = renderTurnLog(resolution);
      logEl.innerHTML = canonicalEntries.map(e =>
        `<div class="log-entry log-${e.type || 's'}" data-action-id="${e.actionId || ''}">${e.text}</div>`
      ).join('');
    } else {
      // Legacy fallback: raw Logger entries from engine execution
      const state = battleSession.getRenderState?.() || battleSession.engine?.getState?.();
      const entries = state?.logs || battleSession.engine.logger.getEntries();
      logEl.innerHTML = entries.map(e =>
        `<div class="log-entry log-${e.category || 's'}">[${e.turn || '-'}] ${e.message}</div>`
      ).join('');
    }
    logEl.scrollTop = logEl.scrollHeight;
  }

  function updateTurnUi() {
    const battleSession = getBattleSession();
    const engine = battleSession?.engine;
    if (!engine) return;
    setText('turn-num', engine.turnManager.turnNumber);
    const phaseEl = getEl('phase-text');
    if (!phaseEl) return;
    if (battleSession?.isResolutionPlaybackActive?.()) {
      phaseEl.textContent = '回放';
      phaseEl.style.color = '#e05555';
      phaseEl.style.animation = 'phase-pulse 0.6s ease-in-out';
      return;
    }
    const phase = engine.turnManager.phase;
    phaseEl.textContent = phase;
    if (phase === 'EXECUTE') {
      phaseEl.style.color = '#e05555';
      phaseEl.style.animation = 'phase-pulse 0.6s ease-in-out';
    } else {
      phaseEl.style.color = '#DDBB99';
      phaseEl.style.animation = 'none';
    }
  }

  function renderTutorialHud() {
    const hud = getEl('tutorial-hud');
    if (!hud) return;
    const battleSession = getBattleSession();
    const state = battleSession?.getTutorialState?.();
    const active = Boolean(state?.levelId);
    hud.style.display = active ? 'flex' : 'none';
    if (!active) return;

    setText('tutorial-title', state.title || '');
    setText('tutorial-hud-step', state.levelIndex >= 0 ? `教学 ${state.levelIndex + 1}/3` : '');
    setText('tutorial-objective', state.objective || '');
    setText('tutorial-error', state.errorText || '');
    setText('tutorial-level-complete', state.completionText || '');

    const nextBtn = getEl('tutorial-next');
    if (nextBtn) {
      nextBtn.textContent = state.nextLabel || '下一关';
      nextBtn.style.display = 'inline-flex';
      const canAdvance = Boolean(state.showNext);
      nextBtn.style.opacity = canAdvance ? '1' : '0.45';
      nextBtn.style.pointerEvents = canAdvance ? 'auto' : 'none';
      nextBtn.dataset.ready = canAdvance ? '1' : '0';
      nextBtn.disabled = !canAdvance;
    }

    const skipBtn = getEl('tutorial-skip');
    if (skipBtn) {
      skipBtn.style.display = state.showSkip ? 'inline-flex' : 'none';
    }
  }

  function renderAll(animStep = -1, subT = 0) {
    getBattleCanvasRenderer()?.renderBoard(animStep, subT);
    renderPanels();
    renderLog();
    updateTurnUi();
    renderTutorialHud();
  }

  function resizeCanvas() {
    getBattleCanvasRenderer()?.resize();
  }

  function showDisconnect(reason) {
    setText(
      'disconnect-reason',
      reason === 'peer_left' ? '对手离开了游戏' :
      reason === 'timeout' ? '连接超时' :
      reason === 'connection_lost' ? '网络连接中断' : '连接已断开'
    );
    getEl('disconnect-overlay')?.classList.add('show');
  }

  return {
    setDisplay,
    setBattleHeader,
    hideBattleHeaderControls,
    setSubmitStatus,
    setExecuteDisabled,
    clearLog,
    hideTutorialHud,
    renderPanels,
    renderLog,
    updateTurnUi,
    renderAll,
    resizeCanvas,
    showDisconnect,
    setModeBadge,
    setConnectionIndicator,
    isGameOverShown,
  };
}
