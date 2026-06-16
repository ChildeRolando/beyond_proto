// warrior_lock rework tests — 杀意锁定 → MARKED_BY_KILLING_INTENT → PREDATORY_STEP_READY / HUNTED
// Run: node tests/warrior_lock_hunted_rework.spec.js

import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';
import { hexDistance } from '../engine/HexMath.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

// Test loadouts (exactly 8 skills including critical ones for test coverage)
const WARRIOR_TEST_8 = ['warrior_rage','warrior_move','warrior_slash','warrior_dash','warrior_sheathe','warrior_pressure','warrior_feint','warrior_lock'];
const MAGE_TEST_8 = ['mage_gather','mage_blast','mage_jump','mage_teleport','mage_qi_siphon','mage_small_blast','mage_small_qi_blast','mage_burst'];

function initTest(opts = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: opts.seed || 42,
    p1Pos: opts.wPos || { q: 0, r: -2 },
    p2Pos: opts.mPos || { q: 0, r: 1 },
    players: [
      { playerId: 'p1', class: '战士', roleId: null, loadoutSkillIds: WARRIOR_TEST_8, roleLoadoutSkillIds: [] },
      { playerId: 'p2', class: '法师', roleId: null, loadoutSkillIds: MAGE_TEST_8, roleLoadoutSkillIds: [] },
    ],
  });
  return { engine, warriorId: ids.player1Id, mageId: ids.player2Id };
}

async function doTurn(engine, wAction, mAction) {
  if (wAction) engine.submitAction(wAction.id, wAction.skill, wAction.target || null);
  if (mAction) engine.submitAction(mAction.id, mAction.skill, mAction.target || null);
  await engine.executeTurn();
}

// ================================================================
console.log('\n=== Test A: 杀意锁定 applies MARKED_BY_KILLING_INTENT ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 1 });
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('target has MARKED_BY_KILLING_INTENT', engine.buffManager.hasStatus(m, 'MARKED_BY_KILLING_INTENT'));
  check('mark has casterId', (() => {
    const marks = engine.buffManager.getActiveBuffs(m).filter(b => b.statusType === 'MARKED_BY_KILLING_INTENT');
    return marks.length > 0 && marks[0].data?.casterId === w;
  })());
}

console.log('\n=== Test B: target moves next turn → caster gets PREDATORY_STEP_READY ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 2, wPos: { q: 0, r: -2 }, mPos: { q: 0, r: 1 } });
  engine.resourceSystem.set(m, 'qi', 2);

  // Turn 1: warrior locks mage
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('mark applied', engine.buffManager.hasStatus(m, 'MARKED_BY_KILLING_INTENT'));

  // Turn 2: mage uses mage_teleport (movement) → caster gets PREDATORY_STEP_READY
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_teleport', target: { q: 1, r: 0 } }
  );
  check('caster has PREDATORY_STEP_READY', engine.buffManager.hasStatus(w, 'PREDATORY_STEP_READY'));
  check('mark removed after resolution', !engine.buffManager.hasStatus(m, 'MARKED_BY_KILLING_INTENT'));
  check('target does NOT have HUNTED', !engine.buffManager.hasStatus(m, 'HUNTED'));
}

console.log('\n=== Test C: target does NOT move → gets permanent HUNTED ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 3 });

  // Turn 1: warrior locks mage
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );

  // Turn 2: mage uses mage_gather (not movement) → mage gets HUNTED
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('target has HUNTED', engine.buffManager.hasStatus(m, 'HUNTED'));
  check('caster does NOT have PREDATORY_STEP_READY', !engine.buffManager.hasStatus(w, 'PREDATORY_STEP_READY'));
  // Verify HUNTED data
  const huntedBuffs = engine.buffManager.getActiveBuffs(m).filter(b => b.statusType === 'HUNTED');
  check('HUNTED has hunterId = warriorId', huntedBuffs.length > 0 && huntedBuffs[0].data?.hunterId === w);
}

console.log('\n=== Test D: same-speed target movement does not self-mark caster ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 4 });
  engine.resourceSystem.set(m, 'qi', 2);

  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_teleport', target: { q: 1, r: 0 } }
  );
  // With warrior_lock at speed 1, same-speed movement can leave the selected hex
  // before the status command resolves. The status must not fall back to caster.
  check('target has no stale mark after leaving selected hex', !engine.buffManager.hasStatus(m, 'MARKED_BY_KILLING_INTENT'));
  check('caster is not self-marked when target leaves', !engine.buffManager.hasStatus(w, 'MARKED_BY_KILLING_INTENT'));
}

console.log('\n=== Test E: PREDATORY_STEP_READY makes movement skill free ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 5, wPos: { q: 0, r: -2 }, mPos: { q: 0, r: 1 } });
  engine.resourceSystem.set(m, 'qi', 2);

  // Turn 1: lock
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  // Turn 2: mage moves → caster gets PREDATORY_STEP_READY
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_teleport', target: { q: 1, r: 0 } }
  );
  check('PREDATORY_STEP_READY active', engine.buffManager.hasStatus(w, 'PREDATORY_STEP_READY'));

  // Turn 3: warrior uses warrior_move (normally qualifies as movement, cost 0 already)
  // The cost should be 0 (already is) but the predatory step should be consumed
  await doTurn(engine,
    { id: w, skill: 'warrior_move', target: { q: 0, r: 0 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('PREDATORY_STEP_READY removed after movement use', !engine.buffManager.hasStatus(w, 'PREDATORY_STEP_READY'));
}

console.log('\n=== Test F: HUNTED persists across turns ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 6 });

  // Turn 1: lock
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  // Turn 2: no move → HUNTED
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('HUNTED applied', engine.buffManager.hasStatus(m, 'HUNTED'));

  // Turn 3: HUNTED should persist
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('HUNTED persists on turn 3', engine.buffManager.hasStatus(m, 'HUNTED'));
}

console.log('\n=== Test G: dead target does not crash mark resolution ===');
{
  const { engine, warriorId: w, mageId: m } = initTest({ seed: 7 });
  engine.resourceSystem.set(m, 'hp', 1); // mage at 1 HP

  // Turn 1: lock
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  // Kill mage with a direct attack from warrior_slash
  await doTurn(engine,
    { id: w, skill: 'warrior_slash', target: { q: 0, r: 1 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  // mark resolution should not crash — it just skips dead chars
  check('dead target handled without crash', true);
}

// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
