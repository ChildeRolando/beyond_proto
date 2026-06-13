# Changelog

## 2026-06-14 - o7.1: 删除 animStep/subT 协议

- `BattleRenderCoordinator.renderAll(animStep = -1, subT = 0)` → `renderAll()`，移除 animStep/subT 参数和 if/else 分支，始终调用 `renderLiveScene?.()`。
- 移除 coordinator 中对 `renderBoard(animStep, subT, { state, renderView, engine })` 的 legacy fallback 调用。
- `AppRuntime.js` line 206 `renderAll: (s, sub)` → `renderAll: ()`。
- `BattleLifecycleService.js` `renderAll(-1, 0)` → `renderAll()`。
- `BattleCanvasRenderer.renderBoard(animStep = -1, subT = 0, legacyView = null)` → `renderBoard(legacyView = null)`。
- 移除 renderBoard 内部的 `if (animStep >= 0)` keyframe 动画分支（保留静态渲染路径）。
- 移除 renderBoard 内部的 `if (animStep >= 0)` animEvents 渲染分支。
- 移除 renderBoard 中对 `drawProjectileTrail(projId, pos, animStep, keyframes)` 的调用。
- keyframes/animEvents 变量声明保留为 dead legacy fields（留给 Task 7.2）。
- 新增 `tests/no_anim_step_subt_protocol.spec.js`（47 assertions, 8 组）。
- 更新 `tests/no_old_turn_playback_controller.spec.js` Test 7b/7c（断言新签名）。
- 更新 `tests/live_scene_pipeline_contract.spec.js` Test 7/8（移除 legacy fallback 测试）。
- 更新 `tests/battle_canvas_renderer_scene_contract.spec.js` Test 12（renderBoard 新签名）。
- 更新 `tests/battle_canvas_renderer_test.js`（renderBoard 新签名）。
- 更新 `tests/battle_session_no_playback_render_state.spec.js` Test 4b（coordinator 不再有 engine.getState fallback）。
- 更新 `tests/architecture/app-runtime-composition.spec.js` 和 `canvas-renderer-split.spec.js`（coordinator 不再调用 renderBoard）。
- 全 13 个 Node 测试套件通过（~1046 pass），Playwright 398 pass（10 pre-existing failures）。

## 2026-06-13 - o6.4: 删除旧 TurnPlaybackController

- 删除 `app/TurnPlaybackController.js` 文件。
- AppRuntime 移除 `import { createTurnPlaybackController }`、`let turnPlaybackController`、`createTurnPlaybackController({...})` 块。
- BSC callbacks 移除 `animateTurn`（preview 分支优先 `playTurnResolution`），`resetResolutionPlayback` 改为新 pipeline（`playbackRuntime.stop` + `setPlaybackFrame(null)` + `timelinePanel.reset`）。
- NetworkSessionController callbacks 移除 `animateTurn`。
- RuntimeTestHooks 移除 `getTurnPlaybackController` 参数及所有旧 controller 引用（`skipPlayback` fallback、`getTimelineState` bridge、`isInputLocked` old check）。
- 新增 `tests/no_old_turn_playback_controller.spec.js`（57 assertions, 9 组）。
- 更新 `tests/app_runtime_playback_pipeline.spec.js`（Test 1b/8 改为断言旧 controller 已删除）。
- 更新 `tests/battle_session_no_playback_render_state.spec.js`（Test 5 改为断言文件已删除）。
- 全 12 测试套件通过（Node: ~994 pass, Playwright: ~400 pass）。

## 2026-06-13 - o6.3: BSC 删除 playback render state

- 从 `BattleSessionController` 删除 `_resolutionPlaybackState`、`getRenderState()`、`setResolutionPlaybackState()`、`clearResolutionPlaybackState()`。
- 保留 input lock：`_resolutionPlaybackLocked`、`isResolutionPlaybackActive()`、`setResolutionPlaybackLocked(locked)`。
- `getBattlePanelsContext()` 和 `getViewState()` 改为使用 `this.getState()`。
- `BattleRenderCoordinator` 两处 fallback 改为 `engine?.getState?.()` 优先，不再依赖 `getRenderState`。
- `TurnPlaybackController` 移除 3 处 `setResolutionPlaybackState`/`getRenderState` 调用，保留 `setResolutionPlaybackLocked` + `renderAll`。
- `RuntimeTestHooks` 三处 `getRenderState` 改为 `engine.getState()`。
- 新增 `tests/battle_session_no_playback_render_state.spec.js`（35 assertions, 9 组 source scan）。
- 旧系统完整保留：TurnPlaybackController、renderBoard legacy、renderAll(animStep, subT)。

## 2026-06-08 - R1 审查修复：resultByAction 全量记录、真实同角色多攻击测试

