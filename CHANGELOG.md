# Changelog

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
