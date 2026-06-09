验收结论：**基本通过，可以合并这一轮，但我建议合并前补两个小收口测试。**

我没有本地跑 `npm test`，以下是基于当前 `master` 代码的静态验收。

---

## 已通过

### 1. HP 模型已经从核心伤害逻辑移除

`DamageCalculator._applyDamage()` 现在明确是一击必杀模型，未被防御层吸收的 `damage > 0` 直接 `target.alive = false`，并 emit `CHARACTER_DIED`。代码注释也明确写了“这个游戏没有 HP”。

这次是真的修到核心层了，不只是把稻草人的 `hp` 字段删掉。

### 2. `hp` 不再进入 canonical resource event

`ResolutionEventRecorder` 在监听 `RESOURCE_CHANGED` 时直接跳过 `resource === 'hp'`。

这虽然不是 hard throw，但对 player-facing canonical stream 来说已经阻断了 `hp` 日志污染。可接受。

### 3. `action_declared` 已经按 actionId 去重

`recordActionDeclared()` 通过 `#declaredActionIds` 保证每个 actionId 只声明一次。

这能解决多 command 技能重复打印行动声明的问题。

### 4. EOT phaseKind 已经修正

进入 end-of-turn 时，旧 recorder 创建 phase 后被明确标记为：

```js
eotPhaseRecord.phaseKind = 'end_of_turn'
```

随后 `eventRecorder` 以这个 phaseRecord 作为当前 phase。

并且进入 EFFECTS 前会清空 action context，避免 EOT 事件错误挂到上一条 action。

这比上一版明显正确。

### 5. resource renderer 不再读 unsigned amount fallback

`ResolutionLogRenderer` 对 `resource_changed` 只看 `delta`，没有 `delta` 就直接跳过。

这解决了“cost 被显示成 gain”的根本入口之一。

### 6. Timeline summarizer 已经迁移到 eventType/delta

`ResolutionActionSummarizer` 明确只读 canonical `eventType/delta`，没有再读 legacy `type/amount`。
它现在按 `action_declared / character_moved / damage_applied / character_died / resource_changed / action_failed / projectile_created` 来形成 action summary。

### 7. Log renderer 已经去掉 legacy fallback

`ResolutionLogRenderer` 现在只走 canonical `event.eventType` 分支，最后未识别 event 直接 `return null`，没有再解释 legacy `event.type`。

这点过线。

### 8. projectile lifecycle 有了基础 canonical 记录

`ProjectileCalculator` 现在记录 projectile-vs-projectile collisions 到 `#lastCollisions`，包括相杀 `mutual_destroy` 和贯穿 `overpowered`。
crossing collision 也会写入 `#lastCollisions`。
`TurnManager` 会把 `results.collisions` 转成 `projectile_collided` / `projectile_intercepted` canonical events。

这次不再只是旧 logger 世界里的“弹体相杀”。

---

## 仍有小问题，但不是当前 blocker

### 1. `projectile_intercepted` 的语义命名有点混

现在 projectile-vs-projectile “overpowered/贯穿” 被记录成：

```js
eventType: 'projectile_intercepted'
```



这个名字不是特别准确，因为“贯穿”不是被角色拦截，而是 projectile collision 中弱弹体被强弹体压制。更准确应是：

```text
projectile_collided
result: 'overpowered'
```

或者新增：

```text
projectile_destroyed
reason: 'overpowered'
```

但这属于语义精修，不影响当前“有 canonical projectile terminal event”的验收。

### 2. EOT gain 归属到 actionId 的能力还不明确

现在进入 EOT 前清空 action context 是对的，避免错误归属。
但你之前希望“如果 pendingQi 来自集气，可以挂回 sourceActionId”。当前我没看到明确的 `pendingQiSourceActionId` 机制。也就是说，mage gather 的 qi gain 可能会作为 EOT independent event，而不是归到集气 action card。

不过测试要求只是：

```text
TurnResolution 有 qi delta > 0
Combat Log 有 qi gain
Timeline summary 有 qi gain
```

目前如果 EOT phase 里有 resource_changed 但没有 actionId，`ResolutionActionSummarizer` 会跳过无 actionId 事件。

而你的测试目前只检查 canonical log 的 gain，不检查 Timeline 里 gather action card 是否显示 `获得 qi 1`。
这可能漏掉“Timeline 没显示集气结果”的问题。

建议补硬测试：

```text
mage_gather 的 Timeline action card 必须显示 获得 qi 1
```

这能逼 agent 明确处理 EOT resource gain 和 action summary 的关系。

### 3. `RESOURCE_CHANGED hp` 目前是 skip，不是 fail

`hp` 作为非法资源，最好在测试/开发环境直接 throw。当前 recorder 是 `return`。

这不影响 player-facing log，但会掩盖未来误发 hp 的 bug。建议后面改成：

```js
if (data.resource === 'hp') {
  throw new Error('hp is not a legal resource');
}
```

或者至少 `console.error` + skip。

---

## 建议补的两个测试

合并前最好补这两个，不大，但能防回归。

### A. mage gather 的 Timeline 也显示 qi gain

现在测试只看 log。应补：

```text
phase.actions 中 skillId === 'mage_gather' 的 summaryText 包含 获得 qi / qi +1
```

否则 Log 对了，Timeline 可能还是“辅助效果”。

### B. projectile collision 不是只出现 expired

加 deterministic projectile-vs-projectile 相杀/贯穿场景，断言：

```text
results / TurnResolution 中有 projectile_collided 或 projectile_intercepted
log 中有 弹体碰撞 / 相杀 / 贯穿
```

现在代码看起来支持，但没有看到对应硬测试。

---

## 总结

```text
无 HP 核心模型：通过
训练稻草人无 HP：通过
canonical eventType 强制：通过
legacy fallback 移出 player-facing：通过
resource delta：通过
EOT phaseKind：通过
projectile lifecycle 基础：通过
CombatLog append-only：通过
```

我的结论：**这一轮可以过，允许 merge。**
合并前补上 “mage gather Timeline summary” 和 “projectile-vs-projectile canonical collision” 两个测试。当前剩余问题已经不是 merge blocker。
