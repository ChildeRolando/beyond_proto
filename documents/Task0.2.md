你正在重构 GitHub 仓库 ChildeRolando/beyond_proto 的战斗回放/表现架构。

只执行 Milestone 0 / Task 0.2：新增 presentation/playback 数据契约文件。
不要接入运行时。
不要修改 BattleCanvasRenderer。
不要修改 TurnPlaybackController。
不要修改 BattleSessionController。
不要修改 GameEngine。
不要删除旧代码。
不要做顺手重构。

背景：
后续架构目标是：

GameEngine
  → TurnResolution
  → PresentationTimeline
  → PlaybackFrame
  → BattleSceneStore
  → BattleCanvasRenderer.render(scene)

本任务只定义新数据结构和 helper，不改变当前游戏行为。

新增文件：
- presentation/BattleScene.js
- presentation/PresentationClipTypes.js
- playback/PlaybackFrame.js

如果 presentation/ 或 playback/ 目录不存在，请创建。

文件 1：presentation/BattleScene.js

实现并导出 createBattleScene：

export function createBattleScene({
  mode = 'live',
  state = null,
  interaction = {},
  effects = [],
  playback = null,
} = {}) {
  return {
    mode,
    turn: state?.turn ?? null,
    phase: state?.phase ?? null,
    teams: state?.teams || [],
    rules: state?.rules || null,
    entities: state?.entities || [],
    characters: state?.characters || [],
    projectiles: state?.projectiles || [],
    casings: state?.casings || [],
    wildBullets: state?.wildBullets || [],
    logs: state?.logs || [],
    interaction: {
      hoverEffectArea: interaction.hoverEffectArea || [],
      validTargets: interaction.validTargets || [],
      hoveredHex: interaction.hoveredHex || null,
      localSubmittedCharacterIds: interaction.localSubmittedCharacterIds || [],
      remoteSubmittedCharacterIds: interaction.remoteSubmittedCharacterIds || [],
      selectedCharacterId: interaction.selectedCharacterId || null,
      lastHoveredCharacterId: interaction.lastHoveredCharacterId || null,
    },
    effects,
    playback,
  };
}

Also export:

export function isBattleScene(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.characters));
}

Keep this file pure. It must not import GameEngine, BattleSessionController, DOM, canvas, or renderer code.

文件 2：presentation/PresentationClipTypes.js

Implement:

export const PresentationClipKind = Object.freeze({
  PHASE: 'phase',
  ACTION_HIGHLIGHT: 'action_highlight',
  PROJECTILE: 'projectile',
  IMPACT: 'impact',
  SLASH: 'slash',
  MOVE: 'move',
  DASH: 'dash',
  TELEPORT: 'teleport',
  WALK: 'walk',
  GATHER: 'gather',
  STATUS: 'status',
  DAMAGE_NUMBER: 'damage_number',
  HIT_FLASH: 'hit_flash',
  DEATH: 'death',
});

export function isPresentationClipKind(kind) {
  return Object.values(PresentationClipKind).includes(kind);
}

export function createPresentationClip({
  id,
  kind,
  phaseId = null,
  actionId = null,
  startMs = 0,
  durationMs = 0,
  payload = {},
} = {}) {
  return {
    id: id || null,
    kind,
    phaseId,
    actionId,
    startMs,
    durationMs,
    payload,
  };
}

export function isActiveClip(clip, timeMs) {
  if (!clip) return false;
  return timeMs >= clip.startMs && timeMs < clip.startMs + clip.durationMs;
}

Do not validate too aggressively yet. This task only establishes a simple contract.

文件 3：playback/PlaybackFrame.js

Implement:

export function createPlaybackFrame({
  timeMs = 0,
  durationMs = 0,
  phaseId = null,
  activeActionIds = [],
  sceneState = null,
  effects = [],
} = {}) {
  return {
    mode: 'playback',
    timeMs,
    durationMs,
    phaseId,
    activeActionIds,
    sceneState,
    effects,
  };
}

export function isPlaybackFrame(value) {
  return Boolean(
    value &&
    value.mode === 'playback' &&
    typeof value.timeMs === 'number' &&
    Array.isArray(value.effects)
  );
}

export function getPlaybackProgress(frame) {
  if (!frame || !frame.durationMs) return 0;
  return Math.max(0, Math.min(1, frame.timeMs / frame.durationMs));
}

Testing:
Run:
npm test

The package.json defines npm test as playwright test, so use npm test as the standard validation command.

Expected behavior:
- Existing game behavior should not change.
- No imports from these new files are required yet.
- Existing tests should behave the same as before.

Deliverable:
After finishing, report:

Task 0.2 完成。

修改文件：
- ...

核心变化：
- ...

没有修改的内容：
- ...

测试：
- npm test: pass/fail
- 如果 fail，说明失败原因和是否与本任务相关。

残留风险：
- ...