验收结论：**不通过。两个都是实装 bug，不是平衡问题。**

而且日志已经足够证明：

```text
第 3 回合：
吉米 → 盛怒
吉米 获得 怒气 +3
镜 → 小气功波
吉米 怒气抵消 50 伤害
```

这说明**盛怒资源在受击前已经立即结算了**，所以它根本不可能被后续受击取消。

---

# 1. Bug A：余波不是两层，而是伪层数

你现在的 `AFTERSHOCK` 定义只有状态本身，没有默认层数数据。`StatusEffectDefs.js` 里 `AFTERSHOCK` 只是写了 duration 和描述，没有 `data: { stacks: ... }`。

`BuffManager.apply()` 本身也只是创建一个 buff instance，然后把 `data` 合并进去；它没有通用的 stack 合并逻辑。

所以你现在其实不是“buff 系统支持两层余波”，而是：

```text
如果某次 apply 时手动传了 { stacks: 2 }，它才像两层。
如果没传，或者重复 apply 没合并，就会退化成一层/一个状态。
```

`SkillResolver` 判断小气功波是否免费时，确实在读 `aftershock.data.stacks`。
`TurnManager` 里也确实有消费 stacks 的逻辑。
但这套实现的问题是：**层数不是 buff 系统的一等机制，而是硬塞在特殊技能里的 data 字段。**

所以你观察到“余波只有一层”很合理。

---

## 正确修法

我建议不要临时到处 patch，而是给 `BuffManager` 加最小 stack API。

### 在 `BuffManager.js` 加：

```js
addStack(entityId, statusType, amount = 1, maxStacks = Infinity, duration = -1, sourceId = null) {
  const existing = this.getActiveBuffs(entityId).find(b => b.statusType === statusType);

  if (existing) {
    const current = existing.data.stacks || 0;
    existing.data.stacks = Math.min(maxStacks, current + amount);
    return existing;
  }

  const buffId = this.apply(entityId, statusType, duration, sourceId, {
    stacks: Math.min(maxStacks, amount),
  });

  return this.#buffs.get(buffId);
}

consumeStack(entityId, statusType, amount = 1) {
  const existing = this.getActiveBuffs(entityId).find(b => b.statusType === statusType);
  if (!existing) return 0;

  const current = existing.data.stacks || 0;
  const consumed = Math.min(current, amount);
  const next = current - consumed;

  if (next > 0) {
    existing.data.stacks = next;
  } else {
    this.remove(existing.id);
  }

  return consumed;
}

getStacks(entityId, statusType) {
  const existing = this.getActiveBuffs(entityId).find(b => b.statusType === statusType);
  return existing?.data?.stacks || 0;
}
```

然后小气功波支付 cost 时不要自己找 buff 改 data，直接：

```js
this.#buffManager.addStack(cmd.actorId, 'AFTERSHOCK', 2, 2, -1, cmd.actorId);
```

如果你希望余波最多 2 层，用 `maxStacks = 2`。
如果你希望可以累积更多，用 `Infinity`。
按你现在描述“下两次 cost 归零”，我建议**上限 2**，否则玩家可以提前攒一堆免费小波，后面节奏会很怪。

然后发动小气功波时：

```js
if (cmd.skillId === 'mage_small_qi_blast' && cmd.type !== CmdType.CONSUME_RESOURCE) {
  this.#buffManager.consumeStack(cmd.actorId, 'AFTERSHOCK', 1);
}
```

`SkillResolver` 判断免费时也改成：

```js
const stacks = this.buffManager?.getStacks(actorId, 'AFTERSHOCK') || 0;
if (stacks > 0) {
  hasAftershock = true;
  effectiveCost = {};
}
```

这样才是真正的两层余波。

---

# 2. Bug B：盛怒受击不取消资源获取

这个 bug 更明确。

现在 `warrior_rage` 的效果是：

