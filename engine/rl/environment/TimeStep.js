import { StepType } from './StepType.js';

export class TimeStep {
  constructor({ stepType, reward = 0, discount = 1, observation = null, extras = {} }) {
    this.stepType = stepType;
    this.reward = reward;
    this.discount = discount;
    this.observation = observation;
    this.extras = extras;
  }

  first() { return this.stepType === StepType.FIRST; }
  mid()   { return this.stepType === StepType.MID; }
  last()  { return this.stepType === StepType.LAST; }
}