- `resultByAction` 替代 `hitByAction`：记录 hit 和 miss 两种结果，同角色混合命中/挥空不再互相污染。
- event 有 actionId 时只按 actionId 匹配，不再 fallback 到 actorId。
- legacy 路径（event 无 actionId）保留 actorId fallback 用于兼容。
- `evt.actorId` → `hitByAction` key 不匹配问题已消除（移除错误 fallback）。
- 新增 `TurnManager.forceSubmitForTest`（绕过行动点验证）和 `__resolutionTest.executeRealTurnAndGetResolution`（在真实引擎上执行+录制）。
- Test 3 改为真实同角色双攻击：同一 attacker 发出两发 mage_blast（一发命中 target_hit，一发打空），断言 actionId 不同、结果分别为 hit/miss。
- `_checkWinCondition` 遵守 `rules.suppressGameOverPanel`，教程战斗日志不输出"战斗结束！胜者"。

## 2026-06-08 - 战斗日志与时间线一致性：共享TurnResolution事实

- 弹体携带 `actionId` 贯穿 `createProjectile` → `resolveStep` → `#lastHits`，使命中结果可按 actionId 精确匹配。
- 最终化阶段改为优先按 `actionId` 匹配，fallback 到 `actorId`，防止同一角色多段攻击共享结果。
- `_checkWinCondition` 读取 `rules.suppressGameOverPanel`，教程关卡不再在战斗日志中输出「战斗结束！胜者」。
- 新增 `forceSubmitAction`（直接调用 SkillResolver + CommandQueue，绕行动点验证）和 `multi_attack` 场景支持。
- 重写 `timeline_attack_result_truth.spec.js`（4 tests: 命中/击杀不显示挥空、真Miss显示挥空、多攻击独立结果、教程gameover抑制）。
- 开放测试门槛：`forceSubmitAction` 使单角色多攻击同速测试可行（未来可扩展 galaxy 多行动测试）。

## 2026-06-08 - 教程模式隔离、客观化关卡、训练稻草人与攻击结算修复

- 教程执行路径独立于PVE模式：`executeCurrentTurn` 优先检查 `isTutorialMode`，防止从 `local_solo` 残留的 config mode 污染教程路由。
- 教程关卡完成改为客观化检查：Lv1 需移动至目标格、Lv2 需攻击稻草人并命中、Lv3 需速度3移动至安全格且HP无损。
- 教程战斗不再弹出正常 gameover 面板：`rules.suppressGameOverPanel = true`，BATTLE_END 事件和 executeLocalTurn 均检查抑制。
- 新增训练稻草人单位（`tutorial_dummy`）和 `tutorial_dummy_wait`（什么都不做）技能，替代 Lv1/Lv2 的 `role_vanguard_breakline`。
- `normalizeCombatantConfig` 保留 `name`/`tutorialUnit` 字段使稻草人名称正确显示。
- 三栏布局：解析时间线独立纵栏（grid-col 2），右侧栏移至 grid-col 3。
- 修复攻击结算事件与时间线不一致的根本缺陷：近战/投射物/AOE攻击在弹体接触判定完成前不再预写入 `result="miss"`；改为先标记 `"pending"`，在弹体结算后根据 `lastHitByActor` 最终化。
- 弹体命中结果丰富化：`#lastHits` 携带 `targetName`/`killed`/`damage`，TurnResolution 事件携带 `targetId`/`targetName`/`killed`/`damage`。
- `summarizeActionEvents` 支持 `targetName` 和 `killed` 显示。
- 新增测试：`tutorial_mode_isolation.spec.js`（2 tests）、`tutorial_objectives.spec.js`（6 tests）、`timeline_attack_result_truth.spec.js`（3 tests: 命中非挥空/真是Miss/教程gamover抑制）。
- 更新 `resolution_timeline_layout.spec.js`（+2 tests: 非sidebar子元素/折叠语义）。

## 2026-06-08 - Turn Resolution Timeline 交互与模式分流修复

- 修复本地单人/本地合作模式分流：`local_solo` 保持 PVE / AI 对手，`local_coop` 保持纯 P1 vs P2，本地单人不再误进本地合作式战斗页。
- 将回放 dock 移到右侧战斗栏并改为纵向布局，加入收起/展开按钮，收起后不跳过回放且可重新打开。
- 结算时间轴改为按 `TurnResolution` phases 渲染动作卡片，显示头像、玩家标签、技能图标、技能名和结果摘要。
- 动作计数改为基于唯一 `actionId`，不再按结算事件条数统计；`End` 仅在所有 speed phase 完成后激活。
- 新增/更新 Playwright 覆盖：本地单人模式、timeline 布局、收起/展开、动作卡片、动作计数、phase 状态。

## 2026-06-08 - 教程返回大厅残留回归测试

- `tests/tutorial.spec.js`：补充第 3 关完成后点击 `tutorial-next` 的返回大厅回归，确认 `returnToStart` 会清掉 tutorial HUD、overlay 和战斗区。
- 已用 `npx playwright test tests/tutorial.spec.js` 验证 9/9 通过。

