// Resource action classifier tests — verify isResourceAction / isMovementSkill / isAttackSkill
// Run: node tests/resource_action_classifier.spec.js

import { isResourceAction, isMovementSkill, isAttackSkill } from '../engine/SkillTags.js';
import { SKILLS } from '../engine/SkillData.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) { passed++; console.log(`  \x1b[32mOK\x1b[0m ${name}`); }
  else { failed++; console.error(`  \x1b[31mFAIL\x1b[0m ${name}${detail ? ' - ' + detail : ''}`); }
}

// ================================================================
console.log('\n=== ResourceAction classifier ===');
{
  check('mage_gather is resourceAction', isResourceAction('mage_gather'));
  check('warrior_rage is resourceAction', isResourceAction('warrior_rage'));
  check('shooter_roll is resourceAction', isResourceAction('shooter_roll'));
  check('warrior_slash is NOT resourceAction', !isResourceAction('warrior_slash'));
  check('warrior_move is NOT resourceAction', !isResourceAction('warrior_move'));
  check('mage_blast is NOT resourceAction', !isResourceAction('mage_blast'));
  check('shooter_attack is NOT resourceAction', !isResourceAction('shooter_attack'));
  check('unknown skill is NOT resourceAction', !isResourceAction('nonexistent_skill'));
}

console.log('\n=== MovementSkill classifier ===');
{
  check('warrior_move is movement', isMovementSkill('warrior_move'));
  check('shooter_roll is movement', isMovementSkill('shooter_roll'));
  check('mage_teleport is movement', isMovementSkill('mage_teleport'));
  check('warrior_slash is NOT movement', !isMovementSkill('warrior_slash'));
  check('warrior_rage is NOT movement', !isMovementSkill('warrior_rage'));
  check('unknown skill is NOT movement', !isMovementSkill('nonexistent_skill'));
}

console.log('\n=== AttackSkill classifier ===');
{
  check('warrior_slash is attack', isAttackSkill('warrior_slash'));
  check('mage_blast is attack', isAttackSkill('mage_blast'));
  check('shooter_attack is attack', isAttackSkill('shooter_attack'));
  check('warrior_rage is NOT attack', !isAttackSkill('warrior_rage'));
  check('shooter_roll is NOT attack', !isAttackSkill('shooter_roll'));
}

console.log('\n=== SkillData resourceAction metadata ===');
{
  check('mage_gather.resourceAction === true', SKILLS.mage_gather.resourceAction === true);
  check('warrior_rage.resourceAction === true', SKILLS.warrior_rage.resourceAction === true);
  check('shooter_roll.resourceAction === true', SKILLS.shooter_roll.resourceAction === true);
  check('warrior_slash has NO resourceAction', !('resourceAction' in SKILLS.warrior_slash));
}

// ================================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Passed: ${passed}, Failed: ${failed}`);
console.log(`${'='.repeat(50)}`);

if (failed > 0) process.exit(1);
