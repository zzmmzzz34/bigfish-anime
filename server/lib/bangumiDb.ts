import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DATA_DIR } from './config.js';

export interface BgmSubjectRow {
  id: number;
  name: string;
  name_cn: string;
  summary: string;
  score: number;
  rank: number;
  rating_total: number;
  eps: number;
  date: string;
  platform: string;
  tags_json: string;
  images_json: string;
  fetched_at: number;
}

export interface BgmEpisodeRow {
  subject_id: number;
  sort: number;
  name: string;
  name_cn: string;
  airdate: string;
  duration: string;
  desc: string;
}

export interface BgmSubjectInput {
  id: number;
  name: string;
  nameCn: string;
  summary: string;
  score: number;
  rank: number;
  ratingTotal: number;
  eps: number;
  date: string;
  platform: string;
  tags: string[];
  images: unknown;
}

export interface BgmEpisodeInput {
  sort: number;
  name: string;
  nameCn: string;
  airdate: string;
  duration: string;
  desc: string;
}

const DB_FILE = path.join(DATA_DIR, 'bangumi.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS bgm_subject (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL DEFAULT '',
  name_cn       TEXT NOT NULL DEFAULT '',
  summary       TEXT NOT NULL DEFAULT '',
  score         REAL NOT NULL DEFAULT 0,
  rank          INTEGER NOT NULL DEFAULT 0,
  rating_total  INTEGER NOT NULL DEFAULT 0,
  eps           INTEGER NOT NULL DEFAULT 0,
  date          TEXT NOT NULL DEFAULT '',
  platform      TEXT NOT NULL DEFAULT '',
  tags_json     TEXT NOT NULL DEFAULT '[]',
  images_json   TEXT NOT NULL DEFAULT '{}',
  fetched_at    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_bgm_subject_fetched ON bgm_subject(fetched_at);

CREATE TABLE IF NOT EXISTS bgm_episode (
  subject_id    INTEGER NOT NULL,
  sort          REAL NOT NULL,
  name          TEXT NOT NULL DEFAULT '',
  name_cn       TEXT NOT NULL DEFAULT '',
  airdate       TEXT NOT NULL DEFAULT '',
  duration      TEXT NOT NULL DEFAULT '',
  desc          TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (subject_id, sort)
);
CREATE INDEX IF NOT EXISTS idx_bgm_episode_subject ON bgm_episode(subject_id);

CREATE TABLE IF NOT EXISTS bgm_sync (
  subject_id    INTEGER PRIMARY KEY,
  last_attempt  INTEGER NOT NULL DEFAULT 0,
  last_success  INTEGER NOT NULL DEFAULT 0,
  error         TEXT NOT NULL DEFAULT '',
  retry_at      INTEGER NOT NULL DEFAULT 0
);
`;

let db: any = null;
let tried = false;

function getDb() {
  if (tried) return db;
  tried = true;
  try {
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(DB_FILE);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA wal_autocheckpoint = 1000');
    db.exec(SCHEMA);
    console.log(`[bangumi] 缓存库 ${DB_FILE}`);
  } catch (err: any) {
    db = null;
    console.warn('[bangumi] SQLite 不可用，退回纯内存/实时模式:', err?.message || err);
  }
  return db;
}

export function cacheEnabled() {
  return Boolean(getDb());
}

export function subjectGet(id: number): BgmSubjectRow | null {
  const conn = getDb();
  if (!conn) return null;
  try {
    const row = conn.prepare('SELECT * FROM bgm_subject WHERE id = ?').get(id) as
      | BgmSubjectRow
      | undefined;
    return row || null;
  } catch {
    return null;
  }
}

export function subjectUpsert(input: BgmSubjectInput) {
  const conn = getDb();
  if (!conn) return;
  conn
    .prepare(
      `INSERT INTO bgm_subject
        (id, name, name_cn, summary, score, rank, rating_total, eps, date, platform, tags_json, images_json, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name=excluded.name, name_cn=excluded.name_cn, summary=excluded.summary,
         score=excluded.score, rank=excluded.rank, rating_total=excluded.rating_total,
         eps=excluded.eps, date=excluded.date, platform=excluded.platform,
         tags_json=excluded.tags_json, images_json=excluded.images_json,
         fetched_at=excluded.fetched_at`,
    )
    .run(
      input.id,
      input.name,
      input.nameCn,
      input.summary,
      input.score,
      input.rank,
      input.ratingTotal,
      input.eps,
      input.date,
      input.platform,
      JSON.stringify(input.tags || []),
      JSON.stringify(input.images || {}),
      Date.now(),
    );
}

export function episodesGet(subjectId: number): BgmEpisodeRow[] {
  const conn = getDb();
  if (!conn) return [];
  try {
    return conn
      .prepare('SELECT * FROM bgm_episode WHERE subject_id = ? ORDER BY sort ASC')
      .all(subjectId) as BgmEpisodeRow[];
  } catch {
    return [];
  }
}

export function episodesReplace(subjectId: number, list: BgmEpisodeInput[]) {
  const conn = getDb();
  if (!conn) return;
  conn.exec('BEGIN');
  try {
    conn.prepare('DELETE FROM bgm_episode WHERE subject_id = ?').run(subjectId);
    const stmt = conn.prepare(
      `INSERT INTO bgm_episode (subject_id, sort, name, name_cn, airdate, duration, desc)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const ep of list) {
      stmt.run(
        subjectId,
        Number(ep.sort) || 0,
        ep.name || '',
        ep.nameCn || '',
        ep.airdate || '',
        ep.duration || '',
        ep.desc || '',
      );
    }
    conn.exec('COMMIT');
  } catch (err) {
    try {
      conn.exec('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function syncMark(subjectId: number, ok: boolean, error = '') {
  const conn = getDb();
  if (!conn) return;
  const now = Date.now();
  conn
    .prepare(
      `INSERT INTO bgm_sync (subject_id, last_attempt, last_success, error, retry_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(subject_id) DO UPDATE SET
         last_attempt=excluded.last_attempt,
         last_success=CASE WHEN excluded.last_success > 0 THEN excluded.last_success ELSE bgm_sync.last_success END,
         error=excluded.error,
         retry_at=excluded.retry_at`,
    )
    .run(subjectId, now, ok ? now : 0, ok ? '' : error.slice(0, 500), ok ? 0 : now + 5 * 60_000);
}

export function cacheStats() {
  const conn = getDb();
  if (!conn) {
    return { enabled: false, subjects: 0, episodes: 0, latestFetchedAt: 0, fileBytes: 0, file: DB_FILE };
  }
  try {
    const subjects = Number(conn.prepare('SELECT COUNT(*) AS c FROM bgm_subject').get()?.c) || 0;
    const episodes = Number(conn.prepare('SELECT COUNT(*) AS c FROM bgm_episode').get()?.c) || 0;
    const latest = Number(conn.prepare('SELECT MAX(fetched_at) AS t FROM bgm_subject').get()?.t) || 0;
    let fileBytes = 0;
    for (const f of [DB_FILE, `${DB_FILE}-wal`]) {
      try {
        fileBytes += fs.statSync(f).size;
      } catch {
        /* ignore */
      }
    }
    return { enabled: true, subjects, episodes, latestFetchedAt: latest, fileBytes, file: DB_FILE };
  } catch {
    return { enabled: false, subjects: 0, episodes: 0, latestFetchedAt: 0, fileBytes: 0, file: DB_FILE };
  }
}
