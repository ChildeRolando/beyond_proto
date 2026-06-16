// Selected Task.md regressions: bugs 1, 3, 4, 6, 7
// Run: node tests/selected_task_regression.spec.js

import { GameEngine } from '../engine/GameEngine.js';

const M_8 = ['mage_gather','mage_blast','mage_jump','mage_teleport','mage_qi_siphon','mage_small_blast','mage_small_qi_blast','mage_reactive'];
const W_8 = ['warrior_rage','warrior_move','warrior_slash','warrior_dash','warrior_sheathe','warrior_pressure','warrior_feint','warrior_iaido'];
const S_8 = ['shooter_attack','shooter_reload','shooter_roll','shooter_bell','shooter_aim','shooter_predict','shooter_hook','shooter_slow_shot'];

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

function initBattle(players, opts = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: opts.seed ?? 731,
    p1Pos: opts.p1Pos || { q: 0, r: -2 },
    p2Pos: opts.p2Pos || { q: 0, r: 1 },
    players,
  });
  return { engine, p1: ids.player1Id, p2: ids.player2Id };
}

async function submitAndExecute(engine, actions) {
  for (const action of actions) {
    if (!action) continue;
    const result = engine.submitAction(action.id, action.skill, action.target ?? null);
    if (!result.success) return result;
  }
  return engine.executeTurn();
}

function resources(engine, id) {
  return engine.getState().characters.find(c => c.id === id)?.resources || {};
}

console.log('\n=== Bell regressions ===');
{
  const { engine, p1: shooter, p2: warrior } = initBattle([
    { playerId: 'p1', class: '射手', roleId: null, loadoutSkillIds: S_8, roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 101, p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 1 } });

  const submit = engine.submitAction(shooter, 'shooter_bell', { q: 0, r: 1 });
  check('bell_zero_ammo submit is rejected', submit.success === false, JSON.stringify(submit));
  engine.submitAction(warrior, 'warrior_rage', null);
  const execute = await engine.executeTurn();
  check('bell_zero_ammo does not execute with missing submission', execute.success === false, JSON.stringify(execute));
  check('bell_zero_ammo has no BELL_PENDING', !engine.buffManager.hasStatus(shooter, 'BELL_PENDING'));
  check('bell_zero_ammo has no delayed command', engine.createSnapshot().turnManager.delayedCommands.length === 0);
}

{
  const { engine, p1: shooter, p2: warrior } = initBattle([
    { playerId: 'p1', class: '射手', roleId: null, loadoutSkillIds: S_8, roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 102, p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 1 } });
  engine.resourceSystem.set(shooter, 'ammo', 2);

  await submitAndExecute(engine, [
    { id: shooter, skill: 'shooter_bell', target: { q: 0, r: 1 } },
    { id: warrior, skill: 'warrior_rage' },
  ]);
  const delayed = engine.createSnapshot().turnManager.delayedCommands[0];
  check('bell consumed ammo stored as 2', delayed?.payload?.consumedAmmo === 2, JSON.stringify(delayed?.payload));
  check('bell pending is not a forced action', engine.turnManager.autoSubmitForcedActions().length === 0);

  const beforeCasings = engine.getState().casings.reduce((sum, c) => sum + c.count, 0);
  await submitAndExecute(engine, [
    { id: shooter, skill: 'shooter_reload' },
    { id: warrior, skill: 'warrior_move', target: { q: 0, r: 0 } },
  ]);
  const afterCasings = engine.getState().casings.reduce((sum, c) => sum + c.count, 0);
  check('bell fires exactly consumed ammo count', afterCasings - beforeCasings === 2, `delta=${afterCasings - beforeCasings}`);
}

{
  const { engine, p1: shooter, p2: warrior } = initBattle([
    { playerId: 'p1', class: '射手', roleId: null, loadoutSkillIds: S_8, roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 103, p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 1 } });
  engine.resourceSystem.set(shooter, 'ammo', 1);

  await submitAndExecute(engine, [
    { id: shooter, skill: 'shooter_bell', target: { q: 0, r: 1 } },
    { id: warrior, skill: 'warrior_rage' },
  ]);
  await submitAndExecute(engine, [
    { id: shooter, skill: 'shooter_reload' },
    { id: warrior, skill: 'warrior_move', target: { q: 0, r: 0 } },
  ]);
  check('bell tracks target after speed-3 move and hits new position',
    resources(engine, warrior).rage === 0,
    `warrior resources=${JSON.stringify(resources(engine, warrior))}`);
}

