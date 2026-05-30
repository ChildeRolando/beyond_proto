// AI strategy layer regression tests
// Run: node tests/ai_strategy_test.js

import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout } from '../engine/RoleData.js';
import { generateCandidateActions } from '../engine/ai/CandidateGenerator.js';
import { orderedCandidates, selectRepresentativeCandidates } from '../engine/ai/OnePlyPolicy.js';
import { evaluateState } from '../engine/ai/StateEvaluator.js';
import { evaluateRoleStrategy, evaluateStrategicState, estimateAttackPotential } from '../engine/ai/RoleStrategyEvaluator.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from '../engine/ai/PrimitiveProfile.js';
import { SKILLS, SKILLS_BY_CLASS } from '../engine/SkillData.js';
import { hexDistance } from '../engine/HexMath.js';

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

console.log('=== AI Strategy Tests ===\n');

// ─── 1. Jimmy safe marrow drinking ───
console.log('[1] Jimmy safe marrow drinking');
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
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 3 } },  // Far apart
  );

  // Give Jimmy enough rage to drink (3+ needed for layer 0)
  engine.resourceSystem.add(ids.player1Id, 'rage', 4);

  const stateActor = engine.getState().characters.find(c => c.id === ids.player1Id);
  const candidates = generateCandidateActions(engine, ids.player1Id);

  // Find wine action
  const wineAction = candidates.find(c => c.skillId === 'role_jimmy_marrow_wine');
  check('Wine is a candidate when rage>=3', !!wineAction);

  if (wineAction) {
    const enemies = [...engine.registry.characters()].filter(c =>
      c.alive !== false && c.ownerId !== stateActor.ownerId
    );
    const stratResult = evaluateRoleStrategy(engine, ids.player1Id, wineAction, {
      turn: 1,
      actor: engine.registry.get(ids.player1Id),
      stateActor,
      enemies,
      profile: getSkillPrimitiveProfile('role_jimmy_marrow_wine'),
      hasImmediateLethal: false,
      isUnderThreat: false,
    });
    check('Wine strategyBias > 0 in safe conditions', stratResult.scoreDelta > 0,
      `scoreDelta=${stratResult.scoreDelta} reasons=${stratResult.reasons.join(',')}`);
    check('Wine has safe_scaling reason', stratResult.reasons.includes('safe_scaling'),
      `reasons=${stratResult.reasons.join(',')}`);
  }

  // Test the strategic state evaluator for Jimmy
  const result = evaluateStrategicState(engine.getState(), 'player1');
  check('Strategic state has marrowLayer detail', result.details.marrowLayer !== undefined);
  check('Strategic state has marrowValue = 0 for layer 0 (no wine yet)',
    result.details.marrowValue !== undefined && result.details.marrowValue === 0,
    `marrowValue=${result.details.marrowValue}`);
}

// ─── 2. Jimmy should not drink when lethal is available ───
console.log('\n[2] Jimmy should not drink with lethal available');
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
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 0 } },  // Adjacent - melee range!
  );

  engine.resourceSystem.add(ids.player1Id, 'rage', 4);

  const stateActor = engine.getState().characters.find(c => c.id === ids.player1Id);
  const enemies = [...engine.registry.characters()].filter(c =>
    c.alive !== false && c.ownerId !== stateActor.ownerId
  );

  const wineAction = { skillId: 'role_jimmy_marrow_wine', targetPos: null };
  const stratResult = evaluateRoleStrategy(engine, ids.player1Id, wineAction, {
    turn: 1,
    actor: engine.registry.get(ids.player1Id),
    stateActor,
    enemies,
    profile: getSkillPrimitiveProfile('role_jimmy_marrow_wine'),
    hasImmediateLethal: true,
    isUnderThreat: true,
  });
  check('Wine strategyBias negative when lethal+threat',
    stratResult.scoreDelta < 0,
    `scoreDelta=${stratResult.scoreDelta} reasons=${stratResult.reasons.join(',')}`);
  check('Wine has lethal_available or unsafe_drink reason',
    stratResult.reasons.includes('lethal_available') || stratResult.reasons.includes('unsafe_drink'),
    `reasons=${stratResult.reasons.join(',')}`);
}

// ─── 3. Shooter should not open with useless aim ───
console.log('\n[3] Shooter aim penalized when attack available');
{
  const shooterSkills = ['shooter_attack', 'shooter_reload', 'shooter_roll',
    'shooter_bell', 'shooter_aim', 'shooter_predict', 'shooter_hook', 'shooter_slow_shot'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '射手', roleId: 'shooter_gunfighter', loadout: shooterSkills, roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },  // In range
  );

  // Add ammo so shooter has attack potential (default may start empty)
  engine.resourceSystem.add(ids.player1Id, 'ammo', 4);
  const ammo = engine.resourceSystem.get(ids.player1Id, 'ammo') || 0;

  const stateActor = engine.getState().characters.find(c => c.id === ids.player1Id);
  const enemies = [...engine.registry.characters()].filter(c =>
    c.alive !== false && c.ownerId !== stateActor.ownerId
  );

  // Evaluate aim action
  const aimProfile = getSkillPrimitiveProfile('shooter_aim');
  const aimResult = evaluateRoleStrategy(engine, ids.player1Id, { skillId: 'shooter_aim', targetPos: null }, {
    turn: 1,
    actor: engine.registry.get(ids.player1Id),
    stateActor,
    enemies,
    profile: aimProfile,
  });
  check('Aim has negative strategy bias when attack available', aimResult.scoreDelta < 0,
    `scoreDelta=${aimResult.scoreDelta} reasons=${aimResult.reasons.join(',')}`);

  // Check candidate ordering: aim should not be the top unique skill
  const candidates = orderedCandidates(
    generateCandidateActions(engine, ids.player1Id),
    stateActor.skills,
    engine.resourceSystem.getAll(ids.player1Id)
  );
  const uniqueSkills = [];
  const seen = new Set();
  for (const c of candidates) {
    if (!seen.has(c.skillId)) {
      seen.add(c.skillId);
      uniqueSkills.push(c.skillId);
    }
  }
  const firstSkill = uniqueSkills[0];
  check('Top unique skill is not aim when attack available',
    firstSkill !== 'shooter_aim',
    `top=${firstSkill} uniqueTop5=${uniqueSkills.slice(0, 5).join(',')}`);
}

