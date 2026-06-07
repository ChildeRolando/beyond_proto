筛完后，我不会把 33 个全算成“测试该改”。真正需要改的是 **8 个测试文件**，其中 **2 个架构测试要先决定是改测试预算还是改源码**。

## 总表

| 测试文件                                                 |    是否需要改测试 | 原因                                                                           |
| ---------------------------------------------------- | ---------: | ---------------------------------------------------------------------------- |
| `tests/e2e/smoke.spec.js`                            |     **要改** | start/tutorial 断言已经跟当前 tutorial 行为冲突，且用 `text=...` 选择器太脆                     |
| `tests/e2e/start-lobby.spec.js`                      |     **要改** | `btn-tutorial` 现在大概率不再只是打开旧 tutorial modal                                   |
| `tests/e2e/config-screen.spec.js`                    |     **要改** | 大量超时来自公共入口 helper；`text=本地游玩` / `text=PVE 模式` 应改成 ID 选择器                     |
| `tests/e2e/config-session.spec.js`                   |     **要改** | PVE label 断言太硬；PVE 配置语义已经变化                                                  |
| `tests/e2e/battle-screen.spec.js`                    |     **要改** | 公共 `lockBothAndStart` 入口旧；还有一个“假测试”没有真正 assert skill button                  |
| `tests/e2e/battle-panels.spec.js`                    |     **要改** | 公共 `enterBattle` 入口旧；skill/dock 断言要统一成当前 HUD 结构                              |
| `tests/e2e/battle-session.spec.js`                   |     **要改** | PVE A5 明确旧：现在 PVE 要锁两个 hero；skill selection 用像素点和 `.skill-btn:not(.used)` 太脆 |
| `tests/e2e/canvas-renderer.spec.js`                  |     **要改** | skill 选择 helper 太依赖像素点和 `.skill-btn:not(.used)`                              |
| `tests/architecture/app-runtime-composition.spec.js` | **不一定改测试** | 预算失败是真的；优先拆 `AppRuntime`，不建议直接涨预算                                            |
| `tests/architecture/code-quality-hygiene.spec.js`    | **不一定改测试** | 同上，而且和上一个 budget check 重复                                                    |

---

## 1. `smoke.spec.js`：要改

失败项：

```text
start screen shows initial UI
tutorial modal opens and closes
```

这里旧测试仍认为 start screen 上一定能通过文本找到 `本地游玩 / PVE 模式 / 新手教学`，并且 `新手教学` 一定打开 `#tutorial-overlay`。测试现在写的是 text locator：`text=本地游玩`、`text=PVE 模式`、`text=新手教学`。

应该改成 ID selector：

```js
await expect(page.locator('#btn-local')).toBeVisible();
await expect(page.locator('#btn-pve')).toBeVisible();
await expect(page.locator('#btn-tutorial')).toBeVisible();
```

更关键的是这个测试：

```js
const tutorialBtn = page.locator('text=新手教学').first();
await tutorialBtn.click();
await expect(page.locator('#tutorial-overlay')).toBeVisible();
```

如果你现在把“新手教学”做成**教学关卡/模式入口**，这条测试就是旧基线，应改成检查进入 tutorial config / tutorial battle，而不是检查 modal。

---

## 2. `start-lobby.spec.js`：要改

失败项：

```text
tutorial modal opens and closes
```

当前测试死认：

```js
await page.locator('#btn-tutorial').click();
await expect(page.locator('#tutorial-overlay')).toHaveClass(/show/);
```

也就是说它认为 `#btn-tutorial` 的行为就是打开旧说明弹窗。

如果你现在把 `#btn-tutorial` 改成“进入新手教学模式”，这条测试必须重写。建议拆成两个测试：

```text
tutorial button enters tutorial mode
battle help button opens tutorial overlay
```

也就是：

* start screen 的 `#btn-tutorial`：测教学模式入口；
* battle 顶部的 `#btn-help-top`：继续测说明弹窗。

旧测试混在一起了，这是坏味道。

---

## 3. `config-screen.spec.js`：要改

失败项全部超时：

