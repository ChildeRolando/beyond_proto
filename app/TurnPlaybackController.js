import { SKILLS } from '../engine/SkillData.js';
import { GameMode } from './GameModes.js';
import { getSkillIconSrc } from '../ui/shared/SkillIconAssets.js';

function createCountdownWait(ms, shouldAbort) {
  const start = performance.now();
  return new Promise(resolve => {
    const tick = () => {
      if (shouldAbort()) {
        resolve('aborted');
        return;
      }
      if (performance.now() - start >= ms) {
        resolve('done');
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function phaseDuration(event) {
  switch (event?.type) {
    case 'move':
      return 160;
    case 'attack':
      return 180;
    case 'resource':
    case 'status':
    case 'utility':
      return 90;
    default:
      return 120;
  }
}

export function createTurnPlaybackController({
  getBattleSession,
  getEl,
  getCharacterPortraitSrc,
  getCurrentGameMode,
  renderAll,
  setSubmitStatus,
  setExecuteDisabled,
} = {}) {
  const state = {
    playing: false,
    playbackStatus: 'idle',
    skipRequested: false,
    resolution: null,
    activeSpeed: null,
    selectedSpeed: null,
    collapsed: false,
    startedEventIdsInCurrentPhase: [],
    completedEventIdsInCurrentPhase: [],
    phaseStartCountBySpeed: new Map(),
  };

  const getTimelineEl = () => getEl?.('resolution-timeline') || null;
  const getAxisEl = () => getEl?.('resolution-axis') || null;
  const getActiveSpeedEl = () => getEl?.('resolution-active-speed') || null;
  const getSummaryEl = () => getEl?.('resolution-phase-summary') || null;
  const getCompleteEl = () => getEl?.('resolution-complete') || null;
  const getSkipEl = () => getEl?.('resolution-skip') || null;
  const getCloseEl = () => getEl?.('resolution-timeline-close') || null;
  const getOpenEl = () => getEl?.('resolution-timeline-open') || null;

  function getActorForAction(phase, action) {
    const characters = phase?.viewState?.characters || [];
    return characters.find(char => char.id === action.actorId) || null;
  }

  function getAvatarSrc(phase, action) {
    const actor = getActorForAction(phase, action);
    return getCharacterPortraitSrc?.(actor) || '';
  }

  function getSkillSrc(action) {
    const skill = action.skillId ? SKILLS[action.skillId] : null;
    return getSkillIconSrc(skill);
  }

  function getTimelineActionLabel(action) {
    if (action.ownerId === 'ai') return 'AI';
    if (getCurrentGameMode?.() === GameMode.LOCAL_SOLO && action.ownerId === 'player2') {
      return 'AI';
    }
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

  function setCollapsed(collapsed) {
    state.collapsed = Boolean(collapsed);
    applyCollapsedState();
  }

  function renderActionCard(phase, action) {
    const avatarSrc = getAvatarSrc(phase, action);
    const skillSrc = getSkillSrc(action);
    const actor = getActorForAction(phase, action);
    // Stable fallback: use action.actorRoleId for avatar when viewState actor is missing (battle-end).
    // actorRoleId is required by getCharacterPortraitSrc — class/name alone are insufficient.
    const actorForAvatar = actor || (
      action.actorRoleId
        ? { roleId: action.actorRoleId, class: action.actorClass, name: action.actorName }
        : null
    );
    const effectiveAvatarSrc = avatarSrc || (actorForAvatar ? getCharacterPortraitSrc?.(actorForAvatar) || '' : '');
    const actorInitial = (action.actorName || action.actorId || '?').slice(0, 1);
    const avatarHtml = effectiveAvatarSrc
      ? `<img class="resolution-action-avatar" src="${effectiveAvatarSrc}" alt="${action.actorName || action.actorId || '角色'}">`
      : `<div class="resolution-action-avatar-fallback">${actorInitial}</div>`;
    const skillIconHtml = skillSrc
      ? `<img class="resolution-action-skill-icon" src="${skillSrc}" alt="${action.skillName || '技能'}">`
      : '';

    // Render effectLines as separate rows with kind-based CSS classes; fall back to summaryText
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
    const actionCards = actions.map(action => renderActionCard(phase, action)).join('');
    const actionCount = typeof phase.actionCount === 'number' ? phase.actionCount : actions.length;
    return `
      <div class="resolution-phase" data-testid="resolution-phase-speed-${phase.speed}" data-speed="${phase.speed}">
        <div class="resolution-phase-head">
          <span class="resolution-phase-label">Speed ${phase.speed}</span>
          <span class="resolution-phase-count">${actionCount} ${actionCount === 1 ? 'action' : 'actions'}</span>
        </div>
        <div class="resolution-action-list">${actionCards || '<div class="resolution-action-summary">无动作</div>'}</div>
      </div>
    `;
  }

  function resetTimelineDom() {
    const timeline = getTimelineEl();
    if (!timeline) return;
    timeline.classList.remove('show', 'complete');
    timeline.dataset.playing = '0';
    timeline.dataset.collapsed = '0';
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

  function reset() {
    state.playing = false;
    state.playbackStatus = 'idle';
    state.skipRequested = false;
    state.resolution = null;
    state.activeSpeed = null;
    state.selectedSpeed = null;
    state.collapsed = false;
    state.startedEventIdsInCurrentPhase = [];
    state.completedEventIdsInCurrentPhase = [];
    state.phaseStartCountBySpeed = new Map();
    resetTimelineDom();
  }

  function renderTimeline(phases = []) {
    const timeline = getTimelineEl();
    const axis = getAxisEl();
    if (!timeline || !axis) return;

    axis.innerHTML = phases.map(renderPhaseCard).join('') + `
      <div class="resolution-phase resolution-phase-end" data-testid="resolution-phase-end" data-speed="end">
        <div class="resolution-phase-head">
          <span class="resolution-phase-label">End</span>
          <span class="resolution-phase-count">${state.playbackStatus === 'complete' ? '完成' : '等待'}</span>
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
  }

  function setActiveSpeed(speed, summary = '') {
    state.activeSpeed = speed;
    state.selectedSpeed = speed;
    const timeline = getTimelineEl();
    if (!timeline) return;
    timeline.querySelectorAll('.resolution-phase').forEach(node => {
      const isSpeed = node.dataset.speed === String(speed);
      node.classList.toggle('active', isSpeed && speed !== 'end');
      node.classList.toggle('selected', isSpeed);
      if (node.dataset.speed === 'end') {
        node.classList.toggle('active', speed === 'end');
      }
    });
    const activeSpeedEl = getActiveSpeedEl();
    if (activeSpeedEl) activeSpeedEl.textContent = speed === 'end' ? 'End' : `Speed ${speed}`;
    const summaryEl = getSummaryEl();
    if (summaryEl) summaryEl.textContent = summary || '';
  }

  function markPhaseComplete(speed) {
    const timeline = getTimelineEl();
    if (!timeline) return;
    const phase = timeline.querySelector(`[data-testid="resolution-phase-speed-${speed}"]`);
    if (phase) phase.classList.add('complete');
  }

  function markComplete(text = '回放完成') {
    const timeline = getTimelineEl();
    if (!timeline) return;
    timeline.classList.add('complete', 'show');
    timeline.dataset.playing = '0';
    state.playbackStatus = 'complete';
    state.activeSpeed = 'end';
    state.selectedSpeed = 'end';
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

  function skip() {
    state.skipRequested = true;
  }

  function toggleCollapsed() {
    setCollapsed(!state.collapsed);
  }

  async function play(turnData) {
    if (!turnData?.resolution) return { success: false, error: 'missing_resolution' };
    if (state.playing) return { success: false, error: 'playback_in_progress' };

    const battleSession = getBattleSession?.();
    if (!battleSession) return { success: false, error: 'no_battle_session' };

    state.playing = true;
    state.playbackStatus = 'playing';
    state.skipRequested = false;
    state.resolution = structuredClone(turnData.resolution);
    state.activeSpeed = null;
    state.selectedSpeed = null;
    state.startedEventIdsInCurrentPhase = [];
    state.completedEventIdsInCurrentPhase = [];
    state.phaseStartCountBySpeed = new Map();

    battleSession.setResolutionPlaybackLocked?.(true);
      battleSession.setResolutionPlaybackState?.({
        viewState: battleSession.getRenderState?.() || battleSession.getState?.() || battleSession.engine?.getState?.(),
        resolution: state.resolution,
        activeSpeed: null,
      });
    setExecuteDisabled?.(true);
    setSubmitStatus?.('回放中...');

    renderTimeline(state.resolution.phases);
    renderAll?.();

    try {
      for (const phase of state.resolution.phases) {
        if (state.skipRequested) break;

        const count = (state.phaseStartCountBySpeed.get(phase.speed) || 0) + 1;
        state.phaseStartCountBySpeed.set(phase.speed, count);
        state.startedEventIdsInCurrentPhase = [];
        state.completedEventIdsInCurrentPhase = [];

        setActiveSpeed(phase.speed, phase.summary);

        const plays = phase.events.map(event => (async () => {
          state.startedEventIdsInCurrentPhase.push(event.id);
          await createCountdownWait(phaseDuration(event), () => state.skipRequested);
          state.completedEventIdsInCurrentPhase.push(event.id);
          return event;
        })());

        await Promise.all(plays);

        if (state.skipRequested) break;

        battleSession.setResolutionPlaybackState?.({
          viewState: phase.viewState || battleSession.getRenderState?.() || battleSession.engine?.getState?.(),
          resolution: state.resolution,
          activeSpeed: phase.speed,
        });
        markPhaseComplete(phase.speed);
        renderAll?.();
      }

      battleSession.setResolutionPlaybackState?.({
        viewState: state.resolution.endState || battleSession.getRenderState?.() || battleSession.engine?.getState?.(),
        resolution: state.resolution,
        activeSpeed: 'end',
        complete: true,
      });
      state.playbackStatus = state.skipRequested ? 'skipped' : 'complete';
      setActiveSpeed('end', state.skipRequested ? '已跳过' : '回放完成');
      markComplete(state.skipRequested ? '已跳过' : '回放完成');
      renderAll?.();
      return { success: true, skipped: state.skipRequested, resolution: state.resolution };
    } finally {
      state.playing = false;
      battleSession.setResolutionPlaybackLocked?.(false);
    }
  }

  function getTimelineState() {
    return {
      playing: state.playing,
      playbackStatus: state.playbackStatus,
      activeSpeed: state.activeSpeed,
      selectedSpeed: state.selectedSpeed,
      collapsed: state.collapsed,
      startedEventIdsInCurrentPhase: [...state.startedEventIdsInCurrentPhase],
      completedEventIdsInCurrentPhase: [...state.completedEventIdsInCurrentPhase],
      phaseStartCountBySpeed: Object.fromEntries(state.phaseStartCountBySpeed.entries()),
      skipRequested: state.skipRequested,
    };
  }

  function getResolution() {
    return state.resolution ? structuredClone(state.resolution) : null;
  }

  function isPlaying() {
    return state.playing;
  }

  function setResolution(resolution) {
    state.resolution = resolution ? structuredClone(resolution) : null;
  }

  getSkipEl()?.addEventListener('click', skip);
  getCloseEl()?.addEventListener('click', () => setCollapsed(true));
  getOpenEl()?.addEventListener('click', () => setCollapsed(false));
  reset();

  return {
    play,
    skip,
    toggleCollapsed,
    setCollapsed,
    reset,
    resetTimelineDom,
    renderTimeline,
    setActiveSpeed,
    markPhaseComplete,
    markComplete,
    getTimelineState,
    getResolution,
    isPlaying,
    setResolution,
    getPlaybackStatus: () => state.playbackStatus,
    get skipRequested() { return state.skipRequested; },
  };
}
