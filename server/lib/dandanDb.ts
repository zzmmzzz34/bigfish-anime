import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DATA_DIR } from './config.js';

const DB_FILE = path.join(DATA_DIR, 'dandan.db');
const SCHEMA = `
CREATE TABLE IF NOT EXISTS dandan_result (
  cache_key   TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  ep_index    INTEGER NOT NULL DEFAULT 0,
  payload     TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dandan_anime (
  title_key   TEXT PRIMARY KEY,
  payload     TEXT NOT NULL,
  fetched_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS dandan_usage (
  day         TEXT PRIMARY KEY,
  calls       INTEGER NOT NULL DEFAULT 0,
  last_at    INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS dandan_miss (
  cache_key   TEXT PRIMARY KEY,
  fetched_at  INTEGER NOT NULL
);
`;

let db: any = null;
let tried = false;

function getDb() {
  if (tried) return db;
  tried = true;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(DB_FILE);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA wal_autocheckpoint = 1000');
    db.exec(SCHEMA);
    console.log(`[dandan] 缓存库 ${DB_FILE}`);
  } catch (err: any) {
    db = null;
    console.warn('[dandan] SQLite 不可用，退回内存缓存:', err?.message || err);
  }
  return db;
}

export interface DandanCacheRow {
  payload: any;
  fetchedAt: number;
}

export function resultGet(cacheKey: string): DandanCacheRow | null {
  const conn = getDb();
  if (!conn) return null;
  try {
    const row = conn
      .prepare('SELECT payload, fetched_at FROM dandan_result WHERE cache_key = ?')
      .get(cacheKey) as { payload: string; fetched_at: number } | undefined;
    if (!row) return null;
    return { payload: JSON.parse(row.payload), fetchedAt: Number(row.fetched_at) || 0 };
  } catch {
    return null;
  }
}

export function resultPut(
  cacheKey: string,
  title: string,
  epIndex: number,
  payload: unknown,
) {
  const conn = getDb();
  if (!conn) return;
  try {
    conn
      .prepare(
        `INSERT INTO dandan_result (cache_key, title, ep_index, payload, fetched_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET
           title = excluded.title,
           ep_index = excluded.ep_index,
           payload = excluded.payload,
           fetched_at = excluded.fetched_at`,
      )
      .run(cacheKey, title, epIndex, JSON.stringify(payload), Date.now());
  } catch {
    /* ignore */
  }
}

export function missGet(cacheKey: string): number {
  const conn = getDb();
  if (!conn) return 0;
  try {
    const row = conn
      .prepare('SELECT fetched_at FROM dandan_miss WHERE cache_key = ?')
      .get(cacheKey) as { fetched_at: number } | undefined;
    return Number(row?.fetched_at) || 0;
  } catch {
    return 0;
  }
}

export function missPut(cacheKey: string) {
  const conn = getDb();
  if (!conn) return;
  try {
    conn
      .prepare(
        `INSERT INTO dandan_miss (cache_key, fetched_at) VALUES (?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET fetched_at = excluded.fetched_at`,
      )
      .run(cacheKey, Date.now());
  } catch {
    /* ignore */
  }
}

export function missClear(cacheKey: string) {
  const conn = getDb();
  if (!conn) return;
  try {
    conn.prepare('DELETE FROM dandan_miss WHERE cache_key = ?').run(cacheKey);
  } catch {
    /* ignore */
  }
}

export function animeGet(titleKey: string): DandanCacheRow | null {
  const conn = getDb();
  if (!conn) return null;
  try {
    const row = conn
      .prepare('SELECT payload, fetched_at FROM dandan_anime WHERE title_key = ?')
      .get(titleKey) as { payload: string; fetched_at: number } | undefined;
    if (!row) return null;
    return { payload: JSON.parse(row.payload), fetchedAt: Number(row.fetched_at) || 0 };
  } catch {
    return null;
  }
}

export function animePut(titleKey: string, payload: unknown) {
  const conn = getDb();
  if (!conn) return;
  try {
    conn
      .prepare(
        `INSERT INTO dandan_anime (title_key, payload, fetched_at)
         VALUES (?, ?, ?)
         ON CONFLICT(title_key) DO UPDATE SET
           payload = excluded.payload,
           fetched_at = excluded.fetched_at`,
      )
      .run(titleKey, JSON.stringify(payload), Date.now());
  } catch {
    /* ignore */
  }
}

function dayKey(date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function usageInc() {
  const conn = getDb();
  if (!conn) return;
  try {
    const day = dayKey();
    conn
      .prepare(
        `INSERT INTO dandan_usage (day, calls, last_at) VALUES (?, 1, ?)
         ON CONFLICT(day) DO UPDATE SET calls = calls + 1, last_at = excluded.last_at`,
      )
      .run(day, Date.now());
  } catch {
    /* ignore */
  }
}

export function usageStats() {
  const conn = getDb();
  if (!conn) return { today: 0, month: 0, all: 0 };
  try {
    const today = dayKey();
    const month = today.slice(0, 7);
    const t = conn
      .prepare('SELECT calls FROM dandan_usage WHERE day = ?')
      .get(today) as { calls: number } | undefined;
    const m = conn
      .prepare('SELECT COALESCE(SUM(calls), 0) AS calls FROM dandan_usage WHERE day LIKE ?')
      .get(`${month}-%`) as { calls: number } | undefined;
    const a = conn
      .prepare('SELECT COALESCE(SUM(calls), 0) AS calls FROM dandan_usage')
      .get() as { calls: number } | undefined;
    return {
      today: Number(t?.calls) || 0,
      month: Number(m?.calls) || 0,
      all: Number(a?.calls) || 0,
    };
  } catch {
    return { today: 0, month: 0, all: 0 };
  }
}

export function cacheStats() {
  const conn = getDb();
  if (!conn) return { enabled: false, results: 0, anime: 0, misses: 0, lastAt: 0 };
  try {
    const r = conn.prepare('SELECT COUNT(*) AS n FROM dandan_result').get() as { n: number };
    const a = conn
      .prepare("SELECT COUNT(*) AS n FROM dandan_anime WHERE payload != 'null'")
      .get() as { n: number };
    const m = conn.prepare('SELECT COUNT(*) AS n FROM dandan_miss').get() as { n: number };
    const last = conn
      .prepare('SELECT MAX(fetched_at) AS t FROM dandan_result')
      .get() as { t: number } | undefined;
    return {
      enabled: true,
      results: Number(r?.n) || 0,
      anime: Number(a?.n) || 0,
      misses: Number(m?.n) || 0,
      lastAt: Number(last?.t) || 0,
    };
  } catch {
    return { enabled: false, results: 0, anime: 0, misses: 0, lastAt: 0 };
  }
}
