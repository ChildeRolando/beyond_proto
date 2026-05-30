import { GameEngine } from '../../GameEngine.js';
import { StepType } from './StepType.js';
import { TimeStep } from './TimeStep.js';
import { ActionEncoder } from '../actions/ActionEncoder.js';
import { buildActionMask } from '../actions/ActionMask.js';
import { ObservationEncoder } from '../features/ObservationEncoder.js';
import { WinLossReward } from '../rewards/WinLossReward.js';

export class BattleEnv {
  constructor(config = {}) {
    this._scenario = config.scenario;
    this._maxTurns = config.maxTurns ?? 30;
    this._discount = config.discount ?? 1;
    this._actionEncoder = config.actionEncoder || new ActionEncoder();
    this._observationEncoder = config.observationEncoder || new ObservationEncoder();
    this._rewardModel = config.rewardModel || new WinLossReward();
    this._engine = null;
    this._player1Id = null;
    this._player2Id = null;
    this._turn = 0;
    this._done = false;
    this._prevState = null;
  }

  observationSpec() { return this._observationEncoder.observationSpec(); }
  actionSpec() { return { numValues: this._actionEncoder.actionCount() }; }

  reset(configOverride = {}) {
    const scenario = { ...this._scenario, ...configOverride };
    this._engine = new GameEngine();
    const ids = this._engine.initBattle(scenario);
    this._player1Id = ids.player1Id;
    this._player2Id = ids.player2Id;
    this._turn = 1;
    this._done = false;

    const state = this._engine.getState();
    this._prevState = structuredClone(state);

    const actionMasks = this._buildActionMasks();
    const observations = this._buildObservations(actionMasks);

    return new TimeStep({
      stepType: StepType.FIRST,
      reward: { player1: 0, player2: 0 },
      discount: 0,
      observation: observations,
      extras: {
        state,
        turn: this._turn,
        actionMasks,
        done: false,
      },
    });
  }

  async step(jointAction) {
    if (this._done) throw new Error('step called on terminated environment');
    if (!this._engine) throw new Error('environment not initialized');

    const actionMasks = this._buildActionMasks();

    // Validate both actions
    const p1Idx = jointAction.player1;
    const p2Idx = jointAction.player2;
    if (p1Idx < 0 || p1Idx >= this._actionEncoder.actionCount() || actionMasks.player1[p1Idx] !== 1) {
      throw new Error(`illegal player1 action: ${p1Idx}`);
    }
    if (p2Idx < 0 || p2Idx >= this._actionEncoder.actionCount() || actionMasks.player2[p2Idx] !== 1) {
      throw new Error(`illegal player2 action: ${p2Idx}`);
    }

    const state = this._engine.getState();
    const p1Action = this._actionEncoder.decodeToGameAction(p1Idx, state, this._player1Id);
    const p2Action = this._actionEncoder.decodeToGameAction(p2Idx, state, this._player2Id);
    if (!p1Action.valid) throw new Error(`invalid player1 action: ${p1Action.reason}`);
    if (!p2Action.valid) throw new Error(`invalid player2 action: ${p2Action.reason}`);

    // Submit
    const r1 = this._engine.submitAction(p1Action.characterId, p1Action.skillId, p1Action.targetPos);
    if (!r1.success) throw new Error(`submit player1 failed: ${r1.reason || r1.error}`);
    const r2 = this._engine.submitAction(p2Action.characterId, p2Action.skillId, p2Action.targetPos);
    if (!r2.success) throw new Error(`submit player2 failed: ${r2.reason || r2.error}`);

    // Execute
    const execResult = await this._engine.executeTurn();
    this._turn++;

    const nextState = this._engine.getState();
    const battleEnded = execResult.battleEnded || this._turn > this._maxTurns;
    this._done = battleEnded;

    const reward = {
      player1: this._rewardModel.compute(this._prevState, nextState, this._engine.getCharacterOwner(this._player1Id)),
      player2: this._rewardModel.compute(this._prevState, nextState, this._engine.getCharacterOwner(this._player2Id)),
    };
    this._prevState = structuredClone(nextState);

    const nextActionMasks = this._done ? { player1: new Uint8Array(this._actionEncoder.actionCount()), player2: new Uint8Array(this._actionEncoder.actionCount()) } : this._buildActionMasks();
    const observations = this._done ? { player1: null, player2: null } : this._buildObservations(nextActionMasks);

    return new TimeStep({
      stepType: this._done ? StepType.LAST : StepType.MID,
      reward,
      discount: this._done ? 0 : this._discount,
      observation: observations,
      extras: {
        state: nextState,
        turn: this._turn,
        actionMasks: nextActionMasks,
        decodedActions: { player1: p1Action, player2: p2Action },
        done: this._done,
      },
    });
  }

  close() {
    this._engine = null;
    this._done = true;
  }

  _buildActionMasks() {
    return {
      player1: buildActionMask(this._engine, this._player1Id, this._actionEncoder),
      player2: buildActionMask(this._engine, this._player2Id, this._actionEncoder),
    };
  }

  _buildObservations(masks) {
    return {
      player1: this._observationEncoder.encode(this._engine, this._engine.getCharacterOwner(this._player1Id), masks.player1),
      player2: this._observationEncoder.encode(this._engine, this._engine.getCharacterOwner(this._player2Id), masks.player2),
    };
  }
}
