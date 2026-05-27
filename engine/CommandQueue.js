// Speed-tiered command queue with validation
export class CommandQueue {
  #queues = new Map([[0, []], [1, []], [2, []], [3, []]]);
  #eventBus;

  constructor(eventBus) { this.#eventBus = eventBus; }

  enqueue(command, speed) {
    speed = speed ?? command.speed ?? 1;
    const tier = this.#queues.get(speed);
    if (!tier) throw new Error(`Invalid speed tier: ${speed}`);
    tier.push(command);
  }

  enqueueSequence(sequence) {
    // A CommandSequence may have commands at different speed tiers
    for (const cmd of sequence.commands) {
      const spd = cmd.subSpeed ?? sequence.totalSpeed ?? cmd.speed ?? 1;
      this.enqueue(cmd, spd);
    }
  }

  getTier(speed) { return this.#queues.get(speed) || []; }
  clearTier(speed) { this.#queues.set(speed, []); }
  isEmpty() {
    for (const tier of this.#queues.values()) if (tier.length > 0) return false;
    return true;
  }

  validateAll(registry, resourceSystem) {
    const valid = [];
    const rejected = [];
    for (const [speed, cmds] of this.#queues) {
      for (const cmd of cmds) {
        const actor = registry.get(cmd.actorId);
        if (!actor || actor.alive === false) {
          rejected.push({ command: cmd, reason: 'actor_dead' });
          continue;
        }
        if (cmd.cost && !resourceSystem.canAfford(cmd.actorId, cmd.cost)) {
          rejected.push({ command: cmd, reason: 'insufficient_resources' });
          continue;
        }
        valid.push({ speed, command: cmd });
      }
    }
    return { valid, rejected };
  }

  cancelByActor(actorId, belowSpeed = -1) {
    // Remove commands for actorId from speed tiers < belowSpeed (slower than the caller)
    // belowSpeed = -1 = remove ALL; belowSpeed = 1 = remove speed 0; belowSpeed = 2 = remove speed 1,0
    for (const [speed, cmds] of this.#queues) {
      if (belowSpeed >= 0 && speed >= belowSpeed) continue;
      this.#queues.set(speed, cmds.filter(c => c.actorId !== actorId));
    }
  }

  clearAll() { for (const k of this.#queues.keys()) this.#queues.set(k, []); }

  // Iterate commands in speed order (3→2→1→0)
  *speeds() { yield 3; yield 2; yield 1; yield 0; }
}
