// skill_desc_format_test.js
// Verify all skill descriptions follow the normalized display-card format.
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
console.log(`Testing ${allSkillIds.length} skills...\n`);

// -- Test 1: All skills have a desc ----------------------------------
test('All skills have desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(typeof skill.desc === 'string' && skill.desc.length > 0,
      `${id}: missing or empty desc`);
  }
});

// -- Test 2: desc contains exactly 4 lines -------------------------------
test('desc has exactly 4 lines', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines.length === 4,
      `${id}: expected 4 lines, got ${lines.length}: "${skill.desc}"`);
  }
});

// -- Test 3: line 1 is the skill name ------------------------------------
test('line 1 is skill name', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines[0] === skill.name,
      `${id}: line 1 should be skill name "${skill.name}", got "${lines[0]}"`);
  }
});

// -- Test 4: line 2 is the separator -------------------------------------
test('line 2 is separator', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines[1] === '——————————————',
      `${id}: line 2 should be separator, got "${lines[1]}"`);
  }
});

// -- Test 5: line 3 contains speed/CD/cost headers -----------------------
test('line 3 contains 速度, CD, cost headers', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(/^速度\s+\S+\s+CD\s+\S+\s+cost\s+\S+/.test(lines[2]),
      `${id}: line 3 should contain speed/CD/cost metadata: "${lines[2]}"`);
  }
});

// -- Test 5b: metadata uses 0 instead of 无 ----------------------------
test('metadata uses 0 instead of 无', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const metadata = skill.desc.split('\n')[2] || '';
    assert(!/CD\s+无/.test(metadata),
      `${id}: CD metadata should use 0 instead of 无: "${metadata}"`);
    assert(!/cost\s+无/i.test(metadata),
      `${id}: cost metadata should use 0 instead of 无: "${metadata}"`);
  }
});

// -- Test 6: natural description contains no structured stat labels ------
test('description has no structured stat labels', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    const body = lines[3] || '';
    assert(!/(技能概念|游戏作用|范围|威力|速度|费用)：/.test(body),
      `${id}: description still contains structured labels: "${body}"`);
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

// -- Test 8: cost only appears in metadata line ------------------------
test('cost only appears in metadata line', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines.filter(line => /\bcost\b/i.test(line)).length === 1,
      `${id}: cost should appear exactly once in metadata line: "${skill.desc}"`);
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

// -- Test 12: Infinite-range skills say 施法范围为无限 --------------------
test('Infinite-range skills say 施法范围为无限', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const body = skill.desc.split('\n')[3] || '';
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
    const body = skill.desc.split('\n')[3] || '';
    assert(!body.includes('cost:'), `${id}: description uses "cost:"`);
    assert(!body.includes('power:'), `${id}: description uses "power:"`);
    assert(!body.includes('speed:'), `${id}: description uses "speed:"`);
    assert(!body.includes('range:'), `${id}: description uses "range:"`);
  }
});

// -- Test 14: No 威力｜速度｜费用 old-format prefix in desc ----------
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
console.log(`Total skills: ${allSkillIds.length}`);
console.log(`PASSED: ${totalPassed}`);
console.log(`FAILED: ${totalFailed}`);
if (totalFailed > 0) {
  process.exit(1);
} else {
  console.log('All skill descriptions pass format check.');
  process.exit(0);
}
