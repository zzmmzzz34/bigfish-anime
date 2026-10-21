import { Router } from 'express';
import { getDb, newId, saveDb, saveDbNow } from './lib/store.js';
import { enabledSources, getSource, listSources, searchAll, alternates, detailSource, testSource, buildHome } from './lib/sources.js';
import { handleImage, handleProxy, resolveMedia } from './lib/proxy.js';
import { getCatalogWork, homeDiscover, matchSourceWorks } from './lib/catalog.js';
import { checkLines, getLineStat, recordLineReport } from './lib/health.js';
import { getAiring, getIndex, getTimeline } from './lib/bilibili.js';
import { getSeasonAnime, getTopAnime, getWeekSchedule } from './lib/anilist.js';
import { checkBangumi } from './lib/bangumi.js';
import { getBilibiliDanmaku } from './lib/bilibiliDanmaku.js';
import { cacheStats } from './lib/bangumiDb.js';
import {
  prefetchStatus,
  startPrefetch,
  type PrefetchScope,
} from './lib/bangumiPrefetch.js';
import { cacheClear } from './lib/http.js';
import { titleKey } from './lib/util.js';
import type { Comment, Danmaku, Source } from './lib/types.js';

export const api = Router();

const wrap =
  (fn: (req: any, res: any) => Promise<any>) =>
  (req: any, res: any, next: any) =>
    fn(req, res).catch((err) => {
      console.error('[api]', req.method, req.originalUrl, err?.message || err);
      res.status(err?.status || 500).json({ error: err?.message || '服务器开小差了' });
    });

api.get('/health', (_req, res) => {
  res.json({ ok: true, time: Date.now(), sources: listSources().length });
});

/* ---------------- 片源管理 ---------------- */

function normalizeSource(body: any, existing?: Source): Source {
  const type = body.type === 'kazumi' ? 'kazumi' : 'maccms';
  let rule = body.rule;
  if (typeof rule === 'string' && rule.trim()) {
    try {
      rule = JSON.parse(rule);
    } catch {
      throw Object.assign(new Error('规则 JSON 解析失败，请检查格式'), { status: 400 });
    }
  }
  const api = String(body.api || rule?.baseURL || existing?.api || '').trim();
  if (!api || !/^https?:\/\//i.test(api)) {
    throw Object.assign(new Error('请填写以 http(s):// 开头的接口地址'), { status: 400 });
  }
  if (type === 'kazumi' && !rule) {
    throw Object.assign(new Error('Kazumi 规则不能为空'), { status: 400 });
  }
  return {
    id: existing?.id || body.id || newId('src_'),
    name: String(body.name || rule?.name || existing?.name || '未命名源').trim().slice(0, 40),
    type,
    api,
    enabled: body.enabled !== undefined ? Boolean(body.enabled) : existing?.enabled ?? true,
    referer: String(body.referer || existing?.referer || '').trim() || undefined,
    userAgent: String(body.userAgent || existing?.userAgent || '').trim() || undefined,
    animeTypes: Array.isArray(body.animeTypes) ? body.animeTypes.slice(0, 30) : existing?.animeTypes,
    rule,
    createdAt: existing?.createdAt || Date.now(),
  };
}

api.get('/sources', (_req, res) => {
  // 本地应用：返回完整规则，供编辑页回填
  res.json(getDb().sources);
});

api.post('/sources', (req, res) => {
  const db = getDb();
  const source = normalizeSource(req.body);
  if (db.sources.some((s) => s.api === source.api)) {
    return res.status(409).json({ error: '这个接口已经添加过了' });
  }
  db.sources.push(source);
  saveDbNow();
  cacheClear();
  res.status(201).json({ ...source, rule: source.rule ? { name: source.rule.name } : undefined });
});

api.patch('/sources/:id', (req, res) => {
  const db = getDb();
  const source = db.sources.find((s) => s.id === req.params.id);
  if (!source) return res.status(404).json({ error: '片源不存在' });
  if (req.body.enabled !== undefined && Object.keys(req.body).length === 1) {
    source.enabled = Boolean(req.body.enabled);
  } else {
    Object.assign(source, normalizeSource({ ...source, ...req.body }, source));
  }
  saveDbNow();
  cacheClear();
  res.json({ ok: true });
});

api.delete('/sources/:id', (req, res) => {
  const db = getDb();
  const idx = db.sources.findIndex((s) => s.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: '片源不存在' });
  const [removed] = db.sources.splice(idx, 1);
  if (!removed) return res.status(500).json({ error: '删除失败' });
  const stored = (getDb() as any).removedSources || [];
  stored.push(removed.id);
  (getDb() as any).removedSources = [...new Set(stored)];
  saveDbNow();
  cacheClear();
  res.json({ ok: true });
});

api.post(
  '/sources/test',
  wrap(async (req, res) => {
    const existing = req.body.id ? getSource(req.body.id) : undefined;
    const source = existing && !req.body.api ? existing : normalizeSource(req.body, existing);
    const info = await testSource(source);
    res.json({ ...info, name: source.name, api: source.api });
  }),
);

