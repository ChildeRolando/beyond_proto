请继续修复 ChildeRolando/beyond_proto 分支 codex/tutorial-levels。不要回滚 AppRuntime 瘦身，不要放宽架构预算。

当前验收不通过，必须一次性修完以下问题：

1. 教学中返回大厅后 tutorial HUD 可能残留。
2. tutorial-next 未完成关卡也能点击，导致跳关。
3. 技能 icon 又出现未缓存/反复重建/闪烁问题。
4. AppRuntime 里 onStartTutorial 仍残留业务逻辑，应该调用 StartModeActions。
5. .agents / .claude 这类 agent skill 文件被错误带入功能分支，必须移除。
6. 补足测试，不能只靠静态 regex。

============================================================
A. 修复 tutorial HUD 返回大厅残留
============================================================

问题：
- #tutorial-hud 是独立 DOM 节点，不在 #app 内。
- RouteController.setRoute('start') 只控制 start-screen/config-screen/app，不会隐藏 tutorial-hud。
- ReturnToStartAction 当前只清 tutorial-overlay / galaxy-overlay / disconnect-overlay，没有直接隐藏 tutorial-hud。
- BattleRenderCoordinator.renderTutorialHud() 只有 renderAll() 时才会根据 tutorial state 隐藏 HUD；returnToStart reset tutorialManager 后没有保证 renderAll。

必须修改 app/ReturnToStartAction.js：

在 returnToStart() 中加入显式清理：

const tutorialHud = getEl('tutorial-hud');
if (tutorialHud) tutorialHud.style.display = 'none';

同时保留：
getEl('tutorial-overlay')?.classList.remove('show');
getEl('galaxy-overlay')?.classList.remove('show');
getEl('disconnect-overlay')?.classList.remove('show');

如果 ReturnToStartAction 可以拿到 battleRender，则也可以调用 battleRender.hideTutorialHud()，但必须保留直接 DOM 兜底。

建议新增 BattleRenderCoordinator API：

function hideTutorialHud() {
  const hud = getEl('tutorial-hud');
  if (hud) hud.style.display = 'none';
}

return 里导出 hideTutorialHud。

但不要为了这个把 DOM listener 或业务逻辑搬回 AppRuntime。

============================================================
B. 修复 tutorial-next 可跳关
============================================================

当前问题：
- renderTutorialHud() 即使 state.showNext === false，也设置：
  nextBtn.style.pointerEvents = 'auto';
  nextBtn.disabled = false;
- ConfigDomBindings 点击 tutorial-next 后直接 lifecycle.advanceTutorialLevel()。
- BattleLifecycleService.advanceTutorialLevel() 只读 getNextLevelId，不检查 levelComplete。

必须三层修复：

1. app/BattleRenderCoordinator.js

在 renderTutorialHud() 中改为：

const canAdvance = Boolean(state.showNext);

nextBtn.textContent = state.nextLabel || '下一关';
nextBtn.style.display = 'inline-flex';
nextBtn.style.opacity = canAdvance ? '1' : '0.45';
nextBtn.style.pointerEvents = canAdvance ? 'auto' : 'none';
nextBtn.dataset.ready = canAdvance ? '1' : '0';
nextBtn.disabled = !canAdvance;

2. app/ConfigDomBindings.js

tutorial-next click handler 改为：

getEl('tutorial-next')?.addEventListener('click', () => {
  const btn = getEl('tutorial-next');
  if (btn?.dataset.ready !== '1') return;

  const advanced = lifecycle.advanceTutorialLevel();
  if (advanced === null) returnToStart();
});

3. app/BattleLifecycleService.js

advanceTutorialLevel() 必须检查 levelComplete：

function advanceTutorialLevel() {
  const tutorialManager = getTutorialManager();
  const state = tutorialManager?.getState?.();
  if (!state?.levelComplete) return false;

  const nextLevelId = tutorialManager?.getNextLevelId?.();
  if (nextLevelId) {
    startTutorialLevel(nextLevelId);
    return true;
  }

  return null;
}

============================================================
C. 修复 skill icon 缓存
============================================================

当前问题：
- ui/shared/AssetPreloader.js 会收集 skill.icon 并 preload。
- 但 ui/battle/BattlePanelsView.js 的 skillGlyph(skill) 直接返回：
  <img src="${skill.icon}" ...>
- renderActionDock() 每次 render 都通过 dock.innerHTML = ... 重建技能按钮和 img。
- 所以预加载 cache 没有成为统一的 skill icon cache。浏览器可能 HTTP cache，但 DOM image element 仍被反复创建，可能产生闪烁/重复 decode/测试表现为不缓存。

必须新增统一技能图标资产模块：

新增文件：
ui/shared/SkillIconAssets.js

建议实现：

const skillIconImageCache = new Map();

export function getSkillIconSrc(skillOrId, skills = null) {
  const skill = typeof skillOrId === 'string'
    ? skills?.[skillOrId]
    : skillOrId;
  return skill?.icon || '';
}

