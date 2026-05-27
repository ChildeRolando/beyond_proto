// Role + loadout system tests
// Run: node tests/role_loadout_test.js

import { GameEngine } from '../engine/GameEngine.js';
import {
  LOADOUT_SIZE,
  ROLE_DEFS,
  ROLE_TRAITS,
  getDefaultLoadout,
  getRolesByClass,
  validateLoadout,
} from '../engine/RoleData.js';
import { SKILLS } from '../engine/SkillData.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } else {
    failed++;
    console.error(`  \x1b[31m✗\x1b[0m ${name}${detail ? ' — ' + detail : ''}`);
  }
}

console.log('=== Role + Loadout Tests ===\n');

console.log('[1] role data');
check('LOADOUT_SIZE defaults to 8', LOADOUT_SIZE === 8, `LOADOUT_SIZE=${LOADOUT_SIZE}`);

for (const cls of ['法师', '战士', '射手']) {
  const roles = getRolesByClass(cls);
  check(`${cls} has at least 3 roles`, roles.length >= 3, `count=${roles.length}`);
  check(`${cls} has default loadout size`, getDefaultLoadout(cls).length === LOADOUT_SIZE);
}

for (const role of Object.values(ROLE_DEFS)) {
  check(`${role.name} has valid class`, ['法师', '战士', '射手'].includes(role.class), role.class);
  check(`${role.name} traits exist`, role.traitIds.every(id => ROLE_TRAITS[id]), role.traitIds.join(','));
  check(`${role.name} role skills exist`, role.roleSkillIds.every(id => SKILLS[id]), role.roleSkillIds.join(','));
  check(`${role.name} role skills are not hidden`, role.roleSkillIds.every(id => !SKILLS[id]?.hidden));
}

console.log('\n[2] loadout validation');
check('default shooter loadout validates', validateLoadout('射手', getDefaultLoadout('射手')).ok);
check('duplicate skill rejected', !validateLoadout('射手', ['shooter_attack', 'shooter_attack']).ok);
check('hidden skill rejected', !validateLoadout('射手', ['shooter_bell_resolve']).ok);
check('cross-class skill rejected', !validateLoadout('射手', ['mage_gather']).ok);

console.log('\n[3] engine battle config');
const p1Loadout = getDefaultLoadout('射手');
const p2Loadout = getDefaultLoadout('战士');
const engine = new GameEngine();
const ids = engine.initBattle({
  seed: 123,
  players: [
    { playerId: 'player1', class: '射手', roleId: 'shooter_gunfighter', loadoutSkillIds: p1Loadout },
    { playerId: 'player2', class: '战士', roleId: 'warrior_jimmy', loadoutSkillIds: p2Loadout },
  ],
});
const state = engine.getState();
const p1 = state.characters.find(c => c.ownerId === 'player1');
const p2 = state.characters.find(c => c.ownerId === 'player2');

check('player1 role registered', p1?.roleId === 'shooter_gunfighter', p1?.roleId);
check('player2 role registered', p2?.roleId === 'warrior_jimmy', p2?.roleId);
check('player1 loadout registered', p1?.loadoutSkillIds?.length === LOADOUT_SIZE, String(p1?.loadoutSkillIds?.length));
check('player1 role traits exposed', p1?.traits?.some(t => t.id === 'gunfighter_finesse'));
check('player1 final skills include role placeholder', p1?.skills?.some(s => s.id === 'role_gunfighter_quick_action'));
check('player1 final skills include loadout skill', p1?.skills?.some(s => s.id === 'shooter_attack'));

const rejected = engine.submitAction(ids.player1Id, 'shooter_causality', { q: 0, r: 2 });
check('unloaded skill is rejected', !rejected.success && rejected.error === 'skill_not_in_loadout', rejected.error);

const accepted = engine.submitAction(ids.player1Id, 'role_gunfighter_quick_action', null);
check('role placeholder skill can be submitted', accepted.success, accepted.error);
engine.submitAction(ids.player2Id, 'warrior_rage', null);
const turn = await engine.executeTurn();
check('placeholder turn executes', turn.success, turn.error);
const logHit = engine.logger.getEntries().some(e => e.message.includes('角色技能暂未实装：灵巧行动'));
check('placeholder skill logs planned message', logHit);

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
