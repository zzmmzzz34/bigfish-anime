import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './config.js';
import type {
  Comment,
  Danmaku,
  DanmakuMap,
  FavoriteItem,
  HistoryItem,
  LineStat,
  Source,
} from './types.js';

const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface ManualMatch {
  sourceId: string;
  sourceName: string;
  vodId: string;
  title: string;
  cover: string;
  year: string;
  remarks: string;
  createdAt: number;
}

export interface Database {
  sources: Source[];
  history: HistoryItem[];
  favorites: FavoriteItem[];
  danmaku: Record<string, Danmaku[]>;
  comments: Record<string, Comment[]>;
  lineStats: Record<string, LineStat>;
  danmakuMap: Record<string, DanmakuMap>;
  matchAlias: Record<string, string>;
  manualMatches: Record<string, ManualMatch[]>;
  settings: {
    danmakuEnabled: boolean;
    danmakuOpacity: number;
  };
}

const DEFAULT_SOURCES: Source[] = [
  {
    id: 'lz',
    name: '量子资源',
    type: 'maccms',
    api: 'https://cj.lziapi.com/api.php/provide/vod/',
    enabled: true,
    createdAt: 0,
  },
  {
    id: 'ff',
    name: '非凡资源',
    type: 'maccms',
    api: 'https://api.ffzyapi.com/api.php/provide/vod/',
    enabled: true,
    createdAt: 0,
  },
];

function emptyDb(): Database {
  return {
    sources: DEFAULT_SOURCES,
    history: [],
    favorites: [],
    danmaku: {},
    comments: {},
    lineStats: {},
    danmakuMap: {},
    matchAlias: {},
    manualMatches: {},
    settings: { danmakuEnabled: true, danmakuOpacity: 0.9 },
  };
}

let db: Database | null = null;
let timer: NodeJS.Timeout | null = null;

export function getDb(): Database {
  if (db) return db;
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    db = {
      ...emptyDb(),
      ...parsed,
      lineStats: parsed.lineStats || {},
      danmakuMap: parsed.danmakuMap || {},
      matchAlias: parsed.matchAlias || {},
      manualMatches: parsed.manualMatches || {},
      settings: { ...emptyDb().settings, ...(parsed.settings || {}) },
    };
    // 合并内置源（用户可删除，删除后 id 会记录在 removedSources）
    const removed: string[] = parsed.removedSources || [];
    for (const s of DEFAULT_SOURCES) {
      if (removed.includes(s.id)) continue;
      if (!db.sources.some((x) => x.id === s.id)) db.sources.push(s);
    }
    if (!db.sources.length) db.sources = [...DEFAULT_SOURCES];
  } catch {
    db = emptyDb();
  }
  return db;
}

export function saveDb() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    try {
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error('[store] 保存失败', err);
    }
  }, 200);
}

export function saveDbNow() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

export function newId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
