// RL RolloutRunner tests
// Run: node tests/rl_rollout_test.js

import { RolloutRunner } from '../engine/rl/rollout/RolloutRunner.js';
import { BattleEnv } from '../engine/rl/environment/BattleEnv.js';
import { RandomPolicy } from '../engine/rl/policies/RandomPolicy.js';
import { DEFAULT_RL_SCENARIOS } from '../engine/rl/scenarios/defaultScenarios.js';

let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

console.log('=== RL RolloutRunner Tests ===\n');

// ─── 1. Module exists ───
console.log('[1] RolloutRunner module exists');
check('RolloutRunner is a function', typeof RolloutRunner === 'function');

// ─── 2. Random vs random runs one full episode ───
console.log('\n[2] Random vs random full episode');
{
  const env = new BattleEnv({
    scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
    maxTurns: 5,
  });
  const runner = new RolloutRunner({
    env,
    policies: {
      player1: new RandomPolicy(1),
      player2: new RandomPolicy(2),
    },
  });
  const episode = await runner.runEpisode();
  check('episode.steps > 0', episode.steps > 0,
    `steps=${episode.steps}`);
  check('episode.steps <= maxTurns', episode.steps <= 5,
    `steps=${episode.steps}`);
  check('finalTimeStep.last() === true', episode.finalTimeStep.last() === true);
  check('trajectory.length === steps', episode.trajectory.length === episode.steps,
    `traj=${episode.trajectory.length} steps=${episode.steps}`);
  check('winner is a string or null', episode.winner === null || typeof episode.winner === 'string',
    `winner=${episode.winner}`);
  env.close();
}

// ─── 3. All rollout actions are legal ───
console.log('\n[3] All rollout actions are legal');
{
  const env = new BattleEnv({
    scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
    maxTurns: 10,
  });
  const runner = new RolloutRunner({
    env,
    policies: {
      player1: new RandomPolicy(3),
      player2: new RandomPolicy(4),
    },
  });
  const episode = await runner.runEpisode();
  let allP1Legal = true, allP2Legal = true;
  for (const step of episode.trajectory) {
    if (step.player1ActionWasLegal !== true) { allP1Legal = false; break; }
    if (step.player2ActionWasLegal !== true) { allP2Legal = false; break; }
  }
  check('All player1 actions legal', allP1Legal);
  check('All player2 actions legal', allP2Legal);
  env.close();
}

// ─── 4. totalReward shape ───
console.log('\n[4] totalReward shape');
{
  const env = new BattleEnv({
    scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
    maxTurns: 5,
  });
  const runner = new RolloutRunner({
    env,
    policies: {
      player1: new RandomPolicy(5),
      player2: new RandomPolicy(6),
    },
  });
  const episode = await runner.runEpisode();
  check('totalReward.player1 is number', typeof episode.totalReward.player1 === 'number',
    `val=${episode.totalReward.player1}`);
  check('totalReward.player2 is number', typeof episode.totalReward.player2 === 'number',
    `val=${episode.totalReward.player2}`);
  env.close();
}

// ─── 5. Run 20 episodes without crash ───
console.log('\n[5] Run 20 episodes without crash');
{
  let completed = 0, crashed = false;
  for (let i = 0; i < 20; i++) {
    const env = new BattleEnv({
      scenario: DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic,
      maxTurns: 10,
    });
    const runner = new RolloutRunner({
      env,
      policies: {
        player1: new RandomPolicy(i * 2),
        player2: new RandomPolicy(i * 2 + 1),
      },
    });
    try {
      const ep = await runner.runEpisode();
      if (ep.steps > 0) completed++;
    } catch (e) {
      crashed = true;
      console.error(`  Episode ${i} crashed: ${e.message}`);
      break;
    }
    env.close();
  }
  check('20 episodes completed', completed === 20, `completed=${completed}`);
  check('No crashes', !crashed);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
