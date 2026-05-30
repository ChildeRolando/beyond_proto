import { stableStateHash } from './StateHasher.js';

export class ReplayRecorder {
  constructor({ scenarioId = null, seed = null } = {}) {
    this._scenarioId = scenarioId;
    this._seed = seed;
    this._data = null;
  }

  start({ scenarioId, seed, initialStateHash, config } = {}) {
    this._data = {
      scenarioId: scenarioId ?? this._scenarioId,
      seed: seed ?? this._seed,
      initialStateHash: initialStateHash ?? null,
      config: config ?? null,
      steps: [],
      winner: null,
      finalStateHash: null,
    };
  }

  recordStep({
    turn,
    player1Action,
    player2Action,
    decodedActions,
    reward,
    done,
    stateHash,
  }) {
    if (!this._data) return;
    this._data.steps.push({
      turn,
      player1Action,
      player2Action,
      decodedActions: decodedActions || null,
      reward: reward ? { ...reward } : null,
      done: done || false,
      stateHash: stateHash || null,
    });
  }

  finish({ winner, finalStateHash, steps } = {}) {
    if (!this._data) return;
    this._data.winner = winner ?? null;
    this._data.finalStateHash = finalStateHash ?? null;
    if (steps !== undefined) this._data.steps = this._data.steps; // keep actual
  }

  toJSON() {
    return this._data ? {
      scenarioId: this._data.scenarioId,
      seed: this._data.seed,
      initialStateHash: this._data.initialStateHash,
      config: this._data.config,
      steps: this._data.steps,
      winner: this._data.winner,
      finalStateHash: this._data.finalStateHash,
    } : null;
  }
}
