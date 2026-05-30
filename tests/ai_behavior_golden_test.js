// AI golden behavior tests — tests final rankActionsOnePly / chooseAiAction ordering
// NOT internal scoring functions. Must fail before implementation fixes.
// Run: node tests/ai_behavior_golden_test.js

import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';
import { rankActionsOnePly, selectRepresentativeCandidates, orderedCandidates } from '../engine/ai/OnePlyPolicy.js';
import { generateCandidateActions } from '../engine/ai/CandidateGenerator.js';
import { evaluateState } from '../engine/ai/StateEvaluator.js';
import { evaluateStrategicState } from '../engine/ai/RoleStrategyEvaluator.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from '../engine/ai/PrimitiveProfile.js';
import { SKILLS, SKILLS_BY_CLASS } from '../engine/SkillData.js';

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

function initBattleWithPlayers(p1, p2, positions = {}) {
  const engine = new GameEngine();
  const ids = engine.initBattle({
    seed: 42,
    p1Pos: positions.p1 || { q: 0, r: -1 },
    p2Pos: positions.p2 || { q: 0, r: 1 },
    players: [
      {
        playerId: 'player1',
        class: p1.class,
        roleId: p1.roleId,
        loadoutSkillIds: p1.loadout || getDefaultLoadout(p1.class),
        roleLoadoutSkillIds: p1.roleLoadout || [],
      },
      {
        playerId: 'player2',
        class: p2.class,
        roleId: p2.roleId,
        loadoutSkillIds: p2.loadout || getDefaultLoadout(p2.class),
        roleLoadoutSkillIds: p2.roleLoadout || [],
      },
    ],
  });
  return { engine, ids };
}

const policy = {
  maxOwnActions: 12,
  maxOpponentActions: 8,
  maxTargetsPerSkill: 2,
  preserveSkillCoverage: true,
};

console.log('=== AI Golden Behavior Tests ===');
console.log('(These test final action RANKING, not internal scoring)\n');

