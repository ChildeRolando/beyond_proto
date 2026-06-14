// Jimmy breathing rage rule tests
// Verifies: JIMMY_BREATH_IN / JIMMY_BREATH_OUT only affect warrior_rage (盛怒),
// NOT ON_HIT or other rage gains.
// Run: node tests/jimmy_breathing_rage_rule.spec.js

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

/** Create engine with Jimmy (warrior_jimmy + trait_jimmy_breathing) vs target. */
function initJimmyBattle(opts = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 99,
    p1Pos: opts.p1Pos || { q: 0, r: -2 },
    p2Pos: opts.p2Pos || { q: 0, r: 1 },
    players: [
      {
        playerId: 'player1',
        class: '战士',
        roleId: 'warrior_jimmy',
        loadoutSkillIds: getDefaultLoadout('战士'),
        roleLoadoutSkillIds: ['trait_jimmy_breathing'],
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
  return { engine, jimmyId: ids.player1Id, targetId: ids.player2Id };
}

async function doTurn(engine, p1Action, p2Action) {
  if (p1Action) engine.submitAction(p1Action.id, p1Action.skill, p1Action.target || null);
  if (p2Action) engine.submitAction(p2Action.id, p2Action.skill, p2Action.target || null);
  await engine.executeTurn();
}

function rage(engine, id) {
  return engine.resourceSystem.getRage(id);
}

function hasBuff(engine, id, type) {
  return engine.buffManager.hasStatus(id, type);
}

// ================================================================
console.log('\n=== Test A: 吸状态 + warrior_rage → rage +2 ===');
{
  // Turn 1 = odd → breath IN. Jimmy uses warrior_rage (盛怒), not hit.
  // Base 2 + breath-in 1 = 3. But wait, warrior_rage initially gives 2 rage.
  // breath-in adds +1 → 3. The user expects "rage +2" which means from 0 → 2 (base)?
  // Actually, re-reading the user's spec: "盛怒原本 +1，则吸状态下变为 +2"
  // That suggests warrior_rage gives 1 base. But the code says amount: 2...
  // Let me check the code again. TurnManager line 1667-1668: amount: 2.
  // So warrior_rage gives +2 rage. Breath-in adds +1 → +3.
  // But the user's example says "盛怒原本 +1" — this might be outdated.
  // Let me use the actual code values: base 2 + breath-in 1 = 3.
  // Updated expectation: 0 → 3 (base 2 + breath-in 1).

  const { engine, jimmyId: w, targetId: t } = initJimmyBattle();
  check('turn 1 breath-in active', hasBuff(engine, w, 'JIMMY_BREATH_IN'));
  check('initial rage 0', rage(engine, w) === 0);

  // warrior_rage + opponent pass (no damage, so 盛怒 succeeds)
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );

  // warrior_rage base 2 + breath-in 1 = 3
  const finalRage = rage(engine, w);
  check('盛怒 + breath-in: rage +3 (base 2 + 1 breathing)',
    finalRage === 3, `rage=${finalRage}`);
}

// ================================================================
console.log('\n=== Test B: 呼状态 + warrior_rage → rage gain reduced ===');
{
  // Need even turn for breath OUT. Turn 1 = build setup, turn 2 = test.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle();

  // Turn 1: pass (to advance to turn 2)
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );
  // Turn 1 rage: 2 + 1 = 3 (breath-in on turn 1). Spend it somehow...
  // Actually turn 1 warrior_rage already gave 3 rage. Turn 2 we need to test breath-out.
  // But warrior_rage doesn't cost rage, so we have 3 rage.

  // Turn 2: breath OUT
  check('turn 2 breath-out active', hasBuff(engine, w, 'JIMMY_BREATH_OUT'));

  // warrior_rage on turn 2
  const rageBefore = rage(engine, w);
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );

  // warrior_rage base 2 - breath-out 1 = 1.
  // Total: rageBefore (3) + 1 = 4
  const expectedGain = 1; // 2 base - 1 breath-out
  const finalRage = rage(engine, w);
  check('盛怒 + breath-out: rage +1 (base 2 - 1 breathing)',
    finalRage === rageBefore + expectedGain,
    `rage=${finalRage} (expected ${rageBefore + expectedGain}: ${rageBefore} + ${expectedGain})`);
}

