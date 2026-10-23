import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

interface Seed {
  generatedAt: string;
  counts: Record<string, number>;
  byId: Record<string, string>;
  byTitle: Record<string, string>;
  bgmByAniList: Record<string, string>;
  bgmByTitle: Record<string, string>;
  biliByAniList: Record<string, string>;
  biliByTitle: Record<string, string>;
}

const SEED_FILE = path.join(ROOT, 'data', 'seed', 'anilist-zh.json');
let seed: Seed | null = null;
let seedMtime = 0;
let lastCheck = 0;

function emptySeed(): Seed {
  return {
    generatedAt: '',
    counts: {},
    byId: {},
    byTitle: {},
    bgmByAniList: {},
    bgmByTitle: {},
    biliByAniList: {},
    biliByTitle: {},
  };
}

function loadSeed(): Seed {
  const now = Date.now();
  if (seed && now - lastCheck < 30_000) return seed;
  lastCheck = now;
  try {
    const stat = fs.statSync(SEED_FILE);
    if (seed && stat.mtimeMs === seedMtime) return seed;
    const raw = JSON.parse(fs.readFileSync(SEED_FILE, 'utf8'));
    seed = {
      generatedAt: String(raw.generatedAt || ''),
      counts: raw.counts || {},
      byId: raw.byId || {},
      byTitle: raw.byTitle || {},
      bgmByAniList: raw.bgmByAniList || {},
      bgmByTitle: raw.bgmByTitle || {},
      biliByAniList: raw.biliByAniList || {},
      biliByTitle: raw.biliByTitle || {},
    };
    seedMtime = stat.mtimeMs;
    console.log(
      `[anilist] 中文标题种子 ${Object.keys(seed.byId).length} 条 / Bangumi ID ${Object.keys(seed.bgmByAniList).length} 条 / B站 ID ${Object.keys(seed.biliByAniList).length} 条`,
    );
  } catch {
    if (!seed) seed = emptySeed();
    console.warn('[anilist] 未找到 data/seed/anilist-zh.json，将回退日文标题');
  }
  return seed;
}

export function reloadSeed() {
  seed = null;
  seedMtime = 0;
  lastCheck = 0;
  loadSeed();
}

export function seedStatus() {
  const current = loadSeed();
  let size = 0;
  let mtime = 0;
  try {
    const stat = fs.statSync(SEED_FILE);
    size = stat.size;
    mtime = stat.mtimeMs;
  } catch {
    /* ignore */
  }
  return {
    generatedAt: current.generatedAt,
    counts: current.counts,
    file: SEED_FILE,
    size,
    mtime,
  };
}

export function normTitle(input: string) {
  return String(input || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[【】\[\]（）()《》「」『』·,，.。!！?？:：;；'"“”‘’~～\-—_/\\|+*&]/g, '');
}

/** 用 bangumi-data 的中文译名覆盖 AniList 的日文/英文标题 */
export function zhTitle(media: {
  id?: number | string;
  title?: { native?: string; romaji?: string; english?: string };
  synonyms?: string[];
}) {
  const s = loadSeed();
  const id = media.id != null ? String(media.id) : '';
  if (id && s.byId[id]) return s.byId[id];
  const candidates = [
    media.title?.native,
    media.title?.romaji,
    media.title?.english,
    ...(media.synonyms || []),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const hit = s.byTitle[normTitle(c)];
    if (hit) return hit;
  }
  return '';
}

/** AniList / 标题 -> Bangumi subject id（bangumi-data 的站点映射） */
export function bangumiIdFor(aniListId: number | string | undefined, titles: string[]) {
  const s = loadSeed();
  const id = aniListId != null ? String(aniListId) : '';
  if (id && s.bgmByAniList[id]) return Number(s.bgmByAniList[id]) || 0;
  for (const title of titles) {
    if (!title) continue;
    const hit = s.bgmByTitle[normTitle(title)];
    if (hit) return Number(hit) || 0;
  }
  return 0;
}

/** AniList / 标题 -> B站 media_id（bangumi-data 的 bilibili 站点映射） */
export function bilibiliMediaIdFor(aniListId: number | string | undefined, titles: string[]) {
  const s = loadSeed();
  const id = aniListId != null ? String(aniListId) : '';
  if (id && s.biliByAniList[id]) return Number(s.biliByAniList[id]) || 0;
  for (const title of titles) {
    if (!title) continue;
    const hit = s.biliByTitle[normTitle(title)];
    if (hit) return Number(hit) || 0;
  }
  return 0;
}
