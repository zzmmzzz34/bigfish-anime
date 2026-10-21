import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 生成 AniList -> 中文标题 的离线映射种子。
 *
 * 数据源：
 *  1. npm 包 bangumi-data（已安装，含 AniList/Bangumi ID 与中文译名）
 *  2. GitHub bangumi-data 当前年份的增量月份（npm 包通常滞后）
 *
 * 用法：node scripts/sync-bangumi.mjs
 * 产物：data/seed/anilist-zh.json
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED_DIR = path.join(ROOT, 'data', 'seed');
const SEED_FILE = path.join(SEED_DIR, 'anilist-zh.json');
const BASE_FILE = path.join(ROOT, 'node_modules', 'bangumi-data', 'dist', 'data.json');

function norm(input) {
  return String(input || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[【】\[\]（）()《》「」『』·,，.。!！?？:：;；'"“”‘’~～\-—_/\\|+*&]/g, '');
}

function zhOf(item) {
  const t = item.titleTranslate || {};
  const arr = t['zh-Hans'] || t['zh-Hant'] || [];
  return arr[0] || '';
}

async function fetchMonth(year, month) {
  const url = `https://api.github.com/repos/bangumi-data/bangumi-data/contents/data/items/${year}/${String(month).padStart(2, '0')}.json?ref=master`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'BigFishAnime/0.4 (bangumi-data seed)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const json = await res.json();
  const text = Buffer.from(json.content, 'base64').toString('utf8');
  return JSON.parse(text);
}

async function main() {
  const base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8')).items || [];
  const year = new Date().getFullYear();
  const delta = [];
  for (let m = 1; m <= 12; m++) {
    try {
      const arr = await fetchMonth(year, m);
      delta.push(...arr);
      if (arr.length) console.log(`  ${year}/${String(m).padStart(2, '0')}: ${arr.length}`);
    } catch (err) {
      console.warn(`  ${year}/${String(m).padStart(2, '0')}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const seen = new Set();
  const items = [];
  for (const it of [...base, ...delta]) {
    const key = `${it.title}|${it.begin}|${it.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }

  const byId = {};
  const byTitle = {};
  const bgmByAniList = {};
  const bgmByTitle = {};
  for (const item of items) {
    const zh = zhOf(item);
    const sites = item.sites || [];
    const ani = sites.find((s) => s.site === 'aniList')?.id;
    const bgm = sites.find((s) => s.site === 'bangumi')?.id;
    const en = (item.titleTranslate || {}).en || [];
    const keys = [item.title, ...en, ...(item.titleTranslate?.['zh-Hans'] || [])].filter(Boolean);

    if (zh) {
      if (ani) byId[String(ani)] = zh;
      for (const key of keys) {
        const k = norm(key);
        if (k && !byTitle[k]) byTitle[k] = zh;
      }
    }
    if (bgm) {
      if (ani) bgmByAniList[String(ani)] = String(bgm);
      for (const key of keys) {
        const k = norm(key);
        if (k && !bgmByTitle[k]) bgmByTitle[k] = String(bgm);
      }
    }
  }

  fs.mkdirSync(SEED_DIR, { recursive: true });
  const payload = {
    generatedAt: new Date().toISOString(),
    source: 'bangumi-data npm + GitHub master delta',
    counts: {
      items: items.length,
      byId: Object.keys(byId).length,
      byTitle: Object.keys(byTitle).length,
      bgmByAniList: Object.keys(bgmByAniList).length,
      bgmByTitle: Object.keys(bgmByTitle).length,
    },
    byId,
    byTitle,
    bgmByAniList,
    bgmByTitle,
  };
  fs.writeFileSync(SEED_FILE, JSON.stringify(payload), 'utf8');
  console.log(
    `\nseed: ${SEED_FILE}\nitems=${items.length} byId=${payload.counts.byId} byTitle=${payload.counts.byTitle} bgmId=${payload.counts.bgmByAniList} size=${(
      fs.statSync(SEED_FILE).size / 1024
    ).toFixed(0)}KB`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
