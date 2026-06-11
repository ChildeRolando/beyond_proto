// ResolutionTimelinePanel — pure UI panel that renders resolution timeline
// phases/actions into DOM. Consumes PlaybackFrame for active-state highlighting.
//
// Does NOT control playback time, does NOT import runtime/session/renderer.
// Extracted from the old TurnPlaybackController's UI responsibilities.
//
// Milestone o4.2

import { SKILLS } from '../../engine/SkillData.js';
import { GameMode } from '../../app/GameModes.js';
import { getSkillIconSrc } from '../shared/SkillIconAssets.js';

/**
 * @param {object} opts
 * @param {function} opts.getEl — (id: string) => HTMLElement | null
 * @param {function} [opts.getCharacterPortraitSrc] — (char) => string
 * @param {function} [opts.getCurrentGameMode] — () => string
 * @returns {object} panel API
 */
export function createResolutionTimelinePanel({
  getEl,
  getCharacterPortraitSrc,
  getCurrentGameMode,
} = {}) {
  // ── Element accessors (same IDs as old TurnPlaybackController) ──
  const getTimelineEl   = () => getEl?.('resolution-timeline') || null;
  const getAxisEl       = () => getEl?.('resolution-axis') || null;
  const getActiveSpeedEl = () => getEl?.('resolution-active-speed') || null;
  const getSummaryEl    = () => getEl?.('resolution-phase-summary') || null;
  const getCompleteEl   = () => getEl?.('resolution-complete') || null;
  const getSkipEl       = () => getEl?.('resolution-skip') || null;
  const getCloseEl      = () => getEl?.('resolution-timeline-close') || null;
  const getOpenEl       = () => getEl?.('resolution-timeline-open') || null;

  // ── Internal panel state ──
  const state = {
    collapsed: false,
    currentPhaseId: null,
    currentActiveActionIds: [],
    skipHandler: null,
  };

  // ── Helpers ──

  function getActorForAction(phase, action) {
    const characters = phase?.viewState?.characters || [];
    return characters.find(c => c.id === action.actorId) || null;
  }

  function getAvatarSrc(phase, action) {
    const actor = getActorForAction(phase, action);
    // Fallback: use action metadata when viewState actor is missing (e.g. battle-end)
    const actorForAvatar = actor || (
      action.actorRoleId
        ? { roleId: action.actorRoleId }
        : null
    );
    return getCharacterPortraitSrc?.(actorForAvatar) || '';
  }

  function getTimelineActionLabel(action) {
    if (action.ownerId === 'ai') return 'AI';
    if (getCurrentGameMode?.() === GameMode.LOCAL_SOLO && action.ownerId === 'player2') return 'AI';
    return action.playerLabel || '—';
  }

  function applyCollapsedState() {
    const timeline = getTimelineEl();
    if (!timeline) return;
    const collapsed = Boolean(state.collapsed);
    timeline.dataset.collapsed = collapsed ? '1' : '0';
    const closeBtn = getCloseEl();
    const openBtn = getOpenEl();
    if (closeBtn) closeBtn.hidden = collapsed;
    if (openBtn) openBtn.hidden = !collapsed;
  }

  // ── Card renderers ──

  function renderActionCard(phase, action) {
    const avatarSrc = getAvatarSrc(phase, action);
    const skillSrc = getSkillIconSrc(action.skillId ? SKILLS[action.skillId] : null);
    const actorInitial = (action.actorName || action.actorId || '?').slice(0, 1);

    const avatarHtml = avatarSrc
      ? `<img class="resolution-action-avatar" src="${avatarSrc}" alt="${action.actorName || action.actorId || '角色'}">`
      : `<div class="resolution-action-avatar-fallback">${actorInitial}</div>`;

    const skillIconHtml = skillSrc
      ? `<img class="resolution-action-skill-icon" src="${skillSrc}" alt="${action.skillName || '技能'}">`
      : '';

    const effectRows = (Array.isArray(action.effectLines) && action.effectLines.length > 0)
      ? action.effectLines.map((line, i) => {
          const kind = action.effectLineKinds?.[i] || '';
          const kindClass = kind ? ` resolution-action-effect--${kind}` : '';
          return `<div class="resolution-action-effect${kindClass}">${line}</div>`;
        }).join('')
      : '';

    return `
      <article class="resolution-action-card" data-testid="resolution-action-card" data-action-id="${action.actionId}">
        ${avatarHtml}
        <div class="resolution-action-main">
          <div class="resolution-action-topline">
            <span class="resolution-action-actor">${action.actorName || action.actorId || '未知角色'}</span>
            <span class="resolution-action-player">${getTimelineActionLabel(action)}</span>
          </div>
          <div class="resolution-action-subline">
            ${skillIconHtml}
            <span class="resolution-action-skill-name">${action.skillName || '未知技能'}</span>
          </div>
          ${effectRows
            ? `<div class="resolution-action-effects">${effectRows}</div>`
            : `<div class="resolution-action-summary">${action.summaryText || action.targetSummary || '无详细结果'}</div>`}
        </div>
      </article>
    `;
  }

  function renderPhaseCard(phase) {
    const actions = Array.isArray(phase.actions) ? phase.actions : [];
    const actionCards = actions.map(a => renderActionCard(phase, a)).join('');
    const actionCount = typeof phase.actionCount === 'number' ? phase.actionCount : actions.length;
    return `
      <div class="resolution-phase" data-testid="resolution-phase-speed-${phase.speed}" data-speed="${phase.speed}" data-phase-id="${phase.id || ''}">
        <div class="resolution-phase-head">
          <span class="resolution-phase-label">Speed ${phase.speed}</span>
          <span class="resolution-phase-count">${actionCount} ${actionCount === 1 ? 'action' : 'actions'}</span>
        </div>
        <div class="resolution-action-list">${actionCards || '<div class="resolution-action-summary">无动作</div>'}</div>
      </div>
    `;
  }

  // ── Public API ──

  /** Clear timeline DOM and reset internal state. */
  function reset() {
    state.collapsed = false;
    state.currentPhaseId = null;
    state.currentActiveActionIds = [];
    state.skipHandler = null;

    const timeline = getTimelineEl();
    if (timeline) {
      timeline.classList.remove('show', 'complete');
      timeline.dataset.playing = '0';
      timeline.dataset.collapsed = '0';
    }
    const axis = getAxisEl();
    if (axis) axis.innerHTML = '';
    const activeSpeedEl = getActiveSpeedEl();
    if (activeSpeedEl) activeSpeedEl.textContent = '等待回放';
    const summaryEl = getSummaryEl();
    if (summaryEl) summaryEl.textContent = '';
    const completeEl = getCompleteEl();
    if (completeEl) completeEl.hidden = true;
    const skipBtn = getSkipEl();
    if (skipBtn) skipBtn.hidden = false;
    const closeBtn = getCloseEl();
    if (closeBtn) closeBtn.hidden = false;
    const openBtn = getOpenEl();
    if (openBtn) openBtn.hidden = true;
  }

  /**
   * Render resolution phases/actions into the timeline DOM.
   * @param {object|null} resolution — TurnResolution (schemaVersion 2)
   */
  function renderResolution(resolution) {
    const phases = resolution?.phases || [];
    const timeline = getTimelineEl();
    const axis = getAxisEl();
    if (!timeline || !axis) return;

    axis.innerHTML = phases.map(renderPhaseCard).join('') + `
      <div class="resolution-phase resolution-phase-end" data-testid="resolution-phase-end" data-speed="end">
        <div class="resolution-phase-head">
          <span class="resolution-phase-label">End</span>
          <span class="resolution-phase-count">等待</span>
        </div>
        <div class="resolution-action-list">
          <div class="resolution-action-summary">全部速度阶段播放完成后激活。</div>
        </div>
      </div>
    `;

    timeline.classList.add('show');
    timeline.dataset.playing = '1';
    const skipBtn = getSkipEl();
    if (skipBtn) skipBtn.hidden = false;
    const completeEl = getCompleteEl();
    if (completeEl) completeEl.hidden = true;
    applyCollapsedState();

    state.currentPhaseId = null;
    state.currentActiveActionIds = [];
  }

  /**
   * Update active phase/action highlighting from a PlaybackFrame.
   * @param {object} frame — PlaybackFrame with phaseId, activeActionIds, timeMs
   */
  function updatePlaybackFrame(frame) {
    const timeline = getTimelineEl();
    if (!timeline || !frame) return;

    // Highlight active phase
    const phaseId = frame.phaseId || null;
    if (phaseId !== state.currentPhaseId) {
      state.currentPhaseId = phaseId;
      timeline.querySelectorAll('.resolution-phase').forEach(node => {
        node.classList.remove('active', 'selected');
      });
      if (phaseId) {
        const phaseCard = timeline.querySelector(`[data-phase-id="${phaseId}"]`);
        if (phaseCard) {
          phaseCard.classList.add('active', 'selected');
        }
      }
    }

    // Highlight active actions
    const activeActionIds = frame.activeActionIds || [];
    state.currentActiveActionIds = activeActionIds;
    timeline.querySelectorAll('.resolution-action-card').forEach(card => {
      const aid = card.dataset.actionId;
      card.classList.toggle('active', aid && activeActionIds.includes(aid));
    });

    // Update active speed label
    const activeSpeedEl = getActiveSpeedEl();
    if (activeSpeedEl && frame.timeMs != null) {
      const sec = (frame.timeMs / 1000).toFixed(1);
      activeSpeedEl.textContent = `${sec}s`;
    }
  }

  /**
   * Show completion state with optional text.
   * @param {string} [text='回放完成']
   */
  function markComplete(text = '回放完成') {
    const timeline = getTimelineEl();
    if (!timeline) return;

    timeline.classList.add('complete', 'show');
    timeline.dataset.playing = '0';
    state.currentPhaseId = null;
    state.currentActiveActionIds = [];

    const activeSpeedEl = getActiveSpeedEl();
    if (activeSpeedEl) activeSpeedEl.textContent = 'End';
    const summaryEl = getSummaryEl();
    if (summaryEl) summaryEl.textContent = text;
    const completeEl = getCompleteEl();
    if (completeEl) {
      completeEl.hidden = false;
      completeEl.textContent = text;
    }
  }

  /**
   * Bind a click handler to the skip button.
   * @param {function} onSkip
   */
  function bindSkip(onSkip) {
    state.skipHandler = onSkip;
    const skipBtn = getSkipEl();
    if (skipBtn && onSkip) {
      // Remove any existing handler by cloning
      const newBtn = skipBtn.cloneNode(true);
      skipBtn.parentNode?.replaceChild(newBtn, skipBtn);
      newBtn.addEventListener('click', onSkip);
    }
  }

  /** @param {boolean} collapsed */
  function setCollapsed(collapsed) {
    state.collapsed = Boolean(collapsed);
    applyCollapsedState();
  }

  /** Toggle collapsed state. */
  function toggleCollapsed() {
    setCollapsed(!state.collapsed);
  }

  return {
    reset,
    renderResolution,
    updatePlaybackFrame,
    markComplete,
    bindSkip,
    setCollapsed,
    toggleCollapsed,
  };
}
