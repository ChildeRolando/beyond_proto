// RL ActionLegality shared utility tests
// Run: node tests/rl_action_legality_test.js
//
// Phase 1: This file should FAIL because ActionLegality.js does not exist yet.

import {
  getEffectiveSkillCost,
  hasSufficientSkillCost,
  hasSufficientEffectResources,
  isSkillSubmitAllowed,
  isPureRepositionSkill,
  passesTargetFilter,
  isSkillVisibleAndSubmittable,
  getTargetShape,
  isSelfTargetShape,
  getEffectiveSkillRange,
} from '../engine/rl/actions/ActionLegality.js';

import { BattleView } from '../engine/rl/battle/BattleView.js';
import { getValidOrders } from '../engine/rl/actions/LegalOrderProvider.js';
import { buildActionMask, buildActionMaskFromOrders } from '../engine/rl/actions/ActionMask.js';
import { ActionEncoder } from '../engine/rl/actions/ActionEncoder.js';
import { BattleEnv } from '../engine/rl/environment/BattleEnv.js';
import { RolloutRunner } from '../engine/rl/rollout/RolloutRunner.js';
import { RandomPolicy } from '../engine/rl/policies/RandomPolicy.js';
import { DEFAULT_RL_SCENARIOS } from '../engine/rl/scenarios/defaultScenarios.js';
import { SKILLS } from '../engine/SkillData.js';

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

console.log('=== RL Action Legality Shared Utility Tests ===\n');

// ─── 1. Module exports exist ───
console.log('[1] Module exports exist');
{
  check('getEffectiveSkillCost exported', typeof getEffectiveSkillCost === 'function');
  check('hasSufficientSkillCost exported', typeof hasSufficientSkillCost === 'function');
  check('hasSufficientEffectResources exported', typeof hasSufficientEffectResources === 'function');
  check('isSkillSubmitAllowed exported', typeof isSkillSubmitAllowed === 'function');
  check('isPureRepositionSkill exported', typeof isPureRepositionSkill === 'function');
  check('passesTargetFilter exported', typeof passesTargetFilter === 'function');
  check('isSkillVisibleAndSubmittable exported', typeof isSkillVisibleAndSubmittable === 'function');
  check('getTargetShape exported', typeof getTargetShape === 'function');
  check('isSelfTargetShape exported', typeof isSelfTargetShape === 'function');
  check('getEffectiveSkillRange exported', typeof getEffectiveSkillRange === 'function');
}

