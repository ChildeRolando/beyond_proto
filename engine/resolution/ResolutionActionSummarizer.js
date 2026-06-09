// ResolutionActionSummarizer — canonical action-level summaries from TurnResolution events.
// These summaries feed the Timeline (action cards). For combat log, see ResolutionLogRenderer
// which renders event-level detail from phase.events.
//
// Reads ONLY canonical eventType/delta fields. Does NOT read legacy type/amount.

import { SKILLS } from '../SkillData.js';

// ─── Helpers ───

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

// ─── Single action summarization ───

/**
 * @param {string} actionId
 * @param {Array} events — canonical ResolutionEvents (all must have valid eventType)
 * @param {object|null} actor — character object from viewState
 * @param {object|null} skill — SKILLS entry
 * @returns {object} canonical ActionSummary (for Timeline)
 */
export function summarizeOne(actionId, events = [], actor = null, skill = null) {
  const actorId = events[0]?.actorId || null;
  const actorName = actor?.name || actorId || '未知角色';
  const ownerId = actor?.ownerId || null;
  const skillId = events[0]?.skillId || null;
  const skillName = skill?.name || skillId || '未知技能';

  // Key canonical event types
  const actionDeclared = events.find(e => e.eventType === 'action_declared');
  const characterMoved = events.find(e => e.eventType === 'character_moved');
  const damageApplied = events.find(e => e.eventType === 'damage_applied');
  const characterDied = events.find(e => e.eventType === 'character_died');
  const resourceChanged = events.find(e => e.eventType === 'resource_changed');
  const statusApplied = events.find(e => e.eventType === 'status_applied');
  const actionFailed = events.find(e => e.eventType === 'action_failed');
  const projectileCreated = events.find(e => e.eventType === 'projectile_created');

  const summaryParts = [];
  let result = 'utility';
  let targetId = null;
  let targetName = null;
  let damage = null;
  let killed = false;

  if (characterMoved) {
    // Movement action
    result = 'move';
    const to = characterMoved.to || null;
    summaryParts.push(to ? `移动至 ${formatPoint(to)}` : '位移');
  } else if (damageApplied || characterDied || actionFailed) {
    // Attack action
    if (characterDied) {
      result = 'kill';
      killed = true;
      targetId = characterDied.targetId;
      targetName = characterDied.targetName;
    } else if (damageApplied) {
      result = damageApplied.result === 'killed' ? 'kill' : 'hit';
      killed = damageApplied.result === 'killed';
      targetId = damageApplied.targetId;
      targetName = damageApplied.targetName || targetName;
      damage = damageApplied.finalDamage;
    } else if (actionFailed) {
      result = 'miss';
    }

    if (targetName) {
      summaryParts.push(`→${targetName}`);
    } else if (damageApplied?.targetId) {
      summaryParts.push(`→${damageApplied.targetId}`);
    }

    if (killed || result === 'kill') {
      summaryParts.push('击杀');
    } else if (result === 'hit') {
      summaryParts.push('命中');
    } else if (result === 'miss') {
      summaryParts.push('挥空');
    }
  } else if (resourceChanged && resourceChanged.delta != null) {
    const res = resourceChanged.resource || '资源';
    const delta = resourceChanged.delta;

    if (delta > 0) {
      result = 'resource';
      summaryParts.push(`获得 ${res} +${delta}`);
    } else {
      result = 'resource';
      summaryParts.push(`${res} ${delta}`);
    }
  } else if (statusApplied) {
    result = 'status';
    const sName = statusApplied.statusName || statusApplied.statusId || '状态';
    summaryParts.push(`获得 ${sName}`);
  } else if (actionDeclared && projectileCreated) {
    result = 'pending';
    summaryParts.push('发射弹体');
  } else {
    result = 'utility';
    summaryParts.push('辅助效果');
  }

  const summaryText = summaryParts.join(' · ') || '无详细结果';

  return {
    actionId,
    actorId,
    actorName,
    ownerId,
    playerLabel: playerLabelForOwner(ownerId),
    skillId,
    skillName,
    result,
    targetId: targetId || damageApplied?.targetId || null,
    targetName: targetName || null,
    damage,
    killed,
    summaryText,
  };
}

// ─── Phase-level summarization ───

/**
 * @param {object} phase — { speed, events[], viewState }
 * @param {object} viewState — { characters[] }
 * @returns {Array} canonical ActionSummary[]
 */
export function buildActionSummaries(phase, viewState) {
  const charById = new Map((viewState?.characters || []).map(char => [char.id, char]));
  const actionMap = new Map();

  // Group canonical events by actionId
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

  // Summarize each action
  return [...actionMap.values()].map(action => {
    const actor = action.actorId ? charById.get(action.actorId) || null : null;
    const skill = action.skillId ? SKILLS[action.skillId] || null : null;
    return summarizeOne(action.actionId, action.events, actor, skill);
  });
}
