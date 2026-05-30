import { BattleEnv } from './BattleEnv.js';
import { StepType } from './StepType.js';
import { TimeStep } from './TimeStep.js';
import { ActionEncoder } from '../actions/ActionEncoder.js';
import { ObservationEncoder } from '../features/ObservationEncoder.js';
import { WinLossReward } from '../rewards/WinLossReward.js';

export class SingleAgentBattleEnv {
  constructor(config = {}) {
    this._controlledPlayer = config.controlledPlayer || 'player1';
    this._opponentPolicy = config.opponentPolicy;
    if (!this._opponentPolicy) throw new Error('opponentPolicy is required');

    this._battleEnv = new BattleEnv({
      scenario: config.scenario,
      maxTurns: config.maxTurns ?? 30,
      discount: config.discount ?? 1,
      actionEncoder: config.actionEncoder || new ActionEncoder(),
      observationEncoder: config.observationEncoder || new ObservationEncoder(),
      rewardModel: config.rewardModel || new WinLossReward(),
    });

    this._otherPlayer = this._controlledPlayer === 'player1' ? 'player2' : 'player1';
  }

  observationSpec() { return this._battleEnv.observationSpec(); }
  actionSpec() { return this._battleEnv.actionSpec(); }

  reset(configOverride = {}) {
    const ts = this._battleEnv.reset(configOverride);
    return new TimeStep({
      stepType: ts.stepType,
      reward: ts.reward[this._controlledPlayer],
      discount: ts.discount,
      observation: ts.observation[this._controlledPlayer],
      extras: {
        state: ts.extras.state,
        turn: ts.extras.turn,
        actionMask: ts.extras.actionMasks[this._controlledPlayer],
        ...ts.extras,
      },
    });
  }

  async step(actionIndex) {
    const actionMasks = this._battleEnv._buildActionMasks();

    // Validate controlled player action
    if (actionIndex < 0 || actionIndex >= this._battleEnv._actionEncoder.actionCount() || actionMasks[this._controlledPlayer][actionIndex] !== 1) {
      throw new Error(`illegal action: ${actionIndex}`);
    }

    // Opponent chooses via policy
    const opponentObs = this._battleEnv._observationEncoder.encode(
      this._battleEnv._engine,
      this._battleEnv._engine.getCharacterOwner(this._battleEnv[`_${this._otherPlayer}Id`]),
      actionMasks[this._otherPlayer]
    );
    const opponentAction = this._opponentPolicy.act(opponentObs, actionMasks[this._otherPlayer]);

    const jointAction = {};
    jointAction[this._controlledPlayer] = actionIndex;
    jointAction[this._otherPlayer] = opponentAction;

    const ts = await this._battleEnv.step(jointAction);
    return new TimeStep({
      stepType: ts.stepType,
      reward: ts.reward[this._controlledPlayer],
      discount: ts.discount,
      observation: ts.observation?.[this._controlledPlayer] || null,
      extras: {
        state: ts.extras.state,
        turn: ts.extras.turn,
        actionMask: ts.extras.actionMasks[this._controlledPlayer],
        ...ts.extras,
      },
    });
  }

  close() { this._battleEnv.close(); }
}
