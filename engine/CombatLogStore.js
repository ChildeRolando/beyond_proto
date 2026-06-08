// CombatLogStore — append-only combat log that accumulates entries across turns.
//
// Each turn's TurnResolution events are rendered into log entries via
// ResolutionLogRenderer and appended. The store persists until reset
// explicitly (new battle / return to start).
//
// Legacy Logger entries are NOT mixed into this store — it is the
// canonical player-facing log.

import { renderTurnLog } from './resolution/ResolutionLogRenderer.js';

let _idCounter = 0;

function nextId() {
  return `log-${++_idCounter}-${Date.now().toString(36)}`;
}

export class CombatLogStore {
  #entries = [];

  /**
   * Append all events from a TurnResolution as player-facing log entries.
   * Called after each turn execution / playback completes.
   */
  appendResolution(resolution) {
    if (!resolution) return;
    const entries = renderTurnLog(resolution);
    for (const entry of entries) {
      this.#entries.push({
        id: nextId(),
        ...entry,
      });
    }
  }

  /** Return all accumulated entries (immutable copy). */
  getEntries() {
    return [...this.#entries];
  }

  /** Return only the entries from the most recent turn. */
  getLatestTurnEntries(turnNumber) {
    return this.#entries.filter(e => e._turnNumber === turnNumber);
  }

  /** Clear all entries (new battle / return to start). */
  reset() {
    this.#entries = [];
    _idCounter = 0;
  }

  serialize() {
    return { entries: structuredClone(this.#entries), idCounter: _idCounter };
  }

  deserialize(data = {}) {
    this.#entries = structuredClone(data.entries || []);
    _idCounter = data.idCounter || 0;
  }
}
