// Role mechanic regression tests
// Run: node tests/role_mechanics_test.js

import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout, getDefaultRoleLoadout } from '../engine/RoleData.js';

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
        roleLoadoutSkillIds: p1.roleLoadout,
      },
      {
        playerId: 'player2',
        class: p2.class,
        roleId: p2.roleId,
        loadoutSkillIds: p2.loadout || getDefaultLoadout(p2.class),
        roleLoadoutSkillIds: p2.roleLoadout,
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

console.log('[1] Jimmy breathing');
{
  const { engine, ids } = initRoleBattle(
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
    { class: '射手', roleId: 'shooter_gunfighter', roleLoadout: ['trait_gunfighter_finesse'] },
  );

  check('Jimmy marrow not applied (not in role loadout)', !hasBuff(engine, 'player1', 'JIMMY_MARROW'));

  const p1Result = engine.submitAction(ids.player1Id, 'warrior_rage', null);
  const p2Result = engine.submitAction(ids.player2Id, 'shooter_roll', null);
  check('Jimmy rage skill submitted', p1Result.success, p1Result.error);
  check('Opponent filler action submitted', p2Result.success, p2Result.error);

  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Jimmy gains 3 rage from rage skill + breathing', p1.resources.rage === 3, `rage=${p1.resources.rage}`);
}

console.log('\n[2] Jimmy marrow');
{
  const { engine, ids } = initRoleBattle(
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['role_jimmy_marrow_wine'] },
    { class: '射手', roleId: 'shooter_gunfighter', roleLoadout: ['trait_gunfighter_finesse'] },
  );

  check('Jimmy marrow not auto-applied (active skill)', !hasBuff(engine, 'player1', 'JIMMY_MARROW'));

  // Use 易经洗髓酒: needs 3 rage for layer 0→1
  engine.resourceSystem.add(ids.player1Id, 'rage', 3);
  const p1Result = engine.submitAction(ids.player1Id, 'role_jimmy_marrow_wine', null);
  check('Jimmy marrow wine submitted', p1Result.success, p1Result.error);
  engine.submitAction(ids.player2Id, 'shooter_roll', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  // 3 rage added - 3 consumed = 0, + 1 from turn-2 QI passive = 1
  check('Jimmy marrow consumes 3 rage for layer 1', p1.resources.rage === 1, `rage=${p1.resources.rage}`);
  check('Jimmy marrow grants qi reward buff', hasBuff(engine, 'player1', 'JIMMY_MARROW_QI'));
  check('Jimmy marrow at layer 1', hasBuff(engine, 'player1', 'JIMMY_MARROW'));
}

console.log('\n[3] Gunfighter finesse');
{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_gunfighter', roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  const p1Initial = character(engine, 'player1');
  check('Gunfighter quick action is not an active role skill', !p1Initial.roleSkillIds.includes('role_gunfighter_quick_action'));

  engine.resourceSystem.add(ids.player1Id, 'ammo', 1);
  const main = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Gunfighter can submit a normal action', main.success, main.error);
  check('Gunfighter normal shot spends ammo', p1.resources.ammo === 0, `ammo=${p1.resources.ammo}`);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_gunfighter', roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  const extra = engine.submitAction(ids.player1Id, 'shooter_roll', { q: 1, r: -1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Gunfighter can submit cost-0 finesse action', extra.success, extra.error);
  check('Gunfighter cost-0 action resolves in same turn', p1.position.q === 1 && p1.position.r === -1, `pos=${p1.position.q},${p1.position.r}`);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_gunfighter', roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
  );

  // Finesse is every 2 turns; turn 1 cooldown=1, need to advance to turn 2
  engine.submitAction(ids.player1Id, 'shooter_roll', null);
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();

  engine.resourceSystem.add(ids.player1Id, 'ammo', 1);
  const freeFirst = engine.submitAction(ids.player1Id, 'shooter_roll', null);
  const paidAfterFree = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  check('Gunfighter can spend finesse before paid main action', freeFirst.success && paidAfterFree.success, `${freeFirst.error || ''} ${paidAfterFree.error || ''}`);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_gunfighter', roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
  );

  // Finesse is every 2 turns; turn 1 cooldown=1, need to advance to turn 2
  engine.submitAction(ids.player1Id, 'shooter_roll', null);
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();

  engine.resourceSystem.add(ids.player1Id, 'ammo', 2);
  const firstPaid = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  const secondPaid = engine.submitAction(ids.player1Id, 'shooter_attack', { q: 0, r: 1 });
  check('Gunfighter first paid action is accepted', firstPaid.success, firstPaid.error);
  check('Gunfighter second paid action is rejected', !secondPaid.success && secondPaid.error === 'action_points_exhausted', secondPaid.error);
}

{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver', roleLoadout: ['trait_helldiver_laser_weapon', 'role_helldiver_supply_drop'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
  );

  const firstFree = engine.submitAction(ids.player1Id, 'role_helldiver_supply_drop', { q: 0, r: -1 });
  const secondFree = engine.submitAction(ids.player1Id, 'shooter_roll', { q: 1, r: -1 });
  check('Non-Gunfighter first cost-0 action is accepted', firstFree.success, firstFree.error);
  check('Non-Gunfighter second cost-0 action is rejected', !secondFree.success && secondFree.error === 'action_points_exhausted', secondFree.error);
}

