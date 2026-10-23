import { BANGUMI_BASE, UA } from './config.js';
import { cachedPersistent } from './http.js';
import { titleKey } from './util.js';
import { bangumiIdFor } from './anilistZh.js';
import {
  cacheEnabled,
  episodesReplace,
  subjectGet,
  subjectUpsert,
  syncMark,
  type BgmSubjectRow,
} from './bangumiDb.js';

export interface BangumiInfo {
  id: number;
  name: string;
  nameCn: string;
  score: number;
  rank: number;
  ratingTotal: number;
  summary: string;
  eps: number;
  date: string;
  platform: string;
  tags: string[];
  images: any;
  fetchedAt: number;
  stale: boolean;
}

const FRESH_MS = 7 * 24 * 3600_000;
let cooldownUntil = 0;

export function bangumiEnabled() {
  return Boolean(BANGUMI_BASE);
}

export function bangumiFreshMs() {
  return FRESH_MS;
}

async function bgmJson(path: string, init: RequestInit = {}, timeout = 5_000): Promise<any> {
  const res = await fetch(`${BANGUMI_BASE}${path}`, {
    ...init,
    headers: {
      'User-Agent': `${UA} BigFishAnime/0.6`,
      Accept: 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`Bangumi HTTP ${res.status}`);
  return res.json();
}

function seasonBase(title: string) {
  return String(title || '')
    .replace(/\s*第\s*[0-9一二三四五六七八九十]+\s*[季期部]/g, '')
    .replace(/\s*Season\s*\d+/gi, '')
    .trim();
}

async function search(keyword: string): Promise<any[]> {
  const data = await bgmJson('/v0/search/subjects?limit=8&offset=0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyword, filter: { type: [2] } }),
  });
  return Array.isArray(data?.data) ? data.data : [];
}

function pick(items: any[], title: string) {
  const target = titleKey(title);
  let best: any = null;
  let bestScore = 0;
  for (const item of items) {
    const names = [item.name_cn, item.name].filter(Boolean);
    let score = 0;
    for (const name of names) {
      const n = titleKey(name);
      if (!n) continue;
      if (n === target) score = Math.max(score, 100);
      else if (n.startsWith(target) || target.startsWith(n)) score = Math.max(score, 70);
      else if (n.includes(target) || target.includes(n)) score = Math.max(score, 50);
    }
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return bestScore >= 50 ? best : null;
}

function toInfo(subject: any): BangumiInfo {
  return {
    id: Number(subject.id) || 0,
    name: String(subject.name || ''),
    nameCn: String(subject.name_cn || ''),
    score: Number(subject.rating?.score) || 0,
    rank: Number(subject.rating?.rank) || 0,
    ratingTotal: Number(subject.rating?.total) || 0,
    summary: String(subject.summary || '').trim(),
    eps: Number(subject.eps) || 0,
    date: String(subject.date || ''),
    platform: String(subject.platform || ''),
    tags: (subject.tags || []).map((t: any) => t.name).filter(Boolean).slice(0, 12),
    images: subject.images || {},
    fetchedAt: Date.now(),
    stale: false,
  };
}

function fromRow(row: BgmSubjectRow, stale: boolean): BangumiInfo {
  let tags: string[] = [];
  let images: any = {};
  try {
    tags = JSON.parse(row.tags_json || '[]');
  } catch {
    /* ignore */
  }
  try {
    images = JSON.parse(row.images_json || '{}');
  } catch {
    /* ignore */
  }
  return {
    id: row.id,
    name: row.name,
    nameCn: row.name_cn,
    score: row.score,
    rank: row.rank,
    ratingTotal: row.rating_total,
    summary: row.summary,
    eps: row.eps,
    date: row.date,
    platform: row.platform,
    tags,
    images,
    fetchedAt: row.fetched_at,
    stale,
  };
}

/** 只请求实时条目并写入缓存；供详情/预热共用 */
export async function fetchBangumiSubject(id: number): Promise<BangumiInfo> {
  if (!bangumiEnabled()) throw new Error('未配置 BANGUMI_BASE');
  const subject = await bgmJson(`/v0/subjects/${id}`);
  const info = toInfo(subject);
  subjectUpsert({
    id: info.id,
    name: info.name,
    nameCn: info.nameCn,
    summary: info.summary,
    score: info.score,
    rank: info.rank,
    ratingTotal: info.ratingTotal,
    eps: info.eps,
    date: info.date,
    platform: info.platform,
    tags: info.tags,
    images: info.images,
  });
  syncMark(id, true);
  return info;
}

/** 抓取并缓存集数；返回集数 */
/** 按 Bangumi ID 读取详情：优先新鲜缓存，过期回源，失败用旧缓存 */
export async function getBangumiSubject(id: number): Promise<BangumiInfo | null> {
  if (!id) return null;
  const row = subjectGet(id);
  const age = row ? Date.now() - row.fetched_at : Number.POSITIVE_INFINITY;
  if (row && age < FRESH_MS) return fromRow(row, false);
  if (!bangumiEnabled()) return row ? fromRow(row, true) : null;
  if (Date.now() < cooldownUntil) return row ? fromRow(row, true) : null;
  try {
    return await fetchBangumiSubject(id);
  } catch (err: any) {
    console.warn('[bangumi] subject failed:', err?.message || err);
    cooldownUntil = Date.now() + 5 * 60_000;
    return row ? fromRow(row, true) : null;
  }
}

export async function fetchBangumiEpisodes(id: number): Promise<number> {
  if (!bangumiEnabled()) return 0;
  const all: any[] = [];
  let offset = 0;
  let total = 0;
  do {
    const data = await bgmJson(`/v0/episodes?subject_id=${id}&limit=100&offset=${offset}`);
    const rows = Array.isArray(data?.data) ? data.data : [];
    total = Number(data?.total) || rows.length;
    all.push(...rows);
    offset += rows.length;
    if (!rows.length) break;
  } while (offset < total && offset < 500);

  episodesReplace(
    id,
    all.map((ep) => ({
      sort: Number(ep.sort) || 0,
      name: String(ep.name || ''),
      nameCn: String(ep.name_cn || ''),
      airdate: String(ep.airdate || ''),
      duration: String(ep.duration || ''),
      desc: String(ep.desc || ''),
    })),
  );
  return all.length;
}

async function resolveSubjectId(title: string, aniListId?: number | string) {
  const mapped = bangumiIdFor(aniListId, [title]);
  if (mapped) return mapped;
  if (!bangumiEnabled()) return 0;

  let items = await search(title);
  let best = pick(items, title);
  if (!best) {
    const base = seasonBase(title);
    if (base && base !== title) {
      items = await search(base);
      best = pick(items, base);
    }
  }
  return Number(best?.id) || 0;
}

/**
 * AniList 条目 -> Bangumi 条目。
 * 优先 SQLite 新鲜缓存；过期则请求反代并写库；失败时返回旧缓存（stale）。
 */
export async function enrichBangumi(
  title: string,
  aniListId?: number | string,
): Promise<BangumiInfo | null> {
  if (!title) return null;

  let subjectId = bangumiIdFor(aniListId, [title]);
  // 没有 ID 映射但反代可用时，才走搜索兜底
  if (!subjectId && bangumiEnabled()) {
    try {
      subjectId = await resolveSubjectId(title, aniListId);
    } catch {
      subjectId = 0;
    }
  }
  if (!subjectId) return null;

  const row = subjectGet(subjectId);
  const age = row ? Date.now() - row.fetched_at : Number.POSITIVE_INFINITY;
  if (row && age < FRESH_MS) return fromRow(row, false);

  if (!bangumiEnabled()) return row ? fromRow(row, true) : null;
  if (Date.now() < cooldownUntil) return row ? fromRow(row, true) : null;

  try {
    return await fetchBangumiSubject(subjectId);
  } catch (err: any) {
    console.warn('[bangumi] enrich failed:', err?.message || err);
    cooldownUntil = Date.now() + 5 * 60_000;
    return row ? fromRow(row, true) : null;
  }
}

/** Bangumi 每日放送，作为 AniList 周表不可用时的兜底 */
export async function getBangumiCalendar(): Promise<any[]> {
  if (!bangumiEnabled()) return [];
  return cachedPersistent('bangumi:calendar', 6 * 3600_000, async () => {
    const data = await bgmJson('/calendar');
    return Array.isArray(data) ? data : [];
  });
}

export async function checkBangumi() {
  if (!bangumiEnabled()) {
    return { configured: false, ok: false, latency: 0, note: '未配置 BANGUMI_BASE' };
  }
  const started = Date.now();
  try {
    const subject = await bgmJson('/v0/subjects/253', {}, 6_000);
    cooldownUntil = 0;
    return {
      configured: true,
      ok: true,
      latency: Date.now() - started,
      note: String(subject?.name_cn || subject?.name || ''),
      base: BANGUMI_BASE,
    };
  } catch (err: any) {
    return {
      configured: true,
      ok: false,
      latency: Date.now() - started,
      note: err?.message || '连接失败',
      base: BANGUMI_BASE,
    };
  }
}

export function cacheUsable() {
  return cacheEnabled();
}