console.log('\n=== Death Wind regressions ===');
{
  const { engine, p1: yan, p2: warrior } = initBattle([
    { playerId: 'p1', class: '射手', roleId: 'shooter_yan', loadoutSkillIds: S_8, roleLoadoutSkillIds: ['trait_yan_death_wind'] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 201, p1Pos: { q: -3, r: 0 }, p2Pos: { q: 3, r: 0 } });
  engine.resourceSystem.set(yan, 'ammo', 1);

  await submitAndExecute(engine, [
    { id: yan, skill: 'shooter_attack', target: { q: -2, r: 0 } },
    { id: warrior, skill: 'warrior_rage' },
  ]);
  check('death_wind does not trigger on self miss', resources(engine, yan).backpackAmmo === 0, `backpack=${resources(engine, yan).backpackAmmo}`);
}

{
  const { engine, p1: yan, p2: warrior } = initBattle([
    { playerId: 'p1', class: '射手', roleId: 'shooter_yan', loadoutSkillIds: S_8, roleLoadoutSkillIds: ['trait_yan_death_wind'] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 202, p1Pos: { q: -3, r: 0 }, p2Pos: { q: 3, r: 0 } });
  engine.projectileCalculator.reset();

  await submitAndExecute(engine, [
    { id: yan, skill: 'shooter_roll', target: { q: -3, r: 1 } },
    { id: warrior, skill: 'warrior_slash', target: { q: 2, r: 0 } },
  ]);
  check('death_wind triggers once for enemy missed action and reloads',
    resources(engine, yan).ammo === 1 && resources(engine, yan).backpackAmmo === 0,
    JSON.stringify(resources(engine, yan)));
}

console.log('\n=== Cost seal backpack regressions ===');
{
  const { engine, p1: mage, p2: shooter } = initBattle([
    { playerId: 'p1', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '射手', roleId: null, loadoutSkillIds: S_8, roleLoadoutSkillIds: [] },
  ], { seed: 301, p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 1 } });
  engine.projectileCalculator._dropCasing(1, 0);
  engine.projectileCalculator._dropCasing(1, 0);

  await submitAndExecute(engine, [
    { id: mage, skill: 'mage_qi_siphon', target: { q: 1, r: 0 } },
    { id: shooter, skill: 'shooter_roll', target: { q: 1, r: 0 } },
  ]);
  check('cost_seal drains backpack ammo gained before hit',
    resources(engine, shooter).backpackAmmo === 0,
    `backpack=${resources(engine, shooter).backpackAmmo}`);
}

{
  const { engine, p1: mage, p2: shooter } = initBattle([
    { playerId: 'p1', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '射手', roleId: null, loadoutSkillIds: S_8, roleLoadoutSkillIds: [] },
  ], { seed: 302, p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 1 } });
  engine.projectileCalculator._dropCasing(0, 1);

  await submitAndExecute(engine, [
    { id: mage, skill: 'mage_qi_siphon', target: { q: 0, r: 1 } },
    { id: shooter, skill: 'shooter_hook', target: { q: 0, r: 2 } },
  ]);
  check('cost_seal blocks hook backpack gain after hit',
    resources(engine, shooter).backpackAmmo === 0,
    `backpack=${resources(engine, shooter).backpackAmmo}`);
}

console.log('\n=== Galaxy regression ===');
{
  const { engine, p1: mage, p2: warrior } = initBattle([
    { playerId: 'p1', class: '法师', roleId: null, loadoutSkillIds: ['mage_gather','mage_blast','mage_jump','mage_teleport','mage_qi_siphon','mage_small_blast','mage_galaxy','mage_reactive'], roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 401, p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 } });
  engine.resourceSystem.set(mage, 'qi', 5);
  engine.submitAction(mage, 'mage_galaxy', null);
  engine.submitAction(warrior, 'warrior_rage', null);
  const started = Date.now();
  const result = await engine.executeTurn();
  const elapsed = Date.now() - started;
  check('galaxy executeTurn resolves without queued input', result.success === true && elapsed < 250, `elapsed=${elapsed} result=${JSON.stringify(result)}`);
}

console.log('\n=== Reactive armor regressions ===');
{
  const { engine, p1: mage, p2: warrior } = initBattle([
    { playerId: 'p1', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 501, p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 } });
  engine.resourceSystem.set(mage, 'shield', 300);

  await submitAndExecute(engine, [
    { id: mage, skill: 'mage_reactive' },
    { id: warrior, skill: 'warrior_sheathe' },
  ]);
  check('reactive armor is intercepted by sheathe', engine.registry.get(warrior).alive !== false, `alive=${engine.registry.get(warrior).alive}`);
  check('sheathe interception grants indra blade', engine.buffManager.hasStatus(warrior, 'INDRA_BLADE'));
}

{
  const { engine, p1: mage, p2: warrior } = initBattle([
    { playerId: 'p1', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
    { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
  ], { seed: 502, p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 } });
  engine.resourceSystem.set(mage, 'shield', 300);
  engine.resourceSystem.set(warrior, 'rage', 1);

  await submitAndExecute(engine, [
    { id: mage, skill: 'mage_reactive' },
    { id: warrior, skill: 'warrior_dash', target: { q: 0, r: 0 } },
  ]);
  check('reactive armor collides with dash melee before body contact',
    engine.registry.get(mage).alive !== false && engine.registry.get(warrior).alive === false,
    `mage alive=${engine.registry.get(mage).alive} warrior alive=${engine.registry.get(warrior).alive}`);
}

console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
