// Simple LCG random number generator
function createRNG(seed) {
  let state = (seed | 0) || 1;
  return function () {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 0xFFFFFFFF;
  };
}

export class RandomPolicy {
  constructor(seed = 0) {
    this._rng = createRNG(seed);
  }

  act(observation, actionMask) {
    const valid = [];
    for (let i = 0; i < actionMask.length; i++) {
      if (actionMask[i] === 1) valid.push(i);
    }
    if (valid.length === 0) throw new Error('no valid actions');
    const idx = Math.floor(this._rng() * valid.length);
    return valid[idx];
  }
}
