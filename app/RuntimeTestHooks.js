// RuntimeTestHooks — window.__testHooks and window.returnToStart installation.
// Extracted from AppRuntime to keep the composition root small.

import { renderTurnLog } from '../engine/resolution/ResolutionLogRenderer.js';
import { buildActionSummaries } from '../engine/resolution/ResolutionActionSummarizer.js';

export function installRuntimeTestHooks({
  getConfigSession,
  getBattleSession,
  getTutorialManager,
  getTurnPlaybackController,
  routeController,
  routeNetworkMessage,
  returnToStart,
}) {
  window.__testHooks = window.__testHooks || {};
  window.__testHooks.routeNetworkMessage = (payload) => routeNetworkMessage(payload);
  window.__testHooks.getConfigSnapshot = () => {
    const configSession = getConfigSession();
    return {
      mode: configSession.getConfigMode(),
      currentPlayer: configSession.getCurrentConfigPlayer(),
      players: structuredClone(configSession.getConfigPlayers()),
      battleConfigs: structuredClone(configSession.getBattleConfigs()),
    };
  };

  function makeResolutionScenario(kind = 'phase_order') {
    const commonTeams = [
      { teamId: 'player1', ownerId: 'player1', control: 'human', name: 'player1' },
      { teamId: 'player2', ownerId: 'player2', control: 'human', name: 'player2' },
    ];

    const scenarios = {
      phase_order: {
        mode: 'duel',
        teams: commonTeams,
        rules: { friendlyFire: false },
        combatants: [
          {
            id: 'hero_fast',
            teamId: 'player1',
            ownerId: 'player1',
            control: 'human',
            class: '战士',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['warrior_move'],
            position: { q: 0, r: 0 },
          },
          {
            id: 'enemy_slow',
            teamId: 'player2',
            ownerId: 'player2',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_blast'],
            position: { q: 2, r: 0 },
            resources: { qi: 1 },
          },
        ],
      },
      same_speed: {
        mode: 'duel',
        teams: commonTeams,
        rules: { friendlyFire: false },
        combatants: [
          {
            id: 'hero_a',
            teamId: 'player1',
            ownerId: 'player1',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_small_blast'],
            position: { q: 0, r: 0 },
            resources: { qi: 3 },
          },
          {
            id: 'hero_b',
            teamId: 'player1',
            ownerId: 'player1',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_small_blast'],
            position: { q: 0, r: -1 },
            resources: { qi: 3 },
          },
          {
            id: 'enemy_a',
            teamId: 'player2',
            ownerId: 'player2',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_small_blast'],
            position: { q: 2, r: 0 },
            resources: { qi: 3 },
          },
          {
            id: 'enemy_b',
            teamId: 'player2',
            ownerId: 'player2',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_small_blast'],
            position: { q: 2, r: -1 },
            resources: { qi: 3 },
          },
        ],
      },
      speed_priority: {
        mode: 'duel',
        teams: commonTeams,
        rules: { friendlyFire: false },
        combatants: [
          {
            id: 'hero_fast',
            teamId: 'player1',
            ownerId: 'player1',
            control: 'human',
            class: '战士',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['warrior_move'],
            position: { q: 0, r: 0 },
          },
          {
            id: 'enemy_slow',
            teamId: 'player2',
            ownerId: 'player2',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_blast'],
            position: { q: 0, r: -2 },
            resources: { qi: 1 },
          },
        ],
      },
      line_attack: {
        mode: 'duel',
        teams: commonTeams,
        rules: { friendlyFire: false },
        combatants: [
          {
            id: 'hero_line',
            teamId: 'player1',
            ownerId: 'player1',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_dimension_slash'],
            position: { q: 0, r: 0 },
            resources: { qi: 10 },
          },
          {
            id: 'enemy_line',
            teamId: 'player2',
            ownerId: 'player2',
            control: 'human',
            class: '战士',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['warrior_slash'],
            position: { q: 2, r: 0 },
          },
        ],
      },
      multi_attack: {
        mode: 'duel',
        teams: commonTeams,
        rules: { friendlyFire: false },
        combatants: [
          {
            id: 'attacker',
            teamId: 'player1',
            ownerId: 'player1',
            control: 'human',
            class: '法师',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['mage_blast'],
            position: { q: 0, r: 0 },
            resources: { qi: 3 },
          },
          {
            id: 'target_hit',
            teamId: 'player2',
            ownerId: 'player2',
            control: 'human',
            class: '战士',
            roleLoadoutSkillIds: [],
            loadoutSkillIds: ['warrior_rage'],
            position: { q: 0, r: 2 },
            resources: { hp: 80 },
          },
        ],
      },
    };

    return structuredClone(scenarios[kind] || scenarios.phase_order);
  }

  window.__tutorialTest = {
    getState: () => {
      const battleSession = getBattleSession();
      return {
        route: routeController.getRoute(),
        ...(battleSession.getTutorialState?.() || {}),
        battle: structuredClone(battleSession.engine.getState()),
      };
    },
    getCurrentStep: () => getBattleSession().getTutorialState?.()?.stepId || null,
    getCurrentLevel: () => getBattleSession().getTutorialState?.()?.levelId || null,
    selectUnit: (charId) => getBattleSession().setSelectedCharacterId(charId),
    getSelectedUnitId: () => getBattleSession().selectedCharacterId || null,
    selectSkill: (skillId) => {
      const battleSession = getBattleSession();
      const charId = battleSession.getTutorialState?.()?.playerCharacterIds?.[0] || battleSession.getMyCharacterIds()[0];
      return battleSession.selectSkill(charId, skillId);
    },
    canTargetHex: (q, r) => getBattleSession().tutorialManager?.canTargetHex?.(q, r) || false,
    chooseHex: (q, r) => {
      const battleSession = getBattleSession();
      const charId = battleSession.selectedSkill?.charId || battleSession.getTutorialState?.()?.playerCharacterIds?.[0];
      const skillId = battleSession.selectedSkill?.skillId;
      if (!charId || !skillId) return { success: false, error: 'no_selection' };
      return battleSession.submitAction(charId, skillId, { q, r });
    },
    executeTurn: async () => {
      const battleSession = getBattleSession();
      const result = await battleSession.executeLocalTurn();
      // renderTutorialHud will be called by renderAll which is called by executeLocalTurn
      return result;
    },
    getUnit: (id) => structuredClone(getBattleSession().engine.getState().characters.find(c => c.id === id) || null),
  };

  window.__resolutionTest = {
    startDeterministicSpeedScenario: (kind = 'phase_order') => {
      const battleSession = getBattleSession();
      battleSession.setTutorialManager?.(null);
      battleSession.startBattleFromScenario(Date.now(), makeResolutionScenario(kind));
      return battleSession.getRenderState?.();
    },
    submitAction: (characterId, skillId, targetPos) => getBattleSession().submitAction(characterId, skillId, targetPos ?? null),
    forceSubmitAction: (characterId, skillId, targetPos) => {
      const battleSession = getBattleSession();
      const engine = battleSession.engine;
      const result = engine.turnManager.forceSubmitForTest(characterId, skillId, targetPos ?? null);
      if (result.success) {
        // Mark as submitted so engine.areAllAliveRequiredActorsSubmitted() passes
        engine._submitted.add(characterId);
      }
      return result;
    },
    executeTurnAndGetResolution: async () => {
      const battleSession = getBattleSession();
      const preview = await battleSession.buildCurrentTurnResolution();
      return preview?.resolution || null;
    },
    executeRealTurnAndGetResolution: async () => {
      const battleSession = getBattleSession();
      const engine = battleSession.engine;
      // Execute on the real engine (not a clone), capturing resolution via recorder.
      // The TurnManager calls onPhaseStart and pushes events directly to the returned phaseRecord.events.
      const phases = [];
      const recorder = {
        onPhaseStart(data) {
          const phase = { speed: data.speed, commandCount: data.commandCount, events: [] };
          phases.push(phase);
          return phase;
        },
      };
      engine.turnManager.setResolutionRecorder(recorder);
      const result = await engine.executeTurn();
      engine.turnManager.clearResolutionRecorder();

      // Capture post-execution view states for each phase and build canonical action summaries
      const viewState = engine.getState();
      for (const phase of phases) {
        phase.viewState = { characters: viewState.characters.map(c => ({ ...c })) };
        phase.actions = buildActionSummaries(phase, phase.viewState);
      }

      const resolution = {
        phases: phases.filter(p => p.events.length > 0),
        endState: viewState,
      };

      // Store so getCanonicalLog / renderLog can access it
      battleSession.lastTurnResolution = structuredClone(resolution);

      return { ...result, resolution };
    },
    playCurrentResolution: () => {
      const battleSession = getBattleSession();
      const promise = battleSession.executeLocalTurn();
      promise?.catch?.(err => console.error('[resolution-playback]', err));
      return true;
    },
    skipPlayback: () => {
      getTurnPlaybackController?.()?.skip?.();
      const skipBtn = document.querySelector('[data-testid="resolution-skip"]');
      skipBtn?.click?.();
      return true;
    },
    getResolution: () => getBattleSession().getLastTurnResolution?.() || null,
    getTimelineState: () => getTurnPlaybackController?.()?.getTimelineState?.() || {},
    getUnit: (id) => {
      const state = getBattleSession().getRenderState?.();
      return structuredClone(state?.characters?.find(c => c.id === id) || null);
    },
    isInputLocked: () => Boolean(getBattleSession().isResolutionPlaybackActive?.() || getTurnPlaybackController?.()?.isPlaying?.()),
    getCombatLogText: () => {
      const state = getBattleSession().getRenderState?.();
      return (state?.logs || []).map(entry => entry.message).join('\n');
    },
    getCanonicalLog: () => {
      const resolution = getBattleSession().getLastTurnResolution?.();
      if (!resolution) return [];
      return renderTurnLog(resolution);
    },
    getPhaseActions: () => {
      const resolution = getBattleSession().getLastTurnResolution?.();
      if (!resolution) return [];
      return (resolution.phases || []).flatMap(p => p.actions || []);
    },
  };

  window.returnToStart = returnToStart;
}
