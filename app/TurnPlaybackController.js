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
  renderAll,
  setSubmitStatus,
  setExecuteDisabled,
} = {}) {
  const state = {
    playing: false,
    skipRequested: false,
    resolution: null,
    activeSpeed: null,
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

  function resetTimelineDom() {
    const timeline = getTimelineEl();
    if (!timeline) return;
    timeline.classList.remove('show', 'complete');
    timeline.dataset.playing = '0';
    const axis = getAxisEl();
    if (axis) axis.innerHTML = '';
    const activeSpeedEl = getActiveSpeedEl();
    if (activeSpeedEl) activeSpeedEl.textContent = '等待回放';
    const summaryEl = getSummaryEl();
    if (summaryEl) summaryEl.textContent = '';
    const completeEl = getCompleteEl();
    if (completeEl) completeEl.hidden = true;
  }

  function reset() {
    state.playing = false;
    state.skipRequested = false;
    state.resolution = null;
    state.activeSpeed = null;
    state.startedEventIdsInCurrentPhase = [];
    state.completedEventIdsInCurrentPhase = [];
    state.phaseStartCountBySpeed = new Map();
    resetTimelineDom();
  }

  function renderTimeline(phases = []) {
    const timeline = getTimelineEl();
    const axis = getAxisEl();
    if (!timeline || !axis) return;

    axis.innerHTML = phases.map(phase => `
      <div class="resolution-phase" data-testid="resolution-phase-speed-${phase.speed}" data-speed="${phase.speed}">
        <span class="resolution-phase-label">Speed ${phase.speed}</span>
        <span class="resolution-phase-count">${phase.summary || `Speed ${phase.speed}`}</span>
      </div>
    `).join('') + `
      <div class="resolution-phase resolution-phase-end" data-testid="resolution-phase-end" data-speed="end">
        <span class="resolution-phase-label">End</span>
        <span class="resolution-phase-count">完成</span>
      </div>
    `;

    timeline.classList.add('show');
    timeline.dataset.playing = '1';
    const skipBtn = getSkipEl();
    if (skipBtn) skipBtn.hidden = false;
    const completeEl = getCompleteEl();
    if (completeEl) completeEl.hidden = true;
  }

  function setActiveSpeed(speed, summary = '') {
    state.activeSpeed = speed;
    const timeline = getTimelineEl();
    if (!timeline) return;
    timeline.querySelectorAll('.resolution-phase').forEach(node => {
      node.classList.toggle('active', node.dataset.speed === String(speed));
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

  async function play(turnData) {
    if (!turnData?.resolution) return { success: false, error: 'missing_resolution' };
    if (state.playing) return { success: false, error: 'playback_in_progress' };

    const battleSession = getBattleSession?.();
    if (!battleSession) return { success: false, error: 'no_battle_session' };

    state.playing = true;
    state.skipRequested = false;
    state.resolution = structuredClone(turnData.resolution);
    state.activeSpeed = null;
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
      activeSpeed: state.activeSpeed,
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
  reset();

  return {
    play,
    skip,
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
    get skipRequested() { return state.skipRequested; },
  };
}