```js
{ cmd: 'GAIN_RESOURCE', resource: 'rage', amount: 2 },
{ cmd: 'SET_FLAG', flag: 'usedRage', value: true, target: 'SELF' },
```

也就是说它在速度 3 阶段直接执行 `GAIN_RESOURCE`。

而 TurnManager 的速度结算是先处理高速度，再处理低速度。速度顺序是 4 → 3 → 2 → 1 → 0。

所以盛怒在速度 3 立刻给怒气，小气功波速度 1 后命中，时间上已经来不及取消。

这就是日志里的情况：

```text
吉米 → 盛怒
吉米 获得 怒气 +3
镜 → 小气功波
吉米 怒气抵消 50 伤害
```

这不是显示问题，是结算时序错了。

---

## 正确设计应该和集气护盾一致

法师集气不是立刻 `GAIN_RESOURCE`，而是：

```js
APPLY_STATUS SHIELD_ACTIVE
SET_FLAG pendingQi
```

然后回合结束时 `_resolveEndOfTurnEffects()` 检查护盾是否受击；没受击才加气。 

盛怒也应该这样做：

```text
速度 3：声明盛怒，挂 pendingRage
回合结束：如果本回合没受击，获得怒气
如果受击，取消
```

---

## 修改 `SkillData.js`

把 `warrior_rage` 从即时 gain 改成 pending flag：

```js
warrior_rage: {
  id: 'warrior_rage',
  name: '盛怒',
  icon: 'assets/skill-icons/warrior/warrior_rage.png',
  class: '战士',
  type: '蓄气',
  cost: {},
  speed: 3,
  targeting: { shape: 'SELF' },
  effects: [
    { cmd: 'SET_FLAG', flag: 'pendingRage', value: true, target: 'SELF' },
  ],
  desc: '技能概念：凝聚怒气。若本回合未受击，回合结束时获得怒气；受击则取消。',
}
```

不要保留即时 `GAIN_RESOURCE`。否则一定会继续出这个 bug。

---

# 3. 还要新增“战士受击记录”

法师集气现在靠的是 `#shieldHitEntities`。TurnManager 在收到 `SHIELD_ABSORBED` 时把实体加入 `#shieldHitEntities`。

但盛怒不能只看护盾。战士没有护盾，受击可能表现为：

```text
怒气抵消
格挡抵消
finalDamage = 0
弹体接触但被资源层吸收
```

要的是“像集气护盾那样受击取消”，应该记录**攻击接触/伤害结算触发**，不应该只看 finalDamage 是否大于 0。

新建：

```js
#hitEntities = new Set();
```

然后监听 `DAMAGE_DEALT`：

```js
this.#eventBus.on(EvtType.DAMAGE_DEALT, (data) => {
  if (data.targetId && data.basePower > 0) {
    this.#hitEntities.add(data.targetId);
  }

  if (data.sourceId && data.targetId) {
    this._checkMindsEyeOnDamage(data.sourceId, data.targetId);
  }
});
```

注意：现在已经在 constructor 里监听 `DAMAGE_DEALT` 做心眼检查。
不要新增第二个重复逻辑，直接扩展这一段。

回合开始时清掉：

```js
this.#hitEntities.clear();
```

放在 `executeTurn()` 开头，和 `#shieldHitEntities.clear()` 一起。现在代码已经清 `#shieldHitEntities`。

---

# 4. 回合结束处理 pendingRage

在 `_resolveEndOfTurnEffects()` 里现在只处理 `pendingQi`。

你要加：

```js
if (flags.pendingRage) {
  const wasHit = this.#hitEntities.has(entityId);

  if (!wasHit) {
    const ctx = this.#buffManager.dispatch(HookName.ON_RESOURCE_GAIN, {
      entityId,
      resource: 'rage',
      amount: 2,
    });

    const finalAmount = ctx?.amount ?? 2;

    this.#resourceSystem.add(entityId, 'rage', finalAmount);
    this.#resourceSystem.recordCostGain(entityId, 'rage', finalAmount);

    this.#logger?.log(`🔥 盛怒成功 +${finalAmount}怒`, 'rage');
  } else {
    this.#logger?.log('🔥 盛怒被打断，未获怒气', 'sh');
  }
}
```

