// warrior_pressure tests — 压迫 (range=99, ENEMY_CHARACTER filter, move 1 toward)
// Run: node tests/warrior_pressure.spec.js

import { GameEngine } from '../engine/GameEngine.js';
import { SKILLS } from '../engine/SkillData.js';
import { hexDistance } from '../engine/HexMath.js';
import { BattleSessionController } from '../session/BattleSessionController.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

const W_8 = ['warrior_rage','warrior_move','warrior_slash','warrior_dash','warrior_sheathe','warrior_pressure','warrior_feint','warrior_lock'];
const M_8 = ['mage_gather','mage_blast','mage_jump','mage_teleport','mage_qi_siphon','mage_small_blast','mage_small_qi_blast','mage_burst'];

function initEngine(opts = {}) {
  const engine = new GameEngine();
  const wPos = opts.wPos || { q: 0, r: -2 };
  const mPos = opts.mPos || { q: 0, r: 1 };
  const ids = engine.initBattle({
    seed: opts.seed ?? 99,
    p1Pos: wPos,
    p2Pos: mPos,
    players: [
      { playerId: 'p1', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
      { playerId: 'p2', class: opts.mageClass || '法师', roleId: null,
        loadoutSkillIds: opts.mageSkills || M_8, roleLoadoutSkillIds: [] },
    ],
  });
  return { engine, wId: ids.player1Id, mId: ids.player2Id };
}

async function doTurn(engine, a1, a2) {
  if (a1) engine.submitAction(a1.id, a1.skill, a1.target || null);
  if (a2) engine.submitAction(a2.id, a2.skill, a2.target || null);
  await engine.executeTurn();
}

function rage(engine, id) { return engine.resourceSystem.get(id, 'rage'); }

// ================================================================
console.log('\n=== Test A: warrior_pressure targeting.range is 99 (not 1) ===');
{
  const skill = SKILLS['warrior_pressure'];
  check('range = 99', skill.targeting.range === 99, `range=${skill.targeting.range}`);
  check('filter = ENEMY_CHARACTER', skill.targeting.filter === 'ENEMY_CHARACTER');
  check('type = 特殊', skill.type === '特殊');
  check('MOVE_TOWARD_TARGET distance = 1', skill.effects.some(e => e.cmd === 'MOVE_TOWARD_TARGET' && e.distance === 1));
}

console.log('\n=== Test B: far target — both submit, warrior moves 1 step ===');
{
  const { engine, wId, mId } = initEngine({ wPos: { q: -3, r: 3 }, mPos: { q: 3, r: -3 } });
  const dist = hexDistance(-3, 3, 3, -3);
  check('distance >> 1', dist > 1, `dist=${dist}`);

  engine.submitAction(wId, 'warrior_pressure', { q: 3, r: -3 });
  engine.submitAction(mId, 'mage_gather', null);
  await engine.executeTurn();

  const wPos = engine.registry.getPosition(wId);
  const newDist = hexDistance(wPos.q, wPos.r, 3, -3);
  check('moved 1 step closer (not teleported)', newDist === dist - 1,
    `dist before=${dist}, after=${newDist}, wPos=(${wPos.q},${wPos.r})`);
}

console.log('\n=== Test B2: engine.submitAction with far enemy succeeds ===');
{
  const { engine, wId } = initEngine({ wPos: { q: -3, r: 3 }, mPos: { q: 3, r: -3 } });
  const r = engine.submitAction(wId, 'warrior_pressure', { q: 3, r: -3 });
  check('submitAction succeeds at far distance', r.success === true, r.success ? '' : JSON.stringify(r));
}

console.log('\n=== Test C: pressure moves only 1 step toward far target (not teleport) ===');
{
  const { engine, wId, mId } = initEngine({ wPos: { q: 0, r: -4 }, mPos: { q: 0, r: 4 } });
  const distBefore = hexDistance(0, -4, 0, 4);
  engine.submitAction(wId, 'warrior_pressure', { q: 0, r: 4 });
  engine.submitAction(mId, 'mage_gather', null);
  await engine.executeTurn();
  const wPos = engine.registry.getPosition(wId);
  const distAfter = hexDistance(wPos.q, wPos.r, 0, 4);
  check('moved exactly 1 step toward target', distAfter === distBefore - 1,
    `before=${distBefore}, after=${distAfter}, pos=(${wPos.q},${wPos.r})`);
}

console.log('\n=== Test D: far target using mage_gather → rage +1 ===');
{
  const { engine, wId, mId } = initEngine({ wPos: { q: -3, r: 3 }, mPos: { q: 3, r: -3 } });
  await doTurn(engine,
    { id: wId, skill: 'warrior_pressure', target: { q: 3, r: -3 } },
    { id: mId, skill: 'mage_gather', target: null }
  );
  check('far target resource action → rage +1', rage(engine, wId) === 1, `rage=${rage(engine, wId)}`);
}

console.log('\n=== Test E: far target using normal attack → no rage ===');
{
  const { engine, wId, mId } = initEngine({ wPos: { q: 0, r: -3 }, mPos: { q: 0, r: 3 } });
  engine.resourceSystem.set(mId, 'qi', 2);
  await doTurn(engine,
    { id: wId, skill: 'warrior_pressure', target: { q: 0, r: 3 } },
    { id: mId, skill: 'mage_blast', target: { q: 0, r: -3 } }
  );
  check('far target normal attack → no rage', rage(engine, wId) === 0, `rage=${rage(engine, wId)}`);
}

console.log('\n=== Test F: empty hex rejected by engine ===');
{
  const { engine, wId } = initEngine();
  const r = engine.submitAction(wId, 'warrior_pressure', { q: -1, r: 1 });
  check('empty hex rejected', r.success === false, JSON.stringify(r));
  check('error is target_not_found', r.error === 'target_not_found', `error=${r.error}`);
}

console.log('\n=== Test G: friendly target rejected by engine ===');
{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 77,
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 1 },
    players: [
      { playerId: 'p1', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
      { playerId: 'p1', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
    ],
  });
  const chars = [...engine.registry.characters()];
  check('two chars exist', chars.length === 2, `count=${chars.length}`);
  const w1 = chars[0].id;
  const w2 = chars[1].id;
  const r = engine.submitAction(w1, 'warrior_pressure', engine.registry.getPosition(w2));
  check('friendly target rejected', r.success === false, JSON.stringify(r));
  check('error is target_not_enemy', r.error === 'target_not_enemy', `error=${r.error}`);
}

