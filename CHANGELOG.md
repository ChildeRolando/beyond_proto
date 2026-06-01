# Changelog

## 2026-06-01 - 配置页主图切回完整立绘

- 配置界面的中央主图改为读取 `assets/character-portraits/originals/*.png`，列表缩略图继续使用 `assets/character-portraits/icons/*.png`。
- 新增回归测试，断言主图与缩略图分别来自完整立绘和头像图标目录，避免后续回退。

## 2026-06-01 - 战斗界面角色头像

- 配置界面角色立绘改为读取 `assets/character-portraits/icons/*.png`，与新裁切头像保持一致。
- 对战界面 hex 地图单位图标从职业单字改为角色头像，优先按 `roleId` 读取头像图，缺图时回退到原职业字母。
- 战斗头像增加缓存版本号，避免浏览器继续命中旧资源。
- 新增 `tests/battle_canvas_renderer_test.js` 覆盖 hex 单位头像渲染路径。

## 2026-05-31 - Strong-agent architecture recovery

- Split config ownership into `ConfigSessionController` and network/P2P ownership into `NetworkSessionController`.
- Kept the split safe by wiring config/network through AppRuntime providers and callbacks instead of direct imports.
- Moved battle canvas drawing into `BattleCanvasRenderer` and `VisualEffects`.
- Tightened architecture coverage with new config/network and canvas split tests.
- Added browser coverage for config flow, network flow, and canvas rendering.
- Updated the final architecture report and confirmed the full Playwright suite passes.

## 2026-05-29 - AI ????????

- `AiController.chooseAiAction()` ?????????????? 15 ???????????????????? fallback??? PVE ?????
- ?? fallback ?? `timedOut` / `searchError` ?????? AI ????????? AI ??????????????
- ?????????????????????????AI controller ???? 15 ???? 0.1 ???
- `tests/ai_controller_test.js` ???? fallback ?????`tests/pve_ui_static_test.mjs` ?? CRLF ????????? master ?????

## 2026-05-28 — 吉米呼吸法+洗髓实装 & 燕双鹰死亡如风

- **吉米 呼吸法**: 每回合开始时（清理阶段后/战斗初始化时）根据奇偶切换[吸]/[呼]状态，在行动选择前即生效，通过 `ON_RESOURCE_GAIN` ±1怒气、`ON_RANGE_CALCULATE` ±1攻击距离
- 修复呼吸法时机：从 `executeTurn` 开始移至回合清理后 `turnNumber++` 处，并新增 `initRolePassives()` 在 `initBattle` 时初始化首回合buff，确保玩家选择行动前buff已生效
- **吉米 易经洗髓酒**: 回合清理阶段自动检测怒气阈值(6/8/10/12)，达标则扣除怒气并依次获得永久强化：怒气获得+1 / 攻击距离+1 / 移动距离+1 / 威力+100
- 新增三个Hook: `ON_RANGE_CALCULATE`、`ON_MOVE_RANGE_CALCULATE`、`ON_POWER_CALCULATE`，统一由 BuffManager 提供 `getEffectiveRange/getEffectiveMoveRange/getEffectivePower` 便捷方法
- TurnManager 攻击执行器（近战/弹体/AOE/静止AOE）均调度 ON_POWER_CALCULATE；移动执行器调度 ON_MOVE_RANGE_CALCULATE
- GameEngine.getValidMoves/getValidTeleports 自动应用有效移动距离；index.html UI 目标选择使用 `engine.getEffectiveRange()`
- **燕双鹰 死亡如风**: 新增被动特质 `YAN_DEATH_WIND`，对手攻击落空时获得1弹并自动装填（不占行动），通过 `ON_ATTACK_MISSED` hook 触发
- TurnManager 在近战/AOE 攻击落空后立即调度 ON_ATTACK_MISSED，弹体攻击在 resolveStep 后批量检查落空
- 更新 `role_mechanics_test.js` 断言（呼吸法+1怒气）
- 回归验证已通过：`node tests/role_mechanics_test.js`、`node tests/role_loadout_test.js`、`node tests/skill_test.js`、`node test_signaling.js`、`node test_e2e.mjs`

## 2026-05-28 — 法师技能图标集成

- 24个法师技能在 SkillData.js 中统一添加 `icon` 字段，指向 `assets/skill-icons/mage/<id>.png`
- `skillGlyph()` 自动读取 `skill.icon`，有图标显示图片，无图标回退文字首字
- action dock 技能按钮图标 `object-fit: cover` 铺满，去 padding
- deploy.sh / deploy.bat 加入 `assets/` 目录
- 战士/射手出图标后只需在 SkillData 加 `icon` 字段

