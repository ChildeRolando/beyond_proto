验收结论：**仍然不通过。**

这次有两个核心问题：

```text
1. 吉米死亡：怒气抵消公式错了。
2. 余波只有一层：小气功波在“付费释放的同一次行动里”立刻消耗了自己刚获得的一层余波。
```

---

# 1. 吉米为什么会死：怒气抵消公式写错了

对局统计：

```text
吉米一共获得怒气：第1回合 +3，第4回合 +1，总计 4
吉米被小气功波命中：第2、3、5、6回合，共4次
每次小气功波威力50
```

如果规则是：

```text
1 怒气 = 抵消 50 伤害
```

那吉米应该刚好抵消 4 次小气功波，然后进入 0 怒状态，不应该死。

但当前 `applyRage()` 不是这么实现的。代码现在是：

```js
const maxMitigate = Math.floor(targetPool.rage / 2) * 100;
```

也就是说，**只有怒气至少为 2 时，才会产生抵消额度**。当吉米只剩 1 怒时：

```text
Math.floor(1 / 2) * 100 = 0
```

所以第 6 回合日志才会出现：

```text
吉米[P2] 怒气抵消 0 伤害
弹体碰撞：吉米[P2] (50)
吉米[P2] 受到 50 伤害
吉米[P2] 被击杀
```

这不是平衡问题，是公式 bug。当前代码注释自己也矛盾：前面写“2 rage = 100 damage mitigated”，后面又写“1 rage = 50 power”。

---

## 应该改成这样

把 `DefenseLayers.js` 里的 `applyRage()` 改成：

```js
export function applyRage(targetPool, incomingDamage, eventBus, targetId) {
  if (!targetPool.rage || targetPool.rage <= 0 || incomingDamage <= 0) {
    return { absorbed: 0, remaining: incomingDamage };
  }

  // 1 rage = up to 50 damage mitigation
  const maxAbsorb = targetPool.rage * 50;
  const absorbed = Math.min(maxAbsorb, incomingDamage);
  const rageUsed = Math.ceil(absorbed / 50);

  targetPool.rage -= rageUsed;

  eventBus.emit(EvtType.RAGE_MITIGATED, {
    entityId: targetId,
    absorbed,
    rageUsed,
    remaining: targetPool.rage,
  });

  return {
    absorbed,
    remaining: incomingDamage - absorbed,
  };
}
```

这样第 6 回合如果吉米还有 1 怒，就会正常抵消 50，不会死。

---

# 2. 盛怒受击取消这部分现在基本是对的

从你这份日志看，盛怒已经不是每次都给资源了。

吉米只在：

```text
第1回合：未受击，获得 +3 怒
第4回合：未受击，获得 +1 怒
```

第 2、3、5、6 回合虽然都用了盛怒，但都被小气功波打中，所以没有获得怒气。

这说明 `pendingRage` 的方向已经生效。当前代码也确实有 `#hitEntities`，并且 `DAMAGE_DEALT` 会把 target 记录为受击对象。
回合结束时，`pendingRage` 会检查 `#hitEntities`，没受击才加怒，受击则记录“盛怒被打断”。

所以这一项我会判：

```text
盛怒受击取消：基本通过
怒气抵消：不通过
```

你现在看到的死亡不是“盛怒还在受击后加怒”，而是**最后 1 怒没有发挥 50 抵消效果**。

---

# 3. 余波为什么仍然只有一层

这个 bug 更隐蔽。

你现在已经加了 stack API。`BuffManager.addStack()`、`consumeStack()`、`getStacks()` 都存在。
`_execConsumeResource()` 里也确实写了：

```js
this.#buffManager.addStack(cmd.actorId, 'AFTERSHOCK', 2, 2, -1, cmd.actorId);
```

也就是支付小气功波费用时，理论上加 2 层余波。

但问题在这里：

```js
if (cmd.skillId === 'mage_small_qi_blast' && cmd.type !== CmdType.CONSUME_RESOURCE) {
  const before = this.#buffManager.getStacks(cmd.actorId, 'AFTERSHOCK');
  if (before > 0) {
    this.#buffManager.consumeStack(cmd.actorId, 'AFTERSHOCK', 1);
    ...
  }
}
```

当前逻辑是：**任何小气功波的非 CONSUME_RESOURCE 命令都会消耗 1 层余波。**

小气功波一次释放包含两个命令：

```text
CONSUME_RESOURCE
ATTACK_PROJECTILE
```

所以付费释放时发生了这个流程：

```text
1. CONSUME_RESOURCE：消耗 1 气，获得 2 层余波
2. ATTACK_PROJECTILE：因为也是 mage_small_qi_blast，立刻消耗 1 层余波
3. 回合结束后实际只剩 1 层
```

这就是为什么你看到：

```text
第2回合：付费小气功波，获得余波
第3回合：免费小气功波，失去余波
```

理论上第 3 回合后应该还剩 1 层，但现在被第 2 回合自己的攻击命令提前吃掉了一层。

这就是根因。

---

# 4. 余波正确修法：只在“免费释放”时消耗余波

不能用：

```js
cmd.skillId === 'mage_small_qi_blast' && cmd.type !== CmdType.CONSUME_RESOURCE
```

这个判断太宽了。

应该在 `SkillResolver` 判断出“小气功波因余波免费”时，给后续攻击命令打一个明确标记：