## 2026-06-08 - GameOverController 返回大厅走统一 ReturnToStartAction

- `ui/battle/GameOverController.js`：#btn-lobby 改为调用 `callbacks.returnToStart()`，不再手写 hide/resetNetworkState/setRoute/startLobbyUi 这套逻辑
- `app/AppRuntime.js`：returnToStart 改为 lazy 声明（`let returnToStart = () => {}`），先传给 initGameOverController，后用 `createReturnToStartAction` 赋值，保证单一统一入口
- `app/ReturnToStartAction.js`：清理逻辑已完备（battle session reset、tutorialManager reset、所有 overlay/hud 清理、route + startLobbyUi 重置）
- `tests/tutorial.spec.js`：新增 lobby 按钮清理所有 overlay 的测试（8 tests passed）
- `tests/architecture/battle-session-split.spec.js`：适配新的 lazy binding 模式

## 2026-06-07 - deploy.sh 差异部署加固

- `deploy.sh` 改为 marker + git diff 的差异化 SCP 部署，同时合并 staged、unstaged 和 untracked 文件，避免漏传未提交工作区修改。
- 上传列表和删除列表分离，远端目录创建、文件删除、重启调度和 marker 更新均失败即停止，避免失败部署误推进 `.deploy-marker`。
- 保留 `--assets` / `--full`，默认继续排除文档、图片资源、测试产物、`.claude/`、`node_modules/` 和 `ngrok.exe`。
- 新增 `tests/deploy_script_test.mjs`，用 dry-run 临时仓库覆盖 committed diff、dirty diff、删除、untracked 和排除规则。

## 2026-06-07 - 教程分支限流修复

- 修复 `BattleSessionController` 在非教学战斗里误用 `TutorialManager` 的问题，普通 PVE / 本地合作现在能正确渲染可操作角色和技能栏。
- 这次修复解除了一组 E2E 回归中的空 action dock 问题，已验证相关战斗与 PVE 配置测试通过。

## 2026-06-07 - AppRuntime 瘦身：拆分为 9 个模块

- `app/AppRuntime.js` 从 ~538 行降至 326 行（non-empty），恢复为纯 composition root。
- 新增模块：
  - `app/BattleRenderCoordinator.js` — 战斗 UI 渲染协调（renderPanels/renderLog/updateTurnUi/renderAll/resizeCanvas/showDisconnect 等）
  - `app/BattleLifecycleService.js` — 战斗生命周期管理（startBattleFromConfigs/startBattleFromScenario/animateTurn/executeCurrentTurn/resetCurrentBattle）
  - `app/StartModeActions.js` — 开始大厅模式切换动作
  - `app/ReturnToStartAction.js` — returnToStart 业务逻辑
  - `app/ConfigDomBindings.js` — 配置页 DOM 事件绑定
  - `app/BattleDomBindings.js` — 战斗页 DOM 事件绑定
  - `app/RuntimeDomDefaults.js` — DOMContentLoaded 默认服务器地址填充
  - `app/RuntimeTestHooks.js` — window.__testHooks / window.__tutorialTest / window.returnToStart 安装
  - `ui/battle/SkillRippleController.js` — 技能按钮水波纹效果
- 更新架构测试语义：renderBoard / renderBattlePanelsView / returnToStart 的断言跟随代码搬迁更新。
- 架构测试中 renderBoard 不再要求 AppRuntime 直接调用，改为检查 BattleRenderCoordinator。

## 2026-06-07 - 教程分支限流修复

- 修复 `BattleSessionController` 在非教学战斗里误用 `TutorialManager` 的问题，普通 PVE / 本地合作现在能正确渲染可操作角色和技能栏。
- 这次修复解除了一组 E2E 回归中的空 action dock 问题，已验证相关战斗与 PVE 配置测试通过。

## 2026-06-07 - 新手教学可玩化

- 新增可直接从开始页进入的真实教程战斗流程，`新手教学` 现在进入 Tutorial 1-3 的实战场景而不是规则弹窗。
- 教程 1、2、3 分别覆盖移动与执行回合、技能目标格、速度优先级，并通过稳定的 Playwright 测试 API 暴露状态。
- 保留了顶部栏 `?` 的旧规则说明弹窗入口，同时补充了教程 HUD、错误提示和关卡完成状态。

## 2026-06-07 - 技能文案收口

- 精简了部分技能描述中的重复前缀、职责说明和占位性表述，保持技能卡文案更贴近最终展示。

## 2026-06-07 - 引气针技能图标

- Added a dedicated `mage_qi_siphon` skill icon and wired 引气针 to use it instead of reusing 破气针.
- Recorded the 引气针 icon generation prompt in the skill icon prompt document.

## 2026-06-07 - 技能卡片数值显示调整

