// Standardized RL policy lifecycle interface.
// All policies (random, model, heuristic, remote, self-play) should implement this contract.
//
// Lifecycle:
//   1. resetEpisode(context) — once per episode
//   2. act(observation, actionMask, context) — once per step
//   3. observeTransition(transition) — once per step after env.step
//   4. endEpisode(summary) — once per episode

export class Policy {
  resetEpisode(_context = {}) {
    // no-op — override in subclasses that need episode-level initialization
  }

  act(_observation, _actionMask, _context = {}) {
    throw new Error('not implemented');
  }

  observeTransition(_transition) {
    // no-op — override to collect experience or log
  }

  endEpisode(_summary) {
    // no-op — override to finalize episode statistics
  }
}
