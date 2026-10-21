import { chromium } from 'playwright-core';

const base = process.argv[2] || 'http://127.0.0.1:8787';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' });
page.on('pageerror', (err) => console.log('[pageerror]', err.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[console.error]', msg.text());
});

await page.goto(`${base}/play/lz/23478/0/0`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000);

await page
  .locator('.stage > button[aria-label="播放"]')
  .click({ timeout: 5000 })
  .catch(() => console.log('play button not found'));

await page.waitForTimeout(7000);

const state = await page.evaluate(() => {
  const v = document.querySelector('video');
  return {
    currentTime: v?.currentTime,
    duration: v?.duration,
    paused: v?.paused,
    readyState: v?.readyState,
    src: v?.currentSrc?.slice(0, 120),
  };
});
console.log('video', state);

await page.locator('.dm-input').fill('测试弹幕：这画面太美了');
await page.getByRole('button', { name: '发送' }).click();
await page.waitForTimeout(1200);

await page
  .locator('textarea[placeholder^="说点什么"]')
  .fill('第一条评论，来自自动化测试。');
await page.getByRole('button', { name: '发布' }).click();
await page.waitForTimeout(1500);

await page.screenshot({ path: 'shots/player-play.png' });

const dm = await page.evaluate(() => fetch('/api/danmaku?key=lz:23478:0').then((r) => r.json()));
const cm = await page.evaluate(() => fetch('/api/comments?key=lz:23478:0').then((r) => r.json()));
console.log('danmaku', dm.length, dm.at(-1)?.text);
console.log('comments', cm.length, cm[0]?.text);

await browser.close();
