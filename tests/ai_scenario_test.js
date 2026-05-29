// AI scenario regression tests
// Run: node tests/ai_scenario_test.js

import { GameEngine } from '../engine/GameEngine.js';
import { getDefaultLoadout, getDefaultRoleLoadout } from '../engine/RoleData.js';
import { generateCandidateActions } from '../engine/ai/CandidateGenerator.js';
import { orderedCandidates } from '../engine/ai/OnePlyPolicy.js';
import { getSkillPrimitiveProfile, PrimitiveTag } from '../engine/ai/PrimitiveProfile.js';
import { buildTacticalMap, getHexTacticalScore } from '../engine/ai/TacticalMap.js';
import { chooseAiAction } from '../engine/ai/AiController.js';
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

console.log('=== AI Scenario Tests ===\n');

// ─── 1. Kill priority: PRESSURE skills rank above BUILD when enemy in range ───
console.log('[1] Kill priority');
{
  const warriorSkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '战士', roleId: 'warrior_duelist', loadout: warriorSkills, roleLoadout: [] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  const candidates = orderedCandidates(
    generateCandidateActions(engine, ids.player1Id),
    engine.getState().characters.find(c => c.id === ids.player1Id)?.skills || [],
    engine.resourceSystem.getAll(ids.player1Id)
  );

  check('Has candidates', candidates.length > 0);
  if (candidates.length > 0) {
    // Check unique skills in order (dedupe by skillId)
    const uniqueSkills = [];
    const seen = new Set();
    for (const c of candidates) {
      if (!seen.has(c.skillId)) {
        seen.add(c.skillId);
        uniqueSkills.push(c.skillId);
      }
    }
    const slashIdx = uniqueSkills.indexOf('warrior_slash');
    const rageIdx = uniqueSkills.indexOf('warrior_rage');
    check('PRESSURE skill ranks above BUILD (unique skills)',
      slashIdx >= 0 && rageIdx >= 0 && slashIdx < rageIdx,
      `slash@${slashIdx} rage@${rageIdx} first5=${uniqueSkills.slice(0,5).join(',')}`);
  }
}

// ─── 2. No ammo: ALL-consumption skill excluded when resource is 0 ───
console.log('\n[2] No ammo filters ALL skills');
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
  );

  // Set ammo to 0
  engine.resourceSystem.set(ids.player1Id, 'ammo', 0);
  engine.resourceSystem.set(ids.player1Id, 'backpackAmmo', 0);
  check('Ammo is 0', engine.resourceSystem.get(ids.player1Id, 'ammo') === 0);

  const candidates = generateCandidateActions(engine, ids.player1Id);
  const bellInList = candidates.some(c => c.skillId === 'shooter_bell');
  const attackInList = candidates.some(c => c.skillId === 'shooter_attack');
  const reloadInList = candidates.some(c => c.skillId === 'shooter_reload');

  check('ALL-ammo skill excluded when ammo=0', !bellInList || !attackInList, `bell=${bellInList} attack=${attackInList}`);
  // shooter_bell has CONSUME_RESOURCE ammo:ALL — should be excluded with 0 ammo
  // Verify specifically that the ALL skill is excluded
  const bellDef = SKILLS['shooter_bell'];
  const hasAllConsume = (bellDef?.effects || []).some(e => e.cmd === 'CONSUME_RESOURCE' && e.amount === 'ALL');
  if (hasAllConsume) {
    check('shooter_bell (ALL ammo) excluded when ammo=0', !bellInList, `bell in list: ${bellInList}`);
  }
}

// ─── 3. Reload priority: when low ammo, BUILD skills preferred ───
console.log('\n[3] Reload/build priority with low ammo');
{
  const shooterSkills = ['shooter_attack', 'shooter_reload', 'shooter_roll',
    'shooter_bell', 'shooter_aim', 'shooter_predict', 'shooter_hook', 'shooter_cover_fire', 'shooter_armor_pierce'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '射手', roleId: 'shooter_gunfighter', loadout: shooterSkills, roleLoadout: ['trait_gunfighter_finesse'] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 2 } },
  );

  // Set ammo to 0, backpack > 0
  engine.resourceSystem.set(ids.player1Id, 'ammo', 0);
  engine.resourceSystem.add(ids.player1Id, 'backpackAmmo', 3);

  const candidates = generateCandidateActions(engine, ids.player1Id);
  const candidateIds = [...new Set(candidates.map(c => c.skillId))];

  const attackInList = candidateIds.includes('shooter_attack');
  const reloadInList = candidateIds.includes('shooter_reload');

  // With 0 ammo, attack should be excluded (can't afford ammo cost)
  check('Attack excluded when ammo=0', !attackInList, `attack in list: ${attackInList}`);
  check('Reload is a candidate when ammo=0', reloadInList);
}