/* ---------------- 内容检索 ---------------- */

api.get(
  '/home',
  wrap(async (_req, res) => {
    const [home] = await Promise.all([buildHome()]);
    const history = getDb().history.slice(0, 8);
    res.json({ ...home, history });
  }),
);

/* ---------------- 发现层（B站评分 / 放送表） ---------------- */

api.get(
  '/discover',
  wrap(async (_req, res) => {
    res.json(await homeDiscover());
  }),
);

api.get(
  '/discover/week',
  wrap(async (_req, res) => {
    res.json(await getTimeline());
  }),
);

api.get(
  '/airing',
  wrap(async (_req, res) => {
    res.json({ items: await getAiring(30) });
  }),
);

/* ---------------- AniList：新番 / 高分 / 周表 ---------------- */

api.get(
  '/anilist/airing',
  wrap(async (_req, res) => {
    res.json({ items: await getSeasonAnime(30) });
  }),
);

api.get(
  '/anilist/top',
  wrap(async (_req, res) => {
    res.json({ items: await getTopAnime(30) });
  }),
);

api.get(
  '/anilist/week',
  wrap(async (_req, res) => {
    res.json({ days: await getWeekSchedule() });
  }),
);

api.get(
  '/bangumi/status',
  wrap(async (_req, res) => {
    res.json(await checkBangumi());
  }),
);

api.get(
  '/bangumi/cache/stats',
  wrap(async (_req, res) => {
    res.json(cacheStats());
  }),
);

api.get(
  '/bangumi/prefetch/status',
  wrap(async (_req, res) => {
    res.json(prefetchStatus());
  }),
);

api.post(
  '/bangumi/prefetch',
  wrap(async (req, res) => {
    const raw = String(req.body?.scope || 'season');
    const scope: PrefetchScope = ['season', 'favorites', 'all'].includes(raw)
      ? (raw as PrefetchScope)
      : 'season';
    res.json(await startPrefetch(scope));
  }),
);

api.get(
  '/ranking',
  wrap(async (req, res) => {
    const type = ['play', 'follow', 'score'].includes(String(req.query.type))
      ? (String(req.query.type) as 'play' | 'follow' | 'score')
      : 'score';
    const page = Math.max(1, Number(req.query.page) || 1);
    res.json({ type, items: await getIndex(type, page, 24) });
  }),
);

api.get(
  '/catalog/:id/matches',
  wrap(async (req, res) => {
    const work = await getCatalogWork(req.params.id);
    const matches = await matchSourceWorks(work.title);
    res.json({ title: work.title, matches });
  }),
);

api.get(
  '/catalog/:id',
  wrap(async (req, res) => {
    res.json(await getCatalogWork(req.params.id));
  }),
);

api.get(
  '/search',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: '请输入关键词' });
    const result = await searchAll(q);
    res.json({ query: q, ...result });
  }),
);

api.get(
  '/detail',
  wrap(async (req, res) => {
    const sourceId = String(req.query.sourceId || '');
    const vodId = String(req.query.vodId || '');
    const source = getSource(sourceId);
    if (!source) return res.status(404).json({ error: '片源不存在' });
    if (!vodId) return res.status(400).json({ error: '缺少作品 ID' });
    const detail = await detailSource(source, vodId);
    if (!detail) return res.status(404).json({ error: '没有找到这部作品，可能已下架' });
    res.json(detail);
  }),
);

api.get(
  '/alternates',
  wrap(async (req, res) => {
    const title = String(req.query.title || '').trim();
    if (!title) return res.status(400).json({ error: '缺少标题' });
    const items = await alternates(title, String(req.query.exclude || ''));
    res.json({ items });
  }),
);

api.get(
  '/resolve',
  wrap(async (req, res) => {
    const url = String(req.query.url || '');
    if (!url) return res.status(400).json({ error: '缺少 url' });
    res.json(await resolveMedia(url));
  }),
);

/* ---------------- 弹幕 / 评论 ---------------- */

api.get(
  '/danmaku/bilibili',
  wrap(async (req, res) => {
    const season = Number(req.query.season);
    const ep = Math.max(0, Number(req.query.ep) || 0);
    if (!season || !Number.isFinite(season)) {
      return res.status(400).json({ error: '缺少 B站 season_id' });
    }
    res.json(await getBilibiliDanmaku(season, ep));
  }),
);

api.get('/danmaku', (req, res) => {
  const key = String(req.query.key || '');
  if (!key) return res.status(400).json({ error: '缺少 key' });
  res.json(getDb().danmaku[key] || []);
});

api.post('/danmaku', (req, res) => {
  const { key, text, color = '#ffffff', mode = 'scroll', time = 0 } = req.body || {};
  if (!key || !String(text || '').trim()) return res.status(400).json({ error: '弹幕内容不能为空' });
  const db = getDb();
  const item: Danmaku = {
    id: newId('dm_'),
    key: String(key),
    text: String(text).trim().slice(0, 80),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ffffff',
    mode: mode === 'top' || mode === 'bottom' ? mode : 'scroll',
    time: Math.max(0, Number(time) || 0),
    createdAt: Date.now(),
  };
  (db.danmaku[item.key] ||= []).push(item);
  if (db.danmaku[item.key].length > 4000) db.danmaku[item.key].splice(0, 500);
  saveDb();
  res.status(201).json(item);
});

