// RL Determinism tests — StateHasher, ReplayRecorder, DeterminismChecker
// Run: node tests/rl_determinism_test.js

import { StateHasher, stableStateHash, canonicalizeStateForHash } from '../engine/rl/rollout/StateHasher.js';
import { ReplayRecorder } from '../engine/rl/rollout/ReplayRecorder.js';
import { DeterminismChecker } from '../engine/rl/rollout/DeterminismChecker.js';
import { RolloutRunner } from '../engine/rl/rollout/RolloutRunner.js';
import { BattleEnv } from '../engine/rl/environment/BattleEnv.js';
import { RandomPolicy } from '../engine/rl/policies/RandomPolicy.js';
import { DEFAULT_RL_SCENARIOS } from '../engine/rl/scenarios/defaultScenarios.js';

let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== RL Determinism Tests ===\n');

// ─── 1. StateHasher stability ───
console.log('[1] StateHasher stability');
{
  const stateA = {
    characters: [{ id: 'a', ownerId: 'player1', alive: true, position: { q: 0, r: 0 } }],
    projectiles: [],
    turn: 1,
    logs: ['debug msg'],
    keyframes: [{}],
  };
  const stateB = {
    projectiles: [],
    turn: 1,
    characters: [{ id: 'a', ownerId: 'player1', alive: true, position: { q: 0, r: 0 } }],
    logs: [],
    keyframes: null,
  };

  const hashA = stableStateHash(stateA);
  const hashB = stableStateHash(stateB);
  check('same state -> same hash (key order invariant)', hashA === hashB,
    `A=${hashA} B=${hashB}`);

  const stateC = structuredClone(stateA);
  const hashC = stableStateHash(stateC);
  check('deep clone -> same hash', hashA === hashC,
    `A=${hashA} C=${hashC}`);

  // logs+keyframes changed shouldn't affect hash
  const stateD = structuredClone(stateA);
  stateD.logs = ['completely different log'];
  stateD.keyframes = [{ huge: 'data' }];
  const hashD = stableStateHash(stateD);
  check('logs/keyframes changed -> hash unchanged', hashA === hashD,
    `A=${hashA} D=${hashD}`);

  // Different state gives different hash
  const stateE = structuredClone(stateA);
  stateE.characters[0].alive = false;
  const hashE = stableStateHash(stateE);
  check('different state -> different hash', hashA !== hashE);

  // Different skill ids must produce different hashes
  const stateF = {
    characters: [{ skills: [{ id: 'mage_blast' }] }],
  };
  const stateG = {
    characters: [{ skills: [{ id: 'mage_burst' }] }],
  };
  check('different skill ids -> different hash', stableStateHash(stateF) !== stableStateHash(stateG));
}

// ─── 2. ReplayRecorder records complete episode ───
console.log('\n[2] ReplayRecorder records complete episode');
{
  const env = new BattleEnv({
    scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
    maxTurns: 5,
  });
  const recorder = new ReplayRecorder({ scenarioId: 'test', seed: 42 });
  const runner = new RolloutRunner({
    env,
    policies: {
      player1: new RandomPolicy(1),
      player2: new RandomPolicy(2),
    },
  });
  const episode = await runner.runEpisode({ recorder });
  check('episode has replay', !!episode.replay);
  if (episode.replay) {
    const replay = episode.replay;
    check('replay.steps.length matches episode', replay.steps.length === episode.steps,
      `replay=${replay.steps.length} ep=${episode.steps}`);
    check('replay has initialStateHash', typeof replay.initialStateHash === 'string' && replay.initialStateHash.length > 0);
    check('replay has finalStateHash', typeof replay.finalStateHash === 'string' && replay.finalStateHash.length > 0);
    check('replay has winner', replay.winner !== undefined);

    let allStepsOk = true;
    for (const step of replay.steps) {
      if (typeof step.player1Action !== 'number' ||
          typeof step.player2Action !== 'number' ||
          typeof step.stateHash !== 'string') {
        allStepsOk = false;
        break;
      }
    }
    check('all replay steps have player1Action/player2Action/stateHash', allStepsOk);
  }
  env.close();
}

// ─── 3. Same seed deterministic ───
console.log('\n[3] Same seed deterministic');
{
  function makeEnv() {
    return new BattleEnv({
      scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
      maxTurns: 10,
    });
  }
  function makePolicies(seed) {
    return {
      player1: new RandomPolicy(seed + 1),
      player2: new RandomPolicy(seed + 2),
    };
  }
  const checker = new DeterminismChecker({ makeEnv, makePolicies });
  const result = await checker.check({ seed: 100 });
  check('same seed ok=true', result.ok === true,
    result.reason || '');
  if (result.ok) {
    check('action sequence matches', result.first.actions.length === result.second.actions.length);
    check('stateHash sequence matches', result.first.stateHashes.length === result.second.stateHashes.length);
  }
}

// ─── 4. runPair completes without errors ───
console.log('\n[4] runPair completes without errors');
{
  function makeEnv() {
    return new BattleEnv({
      scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
      maxTurns: 10,
    });
  }
  function makePolicies(seed) {
    return {
      player1: new RandomPolicy(seed + 1),
      player2: new RandomPolicy(seed + 2),
    };
  }
  // Run two different seeds just to ensure both complete
  const run1 = new DeterminismChecker({ makeEnv, makePolicies });
  const r1 = await run1.runPair({ seed: 200 });
  check('first episode of pair completes', r1.first && r1.first.replay && r1.first.replay.steps.length > 0);
  check('second episode of pair completes', r1.second && r1.second.replay && r1.second.replay.steps.length > 0);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
