# Changelog

## 2026-05-28 — 战士技能重做 + 法师新技能 + 弹体/UI改进

- **居合斩**: 消耗纳刀强化为范围2/cost0, 否则范围1/cost3
- **纳刀**: 斩破弹体获得永久buff (不再限1回合)
- **御剑**: 速度 3→2
- **新技能 折返跃迁**: 瞬移1格, 回合结束返回原位, 速3/cost0
- **反应装甲**: 改为半径1展开7个静止弹体 (SPAWN_STATIONARY_AOE + includeCenter)
- **弹体碰撞**: 大威力弹体贯穿不再降威 (移除 power -= weak.power)
- **无情铁手**: 修复打断不生效 (cancelByActor 同步过滤 speedGroups)
- **动画**: 修复跨步骤重复帧 (非首步骤跳过 sub=0)
- **UI**: 同格角色分显+p1/p2角标, 对手技能查看, 非法格点击取消选择
- 新增 RoleData.js + role_loadout_test.js
- 新增 CLAUDE.md (项目规范 + 分支管理规则)
- 新增 CHANGELOG.md (本文件)
- 移除 ARCHITECTURE.md / RETROSPECTIVE.md