// ─── 2. Jimmy dynamic cost ───
console.log('\n[2] Jimmy dynamic cost');
{
  const skill = SKILLS['role_jimmy_marrow_wine'];
  check('jimmy wine skill found', !!skill);

  // Layer 0 (default, no buff) -> rage 3 — fresh engine
  {
    const env = makeEnv('jimmy_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    const cost = getEffectiveSkillCost(engine, p1Id, skill);
    check('layer 0 cost.rage === 3', cost.rage === 3, `got ${cost.rage}`);
    env.close();
  }

  // Layer 1 -> rage 4 — fresh engine
  {
    const env = makeEnv('jimmy_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 1 });
    const cost = getEffectiveSkillCost(engine, p1Id, skill);
    check('layer 1 cost.rage === 4', cost.rage === 4, `got ${cost.rage}`);
    env.close();
  }

  // Layer 3 -> rage 5 — fresh engine
  {
    const env = makeEnv('jimmy_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 3 });
    const cost = getEffectiveSkillCost(engine, p1Id, skill);
    check('layer 3 cost.rage === 5', cost.rage === 5, `got ${cost.rage}`);
    env.close();
  }
}

// ─── 3. Jimmy affordability ───
console.log('\n[3] Jimmy affordability');
{
  // Layer 1 + rage 3 -> cannot afford
  {
    const env = makeEnv('jimmy_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 1 });
    engine.resourceSystem.set(p1Id, 'rage', 3);
    const skill = SKILLS['role_jimmy_marrow_wine'];
    check('layer1 rage=3 -> hasSufficientSkillCost false',
      hasSufficientSkillCost(engine, p1Id, skill) === false);
    env.close();
  }

  // Layer 1 + rage 4 -> can afford
  {
    const env = makeEnv('jimmy_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 1 });
    engine.resourceSystem.set(p1Id, 'rage', 4);
    const skill = SKILLS['role_jimmy_marrow_wine'];
    check('layer1 rage=4 -> hasSufficientSkillCost true',
      hasSufficientSkillCost(engine, p1Id, skill) === true);
    env.close();
  }
}

// ─── 4. CONSUME_RESOURCE amount:'ALL' ───
console.log('\n[4] CONSUME_RESOURCE amount:ALL');
{
  // ammo = 0 -> false
  {
    const env = makeEnv('shooter_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.resourceSystem.set(p1Id, 'ammo', 0);
    const skill = SKILLS['shooter_bell'];
    check('shooter_bell ammo=0 -> hasSufficientEffectResources false',
      hasSufficientEffectResources(engine, p1Id, skill) === false);
    env.close();
  }

  // ammo = 2 -> true
  {
    const env = makeEnv('shooter_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.resourceSystem.set(p1Id, 'ammo', 2);
    const skill = SKILLS['shooter_bell'];
    check('shooter_bell ammo=2 -> hasSufficientEffectResources true',
      hasSufficientEffectResources(engine, p1Id, skill) === true);
    env.close();
  }
}

// ─── 5. Target filter behavior ───
console.log('\n[5] Target filter behavior');
{
  const env = makeEnv('mage_vs_warrior_basic');
  const engine = env.getEngineForDebug();
  const state = engine.getState();
  const p1 = state.characters.find(c => c.ownerId === 'player1');
  const p2 = state.characters.find(c => c.ownerId === 'player2');
  check('p1 found', !!p1);
  check('p2 found', !!p2);

  // NOT_OCCUPIED_BY_ENEMY: enemy hex -> false
  const enemyHex = { q: p2.position.q, r: p2.position.r };
  check('NOT_OCCUPIED_BY_ENEMY: enemy hex -> false',
    passesTargetFilter(engine, p1, enemyHex.q, enemyHex.r, 'NOT_OCCUPIED_BY_ENEMY', false) === false,
    `enemy at ${enemyHex.q},${enemyHex.r}`);

  // NOT_OCCUPIED_BY_ENEMY: empty hex -> true (find an empty hex)
  const occupied = new Set();
  for (const c of state.characters) {
    if (c.alive !== false && c.position) occupied.add(`${c.position.q},${c.position.r}`);
  }
  // Use HexIndex to iterate all board hexes
  const { HexIndex } = await import('../engine/rl/features/HexIndex.js');
  const hexIdx = new HexIndex();
  let emptyHex = null;
  for (let ti = 0; ti < 37; ti++) {
    const hex = hexIdx.indexToHex(ti);
    if (hex && !occupied.has(`${hex.q},${hex.r}`)) { emptyHex = hex; break; }
  }
  if (emptyHex) {
    check('NOT_OCCUPIED_BY_ENEMY: empty hex -> true',
      passesTargetFilter(engine, p1, emptyHex.q, emptyHex.r, 'NOT_OCCUPIED_BY_ENEMY', false) === true);
  } else {
    check('SKIP: no empty hex found', false, 'board full');
  }

  // occupiable=true: any alive char hex -> false
  check('occupiable: enemy hex -> false',
    passesTargetFilter(engine, p1, enemyHex.q, enemyHex.r, null, true) === false);

  // occupiable=true: empty hex -> true
  if (emptyHex) {
    check('occupiable: empty hex -> true',
      passesTargetFilter(engine, p1, emptyHex.q, emptyHex.r, null, true) === true);
  }

  env.close();
}

// ─── 6. isSkillVisibleAndSubmittable ───
console.log('\n[6] isSkillVisibleAndSubmittable');
{
  check('visible non-trait -> true', isSkillVisibleAndSubmittable({ id: 'test', hidden: false }) === true);
  check('hidden -> false', isSkillVisibleAndSubmittable({ id: 'test', hidden: true }) === false);
  check('trait -> false', isSkillVisibleAndSubmittable({ id: 'test', isTrait: true }) === false);
  check('hidden+trait -> false', isSkillVisibleAndSubmittable({ id: 'test', hidden: true, isTrait: true }) === false);
}

// ─── 7. Target shape helpers ───
console.log('\n[7] Target shape helpers');
{
  check('getTargetShape SELF default', getTargetShape({}) === 'SELF');
  check('getTargetShape explicit', getTargetShape({ targeting: { shape: 'HEX' } }) === 'HEX');
  check('isSelfTargetShape SELF', isSelfTargetShape('SELF') === true);
  check('isSelfTargetShape AOE_SELF', isSelfTargetShape('AOE_SELF') === true);
  check('isSelfTargetShape HEX', isSelfTargetShape('HEX') === false);
}

// ─── 8. ActionMask equivalence after refactor (3 scenarios) ───
console.log('\n[8] ActionMask equivalence across scenarios');
{
  const scenarios = ['mage_vs_warrior_basic', 'shooter_vs_mage_basic', 'jimmy_vs_mage_basic'];
  const encoder = new ActionEncoder();

  for (const scenarioKey of scenarios) {
    const env = makeEnv(scenarioKey);
    const engine = env.getEngineForDebug();
    const view = new BattleView(engine);

    for (const pk of ['player1', 'player2']) {
      const charId = env.getPlayerId(pk);
      const oldMask = buildActionMask(engine, charId, encoder);
      const orders = getValidOrders(view, pk);
      const newMask = buildActionMaskFromOrders(orders, encoder);

      let match = true;
      for (let i = 0; i < oldMask.length; i++) {
        if (!!oldMask[i] !== !!newMask[i]) {
          match = false;
          console.error(`  ${scenarioKey} ${pk} mask mismatch at actionIndex ${i}: old=${oldMask[i]} new=${newMask[i]}`);
          break;
        }
      }
      check(`${scenarioKey} ${pk} mask equivalence`, match);
    }

    env.close();
  }
}

// ─── 9. LegalOrderProvider resource regressions ───
console.log('\n[9] LegalOrderProvider resource regressions');
{
  // shooter_bell ammo=0 -> no valid order
  {
    const env = makeEnv('shooter_vs_mage_basic');
    const view = new BattleView(env.getEngineForDebug());
    const orders = getValidOrders(view, 'player1');
    const bellCount = orders.filter(o => o.skillId === 'shooter_bell').length;
    check('shooter_bell ammo=0 -> no valid orders', bellCount === 0, `got ${bellCount}`);
    env.close();
  }

  // shooter_bell ammo>0 -> valid order exists
  {
    const env = makeEnv('shooter_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.resourceSystem.set(p1Id, 'ammo', 2);
    const view = new BattleView(engine);
    const orders = getValidOrders(view, 'player1');
    const bellCount = orders.filter(o => o.skillId === 'shooter_bell').length;
    check('shooter_bell ammo>0 -> valid orders exist', bellCount > 0, `got ${bellCount}`);
    env.close();
  }

  // Jimmy wine layer1 rage=3 -> no valid order
  {
    const env = makeEnv('jimmy_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 1 });
    engine.resourceSystem.set(p1Id, 'rage', 3);
    const view = new BattleView(engine);
    const orders = getValidOrders(view, 'player1');
    const wineOrders = orders.filter(o => o.skillId === 'role_jimmy_marrow_wine');
    check('jimmy wine layer1 rage=3 -> no orders', wineOrders.length === 0, `got ${wineOrders.length}`);
    env.close();
  }

  // Jimmy wine layer1 rage=4 -> valid order exists
  {
    const env = makeEnv('jimmy_vs_mage_basic');
    const engine = env.getEngineForDebug();
    const p1Id = env.getPlayerId('player1');
    engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 1 });
    engine.resourceSystem.set(p1Id, 'rage', 4);
    const view = new BattleView(engine);
    const orders = getValidOrders(view, 'player1');
    const wineOrders = orders.filter(o => o.skillId === 'role_jimmy_marrow_wine');
    check('jimmy wine layer1 rage=4 -> order exists', wineOrders.length === 1, `got ${wineOrders.length}`);
    env.close();
  }
}

// ─── 10. isPureRepositionSkill ───
console.log('\n[10] isPureRepositionSkill');
{
  // mage_blast is PRESSURE, not pure reposition
  check('mage_blast is not pure reposition', isPureRepositionSkill('mage_blast') === false);
  // warrior_charge should be tested if it exists
  if (SKILLS['warrior_charge']) {
    const isPure = isPureRepositionSkill('warrior_charge');
    console.log(`  -- warrior_charge pureReposition=${isPure}`);
  }
}

// ─── 11. Existing rollout still works ───
console.log('\n[11] Existing rollout still works');
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
  check('rollout completes with steps > 0', episode.steps > 0);
  check('rollout is terminal', episode.finalTimeStep.last() === true);
  env.close();
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