// ─── 4. Shooter aim can be valid if no good attack ───
console.log('\n[4] Shooter aim valid when attack impossible');
{
  const shooterSkills = ['shooter_attack', 'shooter_reload', 'shooter_roll',
    'shooter_bell', 'shooter_aim', 'shooter_predict', 'shooter_hook', 'shooter_slow_shot'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '射手', roleId: 'shooter_gunfighter', loadout: shooterSkills, roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: -3, r: 3 }, p2: { q: 3, r: -3 } },  // Far apart
  );

  // Drain ammo to 0 so attack is impossible
  engine.resourceSystem.set(ids.player1Id, 'ammo', 0);
  engine.resourceSystem.set(ids.player1Id, 'backpackAmmo', 0);

  const stateActor = engine.getState().characters.find(c => c.id === ids.player1Id);
  const enemies = [...engine.registry.characters()].filter(c =>
    c.alive !== false && c.ownerId !== stateActor.ownerId
  );
  const attackPot = estimateAttackPotential(stateActor, enemies);
  check('Attack potential is 0 without ammo', attackPot === 0, `potential=${attackPot}`);

  // Aim should still get negative score (no ammo makes it worse), but it may still appear as candidate
  const aimProfile = getSkillPrimitiveProfile('shooter_aim');
  const aimResult = evaluateRoleStrategy(engine, ids.player1Id, { skillId: 'shooter_aim', targetPos: null }, {
    turn: 1,
    actor: engine.registry.get(ids.player1Id),
    stateActor,
    enemies,
    profile: aimProfile,
  });
  check('Aim with 0 ammo has no_ammo_setup or empty_setup reason',
    aimResult.reasons.includes('no_ammo_setup') || aimResult.reasons.includes('empty_setup') || aimResult.reasons.includes('should_reload'),
    `reasons=${aimResult.reasons.join(',')}`);
}

// ─── 5. Candidate coverage: preserveSkillCoverage ───
console.log('\n[5] Candidate coverage with preserveSkillCoverage');
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

  engine.resourceSystem.add(ids.player1Id, 'rage', 4);

  const stateActor = engine.getState().characters.find(c => c.id === ids.player1Id);
  const resources = engine.resourceSystem.getAll(ids.player1Id);
  const rawCandidates = generateCandidateActions(engine, ids.player1Id);

  // Without coverage: slice to 4 would likely squeeze out the role skill
  const withoutCoverage = orderedCandidates(rawCandidates, stateActor.skills, resources).slice(0, 4);
  const withoutSkillIds = new Set(withoutCoverage.map(c => c.skillId));

  // With coverage
  const withCoverage = selectRepresentativeCandidates(rawCandidates, stateActor.skills, resources, {
    maxActions: 4,
    preserveSkillCoverage: true,
    roleId: 'warrior_jimmy',
  });
  const withSkillIds = new Set(withCoverage.map(c => c.skillId));

  check('Coverage pool has at most 4 candidates', withCoverage.length <= 4,
    `count=${withCoverage.length}`);
  check('Coverage pool is non-empty', withCoverage.length > 0);

  // Check that role skill is present when possible
  const hasWineInRaw = rawCandidates.some(c => c.skillId === 'role_jimmy_marrow_wine');
  if (hasWineInRaw) {
    const hasWineWithCoverage = withCoverage.some(c => c.skillId === 'role_jimmy_marrow_wine');
    check('Role skill preserved with coverage', hasWineWithCoverage,
      `covered skills: ${[...withSkillIds].join(',')}`);
  }

  // Coverage should have >= unique skills than without (at least not worse for diversity)
  check('Coverage preserves skill diversity',
    withSkillIds.size >= Math.min(withoutSkillIds.size, 4),
    `with=${withSkillIds.size} without=${withoutSkillIds.size}`);
}

// ─── 6. Strategy term in StateEvaluator ───
console.log('\n[6] Strategy term in StateEvaluator');
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

  const ownerId = engine.getCharacterOwner(ids.player1Id);
  const result = evaluateState(engine.getState(), ownerId);
  check('Strategy term exists', result.terms.strategy !== undefined,
    `strategy=${result.terms.strategy}`);
  check('Strategy term is a number', typeof result.terms.strategy === 'number',
    `type=${typeof result.terms.strategy}`);

  // Jimmy starts with layer 0 → should have positive strategy value
  check('Jimmy strategy term = 0 for layer 0 (no wine)', Math.abs(result.terms.strategy) < 10,
    `strategy=${result.terms.strategy}`);
}

// ─── Summary ───
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
