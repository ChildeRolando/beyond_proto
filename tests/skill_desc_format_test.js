// skill_desc_format_test.js
// Verify all skill descriptions follow the normalized single-paragraph format.
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

// -- Test 2: desc contains exactly 1 line --------------------------------
test('desc has exactly 1 line', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines.length === 1,
      `${id}: expected 1 line, got ${lines.length}: "${skill.desc}"`);
  }
});

// -- Test 3: desc starts with "技能概念：" -------------------------------
test('desc starts with 技能概念：', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(skill.desc.startsWith('技能概念：'),
      `${id}: desc does not start with "技能概念：": "${skill.desc}"`);
  }
});

// -- Test 4: desc contains "游戏作用：" ---------------------------------
test('desc contains 游戏作用：', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(skill.desc.includes('游戏作用：'),
      `${id}: desc missing "游戏作用：": "${skill.desc}"`);
  }
});

// -- Test 5: desc contains "范围：" ------------------------------------
test('desc contains 范围：', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(skill.desc.includes('范围：'),
      `${id}: desc missing "范围：": "${skill.desc}"`);
  }
});

// -- Test 6: desc contains all four sub-fields in order -----------------
test('desc contains 范围：, 威力：, 速度：, 费用： in order', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const line = skill.desc;
    assert(line.includes('范围：'),
      `${id}: desc missing "范围：": "${line}"`);
    assert(line.includes('威力：'),
      `${id}: desc missing "威力：": "${line}"`);
    assert(line.includes('速度：'),
      `${id}: desc missing "速度：": "${line}"`);
    assert(line.includes('费用：'),
      `${id}: desc missing "费用：": "${line}"`);
    // Verify order: 范围 before 威力 before 速度 before 费用
    const idxRange = line.indexOf('范围：');
    const idxPower = line.indexOf('威力：');
    const idxSpeed = line.indexOf('速度：');
    const idxCost  = line.indexOf('费用：');
    assert(idxRange < idxPower && idxPower < idxSpeed && idxSpeed < idxCost,
      `${id}: field order wrong (expected 范围→威力→速度→费用): "${line}"`);
  }
});

// -- Test 7: No English word "cost" in desc --------------------------
test('No "cost" in desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasCost = /\bcost\b/i.test(skill.desc);
    assert(!hasCost,
      `${id}: desc contains "cost": "${skill.desc}"`);
  }
});

// -- Test 8: No old-format separator " | cost" or " | " patterns -----
test('No old-format separators like " | cost"', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasOldFormat = /\|\s*cost/i.test(skill.desc);
    assert(!hasOldFormat,
      `${id}: desc contains old format "| cost": "${skill.desc}"`);
  }
});

// -- Test 9: No empty lines ------------------------------------------
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

// -- Test 10: No placeholder / TODO / 待补充 / 未知 ------------------
test('No placeholders (待补充/TODO/未知)', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasTodo = /待补充|TODO|未知/i.test(skill.desc);
    assert(!hasTodo,
      `${id}: desc contains placeholder: "${skill.desc}"`);
  }
});

// -- Test 11: No English field names in desc ---------------------------
test('No English field names in desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const line = skill.desc;
    assert(!line.includes('cost:'), `${id}: desc uses "cost:"`);
    assert(!line.includes('power:'), `${id}: desc uses "power:"`);
    assert(!line.includes('speed:'), `${id}: desc uses "speed:"`);
    assert(!line.includes('range:'), `${id}: desc uses "range:"`);
  }
});

// -- Test 12: No 威力｜速度｜费用 old-format prefix in desc ----------
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