// ================================================================
console.log('\n=== Test C: 吸状态 + warrior_slash 命中 → only rage +1 ===');
{
  // Turn 1 odd → breath IN. Slash hit should give +1 ONLY, not +2.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });
  check('turn 1 breath-in active', hasBuff(engine, w, 'JIMMY_BREATH_IN'));

  // Directly give some rage so we can measure the gain
  engine.resourceSystem.add(w, 'rage', 2);
  check('initial rage set', rage(engine, w) === 2);

  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_slash', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  const finalRage = rage(engine, w);
  // 2 initial + 1 ON_HIT (breathing must NOT amplify) = 3
  check('吸 + slash hit: rage +1 only (not +2)',
    finalRage === 3, `rage=${finalRage} (expected 3: 2 + 1 hit)`);
}

// ================================================================
console.log('\n=== Test D: 呼状态 + warrior_slash 命中 → still rage +1 ===');
{
  // Need even turn. Turn 1: pass, turn 2: test.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  // Turn 1: pass to advance
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );
  check('turn 2 breath-out active', hasBuff(engine, w, 'JIMMY_BREATH_OUT'));

  const rageBefore = rage(engine, w);
  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_slash', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  const finalRage = rage(engine, w);
  // rageBefore + 1 ON_HIT (breathing must NOT reduce) = rageBefore + 1
  check('呼 + slash hit: rage +1 (not reduced to 0)',
    finalRage === rageBefore + 1,
    `rage=${finalRage} (expected ${rageBefore + 1}: ${rageBefore} + 1 hit)`);
}

// ================================================================
console.log('\n=== Test E: 吸状态 + warrior_feint 命中 → only rage +1 ===');
{
  // Turn 1 odd → breath IN. feint hit → +1 base ON_HIT, NOT +2.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });
  check('turn 1 breath-in active', hasBuff(engine, w, 'JIMMY_BREATH_IN'));

  // Set initial rage (feint costs 1)
  engine.resourceSystem.add(w, 'rage', 3);
  check('initial rage set', rage(engine, w) === 3);

  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_feint', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  const finalRage = rage(engine, w);
  // 3 initial - 1 cost + 1 ON_HIT (breathing must NOT amplify) = 3
  check('吸 + feint hit: rage +1 only (not +2)',
    finalRage === 3, `rage=${finalRage} (expected 3: 3 - 1 cost + 1 hit)`);
}

// ================================================================
console.log('\n=== Test F: 吸状态 + warrior_feint 挥空 → no rage gain ===');
{
  // Turn 1 breath IN. feint miss → no gain, breathing must NOT give +2 on miss.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: -3 }, p2Pos: { q: 0, r: 0 },
  });
  check('turn 1 breath-in active', hasBuff(engine, w, 'JIMMY_BREATH_IN'));

  engine.resourceSystem.add(w, 'rage', 3);

  // feint targeting empty hex (0,1) — melee out of range after dash
  await doTurn(engine,
    { id: w, skill: 'warrior_feint', target: { q: 0, r: 1 } },
    { id: t, skill: 'mage_gather', target: null }
  );

  const finalRage = rage(engine, w);
  // 3 initial - 1 cost + 0 miss (breathing must NOT give +2 on miss) = 2
  check('吸 + feint miss: no rage gain',
    finalRage === 2, `rage=${finalRage} (expected 2: 3 - 1 cost + 0 miss)`);
}

// ================================================================
console.log('\n=== Test G: 呼状态 + warrior_feint 命中 → still rage +1 ===');
{
  // Need even turn. Turn 1: pass, turn 2: test.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  // Turn 1: pass to advance
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );
  check('turn 2 breath-out active', hasBuff(engine, w, 'JIMMY_BREATH_OUT'));

  const rageBefore = rage(engine, w);
  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_feint', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  const finalRage = rage(engine, w);
  // rageBefore - 1 cost + 1 ON_HIT (breathing must NOT reduce) = rageBefore
  check('呼 + feint hit: rage +1 (not reduced to 0)',
    finalRage === rageBefore,
    `rage=${finalRage} (expected ${rageBefore}: ${rageBefore} - 1 cost + 1 hit)`);
}

