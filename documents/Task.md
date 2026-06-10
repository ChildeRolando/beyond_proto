验收结论：**当前这轮核心问题通过，但还有一个同类残留问题。**

## 1. 大荒星陨移动日志：通过

现在 `_execMeteorDrop()` 已经发标准 movement payload：

```js
this.#eventBus.emit(EvtType.MOVEMENT_COMPLETE, {
  entityId: cmd.actorId,
  from,
  to,
});
```

所以日志从：

```text
吉米 移动至 未知
```

变成：

```text
吉米 移动 (0,-2)→(0,2)
```

这是正确修复。

---

## 2. 怒气抵消重复：基本通过

现在 `ResolutionEventRecorder` 已经不再从 `DAMAGE_DEALT.breakdown` 里额外生成 `damage_absorbed`。`DAMAGE_DEALT` listener 现在只记录 `damage_applied`，没有再遍历 breakdown 记录吸收层。

吸收日志现在统一来自低层吸收事件：

```js
SHIELD_ABSORBED
RAGE_MITIGATED
BLOCK_TRIGGERED
FORMATION_ABSORBED
```



`RAGE_MITIGATED` 现在也补了 `entityId: targetId`，所以不会再出现：

```text
目标 怒气抵消 200 伤害
```

而会正确归到目标角色名。

这一轮你贴的重复怒气问题，按当前代码看应该已修掉。

---

## 3. 但还有一个残留：护盾吸收事件 targetId 格式仍不一致

`ResolutionEventRecorder` 的 absorb handler 现在统一读：

```js
data.entityId
```



但 `applyShield()` 仍然发的是：

```js
eventBus.emit(EvtType.SHIELD_ABSORBED, { targetId, absorbed, remaining: targetPool.shield });
```



也就是说，**怒气抵消好了，但护盾抵消未来可能仍然显示成：**

```text
目标 护盾抵消 xxx 伤害
```

这个不是你当前贴出的怒气重复问题，但属于同一类事件字段不统一问题。应该让 recorder 同时兼容：

```js
const targetId = data.entityId || data.targetId;
```


---

## 最终判断

```text
大荒星陨 movement unknown：通过
怒气抵消重复：通过
怒气抵消 “目标” 名称缺失：通过
护盾抵消 target 字段一致性：未完全通过，残留小 bug
damage / death 顺序反：仍是独立未修问题
```

当前这轮可以算 **解决了核心问题**。但我建议再补一个小 patch：`absorbHandler` 用 `data.entityId || data.targetId`，否则下一个很可能会轮到“护盾抵消显示目标”。
