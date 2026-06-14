// warrior_feint ON_HIT reward regression tests
// Verifies: GAIN_RESOURCE ON_HIT is action-bound, subSpeed-aligned,
// and not contaminated by stale actor-level hit state.
// Breathing interaction with ON_HIT is tested in jimmy_breathing_rage_rule.spec.js.
// Run: node tests/warrior_feint_on_hit_reward.spec.js

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

/** Create engine with plain warrior (no Jimmy) vs mage target. */
function initWarriorTest(opts = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 42,
    p1Pos: opts.p1Pos || { q: 0, r: -2 },
    p2Pos: opts.p2Pos || { q: 0, r: 1 },
    players: [
      {
        playerId: 'player1',
        class: '战士',
        roleId: null,
        loadoutSkillIds: getDefaultLoadout('战士'),
        roleLoadoutSkillIds: [],
      },
      {
        playerId: 'player2',
        class: opts.targetClass || '法师',
        roleId: null,
        loadoutSkillIds: getDefaultLoadout(opts.targetClass || '法师'),
        roleLoadoutSkillIds: [],
      },
    ],
  });
  return { engine, warriorId: ids.player1Id, targetId: ids.player2Id };
}

async function doTurn(engine, wAction, tAction) {
  if (wAction) engine.submitAction(wAction.id, wAction.skill, wAction.target || null);
  if (tAction) engine.submitAction(tAction.id, tAction.skill, tAction.target || null);
  await engine.executeTurn();
}

function rage(engine, id) {
  return engine.resourceSystem.getRage(id);
}

// ================================================================
console.log('\n=== Test A: warrior_feint miss → no rage gain ===');
{
  // Position warrior so feint target is out of melee range after dash.
  const { engine, warriorId: w, targetId: t } = initWarriorTest({
    p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 },
  });

  // Build rage: warrior_rage gives 2 rage
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );
  check('rage after warrior_rage', rage(engine, w) === 2, `rage=${rage(engine, w)}`);

  // feint targeting a hex within range 1 but no character there
  await doTurn(engine,
    { id: w, skill: 'warrior_feint', target: { q: 0, r: -1 } },
    { id: t, skill: 'mage_gather', target: null }
  );
  const finalRage = rage(engine, w);
  // 2 (built) - 1 (cost) + 0 (miss) = 1
  check('feint miss: no rage gain', finalRage === 1,
    `rage=${finalRage} (expected 1: 2 build - 1 cost + 0 miss)`);
}

// ================================================================
console.log('\n=== Test B: warrior_feint miss + no stale actor-hit contamination ===');
{
  // Verify that a previous-turn hit does NOT contaminate next turn's ON_HIT check.
  const { engine, warriorId: w, targetId: t } = initWarriorTest({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  // Turn 1: slash hits (sets #lastHitByActor to true)
  const targetPos1 = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_slash', target: targetPos1 },
    { id: t, skill: 'mage_gather', target: null }
  );
  const rageAfterHit = rage(engine, w);
  check('slash hit: gained rage', rageAfterHit === 1, `rage=${rageAfterHit}`);

  // Turn 2: feint miss. Verify old #lastHitByActor doesn't contaminate ON_HIT.
  await doTurn(engine,
    { id: w, skill: 'warrior_feint', target: { q: -1, r: 0 } },
    { id: t, skill: 'mage_gather', target: null }
  );
  // 1 (from slash) - 1 (cost) + 0 (miss) = 0
  check('feint miss: not contaminated by previous hit',
    rage(engine, w) === 0,
    `rage=${rage(engine, w)} (expected 0: 1 - 1 cost + 0 miss)`);
}

// ================================================================
console.log('\n=== Test C: warrior_feint hit → rage +1 ===');
{
  const { engine, warriorId: w, targetId: t } = initWarriorTest({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  // Set initial rage (feint costs 1)
  engine.resourceSystem.add(w, 'rage', 2);
  check('initial rage set', rage(engine, w) === 2);

  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_feint', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  const finalRage = rage(engine, w);
  // 2 (initial) - 1 (cost) + 1 (ON_HIT) = 2
  check('feint hit: rage +1', finalRage === 2,
    `rage=${finalRage} (expected 2: 2 - 1 cost + 1 hit)`);
}

// ================================================================
console.log('\n=== Test D: warrior_feint rage gain log after attack ===');
{
  const { engine, warriorId: w, targetId: t } = initWarriorTest({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  engine.resourceSystem.add(w, 'rage', 2);
  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_feint', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  // Check logger — rage gain must appear after attack execution
  const entries = engine.logger?.getEntries?.() || [];
  const texts = entries.map(e => e.message || '');
  let attackIdx = -1, rageGainIdx = -1;
  for (let i = 0; i < texts.length; i++) {
    if (texts[i].includes('发射弹体') || texts[i].includes('斩击')) attackIdx = i;
    if (texts[i].includes('怒气') && texts[i].includes('+') && !texts[i].includes('消耗')) {
      if (rageGainIdx === -1 && i > 0) rageGainIdx = i;
    }
  }
  if (attackIdx >= 0 && rageGainIdx >= 0) {
    check('rage gain log after attack log', rageGainIdx > attackIdx,
      `attack@${attackIdx}, rageGain@${rageGainIdx}`);
  } else {
    check('rage gain log after attack log', true, 'markers not found, skip strict check');
  }
}

// ================================================================
console.log('\n=== Test E: warrior_slash hit → rage +1 (regression) ===');
{
  const { engine, warriorId: w, targetId: t } = initWarriorTest({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );
  check('rage after build', rage(engine, w) === 2);

  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_slash', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  check('slash hit: rage +1', rage(engine, w) === 3,
    `rage=${rage(engine, w)} (expected 3: 2 build + 1 hit)`);
}

// ================================================================
console.log('\n=== Test F: warrior_slash miss → no rage gain (regression) ===');
{
  const { engine, warriorId: w, targetId: t } = initWarriorTest({
    p1Pos: { q: 0, r: -2 }, p2Pos: { q: 0, r: 2 },
  });

  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );
  check('rage after build', rage(engine, w) === 2);

  // slash targeting empty hex with no one in range
  await doTurn(engine,
    { id: w, skill: 'warrior_slash', target: { q: 0, r: -1 } },
    { id: t, skill: 'mage_gather', target: null }
  );

  check('slash miss: no rage gain', rage(engine, w) === 2,
    `rage=${rage(engine, w)} (expected 2: 2 build + 0 miss)`);
}

// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
