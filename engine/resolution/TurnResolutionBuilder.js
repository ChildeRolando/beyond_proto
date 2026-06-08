import { GameEngine } from '../GameEngine.js';
import { SKILLS } from '../SkillData.js';

function formatPoint(pos) {
  if (!pos) return '';
  return `(${pos.q},${pos.r})`;
}

function playerLabelForOwner(ownerId) {
  if (ownerId === 'player1') return 'P1';
  if (ownerId === 'player2') return 'P2';
  if (ownerId === 'ai') return 'AI';
  return ownerId || '—';
}

function summarizeActionEvents(events = []) {
  const attack = [...events].reverse().find(evt => evt.type === 'attack');
  const move = [...events].reverse().find(evt => evt.type === 'move');
  const resource = [...events].reverse().find(evt => evt.type === 'resource');
  const status = [...events].reverse().find(evt => evt.type === 'status');
  const utility = [...events].reverse().find(evt => evt.type === 'utility');

  const parts = [];
  if (move) {
    const to = move.to || move.targetPos || null;
    parts.push(to ? `移动至 ${formatPoint(to)}` : '位移');
  } else if (attack) {
    if (attack.targetName) {
      parts.push(`→${attack.targetName}`);
    } else if (attack.targetPos) {
      parts.push(`目标 ${formatPoint(attack.targetPos)}`);
    } else {
      parts.push('目标已锁定');
    }
    if (attack.killed) {
      parts.push('击杀');
    } else if (attack.result === 'hit') {
      parts.push('命中');
    } else if (attack.result === 'miss') {
      parts.push('挥空');
    } else {
      parts.push('结算中');
    }
  } else if (resource) {
    const amount = resource.amount ?? '';
    const res = resource.resource || '资源';
    const op = amount !== null && amount !== undefined ? `${amount >= 0 ? '+' : ''}${amount}` : '';
    parts.push(`${res}${op}`);
  } else if (status) {
    parts.push(status.targetPos ? `状态 ${formatPoint(status.targetPos)}` : '状态变化');
  } else if (utility) {
    parts.push('辅助效果');
  }

  const last = [...events].reverse()[0];
  if (last?.result === 'miss' && !parts.some(text => /挥空|miss/i.test(text))) {
    parts.push('挥空');
  }
  return parts.join(' · ') || '无详细结果';
}

function buildActionCards(phase, viewState) {
  const charById = new Map((viewState?.characters || []).map(char => [char.id, char]));
  const actionMap = new Map();
  for (const event of phase.events || []) {
    const actionId = event.actionId || event.id;
    if (!actionMap.has(actionId)) {
      actionMap.set(actionId, {
        actionId,
        actorId: event.actorId || null,
        skillId: event.skillId || null,
        events: [],
      });
    }
    actionMap.get(actionId).events.push(event);
  }

  return [...actionMap.values()].map(action => {
    const actor = action.actorId ? charById.get(action.actorId) || null : null;
    const skill = action.skillId ? SKILLS[action.skillId] || null : null;
    const result = summarizeActionEvents(action.events);
    return {
      ...action,
      actorName: actor?.name || action.actorId || '未知角色',
      actorClass: actor?.class || null,
      ownerId: actor?.ownerId || null,
      playerLabel: playerLabelForOwner(actor?.ownerId),
      skillName: skill?.name || action.skillId || '未知技能',
      summaryText: result,
      targetSummary: result,
      resultSummary: result,
    };
  });
}

function createResolutionRecorder({
  captureSnapshot,
  captureViewState,
}) {
  const resolution = {
    turnNumber: 1,
    phases: [],
    endState: null,
    finalSnapshot: null,
  };

  return {
    captureSnapshot,
    captureViewState,
    resolution,
    onTurnStart({ turnNumber }) {
      resolution.turnNumber = turnNumber;
    },
    onPhaseStart({ speed }) {
      const phase = {
        speed,
        events: [],
        summary: '',
        actionCount: 0,
        actions: [],
        snapshot: null,
        viewState: null,
      };
      resolution.phases.push(phase);
      return phase;
    },
    onPhaseEnd(phase) {
      if (!phase) return;
      phase.snapshot = captureSnapshot?.() || null;
      phase.viewState = captureViewState?.() || null;
      phase.actions = buildActionCards(phase, phase.viewState);
      phase.actionCount = phase.actions.length;
      phase.summary = `Speed ${phase.speed}: ${phase.actionCount} action${phase.actionCount === 1 ? '' : 's'}`;
    },
    finalize({ finalSnapshot, finalViewState }) {
      resolution.endState = finalViewState || null;
      resolution.finalSnapshot = finalSnapshot || null;
      resolution.phases = resolution.phases.filter(phase => phase.events.length > 0);
      for (const phase of resolution.phases) {
        if (!Array.isArray(phase.actions) || phase.actions.length === 0) {
          phase.actions = buildActionCards(phase, phase.viewState);
        }
        phase.actionCount = phase.actions.length;
        phase.summary = `Speed ${phase.speed}: ${phase.actionCount} action${phase.actionCount === 1 ? '' : 's'}`;
      }
      return structuredClone(resolution);
    },
  };
}

export class TurnResolutionBuilder {
  async build(engine) {
    const sim = new GameEngine();
    sim.restoreSnapshot(engine.createSnapshot());

    const recorder = createResolutionRecorder({
      captureSnapshot: () => sim.createSnapshot(),
      captureViewState: () => sim.getState(),
    });
    sim.turnManager.setResolutionRecorder(recorder);

    const executeResult = await sim.executeTurn();
    const finalSnapshot = sim.createSnapshot();
    const finalViewState = sim.getState();
    sim.turnManager.clearResolutionRecorder?.();

    const resolution = recorder.finalize({ finalSnapshot, finalViewState });

    return {
      success: executeResult.success,
      battleEnded: executeResult.battleEnded,
      resolution,
      finalSnapshot,
      finalViewState,
    };
  }
}

export function createTurnResolutionBuilder() {
  return new TurnResolutionBuilder();
}