```text
local config screen loads with all zones
P1/P2 switch works
class tabs switch role list
role hover preview updates hero and detail
role click switches active role
loadout drawer opens and has skills
loadout add/remove works
lock config toggles button text
PVE config screen loads
```

这些不是 9 个独立问题，主要是公共 helper 入口不稳：

```js
await page.goto('/');
await page.locator('text=本地游玩').first().click();
await expect(page.locator('#config-screen')).toBeVisible();
```



PVE 也用了文本选择器：

```js
await page.locator('text=PVE 模式').first().click();
```



现在 `index.html` 里已经有稳定 ID：`#btn-pve`、`#btn-local`、`#btn-p2p`、`#btn-tutorial`。

所以这里应该统一改成：

```js
async function enterLocalConfig(page) {
  await page.goto('/');
  await page.locator('#btn-local').click();
  await expect(page.locator('#config-screen')).toBeVisible();
}

async function enterPveConfig(page) {
  await page.goto('/');
  await page.locator('#btn-pve').click();
  await expect(page.locator('#config-screen')).toBeVisible();
}
```

这类 E2E 不该再用 `text=...first()`。尤其你加了 tutorial 文案后，文本重复非常容易把 locator 带歪。

---

## 4. `config-session.spec.js`：要改

失败项：

```text
PVE config opens
```

测试现在只检查：

```js
await page.locator('#btn-pve').click();
await expect(page.locator('#config-screen')).toBeVisible();
await expect(page.locator('#config-mode-label')).toContainText('PVE');
```



当前 view 里 PVE label 是：

```js
ctx.configMode === 'pve' ? 'PVE 配置'
```



如果你现在为了教学模式调整了 mode label，这条测试应该别只测 label 文案。更稳的断言应该是 PVE 真实结构：

```js
await expect(page.locator('#config-mode-label')).toContainText(/PVE|教学|配置/);
await expect(page.locator('#team-status')).toContainText(/英雄1|英雄2|敌方/);
```

因为 PVE 当前已经是双英雄配置，team status 里明确渲染 `英雄1 / 英雄2 / 敌方`。

---

## 5. `battle-screen.spec.js`：要改

失败项全是超时：

```text
battle screen loads after lock+start
action dock shows skill buttons
right sidebar tabs switch between chat and log
execute button is present
battle canvas has content
```

公共入口是：

```js
await page.locator('text=本地游玩').first().click();
```



改成 `#btn-local`。

另外这个测试本身是空的：

```js
const skillButtons = actionDock.locator('button, .skill-btn, [class*="skill"]');
// At least some interactive element in the dock
await expect(actionDock.locator('*').first()).toBeVisible();
```

它定义了 `skillButtons`，但完全没 assert。

应该改成真正检查当前 HUD：

```js
await expect(page.locator('#action-dock .skill-icon-btn').first()).toBeVisible();
```

当前 battle HUD 确实渲染 `.skill-btn.skill-icon-btn`。

---

## 6. `battle-panels.spec.js`：要改

失败项全超时，原因同样在公共入口：

```js
await page.locator('text=本地游玩').first().click();
```



改成 `#btn-local`。

这个文件本身的 panel 断言方向是对的，比如它检查：

```js
#action-dock .dock-actor
#action-dock .dock-skills
#action-dock .dock-control
#right-sidebar-tabs
#tab-log
#tab-chat
```



所以不要删整个文件。重点是改入口 helper，并把 skill selector 从宽泛 `.skill-btn` 统一成当前真实按钮：

```js
#action-dock .skill-icon-btn[data-skill]
```

---

## 7. `battle-session.spec.js`：要改最多

失败项：

```text
A1 local battle starts and all panels render
A2 skill selection shows target hint
A3 submit action keeps panels intact
A5 PVE battle starts and action dock renders
A9 Escape key clears skill selection
```

### A5 是明确旧测试

现在 PVE 初始化两个 hero slot：

```js
hero_1
hero_2
```



而 `canStartBattle()` 要求两个 PVE hero 都 locked：

```js
if (this._configMode === 'pve') return this._pveHeroSlots.every(slot => slot.locked);
```



但 A5 旧测试只锁一次就点开始：