- 技能描述元数据中的默认 CD 和 cost 从 `无` 改为 `0`，保持数值化展示。
- 技能卡片右上角 cost 改为资源名加空格加数量，例如 `气 0`、`气 3`。
- 技能卡片底部信息从速度/CD/cost 改为 `CD状况` 和 `剩余发动次数`，未配置发动次数时显示 `∞`。
- `CD状况` 现在按 `剩余/总CD回合` 展示，例如 `0/3回合`。

## 2026-06-07 - 技能卡片预览复用

- 抽出共享技能卡片渲染与 hover tooltip 逻辑，让战斗行动栏和配置页技能池使用同一套技能说明框。
- 战斗页面左侧角色详情的技能列表改为紧凑内嵌技能卡，替代原来的技能名加纯文本描述。
- 配置页职业技能池、角色技能池和已装备技能槽支持悬停/聚焦显示卡片化技能预览，并移除原生 title 文本预览。

## 2026-06-06 - 技能提示卡片化

- 将战斗技能悬停提示从纯文本改为结构化卡片，展示技能图标、职业/类型、技能名、速度/CD/cost 和自然语言描述。
- Tooltip 现在从 `data-skill` 读取 canonical 技能数据并解析四行技能描述，正文保留自然语言，同时高亮范围、威力、资源、状态和数值关键词。
- 更新战斗界面 tooltip 样式为暗色技能说明框，并增加静态 UI 回归覆盖，防止退回纯文本渲染。

## 2026-06-06 - 启动页资源预热

- Added a shared asset preloader so battle skill icons and role portraits start loading from the start screen instead of waiting for the battle HUD to render.
- Shared the portrait image cache with `BattleCanvasRenderer` so preloaded role portraits are reused in battle instead of creating a fresh `Image` instance.
- Added regression coverage for asset URL collection, image cache reuse, and renderer cache reuse.

## 2026-06-06 - 技能文案单段化

- 技能描述改为四行展示格式：技能名、分隔线、速度/CD/cost 元数据、自然语言技能描述。
- `SkillData.desc` 在模块初始化时将旧的“技能概念 + 游戏作用 + 参数行”合并为自然语言描述，正文现在用“施法范围”区别施法距离，不再附加无伤害免责声明。
- 更新 `tests/skill_desc_format_test.js` 为新展示格式校验，并确保描述正文不再暴露“技能概念 / 游戏作用 / 范围 / 威力 / 速度 / 费用”结构标签。

## 2026-06-05 - 战斗 UI 视觉重塑

- Added `PRODUCT.md` to capture the combat engine's product register, users, tone, anti-references, and UI design principles.
- Reworked the start screen into a tactical mode-selection console with responsive layout, higher contrast, and reduced generic card styling.
- Restyled config, battle, sidebar, overlay, tutorial, and action dock surfaces around a dark tactical tabletop palette with cyan/amber combat-state accents.
- Added responsive CSS for narrow screens, reduced-motion fallbacks, visible focus states, and removed a stray CSS `</style>` token from `styles/overlays.css`.
- Verified the redesigned UI with static UI checks, PVE browser smoke coverage, rematch mode regression, and Playwright screenshots across desktop and mobile widths.

## 2026-06-03 - PVE AI autofill 与模式拆分


- Added simulation-only missing-actor autofill for one-ply AI evaluation so multi-roster PVE no longer falls back when extra alive actors have not yet submitted.
- Threaded autofill through one-ply ranking and team AI submission, and increased multi-roster PVE AI timeout to 15000ms.
- Split game modes into `local_duel`, `local_coop`, `local_solo`, `p2p_duel`, and `p2p_coop`, with legacy `local` / `pve` / `p2p` aliases normalized in the shared helper.
- Updated the start lobby and config flow to expose local duel, local coop, local solo, P2P duel, and disabled P2P coop entry points.
- Added regression coverage for multi-roster one-ply autofill, non-fallback team AI submission, mode normalization, local solo vs coop config behavior, local solo battle flow, and the new lobby UI.

## 2026-06-03 - PVE 2v2 roster 配置入口

- Added PVE roster scenario builder and fixed enemy presets for initial 2v2 battles.
- Added PVE hero slot configuration for `hero_1` and `hero_2`, including independent class/role/loadout state.
- Updated PVE config UI to switch between 英雄1/英雄2 and display fixed enemy presets read-only.
- Added `BattleSessionController.startBattleFromScenario()` and wired AppRuntime PVE start/reset through `pve_multi` scenarios.
- Added scenario builder, config session, roster battle session, static UI, and browser smoke coverage.

## 2026-06-03 - PVE 目标策略与友伤过滤

- Added team-aware target policy helpers with legacy ownerId fallback.
- Applied `friendlyFire=false` filtering to projectile body contact and AOE explosion hit resolution.
- Updated key TurnManager attack/control paths to use team-aware hit filtering instead of owner-only checks.
- Added target policy regression tests for projectile, projectile AOE, self AOE, path AOE, legacy 1v1, and `friendlyFire=true` policy behavior.
- Preserved legacy 1v1 hit behavior through teamId fallback to ownerId.

