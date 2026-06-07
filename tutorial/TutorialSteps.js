export const TUTORIAL_LEVEL_ORDER = [
  'tutorial_move_execute',
  'tutorial_attack_target',
  'tutorial_speed_priority',
];

export const TUTORIAL_LEVELS = {
  tutorial_move_execute: {
    levelId: 'tutorial_move_execute',
    index: 0,
    title: '教学 1/3：移动与执行回合',
    completionText: '教程 1 完成',
    finalCompletionText: '基础教学完成',
    nextLevelId: 'tutorial_attack_target',
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '战士',
    playerRoleId: 'warrior_vanguard',
    playerLoadoutSkillIds: ['warrior_move'],
    playerRoleLoadoutSkillIds: [],
    playerResources: { hp: 100 },
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: [],
      roleLoadoutSkillIds: ['role_vanguard_breakline'],
      position: { q: 2, r: 0 },
      resources: { hp: 40 },
      // Tutorial 2 should demonstrate a one-hit kill.
    },
    initialStepId: 'select_move',
    steps: {
      select_move: {
        objective: '选择下方技能栏中的移动技能。',
        allowedSkillIds: ['warrior_move'],
        nextStepId: 'choose_move_target',
      },
      choose_move_target: {
        objective: '选择一个蓝色相邻格作为移动目标。',
        submitTargetMessage: '选择一个蓝色相邻格作为移动目标。',
        allowedSkillIds: ['warrior_move'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合后才会真正结算。',
        allowedSkillIds: ['warrior_move'],
      },
    },
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'role_vanguard_breakline', targetPos: null },
    ],
  },

  tutorial_attack_target: {
    levelId: 'tutorial_attack_target',
    index: 1,
    title: '教学 2/3：攻击与目标格',
    completionText: '教程 2 完成',
    finalCompletionText: '基础教学完成',
    nextLevelId: 'tutorial_speed_priority',
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '战士',
    playerRoleId: 'warrior_vanguard',
    playerLoadoutSkillIds: ['warrior_slash'],
    playerRoleLoadoutSkillIds: [],
    playerResources: { hp: 100 },
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: [],
      roleLoadoutSkillIds: ['role_vanguard_breakline'],
      position: { q: 1, r: 0 },
      resources: { hp: 40 },
    },
    initialStepId: 'select_attack',
    steps: {
      select_attack: {
        objective: '选择普通攻击技能。',
        allowedSkillIds: ['warrior_slash'],
        nextStepId: 'choose_enemy_hex',
      },
      choose_enemy_hex: {
        objective: '选择敌人所在的格子作为目标。',
        submitTargetMessage: '选择敌人所在的格子作为目标。',
        allowedTargets: [{ q: 1, r: 0 }],
        wrongTargetError: '请选择敌人所在的格子。',
        allowedSkillIds: ['warrior_slash'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合后才会真正结算。',
        allowedSkillIds: ['warrior_slash'],
      },
    },
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'role_vanguard_breakline', targetPos: null },
    ],
  },

  tutorial_speed_priority: {
    levelId: 'tutorial_speed_priority',
    index: 2,
    title: '教学 3/3：速度优先级',
    completionText: '基础教学完成',
    finalCompletionText: '基础教学完成',
    nextLevelId: null,
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '战士',
    playerRoleId: 'warrior_vanguard',
    playerLoadoutSkillIds: ['warrior_move'],
    playerRoleLoadoutSkillIds: [],
    playerResources: { hp: 100 },
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '射手',
      roleId: 'shooter_gunfighter',
      loadoutSkillIds: ['shooter_attack'],
      roleLoadoutSkillIds: [],
      position: { q: 0, r: -2 },
      resources: { hp: 150, ammo: 1 },
    },
    initialStepId: 'select_move',
    steps: {
      select_move: {
        objective: '敌人将用速度 1 的行动向你射击。使用速度 3 移动先离开。',
        allowedSkillIds: ['warrior_move'],
        nextStepId: 'choose_safe_hex',
      },
      choose_safe_hex: {
        objective: '选择一个侧向安全的相邻格。',
        submitTargetMessage: '选择一个侧向安全的相邻格。',
        allowedTargets: [
          { q: 1, r: 0 },
          { q: 1, r: -1 },
          { q: -1, r: 0 },
          { q: -1, r: 1 },
        ],
        wrongTargetError: '请选择侧向安全的相邻格，不要留在射线上。',
        allowedSkillIds: ['warrior_move'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合后才会真正结算。',
        allowedSkillIds: ['warrior_move'],
      },
    },
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'shooter_attack', targetPos: { q: 0, r: 0 } },
    ],
  },
};

export function getTutorialLevel(levelId) {
  return TUTORIAL_LEVELS[levelId] || null;
}

export function getTutorialLevelIndex(levelId) {
  return TUTORIAL_LEVEL_ORDER.indexOf(levelId);
}

export function getNextTutorialLevelId(levelId) {
  const idx = getTutorialLevelIndex(levelId);
  if (idx < 0) return null;
  return TUTORIAL_LEVEL_ORDER[idx + 1] || null;
}

export function isTutorialLevel(levelId) {
  return Boolean(getTutorialLevel(levelId));
}
