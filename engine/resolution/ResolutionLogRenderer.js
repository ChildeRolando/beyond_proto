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
/**
 * Render a single ResolutionEvent into a player-facing log entry.
 * Prefers event.eventType (canonical) over event.type (legacy).
 */
export function renderEventLogEntry(event, charById = new Map()) {
  const actorName = actorNameFor(event, charById);
  const targetName = event.targetName
    || (charById.get(event.targetId)?.name)
    || (event.targetPos ? `(${event.targetPos.q},${event.targetPos.r})` : null);
  const et = event.eventType || null;

  // ── Canonical eventType path ──

  if (et === 'action_declared') {
    const skillName = event.skillName || event.skillId || '技能';
    const tgt = event.targetPos ? formatPoint(event.targetPos) : '';
    return { actionId: event.actionId || null, text: `${actorName} → ${skillName}${tgt ? ' ' + tgt : ''}`, type: 'declare' };
  }

  if (et === 'resource_changed') {
    const res = event.resource || '资源';
    const d = event.delta;
    if (d != null && d < 0) {
      return { actionId: event.actionId || null, text: `${actorName} 消耗 ${res} ${Math.abs(d)}`, type: 'resource' };
    }
    if (d != null && d > 0) {
      return { actionId: event.actionId || null, text: `${actorName} 获得 ${res} +${d}`, type: 'resource' };
    }
    // fallback for legacy amount field
    const amt = event.amount;
    if (amt != null) {
      const sign = amt >= 0 ? '+' : '';
      return { actionId: event.actionId || null, text: `${actorName} → ${res}${sign}${amt}`, type: 'resource' };
    }
    return { actionId: event.actionId || null, text: `${actorName} → ${res} 变化`, type: 'resource' };
  }

  if (et === 'character_moved') {
    const from = event.from ? formatPoint(event.from) : '';
    const to = event.to || event.targetPos;
    const dest = to ? formatPoint(to) : '未知';
    if (from) {
      return { actionId: event.actionId || null, text: `${actorName} 移动 ${from}→${dest}`, type: 'move' };
    }
    return { actionId: event.actionId || null, text: `${actorName} 移动至 ${dest}`, type: 'move' };
  }

  if (et === 'damage_applied') {
    const dmg = event.finalDamage ?? event.damage ?? 0;
    const tgt = targetName || '目标';
    return { actionId: event.actionId || null, text: `${tgt} 受到 ${dmg} 伤害`, type: 'hit' };
  }

  if (et === 'damage_absorbed') {
    const layer = event.layer || '防御';
    const absorbed = event.absorbed ?? 0;
    const tgt = targetName || event.actorId || '目标';
    return { actionId: event.actionId || null, text: `${tgt} ${layer}抵消 ${absorbed} 伤害`, type: 'absorb' };
  }

  if (et === 'character_died') {
    const tgt = targetName || event.targetId || '角色';
    return { actionId: event.actionId || null, text: `${tgt} 被击杀`, type: 'kill' };
  }

  if (et === 'status_applied') {
    const sName = event.statusName || event.statusId || '状态';
    const tgt = targetName || actorName;
    return { actionId: event.actionId || null, text: `${tgt} 获得状态 ${sName}`, type: 'status' };
  }

  if (et === 'status_expired' || et === 'status_removed') {
    const sName = event.statusName || event.statusId || '状态';
    const tgt = targetName || actorName;
    return { actionId: event.actionId || null, text: `${tgt} 失去状态 ${sName}`, type: 'status' };
  }

  if (et === 'action_failed') {
    const reason = event.reason || '未知原因';
    return { actionId: event.actionId || null, text: `${actorName} 技能发动失败：${reason}`, type: 'fail' };
  }

  if (et === 'battle_ended') {
    // battle_ended handled in renderTurnLog, not per-event
    return null;
  }

  if (et === 'projectile_created') {
    const from = event.from ? formatPoint(event.from) : '';
    return { actionId: event.actionId || null, text: `${actorName} 🔮 发射弹体${from ? ' ' + from : ''}`, type: 'projectile' };
  }

  if (et === 'projectile_collided') {
    const tgt = targetName || '目标';
    const dmg = event.finalDamage != null ? ` (${event.finalDamage})` : '';
    return { actionId: event.actionId || null, text: `弹体碰撞：${tgt}${dmg}`, type: 'projectile' };
  }

  if (et === 'projectile_expired') {
    return { actionId: event.actionId || null, text: '弹体消散', type: 'projectile' };
  }

  if (et === 'projectile_intercepted') {
    const interceptorName = targetName || event.targetId || '未知';
    return { actionId: event.actionId || null, text: `弹体被拦截：${interceptorName}`, type: 'projectile' };
  }

  if (et === 'projectile_moved') {
    // Omitted from player-facing log by default (too noisy)
    return null;
  }

  // ── Legacy type fallback (events without canonical eventType) ──

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
      return { actionId: event.actionId || null, text: `${actorName} ${icon} → ${targetRef} 结算中`, type: 'attack' };
    }

    case 'resource': {
      // Legacy resource events — only render if no canonical resource_changed exists
      // for the same resource change. These have unsigned amount without delta.
      // The canonical resource_changed (from EventBus) takes precedence.
      const res = event.resource || '资源';
      const amount = event.amount;
      // Skip legacy resource events that lack a delta (they have wrong signs)
      // The EventBus-recorded resource_changed events have correct delta.
      if (event.delta == null) return null;
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
