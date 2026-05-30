import { RolloutRunner } from './RolloutRunner.js';
import { ReplayRecorder } from './ReplayRecorder.js';

export class DeterminismChecker {
  constructor({ makeEnv, makePolicies }) {
    this._makeEnv = makeEnv;
    this._makePolicies = makePolicies;
  }

  async runPair({ seed, resetConfig = {} }) {
    const first = await this._runOne(seed, resetConfig);
    const second = await this._runOne(seed, resetConfig);
    return { first, second };
  }

  async check({ seed, resetConfig = {} }) {
    const { first, second } = await this.runPair({ seed, resetConfig });
    if (!first.replay || !second.replay) {
      return { ok: false, reason: 'missing replay', first, second };
    }

    // Compare winner
    if (first.winner !== second.winner) {
      return { ok: false, reason: `winner mismatch: ${first.winner} vs ${second.winner}`, first, second };
    }

    // Compare steps
    if (first.steps !== second.steps) {
      return { ok: false, reason: `steps mismatch: ${first.steps} vs ${second.steps}`, first, second };
    }

    // Compare action sequences
    const fSteps = first.replay.steps;
    const sSteps = second.replay.steps;
    for (let i = 0; i < fSteps.length; i++) {
      if (fSteps[i].player1Action !== sSteps[i].player1Action) {
        return { ok: false, reason: `step ${i}: player1Action mismatch`, first, second };
      }
      if (fSteps[i].player2Action !== sSteps[i].player2Action) {
        return { ok: false, reason: `step ${i}: player2Action mismatch`, first, second };
      }
    }

    // Compare stateHash sequences
    for (let i = 0; i < fSteps.length; i++) {
      if (fSteps[i].stateHash !== sSteps[i].stateHash) {
        return { ok: false, reason: `step ${i}: stateHash mismatch`, first, second };
      }
    }

    // Compare reward sequences
    for (let i = 0; i < fSteps.length; i++) {
      const fr = fSteps[i].reward;
      const sr = sSteps[i].reward;
      if (fr && sr && (fr.player1 !== sr.player1 || fr.player2 !== sr.player2)) {
        return { ok: false, reason: `step ${i}: reward mismatch`, first, second };
      }
    }

    return { ok: true, reason: 'all match', first, second };
  }

  async _runOne(seed, resetConfig) {
    const env = this._makeEnv(seed);
    const policies = this._makePolicies(seed);
    const recorder = new ReplayRecorder({ seed });
    const runner = new RolloutRunner({ env, policies, recordTrajectory: true });
    const episode = await runner.runEpisode({ resetConfig, recorder });
    env.close();

    // Extract comparable sequences
    const actions = [];
    const stateHashes = [];
    if (episode.replay) {
      for (const step of episode.replay.steps) {
        actions.push(step.player1Action, step.player2Action);
        stateHashes.push(step.stateHash);
      }
    }

    return {
      winner: episode.winner,
      steps: episode.steps,
      replay: episode.replay,
      actions,
      stateHashes,
      totalReward: episode.totalReward,
    };
  }
}
