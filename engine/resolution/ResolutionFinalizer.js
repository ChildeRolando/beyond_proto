import { buildActionSummaries } from './ResolutionActionSummarizer.js';

function charactersFromSnapshot(snapshot) {
  if (!snapshot?.registry?.entities) return { characters: [] };
  return {
    characters: snapshot.registry.entities
      .filter(entity => entity.type === 'CHARACTER')
      .map(entity => ({
        id: entity.id,
        name: entity.name,
        class: entity.class || null,
        roleId: entity.roleId || null,
        ownerId: entity.ownerId || null,
        position: entity.position || null,
      })),
  };
}

function collectActionMeta(resolution) {
  const actionMetaById = new Map();
  for (const phase of resolution?.phases || []) {
    for (const event of phase.events || []) {
      if (event.eventType !== 'action_declared' || !event.actionId) continue;
      actionMetaById.set(event.actionId, {
        actorId: event.actorId || null,
        skillId: event.skillId || null,
        actorName: event.actorName || null,
        actorOwnerId: event.actorOwnerId || null,
        actorClass: event.actorClass || null,
        actorRoleId: event.actorRoleId || null,
        skillName: event.skillName || null,
      });
    }
  }
  return actionMetaById;
}

function enrichEvent(event, actionMetaById) {
  if (!event?.actionId) return event;
  const meta = actionMetaById.get(event.actionId);
  if (!meta) return event;
  return {
    ...event,
    actorId: event.actorId || meta.actorId || null,
    skillId: event.skillId || meta.skillId || null,
    actorName: event.actorName || meta.actorName || null,
    actorOwnerId: event.actorOwnerId || meta.actorOwnerId || null,
    actorClass: event.actorClass || meta.actorClass || null,
    actorRoleId: event.actorRoleId || meta.actorRoleId || null,
    skillName: event.skillName || meta.skillName || null,
  };
}

export function finalizeResolutionForDisplay(resolution, finalSnapshot = null) {
  if (!resolution) return null;
  const finalView = charactersFromSnapshot(finalSnapshot || resolution.finalSnapshot);
  const actionMetaById = collectActionMeta(resolution);
  const finalized = {
    ...resolution,
    finalSnapshot: resolution.finalSnapshot || finalSnapshot || null,
    phases: (resolution.phases || [])
      .filter(phase => (phase.events || []).length > 0)
      .map(phase => {
        const events = (phase.events || []).map(event => enrichEvent(event, actionMetaById));
        const phaseForSummary = { ...phase, events };
        const actions = buildActionSummaries(phaseForSummary, finalView, { actionMetaById, projectileFacts: phase.projectileFacts || null });
        const speedLabel = phase.speed != null ? `Speed ${phase.speed}` : 'End of Turn';
        return {
          ...phase,
          events,
          afterSnapshot: phase.afterSnapshot || finalSnapshot || resolution.finalSnapshot || null,
          actions,
          actionCount: actions.length,
          summary: `${speedLabel}: ${actions.length} action${actions.length === 1 ? '' : 's'}`,
        };
      }),
  };
  return finalized;
}
