import { GameEngine } from '../GameEngine.js';
import { buildActionSummaries } from './ResolutionActionSummarizer.js';

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
      phase.actions = buildActionSummaries(phase, phase.viewState);
      phase.actionCount = phase.actions.length;
      phase.summary = `Speed ${phase.speed}: ${phase.actionCount} action${phase.actionCount === 1 ? '' : 's'}`;
    },
    finalize({ finalSnapshot, finalViewState }) {
      resolution.endState = finalViewState || null;
      resolution.finalSnapshot = finalSnapshot || null;
      resolution.phases = resolution.phases.filter(phase => phase.events.length > 0);
      for (const phase of resolution.phases) {
        if (!Array.isArray(phase.actions) || phase.actions.length === 0) {
          phase.actions = buildActionSummaries(phase, phase.viewState);
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