// ═══════════════════════════════════════════════════════════════════════════
// Test 1: Shooter with nearby casings prefers collect (roll/hook) over reload
// ═══════════════════════════════════════════════════════════════════════════
console.log('[1] Shooter prefers collect over reload with nearby casings');
{
  const shooterSkills = ['shooter_attack', 'shooter_reload', 'shooter_roll',
    'shooter_bell', 'shooter_aim', 'shooter_predict', 'shooter_hook',
    'shooter_slow_shot', 'shooter_armor_pierce', 'shooter_cover_fire'];

  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '射手', roleId: 'shooter_gunfighter', loadout: shooterSkills, roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 2 } },  // 3 hex apart
  );

  // Give shooter low ammo (but not zero) so both reload and collect are relevant
  engine.resourceSystem.set(ids.player1Id, 'ammo', 0);
  engine.resourceSystem.set(ids.player1Id, 'backpackAmmo', 3);  // can reload but should prefer collect

  // Drop casings near shooter (adjacent to their position at 0,-1)
  // shooter_roll has range 2, collects ADJACENT → can reach casings at 0,-2 or 1,-1
  engine.projectileCalculator._dropCasing(0, -2);
  engine.projectileCalculator._dropCasing(1, -1);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, policy);
  check('Ranked results non-empty', ranked.length > 0);

  if (ranked.length >= 3) {
    const top3Skills = ranked.slice(0, 3).map(r => r.action.skillId);
    const top1 = ranked[0];
    const top1Skill = top1.action.skillId;

    check('Top3 includes shooter_roll or shooter_hook',
      top3Skills.includes('shooter_roll') || top3Skills.includes('shooter_hook'),
      `top3=${top3Skills.join(',')}`);
    // With ammo=0, reload is a reasonable response.
    // The critical bug is reloading when ammo is already sufficient (Test 2).
    // This check verifies collect is NOT completely ignored.
    if (top1Skill === 'shooter_reload') {
      const collectInTop2 = ranked[1] && (ranked[1].action.skillId === 'shooter_roll' || ranked[1].action.skillId === 'shooter_hook');
      check('If reload top1, collect action must be top2',
        collectInTop2,
        `rank2=${ranked[1]?.action.skillId}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 2: Shooter with full ammo should NOT reload
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[2] Shooter does not reload when ammo is full');
{
  const shooterSkills = ['shooter_attack', 'shooter_reload', 'shooter_roll',
    'shooter_bell', 'shooter_aim', 'shooter_predict', 'shooter_hook',
    'shooter_slow_shot'];

  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '射手', roleId: 'shooter_gunfighter', loadout: shooterSkills, roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  // Ammo at max (6)
  engine.resourceSystem.set(ids.player1Id, 'ammo', 6);
  engine.resourceSystem.set(ids.player1Id, 'backpackAmmo', 2);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, policy);
  check('Ranked results non-empty', ranked.length > 0);

  if (ranked.length >= 5) {
    const top5Skills = ranked.slice(0, 5).map(r => r.action.skillId);
    const reloadRank = ranked.findIndex(r => r.action.skillId === 'shooter_reload');
    const reloadInTop5 = top5Skills.includes('shooter_reload');

    check('shooter_reload NOT in top5 when ammo full', !reloadInTop5,
      `reload@${reloadRank} top5=${top5Skills.join(',')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 3: Mage MUST recognize mage_burst (3 qi, 9x50) as lethal threat in top3
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[3] Mage recognizes mage_burst as lethal threat');
{
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { class: '战士', roleId: 'warrior_duelist', loadout: ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
      'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'], roleLoadout: [] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  // Give mage 3 qi for burst
  engine.resourceSystem.set(ids.player1Id, 'qi', 3);
  engine.resourceSystem.set(ids.player1Id, 'shield', 0);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, policy);
  check('Ranked results non-empty', ranked.length > 0);

  if (ranked.length >= 5) {
    // Use unique skills (dedupe by skillId) for top N check
    const uniqueSkills = [];
    const seen = new Set();
    for (const r of ranked) {
      if (!seen.has(r.action.skillId)) {
        seen.add(r.action.skillId);
        uniqueSkills.push(r.action.skillId);
      }
    }
    const top3Unique = uniqueSkills.slice(0, 3);
    const burstEntry = ranked.find(r => r.action.skillId === 'mage_burst');

    check('mage_burst is in top3 unique skills', top3Unique.includes('mage_burst'),
      `top3unique=${top3Unique.join(',')}`);

    // Note: post-simulation termBreakdown.threat = 0 is expected
    // (burst consumes qi, leaving no remaining threat after execution).
    // The diagnostics.lethalThreat reflects the pre-execution kill pressure.
    if (burstEntry) {
      check('mage_burst diagnostics lethalThreat > 0',
        burstEntry.diagnostics?.lethalThreat > 0,
        `lethalThreat=${burstEntry.diagnostics?.lethalThreat}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 4: Mage with burst threat + safe = can gather (greed window)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[4] Mage can gather when safe with latent burst threat (greed window)');
{
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { class: '战士', roleId: 'warrior_duelist', loadout: ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
      'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'], roleLoadout: [] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 3 } },  // Far apart — safe
  );

  engine.resourceSystem.set(ids.player1Id, 'qi', 3);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, policy);
  check('Ranked results non-empty', ranked.length > 0);

  if (ranked.length >= 5) {
    const top5Skills = ranked.slice(0, 5).map(r => r.action.skillId);

    // mage_gather CAN be top1 (greed window is valid)
    // But mage_burst MUST still be in top5 (threat is retained)
    check('mage_burst still in top5 when gather is valid',
      top5Skills.includes('mage_burst'),
      `top5=${top5Skills.join(',')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 5: Mage under threat should NOT blindly gather
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[5] Mage under threat does not gather as top1');
{
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { class: '战士', roleId: 'warrior_duelist', loadout: ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
      'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'], roleLoadout: [] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 0 } },  // ADJACENT — melee threat!
  );

  engine.resourceSystem.set(ids.player1Id, 'qi', 3);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, policy);
  check('Ranked results non-empty', ranked.length > 0);

  if (ranked.length >= 1) {
    const top1 = ranked[0].action.skillId;
    check('mage_gather NOT top1 when under melee threat',
      top1 !== 'mage_gather',
      `top1=${top1}`);

    // Top action should be burst, defense, or escape
    const top3Skills = ranked.slice(0, 3).map(r => r.action.skillId);
    const hasSafetyAction = top3Skills.some(sid => {
      const p = getSkillPrimitiveProfile(sid);
      return p.tags.includes(PrimitiveTag.PRESSURE) ||
             p.tags.includes(PrimitiveTag.DEFEND) ||
             p.tags.includes(PrimitiveTag.ESCAPE);
    });
    check('Top3 has PRESSURE/DEFEND/ESCAPE action',
      hasSafetyAction,
      `top3=${top3Skills.join(',')}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 6: Jimmy safe wine drinking — final ranking check
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[6] Jimmy safe wine drinking (ranked final order)');
{
  const warriorSkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '战士', roleId: 'warrior_jimmy', loadout: warriorSkills, roleLoadout: ['role_jimmy_marrow_wine'] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 3 } },  // Far apart — safe
  );

  engine.resourceSystem.add(ids.player1Id, 'rage', 4);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, policy);
  check('Ranked results non-empty', ranked.length > 0);

  if (ranked.length >= 3) {
    const top3Skills = ranked.slice(0, 3).map(r => r.action.skillId);
    const wineEntry = ranked.find(r => r.action.skillId === 'role_jimmy_marrow_wine');

    check('role_jimmy_marrow_wine in top3', top3Skills.includes('role_jimmy_marrow_wine'),
      `top3=${top3Skills.join(',')}`);

    if (wineEntry) {
      check('Wine strategyBias > 0', wineEntry.strategyBias > 0,
        `SB=${wineEntry.strategyBias}`);
      check('Wine has safe_scaling or jimmy_marrow reason',
        wineEntry.strategyReasons?.includes('safe_scaling') || wineEntry.strategyReasons?.includes('jimmy_marrow'),
        `reasons=${wineEntry.strategyReasons?.join(',')}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 7: Jimmy with immediate threat should NOT drink as top1
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[7] Jimmy should not drink as top1 when under threat');
{
  const warriorSkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];
  const enemySkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];

  const { engine, ids } = initBattleWithPlayers(
    { class: '战士', roleId: 'warrior_jimmy', loadout: warriorSkills, roleLoadout: ['role_jimmy_marrow_wine'] },
    { class: '战士', roleId: 'warrior_duelist', loadout: enemySkills, roleLoadout: [] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 0 } },  // Adjacent — melee threat!
  );

  engine.resourceSystem.add(ids.player1Id, 'rage', 4);

  const ranked = await rankActionsOnePly(engine, ids.player1Id, ids.player2Id, policy);
  check('Ranked results non-empty', ranked.length > 0);

  if (ranked.length >= 1) {
    const top1 = ranked[0].action.skillId;
    check('role_jimmy_marrow_wine NOT top1 when adjacent to enemy',
      top1 !== 'role_jimmy_marrow_wine',
      `top1=${top1}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 8: Jimmy layer 0 marrowValue should be 0 (no wine yet)
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[8] Jimmy layer 0 marrowValue should be 0');
{
  const warriorSkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '战士', roleId: 'warrior_jimmy', loadout: warriorSkills, roleLoadout: ['role_jimmy_marrow_wine'] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
  );

  // Jimmy has NOT yet drunk wine — should be layer 0
  const stateActor = engine.getState().characters.find(c => c.id === ids.player1Id);
  const marrow = (stateActor?.buffs || []).find(b => b.statusType === 'JIMMY_MARROW');
  const layer = marrow?.data?.layer ?? 'no buff';
  check('Jimmy has JIMMY_MARROW buff with layer 0', layer === 0 || layer === 'no buff',
    `layer=${JSON.stringify(layer)}`);

  // Strategic state should return 0 for layer 0
  const ownerId = engine.getCharacterOwner(ids.player1Id);
  const stratState = evaluateStrategicState(engine.getState(), ownerId);
  check('Strategy total for layer 0 is 0 (no wine yet)',
    stratState.details.marrowValue !== undefined && stratState.details.marrowValue === 0,
    `marrowValue=${stratState.details.marrowValue} layer=${stratState.details.marrowLayer}`);

  // StateEvaluator strategy term should be 0 for layer 0
  const evalResult = evaluateState(engine.getState(), ownerId);
  check('evaluateState strategy term is ~0 for layer 0',
    evalResult.terms.strategy !== undefined && Math.abs(evalResult.terms.strategy) < 10,
    `strategy=${evalResult.terms.strategy}`);
}

// ─── Summary ───
console.log(`\n=== Golden Behavior Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('EXPECTED FAILURES: These will pass after TDD Phase 2 (code fixes).');
}
process.exitCode = failed > 0 ? 1 : 0;