注意这里基础 amount 应该是 2，然后由吉米呼吸法 buff 改成 +3 或 +1。你现在日志里盛怒 +3，是因为 `JIMMY_BREATH_IN` 对 rage gain 额外 +1。BuffManager 里 `JIMMY_BREATH_IN` 会让 rage gain `amount + 1`。
所以不要在 `warrior_rage` 本身写 +3。应该写 +2，让 hook 修正。

---

# 5. 这两个 bug 的验收标准

你下一次验收应该跑这两个最小场景。

---

## 场景 1：余波两层

前置：

```text
镜有 1 气
无余波
```

第 1 回合：

```text
镜：小气功波
```

期望日志：

```text
镜 消耗 气 1
镜 获得 余波 2层
镜 发射小气功波
```

第 2 回合：

```text
镜：小气功波
```

期望：

```text
不消耗气
余波消耗1层，剩1层
```

第 3 回合：

```text
镜：小气功波
```

期望：

```text
不消耗气
余波耗尽
```

第 4 回合：

```text
镜：小气功波
```

期望：

```text
如果没有气，则技能不可提交 / 发动失败
```

这才算余波两层正确。

---

## 场景 2：盛怒受击取消

前置：

```text
吉米 0 怒
镜 1 气
双方距离可命中
```

同回合：

```text
吉米：盛怒
镜：小气功波
```

期望顺序可以是：

```text
吉米 → 盛怒
镜 → 小气功波
镜 消耗 气 1
镜 发射弹体
吉米 被小气功波命中/怒气抵消/受击
回合结束：盛怒被打断，未获怒气
```

最终资源：

```text
吉米怒气 = 0
```

如果吉米最后还是获得怒气，验收失败。

---

# 6. 你这段日志里还有一个值得注意的问题

第 2 回合：

```text
镜 小气功波 威50
吉米 怒气抵消 50 伤害
弹体碰撞：吉米[P2] (0)
吉米 受到 0 伤害
```

这里显示“受到 0 伤害”没问题，但设计语义上应该仍然算“受击”。

否则会出现荒谬情况：

```text
小气功波打到吉米
怒气挡掉了
但盛怒仍然算没被打断
```

这会违背你现在的设计目标。

所以我建议对“受击”的定义是：

```text
只要发生敌方攻击接触并进入 DamageCalculator.resolve，basePower > 0，就算受击。
不要求 finalDamage > 0。
```

也就是：

```text
被护盾吸收算受击。
被怒气抵消算受击。
被格挡抵消也算受击。
```

但有一个例外：

```text
弹体相杀、纳刀斩破弹体，如果没有接触角色本体，不算目标受击。
```

这个语义最干净。

---

# 7. 当前验收结论

| 项目        |   结果 | 原因                                                                    |
| --------- | ---: | --------------------------------------------------------------------- |
| 小气功波实装    | 部分通过 | 技能存在，cost/威力/速度基本对，但余波层数不可靠                                           |
| 余波两层      |  不通过 | buff 系统没有通用 stack 管理，当前表现只有一层                                         |
| 盛怒受击取消    |  不通过 | 盛怒仍然是速度 3 即时 GAIN_RESOURCE，后续受击无法取消                                   |
| 纳刀 → 引刀   | 初步通过 | ProjectileCalculator 已在纳刀斩破弹体时 apply `INDRA_BLADE`，并记录日志“→ 引刀”        |
| 引刀刷新居合 CD | 初步通过 | TurnManager 监听 `INDRA_BLADE` applied 后 reset `warrior_iaido` cooldown |
| 居合斩参数     |   通过 | 范围 4、cd4、cost3、威力100、速度1、命中 +1 怒已写入                                   |


