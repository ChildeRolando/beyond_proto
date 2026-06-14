// skill_desc_format_test.js
// Verify all skill descriptions follow the normalized display-card format.
// Passive skills (isTrait: true) use a 2-line format (name + body, no metadata).
// Active skills use the 4-line format (name, separator, speed/CD/cost, body).
// Run: node tests/skill_desc_format_test.js

import { SKILLS } from '../engine/SkillData.js';

let totalPassed = 0;
let totalFailed = 0;
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) { passed++; }
  else { failed++; console.error(`  FAIL: ${msg}`); }
}

function test(name, fn) {
  console.log(`\n[${name}]`);
  passed = 0; failed = 0;
  fn();
  const total = passed + failed;
  console.log(`  ${passed}/${total} passed`);
  totalPassed += passed;
  totalFailed += failed;
  return { passed, failed };
}

const allSkillIds = Object.keys(SKILLS);
const passiveIds = allSkillIds.filter(id => SKILLS[id].isTrait);
// Active skills that go through normalizeSkillDesc (desc contains \n)
const normalizedActiveIds = allSkillIds.filter(id =>
  !SKILLS[id].isTrait && typeof SKILLS[id].desc === 'string' && SKILLS[id].desc.includes('\n')
);
console.log(`Testing ${allSkillIds.length} skills (${passiveIds.length} passive, ${normalizedActiveIds.length} normalized active)...\n`);

// -- Test 1: All skills have a desc ----------------------------------
test('All skills have desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(typeof skill.desc === 'string' && skill.desc.length > 0,
      `${id}: missing or empty desc`);
  }
});

// -- Test 2: desc has correct number of lines -------------------------------
test('Active: 4 lines, Passive: 2 lines', () => {
  for (const id of normalizedActiveIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines.length === 4,
      `${id}: active skill expected 4 lines, got ${lines.length}: "${skill.desc}"`);
  }
  for (const id of passiveIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines.length === 2,
      `${id}: passive skill expected 2 lines, got ${lines.length}: "${skill.desc}"`);
  }
});

// -- Test 3: line 1 is the skill name (normalized skills only) ----------
test('line 1 is skill name', () => {
  const idsToCheck = new Set([...normalizedActiveIds, ...passiveIds]);
  for (const id of idsToCheck) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines[0] === skill.name,
      `${id}: line 1 should be skill name "${skill.name}", got "${lines[0]}"`);
  }
});

// -- Test 4: active skills have separator, passive do not ---------------
test('Active have separator, passive do not', () => {
  for (const id of normalizedActiveIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines[1] === '——————————————',
      `${id}: active skill line 2 should be separator, got "${lines[1]}"`);
  }
  for (const id of passiveIds) {
    const skill = SKILLS[id];
    assert(!skill.desc.includes('——————————————'),
      `${id}: passive skill should not have separator`);
  }
});

// -- Test 5: active skills have speed/CD/cost line, passive do not -------
test('Active have speed/CD/cost metadata, passive do not', () => {
  for (const id of normalizedActiveIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(/^速度\s+\S+\s+CD\s+\S+\s+cost\s+\S+/.test(lines[2]),
      `${id}: active skill line 3 should contain speed/CD/cost: "${lines[2]}"`);
  }
  for (const id of passiveIds) {
    const skill = SKILLS[id];
    assert(!/速度\s*\S+\s+CD\s*\S+\s+cost\s*\S+/.test(skill.desc),
      `${id}: passive skill should not have speed/CD/cost line`);
  }
});

// -- Test 5b: metadata uses 0 instead of 无 (active only) ---------------
test('Active metadata uses 0 instead of 无', () => {
  for (const id of normalizedActiveIds) {
    const skill = SKILLS[id];
    const metadata = skill.desc.split('\n')[2] || '';
    assert(!/CD\s+无/.test(metadata),
      `${id}: CD metadata should use 0 instead of 无: "${metadata}"`);
    assert(!/cost\s+无/i.test(metadata),
      `${id}: cost metadata should use 0 instead of 无: "${metadata}"`);
  }
});

