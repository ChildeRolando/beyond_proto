// RL Battle Environment tests
// Run: node tests/rl_env_test.js

import { BattleEnv } from '../engine/rl/environment/BattleEnv.js';
import { SingleAgentBattleEnv } from '../engine/rl/environment/SingleAgentBattleEnv.js';
import { StepType } from '../engine/rl/environment/StepType.js';
import { TimeStep } from '../engine/rl/environment/TimeStep.js';
import { WinLossReward } from '../engine/rl/rewards/WinLossReward.js';
import { RandomPolicy } from '../engine/rl/policies/RandomPolicy.js';
import { ActionEncoder } from '../engine/rl/actions/ActionEncoder.js';
import { buildActionMask } from '../engine/rl/actions/ActionMask.js';
import { ObservationEncoder } from '../engine/rl/features/ObservationEncoder.js';
import { DEFAULT_RL_SCENARIOS } from '../engine/rl/scenarios/defaultScenarios.js';
import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';

let passed = 0, failed = 0;
function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

function initTestBattle() {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 1,
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 2 },
    players: [
      { playerId: 'player1', class: '法师', roleId: 'mage_mirror', loadoutSkillIds: getDefaultLoadout('法师'), roleLoadoutSkillIds: ['trait_mirror_slippery'] },
      { playerId: 'player2', class: '战士', roleId: 'warrior_duelist', loadoutSkillIds: getDefaultLoadout('战士'), roleLoadoutSkillIds: [] },
    ],
  });
  return { engine, ids };
}

function chooseValid(mask) {
  for (let i = 0; i < mask.length; i++) { if (mask[i] === 1) return i; }
  return -1;
}

console.log('=== RL Environment Tests ===\n');

// ──────────── StepType/TimeStep ────────────
console.log('-- StepType / TimeStep --\n');

console.log('[1] StepType values');
check('FIRST = 0', StepType.FIRST === 0);
check('MID = 1', StepType.MID === 1);
check('LAST = 2', StepType.LAST === 2);

console.log('\n[2] TimeStep methods');
const firstTs = new TimeStep({ stepType: StepType.FIRST, reward: 0, discount: 1, observation: { test: 1 } });
check('first() true', firstTs.first() === true);
check('mid() false', firstTs.mid() === false);
check('last() false', firstTs.last() === false);

const midTs = new TimeStep({ stepType: StepType.MID });
check('midTs.mid() true', midTs.mid() === true);

const lastTs = new TimeStep({ stepType: StepType.LAST });
check('lastTs.last() true', lastTs.last() === true);

// ──────────── WinLossReward ────────────
console.log('\n-- WinLossReward --\n');

console.log('[3] WinLossReward');
const rewardModel = new WinLossReward();

const { engine: re } = initTestBattle();
const prevState = re.getState();
check('Non-terminal: reward 0', rewardModel.compute(prevState, structuredClone(prevState), 'player1') === 0);

const winState = structuredClone(prevState);
const enemyChar = winState.characters.find(c => c.ownerId !== 'player1');
if (enemyChar) enemyChar.alive = false;
check('Win: reward +1', rewardModel.compute(prevState, winState, 'player1') === 1);

const loseState = structuredClone(prevState);
const selfChar = loseState.characters.find(c => c.ownerId === 'player1');
if (selfChar) selfChar.alive = false;
check('Lose: reward -1', rewardModel.compute(prevState, loseState, 'player1') === -1);

// ──────────── Scenarios ────────────
console.log('\n-- Scenarios --\n');

console.log('[4] Default scenarios');
check('Has mage_vs_warrior_basic', !!DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic);
check('Has shooter_vs_mage_basic', !!DEFAULT_RL_SCENARIOS.shooter_vs_mage_basic);
check('Has jimmy_vs_mage_basic', !!DEFAULT_RL_SCENARIOS.jimmy_vs_mage_basic);

const actEnc = new ActionEncoder();
const obsEnc = new ObservationEncoder();

for (const [name, scenario] of Object.entries(DEFAULT_RL_SCENARIOS)) {
  const eng = new GameEngine();
  const ids = eng.initBattle(scenario);
  check(`${name}: initBattle succeeds`, ids.player1Id && ids.player2Id);
  const st = eng.getState();
  const p1Alive = st.characters.find(c => c.id === ids.player1Id)?.alive !== false;
  const p2Alive = st.characters.find(c => c.id === ids.player2Id)?.alive !== false;
  check(`${name}: both alive`, p1Alive && p2Alive);

  const m = buildActionMask(eng, ids.player1Id, actEnc);
  const obs = obsEnc.encode(eng, ids.player1Id, m);
  check(`${name}: can encode observation`, obs && obs.spatial && obs.scalar);

  const validCount = m.reduce((s, v) => s + v, 0);
  check(`${name}: action mask has valid actions`, validCount > 0);
}

