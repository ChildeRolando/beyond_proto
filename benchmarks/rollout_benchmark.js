#!/usr/bin/env node
// RL Rollout Benchmark CLI
// Usage: node benchmarks/rollout_benchmark.js --episodes 100 --scenario mage_vs_warrior_basic

import { BattleEnv } from '../engine/rl/environment/BattleEnv.js';
import { RolloutRunner } from '../engine/rl/rollout/RolloutRunner.js';
import { DeterminismChecker } from '../engine/rl/rollout/DeterminismChecker.js';
import { RandomPolicy } from '../engine/rl/policies/RandomPolicy.js';
import { DEFAULT_RL_SCENARIOS } from '../engine/rl/scenarios/defaultScenarios.js';

function parseArgs(args) {
  const opts = {
    episodes: 100,
    scenario: 'mage_vs_warrior_basic',
    seed: 0,
    maxTurns: null,
    determinism: true,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--episodes': opts.episodes = parseInt(args[++i], 10); break;
      case '--scenario': opts.scenario = args[++i]; break;
      case '--seed': opts.seed = parseInt(args[++i], 10); break;
      case '--maxTurns': opts.maxTurns = parseInt(args[++i], 10); break;
      case '--determinism': opts.determinism = args[++i] !== 'false'; break;
    }
  }
  return opts;
}

function makePolicies(seed) {
  return {
    player1: new RandomPolicy(seed + 1),
    player2: new RandomPolicy(seed + 2),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const scenario = DEFAULT_RL_SCENARIOS[opts.scenario];
  if (!scenario) {
    process.stderr.write(`Error: unknown scenario "${opts.scenario}". Available: ${Object.keys(DEFAULT_RL_SCENARIOS).join(', ')}\n`);
    process.exit(1);
  }

  console.log('RL Rollout Benchmark');
  console.log(`scenario: ${opts.scenario}`);
  console.log(`episodes: ${opts.episodes}`);
  console.log(`seed: ${opts.seed}\n`);

  let totalTurns = 0;
  let totalLegalP1 = 0;
  let totalLegalP2 = 0;
  let totalLegalSteps = 0;

  const start = process.hrtime.bigint();
  const memStart = process.memoryUsage().heapUsed;

  for (let i = 0; i < opts.episodes; i++) {
    const env = new BattleEnv({
      scenario,
      maxTurns: opts.maxTurns ?? scenario.maxTurns ?? 30,
    });
    const policies = makePolicies(opts.seed + i * 2);
    const runner = new RolloutRunner({ env, policies, recordTrajectory: true });
    const episode = await runner.runEpisode();

    totalTurns += episode.steps;

    if (episode.trajectory) {
      for (const step of episode.trajectory) {
        if (step.legalActions) {
          totalLegalP1 += step.legalActions.player1 || 0;
          totalLegalP2 += step.legalActions.player2 || 0;
          totalLegalSteps++;
        }
      }
    }

    env.close();
  }

  const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
  const memEnd = process.memoryUsage().heapUsed;
  const memDeltaMB = (memEnd - memStart) / 1024 / 1024;

  const episodesPerSec = opts.episodes / elapsedSec;
  const turnsPerSec = totalTurns / elapsedSec;
  const avgTurns = totalTurns / opts.episodes;
  const avgLegalActions = totalLegalSteps > 0
    ? (totalLegalP1 + totalLegalP2) / totalLegalSteps / 2
    : 0;

  // Determinism check
  let determinismResult = 'pass';
  if (opts.determinism && opts.episodes >= 2) {
    try {
      const checker = new DeterminismChecker({
        makeEnv: () => new BattleEnv({ scenario, maxTurns: opts.maxTurns ?? scenario.maxTurns ?? 30 }),
        makePolicies: (s) => ({
          player1: new RandomPolicy(s + 1),
          player2: new RandomPolicy(s + 2),
        }),
      });
      const result = await checker.check({ seed: opts.seed });
      determinismResult = result.ok ? 'pass' : 'fail';
    } catch (e) {
      determinismResult = 'error: ' + e.message;
    }
  } else if (!opts.determinism) {
    determinismResult = 'skipped';
  }

  console.log(`episodes/sec: ${episodesPerSec.toFixed(2)}`);
  console.log(`turns/sec: ${turnsPerSec.toFixed(2)}`);
  console.log(`avg turns/episode: ${avgTurns.toFixed(1)}`);
  console.log(`avg legal actions/player/turn: ${avgLegalActions.toFixed(1)}`);
  console.log(`memory delta MB: ${memDeltaMB.toFixed(1)}`);
  console.log(`determinism: ${determinismResult}`);

  const summary = {
    episodes: opts.episodes,
    turns: totalTurns,
    episodesPerSec: parseFloat(episodesPerSec.toFixed(2)),
    turnsPerSec: parseFloat(turnsPerSec.toFixed(2)),
    avgTurns: parseFloat(avgTurns.toFixed(1)),
    avgLegalActions: parseFloat(avgLegalActions.toFixed(1)),
    memoryDeltaMB: parseFloat(memDeltaMB.toFixed(1)),
    determinism: determinismResult,
  };

  console.log('\n' + JSON.stringify(summary));
}

main().catch(err => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
