// Role mechanic regression tests
// Run: node tests/role_mechanics_test.js

import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32mOK\x1b[0m ${name}`);
  } else {
    failed++;
    console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`);
  }
}

function initRoleBattle(p1, p2, positions = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 123,
    p1Pos: positions.p1 || { q: 0, r: -1 },
    p2Pos: positions.p2 || { q: 0, r: 1 },
    players: [
      {
        playerId: 'player1',
        class: p1.class,
        roleId: p1.roleId,
        loadoutSkillIds: p1.loadout || getDefaultLoadout(p1.class),
      },
      {
        playerId: 'player2',
        class: p2.class,
        roleId: p2.roleId,
        loadoutSkillIds: p2.loadout || getDefaultLoadout(p2.class),
      },
    ],
  });
  return { engine, ids };
}

function character(engine, ownerId) {
  return engine.getState().characters.find(c => c.ownerId === ownerId);
}

function hasBuff(engine, ownerId, statusType) {
  return character(engine, ownerId)?.buffs?.some(b => b.statusType === statusType);
}

console.log('=== Role Mechanic Tests ===\n');

console.log('[1] Jimmy');
{
  const { engine, ids } = initRoleBattle(
    { class: '战士', roleId: 'warrior_jimmy' },
    { class: '射手', roleId: 'shooter_gunfighter' },
  );

  const p1Result = engine.submitAction(ids.player1Id, 'role_jimmy_marrow_wine', null);
  const p2Result = engine.submitAction(ids.player2Id, 'shooter_block', null);
  check('Jimmy marrow wine can be submitted', p1Result.success, p1Result.error);
  check('Opponent filler action can be submitted', p2Result.success, p2Result.error);

  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Jimmy gains marrow status', hasBuff(engine, 'player1', 'JIMMY_MARROW'));
  check('Jimmy gains 2 rage from marrow wine', p1.resources.rage === 2, `rage=${p1.resources.rage}`);
}

console.log('\n[2] Gunfighter');
{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_gunfighter' },
    { class: '战士', roleId: 'warrior_jimmy' },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  const p1Initial = character(engine, 'player1');
  check('Gunfighter quick action is not an active role skill', !p1Initial.roleSkillIds.includes('role_gunfighter_quick_action'));

  engine.resourceSystem.add(ids.player1Id, 'ammo', 1);
  const main = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  const extra = engine.submitAction(ids.player1Id, 'shooter_roll', { q: 1, r: -1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Gunfighter can submit a normal action', main.success, main.error);
  check('Gunfighter can submit one extra cost-0 finesse action', extra.success, extra.error);
  check('Gunfighter normal shot spends ammo', p1.resources.ammo === 0, `ammo=${p1.resources.ammo}`);
  check('Gunfighter extra cost-0 action resolves in same turn', p1.position.q === 1 && p1.position.r === -1, `pos=${p1.position.q},${p1.position.r}`);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_gunfighter' },
    { class: '战士', roleId: 'warrior_jimmy' },
  );

  engine.resourceSystem.add(ids.player1Id, 'ammo', 1);
  const freeFirst = engine.submitAction(ids.player1Id, 'shooter_block', null);
  const paidAfterFree = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  check('Gunfighter can spend finesse before paid main action', freeFirst.success && paidAfterFree.success, `${freeFirst.error || ''} ${paidAfterFree.error || ''}`);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_gunfighter' },
    { class: '战士', roleId: 'warrior_jimmy' },
  );

  engine.resourceSystem.add(ids.player1Id, 'ammo', 2);
  const firstPaid = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  const secondPaid = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  check('Gunfighter first paid action is accepted', firstPaid.success, firstPaid.error);
  check('Gunfighter second paid action is rejected', !secondPaid.success && secondPaid.error === 'action_points_exhausted', secondPaid.error);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver' },
    { class: '战士', roleId: 'warrior_jimmy' },
  );

  const firstFree = engine.submitAction(ids.player1Id, 'role_helldiver_supply_drop', null);
  const secondFree = engine.submitAction(ids.player1Id, 'shooter_block', null);
  check('Non-Gunfighter first cost-0 action is accepted', firstFree.success, firstFree.error);
  check('Non-Gunfighter second cost-0 action is rejected', !secondFree.success && secondFree.error === 'action_points_exhausted', secondFree.error);
}

console.log('\n[3] Helldiver');
{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver' },
    { class: '战士', roleId: 'warrior_jimmy' },
  );

  engine.submitAction(ids.player1Id, 'role_helldiver_supply_drop', null);
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Helldiver supply drop adds backpack ammo', p1.resources.backpackAmmo === 2, `backpackAmmo=${p1.resources.backpackAmmo}`);
  check('Helldiver laser passive charges ammo at cleanup', p1.resources.ammo === 1, `ammo=${p1.resources.ammo}`);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver' },
    { class: '射手', roleId: 'shooter_gunfighter' },
    { p1: { q: 0, r: 0 }, p2: { q: 0, r: 1 } },
  );

  engine.submitAction(ids.player1Id, 'role_helldiver_precision_strike', { q: 0, r: 1 });
  engine.submitAction(ids.player2Id, 'shooter_aim', null);
  await engine.executeTurn();
  const p2 = character(engine, 'player2');
  check('Helldiver precision strike hits the targeted hex', p2.alive === false, `alive=${p2.alive}`);
}

console.log('\n[4] Yan Shuangying');
{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_yan' },
    { class: '战士', roleId: 'warrior_jimmy' },
    { p1: { q: 0, r: 0 }, p2: { q: 0, r: 1 } },
  );

  engine.resourceSystem.add(ids.player2Id, 'rage', 1);
  engine.submitAction(ids.player1Id, 'role_yan_empty_gun', { q: 0, r: 1 });
  engine.submitAction(ids.player2Id, 'warrior_dash', { q: 0, r: 0 });
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  const p2 = character(engine, 'player2');
  const cancelLog = engine.logger.getEntries().some(entry => entry.message.includes('枪里没有子弹'));
  check('Yan empty gun cancels the marked attack', p1.alive === true, `alive=${p1.alive}`);
  check('Yan empty gun does not refund paid attack cost', p2.resources.rage === 0, `rage=${p2.resources.rage}`);
  check('Yan empty gun writes a cancellation log', cancelLog);
  check('Yan empty gun expires at end of turn', !hasBuff(engine, 'player2', 'YAN_EMPTY_GUN'));
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
