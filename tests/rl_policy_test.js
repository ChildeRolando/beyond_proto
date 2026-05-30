// RL Policy Interface + PolicyAdapter + Lifecycle tests
// Run: node tests/rl_policy_test.js
//
// Phase 1: should FAIL — Policy.js and PolicyAdapter.js do not exist yet.

import { Policy } from '../engine/rl/policies/Policy.js';
import { PolicyAdapter } from '../engine/rl/policies/PolicyAdapter.js';
import { RandomPolicy } from '../engine/rl/policies/RandomPolicy.js';
import { RolloutRunner } from '../engine/rl/rollout/RolloutRunner.js';
import { BattleEnv } from '../engine/rl/environment/BattleEnv.js';
import { DEFAULT_RL_SCENARIOS } from '../engine/rl/scenarios/defaultScenarios.js';

let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

function makeEnv(scenarioKey = 'mage_vs_warrior_basic') {
  const env = new BattleEnv({
    scenario: DEFAULT_RL_SCENARIOS[scenarioKey],
    maxTurns: 5,
  });
  env.reset();
  return env;
}

// RecordingPolicy: records all lifecycle calls, delegates act to internal RandomPolicy
class RecordingPolicy extends Policy {
  constructor(seed = 0) {
    super();
    this._delegate = new RandomPolicy(seed);
    this.resetCalls = [];
    this.actCalls = [];
    this.transitionCalls = [];
    this.endCalls = [];
  }

  resetEpisode(context) {
    this.resetCalls.push({ ...context });
    super.resetEpisode(context);
  }

  act(observation, actionMask, context) {
    this.actCalls.push({
      context: { ...context },
      legalActionCount: actionMask.reduce((s, v) => s + v, 0),
    });
    return this._delegate.act(observation, actionMask, context);
  }

  observeTransition(transition) {
    this.transitionCalls.push({
      playerKey: transition.playerKey,
      action: transition.action,
      reward: transition.reward,
      done: transition.done,
      preStateHash: transition.preStateHash,
      postStateHash: transition.postStateHash,
      opponentAction: transition.opponentAction,
    });
    super.observeTransition(transition);
  }

  endEpisode(summary) {
    this.endCalls.push({
      winner: summary.winner,
      steps: summary.steps,
      totalReward: summary.totalReward,
    });
    super.endEpisode(summary);
  }
}

console.log('=== RL Policy Interface Tests ===\n');

// ─── A. Policy base class ───
console.log('[A] Policy base class');
{
  const p = new Policy();

  let threw = false;
  try { p.act(null, new Uint8Array(380), {}); } catch (e) { threw = true; }
  check('Policy.act throws not implemented', threw);

  // resetEpisode / observeTransition / endEpisode are no-op, should not throw
  let noThrow = true;
  try { p.resetEpisode({}); } catch (e) { noThrow = false; }
  check('Policy.resetEpisode no-op (no throw)', noThrow);

  noThrow = true;
  try { p.observeTransition({}); } catch (e) { noThrow = false; }
  check('Policy.observeTransition no-op (no throw)', noThrow);

  noThrow = true;
  try { p.endEpisode({}); } catch (e) { noThrow = false; }
  check('Policy.endEpisode no-op (no throw)', noThrow);
}

// ─── B. PolicyAdapter wraps old-style policy ───
console.log('\n[B] PolicyAdapter wraps old-style policy');
{
  const env = makeEnv();
  const engine = env.getEngineForDebug();

  // Old-style policy: only has act(obs, mask)
  const oldPolicy = {
    act(observation, actionMask) {
      const valid = [];
      for (let i = 0; i < actionMask.length; i++) {
        if (actionMask[i] === 1) valid.push(i);
      }
      return valid.length > 0 ? valid[0] : -1;
    },
  };

  const adapted1 = new PolicyAdapter(oldPolicy);
  const adapted2 = new PolicyAdapter(oldPolicy);

  check('PolicyAdapter wraps old policy', typeof adapted1.act === 'function');

  const runner = new RolloutRunner({
    env,
    policies: { player1: adapted1, player2: adapted2 },
  });
  const episode = await runner.runEpisode();
  check('PolicyAdapter: rollout completes steps > 0', episode.steps > 0,
    `steps=${episode.steps}`);
  check('PolicyAdapter: rollout is terminal', episode.finalTimeStep.last() === true);
  env.close();
}

