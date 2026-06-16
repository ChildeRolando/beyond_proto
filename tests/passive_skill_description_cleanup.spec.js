// Passive skill description cleanup verification
// Assert: all skills are effect-only single-line descs with no structured meta.
// Run: node tests/passive_skill_description_cleanup.spec.js

import { SKILLS } from '../engine/SkillData.js';

let pass = 0, fail = 0;

function check(name, condition, detail = '') {
  if (condition) { pass++; }
  else { fail++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

const allSkills = Object.values(SKILLS);
const traits = allSkills.filter(s => s.isTrait);
const activeSkills = allSkills.filter(s => !s.isTrait);

console.log(`\nSkills: ${allSkills.length} total, ${traits.length} traits, ${activeSkills.length} active\n`);

// ═══════════════════════════════════════════
console.log('=== Passive skills: no active-skill fields in desc ===');
const PASSIVE_FORBIDDEN = [
  '范围：', '施法范围', '作用范围', '威力：', '速度：', '费用：',
  'cost', 'CD：', '冷却：', '剩余发动次数',
];
for (const skill of traits) {
  for (const forbidden of PASSIVE_FORBIDDEN) {
    check(`${skill.id}: no "${forbidden}" in desc`,
      !skill.desc.includes(forbidden),
      `desc: "${skill.desc.substring(0, 80)}..."`);
  }
}

// ═══════════════════════════════════════════
console.log('\n=== Passive skills: no old separator in desc ===');
for (const skill of traits) {
  check(`${skill.id}: no "——————————————" separator`,
    !skill.desc.includes('——————————————'));
}

// ═══════════════════════════════════════════
console.log('\n=== Passive skills: no speed/CD/cost line ===');
const META_PATTERN = /^(?:范围|施法范围|作用范围|威力|速度|费用|cost|CD|冷却)\s*[：:]/i;
for (const skill of traits) {
  const lines = skill.desc.split('\n');
  for (const line of lines) {
    check(`${skill.id}: line "${line.substring(0, 50)}" no old meta`,
      !META_PATTERN.test(line));
  }
}

// ═══════════════════════════════════════════
console.log('\n=== Passive skills: desc is exactly 1 line (effect body only) ===');
for (const skill of traits) {
  const lines = skill.desc.split('\n').filter(l => l.trim());
  check(`${skill.id}: 1 line (body only)`, lines.length === 1,
    `got ${lines.length}: "${skill.desc.substring(0, 80)}..."`);
}

// ═══════════════════════════════════════════
console.log('\n=== Passive skills: type is "特质" ===');
for (const skill of traits) {
  check(`${skill.id}: type is 特质`, skill.type === '特质',
    `type=${skill.type}`);
}

// ═══════════════════════════════════════════
console.log('\n=== Active skills: no active-skill metadata in desc ===');
for (const skill of activeSkills) {
  check(`${skill.id}: no active meta label in desc`,
    !META_PATTERN.test(skill.desc),
    skill.desc.substring(0, 100));
}

// ═══════════════════════════════════════════
console.log('\n=== Active skills: can still display speed/CD/cost/range ===');
// Spot-check representative active skills
const spotCheck = ['warrior_slash', 'warrior_feint', 'mage_blast', 'shooter_roll'];
for (const id of spotCheck) {
  const skill = SKILLS[id];
  if (!skill) { check(`${id}: exists`, false, 'skill not found'); continue; }
  check(`${id}: desc has no meta label`,
    !META_PATTERN.test(skill.desc),
    skill.desc.substring(0, 100));
  check(`${id}: desc is one line`,
    skill.desc.split('\n').filter(l => l.trim()).length === 1,
    skill.desc.substring(0, 100));
}

// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${pass}, Failed: ${fail}`);
if (fail > 0) process.exit(1);
