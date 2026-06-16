// skill_desc_format_test.js
// Verify all skill descriptions are effect-only single-line entries.
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

const META_LINE_PATTERN = /^(?:技能概念|游戏作用|范围|施法范围|作用范围|威力|速度|费用|cost|CD|冷却|剩余发动次数)\s*[：:]/i;

// -- Test 1: All skills have desc ----------------------------------
test('All skills have non-empty desc', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    assert(typeof skill.desc === 'string' && skill.desc.trim().length > 0,
      `${id}: missing or empty desc`);
  }
});

// -- Test 2: desc is one effect-only line ---------------------------
test('All desc values are a single effect line', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n').map(line => line.trim()).filter(Boolean);
    assert(lines.length === 1,
      `${id}: expected 1 line, got ${lines.length}: "${skill.desc}"`);
  }
});

// -- Test 3: no legacy labels or meta lines ------------------------
test('No legacy labels or structured meta lines', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const lines = skill.desc.split('\n').map(line => line.trim()).filter(Boolean);
    for (const line of lines) {
      assert(!META_LINE_PATTERN.test(line),
        `${id}: legacy/meta line present: "${line}"`);
      assert(line !== '——————————————',
        `${id}: separator line should not appear`);
    }
  }
});

// -- Test 4: no empty lines ----------------------------------------
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

// -- Test 5: no placeholders ---------------------------------------
test('No placeholders (待补充/TODO/未知)', () => {
  for (const id of allSkillIds) {
    const skill = SKILLS[id];
    const hasTodo = /待补充|TODO|未知/i.test(skill.desc);
    assert(!hasTodo,
      `${id}: desc contains placeholder: "${skill.desc}"`);
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