## 2026-05-28 - 四个角色首版战斗机制

- 吉米 `易经洗髓酒` 不再是占位：发动后获得 2 怒气和永久 `JIMMY_MARROW` 成长标记。
- 新增 `ActionPointSystem`：每名角色每回合有 1 个主行动；枪侠通过 `灵巧` 特质每回合额外获得 1 个 cost0 行动，cost0 先交也不会阻止后续付费主行动。
- 枪侠 `灵巧行动` 改为被动特质，不再作为主动技能出现在战斗技能栏，也不能直接提交。
- 绝地潜兵 `呼叫补给` 获得背包弹药 +2，`精准轰炸` 改为目标点周围 1 格的静止 AOE，绝地潜兵每回合清理阶段自动获得 1 弹药。
- 燕双鹰 `我赌你的枪里没有子弹` 不再是占位：标记目标并在其攻击命令执行前取消攻击；已支付费用不返还。
- P2P 回合协议拆分为多条 `TURN_ACTION` 和一次 `TURN_READY`，支持同一角色在行动点允许时提交多个技能。
- 新增 `tests/role_mechanics_test.js` 覆盖四个角色机制和枪侠行动点规则，并更新 `tests/role_loadout_test.js` 的角色技能断言。
- 回归验证已通过：`node tests/role_mechanics_test.js`、`node tests/role_loadout_test.js`、`node tests/skill_test.js`、`node test_signaling.js`、`node test_e2e.mjs`。

## 2026-05-28 - 战斗页 UI 指挥台改造

- 战斗页改为“棋盘优先”布局：中央棋盘扩大，左侧默认不常驻信息栏。
- 新增底部 `action-dock` 作为主控 UI，集中显示当前行动角色、资源、技能、目标提示和执行按钮。
- 新增左侧 `selected-unit-drawer`，点击棋盘角色后展开，仅用于查看角色详情、特质、Buff 和技能列表，不承担主操作。
- 新增右侧 `hover-inspector`，显示上一名指针停留角色的状态；日志和聊天改为右侧 tabs。
- 修正 selected drawer 与底部 action dock 的重叠问题，并新增关闭按钮。
- selected drawer 的技能列表现在可点击查看技能范围，但不会提交行动。
- hover inspector 改为只显示角色状态，不再显示技能列表。
- action dock 技能改为图标按钮，只显示技能首字、费用和速度；悬停时显示自定义技能详情浮层。
- 更新 P2P E2E 断言，覆盖 action dock、selected drawer、hover inspector、log/chat tabs，并适配新棋盘尺寸。
- 回归验证已通过：`node test_e2e.mjs`、`node tests/role_loadout_test.js`、`node tests/skill_test.js`、`node test_signaling.js`。

## 2026-05-28 - 角色选择配置页 + 技能带入 + P2P 配置同步

- 新增三段路由流程：`start -> config -> battle`，本地游玩和 P2P 加入后先进入出战配置页，再初始化战斗。
- 新增配置页 UI：顶部职业标签，中部 3 张角色卡轮播和悬停详情，底部可展开的 8 格技能带入配置模块。
- 本地模式支持 P1/P2 切换配置；P2P 模式仅允许编辑自己，同时展示对手职业、角色、带入摘要和锁定状态。
- P2P 开局协议改为 `CONFIG_UPDATE`、`CONFIG_LOCK`、`BATTLE_START`；房主在双方锁定后发送最终 seed 和双方完整配置。
- 结算后的重赛入口改为回到 `config` 页面，保留上一局配置继续调整。
- 战斗 UI 使用 `engine.getState().characters[].skills` 渲染最终技能列表，支持角色专属技能 + 带入技能；角色特质展示在战斗面板。
- `test_e2e.mjs` 已更新为独立脚本形式的新流程验证：创建房间、进入配置页、双方锁定、进入战斗、提交并执行一回合。
- 回归验证已通过：`node tests/role_loadout_test.js`、`node tests/skill_test.js`、`node test_signaling.js`、`node test_e2e.mjs`。
- 注意：`test_e2e.mjs` 不是 Playwright test spec，应使用 `node test_e2e.mjs`，不要用 `npx playwright test test_e2e.mjs`。

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
