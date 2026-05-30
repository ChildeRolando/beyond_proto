// RL Benchmark CLI tests
// Run: node tests/rl_benchmark_test.js

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '..', 'benchmarks', 'rollout_benchmark.js');

let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

function runCli(args = []) {
  return spawnSync('node', [CLI, ...args], {
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function parseSummary(stdout) {
  const lines = stdout.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line.startsWith('{')) {
      try { return JSON.parse(line); } catch (e) { /* continue */ }
    }
  }
  return null;
}

console.log('=== RL Benchmark Tests ===\n');

// ─── 1. CLI exists and exits 0 ───
console.log('[1] CLI exists and exits 0');
{
  const r = runCli(['--episodes', '3']);
  check('exit code = 0', r.status === 0,
    `status=${r.status} stderr=${r.stderr?.slice(0, 80)}`);
}

// ─── 2. JSON summary parseable ───
console.log('\n[2] JSON summary parseable');
{
  const r = runCli(['--episodes', '3']);
  const summary = parseSummary(r.stdout);
  check('summary parsed', summary !== null);
  if (summary) {
    const required = ['episodes', 'turns', 'episodesPerSec', 'turnsPerSec', 'avgTurns', 'avgLegalActions', 'memoryDeltaMB', 'determinism'];
    for (const key of required) {
      check(`summary.${key} exists`, summary[key] !== undefined,
        `val=${summary[key]}`);
    }
    check('episodesPerSec is number', typeof summary.episodesPerSec === 'number');
    check('turnsPerSec is number', typeof summary.turnsPerSec === 'number');
    check('avgTurns is number', typeof summary.avgTurns === 'number');
    check('avgLegalActions is number', typeof summary.avgLegalActions === 'number');
  }
}

// ─── 3. Episodes respected ───
console.log('\n[3] Episodes respected');
{
  const r = runCli(['--episodes', '3']);
  const summary = parseSummary(r.stdout);
  if (summary) {
    check('summary.episodes === 3', summary.episodes === 3,
      `got ${summary.episodes}`);
  } else {
    check('summary parsed', false);
  }
}

// ─── 4. Determinism pass ───
console.log('\n[4] Determinism pass');
{
  const r = runCli(['--episodes', '2']);
  const summary = parseSummary(r.stdout);
  if (summary) {
    check('determinism = pass', summary.determinism === 'pass',
      `got ${summary.determinism}`);
  } else {
    check('summary parsed', false);
  }
}

// ─── 5. Invalid scenario exits non-zero ───
console.log('\n[5] Invalid scenario exits non-zero');
{
  const r = runCli(['--scenario', 'does_not_exist']);
  check('exit code != 0', r.status !== 0,
    `status=${r.status}`);
  check('stderr is not empty', (r.stderr || '').length > 0);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
