// Resource-action reaction resolution tests — end-to-end integration
// Run: node tests/resource_action_reaction_resolution.spec.js

import { GameEngine } from '../engine/GameEngine.js';

const W_8 = ['warrior_rage','warrior_move','warrior_slash','warrior_dash','warrior_sheathe','warrior_pressure','warrior_feint','warrior_lock'];
const M_8 = ['mage_gather','mage_blast','mage_jump','mage_teleport','mage_qi_siphon','mage_small_blast','mage_small_qi_blast','mage_burst'];

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

const p2DefClass = '法师';

function initTest(opts = {}) {
  const engine = new GameEngine();
  const p1Class = opts.p1Class || '战士';
  const p2Class = opts.p2Class || p2DefClass;
  const ids = engine.initBattle({
    seed: opts.seed || 42,
    p1Pos: opts.p1Pos || { q: 0, r: -2 },
    p2Pos: opts.p2Pos || { q: 0, r: 1 },
    players: [
      { playerId: 'p1', class: p1Class, roleId: null,
        loadoutSkillIds: p1Class === '法师' ? M_8 : W_8, roleLoadoutSkillIds: [] },
      { playerId: 'p2', class: p2Class, roleId: null,
        loadoutSkillIds: p2Class === '法师' ? M_8 : W_8, roleLoadoutSkillIds: [] },
    ],
  });
  return { engine, p1Id: ids.player1Id, p2Id: ids.player2Id };
}

async function doTurn(engine, a1, a2) {
  if (a1) engine.submitAction(a1.id, a1.skill, a1.target || null);
  if (a2) engine.submitAction(a2.id, a2.skill, a2.target || null);
  await engine.executeTurn();
}

// ================================================================
console.log('\n=== Integration: 压迫 + 杀意锁定 + 被追猎 chain ===');
{
  const { engine, p1Id: w, p2Id: m } = initTest({
    seed: 100, p1Pos: { q: 0, r: -1 }, p2Pos: { q: 0, r: 0 },
  });
  engine.resourceSystem.add(w, 'rage', 3);

  // Turn 1: warrior locks mage
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 0 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('mark applied', engine.buffManager.hasStatus(m, 'MARKED_BY_KILLING_INTENT'));

  // Turn 2: mage does NOT move → gets HUNTED
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('HUNTED applied', engine.buffManager.hasStatus(m, 'HUNTED'));

  // Turn 3: warrior lock again (reapply mark on HUNTED target)
  await doTurn(engine,
    { id: w, skill: 'warrior_lock', target: { q: 0, r: 0 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  check('second mark applied', engine.buffManager.hasStatus(m, 'MARKED_BY_KILLING_INTENT'));
  check('HUNTED still present', engine.buffManager.hasStatus(m, 'HUNTED'));

  // Turn 4: mage moves → caster gets PREDATORY_STEP_READY
  engine.resourceSystem.set(m, 'qi', 2);
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_teleport', target: { q: 1, r: 0 } }
  );
  check('PREDATORY_STEP_READY given for movement', engine.buffManager.hasStatus(w, 'PREDATORY_STEP_READY'));
  check('HUNTED STILL present (not removed by mark re-trigger)', engine.buffManager.hasStatus(m, 'HUNTED'));
}

console.log('\n=== Integration: qi_siphon + pressure interaction ===');
{
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 101,
    p1Pos: { q: 0, r: -2 },
    p2Pos: { q: 0, r: 1 },
    players: [
      { playerId: 'p1', class: '法师', roleId: null, loadoutSkillIds: M_8, roleLoadoutSkillIds: [] },
      { playerId: 'p2', class: '战士', roleId: null, loadoutSkillIds: W_8, roleLoadoutSkillIds: [] },
    ],
  });
  const m = ids.player1Id, w = ids.player2Id;

  // Turn 1: warrior uses warrior_rage (resourceAction), mage pressure isn't available for mage
  // Just verify the submitted skill tracking works
  await doTurn(engine,
    { id: m, skill: 'mage_qi_siphon', target: { q: 0, r: 1 } },
    { id: w, skill: 'warrior_rage', target: null }
  );
  check('qi_siphon + warrior_rage: caster qi +1',
    engine.resourceSystem.get(m, 'qi') === 1, `qi=${engine.resourceSystem.get(m, 'qi')}`);
  check('target COST_SEALED', engine.buffManager.hasStatus(w, 'COST_SEALED'));
}

console.log('\n=== Integration: turnManager query helpers ===');
{
  const { engine, p1Id: w, p2Id: m } = initTest({
    seed: 102, p1Pos: { q: 0, r: -1 }, p2Pos: { q: 0, r: 0 },
  });

  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_gather', target: null }
  );

  const tm = engine.turnManager;
  check('getSubmittedSkillId returns warrior_rage', tm.getSubmittedSkillId(w) === 'warrior_rage');
  check('didUseResourceAction(w) = true (warrior_rage)', tm.didUseResourceAction(w) === true);
  check('didUseResourceAction(m) = true (mage_gather)', tm.didUseResourceAction(m) === true);
  check('didUseMovementAction(w) = false', tm.didUseMovementAction(w) === false);
  check('didUseMovementAction(m) = false', tm.didUseMovementAction(m) === false);
}

console.log('\n=== Integration: MOVEMENT detection ===');
{
  const { engine, p1Id: w, p2Id: m } = initTest({
    seed: 103, p1Pos: { q: 0, r: -1 }, p2Pos: { q: 0, r: 0 },
  });
  engine.resourceSystem.set(m, 'qi', 2);

  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: m, skill: 'mage_teleport', target: { q: 1, r: 0 } }
  );

  const tm = engine.turnManager;
  check('didUseMovementAction(m) = true (mage_teleport)', tm.didUseMovementAction(m) === true);
  check('didUseResourceAction(w) = true', tm.didUseResourceAction(w) === true);
  check('didUseMovementAction(w) = false', tm.didUseMovementAction(w) === false);
}

console.log('\n=== Integration: dead characters submitted skill tracking ===');
{
  const { engine, p1Id: w, p2Id: m } = initTest({
    seed: 104, p1Pos: { q: 0, r: -1 }, p2Pos: { q: 0, r: 0 },
  });
  engine.resourceSystem.set(m, 'hp', 1);

  await doTurn(engine,
    { id: w, skill: 'warrior_slash', target: { q: 0, r: 0 } },
    { id: m, skill: 'mage_gather', target: null }
  );
  // mage should be dead but submitted skill tracking still works via #submittedSkillMap
  const tm = engine.turnManager;
  check('killed target still tracked for resource action',
    tm.didUseResourceAction(m) === true);
}

// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
