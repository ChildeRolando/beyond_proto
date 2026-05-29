import { getSkillPrimitiveProfile, PrimitiveTag } from '../engine/ai/PrimitiveProfile.js';

function check(name, condition, detail = '') {
  if (!condition) {
    console.error(`✗ ${name}${detail ? ` - ${detail}` : ''}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✓ ${name}${detail ? ` - ${detail}` : ''}`);
}

function has(profile, tag) {
  return profile.tags.includes(tag);
}

console.log('=== AI Primitive Profile Tests ===\n');

{
  const profile = getSkillPrimitiveProfile('mage_breath_tide');

  check('primitive profile identifies greedy strategic investment',
    has(profile, PrimitiveTag.INVEST) &&
    has(profile, PrimitiveTag.GREED) &&
    has(profile, PrimitiveTag.SCALING_THREAT),
    profile.tags.join(','));
  check('primitive profile exposes strategic resource delta',
    profile.resourceDelta.qi < 0 && profile.commitment > 0,
    JSON.stringify({ delta: profile.resourceDelta, commitment: profile.commitment }));
}

{
  const profile = getSkillPrimitiveProfile('shooter_armor_pierce');

  check('primitive profile identifies projectile pierce pressure',
    has(profile, PrimitiveTag.PRESSURE) &&
    has(profile, PrimitiveTag.PROJECTILE_THREAT) &&
    has(profile, PrimitiveTag.PIERCE_THREAT) &&
    has(profile, PrimitiveTag.BREAK_DEFENSE),
    profile.tags.join(','));
  check('primitive profile exposes projectile threat shape',
    profile.maxPower === 100 && profile.attackParts === 1,
    JSON.stringify({ maxPower: profile.maxPower, attackParts: profile.attackParts }));
}

{
  const reactive = getSkillPrimitiveProfile('mage_reactive');
  const hook = getSkillPrimitiveProfile('warrior_hook');

  check('primitive profile identifies reaction and area threat without skill-specific tags',
    has(reactive, PrimitiveTag.COUNTER) &&
    has(reactive, PrimitiveTag.REACTION_THREAT) &&
    has(reactive, PrimitiveTag.AREA_THREAT),
    reactive.tags.join(','));
  check('primitive profile identifies control and position threat',
    has(hook, PrimitiveTag.CONTROL) &&
    has(hook, PrimitiveTag.POSITION_THREAT),
    hook.tags.join(','));
}

{
  const profiles = [
    getSkillPrimitiveProfile('mage_breath_tide'),
    getSkillPrimitiveProfile('shooter_armor_pierce'),
    getSkillPrimitiveProfile('mage_reactive'),
    getSkillPrimitiveProfile('warrior_hook'),
  ];
  const forbidden = ['mage', 'warrior', 'shooter', 'armor_pierce', 'breath_tide', 'reactive', 'hook'];

  check('primitive tags do not encode skill or class names',
    profiles.every(profile => profile.tags.every(tag => forbidden.every(word => !tag.toLowerCase().includes(word)))),
    profiles.map(profile => profile.tags.join(',')).join(' | '));
}
