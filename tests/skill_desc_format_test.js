// skill_desc_format_test.js
// Verify all skill descriptions follow the normalized 3-line format.
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

// ── Test 1: All skills have a desc ──────────────────────────────────
test('All skills have desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(typeof skill.desc === 'string' && skill.desc.length > 0,
      `${id}: missing or empty desc`);
  }
});

// ── Test 2: desc contains exactly 3 lines (separated by \n) ─────────
test('desc has exactly 3 lines', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    assert(lines.length === 3,
      `${id}: expected 3 lines, got ${lines.length}: "${skill.desc}"`);
  }
});

// ── Test 3: Line 1 starts with "技能概念：" ─────────────────────────
test('Line 1 starts with 技能概念：', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    if (lines.length >= 1) {
      assert(lines[0].startsWith('技能概念：'),
        `${id}: line 1 does not start with "技能概念：": "${lines[0]}"`);
    }
  }
});

// ── Test 4: Line 2 starts with "游戏作用：" ─────────────────────────
test('Line 2 starts with 游戏作用：', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    if (lines.length >= 2) {
      assert(lines[1].startsWith('游戏作用：'),
        `${id}: line 2 does not start with "游戏作用：": "${lines[1]}"`);
    }
  }
});

// ── Test 5: Line 3 starts with "威力｜速度｜费用：" ─────────────────
test('Line 3 starts with 威力｜速度｜费用：', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    if (lines.length >= 3) {
      assert(lines[2].startsWith('威力｜速度｜费用：'),
        `${id}: line 3 does not start with "威力｜速度｜费用：": "${lines[2]}"`);
    }
  }
});

// ── Test 6: Line 3 contains all three sub-fields ────────────────────
test('Line 3 contains 威力：, 速度：, 费用：', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    if (lines.length >= 3) {
      const line3 = lines[2];
      assert(line3.includes('威力：'),
        `${id}: line 3 missing "威力：": "${line3}"`);
      assert(line3.includes('速度：'),
        `${id}: line 3 missing "速度：": "${line3}"`);
      assert(line3.includes('费用：'),
        `${id}: line 3 missing "费用：": "${line3}"`);
    }
  }
});

// ── Test 7: No English word "cost" in desc ──────────────────────────
test('No "cost" in desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasCost = /\bcost\b/i.test(skill.desc);
    assert(!hasCost,
      `${id}: desc contains "cost": "${skill.desc}"`);
  }
});

// ── Test 8: No old-format separator " | cost" or " | " patterns ─────
test('No old-format separators like " | cost"', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    // Old format used " | cost" or " | 速" as separators
    const hasOldFormat = /\|\s*cost/i.test(skill.desc);
    assert(!hasOldFormat,
      `${id}: desc contains old format "| cost": "${skill.desc}"`);
  }
});

// ── Test 9: No empty lines ──────────────────────────────────────────
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

// ── Test 10: No placeholder / TODO / 待补充 / 未知 ──────────────────
test('No placeholders (待补充/TODO/未知)', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasTodo = /待补充|TODO|未知/i.test(skill.desc);
    assert(!hasTodo,
      `${id}: desc contains placeholder: "${skill.desc}"`);
  }
});

// ── Test 11: No English field names in line 3 ───────────────────────
test('No English field names in line 3', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n');
    if (lines.length >= 3) {
      const line3 = lines[2];
      assert(!line3.includes('cost:'), `${id}: line 3 uses "cost:"`);
      assert(!line3.includes('power:'), `${id}: line 3 uses "power:"`);
      assert(!line3.includes('speed:'), `${id}: line 3 uses "speed:"`);
    }
  }
});

// ── Summary ────────────────────────────────────────────────────────
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