api.get('/comments', (req, res) => {
  const key = String(req.query.key || '');
  if (!key) return res.status(400).json({ error: '缺少 key' });
  res.json(getDb().comments[key] || []);
});

api.post('/comments', (req, res) => {
  const { key, author = '匿名鱼', text, parentId } = req.body || {};
  if (!key || !String(text || '').trim()) return res.status(400).json({ error: '评论内容不能为空' });
  const db = getDb();
  const item: Comment = {
    id: newId('cm_'),
    key: String(key),
    author: String(author || '匿名鱼').trim().slice(0, 24) || '匿名鱼',
    text: String(text).trim().slice(0, 500),
    parentId: parentId ? String(parentId) : undefined,
    createdAt: Date.now(),
    likes: 0,
  };
  (db.comments[item.key] ||= []).unshift(item);
  saveDb();
  res.status(201).json(item);
});

/* ---------------- 历史 / 收藏 ---------------- */

api.get('/history', (_req, res) => {
  res.json(getDb().history);
});

api.post('/history', (req, res) => {
  const db = getDb();
  const body = req.body || {};
  if (!body.key) return res.status(400).json({ error: '缺少 key' });
  const item = {
    key: String(body.key),
    sourceId: String(body.sourceId || ''),
    sourceName: String(body.sourceName || ''),
    vodId: String(body.vodId || ''),
    title: String(body.title || ''),
    cover: String(body.cover || ''),
    lineIndex: Number(body.lineIndex || 0),
    episodeIndex: Number(body.episodeIndex || 0),
    episodeName: String(body.episodeName || ''),
    position: Number(body.position || 0),
    duration: Number(body.duration || 0),
    updatedAt: Date.now(),
  };
  db.history = [item, ...db.history.filter((h) => h.key !== item.key)].slice(0, 100);
  saveDb();
  res.json({ ok: true });
});

api.delete('/history', (req, res) => {
  const db = getDb();
  const key = String(req.query.key || '');
  db.history = key ? db.history.filter((h) => h.key !== key) : [];
  saveDb();
  res.json({ ok: true });
});

api.get('/favorites', (_req, res) => {
  res.json(getDb().favorites);
});

api.post('/favorites', (req, res) => {
  const db = getDb();
  const body = req.body || {};
  if (!body.key) return res.status(400).json({ error: '缺少 key' });
  const exists = db.favorites.find((f) => f.key === body.key);
  if (exists) {
    db.favorites = db.favorites.filter((f) => f.key !== body.key);
    saveDb();
    return res.json({ favorited: false });
  }
  db.favorites.unshift({
    key: String(body.key),
    sourceId: String(body.sourceId || ''),
    vodId: String(body.vodId || ''),
    title: String(body.title || ''),
    cover: String(body.cover || ''),
    year: String(body.year || ''),
    typeName: String(body.typeName || ''),
    createdAt: Date.now(),
  });
  saveDb();
  res.json({ favorited: true });
});

/* ---------------- 线路健康检查 ---------------- */

api.post(
  '/lines/health',
  wrap(async (req, res) => {
    const raw = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const force = Boolean(req.body?.force);
    const inputs = raw
      .slice(0, 20)
      .map((x: any) => ({
        key: String(x?.key || ''),
        url: String(x?.url || ''),
        sourceId: x?.sourceId ? String(x.sourceId) : undefined,
      }))
      .filter((x) => x.key && x.url);
    const results = await checkLines(inputs, 3, force);

    const sourceById = new Map<string, string | undefined>();
    for (const input of inputs) sourceById.set(input.key, input.sourceId);
    const stats: Record<string, { ok: number; fail: number; rate: number }> = {};
    for (const r of results) {
      const s = getLineStat(sourceById.get(r.key), r.url);
      if (s) stats[r.key] = s;
    }
    res.json({ results, stats, checkedAt: Date.now(), forced: force });
  }),
);

api.post(
  '/lines/report',
  wrap(async (req, res) => {
    const { sourceId, url, lineName, ok, error } = req.body || {};
    if (!url || typeof ok !== 'boolean') {
      return res.status(400).json({ error: '参数不完整' });
    }
    const stat = recordLineReport({
      sourceId: String(sourceId || ''),
      url: String(url),
      lineName: lineName ? String(lineName) : undefined,
      ok,
      error: error ? String(error) : undefined,
    });
    if (!stat) return res.status(400).json({ error: 'URL 无法识别' });
    res.json({ stat });
  }),
);

/* ---------------- 代理 ---------------- */

api.get('/proxy', handleProxy);
api.get('/image', handleImage);

api.use((_req, res) => res.status(404).json({ error: '接口不存在' }));
