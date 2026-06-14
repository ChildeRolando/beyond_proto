// Buff tooltip cleanup verification
// Assert: old separator/long-space templates are removed.
// Buff hover tooltips use clean structured display.
// Run: node tests/buff_tooltip_cleanup.spec.js

import { SKILLS } from '../engine/SkillData.js';
import { STATUS_DEFS } from '../engine/StatusEffectDefs.js';
import { renderSkillTooltipCard } from '../ui/shared/SkillTooltipView.js';

let pass = 0, fail = 0;

function check(name, condition, detail = '') {
  if (condition) { pass++; }
  else { fail++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

// ═══════════════════════════════════════════
console.log('\n=== SKILLS descs: no old separator ===');
for (const [id, skill] of Object.entries(SKILLS)) {
  if (skill.isTrait) {
    check(`${id}: passive has no separator`, !skill.desc.includes('——————————————'));
  }
}

// ═══════════════════════════════════════════
console.log('\n=== SKILLS descs: no long-space speed/CD/cost line (passive only) ===');
const META_PATTERN = /速度\s+\S+\s+CD\s+\S+\s+cost\s+\S+/;
for (const [id, skill] of Object.entries(SKILLS)) {
  if (skill.isTrait) {
    check(`${id}: passive has no old meta line`, !META_PATTERN.test(skill.desc),
      skill.desc.substring(0, 80));
  }
}

// ═══════════════════════════════════════════
console.log('\n=== renderSkillTooltipCard: passive skills hide active metadata ===');
for (const [id, skill] of Object.entries(SKILLS)) {
  if (!skill.isTrait) continue;
  const html = renderSkillTooltipCard(skill, skill.desc, {});
  check(`${id}: tooltip says "被动特质"`, html.includes('被动特质'),
    html.substring(0, 100));
  check(`${id}: tooltip has NO speed label`, !/速度\s*\d/.test(html),
    html.substring(0, 100));
  check(`${id}: tooltip has NO CD stat grid`, !html.includes('CD状况'),
    html.substring(0, 100));
  check(`${id}: tooltip has NO remaining uses`, !html.includes('剩余发动次数'),
    html.substring(0, 100));
}

// ═══════════════════════════════════════════
console.log('\n=== renderSkillTooltipCard: active skills show metadata ===');
const spotCheck = ['warrior_slash', 'mage_blast', 'shooter_roll'];
for (const id of spotCheck) {
  const skill = SKILLS[id];
  if (!skill) { check(`${id}: exists`, false); continue; }
  const html = renderSkillTooltipCard(skill, skill.desc, {});
  check(`${id}: tooltip has speed`, /速度/.test(html), html.substring(0, 80));
  check(`${id}: tooltip has CD stat grid`, html.includes('CD状况'), html.substring(0, 80));
}

// ═══════════════════════════════════════════
console.log('\n=== StatusEffectDefs: known buffs have clean descriptions ===');
const BUFFS_TO_CHECK = [
  'JIMMY_BREATH_IN', 'JIMMY_BREATH_OUT', 'SHEATHED', 'INDRA_BLADE',
  'COST_SEALED', 'LOCKED',
];
for (const type of BUFFS_TO_CHECK) {
  const def = STATUS_DEFS[type];
  check(`${type}: status def exists`, !!def);
  if (def) {
    check(`${type}: has name`, typeof def.name === 'string' && def.name.length > 0);
    check(`${type}: has desc`, typeof def.desc === 'string' && def.desc.length > 0);
  }
}

// ═══════════════════════════════════════════
console.log('\n=== Buff descriptions: no old active-skill field language ===');
for (const [type, def] of Object.entries(STATUS_DEFS)) {
  // Status descriptions should NOT say "范围：自身", "速度：" etc.
  check(`${type}: no "范围：自身" in desc`,
    !(def.desc || '').includes('范围：自身'));
  check(`${type}: no old separator in desc`,
    !(def.desc || '').includes('——————————————'));
}

// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${pass}, Failed: ${fail}`);
if (fail > 0) process.exit(1);
