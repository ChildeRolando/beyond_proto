你正在重构 ChildeRolando/beyond_proto 的战斗回放/表现架构。

当前状态：

* 原始 Task 6.1 已通过：live normal render path 已接入 BattleSceneStore → BattleCanvasRenderer.render(scene)。
* 原始 Task 4.1 已通过：TurnPlaybackRuntime 已新增，纯 runtime。
* 原始 Task 4.2 已通过：ResolutionTimelinePanel 已新增，纯 UI panel。
* 原始 Task 5.1 已通过：BattleCanvasRenderer.render(scene) 已存在。
* 原始 Task 5.2 已通过：renderer.render(scene) 已支持 scene.effects。
* 原始 Task 5.3 已通过：BattleCanvasRenderer constructor 已删除 battleSession/getEngine，renderer 不再持有 session/engine。
* renderBoard(animStep, subT, legacyView) legacy path 仍保留。
* 旧 TurnPlaybackController 仍存在，暂时不要删除。
* BattleSessionController playback render state 仍存在，暂时不要删除。

现在只执行：原始 Task 6.2 — AppRuntime 接入 sceneStore / compiler / runtime / timelinePanel。

目标：
把新 playback 链路正式接入 AppRuntime，但不要删除旧 TurnPlaybackController。
新链路应该是：

TurnResolution
→ PresentationTimelineCompiler
→ TurnPlaybackRuntime
→ buildPlaybackFrame / PresentationTimelinePlayback
→ BattleSceneStore.setPlaybackFrame(frame)
→ ResolutionTimelinePanel.updatePlaybackFrame(frame)
→ BattleRenderCoordinator.renderAll()
→ BattleCanvasRenderer.render(scene)

必须遵守：

1. 不要删除 app/TurnPlaybackController.js。
2. 不要删除 renderBoard legacy path。
3. 不要删除 renderAll(animStep, subT) 协议。
4. 不要删除 BattleSessionController playback render state。
5. 不要恢复 keyframes / animEvents。
6. 不要让 engine import presentation/playback/renderer。
7. 不要让 playback import DOM/session/renderer。
8. 不要让 renderer 重新接 battleSession/getEngine。
9. 不要改变 battle resolution / GameEngine combat logic。
10. 不要把 PresentationTimeline 写进 GameEngine state。

修改文件：

* app/AppRuntime.js
* app/BattleLifecycleService.js 如有必要
* app/TurnPlaybackController.js 不要删除，尽量不要改
* presentation/PresentationTimelineCompiler.js 如有必要只做小修
* playback/TurnPlaybackRuntime.js 如有必要只做小修
* ui/battle/ResolutionTimelinePanel.js 如有必要只做小修
* tests/app_runtime_playback_pipeline.spec.js 或类似新增
* 其他必要 tests

接线要求：

1. AppRuntime 初始化这些对象：

const battleSceneStore = new BattleSceneStore();
const timelineCompiler = createPresentationTimelineCompiler() 或直接使用现有 compiler API；
const playbackRuntime = new TurnPlaybackRuntime({
buildFrame: (timeline, timeMs) => buildPlaybackFrame(timeline, timeMs),
requestFrame: requestAnimationFrame,
cancelFrame: cancelAnimationFrame,
now: () => performance.now(),
});
const timelinePanel = createResolutionTimelinePanel({
getEl,
getCharacterPortraitSrc: ...,
getCurrentGameMode,
});

注意：

* 如果 compiler 当前不是 factory，而是 function/class，按现有 API 接。
* 不要大改 compiler。

2. Runtime frame callback：

playbackRuntime.onFrame((frame) => {
battleSceneStore.setPlaybackFrame(frame);
timelinePanel.updatePlaybackFrame(frame);
battleRender.renderAll();
});

注意：

* 此处 battleRender.renderAll() 应该走 live-path renderLiveScene 还是 playback scene，要小心。
* 当前 BattleSceneStore.getScene() 如果有 playbackFrame，会 mode='playback'。
* renderLiveScene 当前会 setBaseState + setInteraction + getScene + renderer.render(scene)。
* 如果需要，可以调整 BattleScenePipeline，使它在 playbackFrame 存在时仍保留 playback mode/effects。
* 不要让 renderer 读 runtime。

3. Runtime complete callback：

playbackRuntime.onComplete(() => {
timelinePanel.markComplete('回放完成');
});

如果需要恢复 final state，可在 battleSession/lifecycle 既有流程中保留旧逻辑，不要本任务大改 battle result。

4. Timeline panel render：

在播放一个 resolution 前：

const timeline = timelineCompiler.compile(resolution) 或 compilePresentationTimeline(resolution);
timelinePanel.renderResolution(resolution);
battleSceneStore.setBaseState(battleSession.engine.getState());
battleSceneStore.setInteraction(battleSession.getRenderViewState());
playbackRuntime.play(timeline);

5. 替换/新增 battleSession callback：

找到当前 AppRuntime / BattleLifecycleService / BattleSessionController 中调用旧：

animateTurn: (turnData) => turnPlaybackController.play(turnData)

或类似入口。

本任务不要删除旧 turnPlaybackController，但新 callback 应该优先走 new pipeline，例如：

playTurnResolution: async ({ resolution, finalSnapshot, turnData }) => {
const timeline = timelineCompiler.compile(resolution);
timelinePanel.renderResolution(resolution);
battleSceneStore.setBaseState(battleSession.engine.getState());
battleSceneStore.setInteraction(battleSession.getRenderViewState?.() || {});
playbackRuntime.play(timeline);
}

