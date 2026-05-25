// Publish/subscribe event bus with priority ordering
export class EventBus {
  #listeners = new Map();

  on(eventType, handler, priority = 50) {
    const id = 'h' + Math.random().toString(36).slice(2, 8);
    if (!this.#listeners.has(eventType)) this.#listeners.set(eventType, []);
    this.#listeners.get(eventType).push({ id, handler, priority });
    this.#listeners.get(eventType).sort((a, b) => a.priority - b.priority);
    return id;
  }

  off(eventType, handlerId) {
    const list = this.#listeners.get(eventType);
    if (!list) return;
    const idx = list.findIndex(l => l.id === handlerId);
    if (idx >= 0) list.splice(idx, 1);
  }

  emit(eventType, eventData) {
    const list = this.#listeners.get(eventType);
    if (!list) return eventData;
    for (const l of list) {
      const result = l.handler(eventData);
      if (result === false) break; // consumed
      if (result !== undefined && result !== true) eventData = result;
    }
    return eventData;
  }

  emitReduce(eventType, initial, reducer) {
    const list = this.#listeners.get(eventType);
    if (!list) return initial;
    let acc = initial;
    for (const l of list) {
      const val = l.handler(acc);
      if (val !== undefined) acc = reducer ? reducer(acc, val) : val;
    }
    return acc;
  }

  clear() { this.#listeners.clear(); }
  clearType(eventType) { this.#listeners.delete(eventType); }
}