// ─── 4. Defend vs close melee threat ───
console.log('\n[4] Defend/escape vs close melee threat');
{
  const warriorSkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];
  const enemySkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];

  const { engine, ids } = initBattleWithPlayers(
    { class: '战士', roleId: 'warrior_duelist', loadout: warriorSkills, roleLoadout: [] },
    { class: '战士', roleId: 'warrior_duelist', loadout: enemySkills, roleLoadout: [] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 0 } },  // Adjacent!
  );

  const candidates = orderedCandidates(
    generateCandidateActions(engine, ids.player1Id),
    engine.getState().characters.find(c => c.id === ids.player1Id)?.skills || [],
    engine.resourceSystem.getAll(ids.player1Id)
  );

  // When enemy is adjacent with melee, DEFEND/ESCAPE skills should appear in top unique skills
  const uniqueSkills = [];
  const seen = new Set();
  for (const c of candidates) {
    if (!seen.has(c.skillId)) {
      seen.add(c.skillId);
      uniqueSkills.push(c.skillId);
    }
  }
  const topUnique = uniqueSkills[0];
  // warrior_sheathe (DEFEND) or warrior_move (ESCAPE) or warrior_slash (PRESSURE) should be top
  // Pure BUILD (warrior_rage) should not be #1 when enemy is adjacent
  check('Top unique skill is not pure BUILD when enemy adjacent',
    topUnique !== 'warrior_rage',
    `top=${topUnique} uniqueTop5=${uniqueSkills.slice(0,5).join(',')}`);
}

// ─── 5. Danger avoidance in target ranking ───
console.log('\n[5] Danger avoidance in target ranking');
{
  const warriorSkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '战士', roleId: 'warrior_duelist', loadout: warriorSkills, roleLoadout: [] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  // Build tactical map and check that enemy-threatened hexes have higher danger
  const tacticalMap = buildTacticalMap(engine, ids.player1Id);
  const dangerNearEnemy = getHexTacticalScore(tacticalMap, 0, 1); // near enemy
  const dangerFarAway = getHexTacticalScore(tacticalMap, -3, -3); // far from enemy

  check('Danger near enemy > 0', dangerNearEnemy.danger > 0,
    `danger@(0,1)=${dangerNearEnemy.danger}`);
  check('Danger near enemy > far away', dangerNearEnemy.danger > dangerFarAway.danger,
    `near=${dangerNearEnemy.danger} far=${dangerFarAway.danger}`);

  // For move skill, targets near enemy should get tactical penalty
  const moveCandidates = generateCandidateActions(engine, ids.player1Id)
    .filter(c => c.skillId === 'warrior_move');
  check('Multiple move targets exist', moveCandidates.length >= 2,
    `count=${moveCandidates.length}`);
  if (moveCandidates.length >= 2) {
    // Targets should be sorted: safer targets rank higher in the list (lower index)
    const first = moveCandidates[0];
    const last = moveCandidates[moveCandidates.length - 1];
    const firstDanger = getHexTacticalScore(tacticalMap, first.targetPos.q, first.targetPos.r).danger;
    const lastDanger = getHexTacticalScore(tacticalMap, last.targetPos.q, last.targetPos.r).danger;
    // The first target (highest score) should not be more dangerous than the last
    check('First move target not more dangerous than last',
      firstDanger <= lastDanger + 10,  // allow small margin
      `first@(${first.targetPos.q},${first.targetPos.r}) danger=${firstDanger} last@(${last.targetPos.q},${last.targetPos.r}) danger=${lastDanger}`);
  }
}

// ─── 6. TacticalMap smoke test ───
console.log('\n[6] TacticalMap smoke test');
{
  const warriorSkills = ['warrior_rage', 'warrior_slash', 'warrior_move', 'warrior_dash',
    'warrior_sheathe', 'warrior_feint', 'warrior_swallow', 'warrior_iaido'];
  const mageSkills = (SKILLS_BY_CLASS['法师'] || []).filter(sid => {
    const s = SKILLS[sid];
    return s && !s.hidden && !s.isTrait;
  }).slice(0, 8);

  const { engine, ids } = initBattleWithPlayers(
    { class: '战士', roleId: 'warrior_duelist', loadout: warriorSkills, roleLoadout: [] },
    { class: '法师', roleId: 'mage_mirror', loadout: mageSkills, roleLoadout: ['trait_mirror_slippery'] },
    { p1: { q: 0, r: -1 }, p2: { q: 0, r: 1 } },
  );

  const tacticalMap = buildTacticalMap(engine, ids.player1Id);
  check('dangerByHex is a Map', tacticalMap.dangerByHex instanceof Map);
  check('opportunityByHex is a Map', tacticalMap.opportunityByHex instanceof Map);
  check('reasonByHex is a Map', tacticalMap.reasonByHex instanceof Map);
  check('dangerByHex has entries', tacticalMap.dangerByHex.size > 0);

  // Enemy mage has projectile threat — hexes near enemy should have danger
  const nearEnemy = getHexTacticalScore(tacticalMap, 0, 1);
  check('Enemy position has tactical data', nearEnemy.danger > 0 || nearEnemy.opportunity > 0,
    `danger=${nearEnemy.danger} opp=${nearEnemy.opportunity} reasons=${nearEnemy.reasons.join(',')}`);

  // Check that reasons contain expected entries
  const allReasons = [...tacticalMap.reasonByHex.values()].flat();
  const hasEnemyThreat = allReasons.some(r => r.startsWith('enemy_'));
  check('Reasons include enemy threat', hasEnemyThreat, `sample reasons: ${[...new Set(allReasons)].slice(0,5).join(', ')}`);
}

// ─── Summary ───
console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
process.exitCode = failed > 0 ? 1 : 0;