```js
await page.locator('#btn-config-lock').click();
await page.locator('#btn-config-start').click();
await expect(page.locator('#app')).toBeVisible();
```



必须改成：

```js
await page.locator('#btn-pve').click();
await page.locator('#btn-config-lock').click();

await page.locator('#config-player-switch button[data-player="hero_2"]').click();
await page.locator('#btn-config-lock').click();

await page.locator('#btn-config-start').click();
await expect(page.locator('#app')).toBeVisible();
```

注意：PVE 下 player switch 的 `data-player` 会被改成 `hero_1 / hero_2`，不是 `player1 / player2`。

### A1/A2/A3/A9 是 skill/action helper 过时

这些测试反复用：

```js
#action-dock .skill-btn:not(.used)
```

以及 canvas 像素点击：

```js
box.x + box.width / 2 - 100
```

  

这很脆。现在 HUD 已经提供 `data-skill` / `data-char`，应该用 DOM 语义选 skill，不要靠像素猜角色。当前按钮结构是：

```html
<button class="skill-btn skill-icon-btn..." data-skill="..." data-char="...">
```



建议统一 helper：

```js
async function firstUsableSkill(page) {
  const btn = page.locator('#action-dock .skill-icon-btn[data-skill]:not(.used):not([disabled])').first();
  await expect(btn).toBeVisible();
  return btn;
}
```

A2/A3/A9 都复用这个 helper。

---

## 8. `canvas-renderer.spec.js`：要改

失败项：

```text
skill selection keeps the canvas painted and enters target mode
execute turn animation completes without errors
```

失败点在 helper：

```js
const skillBtns = page.locator('#action-dock .skill-btn:not(.used)');
await expect(skillBtns.first()).toBeVisible();
```



同样应该改成：

```js
#action-dock .skill-icon-btn[data-skill]:not(.used):not([disabled])
```

另外 `selectSkillForCharacterAt(page, offsetX)` 靠 canvas offset 选角色，这个也该减少依赖。这个测试本质是 canvas rendering，不该强依赖“某个像素点刚好点中角色”。更稳的写法是：

```js
await expect(page.locator('#action-dock .dock-actor')).toBeVisible();
await page.locator('#action-dock .skill-icon-btn[data-skill]:not(.used)').first().click();
```

它要测的是 canvas 没被清空，不是角色命中判定。

---

## 架构测试：不要急着改测试

失败项：

```text
AppRuntime 538 lines > 500 budget
```

两个文件都在测同一个预算：

```js
expect(nonEmptyLineCount(appSrc)).toBeLessThanOrEqual(500);
```

 

这不是旧 E2E selector 问题。它说明 `AppRuntime` 真的膨胀了。当前 `AppRuntime` 又接了 start lobby、config、battle input、game over、chat、galaxy overlay、tutorial/help 等 wiring。

我的判断：

* **不要简单把 500 改成 550**，这会让预算测试失去意义。
* 更合理是把 tutorial/start wiring 或 battle DOM wiring 从 `AppRuntime` 拆出去。
* 如果你现在只是快速让回归过，可以临时把一个 budget test 改成 550，但必须写 TODO/ADR。两个文件都测同一件事，至少应该去重一个。

---

## 最终需要修改的测试清单

按优先级：

1. `tests/e2e/battle-session.spec.js`
2. `tests/e2e/canvas-renderer.spec.js`
3. `tests/e2e/start-lobby.spec.js`
4. `tests/e2e/smoke.spec.js`
5. `tests/e2e/config-screen.spec.js`
6. `tests/e2e/config-session.spec.js`
7. `tests/e2e/battle-screen.spec.js`
8. `tests/e2e/battle-panels.spec.js`

架构类：

9. `tests/architecture/app-runtime-composition.spec.js`：**优先改源码，不优先改测试**
10. `tests/architecture/code-quality-hygiene.spec.js`：**建议去重预算断言，或者跟上一个保持一致**

一句话：**真正旧的是 tutorial modal 假设、PVE 单英雄 start 假设、文本 selector、像素点选角色、以及 `.skill-btn` 旧式/过窄断言。架构预算失败不是过时测试，是 AppRuntime 又胖回去了。**
