// Structured action log with replay support
export class Logger {
  #entries = [];
  #turnNumber = 1;

  setTurn(n) { this.#turnNumber = n; }

  log(message, category = '') {
    this.#entries.push({
      message,
      category: category || '',
      turn: this.#turnNumber,
      timestamp: Date.now(),
    });
    return this;
  }

  getEntries(count = Infinity) {
    return this.#entries.slice(-count);
  }

  getReplayData() {
    return {
      entries: [...this.#entries],
      turnCount: this.#turnNumber,
    };
  }

  clear() {
    this.#entries.length = 0;
    this.#turnNumber = 1;
  }

  serialize() {
    return {
      entries: structuredClone(this.#entries),
      turnNumber: this.#turnNumber,
    };
  }

  deserialize(data = {}) {
    this.#entries.length = 0;
    this.#entries.push(...structuredClone(data.entries || []));
    this.#turnNumber = data.turnNumber || 1;
  }
}