如果现有 call site 只能提供 turnData 而不是 resolution，请从 turnData 中找到 resolution。
不要重写 BattleSessionController。
不要改变 executeTurn 的 combat result。

6. BattleSceneStore playback behavior

确保 onFrame 后：
battleSceneStore.setPlaybackFrame(frame)
battleRender.renderAll()
最终 renderer.render(scene) 收到：
scene.mode === 'playback'
scene.effects 来自 frame.effects
scene.playback.timeMs === frame.timeMs

如果当前 renderLiveBattleScene 每次会覆盖 playback mode，需要小修 BattleScenePipeline：

* setBaseState(state)
* setInteraction(interaction)
* 不要 clear playbackFrame
* getScene()
  这样 BattleSceneStore 内有 playbackFrame 时仍返回 playback scene。

7. Skip button

timelinePanel.bindSkip(() => playbackRuntime.skipToEnd());

注意：

* bindSkip 可以接 runtime callback。
* ResolutionTimelinePanel 内部仍不能 import runtime。

测试要求：

新增 tests/app_runtime_playback_pipeline.spec.js 或 tests/playback_pipeline_integration.spec.js。

测试 1：AppRuntime source wiring
source scan AppRuntime.js，确认出现：

* BattleSceneStore
* TurnPlaybackRuntime
* ResolutionTimelinePanel
* PresentationTimelineCompiler 或 createPresentationTimelineCompiler / compile
* buildPlaybackFrame 或 PresentationTimelinePlayback
* playbackRuntime.onFrame
* playbackRuntime.onComplete
* timelinePanel.renderResolution
* timelinePanel.updatePlaybackFrame
* timelinePanel.markComplete
* timelinePanel.bindSkip

测试 2：renderer stays dumb
source scan BattleCanvasRenderer.js 确认不出现：

* this.battleSession
* this.getEngine
* getRenderState
* getRenderViewState

测试 3：playback frame reaches scene store
可以用 isolated mocks，不一定 instantiate full AppRuntime：

* create BattleSceneStore
* create fake playbackRuntime or call the same callback
* setBaseState(fakeState)
* setPlaybackFrame(fakeFrame)
* getScene()
* assert scene.mode === 'playback'
* assert scene.effects === frame.effects
* assert scene.playback.timeMs === frame.timeMs

测试 4：pipeline render with playback frame

* fake sceneStore with playbackFrame
* fake renderer.render spy
* call renderLiveBattleScene or adjusted pipeline
* assert renderer.render called with scene.mode === 'playback'
* assert scene.effects length > 0

测试 5：timeline panel callback

* fake panel methods count calls
* simulate runtime onFrame callback
* assert updatePlaybackFrame called
* assert battleRender.renderAll called

测试 6：complete callback

* simulate runtime complete callback
* assert markComplete('回放完成') called

测试 7：skip binding

* bindSkip receives callback
* simulate skip click or call bound callback
* assert playbackRuntime.skipToEnd called

测试 8：old controller retained
source scan:

* app/TurnPlaybackController.js still exists
* AppRuntime may still import/create it as fallback, but new pipeline wiring must exist
* Do not delete old controller in this task

测试 9：boundary scan

* playback/TurnPlaybackRuntime.js still has no DOM/session/renderer imports.
* ui/battle/ResolutionTimelinePanel.js still has no runtime/session imports.
* ui/battle/BattleCanvasRenderer.js still has no session/engine constructor dependency.
* engine/ does not import presentation/playback/renderer.

运行：
node tests/app_runtime_playback_pipeline.spec.js
node tests/battle_canvas_renderer_scene_contract.spec.js
node tests/battle_canvas_renderer_effects.spec.js
node tests/live_scene_pipeline_contract.spec.js
node tests/resolution_timeline_panel.spec.js
node tests/turn_playback_runtime.spec.js
node tests/presentation_timeline_playback.spec.js
node tests/battle_scene_store.spec.js
node tests/presentation_timeline_compiler.spec.js
node tests/skill_test.js
npm test

交付格式：
原始 Task 6.2 — AppRuntime 接入 sceneStore / compiler / runtime / timelinePanel 完成。

新增文件：

* ...

修改文件：

* ...

核心设计：

* ...

新 playback 链路：

* ...

旧系统保留：

* TurnPlaybackController retained: yes/no
* renderBoard legacy retained: yes/no
* renderAll(animStep, subT) retained: yes/no

测试：

* node tests/app_runtime_playback_pipeline.spec.js: pass/fail
* node tests/battle_canvas_renderer_scene_contract.spec.js: pass/fail
* node tests/battle_canvas_renderer_effects.spec.js: pass/fail
* node tests/live_scene_pipeline_contract.spec.js: pass/fail
* node tests/resolution_timeline_panel.spec.js: pass/fail
* node tests/turn_playback_runtime.spec.js: pass/fail
* node tests/presentation_timeline_playback.spec.js: pass/fail
* node tests/battle_scene_store.spec.js: pass/fail
* node tests/presentation_timeline_compiler.spec.js: pass/fail
* node tests/skill_test.js: pass/fail
* npm test: pass/fail

未做事项：

* 未删除 TurnPlaybackController
* 未删除 renderBoard legacy path
* 未删除 renderAll(animStep, subT)
* 未删除 BattleSessionController playback state
* 未删除 keyframes/animEvents legacy compatibility from old renderBoard

残留风险：

* ...
