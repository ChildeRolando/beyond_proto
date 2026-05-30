// Wraps old-style policies (with only act(obs, mask)) into the new Policy interface.
// Forward lifecycle hooks if they exist on the wrapped policy, otherwise no-op.

export class PolicyAdapter {
  constructor(policy) {
    this._policy = policy;
  }

  resetEpisode(context = {}) {
    if (typeof this._policy.resetEpisode === 'function') {
      this._policy.resetEpisode(context);
    }
  }

  act(observation, actionMask, context = {}) {
    return this._policy.act(observation, actionMask, context);
  }

  observeTransition(transition) {
    if (typeof this._policy.observeTransition === 'function') {
      this._policy.observeTransition(transition);
    }
  }

  endEpisode(summary) {
    if (typeof this._policy.endEpisode === 'function') {
      this._policy.endEpisode(summary);
    }
  }
}
