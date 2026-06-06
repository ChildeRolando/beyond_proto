你这个判断是对的，而且这是**模式架构问题**，不是简单改按钮名字。

现在代码里主页是：

```text id="xzdw9y"
PVE 模式
本地游玩
P2P 联机
```

`btn-pve` 直接走 `onStartPve()`，而 `onStartPve()` 当前会进入 `configSession.showConfigScreen('pve')`。这就把“本地单人 PVE”和“多人/合作 PVE”混成了同一个模式。 

应该改成这个模式树：

```text id="vujd1i"
主页：
1. 本地对战
   - local duel
   - 本机双人/双方都由本地配置

2. 本地单人
   - local solo
   - 1 名玩家角色 vs 1 名 AI 敌人
   - 保留原单人 PVE 逻辑

3. P2P 模式
   子选项：
   a. 联机对战
      - 现有 P2P 1v1
   b. 合作闯关
      - 未来 P2P coop PVE
      - 多玩家/多角色/AI 敌人/关卡系统
```

现在已经完成的 2v2 roster PVE，概念上更接近 **合作闯关的战斗内核**，不应该继续挂在主页独立的 “PVE 模式” 上。

---

# 下一轮 TDD 工程 Prompt：模式导航拆分

```text id="mode-split-tdd-prompt"
你现在接手 GitHub 仓库 ChildeRolando/beyond_proto。

本轮目标：
修正主页模式结构，将当前混用的 PVE 模式拆分为：
1. 本地对战
2. 本地单人
3. P2P 模式
   - 联机对战
   - 合作闯关

背景：
当前主页有 btn-pve / btn-local / btn-p2p。
当前 btn-pve 直接进入 configMode='pve'，但这个 pve 现在被用于 2v2 roster PVE，语义上混淆了：
- 本地单人 PVE
- 多人/合作 PVE

本轮只做模式拆分和导航语义修正。

本轮不做：
1. 不做完整合作闯关。
2. 不做 P2P coop 网络协议。
3. 不做奖励系统。
4. 不做 Encounter 流程。
5. 不重写 AI。
6. 不重写配置 UI。
7. 不删除现有 2v2 roster scenario builder。

核心设计：
使用更明确的 mode taxonomy：

- local
  表示本地对战，本地双人/双方本地配置。

- solo
  表示本地单人，1 名玩家角色 vs 1 名 AI。
  这是原来的单人 PVE。
  不使用 2v2 roster hero slots。

- p2p
  表示联机对战，现有 P2P 1v1。

- coop
  表示合作闯关。
  本轮先作为 P2P 子选项入口，可以进入占位提示或复用现有 roster config，但必须和 local solo 分离。
  如果 coop 还没实现网络逻辑，按钮应该显示“开发中”或进入静态占位，不要假装已完成 P2P coop。

========================
需要改的 UI
========================

index.html 当前主页按钮应改为：

1. btn-local-duel：本地对战
2. btn-local-solo：本地单人
3. btn-p2p：P2P 模式
4. btn-tutorial：新手教学

P2P 模式点击后显示子菜单：

- btn-p2p-duel：联机对战
- btn-p2p-coop：合作闯关

推荐结构：

<div id="p2p-mode-menu" style="display:none">
  <button id="btn-p2p-duel">联机对战</button>
  <button id="btn-p2p-coop">合作闯关</button>
  <button id="btn-p2p-back">返回</button>
</div>

现有 room setup 只应该在点击 “联机对战” 后显示。
合作闯关本轮可以：
- 显示 “合作闯关开发中”
或
- 进入 coop config placeholder
但不要走现有 p2p duel room flow。

========================
需要改的 AppRuntime / StartLobbyController
========================

StartLobbyController 现在监听：
- btn-local
- btn-pve
- btn-p2p

需要改成：
- btn-local-duel -> callbacks.onStartLocalDuel()
- btn-local-solo -> callbacks.onStartLocalSolo()
- btn-p2p -> 显示 P2P 子菜单
- btn-p2p-duel -> 显示 room setup，并设置 p2pMode='duel'
- btn-p2p-coop -> callbacks.onStartP2PCoop() 或显示开发中

AppRuntime callbacks 建议：

onStartLocalDuel() {
  networkSession?.disconnect();
  configSession.resetPlayerConfigs();
  setBattleHeader('本地对战', 'local', false);
  configSession.showConfigScreen('local');
}

onStartLocalSolo() {
  networkSession?.disconnect();
  configSession.resetPlayerConfigs();
  setBattleHeader('本地单人', 'local', false);
  configSession.showConfigScreen('solo');
}

onStartP2PDuel() {
  show room setup
}

onStartP2PCoop() {
  networkSession?.disconnect();
  setBattleHeader('合作闯关', 'p2p', false);
  // 本轮不要假装网络合作已完成
  // 可以显示 room setup disabled / 开发中提示
}

重要：
- 不要再用 configMode='pve' 表示本地单人。
- 如果当前 2v2 roster PVE 仍需要保留，建议重命名为 configMode='coop' 或 'roster_pve'，不要占用 'solo'。

========================
ConfigSessionController 修改
========================

新增 configMode='solo'。

solo 模式行为：
- 只配置 player1。
- player2 使用默认 AI 敌人配置。
- canStartBattle() 在 solo 模式下只要求 player1 locked。
- build/start 时走旧 1v1 initBattle：
  {
    players: [player1Config, defaultAiConfig],
    seed
  }
  或直接使用 existing startBattleFromConfigs。

保留当前 roster PVE builder，但改名/隔离：
- 当前 pve hero slots 逻辑不应该叫 pve。
- 建议改成 coop / roster_pve。
- 本轮如果不想大改内部命名，至少 UI 不要暴露成“本地单人”。

推荐短期做法：
- configMode='solo'：本地单人 1v1。
- configMode='pve' 暂时保留给当前 2v2 roster internal tests，但 UI 不直接进入。
- 后续再把 configMode='pve' 重命名为 'coop'。

========================
BattleSessionController 修改
========================

isPveMode 需要更明确：

当前 isPveMode 可能是：
configSession.getConfigMode() === 'pve'

应改成类似：

const isAiControlledMode = () =>
  ['solo', 'pve', 'coop'].includes(configSession?.getConfigMode())

但是不要让 solo 走 2v2 roster AI。
solo 应该：
- player1 是玩家
- player2 是 AI
- submitAiAndExecutePveTurn 仍可工作，因为旧 1v1 PVE fallback 使用 player2。

如果当前 submitAiAndExecutePveTurn 已支持 fallback 到 player2，就可以复用。

========================
先写测试
========================

新增测试文件 1：

tests/mode_navigation_static_test.mjs

测试目标：
- index.html 不再有 standalone btn-pve。
- index.html 有：
  - btn-local-duel
  - btn-local-solo
  - btn-p2p
  - btn-p2p-duel
  - btn-p2p-coop
- StartLobbyController.js 绑定这些按钮。
- AppRuntime.js 有 onStartLocalDuel / onStartLocalSolo / onStartP2PDuel / onStartP2PCoop。
- AppRuntime.js 不再把 btn-pve 作为主入口。

新增测试文件 2：

tests/solo_config_session_test.js

测试目标：
- ConfigSessionController.showConfigScreen('solo') 后：
  - currentConfigPlayer === 'player1'
  - activeConfig 是 player1
  - canStartBattle 只取决于 player1 locked
  - player2 可以不 locked

测试内容：
1. create fake ctx。
2. showConfigScreen('solo')。
3. player1 未锁定时 canStartBattle=false。
4. toggleLockCurrent() 锁定 player1。
5. canStartBattle=true。
6. getBattlePlayerConfigs() 返回 player1 + player2。
7. player2 默认作为 AI 敌人配置存在。

新增测试文件 3：

tests/solo_pve_session_test.js

测试目标：
- 本地单人模式仍能 1v1 AI 执行。

测试内容：
1. 构造 BattleSessionController fake callbacks：
   getConfigMode: () => 'solo'
   isPveMode / isAiMode: () => true
2. 用 startBattleFromConfigs 初始化 player1/player2。
3. player1 提交行动。
4. submitAiAndExecutePveTurn()。
5. 断言 turn 推进到 2 或 battleEnded。
6. 断言没有 not_all_submitted。

新增测试文件 4：

tests/p2p_mode_menu_static_test.mjs

测试目标：
- 点击 P2P 模式应该先进入子菜单，而不是直接 room setup。
- room setup 只由 btn-p2p-duel 触发。
- btn-p2p-coop 存在并有明确 handler。
- coop 如果开发中，应有文案或 callback。

========================
TDD 执行顺序
========================

1. 检查工作区：
git status --short

2. 新建分支：
git checkout -b feature/mode-navigation-split

3. 先写测试：
node tests/mode_navigation_static_test.mjs
node tests/solo_config_session_test.js
node tests/solo_pve_session_test.js
node tests/p2p_mode_menu_static_test.mjs

确认失败。

4. 修改 index.html：
- 移除/废弃 btn-pve。
- btn-local 改为 btn-local-duel。
- 新增 btn-local-solo。
- P2P 新增子菜单 p2p-mode-menu。
- room setup 只作为 P2P duel 的下一层。

5. 修改 StartLobbyController.js：
- 重绑新按钮。
- P2P 主按钮只显示子菜单。
- P2P duel 才显示 room setup。
- P2P coop 调 callback 或显示开发中文案。

6. 修改 AppRuntime.js：
- callbacks 拆成 onStartLocalDuel / onStartLocalSolo / onStartP2PDuel / onStartP2PCoop。
- isPveMode 或 AI mode guard 支持 solo。
- configSession.showConfigScreen('solo') 用于本地单人。

7. 修改 ConfigSessionController.js：
- 支持 configMode='solo'。
- solo 下 canStartBattle 只要求 player1 locked。
- showConfigScreen('solo') currentConfigPlayer='player1'。
- 不影响 local / p2p / pve roster tests。

8. 跑新增测试直到通过。

9. 跑已有 PVE/roster 测试：
node tests/pve_scenario_builder_test.js
node tests/pve_config_session_test.js
node tests/pve_roster_battle_session_test.js
node tests/pve_multi_ai_session_test.js

10. 跑多人基础测试：
node tests/battle_scenario_test.js
node tests/pve_multiroster_test.js
node tests/team_victory_test.js
node tests/hate_system_test.js
node tests/team_ai_controller_test.js
node tests/target_policy_test.js

11. 跑核心回归：
node tests/skill_test.js
node tests/role_loadout_test.js
node tests/role_mechanics_test.js
node tests/ai_controller_test.js

12. 更新 CHANGELOG.md：
- Split top-level PVE into local solo and future P2P coop.
- Added explicit homepage mode navigation.
- Added solo config mode.
- Preserved local duel and P2P duel.
- Added navigation/static and solo PVE tests.

13. 提交：
commit message:
模式导航重构：拆分本地单人与P2P合作闯关入口

========================
验收标准
========================

必须满足：

1. 主页按钮为：
- 本地对战
- 本地单人
- P2P 模式
- 新手教学

2. P2P 模式点击后出现：
- 联机对战
- 合作闯关

3. 联机对战走现有 room setup。

4. 合作闯关不再混用本地 PVE。
如果 coop 未完成，应明确显示开发中或 disabled。

5. 本地单人走 solo mode：
- 只需要配置 player1。
- player2 默认 AI。
- player1 提交后 AI 自动行动。
- 不进入 2v2 roster hero slot 配置。

6. 当前 2v2 roster PVE 测试仍通过。
但 UI 暂时不应把它叫“本地单人”。

7. 旧本地对战 / P2P 对战不破坏。

最终报告必须包含：
1. 修改文件列表。
2. 新增测试列表。
3. 执行过的测试命令。
4. 通过/失败情况。
5. 当前 coop 闯关是否只是占位。
```

重点：**现在不要继续把 2v2 roster PVE 放在主页 PVE 下面。**
正确做法是先把“本地单人”和“P2P 合作闯关”的入口拆开；合作闯关可以先占位，后面再接 Encounter 和 P2P coop 协议。
