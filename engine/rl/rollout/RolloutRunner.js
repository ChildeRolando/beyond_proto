import { stableStateHash } from './StateHasher.js';
import { ReplayRecorder } from './ReplayRecorder.js';

export class RolloutRunner {
  constructor({
    env,
    policies,
    maxSteps = null,
    recordTrajectory = true,
  } = {}) {
    this._env = env;
    this._policies = policies;
    this._maxSteps = maxSteps;
    this._recordTrajectory = recordTrajectory;
  }

  async runEpisode(options = {}) {
    const resetConfig = options.resetConfig || {};
    const recorder = options.recorder || null;
    const ts = this._env.reset(resetConfig);

    const trajectory = [];
    let accumulatedReward = { player1: 0, player2: 0 };
    let steps = 0;
    let currentTs = ts;

    const maxSteps = this._maxSteps ?? Infinity;

    // Recorder start
    if (recorder) {
      const initialState = currentTs.extras.state;
      recorder.start({
        initialStateHash: initialState ? stableStateHash(initialState) : null,
        config: resetConfig,
      });
    }

    // ─── Policy lifecycle: resetEpisode ───
    const resetState = currentTs.extras.state;
    const resetStateHash = resetState ? stableStateHash(resetState) : null;
    const resetMasks = currentTs.extras.actionMasks;
    const resetTurn = currentTs.extras.turn;

    for (const pk of ['player1', 'player2']) {
      const oppKey = pk === 'player1' ? 'player2' : 'player1';
      const legalCount = _countMaskOnes(resetMasks[pk]);
      this._policies[pk].resetEpisode({
        playerKey: pk,
        opponentKey: oppKey,
        episodeStep: 0,
        turn: resetTurn,
        stateHash: resetStateHash,
        legalActionCount: legalCount,
      });
    }

    while (!currentTs.last() && steps < maxSteps) {
      // Read observations and masks from current timestep
      const obs = currentTs.observation;
      const masks = currentTs.extras.actionMasks;
      const preState = currentTs.extras.state;
      const preStateHash = preState ? stableStateHash(preState) : null;
      const turn = currentTs.extras.turn;

      // Compute legal action counts
      const p1LegalCount = _countMaskOnes(masks.player1);
      const p2LegalCount = _countMaskOnes(masks.player2);

      // ─── Policy lifecycle: act with context ───
      const p1Context = {
        playerKey: 'player1',
        opponentKey: 'player2',
        turn,
        episodeStep: steps,
        stateHash: preStateHash,
        legalActionCount: p1LegalCount,
      };
      const p2Context = {
        playerKey: 'player2',
        opponentKey: 'player1',
        turn,
        episodeStep: steps,
        stateHash: preStateHash,
        legalActionCount: p2LegalCount,
      };

      const p1Action = this._policies.player1.act(obs.player1, masks.player1, p1Context);
      const p2Action = this._policies.player2.act(obs.player2, masks.player2, p2Context);

      // Validate legality
      const p1Legal = masks.player1[p1Action] === 1;
      const p2Legal = masks.player2[p2Action] === 1;

      if (!p1Legal || !p2Legal) {
        throw new Error(
          `illegal action at step ${steps + 1}: p1=${p1Action}(legal=${p1Legal}) p2=${p2Action}(legal=${p2Legal})`
        );
      }

      // Step environment
      currentTs = await this._env.step({ player1: p1Action, player2: p2Action });
      steps++;

      // Accumulate rewards
      const reward = currentTs.reward;
      accumulatedReward.player1 += reward.player1;
      accumulatedReward.player2 += reward.player2;

      // Record trajectory step
      if (this._recordTrajectory) {
        trajectory.push({
          turn: currentTs.extras.turn,
          player1Action: p1Action,
          player2Action: p2Action,
          player1ActionWasLegal: p1Legal,
          player2ActionWasLegal: p2Legal,
          legalActions: { player1: p1LegalCount, player2: p2LegalCount },
          reward: { ...reward },
          done: currentTs.last(),
        });
      }

      // Recorder step
      if (recorder) {
        recorder.recordStep({
          turn: currentTs.extras.turn,
          player1Action: p1Action,
          player2Action: p2Action,
          decodedActions: currentTs.extras.decodedActions || null,
          reward: { ...reward },
          done: currentTs.last(),
          stateHash: currentTs.extras.state ? stableStateHash(currentTs.extras.state) : null,
        });
      }

      // ─── Policy lifecycle: observeTransition ───
      const postStateHash = currentTs.extras.state ? stableStateHash(currentTs.extras.state) : null;

      this._policies.player1.observeTransition({
        playerKey: 'player1',
        opponentKey: 'player2',
        turn,
        episodeStep: steps - 1,
        observation: obs.player1,
        action: p1Action,
        actionMask: masks.player1,
        reward: reward.player1,
        done: currentTs.last(),
        nextObservation: currentTs.observation?.player1 ?? null,
        preStateHash,
        postStateHash,
        legalActionCount: p1LegalCount,
        opponentAction: p2Action,
      });

      this._policies.player2.observeTransition({
        playerKey: 'player2',
        opponentKey: 'player1',
        turn,
        episodeStep: steps - 1,
        observation: obs.player2,
        action: p2Action,
        actionMask: masks.player2,
        reward: reward.player2,
        done: currentTs.last(),
        nextObservation: currentTs.observation?.player2 ?? null,
        preStateHash,
        postStateHash,
        legalActionCount: p2LegalCount,
        opponentAction: p1Action,
      });
    }

    // Determine winner from final state
    const finalState = currentTs.extras.state;
    const winner = this._determineWinner(finalState);

    // Recorder finish
    if (recorder) {
      recorder.finish({
        winner,
        finalStateHash: finalState ? stableStateHash(finalState) : null,
        steps,
      });
    }

    // ─── Policy lifecycle: endEpisode ───
    const finalStateHash = finalState ? stableStateHash(finalState) : null;

    for (const pk of ['player1', 'player2']) {
      const oppKey = pk === 'player1' ? 'player2' : 'player1';
      this._policies[pk].endEpisode({
        playerKey: pk,
        opponentKey: oppKey,
        winner,
        steps,
        totalReward: accumulatedReward[pk],
        rawTotalReward: accumulatedReward,
        finalStateHash,
        finalTimeStep: currentTs,
      });
    }

    const result = {
      steps,
      winner,
      totalReward: accumulatedReward,
      trajectory,
      finalTimeStep: currentTs,
    };
    if (recorder) {
      result.replay = recorder.toJSON();
    }
    return result;
  }

  _determineWinner(state) {
    if (!state || !state.characters) return null;
    const p1 = state.characters.find(c => c.ownerId === 'player1' && c.alive !== false);
    const p2 = state.characters.find(c => c.ownerId === 'player2' && c.alive !== false);
    if (p1 && !p2) return 'player1';
    if (p2 && !p1) return 'player2';
    if (!p1 && !p2) return 'draw';
    return null;
  }
}

function _countMaskOnes(mask) {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) count++;
  }
  return count;
}