```js
payload: {
  ...payload,
  consumeAftershock: true
}
```

然后 `TurnManager` 只在这个标记存在时消耗余波。

---

## 修改 `SkillResolver.js`

你现在已经在 `SkillResolver` 里判断了：

```js
const stacks = this.buffManager?.getStacks?.(actorId, 'AFTERSHOCK') || 0;
if (stacks > 0) {
  hasAftershock = true;
  effectiveCost = {};
}
```

这部分是对的。

但你还需要把“这次是余波免费”写进 command。

伪代码：

```js
let consumeAftershockMarked = false;

for (const eff of skill.effects) {
  if (eff.cmd === 'CONSUME_RESOURCE' && hasIndraBlade) continue;
  if (eff.cmd === 'CONSUME_RESOURCE' && hasAftershock) continue;

  const result = this._translateEffect(eff, actor, targetPos, skill, sid);
  if (!result) continue;

  const markAftershock = (cmd) => {
    if (
      skillId === 'mage_small_qi_blast' &&
      hasAftershock &&
      !consumeAftershockMarked &&
      cmd.type !== CmdType.CONSUME_RESOURCE
    ) {
      cmd.payload = {
        ...(cmd.payload || {}),
        consumeAftershock: true,
      };
      consumeAftershockMarked = true;
    }
    return cmd;
  };

  if (Array.isArray(result)) {
    commands.push(...result.map(markAftershock));
  } else {
    commands.push(markAftershock(result));
  }
}
```

重点是：

```text
只有 hasAftershock === true 的那次释放，才标记 consumeAftershock。
付费释放时 hasAftershock === false，所以不会消耗刚获得的余波。
```

---

## 修改 `TurnManager.js`

把现在这段：

```js
if (cmd.skillId === 'mage_small_qi_blast' && cmd.type !== CmdType.CONSUME_RESOURCE) {
```

改成：

```js
if (cmd.skillId === 'mage_small_qi_blast' && cmd.payload?.consumeAftershock) {
```

完整写法：

```js
if (cmd.skillId === 'mage_small_qi_blast' && cmd.payload?.consumeAftershock) {
  const before = this.#buffManager.getStacks(cmd.actorId, 'AFTERSHOCK');

  if (before > 0) {
    this.#buffManager.consumeStack(cmd.actorId, 'AFTERSHOCK', 1);

    const after = this.#buffManager.getStacks(cmd.actorId, 'AFTERSHOCK');
    const actor = this.#registry.get(cmd.actorId);

    if (after > 0) {
      this.#logger?.log(`${actor?.name || cmd.actorId} 余波消耗1层（剩${after}层）`, 's');
    } else {
      this.#logger?.log(`${actor?.name || cmd.actorId} 余波耗尽`, 's');
    }
  }
}
```

这样付费小气功波不会吃掉自己的余波。

---

# 5. 修完后，这局应该怎么走

按你的日志这局，如果只修这两个 bug，正确结果应该是：

```text
第1回合：
镜集气 +1
吉米盛怒成功 +3

第2回合：
镜付费小气功波，气 -1，余波 +2
小气功命中，吉米怒气 3 → 2
盛怒被打断，不加怒

第3回合：
镜免费小气功波，余波 2 → 1
小气功命中，吉米怒气 2 → 1
盛怒被打断，不加怒

第4回合：
镜集气 +1
吉米未受击，盛怒成功 +1
吉米怒气 1 → 2

第5回合：
镜免费小气功波，余波 1 → 0
小气功命中，吉米怒气 2 → 1
盛怒被打断，不加怒

第6回合：
如果镜没有气，不能付费小气功波
如果镜有气并付费小气功波，吉米怒气 1 → 0，吸收50，不死亡
```

所以修完后，吉米不应该死。

---

# 6. 本轮验收表

| 项目           |   结果 | 说明                                |
| ------------ | ---: | --------------------------------- |
| 盛怒改为受击取消     | 基本通过 | 吉米只在未受击回合获得怒气                     |
| 受击统计         | 基本通过 | `DAMAGE_DEALT` 已记录 `#hitEntities` |
| 怒气抵消         |  不通过 | 1 怒不能抵消 50，导致第 6 回合死亡             |
| 余波 stack API | 部分通过 | API 已存在                           |
| 小气功波 +2 余波   |  不通过 | 付费释放时同一行动立刻消耗 1 层，只剩 1 层          |
| 小气功波免费释放     | 部分通过 | 能免费一次，但不能免费两次                     |

---

# 7. 最小修复顺序

先修这两个地方：

```text
1. DefenseLayers.applyRage()
   把 Math.floor(rage / 2) * 100 改成 rage * 50。

2. TurnManager 余波消费条件
   不能在所有非 CONSUME_RESOURCE 小气功命令上消费余波。
   只在 SkillResolver 标记 consumeAftershock 的免费释放上消费。
```

这两个修完后，再跑你这份完全一样的脚本。验收标准非常明确：

```text
第2回合付费小气功波后：余波应剩 2 层，不能立刻自耗。
第3回合免费小气功波后：余波应剩 1 层。
第5回合免费小气功波后：余波应耗尽。
第6回合如果再次付费小气功波：吉米最后 1 怒应抵消 50，不能死亡。
```