// ──────────── RandomPolicy ────────────
console.log('\n-- RandomPolicy --\n');

console.log('[5] RandomPolicy');
const policy = new RandomPolicy(42);

{
  const { engine: eng, ids } = initTestBattle();
  const mask = buildActionMask(eng, ids.player1Id, actEnc);
  const obs = obsEnc.encode(eng, ids.player1Id, mask);

  const action = policy.act(obs, mask);
  check('RandomPolicy selects valid action', mask[action] === 1,
    `action=${action} mask=${mask[action]}`);

  const policy2 = new RandomPolicy(42);
  const action2 = policy2.act(obs, mask);
  check('Same seed → same action', action === action2,
    `a1=${action} a2=${action2}`);
}

// ──────────── BattleEnv ────────────
console.log('\n-- BattleEnv --\n');

const scenario = DEFAULT_RL_SCENARIOS.mage_vs_warrior_basic;

console.log('[6] BattleEnv reset');
const env = new BattleEnv({ scenario });
const ts = env.reset();
check('reset returns FIRST', ts.first());
check('observation has player1', ts.observation?.player1 !== undefined);
check('observation has player2', ts.observation?.player2 !== undefined);
check('extras has actionMasks', ts.extras?.actionMasks?.player1 !== undefined);
check('extras has state', !!ts.extras?.state);
check('extras has turn', ts.extras?.turn === 1, `turn=${ts.extras?.turn}`);
env.close();

console.log('\n[7] BattleEnv step');
const env2 = new BattleEnv({ scenario });
const ts2 = env2.reset();
const p1Mask = ts2.extras.actionMasks.player1;
const p2Mask = ts2.extras.actionMasks.player2;

const p1Action = chooseValid(p1Mask);
const p2Action = chooseValid(p2Mask);
check('Valid P1 action found', p1Action >= 0);
check('Valid P2 action found', p2Action >= 0);

const stepTs = await env2.step({ player1: p1Action, player2: p2Action });
check('step returns MID or LAST', stepTs.mid() || stepTs.last());
check('step reward defined', stepTs.reward?.player1 !== undefined);
env2.close();

console.log('\n[8] BattleEnv illegal action throws');
const env3 = new BattleEnv({ scenario });
env3.reset();
let threw = false;
try { await env3.step({ player1: 99999, player2: 0 }); } catch (e) { threw = true; }
check('Illegal actionIndex throws', threw);
env3.close();

console.log('\n[9] BattleEnv LAST then step throws');
const env4 = new BattleEnv({ scenario, maxTurns: 1 });
const ts4 = env4.reset();
const p1M4 = ts4.extras.actionMasks.player1;
const p2M4 = ts4.extras.actionMasks.player2;
await env4.step({ player1: chooseValid(p1M4), player2: chooseValid(p2M4) });
let threw2 = false;
try { await env4.step({ player1: chooseValid(p1M4), player2: chooseValid(p2M4) }); } catch (e) { threw2 = true; }
check('step after LAST throws', threw2);
env4.close();

// ──────────── SingleAgentBattleEnv ────────────
console.log('\n-- SingleAgentBattleEnv --\n');

console.log('[10] SingleAgentBattleEnv');
const saEnv = new SingleAgentBattleEnv({
  scenario,
  controlledPlayer: 'player1',
  opponentPolicy: new RandomPolicy(123),
});
const saTs = saEnv.reset();
check('reset returns observation for controlled player', !!saTs.observation);
check('observation has spatial', saTs.observation?.spatial instanceof Float32Array);
check('observation has scalar', saTs.observation?.scalar instanceof Float32Array);

const saAction = chooseValid(saTs.extras.actionMask);
check('Valid SA action found', saAction >= 0);
const saStepTs = await saEnv.step(saAction);
check('step returns MID or LAST', saStepTs.mid() || saStepTs.last());
check('reward is a number', typeof saStepTs.reward === 'number',
  `type=${typeof saStepTs.reward} val=${saStepTs.reward}`);
saEnv.close();

console.log('\n[11] close() idempotent');
const env5 = new BattleEnv({ scenario });
env5.reset();
env5.close();
env5.close();
check('close() callable multiple times', true);

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
