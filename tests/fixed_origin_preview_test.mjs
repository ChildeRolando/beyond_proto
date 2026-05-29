import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 3100;
const BASE = `http://localhost:${PORT}`;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startServer() {
  const proc = spawn(process.execPath, ['server/static.js', String(PORT)], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  await wait(600);
  return proc;
}

function colorDistance(a, b) {
  return Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(BASE, { waitUntil: 'networkidle' });

    await page.evaluate(() => document.getElementById('btn-start').click());
    for (let i = 0; i < 5; i++) {
      if (await page.locator('#action-dock .skill-icon-btn[data-skill="mage_realm_sweep"]').count()) break;
      await page.click('#action-dock .skill-page-btn[data-page-dir="next"]');
      await page.waitForTimeout(50);
    }
    await page.waitForSelector('#action-dock .skill-icon-btn[data-skill="mage_realm_sweep"]');
    await page.click('#action-dock .skill-icon-btn[data-skill="mage_realm_sweep"]');
    await page.mouse.move(640, 450);
    await page.waitForTimeout(100);

    const samples = await page.evaluate(() => {
      const canvas = document.getElementById('board');
      const ctx = canvas.getContext('2d');
      const hs = 50;
      const sq3 = Math.sqrt(3);
      const center = (q, r) => [
        canvas.width / 2 + hs * (sq3 * q + (sq3 / 2) * r),
        canvas.height / 2 + hs * (3 / 2) * r,
      ];
      const sample = (q, r) => {
        const [x, y] = center(q, r);
        const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
        return { r: d[0], g: d[1], b: d[2], a: d[3] };
      };
      return {
        effect: sample(0, 0),
        outside: sample(3, -3),
      };
    });

    const boardBase = { r: 30, g: 29, b: 42 };
    if (colorDistance(samples.effect, boardBase) < 40) {
      throw new Error(`expected effect area to be highlighted, got ${JSON.stringify(samples.effect)}`);
    }
    if (colorDistance(samples.outside, boardBase) > 12) {
      throw new Error(`expected non-effect fixed-origin hex to stay unhighlighted, got ${JSON.stringify(samples.outside)}`);
    }

    console.log('fixed-origin preview only highlights effect area');
  } finally {
    await browser.close();
    server.kill();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
