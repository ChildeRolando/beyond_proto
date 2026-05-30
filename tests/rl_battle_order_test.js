// RL BattleView + BattleOrder + LegalOrderProvider + OrderActionMapper tests
// Run: node tests/rl_battle_order_test.js

import { BattleView } from '../engine/rl/battle/BattleView.js';
import { BattleOrder } from '../engine/rl/actions/BattleOrder.js';
import { getValidOrders } from '../engine/rl/actions/LegalOrderProvider.js';
import { orderToAction, actionToOrder } from '../engine/rl/actions/OrderActionMapper.js';
import { buildActionMaskFromOrders } from '../engine/rl/actions/ActionMask.js';
import { buildActionMask } from '../engine/rl/actions/ActionMask.js';
import { ActionEncoder, TARGET_SELF } from '../engine/rl/actions/ActionEncoder.js';
import { BattleEnv } from '../engine/rl/environment/BattleEnv.js';
import { RolloutRunner } from '../engine/rl/rollout/RolloutRunner.js';
import { RandomPolicy } from '../engine/rl/policies/RandomPolicy.js';
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

console.log('=== RL BattleView + BattleOrder Tests ===\n');

// ─── 1. BattleView basic queries ───
console.log('[1] BattleView basic queries');
{
  const env = makeEnv();
  const view = new BattleView(env.getEngineForDebug());
  check('state() returns object', typeof view.state() === 'object');
  check('turn() > 0', view.turn() > 0);

  const p1 = view.getActor('player1');
  const p2 = view.getActor('player2');
  check('getActor player1 exists', !!p1);
  check('getActor player2 exists', !!p2);
  check('getOpponent player1 = player2', view.getOpponentActor('player1').ownerId === 'player2');
  check('getOpponent player2 = player1', view.getOpponentActor('player2').ownerId === 'player1');

  const skills = view.getAvailableSkills('player1');
  check('getAvailableSkills non-empty', Array.isArray(skills) && skills.length > 0,
    `length=${skills?.length}`);

  const resources = view.getResources('player1');
  check('getResources returns object', typeof resources === 'object');
  check('getResources has qi', 'qi' in resources || 'rage' in resources || 'ammo' in resources);

  check('getPosition returns {q,r}', typeof view.getPosition('player1')?.q === 'number');

  let threw = false;
  try { view.getActor('bad_key'); } catch (e) { threw = true; }
  check('invalid playerKey throws', threw);

  env.close();
}

// ─── 2. BattleOrder serialization ───
console.log('\n[2] BattleOrder serialization');
{
  const selfOrder = new BattleOrder({
    playerKey: 'player1', actorId: 'a', skillId: 'mage_gather',
    skillSlot: 0, targetIndex: TARGET_SELF, targetPos: null, targetKind: 'SELF',
  });
  const hexOrder = new BattleOrder({
    playerKey: 'player1', actorId: 'a', skillId: 'mage_blast',
    skillSlot: 1, targetIndex: 5, targetPos: { q: 1, r: -1 }, targetKind: 'HEX',
  });
  check('SELF order key contains self', selfOrder.key().includes('self') || selfOrder.key().includes('37'));
  check('HEX order key contains target hex', hexOrder.key().includes('5') || hexOrder.key().includes('1,-1'));

  const selfJson = JSON.parse(JSON.stringify(selfOrder.toJSON()));
  check('SELF order JSON has skillId', selfJson.skillId === 'mage_gather');
  check('SELF order JSON targetIndex=37', selfJson.targetIndex === TARGET_SELF);

  const hexJson = JSON.parse(JSON.stringify(hexOrder.toJSON()));
  check('HEX order JSON has skillId', hexJson.skillId === 'mage_blast');
  check('HEX order JSON has targetPos', hexJson.targetPos?.q === 1);
}

// ─── 3. LegalOrderProvider returns valid orders ───
console.log('\n[3] LegalOrderProvider returns valid orders');
{
  const env = makeEnv();
  const view = new BattleView(env.getEngineForDebug());
  const orders = getValidOrders(view, 'player1');
  check('orders non-empty', orders.length > 0,
    `count=${orders.length}`);

  let allOk = true;
  for (const o of orders) {
    if (!o.playerKey || !o.actorId || !o.skillId || o.skillSlot < 0 || o.targetIndex < 0 || o.targetIndex > 37) {
      allOk = false; break;
    }
  }
  check('all orders have required fields', allOk);

  // Check no trait/hidden skills
  let noTrait = true;
  for (const o of orders) {
    if (o.skillId?.includes('trait_')) { noTrait = false; break; }
  }
  check('no trait skills in orders', noTrait);

  // Check orders for player2 too
  const orders2 = getValidOrders(view, 'player2');
  check('player2 orders non-empty', orders2.length > 0);

  env.close();
}

// ─── 4. SELF / HEX target constraints ───
console.log('\n[4] SELF / HEX target constraints');
{
  const env = makeEnv();
  const view = new BattleView(env.getEngineForDebug());
  const orders = getValidOrders(view, 'player1');

  // Find an order for a known SELF skill
  const selfSkills = ['mage_gather', 'warrior_guard', 'shooter_reload', 'role_jimmy_marrow_wine'];
  for (const sid of selfSkills) {
    const selfOrders = orders.filter(o => o.skillId === sid);
    if (selfOrders.length > 0) {
      for (const o of selfOrders) {
        check(`${sid} SELF order targetIndex=37`, o.targetIndex === TARGET_SELF,
          `got ${o.targetIndex}`);
      }
    }
  }

  // Find an order for a known HEX skill
  const hexSkills = ['mage_blast', 'warrior_slash', 'warrior_charge'];
  for (const hid of hexSkills) {
    const hexOrders = orders.filter(o => o.skillId === hid);
    if (hexOrders.length > 0) {
      for (const o of hexOrders) {
        check(`${hid} HEX order targetIndex != 37`, o.targetIndex !== TARGET_SELF,
          `got ${o.targetIndex}`);
      }
    }
  }

  env.close();
}

