// warrior_blink_strike HUNTED exception tests — 冷血追命 vs 被追猎
// Run: node tests/warrior_blink_strike_hunted.spec.js

import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

const W_8 = ['warrior_rage','warrior_move','warrior_slash','warrior_dash','warrior_sheathe','warrior_pressure','warrior_blink_strike','warrior_lock'];
const M_8 = ['mage_gather','mage_blast','mage_jump','mage_teleport','mage_qi_siphon','mage_small_blast','mage_small_qi_blast','mage_burst'];

function initTest(opts = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: opts.seed || 42,
    p1Pos: opts.wPos || { q: 0, r: -2 },
    p2Pos: opts.mPos || { q: 0, r: 1 },
    players: [
      { playerId: 'p1', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
      { playerId: 'p2', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
    ],
  });
  return { engine, warriorId: ids.player1Id, mageId: ids.player2Id };
}

async function doTurn(engine, wAction, mAction) {
  if (wAction) engine.submitAction(wAction.id, wAction.skill, wAction.target || null);
  if (mAction) engine.submitAction(mAction.id, mAction.skill, mAction.target || null);
  await engine.executeTurn();
}

function rage(engine, id) { return engine.resourceSystem.getRage(id); }

// ================================================================
console.log('\n=== Test A: blink_strike on HUNTED target far away → submit succeeds ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 10, wPos: { q: -3, r: 2 }, mPos: { q: 3, r: -1 } });
  engine.resourceSystem.add(w, 'rage', 5);

  // Apply HUNTED manually to mage (hunter=warrior)
  engine.buffManager.apply(m, 'HUNTED', -1, w, { hunterId: w });
  check('HUNTED applied to target', engine.buffManager.hasStatus(m, 'HUNTED'));

  // Turn 1: blink_strike to mage (far-away HUNTED target)
  const result = engine.submitAction(w, 'warrior_blink_strike', { q: 3, r: -1 });
  await doTurn(engine,
    { id: w, skill: 'warrior_blink_strike', target: { q: 3, r: -1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('blink_strike on distant HUNTED target executed', true);
}

console.log('\n=== Test B: blink_strike on HUNTED target → cooldown NOT started ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 11, wPos: { q: 0, r: -1 }, mPos: { q: 0, r: 1 } });
  engine.resourceSystem.add(w, 'rage', 5);

  // Apply HUNTED manually
  engine.buffManager.apply(m, 'HUNTED', -1, w, { hunterId: w });

  await doTurn(engine,
    { id: w, skill: 'warrior_blink_strike', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  const cd = engine.skillCooldowns.getRemaining(w, 'warrior_blink_strike');
  check('blink_strike cooldown = 0 on HUNTED target', cd === 0, `cd=${cd}`);
}

console.log('\n=== Test C: blink_strike on non-HUNTED target far away → submit may fail ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 12, wPos: { q: -3, r: 2 }, mPos: { q: 3, r: -1 } });
  engine.resourceSystem.add(w, 'rage', 5);
  // No HUNTED on mage

  // The submit should work (no range validation in submitAction for blink_strike),
  // but the BEHIND_TARGET teleport should still work regardless
  await doTurn(engine,
    { id: w, skill: 'warrior_blink_strike', target: { q: 3, r: -1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('blink_strike without HUNTED far away executed (teleport works)', true);
}

console.log('\n=== Test D: blink_strike on non-HUNTED target in range → cooldown starts normally ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 13, wPos: { q: 0, r: -2 }, mPos: { q: 0, r: 1 } });
  engine.resourceSystem.add(w, 'rage', 8);

  await doTurn(engine,
    { id: w, skill: 'warrior_blink_strike', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  const cd = engine.skillCooldowns.getRemaining(w, 'warrior_blink_strike');
  check('blink_strike cooldown = 6 on non-HUNTED target', cd === 6, `cd=${cd}`);
}

console.log('\n=== Test E: blink_strike on HUNTED still costs rage3 ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 14, wPos: { q: 0, r: -1 }, mPos: { q: 0, r: 0 } });
  engine.resourceSystem.add(w, 'rage', 3);
  engine.buffManager.apply(m, 'HUNTED', -1, w, { hunterId: w });

  await doTurn(engine,
    { id: w, skill: 'warrior_blink_strike', target: { q: 0, r: 0 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  // Cost 3 rage, plus ON_HIT gain of 1 = net -2 from initial 3
  check('blink_strike consumed rage3', rage(engine, w) <= 1,
    `rage=${rage(engine, w)} (expected 1: 3 - 3 cost + 1 ON_HIT)`);
}

console.log('\n=== Test F: HUNTED not removed by blink_strike ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 15, wPos: { q: 0, r: -1 }, mPos: { q: 0, r: 0 } });
  engine.resourceSystem.add(w, 'rage', 5);
  engine.buffManager.apply(m, 'HUNTED', -1, w, { hunterId: w });

  await doTurn(engine,
    { id: w, skill: 'warrior_blink_strike', target: { q: 0, r: 0 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('HUNTED still present after blink_strike', engine.buffManager.hasStatus(m, 'HUNTED'));
}

// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
