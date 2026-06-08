// ResolutionLogRenderer — renders player-facing combat log entries from
// TurnResolution phase.events (event-level detail, NOT action-level summaries).
//
// Timeline uses phase.actions (action-level summaries).
// Combat log uses this module's per-event output.
// Both originate from the same TurnResolution.

import { SKILLS } from '../SkillData.js';

// ─── Single event → log entry ───

function actorNameFor(event, charById) {
  const actor = charById.get(event.actorId);
  return actor?.name || event.actorId || '未知';
}

function attackIcon(skillId) {
  if (!skillId) return '⚔';
  const skill = SKILLS[skillId];
  if (!skill) return '⚔';
  return skill.type === '射击' ? '🔮' : '⚔';
}

function formatPoint(pos) {
  if (!pos) return '';
  return `(${pos.q},${pos.r})`;
}

/**
 * @param {object} event — single ResolutionEvent from phase.events
 * @param {Map} charById — id → character lookup from viewState
 * @returns {{ actionId: string, text: string, type: string } | null}
 */
export function renderEventLogEntry(event, charById = new Map()) {
  const actorName = actorNameFor(event, charById);

  switch (event.type) {
    case 'move': {
      const to = event.to || event.targetPos;
      const dest = to ? formatPoint(to) : '未知';
      return { actionId: event.actionId || null, text: `${actorName} → 移动至 ${dest}`, type: 'move' };
    }

    case 'attack': {
      const icon = attackIcon(event.skillId);
      const targetRef = event.targetName
        || (event.targetPos ? formatPoint(event.targetPos) : '目标');

      if (event.killed) {
        const dmg = event.damage ? `（伤害 ${event.damage}）` : '';
        return { actionId: event.actionId || null, text: `${actorName} ${icon} → ${targetRef} 击杀${dmg}`, type: 'kill' };
      }
      if (event.result === 'hit') {
        const dmg = event.damage ? `（伤害 ${event.damage}）` : '';
        return { actionId: event.actionId || null, text: `${actorName} ${icon} → ${targetRef} 命中${dmg}`, type: 'hit' };
      }
      if (event.result === 'miss') {
        return { actionId: event.actionId || null, text: `${actorName} ${icon} 挥空`, type: 'miss' };
      }
      // pending
      return { actionId: event.actionId || null, text: `${actorName} ${icon} → ${targetRef} 结算中`, type: 'attack' };
    }

    case 'resource': {
      const res = event.resource || '资源';
      const amount = event.amount;
      const amtStr = amount != null ? `${amount >= 0 ? '+' : ''}${amount}` : '';
      return { actionId: event.actionId || null, text: `${actorName} → ${res}${amtStr}`, type: 'resource' };
    }

    case 'status': {
      const pos = event.targetPos ? formatPoint(event.targetPos) : '';
      return { actionId: event.actionId || null, text: `${actorName} → 状态变化 ${pos}`, type: 'status' };
    }

    case 'utility': {
      return { actionId: event.actionId || null, text: `${actorName} → 辅助效果`, type: 'utility' };
    }

    default:
      return null;
  }
}

// ─── Full resolution → log entries ───

/**
 * @param {object} resolution — TurnResolution with phase.events
 * @returns {Array} [{ actionId, text, type }]
 */
export function renderTurnLog(resolution) {
  const entries = [];

  if (resolution.turnNumber) {
    entries.push({
      actionId: null,
      text: `=== 第 ${resolution.turnNumber} 回合 ===`,
      type: 'turn',
    });
  }

  // Build char lookup from all viewStates
  const charById = new Map();
  for (const phase of resolution.phases || []) {
    for (const char of (phase.viewState?.characters || [])) {
      if (!charById.has(char.id)) charById.set(char.id, char);
    }
  }
  for (const char of (resolution.endState?.characters || [])) {
    if (!charById.has(char.id)) charById.set(char.id, char);
  }

  for (const phase of (resolution.phases || [])) {
    for (const event of phase.events || []) {
      const entry = renderEventLogEntry(event, charById);
      if (entry) entries.push(entry);
    }
  }

  if (!resolution.suppressGameOver && resolution.winner) {
    entries.push({
      actionId: null,
      text: `⚡ 战斗结束！胜者: ${resolution.winner}`,
      type: 'battle_end',
    });
  }

  return entries;
}
