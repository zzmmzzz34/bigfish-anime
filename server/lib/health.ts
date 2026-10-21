import { getSource } from './sources.js';
import { assertSafeUrl } from './proxy.js';
import { UA } from './config.js';
import { getDb, saveDb } from './store.js';
import type { LineStat } from './types.js';

export type HealthStatus = 'ok' | 'slow' | 'dead' | 'unknown';

export interface LineHealth {
  key: string;
  url: string;
  status: HealthStatus;
  latency: number;
  checkedAt: number;
  note?: string;
}

export interface HealthInput {
  key: string;
  url: string;
  sourceId?: string;
}

const CACHE_TTL = 10 * 60_000;
const cache = new Map<string, { exp: number; result: LineHealth }>();

const MEDIA_RE = /\.(m3u8|mp4)(\?|#|$)/i;

function mediaBaseHeaders(ref: string): Record<string, string> {
  return {
    'User-Agent': UA,
    Referer: ref,
    Accept: '*/*',
  };
}

function sourceReferer(sourceId?: string) {
  if (sourceId) {
    const s = getSource(sourceId);
    if (s?.referer) return s.referer;
    if (s?.api) {
      try {
        return new URL(s.api).origin + '/';
      } catch {
        /* ignore */
      }
    }
  }
  return 'https://www.bilibili.com/';
}

async function timedFetch(url: string, headers: Record<string, string>, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      headers,
      redirect: 'follow',
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function absUrl(raw: string, base: string) {
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

/** 从 m3u8 文本中找第一个子播放列表或分片 */
function firstTarget(text: string, base: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const isMaster = lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'));
  let target = '';
  if (isMaster) {
    const idx = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'));
    for (let i = idx + 1; i < lines.length; i++) {
      if (!lines[i].startsWith('#')) {
        target = lines[i];
        break;
      }
    }
  } else {
    target = lines.find((l) => !l.startsWith('#')) || '';
  }
  return { target: target ? absUrl(target, base) : '', isMaster };
}

async function checkHls(url: string, ref: string) {
  const headers = mediaBaseHeaders(ref);
  const first = await timedFetch(url, headers, 6000);
  if (!first.ok) throw new Error(`播放列表 HTTP ${first.status}`);
  const text = await first.text();
  if (!text.includes('#EXTM3U')) throw new Error('返回的不是 m3u8');

  const base1 = first.url || url;
  let target = firstTarget(text, base1);

  // 主播放列表：再取一层子列表
  if (target.isMaster && target.target) {
    const child = await timedFetch(target.target, headers, 6000);
    if (!child.ok) throw new Error(`子播放列表 HTTP ${child.status}`);
    const childText = await child.text();
    if (!childText.includes('#EXTM3U')) throw new Error('子列表不是 m3u8');
    target = firstTarget(childText, child.url || target.target);
  }

  if (!target.target) return { note: '播放列表可读取，未找到分片' };

  // 首个分片：读 1KB 验证
  const seg = await timedFetch(target.target, { ...headers, Range: 'bytes=0-1023' }, 5000);
  if (!seg.ok && seg.status !== 206) throw new Error(`分片 HTTP ${seg.status}`);
  const reader = seg.body?.getReader();
  if (!reader) throw new Error('分片无响应体');
  const { value } = await reader.read();
  reader.cancel().catch(() => {});
  if (!value || value.length === 0) throw new Error('分片为空');
  return { note: '播放列表与首个分片正常' };
}

async function checkMp4(url: string, ref: string) {
  const headers = mediaBaseHeaders(ref);
  try {
    const head = await timedFetch(url, { ...headers, Range: 'bytes=0-1023' }, 6000);
    if (head.ok || head.status === 206) {
      head.body?.cancel().catch(() => {});
      return { note: 'MP4 可访问' };
    }
    throw new Error(`MP4 HTTP ${head.status}`);
  } catch (err) {
    const get = await timedFetch(url, headers, 6000);
    if (!get.ok) throw new Error(`MP4 HTTP ${get.status}`);
    get.body?.cancel().catch(() => {});
    return { note: 'MP4 可访问' };
  }
}

export interface LineStatInfo {
  ok: number;
  fail: number;
  rate: number;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

export function lineStatKey(sourceId: string | undefined, url: string) {
  const host = hostOf(url);
  return host ? `${sourceId || 'unknown'}|${host}` : '';
}

export function statRate(stat: Pick<LineStat, 'ok' | 'fail'>) {
  return (stat.ok + 1) / (stat.ok + stat.fail + 2);
}

export function getLineStat(sourceId: string | undefined, url: string): LineStatInfo | null {
  const key = lineStatKey(sourceId, url);
  if (!key) return null;
  const s = getDb().lineStats[key];
  if (!s) return null;
  return { ok: s.ok, fail: s.fail, rate: statRate(s) };
}

export function recordLineReport(input: {
  sourceId?: string;
  url: string;
  lineName?: string;
  ok: boolean;
  error?: string;
}): (LineStatInfo & { key: string }) | null {
  const key = lineStatKey(input.sourceId, input.url);
  if (!key) return null;
  const db = getDb();
  const host = hostOf(input.url);
  const prev: LineStat = db.lineStats[key] || {
    key,
    sourceId: input.sourceId || 'unknown',
    host,
    lineName: input.lineName,
    ok: 0,
    fail: 0,
    lastAt: 0,
  };
  if (input.ok) prev.ok = Math.min(99_999, prev.ok + 1);
  else prev.fail = Math.min(99_999, prev.fail + 1);
  prev.lastAt = Date.now();
  if (input.lineName) prev.lineName = input.lineName;
  if (input.error) prev.lastError = String(input.error).slice(0, 200);
  db.lineStats[key] = prev;
  saveDb();
  return { key, ok: prev.ok, fail: prev.fail, rate: statRate(prev) };
}

export async function checkLine(input: HealthInput, force = false): Promise<LineHealth> {
  const { key, url } = input;
  const ref = sourceReferer(input.sourceId);
  const cacheKey = `${url}|${ref}`;
  const hit = force ? undefined : cache.get(cacheKey);
  if (hit && hit.exp > Date.now()) return { ...hit.result, key };

  const base: LineHealth = {
    key,
    url,
    status: 'dead',
    latency: 0,
    checkedAt: Date.now(),
  };

  if (!MEDIA_RE.test(url)) {
    const result: LineHealth = {
      ...base,
      status: 'unknown',
      note: '不是直链，需要嗅探',
    };
    cache.set(cacheKey, { exp: Date.now() + CACHE_TTL, result });
    return result;
  }

  try {
    assertSafeUrl(url);
  } catch (err: any) {
    const result: LineHealth = { ...base, status: 'dead', note: err?.message || '地址不合法' };
    cache.set(cacheKey, { exp: Date.now() + CACHE_TTL, result });
    return result;
  }

  const started = Date.now();
  try {
    const info = /\.m3u8(\?|#|$)/i.test(url)
      ? await checkHls(url, ref)
      : await checkMp4(url, ref);
    const latency = Date.now() - started;
    const result: LineHealth = {
      ...base,
      status: latency > 2200 ? 'slow' : 'ok',
      latency,
      note: info.note,
    };
    cache.set(cacheKey, { exp: Date.now() + CACHE_TTL, result });
    return result;
  } catch (err: any) {
    const latency = Date.now() - started;
    const result: LineHealth = {
      ...base,
      status: 'dead',
      latency,
      note: err?.name === 'AbortError' ? '超时' : err?.message || '探测失败',
    };
    cache.set(cacheKey, { exp: Date.now() + CACHE_TTL, result });
    return result;
  }
}

export async function checkLines(
  inputs: HealthInput[],
  concurrency = 3,
  force = false,
): Promise<LineHealth[]> {
  const unique = new Map<string, HealthInput>();
  for (const item of inputs) {
    if (!item?.url || !item?.key) continue;
    if (!unique.has(item.key)) unique.set(item.key, item);
  }
  const queue = [...unique.values()].slice(0, 20);
  const results: LineHealth[] = new Array(queue.length);
  let cursor = 0;

  async function worker() {
    while (cursor < queue.length) {
      const index = cursor++;
      results[index] = await checkLine(queue[index], force);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  return results;
}