// ================================================================
console.log('\n=== Test H: 盛怒被打断/受击 — 不获得 rage ===');
{
  // Turn 1 breath IN. Jimmy uses warrior_rage but is HIT → 盛怒 cancelled.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });
  check('turn 1 breath-in active', hasBuff(engine, w, 'JIMMY_BREATH_IN'));

  // Opponent uses warrior_slash to hit Jimmy; Jimmy uses warrior_rage.
  // But warrior_rage is speed 3, warrior_slash is speed 1.
  // 盛怒 checks if Jimmy was hit during the turn → yes → cancelled.
  const targetPos = engine.registry.getPosition(w); // target Jimmy
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'warrior_slash', target: targetPos }
  );

  // 盛怒 cancelled → no rage gain
  const finalRage = rage(engine, w);
  check('吸 + 盛怒被打断: no rage gain',
    finalRage === 0, `rage=${finalRage} (expected 0: 盛怒 cancelled by hit)`);
}

// ================================================================
console.log('\n=== Test I: 呼状态 盛怒被打断 — 不获得 rage ===');
{
  // Even turn, breath OUT. Jimmy uses warrior_rage, is HIT → cancelled.
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  // Turn 1: pass
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'mage_gather', target: null }
  );
  check('turn 2 breath-out active', hasBuff(engine, w, 'JIMMY_BREATH_OUT'));

  const rageBefore = rage(engine, w);
  // Opponent hits Jimmy
  const targetPos = engine.registry.getPosition(w);
  await doTurn(engine,
    { id: w, skill: 'warrior_rage', target: null },
    { id: t, skill: 'warrior_slash', target: targetPos }
  );

  // 盛怒 cancelled → rage unchanged
  const finalRage = rage(engine, w);
  check('呼 + 盛怒被打断: no rage gain',
    finalRage === rageBefore,
    `rage=${finalRage} (expected ${rageBefore}: 盛怒 cancelled)`);
}

// ================================================================
// Regression: existing ON_HIT rewards still work
// ================================================================
console.log('\n=== Regression: warrior_iaido hit → rage +1 ===');
{
  const { engine, jimmyId: w, targetId: t } = initJimmyBattle({
    p1Pos: { q: 0, r: 0 }, p2Pos: { q: 0, r: 1 },
  });

  // Give enough rage for iaido (cost 3)
  engine.resourceSystem.add(w, 'rage', 5);

  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'warrior_iaido', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  // 5 initial - 3 cost + 1 ON_HIT = 3
  const finalRage = rage(engine, w);
  check('iaido hit: rage +1 (unaffected by breathing)',
    finalRage === 3, `rage=${finalRage} (expected 3: 5 - 3 + 1 hit)`);
}

console.log('\n=== Regression: role_duelist_windstep hit → rage +1 ===');
{
  // This requires duelist role, not Jimmy. Use a standard warrior with duelist role.
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 42,
    p1Pos: { q: 0, r: 0 },
    p2Pos: { q: 0, r: 1 },
    players: [
      {
        playerId: 'player1',
        class: '战士',
        roleId: 'warrior_duelist',
        loadoutSkillIds: getDefaultLoadout('战士'),
        roleLoadoutSkillIds: ['role_duelist_windstep'],
      },
      {
        playerId: 'player2',
        class: '法师',
        roleId: null,
        loadoutSkillIds: getDefaultLoadout('法师'),
        roleLoadoutSkillIds: [],
      },
    ],
  });
  const w = ids.player1Id, t = ids.player2Id;

  engine.resourceSystem.add(w, 'rage', 2);
  const targetPos = engine.registry.getPosition(t);
  await doTurn(engine,
    { id: w, skill: 'role_duelist_windstep', target: targetPos },
    { id: t, skill: 'mage_gather', target: null }
  );

  // 2 initial - 1 cost + 1 ON_HIT = 2
  const finalRage = rage(engine, w);
  check('windstep hit: rage +1', finalRage === 2,
    `rage=${finalRage} (expected 2: 2 - 1 cost + 1 hit)`);
}

// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
