import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, UA } from './config.js';

const memory = new Map<string, { exp: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_CACHE_ENTRIES = 800;

/** 防止长时间运行后内存缓存无限增长 */
function remember(key: string, exp: number, value: unknown) {
  memory.delete(key);
  memory.set(key, { exp, value });
  if (memory.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of memory) {
    if (memory.size <= MAX_CACHE_ENTRIES) break;
    if (v.exp <= now || k !== key) memory.delete(k);
  }
}

export class HttpError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export async function request(url: string, init: RequestInit = {}, timeout = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: '*/*',
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJson<T = any>(
  url: string,
  init: RequestInit = {},
  timeout = 12_000,
): Promise<T> {
  const res = await request(
    url,
    { ...init, headers: { Accept: 'application/json, text/plain, */*', ...(init.headers || {}) } },
    timeout,
  );
  if (!res.ok) throw new HttpError(`上游返回 ${res.status}: ${url}`, 502);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(`上游返回的不是 JSON: ${url}`, 502);
  }
}

/** 带内存缓存的取数，失败不缓存 */
export async function cached<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const p = loader()
    .then((value) => {
      remember(key, Date.now() + ttl, value);
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

/** 带磁盘兜底的缓存：请求失败时返回上次成功结果（即使已过期） */
export async function cachedPersistent<T>(
  key: string,
  ttl: number,
  loader: () => Promise<T>,
): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;

  try {
    const value = await loader();
    remember(key, Date.now() + ttl, value);
    try {
      const dir = path.join(CACHE_DIR, 'json');
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
      fs.writeFileSync(file, JSON.stringify({ at: Date.now(), value }), 'utf8');
    } catch {
      /* 磁盘写失败不影响请求 */
    }
    return value;
  } catch (err) {
    const stale = memory.get(key);
    if (stale) {
      console.warn(`[cache] ${key} 请求失败，使用内存旧数据`);
      return stale.value as T;
    }
    try {
      const file = path.join(
        CACHE_DIR,
        'json',
        `${key.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`,
      );
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed?.value !== undefined) {
        memory.set(key, { exp: Date.now() + 5 * 60_000, value: parsed.value });
        console.warn(`[cache] ${key} 请求失败，使用磁盘旧数据（${parsed.at ? new Date(parsed.at).toLocaleString('zh-CN') : '未知时间'}）`);
        return parsed.value as T;
      }
    } catch {
      /* 没旧数据 */
    }
    throw err;
  }
}

export function cacheClear(prefix?: string) {
  if (!prefix) return memory.clear();
  for (const key of [...memory.keys()]) if (key.startsWith(prefix)) memory.delete(key);
}

export function decodeEntities(input: string) {
  return String(input || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function stripHtml(input: string) {
  return decodeEntities(
    String(input || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\u3000+/g, ' ')
    .replace(/[ \t\u00a0]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
