你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 1 / Task 1.2：canonical ResolutionEvent 边界。
不要执行 Task 1.3。
不要删除 TurnManager legacyPhaseEvents。
不要删除 _createResolutionEvent。
不要删除 ProjectileCalculator keyframes/animEvents。
不要改 renderer/playback/session。
本任务是“收紧 event 合法性”，不是大删除。

背景：
ResolutionEventTypes.js 已经定义了合法 eventType。
目标是保证进入 phase.events 的事件都是 canonical ResolutionEvent，不允许粗类型 attack/move/resource/utility 作为主事件类型继续污染 phase.events。

目标：
所有 phase.events items 必须有合法 eventType，并且能通过 assertResolutionEvent(event)。

修改范围：
- engine/resolution/ResolutionEventTypes.js
- engine/resolution/ResolutionEventRecorder.js
- engine/TurnManager.js
- tests/ 下新增或修改相关测试

具体要求：

1. 保持 ResolutionEventTypes.js 作为唯一合法 eventType registry。
   不要新增这些粗类型：
   - attack
   - move
   - resource
   - status
   - utility
   - command

2. 在 ResolutionEventRecorder.record(event) 中继续调用 assertResolutionEvent(normalized)。
   如果已有逻辑如此，保留并补测试。

3. 在 TurnManager 中，凡是要 push 到 phaseRecord.events 的事件，必须满足：
   - event.eventType 是 ResolutionEventType 中的合法值
   - assertResolutionEvent(event) 不抛错

4. 如果当前 legacy event 暂时无法 canonical 化：
   - 不要 push 到 phase.events。
   - 可以保存在局部变量中供内部命中/挥空判断使用。
   - 如果必须保留 debug 信息，只能放在 phase.metadata.debugLegacyEvents，并明确不是 player-facing events。
   - 不要让 debugLegacyEvents 被 CombatLogStore 或 timeline UI 当成正式 events 使用。

5. 给测试补一个 assertion helper：
   对一个真实或构造出的 resolution：
   for each phase:
     for each event:
       assertResolutionEvent(event)

6. 新增/修改测试时，优先测试当前实际 builder 输出。
   不要只测 fake object。

禁止事项：

- 不要删除 legacyPhaseEvents，这留给 Task 1.3。
- 不要改 Presentation 层。
- 不要改 BattleCanvasRenderer。
- 不要改 TurnPlaybackController。
- 不要用新增粗 eventType 的方式“修绿测试”。

验收标准：

1. 所有 phase.events 都有合法 eventType。
2. assertResolutionEvent 对 builder 输出不抛错。
3. 搜索 phase.events.push 的位置，确认 push 的对象是 canonical event。
4. 运行：
   npm test

交付格式：

Task 1.2 完成。

修改文件：
- ...

核心变化：
- ...

canonical event 边界：
- ...

测试：
- npm test: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...