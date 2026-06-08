// ResolutionActionSummarizer — canonical action-level summaries from TurnResolution events.
// These summaries feed the Timeline (action cards). For combat log, see ResolutionLogRenderer
// which renders event-level detail from phase.events.

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
 * @param {Array} events — all TurnResolution events for this actionId
 * @param {object|null} actor — character object from viewState
 * @param {object|null} skill — SKILLS entry
 * @returns {object} canonical ActionSummary (for Timeline)
 */
export function summarizeOne(actionId, events = [], actor = null, skill = null) {
  // Primary event types (last of each kind, matching current semantics)
  const attack = [...events].reverse().find(evt => evt.type === 'attack');
  const move = [...events].reverse().find(evt => evt.type === 'move');
  const resource = [...events].reverse().find(evt => evt.type === 'resource');
  const status = [...events].reverse().find(evt => evt.type === 'status');
  const utility = [...events].reverse().find(evt => evt.type === 'utility');

  const actorId = events[0]?.actorId || null;
  const actorName = actor?.name || actorId || '未知角色';
  const ownerId = actor?.ownerId || null;
  const skillId = events[0]?.skillId || null;
  const skillName = skill?.name || skillId || '未知技能';

  // Build summary components
  const summaryParts = [];
  let result = 'utility';

  if (move) {
    result = 'move';
    const to = move.to || move.targetPos || null;
    summaryParts.push(to ? `移动至 ${formatPoint(to)}` : '位移');
  } else if (attack) {
    // Determine sub-result
    if (attack.killed) {
      result = 'kill';
    } else if (attack.result === 'hit') {
      result = 'hit';
    } else if (attack.result === 'miss') {
      result = 'miss';
    } else {
      result = 'pending';
    }

    // Summary text
    if (attack.targetName) {
      summaryParts.push(`→${attack.targetName}`);
    } else if (attack.targetPos) {
      summaryParts.push(`目标 ${formatPoint(attack.targetPos)}`);
    } else {
      summaryParts.push('目标已锁定');
    }
    if (attack.killed) {
      summaryParts.push('击杀');
    } else if (attack.result === 'hit') {
      summaryParts.push('命中');
    } else if (attack.result === 'miss') {
      summaryParts.push('挥空');
    } else {
      summaryParts.push('结算中');
    }
  } else if (resource) {
    result = 'resource';
    const amount = resource.amount ?? '';
    const res = resource.resource || '资源';
    const op = amount !== null && amount !== undefined
      ? `${amount >= 0 ? '+' : ''}${amount}`
      : '';
    summaryParts.push(`${res}${op}`);
  } else if (status) {
    result = 'status';
    summaryParts.push(status.targetPos ? `状态 ${formatPoint(status.targetPos)}` : '状态变化');
  } else if (utility) {
    result = 'utility';
    summaryParts.push('辅助效果');
  } else {
    // Fallback: check if last event has a result hint
    const last = [...events].reverse()[0];
    if (last?.result === 'miss') {
      result = 'miss';
      summaryParts.push('挥空');
    } else {
      result = 'utility';
      summaryParts.push('无详细结果');
    }
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
    targetId: attack?.targetId || null,
    targetName: attack?.targetName || null,
    damage: attack?.damage || null,
    killed: attack?.killed || false,
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

  // Group events by actionId
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
