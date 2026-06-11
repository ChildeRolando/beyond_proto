你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 2 / Task 2.1：从 GameEngine.getState 删除表现层动画字段。
不要执行 Task 2.2 或 Task 2.3。
不要删除 ProjectileCalculator 内部 keyframes/animEvents。
不要删除 TurnPlaybackController。
不要改 BattleSessionController 的 playback state。
不要重写 BattleCanvasRenderer，只做最小兼容。

背景：
Milestone 1 已经把 TurnResolution 改成 schema v2，并收紧 canonical ResolutionEvent 边界。
Milestone 2 目标是把表现层动画数据从 engine state 中切出去。

当前问题：
GameEngine.getState() 会返回：
- animEvents
- keyframes

这些不是稳定战斗状态，而是表现层材料。它们不应该出现在 engine state。

目标：
GameEngine.getState() 不再返回 animEvents/keyframes。
旧 renderer 若暂时依赖这些字段，应以空数组 fallback，不允许 crash。

修改范围：
- engine/GameEngine.js
- ui/battle/BattleCanvasRenderer.js，如有必要
- tests/ 下相关测试

具体要求：

1. 在 engine/GameEngine.js 的 getState() 返回对象中删除：
   - animEvents
   - keyframes

2. 不要删除 ProjectileCalculator 中的：
   - generateKeyframes()
   - getAnimEvents()
   - addAnimEvent()
   - clearKeyframes()
   - clearAnimEvents()

   这些留给 Task 2.2。

3. BattleCanvasRenderer 如果当前读取：
   state.keyframes
   state.animEvents

   必须确保 fallback 安全：
   const keyframes = state.keyframes || [];
   const animEvents = state.animEvents || [];

   但不要在本任务重写 renderer。

4. RuntimeTestHooks 或 tests 如果断言 state.keyframes/state.animEvents 存在，需要改为不依赖这些字段。

5. 新增或修改测试：
   - 初始化 battle 后调用 engine.getState()
   - 断言：
     !('keyframes' in state)
     !('animEvents' in state)
   - 同时确认 basic state 仍然有 characters/entities/projectiles/logs 等稳定字段。

禁止事项：
- 不要接入 PresentationTimelineCompiler。
- 不要删除 ProjectileCalculator animation storage。
- 不要删除 renderAll(animStep, subT)。
- 不要重构 playback。
- 不要修改 TurnResolution schema。

验收标准：

1. GameEngine.getState() 输出不包含 keyframes/animEvents。
2. 游戏启动不 crash。
3. 当前回放/渲染即使没有演出，也不能因为字段缺失报错。
4. npm test 通过。

运行：
npm test

交付格式：

Task 2.1 完成。

修改文件：
- ...

核心变化：
- ...

保留的旧兼容：
- ...

测试：
- npm test: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...