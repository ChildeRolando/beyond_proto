# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\smoke.spec.js >> all critical CSS and JS load with 200
- Location: tests\e2e\smoke.spec.js:56:1

# Error details

```
Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:8000
Call log:
  - → GET http://127.0.0.1:8000/styles/start-screen.css
    - user-agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/148.0.7778.96 Safari/537.36
    - accept: */*
    - accept-encoding: gzip,deflate,br

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - heading "超越极限 · 战斗引擎" [level=1] [ref=e3]
  - generic [ref=e4]: LOCKSTEP HEX COMBAT TABLE
  - generic [ref=e5]:
    - generic [ref=e6]: 本地模式
    - button "本地对战" [ref=e7] [cursor=pointer]
    - button "本地合作" [ref=e8] [cursor=pointer]
    - button "本地单人" [ref=e9] [cursor=pointer]
  - generic [ref=e10]:
    - generic [ref=e11]: P2P模式
    - button "联机对战" [ref=e12] [cursor=pointer]
    - button "联机合作" [disabled] [ref=e13]
  - button "新手教学" [ref=e14] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from 'playwright/test';
  2  | 
  3  | const CRITICAL_CSS = [
  4  |   '/styles/base.css',
  5  |   '/styles/start-screen.css',
  6  |   '/styles/config-screen.css',
  7  |   '/styles/battle-screen.css',
  8  |   '/styles/tutorial.css',
  9  |   '/styles/overlays.css',
  10 | ];
  11 | 
  12 | const CRITICAL_JS = ['/main.js'];
  13 | 
  14 | let pageErrors = [];
  15 | let consoleErrors = [];
  16 | let resourceFailures = [];
  17 | 
  18 | test.beforeEach(async ({ page }) => {
  19 |   pageErrors = [];
  20 |   consoleErrors = [];
  21 |   resourceFailures = [];
  22 | 
  23 |   page.on('pageerror', err => { pageErrors.push(err.message); });
  24 |   page.on('console', msg => {
  25 |     if (msg.type() === 'error') consoleErrors.push(msg.text());
  26 |   });
  27 |   page.on('response', resp => {
  28 |     const url = resp.url();
  29 |     const status = resp.status();
  30 |     if (status >= 400) {
  31 |       const isLocal = url.includes('127.0.0.1') || url.includes('localhost');
  32 |       const isAsset = /\.(css|js|webp|png|svg|json)$/i.test(url);
  33 |       if (isLocal && isAsset) {
  34 |         resourceFailures.push(`${status} ${url}`);
  35 |       }
  36 |     }
  37 |     // Guard: CSS served with wrong MIME type
  38 |     if (url.endsWith('.css') && status === 200) {
  39 |       const ct = resp.headers()['content-type'] || '';
  40 |       if (ct.includes('text/html')) {
  41 |         resourceFailures.push(`WRONG MIME for CSS: ${url} → ${ct}`);
  42 |       }
  43 |     }
  44 |   });
  45 | });
  46 | 
  47 | test.afterEach(async ({ }, testInfo) => {
  48 |   if (testInfo.status !== 'passed') return;
  49 |   expect(pageErrors).toEqual([]);
  50 |   expect(consoleErrors).toEqual([]);
  51 |   expect(resourceFailures).toEqual([]);
  52 | });
  53 | 
  54 | // ─── 1. Resource loading ───
  55 | 
  56 | test('all critical CSS and JS load with 200', async ({ page }) => {
  57 |   // Navigate first so we have a frame context
  58 |   await page.goto('/');
  59 |   const failures = [];
  60 |   for (const url of [...CRITICAL_CSS, ...CRITICAL_JS]) {
> 61 |     const resp = await page.request.get(`http://127.0.0.1:8000${url}`);
     |                                     ^ Error: apiRequestContext.get: connect ECONNREFUSED 127.0.0.1:8000
  62 |     if (resp.status() !== 200) {
  63 |       failures.push(`${url} → ${resp.status()}`);
  64 |     }
  65 |   }
  66 |   expect(failures).toEqual([]);
  67 | });
  68 | 
  69 | // ─── 2. Start screen initial state ───
  70 | 
  71 | test('start screen shows initial UI', async ({ page }) => {
  72 |   await page.goto('/');
  73 | 
  74 |   await expect(page.locator('#start-screen')).toBeVisible();
  75 |   await expect(page.locator('#config-screen')).not.toBeVisible();
  76 |   await expect(page.locator('#app')).not.toBeVisible();
  77 | 
  78 |   await expect(page.locator('#btn-local-duel')).toBeVisible();
  79 |   await expect(page.locator('#btn-local-coop')).toBeVisible();
  80 |   await expect(page.locator('#btn-tutorial')).toBeVisible();
  81 | });
  82 | 
  83 | // ─── 3. Tutorial entry ───
  84 | 
  85 | test('tutorial button starts playable tutorial battle', async ({ page }) => {
  86 |   await page.goto('/');
  87 | 
  88 |   await page.locator('#btn-tutorial').click();
  89 |   await expect(page.locator('#app')).toBeVisible();
  90 |   await expect(page.locator('#tutorial-hud')).toBeVisible();
  91 |   await expect(page.locator('#tutorial-overlay')).not.toBeVisible();
  92 |   await expect(page.locator('[data-testid="tutorial-title"]')).toContainText('教学 1/3');
  93 | });
  94 | 
```