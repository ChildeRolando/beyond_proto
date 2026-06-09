// Unit tests for DisplayNames
// Run: node tests/display_names.spec.js

import {
  getSkillName, getStatusName, getResourceName,
  getDamageLayerName, getReasonText, getResultText,
  formatActionFailedText,
} from '../engine/presentation/DisplayNames.js';

let pass = 0, fail = 0;

function assert(cond, label) {
  if (cond) { pass++; }
  else { fail++; console.error(`  FAIL: ${label}`); }
}

function assertEquals(actual, expected, label) {
  if (actual === expected) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

function assertMatch(actual, pattern, label) {
  if (pattern.test(actual)) { pass++; }
  else { fail++; console.error(`  FAIL: ${label} — "${actual}" does not match ${pattern}`); }
}

// ═══════════════════════════════════════════
// Part 1: Skill names
// ═══════════════════════════════════════════

console.log('\n=== Part 1: getSkillName ===');

console.log('\n[1a] known skills return Chinese names');
assertEquals(getSkillName('mage_gather'), '集气护盾', 'mage_gather → 集气护盾');
assertEquals(getSkillName('warrior_rage'), '盛怒', 'warrior_rage → 盛怒');
assertEquals(getSkillName('warrior_slash'), '普通斩', 'warrior_slash → 普通斩');
assertEquals(getSkillName('mage_blast'), '气功波', 'mage_blast → 气功波');
assertEquals(getSkillName('warrior_feint'), '退寸进尺', 'warrior_feint → 退寸进尺');

console.log('\n[1b] unknown skill returns fallback with id');
const unknownSkill = getSkillName('nonexistent_skill_xyz');
assert(unknownSkill.includes('未知技能'), 'unknown contains 未知技能');
assert(unknownSkill.includes('nonexistent_skill_xyz'), 'unknown contains the raw id');

console.log('\n[1c] null/undefined skill returns fallback');
assertEquals(getSkillName(null), '未知技能', 'null → 未知技能');
assertEquals(getSkillName(''), '未知技能', 'empty → 未知技能');

// ═══════════════════════════════════════════
// Part 2: Status names
// ═══════════════════════════════════════════

console.log('\n=== Part 2: getStatusName ===');

console.log('\n[2a] known statuses return Chinese names');
assertEquals(getStatusName('SHIELD_ACTIVE'), '护盾开启', 'SHIELD_ACTIVE → 护盾开启');
assertEquals(getStatusName('JIMMY_BREATH_IN'), '吸', 'JIMMY_BREATH_IN → 吸');
assertEquals(getStatusName('JIMMY_BREATH_OUT'), '呼', 'JIMMY_BREATH_OUT → 呼');

console.log('\n[2b] unknown status returns fallback with id');
const unknownStatus = getStatusName('INVALID_STATUS');
assert(unknownStatus.includes('未知状态'), 'unknown contains 未知状态');
assert(unknownStatus.includes('INVALID_STATUS'), 'unknown contains the raw id');

console.log('\n[2c] null/undefined status returns fallback');
assertEquals(getStatusName(null), '未知状态', 'null → 未知状态');
assertEquals(getStatusName(''), '未知状态', 'empty → 未知状态');

// ═══════════════════════════════════════════
// Part 3: Resource names
// ═══════════════════════════════════════════

console.log('\n=== Part 3: getResourceName ===');

console.log('\n[3a] known resources return Chinese names');
assertEquals(getResourceName('qi'), '气', 'qi → 气');
assertEquals(getResourceName('rage'), '怒气', 'rage → 怒气');
assertEquals(getResourceName('shield'), '护盾', 'shield → 护盾');
assertEquals(getResourceName('ammo'), '子弹', 'ammo → 子弹');
assertEquals(getResourceName('backpackAmmo'), '备弹', 'backpackAmmo → 备弹');
assertEquals(getResourceName('energy'), '阵法能量', 'energy → 阵法能量');

console.log('\n[3b] unknown resource returns fallback with id');
const unknownRes = getResourceName('hp');
assert(unknownRes.includes('未知资源'), 'unknown contains 未知资源');
assert(unknownRes.includes('hp'), 'unknown contains raw id hp');

console.log('\n[3c] null/undefined resource returns fallback');
assertEquals(getResourceName(null), '未知资源', 'null → 未知资源');
assertEquals(getResourceName(''), '未知资源', 'empty → 未知资源');

// ═══════════════════════════════════════════
// Part 4: Damage layer names
// ═══════════════════════════════════════════

console.log('\n=== Part 4: getDamageLayerName ===');

console.log('\n[4a] known layers return Chinese names');
assertEquals(getDamageLayerName('SHIELD'), '护盾', 'SHIELD → 护盾');
assertEquals(getDamageLayerName('RAGE'), '怒气', 'RAGE → 怒气');
assertEquals(getDamageLayerName('BLOCK'), '格挡', 'BLOCK → 格挡');
assertEquals(getDamageLayerName('FORMATION'), '阵法', 'FORMATION → 阵法');
assertEquals(getDamageLayerName('SWORD_FLIGHT'), '御剑', 'SWORD_FLIGHT → 御剑');

console.log('\n[4b] unknown layer returns fallback with id');
const unknownLayer = getDamageLayerName('MYSTIC');
assert(unknownLayer.includes('未知防御'), 'unknown contains 未知防御');
assert(unknownLayer.includes('MYSTIC'), 'unknown contains raw id');

console.log('\n[4c] null/undefined layer returns fallback');
assertEquals(getDamageLayerName(null), '未知防御', 'null → 未知防御');
assertEquals(getDamageLayerName(''), '未知防御', 'empty → 未知防御');

// ═══════════════════════════════════════════
// Part 5: Reason / result text
// ═══════════════════════════════════════════

console.log('\n=== Part 5: getReasonText / getResultText ===');

console.log('\n[5a] known reasons return Chinese text');
assertEquals(getReasonText('miss'), '挥空', 'miss → 挥空');
assertEquals(getReasonText('target_moved'), '目标已离开', 'target_moved → 目标已离开');
assertEquals(getReasonText('empty_hex'), '目标格为空', 'empty_hex → 目标格为空');
assertEquals(getReasonText('insufficient_resource'), '资源不足', 'insufficient_resource → 资源不足');
assertEquals(getReasonText('blocked'), '被阻止', 'blocked → 被阻止');
assertEquals(getReasonText('no_displacement'), '未产生位移', 'no_displacement → 未产生位移');

console.log('\n[5b] unknown reasons return the raw value');
assertEquals(getReasonText('custom_reason'), 'custom_reason', 'unknown reason passes through');
assertEquals(getReasonText(null), null, 'null → null');

console.log('\n[5c] formatActionFailedText uses display reason');
const failText = formatActionFailedText('镜', 'miss');
assert(failText.includes('镜'), 'includes actor name');
assert(failText.includes('挥空'), 'includes reason text 挥空');
assert(!failText.includes('miss'), 'does NOT contain raw "miss"');

// ─── Summary ───

console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${pass}, 失败: ${fail}`);
if (fail > 0) process.exit(1);