// -- Test 6: passive descriptions contain no structured stat labels ----
test('Passive body has no structured stat labels', () => {
  for (const id of passiveIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    const body = lines[lines.length - 1] || '';
    assert(!/(范围：自身|威力：无|速度：\d+|费用：无|费用：\d+)/.test(body),
      `${id}: passive body still contains active-skill labels: "${body}"`);
    assert(!body.includes('施法范围'), `${id}: passive body contains "施法范围"`);
    assert(!body.includes('技能概念'), `${id}: passive body contains "技能概念"`);
    assert(!body.includes('游戏作用'), `${id}: passive body contains "游戏作用"`);
  }
});

// -- Test 6b: passive skills have no active-skill field text -------------
test('Passive skills: no active-skill field text', () => {
  for (const id of passiveIds) {
    const skill = SKILLS[id];
    assert(!skill.desc.includes('范围：自身'), `${id}: contains "范围：自身"`);
    assert(!skill.desc.includes('威力：无'), `${id}: contains "威力：无"`);
    assert(!skill.desc.includes('速度：'), `${id}: contains "速度："`);
    assert(!skill.desc.includes('费用：无'), `${id}: contains "费用：无"`);
    assert(!skill.desc.includes('施法范围'), `${id}: contains "施法范围"`);
  }
});

// -- Test 7: no "不造成直接威力" disclaimer ------------------------------
test('No "不造成直接威力" disclaimer', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(!skill.desc.includes('不造成直接威力'),
      `${id}: desc still contains "不造成直接威力": "${skill.desc}"`);
  }
});

// -- Test 8: cost appears in metadata line (normalized active only) -----
test('cost appears in metadata line', () => {
  for (const id of normalizedActiveIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    const metaLine = lines[2] || '';
    assert(/\bcost\b/i.test(metaLine),
      `${id}: cost should appear in metadata line: "${metaLine}"`);
  }
});

// -- Test 9: No old-format separator " | cost" or " | " patterns -----
test('No old-format separators like " | cost"', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasOldFormat = /\|\s*cost/i.test(skill.desc);
    assert(!hasOldFormat,
      `${id}: desc contains old format "| cost": "${skill.desc}"`);
  }
});

// -- Test 10: No empty lines ------------------------------------------
test('No empty lines', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    for (let i = 0; i < lines.length; i++) {
      assert(lines[i].trim().length > 0,
        `${id}: empty line at index ${i}`);
    }
  }
});

// -- Test 11: No placeholder / TODO / 待补充 / 未知 ------------------
test('No placeholders (待补充/TODO/未知)', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasTodo = /待补充|TODO|未知/i.test(skill.desc);
    assert(!hasTodo,
      `${id}: desc contains placeholder: "${skill.desc}"`);
  }
});

// -- Test 12: Infinite-range skills say 施法范围为无限 (active only) ----
test('Infinite-range active skills say 施法范围为无限', () => {
  for (const id of normalizedActiveIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    const body = lines[lines.length - 1] || '';
    if (skill.targeting?.range === 99) {
      assert(body.includes('施法范围为无限'),
        `${id}: infinite-range skill body should say "施法范围为无限": "${body}"`);
    }
  }
});

// -- Test 13: No English field names outside metadata -------------------
test('No English field names outside metadata', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    const body = lines[lines.length - 1] || '';
    assert(!body.includes('cost:'), `${id}: description uses "cost:"`);
    assert(!body.includes('power:'), `${id}: description uses "power:"`);
    assert(!body.includes('speed:'), `${id}: description uses "speed:"`);
    assert(!body.includes('range:'), `${id}: description uses "range:"`);
  }
});

// -- Test 14: No old 威力｜速度｜费用 prefix in desc ----------
test('No old 威力｜速度｜费用 prefix in desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasOldPrefix = skill.desc.includes('威力｜速度｜费用');
    assert(!hasOldPrefix,
      `${id}: desc uses old "威力｜速度｜费用" prefix: "${skill.desc}"`);
  }
});

// -- Summary --------------------------------------------------------
console.log('\n═══════════════════════════════════════════');
console.log(`Total skills: ${allSkillIds.length} (${normalizedActiveIds.length} active, ${passiveIds.length} passive)`);
console.log(`PASSED: ${totalPassed}`);
console.log(`FAILED: ${totalFailed}`);
if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('All skill descriptions pass format check.');
  process.exit(0);
}
