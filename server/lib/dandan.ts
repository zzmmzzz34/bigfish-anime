import crypto from 'node:crypto';
import {
  DANDAN_APP_ID,
  DANDAN_APP_SECRET,
  DANDAN_BASE,
  DANDAN_DAILY_LIMIT,
  DANDAN_MONTHLY_LIMIT,
  UA,
} from './config.js';
import { cached } from './http.js';
import { bangumiIdFor } from './anilistZh.js';
import { titleKey } from './util.js';
import {
  animeGet,
  animePut,
  cacheStats as dandanCacheStats,
  missClear,
  missGet,
  missPut,
  resultGet,
  resultPut,
  usageInc,
  usageStats,
} from './dandanDb.js';
import type { Danmaku } from './types.js';

export interface DandanResult {
  items: Danmaku[];
  animeId: number;
  episodeId: number;
  episodeTitle: string;
}

/** 单集最多展示 3000 条；原始数据仍完整缓存在 SQLite */
const DISPLAY_MAX = 3000;
const MISS_TTL = 6 * 3600_000;

function capItems(items: Danmaku[]) {
  if (items.length <= DISPLAY_MAX) return items;
  const step = Math.ceil(items.length / DISPLAY_MAX);
  return items.filter((_, i) => i % step === 0);
}

export function dandanEnabled() {
  return Boolean(DANDAN_APP_ID && DANDAN_APP_SECRET);
}

function sign(path: string, timestamp: number) {
  return crypto
    .createHash('sha256')
    .update(`${DANDAN_APP_ID}${timestamp}${path}${DANDAN_APP_SECRET}`)
    .digest('base64');
}

function assertQuota() {
  const u = usageStats();
  if (DANDAN_DAILY_LIMIT > 0 && u.today >= DANDAN_DAILY_LIMIT) {
    throw new Error(`DanDanPlay 今日额度已用完（${u.today}/${DANDAN_DAILY_LIMIT}），已优先使用缓存`);
  }
  if (DANDAN_MONTHLY_LIMIT > 0 && u.month >= DANDAN_MONTHLY_LIMIT) {
    throw new Error(`DanDanPlay 本月额度已用完（${u.month}/${DANDAN_MONTHLY_LIMIT}），已优先使用缓存`);
  }
}

async function dandanJson(path: string, query: Record<string, string> = {}): Promise<any> {
  assertQuota();
  usageInc();
  const base = DANDAN_BASE.endsWith('/') ? DANDAN_BASE : `${DANDAN_BASE}/`;
  const url = new URL(path.replace(/^\//, ''), base);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  const timestamp = Math.floor(Date.now() / 1000);
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `${UA} BigFishAnime/0.9`,
      'X-AppId': DANDAN_APP_ID,
      'X-Timestamp': String(timestamp),
      'X-Signature': sign(url.pathname, timestamp),
      'X-Auth': '1',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`DanDanPlay HTTP ${res.status} ${res.headers.get('x-error-message') || ''}`);
  }
  const json: any = await res.json();
  if (json?.success === false || json?.errorCode) {
    throw new Error(`DanDanPlay: ${json?.errorMessage || json?.errorCode}`);
  }
  return json;
}

function episodesOf(bangumi: any): any[] {
  if (!bangumi) return [];
  if (Array.isArray(bangumi)) return bangumi;
  if (Array.isArray(bangumi.episodes)) return bangumi.episodes;
  return [];
}

function pickEpisode(list: any[], index: number) {
  if (!list.length) return null;
  const target = index + 1;
  const numbered = list.find((ep) => {
    const title = String(ep.episodeTitle || ep.title || '');
    const m = title.match(/第?\s*(\d+)\s*[话集]?/);
    return m && Number(m[1]) === target;
  });
  return numbered || list[index] || null;
}

function modeOf(raw: number): Danmaku['mode'] {
  if (raw === 4) return 'bottom';
  if (raw === 5) return 'top';
  return 'scroll';
}

function colorOf(raw: number) {
  const n = Math.max(0, Math.min(0xffffff, raw || 0xffffff));
  return `#${n.toString(16).padStart(6, '0')}`;
}