## 2026-06-03 - PVE 多敌人 AI 提交

- Added `HateSystem` for deterministic enemy-to-hero target assignment and dead-target refresh.
- Added `TeamAiController` to submit actions for multiple alive AI enemies through the existing one-ply AI.
- Updated PVE session flow to submit all alive AI enemies before executing a turn.
- Added tests for hate assignment, target refresh, team AI submissions, and PVE multi-AI session execution.
- Preserved legacy 1v1 AI behavior by keeping `AiController` as the single-actor decision path.

## 2026-06-03 - 行动提交状态命名

- Renamed the roster submission readiness API to `areAllAliveRequiredActorsSubmitted()`.
- Updated internal turn execution and AI/PVE tests to use the new all-alive-required-actors wording.
- Kept `isBothSubmitted()` as a compatibility alias for older callers.

## 2026-06-03 - PVE 多人 roster 地基

- Added roster-based battle scenario foundation for `pve_multi` initialization.
- Added `teamId` and `control` fields to combatants and exposed them through `getState()`.
- Added team-elimination victory support with teamId winners while preserving legacy `winner`.
- Preserved legacy 1v1 `initBattle` compatibility for class and player-config entry points.
- Added tests for scenario normalization, multi-roster initialization/readiness, and team victory.

## 2026-06-01 - 战斗回合动画恢复

- 将 `animateTurn` 作为会话级回调注入 `BattleSessionController`，让本地回合和 PVE 回合都走同一条动画链路。
- `executeLocalTurn()` 现在会先播放动画，再进入战斗结束分支或常规回合收尾，避免直接跳到结算态。
- `AppRuntime.animateTurn()` 统一清理 `clearKeyframes()` 和 `clearAnimEvents()`，P2P 回合不再重复清理 keyframes。
- 新增 `tests/battle_animation_flow_test.js` 覆盖本地回合、战斗结束回合、PVE 链路和回调注入。
## 2026-06-01 - 头像引用统一为 webp

- 配置页中央主图和列表缩略图、战斗界面单位头像都改为读取 `assets/character-portraits/*.webp` 和 `assets/character-portraits/icons/*.webp`。
- 本地仅保留 `assets/character-portraits/icons/*.webp` 的新裁切头像，误生成的 `originals/*.webp` 已清理。

## 2026-06-01 - 配置页主图切回完整立绘

- 配置界面的中央主图读取 `assets/character-portraits/*.webp`；列表缩略图继续使用 `assets/character-portraits/icons/*.webp`。
- 新增回归测试，断言主图与缩略图分别来自完整立绘和头像图标目录，避免后续回退。

## 2026-06-01 - 战斗界面角色头像

- 配置界面角色立绘改为读取 `assets/character-portraits/icons/*.webp`，与新裁切头像保持一致。
- 对战界面 hex 地图单位图标从职业单字改为角色头像，优先按 `roleId` 读取头像图，缺图时回退到原职业字母。
- 战斗头像增加缓存版本号，避免浏览器继续命中旧资源。
- 新增 `tests/battle_canvas_renderer_test.js` 覆盖 hex 单位头像渲染路径。
- Tightened architecture coverage with new config/network and canvas split tests.
- Added browser coverage for config flow, network flow, and canvas rendering.
- Updated the final architecture report and confirmed the full Playwright suite passes.

## 2026-05-29 - AI ????????

- `AiController.chooseAiAction()` ?????????????? 15 ???????????????????? fallback??? PVE ?????
- ?? fallback ?? `timedOut` / `searchError` ?????? AI ????????? AI ??????????????
- ?????????????????????????AI controller ???? 15 ???? 0.1 ???
- `tests/ai_controller_test.js` ???? fallback ?????`tests/pve_ui_static_test.mjs` ?? CRLF ????????? master ?????

## 2026-05-28 鈥?鍚夌背鍛煎惛娉?娲楅珦瀹炶 & 鐕曞弻楣版浜″椋?