console.log('\n=== Test H: pressure cooldown = 3 ===');
{
  const { engine, wId, mId } = initEngine({ wPos: { q: 0, r: -1 }, mPos: { q: 0, r: 0 } });
  await doTurn(engine,
    { id: wId, skill: 'warrior_pressure', target: { q: 0, r: 0 } },
    { id: mId, skill: 'mage_gather', target: null }
  );
  const cd = engine.skillCooldowns.getRemaining(wId, 'warrior_pressure');
  check('cooldown = 3', cd === 3, `cd=${cd}`);
}

console.log('\n=== Test I: pressure rage gain NOT affected by Jimmy breathing ===');
{
  const { engine, wId, mId } = initEngine({ wPos: { q: 0, r: -1 }, mPos: { q: 0, r: 0 } });
  await doTurn(engine,
    { id: wId, skill: 'warrior_pressure', target: { q: 0, r: 0 } },
    { id: mId, skill: 'mage_gather', target: null }
  );
  check('rage gain is exactly 1 (not from breathing)', rage(engine, wId) === 1,
    `rage=${rage(engine, wId)}`);
}

console.log('\n=== Test J: pressure moves toward target AND gains rage ===');
{
  const { engine, wId, mId } = initEngine({ wPos: { q: 0, r: -2 }, mPos: { q: 0, r: 0 } });
  const wPosBefore = { ...engine.registry.getPosition(wId) };
  const distBefore = hexDistance(wPosBefore.q, wPosBefore.r, 0, 0);
  await doTurn(engine,
    { id: wId, skill: 'warrior_pressure', target: { q: 0, r: 0 } },
    { id: mId, skill: 'mage_gather', target: null }
  );
  const wPosAfter = engine.registry.getPosition(wId);
  const distAfter = hexDistance(wPosAfter.q, wPosAfter.r, 0, 0);
  check('moved 1 step toward target', distAfter === distBefore - 1,
    `before=${distBefore}, after=${distAfter}, from=(${wPosBefore.q},${wPosBefore.r}) to=(${wPosAfter.q},${wPosAfter.r})`);
  check('rage gained', rage(engine, wId) === 1, `rage=${rage(engine, wId)}`);
}

// ================================================================
// UI validTargets tests via BattleSessionController
// ================================================================
console.log('\n=== Test K: UI validTargets — far enemy appears, empty hex excluded ===');
{
  const callbacks = { renderAll() {}, setSubmitStatus() {}, setRoute() {}, isPveMode: () => false, getNetworkManager: () => null };
  const session = new BattleSessionController(callbacks);
  session.initGame('战士', '法师', 88, [
    { playerId: 'player1', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
    { playerId: 'player2', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
  ]);
  const wId = session.characterIds[0];
  const mId = session.characterIds[1];
  {
    const oldW = session.engine.registry.getPosition(wId);
    const oldM = session.engine.registry.getPosition(mId);
    session.engine.registry.updatePosition(wId, oldW.q, oldW.r, -3, 3);
    session.engine.registry.updatePosition(mId, oldM.q, oldM.r, 3, -3);
  }
  const dist = hexDistance(-3, 3, 3, -3);
  check('setup: distance >> 1', dist > 1, `dist=${dist}`);

  session.selectSkill(wId, 'warrior_pressure');
  const targets = session.validTargets;

  const hasMagePos = targets.some(t => t.q === 3 && t.r === -3);
  check('UI validTargets includes far enemy', hasMagePos);

  const emptyHexInRange = targets.some(t => t.q === 0 && t.r === 0);
  check('UI validTargets excludes empty hex', !emptyHexInRange);

  const hasSelf = targets.some(t => t.q === -3 && t.r === 3);
  check('UI validTargets excludes self position', !hasSelf);

  let allHaveEnemy = true;
  for (const t of targets) {
    const charsAt = session.engine.registry.getAt(t.q, t.r, 'real');
    const hasEnemy = charsAt.some(c => c.alive !== false && c.ownerId !== 'player1');
    if (!hasEnemy) { allHaveEnemy = false; break; }
  }
  check('all validTargets contain enemy character', allHaveEnemy, `target count=${targets.length}`);
}

console.log('\n=== Test L: UI validTargets — nearby enemy works too ===');
{
  const callbacks = { renderAll() {}, setSubmitStatus() {}, setRoute() {}, isPveMode: () => false, getNetworkManager: () => null };
  const session = new BattleSessionController(callbacks);
  session.initGame('战士', '法师', 89, [
    { playerId: 'player1', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
    { playerId: 'player2', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
  ]);
  const wId = session.characterIds[0];
  const mId = session.characterIds[1];

  session.selectSkill(wId, 'warrior_pressure');
  const targets = session.validTargets;

  const mPos = session.engine.registry.getPosition(mId);
  const hasMage = targets.some(t => t.q === mPos.q && t.r === mPos.r);
  check('UI validTargets includes adjacent enemy', hasMage);
}

// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
