import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';

interface Seed {
  byId: Record<string, string>;
  byTitle: Record<string, string>;
  bgmByAniList: Record<string, string>;
  bgmByTitle: Record<string, string>;
}

let seed: Seed | null = null;

function loadSeed(): Seed {
  if (seed) return seed;
  try {
    const file = path.join(ROOT, 'data', 'seed', 'anilist-zh.json');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    seed = {
      byId: raw.byId || {},
      byTitle: raw.byTitle || {},
      bgmByAniList: raw.bgmByAniList || {},
      bgmByTitle: raw.bgmByTitle || {},
    };
    console.log(
      `[anilist] 中文标题种子 ${Object.keys(seed.byId).length} 条 / Bangumi ID ${Object.keys(seed.bgmByAniList).length} 条`,
    );
  } catch {
    seed = { byId: {}, byTitle: {}, bgmByAniList: {}, bgmByTitle: {} };
    console.warn('[anilist] 未找到 data/seed/anilist-zh.json，将回退日文标题');
  }
  return seed;
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
