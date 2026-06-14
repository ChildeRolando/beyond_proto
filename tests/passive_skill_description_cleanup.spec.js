// Passive skill description cleanup verification
// Assert: all isTrait:true skills have clean descs — no range/self-cast,
// no speed/cost/CD, no old separator templates.
// Active skills still retain their metadata.
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
  '范围：自身', '施法范围', '速度：', '费用：无',
  'CD：', '施法范围为自身',
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
const META_PATTERN = /速度\s*\S+\s+CD\s*\S+\s+cost\s*\S+/;
for (const skill of traits) {
  const lines = skill.desc.split('\n');
  for (const line of lines) {
    check(`${skill.id}: line "${line.substring(0, 50)}" no old meta`,
      !META_PATTERN.test(line));
  }
}

// ═══════════════════════════════════════════
console.log('\n=== Passive skills: desc is exactly 2 lines (name + body) ===');
for (const skill of traits) {
  const lines = skill.desc.split('\n').filter(l => l.trim());
  check(`${skill.id}: 2 lines (name + body)`, lines.length === 2,
    `got ${lines.length}: "${skill.desc.substring(0, 80)}..."`);
}

// ═══════════════════════════════════════════
console.log('\n=== Passive skills: type is "特质" ===');
for (const skill of traits) {
  check(`${skill.id}: type is 特质`, skill.type === '特质',
    `type=${skill.type}`);
}

// ═══════════════════════════════════════════
console.log('\n=== Active skills: still have speed/CD/cost metadata ===');
// Only check active skills that went through normalization
const normalizedActive = activeSkills.filter(s => s.desc.includes('\n'));
let activeWithMeta = 0;
for (const skill of normalizedActive) {
  if (META_PATTERN.test(skill.desc)) activeWithMeta++;
}
check('majority of active skills have metadata line',
  activeWithMeta >= normalizedActive.length * 0.8,
  `${activeWithMeta}/${normalizedActive.length} have speed/CD/cost`);

// ═══════════════════════════════════════════
console.log('\n=== Active skills: can still display speed/CD/cost/range ===');
// Spot-check representative active skills
const spotCheck = ['warrior_slash', 'warrior_feint', 'mage_blast', 'shooter_roll'];
for (const id of spotCheck) {
  const skill = SKILLS[id];
  if (!skill) { check(`${id}: exists`, false, 'skill not found'); continue; }
  check(`${id}: has speed/CD/cost in desc`,
    META_PATTERN.test(skill.desc),
    skill.desc.substring(0, 100));
}

// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${pass}, Failed: ${fail}`);
if (fail > 0) process.exit(1);