// ─── C. RandomPolicy compatibility ───
console.log('\n[C] RandomPolicy compatibility');
{
  const env = makeEnv();
  const p1 = new RandomPolicy(42);
  const p2 = new RandomPolicy(99);

  // Verify RandomPolicy has new interface methods
  check('RandomPolicy has resetEpisode', typeof p1.resetEpisode === 'function');
  check('RandomPolicy has observeTransition', typeof p1.observeTransition === 'function');
  check('RandomPolicy has endEpisode', typeof p1.endEpisode === 'function');

  const runner = new RolloutRunner({
    env,
    policies: { player1: p1, player2: p2 },
  });
  const episode = await runner.runEpisode();
  check('RandomPolicy rollout completes', episode.steps > 0);
  check('RandomPolicy rollout all p1 legal',
    episode.trajectory.every(s => s.player1ActionWasLegal));
  check('RandomPolicy rollout all p2 legal',
    episode.trajectory.every(s => s.player2ActionWasLegal));

  // Verify act works with context
  const obs = env.getObservation('player1');
  const mask = env.getActionMasks().player1;
  const action = p1.act(obs, mask, { playerKey: 'player1', turn: 1 });
  check('RandomPolicy.act with context returns valid action', mask[action] === 1);

  env.close();
}

// ─── D. Lifecycle hooks ───
console.log('\n[D] Lifecycle hooks');
{
  const env = new BattleEnv({
    scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
    maxTurns: 10,
  });
  const p1 = new RecordingPolicy(7);
  const p2 = new RecordingPolicy(13);

  const runner = new RolloutRunner({
    env,
    policies: { player1: p1, player2: p2 },
  });
  const episode = await runner.runEpisode();

  // D1. resetEpisode called exactly once per policy
  check('P1 resetEpisode called once', p1.resetCalls.length === 1,
    `got ${p1.resetCalls.length}`);
  check('P2 resetEpisode called once', p2.resetCalls.length === 1,
    `got ${p2.resetCalls.length}`);

  // D2. act call count === episode.steps
  check('P1 act calls === steps', p1.actCalls.length === episode.steps,
    `act=${p1.actCalls.length} steps=${episode.steps}`);
  check('P2 act calls === steps', p2.actCalls.length === episode.steps,
    `act=${p2.actCalls.length} steps=${episode.steps}`);

  // D3. observeTransition call count === episode.steps
  check('P1 observeTransition calls === steps',
    p1.transitionCalls.length === episode.steps,
    `trans=${p1.transitionCalls.length} steps=${episode.steps}`);
  check('P2 observeTransition calls === steps',
    p2.transitionCalls.length === episode.steps,
    `trans=${p2.transitionCalls.length} steps=${episode.steps}`);

  // D4. endEpisode called exactly once
  check('P1 endEpisode called once', p1.endCalls.length === 1,
    `got ${p1.endCalls.length}`);
  check('P2 endEpisode called once', p2.endCalls.length === 1,
    `got ${p2.endCalls.length}`);

  // D5. resetEpisode context fields
  if (p1.resetCalls.length > 0) {
    const ctx = p1.resetCalls[0];
    check('reset context has playerKey', ctx.playerKey === 'player1',
      `got ${ctx.playerKey}`);
    check('reset context has opponentKey', ctx.opponentKey === 'player2',
      `got ${ctx.opponentKey}`);
    check('reset context has episodeStep=0', ctx.episodeStep === 0,
      `got ${ctx.episodeStep}`);
    check('reset context has turn', typeof ctx.turn === 'number');
    check('reset context has stateHash', typeof ctx.stateHash === 'string' || ctx.stateHash === null);
    check('reset context has legalActionCount', typeof ctx.legalActionCount === 'number',
      `got ${ctx.legalActionCount}`);
  }

  // D6. act context fields
  if (p1.actCalls.length > 0) {
    const ctx = p1.actCalls[0].context;
    check('act context has playerKey', ctx.playerKey === 'player1');
    check('act context has opponentKey', ctx.opponentKey === 'player2');
    check('act context has turn', typeof ctx.turn === 'number');
    check('act context has episodeStep', typeof ctx.episodeStep === 'number');
    check('act context has stateHash', typeof ctx.stateHash === 'string' || ctx.stateHash === null);
    check('act context has legalActionCount', typeof ctx.legalActionCount === 'number',
      `got ${ctx.legalActionCount}`);

    // legalActionCount must match mask ones
    const recordedCount = p1.actCalls[0].legalActionCount;
    check('act context legalActionCount matches mask', recordedCount === ctx.legalActionCount,
      `recorded=${recordedCount} ctx=${ctx.legalActionCount}`);
  }

  // D7. transition fields
  if (p1.transitionCalls.length > 0) {
    const t = p1.transitionCalls[0];
    check('transition has playerKey', t.playerKey === 'player1');
    check('transition has action', typeof t.action === 'number');
    check('transition has reward', typeof t.reward === 'number');
    check('transition has done', typeof t.done === 'boolean');
    check('transition has preStateHash', typeof t.preStateHash === 'string' || t.preStateHash === null);
    check('transition has postStateHash', typeof t.postStateHash === 'string' || t.postStateHash === null);
    check('transition has opponentAction', typeof t.opponentAction === 'number');
  }

  // D8. endEpisode summary fields
  if (p1.endCalls.length > 0) {
    const s = p1.endCalls[0];
    check('summary.winner === episode.winner', s.winner === episode.winner,
      `summary=${s.winner} episode=${episode.winner}`);
    check('summary.steps === episode.steps', s.steps === episode.steps,
      `summary=${s.steps} episode=${episode.steps}`);
    check('summary has totalReward', typeof s.totalReward === 'number',
      `got ${s.totalReward}`);
  }

  // D9. Action sequence consistency
  // Each step's transition.action must equal the action returned at that step
  let actionSeqOk = true;
  for (let i = 0; i < Math.min(p1.actCalls.length, p1.transitionCalls.length, episode.trajectory.length); i++) {
    if (p1.transitionCalls[i].action !== episode.trajectory[i].player1Action) {
      actionSeqOk = false; break;
    }
  }
  check('transition.action === trajectory player1Action at each step', actionSeqOk);

  // transition.opponentAction must match
  let oppActionOk = true;
  for (let i = 0; i < Math.min(p1.transitionCalls.length, episode.trajectory.length); i++) {
    if (p1.transitionCalls[i].opponentAction !== episode.trajectory[i].player2Action) {
      oppActionOk = false; break;
    }
  }
  check('transition.opponentAction === trajectory player2Action', oppActionOk);

  env.close();
}

