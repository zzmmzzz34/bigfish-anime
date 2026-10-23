import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import { getDb, saveDbNow } from './store.js';

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_VERSION = 1;

function sanitizeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function sanitizeObject<T>(value: unknown): Record<string, T> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

export function backupData() {
  const db = getDb();
  return {
    version: BACKUP_VERSION,
    app: 'bigfish-anime',
    exportedAt: new Date().toISOString(),
    data: {
      history: db.history,
      favorites: db.favorites,
      danmaku: db.danmaku,
      comments: db.comments,
      lineStats: db.lineStats,
      danmakuMap: db.danmakuMap,
      matchAlias: db.matchAlias,
      manualMatches: db.manualMatches,
      settings: db.settings,
      // 片源配置一并备份，但导入时默认不覆盖，避免误改 API
      sources: db.sources,
    },
  };
}

export function backupStatus() {
  let files: Array<{ name: string; size: number; mtime: number }> = [];
  try {
    files = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, name));
        return { name, size: stat.size, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10);
  } catch {
    /* no backups yet */
  }
  const db = getDb();
  return {
    counts: {
      history: db.history.length,
      favorites: db.favorites.length,
      danmakuKeys: Object.keys(db.danmaku).length,
      commentKeys: Object.keys(db.comments).length,
      aliases: Object.keys(db.matchAlias || {}).length,
      manualMatches: Object.values(db.manualMatches || {}).reduce((n, list) => n + list.length, 0),
    },
    backups: files,
  };
}

export function importBackup(payload: any) {
  if (!payload || payload.version !== BACKUP_VERSION || !payload.data) {
    throw new Error('备份文件格式不正确');
  }
  const data = payload.data;
  const db = getDb();
  db.history = sanitizeArray(data.history);
  db.favorites = sanitizeArray(data.favorites);
  db.danmaku = sanitizeObject(data.danmaku);
  db.comments = sanitizeObject(data.comments);
  db.lineStats = sanitizeObject(data.lineStats);
  db.danmakuMap = sanitizeObject(data.danmakuMap);
  db.matchAlias = sanitizeObject(data.matchAlias);
  db.manualMatches = sanitizeObject(data.manualMatches);
  db.settings = { ...db.settings, ...(sanitizeObject(data.settings) as any) };
  // sources 不覆盖：保留当前本地配置
  saveDbNow();
  return backupStatus();
}

export function backupNow() {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const now = new Date();
    const stamp = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');
    const file = path.join(BACKUP_DIR, `db-${stamp}.json`);
    if (fs.existsSync(file)) return file;
    saveDbNow();
    fs.writeFileSync(file, JSON.stringify(backupData(), null, 2), 'utf8');
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((name) => /^db-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort();
    for (const old of files.slice(0, Math.max(0, files.length - 14))) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
    }
    console.log(`[backup] ${file}`);
    return file;
  } catch (err: any) {
    console.warn('[backup] 失败:', err?.message || err);
    return '';
  }
}

export function startBackupScheduler() {
  setTimeout(() => backupNow(), 20_000);
  setInterval(() => backupNow(), 24 * 3600_000).unref();
}