// ─── 5. Resource legality regression ───
console.log('\n[5] Resource legality regression');
{
  // shooter_bell ammo=0
  const env = makeEnv('shooter_vs_mage_basic');
  const view = new BattleView(env.getEngineForDebug());
  const orders = getValidOrders(view, 'player1');
  const bellCount = orders.filter(o => o.skillId === 'shooter_bell').length;
  // Shooter starts with ammo=0, so shooter_bell should NOT be valid
  check('shooter_bell ammo=0 -> no valid orders', bellCount === 0,
    `got ${bellCount} orders`);
  env.close();
}

{
  // shooter_bell ammo>0
  const env = makeEnv('shooter_vs_mage_basic');
  const engine = env.getEngineForDebug();
  const p1Id = env.getPlayerId('player1');
  engine.resourceSystem.set(p1Id, 'ammo', 2);
  const view = new BattleView(engine);
  const orders = getValidOrders(view, 'player1');
  const bellCount = orders.filter(o => o.skillId === 'shooter_bell').length;
  check('shooter_bell ammo>0 -> valid orders exist', bellCount > 0,
    `got ${bellCount} orders`);
  env.close();
}

{
  // Jimmy wine layer1 rage=3 -> no
  const env = makeEnv('jimmy_vs_mage_basic');
  const engine = env.getEngineForDebug();
  const p1Id = env.getPlayerId('player1');
  engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 1 });
  engine.resourceSystem.set(p1Id, 'rage', 3);
  const view = new BattleView(engine);
  const orders = getValidOrders(view, 'player1');
  const wineOrders = orders.filter(o => o.skillId === 'role_jimmy_marrow_wine');
  check('jimmy wine layer1 rage=3 -> no orders', wineOrders.length === 0,
    `got ${wineOrders.length}`);
  env.close();
}

{
  // Jimmy wine layer1 rage=4 -> yes
  const env = makeEnv('jimmy_vs_mage_basic');
  const engine = env.getEngineForDebug();
  const p1Id = env.getPlayerId('player1');
  engine.buffManager.apply(p1Id, 'JIMMY_MARROW', -1, p1Id, { layer: 1 });
  engine.resourceSystem.set(p1Id, 'rage', 4);
  const view = new BattleView(engine);
  const orders = getValidOrders(view, 'player1');
  const wineOrders = orders.filter(o => o.skillId === 'role_jimmy_marrow_wine');
  check('jimmy wine layer1 rage=4 -> order exists', wineOrders.length === 1,
    `got ${wineOrders.length}`);
  env.close();
}

// ─── 6. OrderActionMapper roundtrip ───
console.log('\n[6] OrderActionMapper roundtrip');
{
  const env = makeEnv();
  const view = new BattleView(env.getEngineForDebug());
  const encoder = new ActionEncoder();
  const orders = getValidOrders(view, 'player1');

  let roundtripOk = true;
  for (const order of orders.slice(0, 30)) {
    const idx = orderToAction(order, encoder, view);
    const back = actionToOrder(idx, encoder, view, 'player1');
    if (!back || back.skillId !== order.skillId || back.targetIndex !== order.targetIndex) {
      roundtripOk = false;
      console.error(`  Roundtrip fail: ${order.skillId}@${order.targetIndex} -> ${idx} -> ${back?.skillId}@${back?.targetIndex}`);
      break;
    }
  }
  check('order->action->order roundtrip consistent', roundtripOk);

  // strict mode: illegal action throws
  let strictThrew = false;
  try { orderToAction(null, encoder, view, { strict: true }); } catch (e) { strictThrew = true; }
  check('strict mode throws on invalid', strictThrew);

  // non-strict: returns null
  const nonStrict = orderToAction(null, encoder, view, { strict: false });
  check('non-strict returns null for invalid', nonStrict === null);

  env.close();
}

// ─── 7. ActionMask equivalence ───
console.log('\n[7] ActionMask equivalence');
{
  const env = makeEnv();
  const engine = env.getEngineForDebug();
  const view = new BattleView(engine);
  const encoder = new ActionEncoder();

  for (const pk of ['player1', 'player2']) {
    const charId = env.getPlayerId(pk);
    const oldMask = buildActionMask(engine, charId, encoder);
    const orders = getValidOrders(view, pk);
    const newMask = buildActionMaskFromOrders(orders, encoder);

    // Compare byte-by-byte (but use truthiness since orders may have extra empty slots)
    let match = true;
    for (let i = 0; i < oldMask.length; i++) {
      if (!!oldMask[i] !== !!newMask[i]) {
        match = false;
        console.error(`  ${pk} mask mismatch at actionIndex ${i}: old=${oldMask[i]} new=${newMask[i]}`);
        break;
      }
    }
    check(`${pk} ActionMask from orders == buildActionMask`, match);
  }

  // Verify mask=1 count equals unique order count
  const orders1 = getValidOrders(view, 'player1');
  const newMask1 = buildActionMaskFromOrders(orders1, encoder);
  const maskOnes = newMask1.reduce((s, v) => s + v, 0);
  const uniqueOrderIndices = new Set(orders1.map(o => encoder.encode({ skillSlot: o.skillSlot, targetIndex: o.targetIndex }))).size;
  check('mask ones == unique valid order indices', maskOnes === uniqueOrderIndices,
    `maskOnes=${maskOnes} uniqueOrders=${uniqueOrderIndices}`);

  env.close();
}

// ─── 8. Existing rollout still works ───
console.log('\n[8] Existing rollout still works');
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
