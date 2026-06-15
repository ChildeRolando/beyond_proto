import { test, expect } from 'playwright/test';
import { SKILLS } from '../engine/SkillData.js';
import { QUICK_MODE_LOADOUTS, createQuickModePlayers } from '../engine/QuickModePreset.js';

test('createQuickModePlayers returns locked quick mode configs with fixed loadouts', () => {
  const players = createQuickModePlayers({ player1Class: '法师', player2Class: '战士' });

  expect(players).toHaveLength(2);
  expect(players[0]).toEqual({
    playerId: 'player1',
    class: '法师',
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['法师'],
    roleLoadoutSkillIds: [],
    locked: true,
    quickMode: true,
  });
  expect(players[1]).toEqual({
    playerId: 'player2',
    class: '战士',
    roleId: null,
    loadoutSkillIds: QUICK_MODE_LOADOUTS['战士'],
    roleLoadoutSkillIds: [],
    locked: true,
    quickMode: true,
  });
});

test('every quick mode skill id exists in SKILLS', () => {
  for (const ids of Object.values(QUICK_MODE_LOADOUTS)) {
    for (const id of ids) {
      expect(SKILLS[id], id).toBeTruthy();
    }
  }
});

test('quick mode loadouts contain no role, hidden, or trait skills', () => {
  for (const ids of Object.values(QUICK_MODE_LOADOUTS)) {
    for (const id of ids) {
      const skill = SKILLS[id];
      expect(skill.type, id).not.toBe('角色');
      expect(skill.hidden, id).not.toBe(true);
      expect(skill.isTrait, id).not.toBe(true);
    }
  }
});

test('createQuickModePlayers rejects unknown classes clearly', () => {
  expect(() => createQuickModePlayers({ player1Class: '刺客', player2Class: '战士' }))
    .toThrow(/Unknown quick mode class: 刺客/);
});
