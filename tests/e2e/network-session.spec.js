import { test, expect } from 'playwright/test';

let pageErrors = [];
let consoleErrors = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  consoleErrors = [];
  page.on('pageerror', err => { pageErrors.push(err.message); });
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== 'passed') return;
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

async function enterP2PLobby(page) {
  await page.goto('/');
  await page.locator('#btn-p2p-duel').click();
  await expect(page.locator('#room-setup')).toBeVisible();
  await expect(page.locator('#room-error')).toHaveText('');
}

async function enterLocalConfig(page) {
  await page.goto('/');
  await page.locator('#btn-local-duel').click();
  await expect(page.locator('#config-screen')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.__testHooks && window.__testHooks.routeNetworkMessage));
}

test('invalid room code validation still works', async ({ page }) => {
  await enterP2PLobby(page);

  await page.locator('#room-code-input').fill('AB');
  await page.locator('#btn-join-room').click();
  await expect(page.locator('#room-error')).toContainText('请输入4位房间码');
});

test('CHAT payload appends opponent chat', async ({ page }) => {
  await enterLocalConfig(page);

  await page.evaluate(() => {
    window.__testHooks.routeNetworkMessage({ type: 'CHAT', text: 'hello from opponent' });
  });

  await expect(page.locator('#chat-messages')).toContainText('hello from opponent');
});

test('CONFIG_UPDATE and CONFIG_LOCK payloads update remote config state', async ({ page }) => {
  await enterLocalConfig(page);

  await page.evaluate(() => {
    window.__testHooks.routeNetworkMessage({
      type: 'CONFIG_UPDATE',
      config: {
        playerId: 'player2',
        class: '射手',
        roleId: 'shooter_helldiver',
        loadoutSkillIds: [],
        roleLoadoutSkillIds: [],
        locked: false,
      },
    });
    window.__testHooks.routeNetworkMessage({
      type: 'CONFIG_LOCK',
      playerId: 'player2',
      locked: true,
    });
  });

  const snapshot = await page.evaluate(() => window.__testHooks.getConfigSnapshot());
  expect(snapshot.players.player2.class).toBe('射手');
  expect(snapshot.players.player2.roleId).toBe('shooter_helldiver');
  expect(snapshot.players.player2.locked).toBe(true);

  await page.locator('#config-player-switch button[data-player="player2"]').click();
  await expect(page.locator('#config-hero-class')).toContainText('射手');
});

test('BATTLE_START payload enters battle', async ({ page }) => {
  await enterLocalConfig(page);

  const snapshot = await page.evaluate(() => window.__testHooks.getConfigSnapshot());
  await page.evaluate((players) => {
    window.__testHooks.routeNetworkMessage({
      type: 'BATTLE_START',
      seed: 42,
      players: [players.player1, players.player2],
    });
  }, snapshot.players);

  await expect(page.locator('#app')).toBeVisible();
  await expect(page.locator('#config-screen')).not.toBeVisible();
  await expect(page.locator('canvas#board')).toBeVisible();
});

test('create and join connection failures display an error and stay alive', async ({ page }) => {
  await page.addInitScript(() => {
    class FailingWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;

      constructor() {
        this.readyState = FailingWebSocket.CONNECTING;
        queueMicrotask(() => {
          this.readyState = FailingWebSocket.CLOSED;
          this.onerror?.(new Event('error'));
        });
      }

      send() {}
      close() {
        this.readyState = FailingWebSocket.CLOSED;
      }
    }

    window.WebSocket = FailingWebSocket;
  });
  await enterP2PLobby(page);

  await page.locator('#server-addr-input-host').fill('127.0.0.1:65534');
  await page.locator('#btn-create-room').click();
  await expect(page.locator('#room-error')).toContainText('连接服务器失败');
  await expect(page.locator('#room-setup')).toBeVisible();

  await page.locator('#server-addr-input').fill('127.0.0.1:65534');
  await page.locator('#room-code-input').fill('ABCD');
  await page.locator('#btn-join-room').click();
  await expect(page.locator('#room-error')).toContainText('连接服务器失败');
  await expect(page.locator('#room-setup')).toBeVisible();
});
