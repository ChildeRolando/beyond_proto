import { test, expect } from 'playwright/test';
test('debug page errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });
  await page.goto('http://127.0.0.1:8000/');
  await page.waitForTimeout(500);
  console.log('PAGE ERRORS:', JSON.stringify(errors));
  expect(errors).toEqual([]);
});