// ─── E. Illegal action throws ───
console.log('\n[E] Illegal action throws');
{
  const env = makeEnv();
  const badPolicy = new PolicyAdapter({
    act() { return 999; }, // always illegal
  });
  const okPolicy = new PolicyAdapter({
    act(obs, mask) {
      for (let i = 0; i < mask.length; i++) if (mask[i] === 1) return i;
      return -1;
    },
  });

  let threw = false;
  try {
    const runner = new RolloutRunner({
      env,
      policies: { player1: badPolicy, player2: okPolicy },
    });
    await runner.runEpisode();
  } catch (e) {
    threw = true;
  }
  check('illegal action throws in RolloutRunner', threw);
  env.close();
}

// ─── F. Old policy with lifecycle hooks via PolicyAdapter ───
console.log('\n[F] Old policy with lifecycle hooks via PolicyAdapter');
{
  const env = makeEnv();
  let resetCalled = false, transCalled = false, endCalled = false;

  const oldWithHooks = {
    act(observation, actionMask) {
      const valid = [];
      for (let i = 0; i < actionMask.length; i++) {
        if (actionMask[i] === 1) valid.push(i);
      }
      return valid[0];
    },
    resetEpisode(context) { resetCalled = true; },
    observeTransition(transition) { transCalled = true; },
    endEpisode(summary) { endCalled = true; },
  };

  const adapted = new PolicyAdapter(oldWithHooks);
  const runner = new RolloutRunner({
    env,
    policies: { player1: adapted, player2: adapted },
  });
  await runner.runEpisode();

  check('PolicyAdapter forwards resetEpisode to old policy', resetCalled);
  check('PolicyAdapter forwards observeTransition to old policy', transCalled);
  check('PolicyAdapter forwards endEpisode to old policy', endCalled);
  env.close();
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