export function getCachedSkillIconImage(skillOrId, {
  skills = null,
  createImage = () => (typeof Image === 'undefined' ? null : new Image()),
  onLoad = null,
} = {}) {
  const src = getSkillIconSrc(skillOrId, skills);
  if (!src) return null;

  if (skillIconImageCache.has(src)) {
    const cached = skillIconImageCache.get(src);
    if (cached && (!cached.complete || cached.naturalWidth <= 0) && onLoad) {
      cached.onload = onLoad;
    }
    return cached;
  }

  const img = createImage();
  if (!img) return null;
  img.onload = onLoad || (() => {});
  img.src = src;
  skillIconImageCache.set(src, img);
  return img;
}

export function seedSkillIconCacheFromPreloader(assetImageCache = new Map()) {
  for (const [src, img] of assetImageCache) {
    if (typeof src === 'string' && /assets\/skill-icons\/.+\.(png|webp|svg)$/i.test(src)) {
      if (!skillIconImageCache.has(src)) skillIconImageCache.set(src, img);
    }
  }
}

export function getSkillIconImageCache() {
  return skillIconImageCache;
}

export function clearSkillIconImageCacheForTests() {
  skillIconImageCache.clear();
}

修改 ui/shared/AssetPreloader.js：
- 不要手写 skill icon path 逻辑。
- 对 skill.icon 继续 preload。
- 但暴露 cache 给 SkillIconAssets seed 使用即可。

修改 app/AppRuntime.js：
- assetPreloader.preloadBattleAssets(...) 后调用 seedSkillIconCacheFromPreloader(assetPreloader.cache)。
- 这个调用可以放在 AppRuntime composition 阶段，但 AppRuntime 不应实现 cache 逻辑。
- import:
  import { seedSkillIconCacheFromPreloader } from '../ui/shared/SkillIconAssets.js';

修改 ui/battle/BattlePanelsView.js：
- import { getSkillIconSrc } from '../shared/SkillIconAssets.js';
- skillGlyph(skill) 改成：

export function skillGlyph(skill) {
  const src = getSkillIconSrc(skill);
  if (src) {
    return `<img class="skill-icon-img" src="${escapeHTML(src)}" alt="${escapeHTML(skill.name)}" loading="eager" decoding="async">`;
  }
  return escapeHTML((skill.name || '?').slice(0, 1));
}

注意：
- 给 img 加 class="skill-icon-img"。
- 样式不要继续写 inline style，放 CSS。
- 不要每次在 skillGlyph 里 new Image；skillGlyph 只负责渲染 src，预加载/cache 由 SkillIconAssets + AssetPreloader 负责。
- 如果你要更强缓存，可以在 BattlePanelsView.renderBattlePanelsView(ctx) 开始前预热当前 visible skills：
  ctx.helpers.visibleSkillsForChar(char).forEach(s => getCachedSkillIconImage(SKILLS[s.id]));
  但不要让 view 创建难以测试的全局副作用。更推荐 AppRuntime 启动 preload 全部技能 icon。

修改 styles/battle-screen.css 或 styles/tutorial.css：
添加：

.skill-icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

检查现有 .skill-glyph 尺寸，确保不破坏布局。

新增/修改测试：

1. tests/architecture/skill-icon-assets.spec.js

测试内容：
- SkillIconAssets.js 存在并导出：
  - getSkillIconSrc
  - getCachedSkillIconImage
  - seedSkillIconCacheFromPreloader
  - getSkillIconImageCache
  - clearSkillIconImageCacheForTests