async function findAnime(title: string) {
  const key = titleKey(title);
  const cachedAnime = animeGet(key);
  if (cachedAnime && Date.now() - cachedAnime.fetchedAt < 7 * 24 * 3600_000) {
    // 空 payload 表示 6 小时内确认没有匹配，避免每个分集都重新搜索
    if (cachedAnime.payload !== null || Date.now() - cachedAnime.fetchedAt < MISS_TTL) {
      return cachedAnime.payload;
    }
  }

  try {
    const bgmId = bangumiIdFor(undefined, [title]);
    if (bgmId) {
      try {
        const data = await dandanJson(`/api/v2/bangumi/bgmtv/${bgmId}`);
        if (data?.bangumi) {
          animePut(key, data.bangumi);
          return data.bangumi;
        }
      } catch {
        /* 没有就继续走搜索 */
      }
    }
    const data = await dandanJson('/api/v2/search/episodes', { anime: title, v2: 'true' });
    const list = Array.isArray(data?.bangumi)
      ? data.bangumi
      : Array.isArray(data?.data)
        ? data.data
        : [];
    const anime = list[0] || null;
    animePut(key, anime);
    return anime;
  } catch (err) {
    if (cachedAnime) return cachedAnime.payload;
    throw err;
  }
}

async function fetchFor(title: string, epIndex: number): Promise<DandanResult | null> {
  const anime = await findAnime(title);
  const episodes = episodesOf(anime);
  const ep = pickEpisode(episodes, epIndex);
  const episodeId = Number(ep?.episodeId || ep?.id) || 0;
  if (!episodeId) return null;

  const data = await dandanJson(`/api/v2/comment/${episodeId}`, {
    withRelated: 'true',
    chConvert: '1',
  });
  const comments = Array.isArray(data?.comments) ? data.comments : [];
  const items: Danmaku[] = [];
  comments.forEach((comment: any, i: number) => {
    const parts = String(comment.p || '').split(',');
    const time = Number(parts[0]);
    const text = String(comment.m || '').trim();
    if (!Number.isFinite(time) || !text) return;
    items.push({
      id: `dandan:${episodeId}:${comment.cid || i}`,
      key: `dandan:${episodeId}`,
      text,
      color: colorOf(Number(parts[2]) || 0xffffff),
      mode: modeOf(Number(parts[1]) || 1),
      time,
      createdAt: 0,
      source: 'dandan',
    });
  });

  return {
    items: capItems(items),
    animeId: Number(anime?.animeId) || 0,
    episodeId,
    episodeTitle: String(ep?.episodeTitle || ep?.title || ''),
  };
}

/** DanDanPlay 可选弹幕源；没配置 AppId/Secret 时返回 null */
export async function getDandanDanmaku(
  title: string,
  epIndex: number,
): Promise<DandanResult | null> {
  if (!dandanEnabled() || !title) return null;
  const key = `${titleKey(title)}:${epIndex}`;
  return cached(`dandan:${key}`, 6 * 3600_000, async () => {
    const missAt = missGet(key);
    if (missAt && Date.now() - missAt < MISS_TTL) return null;

    const stored = resultGet(key);
    if (stored && Date.now() - stored.fetchedAt < 6 * 3600_000) {
      const payload = stored.payload as DandanResult;
      return { ...payload, items: capItems(payload.items || []) };
    }
    try {
      const value = await fetchFor(title, epIndex);
      if (value) {
        missClear(key);
        value.items = capItems(value.items);
        resultPut(key, title, epIndex, value);
      } else {
        missPut(key);
      }
      return value;
    } catch (err) {
      if (stored) {
        const payload = stored.payload as DandanResult;
        return { ...payload, items: capItems(payload.items || []) };
      }
      throw err;
    }
  });
}

export function dandanStatus() {
  const usage = usageStats();
  return {
    configured: dandanEnabled(),
    base: DANDAN_BASE,
    appId: DANDAN_APP_ID ? `${DANDAN_APP_ID.slice(0, 4)}***` : '',
    cache: dandanCacheStats(),
    usage,
    limits: { daily: DANDAN_DAILY_LIMIT, monthly: DANDAN_MONTHLY_LIMIT },
    remaining: {
      today: DANDAN_DAILY_LIMIT > 0 ? Math.max(0, DANDAN_DAILY_LIMIT - usage.today) : -1,
      month: DANDAN_MONTHLY_LIMIT > 0 ? Math.max(0, DANDAN_MONTHLY_LIMIT - usage.month) : -1,
    },
  };
}
