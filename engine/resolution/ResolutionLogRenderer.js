// ResolutionLogRenderer — produces player-facing combat log entries from
// canonical TurnResolution action summaries.
//
// Consumed by the UI's renderLog() when a TurnResolution is available.
// Legacy Logger entries (from TurnManager execution) are kept as raw/debug
// trace but are NOT shown as the primary player-facing log when this is active.

/**
 * @param {object} resolution — TurnResolution with phase.actions (canonical summaries)
 * @returns {Array} log entries [{ actionId, text, type }]
 */
export function renderTurnLog(resolution) {
  const entries = [];

  // Turn header
  if (resolution.turnNumber) {
    entries.push({
      actionId: null,
      text: `=== 第 ${resolution.turnNumber} 回合 ===`,
      type: 'turn',
    });
  }

  // Walk phases in speed order (descending: 3 → 2 → 1 → 0)
  const phases = (resolution.phases || []).slice().sort((a, b) => (b.speed || 0) - (a.speed || 0));

  for (const phase of phases) {
    const actions = Array.isArray(phase.actions) ? phase.actions : [];
    for (const action of actions) {
      // Use canonical logText produced by ResolutionActionSummarizer
      if (action.logText) {
        entries.push({
          actionId: action.actionId || null,
          text: action.logText,
          type: action.result || 'utility',
        });
      }
    }
  }

  // Battle-end notification (unless suppressed for tutorial)
  if (!resolution.suppressGameOver && resolution.winner) {
    entries.push({
      actionId: null,
      text: `⚡ 战斗结束！胜者: ${resolution.winner}`,
      type: 'battle_end',
    });
  }

  return entries;
}