- BattlePanelsView.js 不再直接使用 skill.icon 拼 img。
  expect(src).not.toMatch(/<img src="\$\{escapeHTML\(skill\.icon\)\}/)
- BattlePanelsView.js 使用 getSkillIconSrc。
- AppRuntime.js 调用 seedSkillIconCacheFromPreloader(assetPreloader.cache)。

2. 新增真实 unit-ish 测试 tests/skill_icon_cache_test.js

用 fake image factory 验证同一个 src 只 create 一次：

import { test, expect } from 'playwright/test';
import {
  getCachedSkillIconImage,
  clearSkillIconImageCacheForTests,
} from '../ui/shared/SkillIconAssets.js';

test('skill icon cache reuses image object for same src', () => {
  clearSkillIconImageCacheForTests();

  let created = 0;
  const createImage = () => {
    created += 1;
    return { src: '', complete: true, naturalWidth: 32 };
  };

  const skill = { icon: 'assets/skill-icons/warrior/warrior_move.png' };

  const a = getCachedSkillIconImage(skill, { createImage });
  const b = getCachedSkillIconImage(skill, { createImage });

  expect(a).toBe(b);
  expect(created).toBe(1);
});

3. 新增 E2E 检查：

tests/e2e/battle-session.spec.js 或 tests/e2e/battle-screen.spec.js 添加：

test('skill icons use stable cached src after rerender', async ({ page }) => {
  await page.goto('/');
  await page.locator('#btn-local-duel').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await page.locator('#btn-config-lock').click();
  await page.locator('#btn-config-start').click();

  const firstSrcs = await page.locator('#action-dock .skill-icon-img').evaluateAll(imgs => imgs.map(img => img.src));
  expect(firstSrcs.length).toBeGreaterThan(0);

  await page.locator('#tab-chat').click();
  await page.locator('#tab-log').click();

  const secondSrcs = await page.locator('#action-dock .skill-icon-img').evaluateAll(imgs => imgs.map(img => img.src));
  expect(secondSrcs).toEqual(firstSrcs);
});

如果可以暴露 test hook，也可加：
window.__assetTest.getSkillIconCacheSize()
但不要污染生产逻辑太多。

============================================================
D. 修复 AppRuntime 残留业务
============================================================

当前 AppRuntime onStartTutorial 仍然内联：
networkSession?.disconnect();
tutorialManager.reset();
lifecycle.startTutorialLevel('tutorial_move_execute');

但 StartModeActions 已经有 startTutorial()。

修改 AppRuntime.js：

onStartTutorial() {
  startModeActions.startTutorial();
}

不要在 AppRuntime 里再写 tutorial 业务。

另外 onStartP2PCoop 现在直接 alert('联机合作开发中')，这次不是 blocker，但如果顺手做，可以把它移到 StartModeActions 或 StartLobbyController UI callback 中。不要让 AppRuntime 继续长业务分支。

============================================================
E. 清理无关 agent/vendor 文件
============================================================

必须从分支删除以下目录，除非用户明确要求把它们作为项目资产提交：

.agents/
.claude/

执行：
git rm -r .agents .claude

确认 git diff 里不再包含：
.agents/skills/impeccable/...
.claude/skills/impeccable/...

这些不是游戏 demo runtime、engine、UI、tests、docs 的必要内容，不允许混入 tutorial-levels 功能分支。

============================================================
F. 补测试：tutorial HUD 和 next gate
============================================================

修改 tests/tutorial.spec.js：

1. 在 "tutorial skip returns to start and hides tutorial overlay" 中增加：

await expect(page.locator('#tutorial-hud')).not.toBeVisible();

2. 在 "tutorial returnToStart programmatic call cleans overlays" 中增加：

await expect(page.locator('#tutorial-hud')).not.toBeVisible();
await expect(page.locator('#galaxy-overlay')).not.toHaveClass(/show/);

3. 新增：

test('tutorial next is disabled until level complete', async ({ page }) => {
  await enterTutorial(page);

  const next = page.locator('[data-testid="tutorial-next"]');
  await expect(next).toBeDisabled();

  const before = await page.evaluate(() => window.__tutorialTest.getCurrentLevel());
  await next.click({ force: true });
  const after = await page.evaluate(() => window.__tutorialTest.getCurrentLevel());

  expect(after).toBe(before);
});

4. 在完成第一关后，确认 next 可用：

await page.evaluate(() => window.__tutorialTest.selectSkill('warrior_move'));
await page.evaluate(() => window.__tutorialTest.chooseHex(1, 0));
await page.evaluate(() => window.__tutorialTest.executeTurn());
await expect(page.locator('[data-testid="tutorial-next"]')).toBeEnabled();

============================================================
G. 运行验证
============================================================

必须运行：

npm test -- tests/tutorial.spec.js
npm test -- tests/e2e/start-lobby.spec.js tests/e2e/smoke.spec.js
npm test -- tests/architecture/app-runtime-composition.spec.js tests/architecture/code-quality-hygiene.spec.js tests/architecture/portrait-assets.spec.js tests/architecture/skill-icon-assets.spec.js
npm test -- tests/skill_icon_cache_test.js
npm test

验收标准：
1. AppRuntime.js non-empty line count 仍 <= 500，最好 <= 430。
2. AppRuntime.js 不出现：
   - document.addEventListener
   - window.addEventListener
   - function renderPanels
   - function renderLog
   - function animateTurn
   - function startBattleFromConfigs
   - const PORTRAIT_CACHE_VERSION =
3. ReturnToStartAction 清：
   - tutorial-overlay
   - tutorial-hud
   - galaxy-overlay
   - disconnect-overlay
4. tutorial-next 未完成时 disabled，不能跳关。
5. skill icon cache 同 src 只创建一次 image object。
6. BattlePanelsView 使用 getSkillIconSrc，不再直接把 skill.icon 写进 img。
7. 分支 diff 不包含 .agents/ 和 .claude/。
8. 全量测试通过。

交付报告必须包含：
- 修改文件列表
- 删除文件列表
- AppRuntime 行数
- portrait cache 修复说明
- skill icon cache 修复说明
- tutorial returnToStart 清理项
- tutorial next gate 说明
- 测试结果