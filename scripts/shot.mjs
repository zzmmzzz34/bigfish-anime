import { chromium } from 'playwright-core';

const [, , url, out, width = '1600', height = '1000', wait = '8000'] = process.argv;

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({
  viewport: { width: Number(width), height: Number(height) },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
});
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text());
});
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch((e) => {
  console.log('[goto]', e.message);
});
await page.waitForTimeout(Number(wait));
await page.screenshot({ path: out, fullPage: false });
console.log('saved', out);
await browser.close();
