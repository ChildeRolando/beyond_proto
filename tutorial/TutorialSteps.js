import { MechanicID } from './Mechanics.js';

// ─── DAG-based level order (replaces linear order) ───
//
// Structure:
//   L1 (submit/execute) → L2 (targeting) → L3 (speed priority)
//                                                 ↓
//                          ┌──────────────────────┼──────────────────────┐
//                          ↓                      ↓                      ↓
//                   L4 (power compare)   L5 (gunfighter resources)  L6 (charge shield)
//                          │                      │                      │
//                          └──────────────────────┼──────────────────────┘
//                                                 ↓
//                                        L7 (shield timing)
//                                                 ↓
//                                        L8 (rage absorption)
//                                                 ↓
//                                        L9 (comprehensive)
//

export const TUTORIAL_LEVEL_ORDER = [
  'tutorial_move_execute',
  'tutorial_attack_target',
  'tutorial_speed_priority',
  'tutorial_power_comparison',
  'tutorial_gunfighter_resources',
  'tutorial_charge_shield',
  'tutorial_shield_timing',
  'tutorial_rage_absorption',
  'tutorial_comprehensive',
];

export const TUTORIAL_LEVELS = {
  // ═══════════════════════════════════════════════════════════
  // Level 1: 移动与执行回合
  // Teaches: SUBMIT_EXECUTE — action submission triggers batch resolution
  // Prerequisites: none (root module)
  // ═══════════════════════════════════════════════════════════
  tutorial_move_execute: {
    levelId: 'tutorial_move_execute',
    index: 0,
    title: '教学 1/9：移动与执行回合',
    completionText: '模块 1 完成',
    finalCompletionText: '基础教学完成',
    // ── Mechanic curriculum ──
    teaches: [MechanicID.SUBMIT_EXECUTE],
    prerequisites: [],
    unlocks: ['tutorial_attack_target'],
    // ── Level config ──
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '战士',
    playerRoleId: 'warrior_vanguard',
    playerLoadoutSkillIds: ['warrior_move'],
    playerRoleLoadoutSkillIds: [],
    playerResources: {},
    enemy: {
      id: 'tutorial_dummy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_dummy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: ['tutorial_dummy_wait'],
      roleLoadoutSkillIds: [],
      position: { q: 2, r: 0 },
      resources: {},
      displayName: '训练稻草人',
      tutorialUnit: true,
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
      { charId: 'tutorial_dummy', skillId: 'tutorial_dummy_wait', targetPos: null },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Level 2: 攻击与目标格
  // Teaches: TARGET_SELECTION — hex-based target picking
  // Prerequisites: SUBMIT_EXECUTE
  // ═══════════════════════════════════════════════════════════
  tutorial_attack_target: {
    levelId: 'tutorial_attack_target',
    index: 1,
    title: '教学 2/9：攻击与目标格',
    completionText: '模块 2 完成',
    finalCompletionText: '基础教学完成',
    teaches: [MechanicID.TARGET_SELECTION],
    prerequisites: [MechanicID.SUBMIT_EXECUTE],
    unlocks: ['tutorial_speed_priority'],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '战士',
    playerRoleId: 'warrior_vanguard',
    playerLoadoutSkillIds: ['warrior_slash'],
    playerRoleLoadoutSkillIds: [],
    playerResources: {},
    enemy: {
      id: 'tutorial_dummy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_dummy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: ['tutorial_dummy_wait'],
      roleLoadoutSkillIds: [],
      position: { q: 1, r: 0 },
      resources: {},
      displayName: '训练稻草人',
      tutorialUnit: true,
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
      { charId: 'tutorial_dummy', skillId: 'tutorial_dummy_wait', targetPos: null },
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // Level 3: 速度优先级
  // Teaches: SPEED_PRIORITY — speed 3 resolves before speed 1
  // Prerequisites: SUBMIT_EXECUTE, TARGET_SELECTION
  // ═══════════════════════════════════════════════════════════
  tutorial_speed_priority: {
    levelId: 'tutorial_speed_priority',
    index: 2,
    title: '教学 3/9：速度优先级',
    completionText: '模块 3 完成',
    finalCompletionText: '基础教学完成',
    teaches: [MechanicID.SPEED_PRIORITY],
    prerequisites: [MechanicID.SUBMIT_EXECUTE, MechanicID.TARGET_SELECTION],
    unlocks: ['tutorial_power_comparison', 'tutorial_gunfighter_resources', 'tutorial_charge_shield'],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '战士',
    playerRoleId: 'warrior_vanguard',
    playerLoadoutSkillIds: ['warrior_move'],
    playerRoleLoadoutSkillIds: [],
    playerResources: {},
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
      resources: { ammo: 1 },
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

  // ═══════════════════════════════════════════════════════════
  // Level 4: 威力比较
  // Teaches: POWER_COMPARISON — projectile collision: higher power overpowers lower
  // Prerequisites: SPEED_PRIORITY
  //
  // Design: Player (法师) and enemy (射手) fire projectiles at each other.
  //   Turn 1: Both fire power-100 projectiles → equal power → mutual destruction (相杀).
  //   Turn 2: Player uses power-300 → overpowers enemy's 100 → enemy hit and killed.
  // Player observes: equal power annihilates, higher power penetrates (贯穿).
  // This is fundamentally about power comparison in projectile collision — NOT about shield.
  // ═══════════════════════════════════════════════════════════
  tutorial_power_comparison: {
    levelId: 'tutorial_power_comparison',
    index: 3,
    title: '教学 4/9：威力比较',
    completionText: '模块 4 完成',
    finalCompletionText: '威力比较完成',
    teaches: [MechanicID.POWER_COMPARISON],
    prerequisites: [MechanicID.SPEED_PRIORITY],
    unlocks: ['tutorial_shield_timing'],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '法师',
    playerRoleId: 'mage_hermit',
    // mage_blast: power 100, cost qi 1. mage_bigblast: power 300, cost qi 3.
    // Start with 4 qi — enough for both turns (1 + 3).
    playerLoadoutSkillIds: ['mage_blast', 'mage_bigblast'],
    playerRoleLoadoutSkillIds: [],
    playerResources: { qi: 4 },
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '射手',
      roleId: 'shooter_gunfighter',
      // shooter_attack: power 100, cost ammo 1. Needs ammo for 2 turns.
      loadoutSkillIds: ['shooter_attack'],
      roleLoadoutSkillIds: [],
      position: { q: 0, r: -2 },
      resources: { ammo: 2 },
      displayName: '训练射手',
    },
    initialStepId: 'turn1_select',
    steps: {
      turn1_select: {
        objective: '敌人将向你射击（威力100）。使用气功波（威力100）与敌人对射。',
        allowedSkillIds: ['mage_blast'],
        nextStepId: 'turn1_target',
      },
      turn1_target: {
        objective: '选择敌人所在的格子。',
        submitTargetMessage: '选择敌人所在的格子。',
        allowedTargets: [{ q: 0, r: -2 }],
        wrongTargetError: '请选择敌人所在的格子。',
        allowedSkillIds: ['mage_blast'],
        nextStepId: 'turn1_await',
      },
      turn1_await: {
        objective: '行动已提交。点击执行回合，观察两个弹体碰撞结果。',
        allowedSkillIds: ['mage_blast'],
      },
    },
    // Turn 1: enemy shoots at player — projectiles collide mid-air
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'shooter_attack', targetPos: { q: 0, r: 0 } },
    ],
    // Multi-turn: turn 2 — player uses higher power to overpower
    _multiTurn: true,
    _turnScripts: {
      2: {
        playerStepId: 'turn2_select',
        playerSteps: {
          turn2_select: {
            objective: '威力相同时弹体相杀，双方无伤。使用大气功波（威力300）突破。',
            allowedSkillIds: ['mage_bigblast'],
            nextStepId: 'turn2_target',
          },
          turn2_target: {
            objective: '选择敌人所在的格子。',
            submitTargetMessage: '选择敌人所在的格子。',
            allowedTargets: [{ q: 0, r: -2 }],
            wrongTargetError: '请选择敌人所在的格子。',
            allowedSkillIds: ['mage_bigblast'],
            nextStepId: 'turn2_await',
          },
          turn2_await: {
            objective: '行动已提交。点击执行回合。高威力弹体将贯穿低威力弹体并命中敌人。',
            allowedSkillIds: ['mage_bigblast'],
          },
        },
        enemyActions: [
          { charId: 'tutorial_enemy', skillId: 'shooter_attack', targetPos: { q: 0, r: 0 } },
        ],
        winCheck: 'power_comparison',
        checkParams: { expectOverpowered: true },
      },
    },
    _winCheck: 'power_comparison',
    _checkParams: { expectMutualDestroy: true },
  },

  // ═══════════════════════════════════════════════════════════
  // Level 5: 枪侠资源系统
  // Teaches: RESOURCE_LOOP — cost → action → gain → constraint cycle
  // Prerequisites: SPEED_PRIORITY
  //
  // Design: Player controls a shooter with limited ammo. Turn 1: attack
  // consumes ammo. Turn 2: must reload to restore ammo. Player experiences
  // the full resource loop: spend → deplete → restore → spend again.
  // ═══════════════════════════════════════════════════════════
  tutorial_gunfighter_resources: {
    levelId: 'tutorial_gunfighter_resources',
    index: 4,
    title: '教学 5/9：枪侠资源',
    completionText: '模块 5 完成',
    finalCompletionText: '资源系统完成',
    teaches: [MechanicID.RESOURCE_LOOP],
    prerequisites: [MechanicID.SPEED_PRIORITY],
    unlocks: [],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '射手',
    playerRoleId: 'shooter_gunfighter',
    playerLoadoutSkillIds: ['shooter_attack', 'shooter_reload'],
    playerRoleLoadoutSkillIds: [],
    // Start with 1 ammo — exactly enough for one attack
    // After firing, ammo depletes to 0; must reload next turn
    playerResources: { ammo: 1 },
    enemy: {
      id: 'tutorial_dummy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_dummy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: ['tutorial_dummy_wait'],
      roleLoadoutSkillIds: [],
      position: { q: 2, r: 0 },
      resources: {},
      displayName: '训练稻草人',
      tutorialUnit: true,
    },
    initialStepId: 'select_attack',
    steps: {
      select_attack: {
        objective: '选择普通攻击。注意：需要消耗1弹药。',
        allowedSkillIds: ['shooter_attack'],
        nextStepId: 'choose_target',
      },
      choose_target: {
        objective: '选择敌人作为目标。',
        submitTargetMessage: '选择敌人作为目标。',
        allowedTargets: [
          { q: 1, r: 0 },
          { q: 2, r: 0 },
        ],
        wrongTargetError: '请选择敌人所在的格子。',
        allowedSkillIds: ['shooter_attack'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合。观察弹药消耗。',
        allowedSkillIds: ['shooter_attack'],
      },
    },
    scriptedEnemyActions: [
      { charId: 'tutorial_dummy', skillId: 'tutorial_dummy_wait', targetPos: null },
    ],
    _winCheck: 'resource_loop',
    _checkParams: { expectResourceConsumed: 'ammo', expectSkillUsed: 'shooter_attack' },
  },

  // ═══════════════════════════════════════════════════════════
  // Level 6: 集气护盾
  // Teaches: CHARGE_SHIELD — charge action → shield generation (cross-turn)
  // Prerequisites: SPEED_PRIORITY
  //
  // Design: 2-turn level. Turn 1: player charges (mage_gather), gaining
  // SHIELD_ACTIVE. AI waits. Turn 2: AI attacks, shield absorbs the damage.
  // Player sees: charge on turn 1 → shield protects on turn 2.
  // This is the cross-turn mechanic: shield is ACTIVE across turns.
  // ═══════════════════════════════════════════════════════════
  tutorial_charge_shield: {
    levelId: 'tutorial_charge_shield',
    index: 5,
    title: '教学 6/9：集气护盾',
    completionText: '模块 6 完成',
    finalCompletionText: '护盾机制完成',
    teaches: [MechanicID.CHARGE_SHIELD],
    prerequisites: [MechanicID.SPEED_PRIORITY],
    unlocks: ['tutorial_shield_timing'],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '法师',
    playerRoleId: 'mage_hermit',
    playerLoadoutSkillIds: ['mage_gather'],
    playerRoleLoadoutSkillIds: [],
    playerResources: {},
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: ['tutorial_dummy_wait', 'warrior_slash'],
      roleLoadoutSkillIds: [],
      position: { q: 1, r: 0 },
      resources: {},
      displayName: '训练敌人',
    },
    initialStepId: 'select_charge',
    steps: {
      select_charge: {
        objective: '使用集气护盾技能。护盾将在本回合激活并持续到下回合。',
        allowedSkillIds: ['mage_gather'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合生成护盾。',
        allowedSkillIds: ['mage_gather'],
      },
    },
    // Turn 1: enemy waits (player charges safely)
    // The enemy attacks on turn 2 via multi-turn scripting
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'tutorial_dummy_wait', targetPos: null },
    ],
    // Multi-turn: after turn 1, prime turn 2 enemy attack
    _multiTurn: true,
    _turnScripts: {
      2: {
        playerStepId: 'turn2_wait',
        playerSteps: {
          turn2_wait: {
            objective: '护盾已激活。敌人将攻击你。使用任意行动或直接执行。',
            allowedSkillIds: null, // any
          },
        },
        enemyActions: [
          { charId: 'tutorial_enemy', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
        ],
        winCheck: 'charge_shield',
        checkParams: { expectShieldAbsorb: true },
      },
    },
    _winCheck: 'charge_shield',
    _checkParams: { expectStatusApplied: 'SHIELD_ACTIVE' },
  },

  // ═══════════════════════════════════════════════════════════
  // Level 7: 护盾激活时序
  // Teaches: SHIELD_TIMING — shield activates during damage resolution step
  // Prerequisites: CHARGE_SHIELD, POWER_COMPARISON
  //
  // Design: Player uses 集气护盾 (speed 3) → gains shield before enemy's
  // speed-1 slash. Shield absorbs during the damage resolution phase.
  // Player observes: shield gained at speed 3, consumed during speed 1
  // damage resolution. Shield is NOT pre-set — player must actively charge.
  // ═══════════════════════════════════════════════════════════
  tutorial_shield_timing: {
    levelId: 'tutorial_shield_timing',
    index: 6,
    title: '教学 7/9：护盾激活时序',
    completionText: '模块 7 完成',
    finalCompletionText: '护盾时序完成',
    teaches: [MechanicID.SHIELD_TIMING],
    prerequisites: [MechanicID.CHARGE_SHIELD, MechanicID.POWER_COMPARISON],
    unlocks: ['tutorial_rage_absorption'],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '法师',
    playerRoleId: 'mage_hermit',
    playerLoadoutSkillIds: ['mage_gather'],
    playerRoleLoadoutSkillIds: [],
    // No pre-set shield — player must ACTIVELY use 集气护盾 to gain it
    playerResources: {},
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: ['warrior_slash'],
      roleLoadoutSkillIds: [],
      position: { q: 1, r: 0 },
      resources: {},
      displayName: '训练敌人',
    },
    initialStepId: 'select_action',
    steps: {
      select_action: {
        objective: '使用集气护盾（速度3）。敌人将用斩击（速度1）攻击你。',
        allowedSkillIds: ['mage_gather'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合，观察护盾在伤害结算时如何生效。',
        allowedSkillIds: ['mage_gather'],
      },
    },
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
    ],
    _winCheck: 'shield_timing',
    _checkParams: { expectShieldAbsorb: true, expectLogOrder: ['damage_applied', 'damage_absorbed'] },
  },

  // ═══════════════════════════════════════════════════════════
  // Level 8: 怒气抵消
  // Teaches: RAGE_ABSORPTION — rage = reactive damage buffer
  //           + 盛怒 mechanic: being hit prevents rage generation
  // Prerequisites: SHIELD_TIMING
  //
  // Design: Player stands passively and takes hits. Player uses 盛怒 (warrior_rage)
  //   each turn to learn the "被打不集气" mechanic.
  //   Turn 1: Player uses 盛怒. Enemy slashes → 2 rage absorbs all 100 damage →
  //           player survives. But 盛怒 is cancelled (hit prevents rage gain).
  //   Turn 2: Player uses 盛怒. Enemy waits → not hit → EOT: gain 2 rage.
  // Player observes: rage absorption saves them, and 盛怒 only works when NOT hit.
  // ═══════════════════════════════════════════════════════════
  tutorial_rage_absorption: {
    levelId: 'tutorial_rage_absorption',
    index: 7,
    title: '教学 8/9：怒气抵消',
    completionText: '模块 8 完成',
    finalCompletionText: '怒气机制完成',
    teaches: [MechanicID.RAGE_ABSORPTION],
    prerequisites: [MechanicID.SHIELD_TIMING],
    unlocks: ['tutorial_comprehensive'],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '战士',
    playerRoleId: 'warrior_vanguard',
    // warrior_rage: 盛怒 (speed 3, cost 0, SELF) — sets pendingRage flag
    // Start with 2 rage — enough to fully absorb one 100-power slash (2×50=100)
    playerLoadoutSkillIds: ['warrior_rage'],
    playerRoleLoadoutSkillIds: [],
    playerResources: { rage: 2 },
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      // Turn 1: warrior_slash (attack). Turn 2: tutorial_dummy_wait (wait).
      loadoutSkillIds: ['warrior_slash', 'tutorial_dummy_wait'],
      roleLoadoutSkillIds: [],
      position: { q: 1, r: 0 },
      resources: {},
      displayName: '训练敌人',
    },
    initialStepId: 'select_rage',
    steps: {
      select_rage: {
        objective: '你拥有2点怒气。使用盛怒后站住挨打，观察怒气如何抵消伤害。',
        allowedSkillIds: ['warrior_rage'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合，观察怒气抵消与盛怒被打断。',
        allowedSkillIds: ['warrior_rage'],
      },
    },
    // Turn 1: enemy attacks — player's rage absorbs, player survives, 盛怒 cancelled
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
    ],
    // Multi-turn: turn 2 — player uses 盛怒 again, enemy waits, rage gained
    _multiTurn: true,
    _turnScripts: {
      2: {
        playerStepId: 'turn2_select',
        playerSteps: {
          turn2_select: {
            objective: '上一回合被击中，盛怒未触发。再次使用盛怒，敌人将等待。',
            allowedSkillIds: ['warrior_rage'],
            nextStepId: 'turn2_await',
          },
          turn2_await: {
            objective: '行动已提交。点击执行回合，观察未被击中时盛怒的效果。',
            allowedSkillIds: ['warrior_rage'],
          },
        },
        enemyActions: [
          { charId: 'tutorial_enemy', skillId: 'tutorial_dummy_wait', targetPos: null },
        ],
        winCheck: 'rage_absorption',
        checkParams: { expectRageGained: true },
      },
    },
    _winCheck: 'rage_absorption',
    _checkParams: { expectRageMitigation: true },
  },

  // ═══════════════════════════════════════════════════════════
  // Level 9: 综合战斗
  // Teaches: ACTION_PIPELINE — declare → cost → resolve → effects → feedback
  // Prerequisites: RAGE_ABSORPTION
  //
  // Design: 3-turn comprehensive battle. All mechanics converge.
  // Turn 1: Player charges shield (mage_gather). AI attacks → shield absorbs.
  // Turn 2: Player attacks back. Enemy gains rage and counter-attacks.
  // Turn 3: Full resource loop visible in replay.
  // Combat log must contain ≥2 types of effects (damage, status, resource, move).
  // Replay must show the full pipeline: declare → cost → movement → damage → status.
  // ═══════════════════════════════════════════════════════════
  tutorial_comprehensive: {
    levelId: 'tutorial_comprehensive',
    index: 8,
    title: '教学 9/9：综合战斗',
    completionText: '全部教学完成',
    finalCompletionText: '全部教学完成！',
    teaches: [MechanicID.ACTION_PIPELINE],
    prerequisites: [MechanicID.RAGE_ABSORPTION],
    unlocks: [],
    playerCharacterId: 'tutorial_hero',
    allowedCharacterIds: ['tutorial_hero'],
    playerStartPos: { q: 0, r: 0 },
    playerClass: '法师',
    playerRoleId: 'mage_hermit',
    playerLoadoutSkillIds: ['mage_gather', 'mage_blast', 'mage_small_qi_blast'],
    playerRoleLoadoutSkillIds: [],
    // Starting qi for attacks. Shield comes from using 集气护盾 (Turn 1).
    playerResources: { qi: 3 },
    enemy: {
      id: 'tutorial_enemy',
      teamId: 'tutorial_enemies',
      ownerId: 'tutorial_enemy',
      control: 'ai',
      class: '战士',
      roleId: 'warrior_vanguard',
      loadoutSkillIds: ['warrior_slash', 'warrior_move'],
      roleLoadoutSkillIds: [],
      position: { q: 2, r: 0 },
      resources: { rage: 2 },
      displayName: '训练敌人',
    },
    initialStepId: 'select_action',
    steps: {
      select_action: {
        objective: '综合战斗。自由使用技能，观察完整战斗流程。',
        allowedSkillIds: ['mage_gather', 'mage_blast', 'mage_small_qi_blast'],
        nextStepId: 'choose_target',
      },
      choose_target: {
        objective: '选择目标。',
        submitTargetMessage: '选择目标。',
        allowedSkillIds: ['mage_gather', 'mage_blast', 'mage_small_qi_blast'],
        nextStepId: 'await_execute',
      },
      await_execute: {
        objective: '行动已提交。点击执行回合。',
        allowedSkillIds: ['mage_gather', 'mage_blast', 'mage_small_qi_blast'],
      },
    },
    // Turn 1: enemy moves toward player and attacks
    scriptedEnemyActions: [
      { charId: 'tutorial_enemy', skillId: 'warrior_move', targetPos: { q: 1, r: 0 } },
    ],
    // Multi-turn: turns 2+ escalate
    _multiTurn: true,
    _turnScripts: {
      2: {
        playerStepId: 'turn2_action',
        playerSteps: {
          turn2_action: {
            objective: '第2回合。继续战斗，观察技能管线的每个阶段。',
            allowedSkillIds: ['mage_gather', 'mage_blast', 'mage_small_qi_blast'],
          },
        },
        enemyActions: [
          { charId: 'tutorial_enemy', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
        ],
      },
      3: {
        playerStepId: 'turn3_action',
        playerSteps: {
          turn3_action: {
            objective: '最终回合。击败敌人以完成全部教学。',
            allowedSkillIds: ['mage_gather', 'mage_blast', 'mage_small_qi_blast'],
          },
        },
        enemyActions: [
          { charId: 'tutorial_enemy', skillId: 'warrior_slash', targetPos: { q: 0, r: 0 } },
        ],
      },
    },
    _winCheck: 'comprehensive',
    _checkParams: {
      requireMultipleEffectTypes: true,
      minEffectTypes: 2,
      requirePipelineComplete: true,
    },
  },
};

// ─── Queries ───

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

// ─── DAG navigation (replaces linear nextLevelId in new code) ───

/**
 * Get modules that are unlocked by completing the given module.
 * Returns an array of levelIds, or empty if terminal.
 */
export function getUnlockedModules(levelId) {
  const level = getTutorialLevel(levelId);
  return level?.unlocks || [];
}

/**
 * Get all modules that teach a specific mechanic.
 */
export function getModulesByMechanic(mechanicId) {
  return Object.values(TUTORIAL_LEVELS)
    .filter(l => (l.teaches || []).includes(mechanicId))
    .map(l => l.levelId);
}

/**
 * Get all mechanics the player has been taught, given a set of completed levels.
 */
export function getTaughtMechanics(completedLevelIds) {
  const mechanics = new Set();
  for (const id of completedLevelIds) {
    const level = getTutorialLevel(id);
    if (level) {
      for (const m of (level.teaches || [])) {
        mechanics.add(m);
      }
    }
  }
  return [...mechanics];
}
