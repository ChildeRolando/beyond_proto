// Skill affordance effective cost tests
// Verifies: UI canAfford / costLabel use effective cost (AFTERSHOCK, INDRA_BLADE, marrow_wine)
// Run: node tests/skill_affordance_effective_cost.spec.js

import { getEffectiveSkillCost } from '../engine/EffectiveSkillCost.js';

let pass = 0, fail = 0;

function check(name, condition, detail = '') {
  if (condition) { pass++; }
  else { fail++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

function makeChar(buffs = [], resources = {}) {
  return { id: 'test_mage', class: '法师', buffs, resources };
}

// ═══════════════════════════════════════════
console.log('\n=== Test A: qi=0 + AFTERSHOCK stacks=1 → canAfford=true (free) ===');
{
  const char = makeChar([{ statusType: 'AFTERSHOCK', data: { stacks: 1 } }], { qi: 0 });
  const result = getEffectiveSkillCost('mage_small_qi_blast', char);
  check('effective cost is free', result.free === true && Object.keys(result.cost).length === 0,
    JSON.stringify(result));
  check('reason is AFTERSHOCK', result.reason === 'AFTERSHOCK');
  const total = Object.values(result.cost).reduce((s, v) => s + v, 0);
  check('total cost is 0', total === 0, `total=${total}`);
}

// ═══════════════════════════════════════════
console.log('\n=== Test B: qi=0 + no AFTERSHOCK → cost {qi:1} ===');
{
  const char = makeChar([], { qi: 0 });
  const result = getEffectiveSkillCost('mage_small_qi_blast', char);
  check('effective cost = qi 1', result.cost.qi === 1 && result.free === false,
    JSON.stringify(result));
  const total = Object.values(result.cost).reduce((s, v) => s + v, 0);
  check('total cost is 1', total === 1, `total=${total}`);
}

// ═══════════════════════════════════════════
console.log('\n=== Test C: qi=1 + no AFTERSHOCK → cost {qi:1} (affordable) ===');
{
  const char = makeChar([], { qi: 1 });
  const result = getEffectiveSkillCost('mage_small_qi_blast', char);
  check('cost is qi 1', result.cost.qi === 1);
  // afford check: available 1 >= cost 1 → true
  const available = char.resources.qi || 0;
  check('qi=1 can afford cost=1', available >= result.cost.qi);
}

// ═══════════════════════════════════════════
console.log('\n=== Test D: AFTERSHOCK stacks=0 → not free ===');
{
  const char = makeChar([{ statusType: 'AFTERSHOCK', data: { stacks: 0 } }], { qi: 0 });
  const result = getEffectiveSkillCost('mage_small_qi_blast', char);
  check('AFTERSHOCK stacks=0 → cost qi 1', result.cost.qi === 1,
    JSON.stringify(result));
}

// ═══════════════════════════════════════════
console.log('\n=== Test E: role_jimmy_marrow_wine dynamic cost ===');
{
  // Layer 0 → cost 3
  const char0 = makeChar([], { rage: 0 });
  const r0 = getEffectiveSkillCost('role_jimmy_marrow_wine', char0);
  check('marrow layer 0 → cost rage 3', r0.cost.rage === 3, JSON.stringify(r0));

  // Layer 2 → cost 4
  const char2 = makeChar([{ statusType: 'JIMMY_MARROW', data: { layer: 2 } }], { rage: 0 });
  const r2 = getEffectiveSkillCost('role_jimmy_marrow_wine', char2);
  check('marrow layer 2 → cost rage 4', r2.cost.rage === 4, JSON.stringify(r2));

  // Layer 4 → cost 5
  const char4 = makeChar([{ statusType: 'JIMMY_MARROW', data: { layer: 4 } }], { rage: 0 });
  const r4 = getEffectiveSkillCost('role_jimmy_marrow_wine', char4);
  check('marrow layer 4 → cost rage 5', r4.cost.rage === 5, JSON.stringify(r4));
}

// ═══════════════════════════════════════════
console.log('\n=== Test F: warrior_iaido + INDRA_BLADE → free ===');
{
  const char = makeChar([{ statusType: 'INDRA_BLADE' }], { rage: 0 });
  const result = getEffectiveSkillCost('warrior_iaido', char);
  check('iaido + INDRA_BLADE → free', result.free === true && Object.keys(result.cost).length === 0,
    JSON.stringify(result));
}

// ═══════════════════════════════════════════
console.log('\n=== Test G: warrior_iaido without INDRA_BLADE → cost rage 3 ===');
{
  const char = makeChar([], { rage: 0 });
  const result = getEffectiveSkillCost('warrior_iaido', char);
  check('iaido no INDRA_BLADE → cost rage 3', result.cost.rage === 3,
    JSON.stringify(result));
}

// ═══════════════════════════════════════════
console.log('\n=== Test H: unknown skill returns null (use raw cost) ===');
{
  const char = makeChar([], { qi: 5 });
  const result = getEffectiveSkillCost('warrior_slash', char);
  check('warrior_slash → null (no dynamic cost)', result === null);
}

// ═══════════════════════════════════════════
console.log('\n=== Test I: cost label reflects free status ===');
{
  const char = makeChar([{ statusType: 'AFTERSHOCK', data: { stacks: 1 } }], { qi: 0 });
  const result = getEffectiveSkillCost('mage_small_qi_blast', char);
  const total = Object.values(result.cost).reduce((s, v) => s + v, 0);
  const label = result.free ? 'C0' : `C${total}`;
  check('AFTERSHOCK ⇒ label C0', label === 'C0', `label=${label}`);
}

// ═══════════════════════════════════════════
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${pass}, Failed: ${fail}`);
if (fail > 0) process.exit(1);
