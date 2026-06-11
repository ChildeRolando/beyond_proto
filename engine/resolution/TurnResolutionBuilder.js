import { GameEngine } from '../GameEngine.js';
import { buildActionSummaries } from './ResolutionActionSummarizer.js';

/**
 * Extract a { characters } view from a snapshot for buildActionSummaries.
 * Does NOT store this in the resolution — it's a transient helper for the summarizer.
 */
function charactersFromSnapshot(snapshot) {
  if (!snapshot?.registry?.entities) return { characters: [] };
  const characters = snapshot.registry.entities
    .filter(e => e.type === 'CHARACTER')
    .map(e => ({
      id: e.id,
      name: e.name,
      class: e.class || null,
      roleId: e.roleId || null,
      ownerId: e.ownerId || null,
      position: e.position || null,
    }));
  return { characters };
}

function createResolutionRecorder({
  captureSnapshot,
}) {
  const resolution = {
    schemaVersion: 2,
    turnNumber: 1,
    initialSnapshot: null,
    finalSnapshot: null,
    phases: [],
  };

  return {
    captureSnapshot,
    resolution,
    onTurnStart({ turnNumber }) {
      resolution.turnNumber = turnNumber;
    },
    onPhaseStart({ speed, commandCount }) {
      const phaseKind = speed != null ? 'speed' : 'end_of_turn';
      const phaseId = speed != null
        ? `turn-${resolution.turnNumber}-speed-${speed}`
        : `turn-${resolution.turnNumber}-end`;
      const phase = {
        id: phaseId,
        phaseKind,
        speed: speed ?? null,
        commandCount: commandCount ?? 0,
        beforeSnapshot: captureSnapshot?.() || null,
        afterSnapshot: null,
        events: [],
        summary: '',
        actionCount: 0,
        actions: [],
      };
      resolution.phases.push(phase);
      return phase;
    },
    onPhaseEnd(phase) {
      if (!phase) return;
      phase.afterSnapshot = captureSnapshot?.() || null;
      const charView = charactersFromSnapshot(phase.afterSnapshot);
      phase.actions = buildActionSummaries(phase, charView);
      phase.actionCount = phase.actions.length;
      const speedLabel = phase.speed != null ? `Speed ${phase.speed}` : 'End of Turn';
      phase.summary = `${speedLabel}: ${phase.actionCount} action${phase.actionCount === 1 ? '' : 's'}`;
    },
    finalize({ initialSnapshot, finalSnapshot }) {
      resolution.initialSnapshot = initialSnapshot || null;
      resolution.finalSnapshot = finalSnapshot || null;
      resolution.phases = resolution.phases.filter(phase => phase.events.length > 0);
      for (const phase of resolution.phases) {
        if (!Array.isArray(phase.actions) || phase.actions.length === 0) {
          const charView = charactersFromSnapshot(phase.afterSnapshot);
          phase.actions = buildActionSummaries(phase, charView);
        }
        phase.actionCount = phase.actions.length;
        const speedLabel = phase.speed != null ? `Speed ${phase.speed}` : 'End of Turn';
        phase.summary = `${speedLabel}: ${phase.actionCount} action${phase.actionCount === 1 ? '' : 's'}`;
      }
      return structuredClone(resolution);
    },
  };
}

export class TurnResolutionBuilder {
  async build(engine) {
    const initialSnapshot = engine.createSnapshot();
    const sim = new GameEngine();
    sim.restoreSnapshot(initialSnapshot);

    const recorder = createResolutionRecorder({
      captureSnapshot: () => sim.createSnapshot(),
    });
    sim.turnManager.setResolutionRecorder(recorder);

    const executeResult = await sim.executeTurn();
    const finalSnapshot = sim.createSnapshot();
    sim.turnManager.clearResolutionRecorder?.();

    const resolution = recorder.finalize({ initialSnapshot, finalSnapshot });

    return {
      success: executeResult.success,
      battleEnded: executeResult.battleEnded,
      resolution,
      finalSnapshot,
    };
  }
}

export function createTurnResolutionBuilder() {
  return new TurnResolutionBuilder();
}