console.log('\n[4] Helldiver');
{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver', roleLoadout: ['trait_helldiver_laser_weapon', 'role_helldiver_supply_drop'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
  );

  // Supply drop places a crate at target hex; roll over it to collect
  engine.submitAction(ids.player1Id, 'role_helldiver_supply_drop', { q: 0, r: -1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  let p1 = character(engine, 'player1');
  // Laser gives +1 backpack at cleanup, supply crate placed (not collected yet) = 1 backpack
  check('Helldiver laser passive gives +1 backpack at cleanup', p1.resources.backpackAmmo === 1, `backpackAmmo=${p1.resources.backpackAmmo}`);
  check('Helldiver supply crate placed but not auto-collected', p1.resources.ammo === 0, `ammo=${p1.resources.ammo}`);

  // Roll over crate to collect
  engine.submitAction(ids.player1Id, 'shooter_roll', { q: 0, r: -1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  p1 = character(engine, 'player1');
  check('Helldiver rolling over supply crate collects +3 backpack', p1.resources.backpackAmmo === 5, `backpackAmmo=${p1.resources.backpackAmmo}`);
}

{
  // 呼叫轰炸: delayed projectile, hits next turn speed 1
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver', roleLoadout: ['role_helldiver_bombardment'] },
    { class: '射手', roleId: 'shooter_gunfighter', roleLoadout: ['trait_gunfighter_finesse'] },
    { p1: { q: 0, r: 0 }, p2: { q: 0, r: 1 } },
  );

  engine.submitAction(ids.player1Id, 'role_helldiver_bombardment', { q: 0, r: 1 });
  engine.submitAction(ids.player2Id, 'shooter_aim', null);
  await engine.executeTurn();
  // Bombardment fires next turn — target should be hit after two turns
  engine.submitAction(ids.player1Id, 'shooter_roll', null);
  engine.submitAction(ids.player2Id, 'shooter_aim', null);
  await engine.executeTurn();
  const p2 = character(engine, 'player2');
  check('Helldiver bombardment hits after 2 turns (1 delay + 1 resolve)', p2.resources.ammo === -100 || p2.alive === false, `alive=${p2.alive}`);
}

console.log('\n[5] Yan Shuangying');
{
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_yan', roleLoadout: ['trait_yan_death_wind', 'role_yan_empty_gun'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
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

console.log('\n[6] Trait gating');
{
  // Explicit loadout: only selected traits should be active
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver', roleLoadout: ['trait_helldiver_laser_weapon'] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
  );
  engine.submitAction(ids.player1Id, 'shooter_roll', { q: 1, r: -1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Laser weapon active when selected', p1.resources.backpackAmmo === 1, `backpack=${p1.resources.backpackAmmo}`);
  const hasFastReady = engine.turnManager._hasTraitInLoadout(
    engine.registry.get(ids.player1Id), 'trait_helldiver_fast_ready');
  const hasSpeedDraw = engine.turnManager._hasTraitInLoadout(
    engine.registry.get(ids.player1Id), 'trait_helldiver_speed_draw');
  check('Fast ready NOT active when not selected', !hasFastReady);
  check('Speed draw NOT active when not selected', !hasSpeedDraw);
}

{
  // Non-config path: roleLoadoutSkillIds undefined → should use default ROLE_LOADOUT_SIZE traits
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 456,
    p1Pos: { q: 0, r: -1 }, p2Pos: { q: 0, r: 1 },
    players: [
      { playerId: 'player1', class: '射手', roleId: 'shooter_helldiver',
        loadoutSkillIds: getDefaultLoadout('射手'), roleLoadoutSkillIds: undefined },
      { playerId: 'player2', class: '战士', roleId: 'warrior_jimmy',
        loadoutSkillIds: getDefaultLoadout('战士'), roleLoadoutSkillIds: undefined },
    ],
  });
  engine.submitAction(ids.player1Id, 'shooter_roll', { q: 1, r: -1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  // Default for Helldiver: first ROLE_LOADOUT_SIZE from pool = laser_weapon + priority_ready
  const hasLaser = engine.turnManager._hasTraitInLoadout(
    engine.registry.get(ids.player1Id), 'trait_helldiver_laser_weapon');
  const hasPriority = engine.turnManager._hasTraitInLoadout(
    engine.registry.get(ids.player1Id), 'trait_helldiver_priority_ready');
  const hasFastDef = engine.turnManager._hasTraitInLoadout(
    engine.registry.get(ids.player1Id), 'trait_helldiver_fast_ready');
  check('Default traits include laser weapon', hasLaser);
  check('Default traits include priority ready', hasPriority);
  check('Default traits do NOT include fast ready', !hasFastDef);
  check('Laser weapon fires in default (backpack +1)', p1.resources.backpackAmmo === 1, `backpack=${p1.resources.backpackAmmo}`);
}

{
  // Verify that empty array means NO traits active
  const { engine, ids } = initRoleBattle(
    { class: '射手', roleId: 'shooter_helldiver', roleLoadout: [] },
    { class: '战士', roleId: 'warrior_jimmy', roleLoadout: ['trait_jimmy_breathing'] },
  );
  engine.submitAction(ids.player1Id, 'shooter_roll', { q: 1, r: -1 });
  engine.submitAction(ids.player2Id, 'warrior_rage', null);
  await engine.executeTurn();
  const p1 = character(engine, 'player1');
  check('Empty loadout: no laser weapon active', p1.resources.backpackAmmo === 0, `backpack=${p1.resources.backpackAmmo}`);
}

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