- **鍚夌背 鍛煎惛娉?*: 姣忓洖鍚堝紑濮嬫椂锛堟竻鐞嗛樁娈靛悗/鎴樻枟鍒濆鍖栨椂锛夋牴鎹鍋跺垏鎹鍚竇/[鍛糫鐘舵€侊紝鍦ㄨ鍔ㄩ€夋嫨鍓嶅嵆鐢熸晥锛岄€氳繃 `ON_RESOURCE_GAIN` 卤1鎬掓皵銆乣ON_RANGE_CALCULATE` 卤1鏀诲嚮璺濈

- 淇鍛煎惛娉曟椂鏈猴細浠?`executeTurn` 寮€濮嬬Щ鑷冲洖鍚堟竻鐞嗗悗 `turnNumber++` 澶勶紝骞舵柊澧?`initRolePassives()` 鍦?`initBattle` 鏃跺垵濮嬪寲棣栧洖鍚坆uff锛岀‘淇濈帺瀹堕€夋嫨琛屽姩鍓峛uff宸茬敓鏁?
- **鍚夌背 鏄撶粡娲楅珦閰?*: 鍥炲悎娓呯悊闃舵鑷姩妫€娴嬫€掓皵闃堝€?6/8/10/12)锛岃揪鏍囧垯鎵ｉ櫎鎬掓皵骞朵緷娆¤幏寰楁案涔呭己鍖栵細鎬掓皵鑾峰緱+1 / 鏀诲嚮璺濈+1 / 绉诲姩璺濈+1 / 濞佸姏+100

- 鏂板涓変釜Hook: `ON_RANGE_CALCULATE`銆乣ON_MOVE_RANGE_CALCULATE`銆乣ON_POWER_CALCULATE`锛岀粺涓€鐢?BuffManager 鎻愪緵 `getEffectiveRange/getEffectiveMoveRange/getEffectivePower` 渚挎嵎鏂规硶

- TurnManager 鏀诲嚮鎵ц鍣紙杩戞垬/寮逛綋/AOE/闈欐AOE锛夊潎璋冨害 ON_POWER_CALCULATE锛涚Щ鍔ㄦ墽琛屽櫒璋冨害 ON_MOVE_RANGE_CALCULATE

- GameEngine.getValidMoves/getValidTeleports 鑷姩搴旂敤鏈夋晥绉诲姩璺濈锛沬ndex.html UI 鐩爣閫夋嫨浣跨敤 `engine.getEffectiveRange()`

- **鐕曞弻楣?姝讳骸濡傞**: 鏂板琚姩鐗硅川 `YAN_DEATH_WIND`锛屽鎵嬫敾鍑昏惤绌烘椂鑾峰緱1寮瑰苟鑷姩瑁呭～锛堜笉鍗犺鍔級锛岄€氳繃 `ON_ATTACK_MISSED` hook 瑙﹀彂

- TurnManager 鍦ㄨ繎鎴?AOE 鏀诲嚮钀界┖鍚庣珛鍗宠皟搴?ON_ATTACK_MISSED锛屽脊浣撴敾鍑诲湪 resolveStep 鍚庢壒閲忔鏌ヨ惤绌?
- 鏇存柊 `role_mechanics_test.js` 鏂█锛堝懠鍚告硶+1鎬掓皵锛?
- 鍥炲綊楠岃瘉宸查€氳繃锛歚node tests/role_mechanics_test.js`銆乣node tests/role_loadout_test.js`銆乣node tests/skill_test.js`銆乣node test_signaling.js`銆乣node test_e2e.mjs`



## 2026-05-28 鈥?娉曞笀鎶€鑳藉浘鏍囬泦鎴?


- 24涓硶甯堟妧鑳藉湪 SkillData.js 涓粺涓€娣诲姞 `icon` 瀛楁锛屾寚鍚?`assets/skill-icons/mage/<id>.png`

- `skillGlyph()` 鑷姩璇诲彇 `skill.icon`锛屾湁鍥炬爣鏄剧ず鍥剧墖锛屾棤鍥炬爣鍥為€€鏂囧瓧棣栧瓧

- action dock 鎶€鑳芥寜閽浘鏍?`object-fit: cover` 閾烘弧锛屽幓 padding

- deploy.sh / deploy.bat 鍔犲叆 `assets/` 鐩綍

- 鎴樺＋/灏勬墜鍑哄浘鏍囧悗鍙渶鍦?SkillData 鍔?`icon` 瀛楁



## 2026-05-28 - 鍥涗釜瑙掕壊棣栫増鎴樻枟鏈哄埗



- 鍚夌背 `鏄撶粡娲楅珦閰抈 涓嶅啀鏄崰浣嶏細鍙戝姩鍚庤幏寰?2 鎬掓皵鍜屾案涔?`JIMMY_MARROW` 鎴愰暱鏍囪銆?
- 鏂板 `ActionPointSystem`锛氭瘡鍚嶈鑹叉瘡鍥炲悎鏈?1 涓富琛屽姩锛涙灙渚犻€氳繃 `鐏靛阀` 鐗硅川姣忓洖鍚堥澶栬幏寰?1 涓?cost0 琛屽姩锛宑ost0 鍏堜氦涔熶笉浼氶樆姝㈠悗缁粯璐逛富琛屽姩銆?
- 鏋緺 `鐏靛阀琛屽姩` 鏀逛负琚姩鐗硅川锛屼笉鍐嶄綔涓轰富鍔ㄦ妧鑳藉嚭鐜板湪鎴樻枟鎶€鑳芥爮锛屼篃涓嶈兘鐩存帴鎻愪氦銆?
- 缁濆湴娼滃叺 `鍛煎彨琛ョ粰` 鑾峰緱鑳屽寘寮硅嵂 +2锛宍绮惧噯杞扮偢` 鏀逛负鐩爣鐐瑰懆鍥?1 鏍肩殑闈欐 AOE锛岀粷鍦版綔鍏垫瘡鍥炲悎娓呯悊闃舵鑷姩鑾峰緱 1 寮硅嵂銆?
- 鐕曞弻楣?`鎴戣祵浣犵殑鏋噷娌℃湁瀛愬脊` 涓嶅啀鏄崰浣嶏細鏍囪鐩爣骞跺湪鍏舵敾鍑诲懡浠ゆ墽琛屽墠鍙栨秷鏀诲嚮锛涘凡鏀粯璐圭敤涓嶈繑杩樸€?
- P2P 鍥炲悎鍗忚鎷嗗垎涓哄鏉?`TURN_ACTION` 鍜屼竴娆?`TURN_READY`锛屾敮鎸佸悓涓€瑙掕壊鍦ㄨ鍔ㄧ偣鍏佽鏃舵彁浜ゅ涓妧鑳姐€?
- 鏂板 `tests/role_mechanics_test.js` 瑕嗙洊鍥涗釜瑙掕壊鏈哄埗鍜屾灙渚犺鍔ㄧ偣瑙勫垯锛屽苟鏇存柊 `tests/role_loadout_test.js` 鐨勮鑹叉妧鑳芥柇瑷€銆?
- 鍥炲綊楠岃瘉宸查€氳繃锛歚node tests/role_mechanics_test.js`銆乣node tests/role_loadout_test.js`銆乣node tests/skill_test.js`銆乣node test_signaling.js`銆乣node test_e2e.mjs`銆?


## 2026-05-28 - 鎴樻枟椤?UI 鎸囨尌鍙版敼閫?


- 鎴樻枟椤垫敼涓衡€滄鐩樹紭鍏堚€濆竷灞€锛氫腑澶鐩樻墿澶э紝宸︿晶榛樿涓嶅父椹讳俊鎭爮銆?
- 鏂板搴曢儴 `action-dock` 浣滀负涓绘帶 UI锛岄泦涓樉绀哄綋鍓嶈鍔ㄨ鑹层€佽祫婧愩€佹妧鑳姐€佺洰鏍囨彁绀哄拰鎵ц鎸夐挳銆?
- 鏂板宸︿晶 `selected-unit-drawer`锛岀偣鍑绘鐩樿鑹插悗灞曞紑锛屼粎鐢ㄤ簬鏌ョ湅瑙掕壊璇︽儏銆佺壒璐ㄣ€丅uff 鍜屾妧鑳藉垪琛紝涓嶆壙鎷呬富鎿嶄綔銆?
- 鏂板鍙充晶 `hover-inspector`锛屾樉绀轰笂涓€鍚嶆寚閽堝仠鐣欒鑹茬殑鐘舵€侊紱鏃ュ織鍜岃亰澶╂敼涓哄彸渚?tabs銆?
- 淇 selected drawer 涓庡簳閮?action dock 鐨勯噸鍙犻棶棰橈紝骞舵柊澧炲叧闂寜閽€?
- selected drawer 鐨勬妧鑳藉垪琛ㄧ幇鍦ㄥ彲鐐瑰嚮鏌ョ湅鎶€鑳借寖鍥达紝浣嗕笉浼氭彁浜よ鍔ㄣ€?
- hover inspector 鏀逛负鍙樉绀鸿鑹茬姸鎬侊紝涓嶅啀鏄剧ず鎶€鑳藉垪琛ㄣ€?
- action dock 鎶€鑳芥敼涓哄浘鏍囨寜閽紝鍙樉绀烘妧鑳介瀛椼€佽垂鐢ㄥ拰閫熷害锛涙偓鍋滄椂鏄剧ず鑷畾涔夋妧鑳借鎯呮诞灞傘€?
- 鏇存柊 P2P E2E 鏂█锛岃鐩?action dock銆乻elected drawer銆乭over inspector銆乴og/chat tabs锛屽苟閫傞厤鏂版鐩樺昂瀵搞€?
- 鍥炲綊楠岃瘉宸查€氳繃锛歚node test_e2e.mjs`銆乣node tests/role_loadout_test.js`銆乣node tests/skill_test.js`銆乣node test_signaling.js`銆?


## 2026-05-28 - 瑙掕壊閫夋嫨閰嶇疆椤?+ 鎶€鑳藉甫鍏?+ P2P 閰嶇疆鍚屾



- 鏂板涓夋璺敱娴佺▼锛歚start -> config -> battle`锛屾湰鍦版父鐜╁拰 P2P 鍔犲叆鍚庡厛杩涘叆鍑烘垬閰嶇疆椤碉紝鍐嶅垵濮嬪寲鎴樻枟銆?
- 鏂板閰嶇疆椤?UI锛氶《閮ㄨ亴涓氭爣绛撅紝涓儴 3 寮犺鑹插崱杞挱鍜屾偓鍋滆鎯咃紝搴曢儴鍙睍寮€鐨?8 鏍兼妧鑳藉甫鍏ラ厤缃ā鍧椼€?
- 鏈湴妯″紡鏀寔 P1/P2 鍒囨崲閰嶇疆锛汸2P 妯″紡浠呭厑璁哥紪杈戣嚜宸憋紝鍚屾椂灞曠ず瀵规墜鑱屼笟銆佽鑹层€佸甫鍏ユ憳瑕佸拰閿佸畾鐘舵€併€?
- P2P 寮€灞€鍗忚鏀逛负 `CONFIG_UPDATE`銆乣CONFIG_LOCK`銆乣BATTLE_START`锛涙埧涓诲湪鍙屾柟閿佸畾鍚庡彂閫佹渶缁?seed 鍜屽弻鏂瑰畬鏁撮厤缃€?
- 缁撶畻鍚庣殑閲嶈禌鍏ュ彛鏀逛负鍥炲埌 `config` 椤甸潰锛屼繚鐣欎笂涓€灞€閰嶇疆缁х画璋冩暣銆?
- 鎴樻枟 UI 浣跨敤 `engine.getState().characters[].skills` 娓叉煋鏈€缁堟妧鑳藉垪琛紝鏀寔瑙掕壊涓撳睘鎶€鑳?+ 甯﹀叆鎶€鑳斤紱瑙掕壊鐗硅川灞曠ず鍦ㄦ垬鏂楅潰鏉裤€?
- `test_e2e.mjs` 宸叉洿鏂颁负鐙珛鑴氭湰褰㈠紡鐨勬柊娴佺▼楠岃瘉锛氬垱寤烘埧闂淬€佽繘鍏ラ厤缃〉銆佸弻鏂归攣瀹氥€佽繘鍏ユ垬鏂椼€佹彁浜ゅ苟鎵ц涓€鍥炲悎銆?
- 鍥炲綊楠岃瘉宸查€氳繃锛歚node tests/role_loadout_test.js`銆乣node tests/skill_test.js`銆乣node test_signaling.js`銆乣node test_e2e.mjs`銆?
- 娉ㄦ剰锛歚test_e2e.mjs` 涓嶆槸 Playwright test spec锛屽簲浣跨敤 `node test_e2e.mjs`锛屼笉瑕佺敤 `npx playwright test test_e2e.mjs`銆?


## 2026-05-28 鈥?鎴樺＋鎶€鑳介噸鍋?+ 娉曞笀鏂版妧鑳?+ 寮逛綋/UI鏀硅繘



- **灞呭悎鏂?*: 娑堣€楃撼鍒€寮哄寲涓鸿寖鍥?/cost0, 鍚﹀垯鑼冨洿1/cost3

- **绾冲垁**: 鏂╃牬寮逛綋鑾峰緱姘镐箙buff (涓嶅啀闄?鍥炲悎)

- **寰″墤**: 閫熷害 3鈫?

- **鏂版妧鑳?鎶樿繑璺冭縼**: 鐬Щ1鏍? 鍥炲悎缁撴潫杩斿洖鍘熶綅, 閫?/cost0

- **鍙嶅簲瑁呯敳**: 鏀逛负鍗婂緞1灞曞紑7涓潤姝㈠脊浣?(SPAWN_STATIONARY_AOE + includeCenter)

- **寮逛綋纰版挒**: 澶у▉鍔涘脊浣撹疮绌夸笉鍐嶉檷濞?(绉婚櫎 power -= weak.power)

- **鏃犳儏閾佹墜**: 淇鎵撴柇涓嶇敓鏁?(cancelByActor 鍚屾杩囨护 speedGroups)

- **鍔ㄧ敾**: 淇璺ㄦ楠ら噸澶嶅抚 (闈為姝ラ璺宠繃 sub=0)

- **UI**: 鍚屾牸瑙掕壊鍒嗘樉+p1/p2瑙掓爣, 瀵规墜鎶€鑳芥煡鐪? 闈炴硶鏍肩偣鍑诲彇娑堥€夋嫨

- 鏂板 RoleData.js + role_loadout_test.js

- 鏂板 CLAUDE.md (椤圭洰瑙勮寖 + 鍒嗘敮绠＄悊瑙勫垯)

- 鏂板 CHANGELOG.md (鏈枃浠?

- 绉婚櫎 ARCHITECTURE.md / RETROSPECTIVE.md

## 2026-06-08 - Turn Resolution Timeline

- Added structured turn-resolution playback with speed phases and simultaneous same-speed event playback.
- Added playback locking, skip handling, and visible timeline state hooks for Playwright coverage.
- Added deterministic resolution timeline tests, including a safe move-before-attack miss scenario.
- Logged projectile misses so safe-move scenarios surface stable miss text in the combat log.
