import { cacheClear, cached, requestJson, stripHtml, HttpError } from './http.js';
import { parseMacPlayUrls, toWork, formatUpdate } from './util.js';
import type { PlayLine, Source, Work, WorkDetail } from './types.js';

const ANIME_RE = /动漫|动画|番剧|日漫|国漫|泡面番/i;
const BLOCK_RE = /综艺|纪录|真人|脱口秀|体育|里番|伦理|情色|福利|写真|成人|三级/i;

export interface MacItem {
  vod_id: string | number;
  vod_name: string;
  vod_pic?: string;
  vod_year?: string | number;
  vod_area?: string;
  type_name?: string;
  vod_remarks?: string;
  vod_director?: string;
  vod_actor?: string;
  vod_content?: string;
  vod_blurb?: string;
  vod_time?: string;
  vod_play_from?: string;
  vod_play_url?: string;
  vod_total?: number;
  [key: string]: any;
}

function apiUrl(source: Source, params: Record<string, string | number>) {
  const url = new URL(source.api);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function headers(source: Source) {
  return {
    Referer: source.referer || new URL(source.api).origin + '/',
    ...(source.userAgent ? { 'User-Agent': source.userAgent } : {}),
  };
}

async function macRequest(
  source: Source,
  params: Record<string, string | number>,
  timeout = 12_000,
): Promise<any> {
  const attempts: Array<Record<string, string | number>> = [
    { ...params, ac: 'detail' },
    { ...params, ac: 'videolist' },
  ];
  let lastError: unknown = null;
  for (const p of attempts) {
    try {
      const json = await requestJson<any>(apiUrl(source, p), { headers: headers(source) }, timeout);
      if (json && (json.code === 1 || json.code === '1' || Array.isArray(json.list))) {
        if (Array.isArray(json.list) && json.list.length > 0) return json;
        if (!params.wd && !params.ids && !params.id) return json;
        // 空结果也返回，避免对不存在的关键词重复请求
        return json;
      }
      lastError = new HttpError(`${source.name} 返回异常: ${json?.msg || '未知错误'}`, 502);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new HttpError(`${source.name} 请求失败`, 502);
}

export interface MacCategory {
  id: string | number;
  name: string;
}

export async function getCategories(source: Source): Promise<MacCategory[]> {
  return cached(`maccms:cat:${source.id}:${source.api}`, 12 * 3600_000, async () => {
    const json = await macRequest(source, {}, 10_000);
    const classes = Array.isArray(json?.class) ? json.class : [];
    if (classes.length) {
      return classes
        .map((c: any) => ({ id: c.type_id, name: String(c.type_name || '').trim() }))
        .filter((c: MacCategory) => c.name);
    }
    // 兜底：从列表结果里推断
    const list: MacItem[] = Array.isArray(json?.list) ? json.list : [];
    const map = new Map<string, string>();
    for (const it of list) {
      const tid = (it as any).type_id;
      if (tid && it.type_name) map.set(String(tid), String(it.type_name));
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  });
}

export async function getAnimeCategories(source: Source): Promise<MacCategory[]> {
  if (source.animeTypes?.length) {
    return source.animeTypes.map((id) => ({ id, name: String(id) }));
  }
  const all = await getCategories(source);
  const anime = all.filter((c) => ANIME_RE.test(c.name) && !BLOCK_RE.test(c.name));
  const rank = (name: string) => {
    if (/日韩|日漫/.test(name)) return 0;
    if (/国产|国漫/.test(name)) return 1;
    if (/番剧/.test(name)) return 2;
    if (/动画/.test(name)) return 3;
    return 4;
  };
  anime.sort((a, b) => rank(a.name) - rank(b.name));
  return anime.length ? anime : all.filter((c) => !BLOCK_RE.test(c.name)).slice(0, 3);
}

export function normalizeMacItem(source: Source, item: MacItem): Work {
  const lines = parseMacPlayUrls(item);
  const count = Math.max(...lines.map((l) => l.episodes.length), 0);
  return toWork(source, {
    vodId: item.vod_id,
    title: item.vod_name,
    cover: item.vod_pic,
    year: item.vod_year,
    area: item.vod_area,
    typeName: item.type_name,
    remarks: item.vod_remarks,
    director: item.vod_director,
    actors: item.vod_actor,
    synopsis: item.vod_content || item.vod_blurb,
    updatedAt: formatUpdate(item),
    episodeCount: count || Number(item.vod_total || 0),
  });
}

export async function listLatest(
  source: Source,
  opts: { typeIds?: Array<string | number>; page?: number; limit?: number } = {},
): Promise<Work[]> {
  const typeIds = opts.typeIds?.length ? opts.typeIds.join(',') : '';
  const page = opts.page || 1;
  const key = `maccms:list:${source.id}:${typeIds}:${page}`;
  return cached(key, 10 * 60_000, async () => {
    const json = await macRequest(source, { t: typeIds, pg: page }, 12_000);
    const list: MacItem[] = Array.isArray(json?.list) ? json.list : [];
    return list
      .map((it) => normalizeMacItem(source, it))
      .filter((w) => w.title && w.cover)
      .slice(0, opts.limit || 24);
  });
}

export async function searchMac(source: Source, keyword: string): Promise<Work[]> {
  const key = `maccms:search:${source.id}:${keyword}`;
  return cached(key, 3 * 60_000, async () => {
    const json = await macRequest(source, { wd: keyword, pg: 1 }, 12_000);
    const list: MacItem[] = Array.isArray(json?.list) ? json.list : [];
    return list.map((it) => normalizeMacItem(source, it)).filter((w) => w.title);
  });
}

export async function getMacDetail(source: Source, vodId: string): Promise<WorkDetail | null> {
  const key = `maccms:detail:${source.id}:${vodId}`;
  return cached(key, 5 * 60_000, async () => {
    let json: any = null;
    try {
      json = await macRequest(source, { ids: vodId }, 12_000);
    } catch {
      json = await macRequest(source, { id: vodId }, 12_000);
    }
    let item: MacItem | undefined = Array.isArray(json?.list) ? json.list[0] : undefined;
    if (!item?.vod_id) {
      const again = await macRequest(source, { ids: vodId, ac: 'detail' }, 12_000).catch(() => null);
      item = Array.isArray(again?.list) ? again.list[0] : item;
    }
    if (!item?.vod_id) return null;

    const lines: PlayLine[] = parseMacPlayUrls(item);
    const work = normalizeMacItem(source, item);
    const total = lines.reduce((max, l) => Math.max(max, l.episodes.length), 0);
    return { ...work, lines, total, episodeCount: total || work.episodeCount };
  });
}

export async function testMacSource(source: Source) {
  const started = Date.now();
  const json = await macRequest(source, {}, 12_000);
  const cats = await getAnimeCategories(source).catch(() => []);
  const list: MacItem[] = Array.isArray(json?.list) ? json.list : [];
  let sample = list.slice(0, 3).map((it) => it.vod_name);
  if (cats.length) {
    const latest = await listLatest(source, {
      typeIds: cats.map((c) => c.id),
      limit: 3,
    }).catch(() => []);
    if (latest.length) sample = latest.map((w) => w.title);
  }
  return {
    ok: true,
    latency: Date.now() - started,
    total: Number(json?.total || 0),
    categories: cats.length,
    animeCategories: cats.map((c) => c.name).slice(0, 8),
    sample,
    note: stripHtml(String(json?.msg || '')),
  };
}

export { cacheClear };
