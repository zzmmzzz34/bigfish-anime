import { cached, request, requestJson, stripHtml } from './http.js';
import { isMediaUrl, toWork } from './util.js';
import type { Episode, PlayLine, Source, Work, WorkDetail } from './types.js';

/** Kazumi JSON Path 子集：$.a.b[*].c / $[0] / $['play-sources'] */
type Token = { type: 'field'; name: string } | { type: 'index'; index: number } | { type: 'all' };

function tokenize(path: string): Token[] {
  const tokens: Token[] = [];
  const body = String(path || '').trim().replace(/^\$/, '');
  const re = /\.([^.[\]]+)|\[(\d+)\]|\[['"]([^'"]+)['"]\]|\[\*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m[1] !== undefined) tokens.push({ type: 'field', name: m[1] });
    else if (m[2] !== undefined) tokens.push({ type: 'index', index: Number(m[2]) });
    else if (m[3] !== undefined) tokens.push({ type: 'field', name: m[3] });
    else tokens.push({ type: 'all' });
  }
  return tokens;
}

export function queryPath(root: any, path: string): any[] {
  if (!path || path === '$') return [root];
  let current: any[] = [root];
  for (const t of tokenize(path)) {
    const next: any[] = [];
    for (const node of current) {
      if (node == null) continue;
      if (t.type === 'field') {
        if (t.name in Object(node)) next.push(node[t.name]);
      } else if (t.type === 'index') {
        if (Array.isArray(node) && node[t.index] !== undefined) next.push(node[t.index]);
      } else if (t.type === 'all') {
        if (Array.isArray(node)) next.push(...node);
        else if (typeof node === 'object') next.push(...Object.values(node));
      }
    }
    current = next;
  }
  return current;
}

function pick(root: any, path: string, fallback = '') {
  const [v] = queryPath(root, path);
  if (v === undefined || v === null) return fallback;
  return typeof v === 'object' ? fallback : String(v);
}

function applyTemplate(template: string, vars: Record<string, string | number>) {
  return String(template || '').replace(/@([A-Za-z0-9_]+)/g, (whole, name) => {
    if (name in vars) return String(vars[name]);
    return whole;
  });
}

function absoluteUrl(raw: string, base: string) {
  const url = String(raw || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

interface KazumiRequestConfig {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  query?: Record<string, string | number>;
  body?: any;
  bodyType?: 'json' | 'form';
}

async function executeRequest(
  cfg: KazumiRequestConfig,
  vars: Record<string, string | number>,
  rule: any,
  source: Source,
) {
  const base = rule?.baseURL || source.api;
  const rawUrl = applyTemplate(cfg.url, vars);
  const fullUrl = absoluteUrl(rawUrl, base);
  const url = new URL(fullUrl);
  for (const [k, v] of Object.entries(cfg.query || {})) {
    url.searchParams.set(k, applyTemplate(String(v), vars));
  }
  const method = (cfg.method || 'GET').toUpperCase();
  const headers: Record<string, string> = {
    ...(rule?.headers || {}),
    ...(cfg.headers || {}),
    Referer: source.referer || new URL(base).origin + '/',
  };
  const init: RequestInit = { method, headers };
  if (method !== 'GET' && cfg.body !== undefined) {
    if (cfg.bodyType === 'form') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const form = new URLSearchParams();
      const body = typeof cfg.body === 'string' ? cfg.body : cfg.body;
      for (const [k, v] of Object.entries(body || {})) {
        form.set(k, applyTemplate(String(v), vars));
      }
      init.body = form.toString();
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(cfg.body);
    }
  }
  const res = await request(url.toString(), init, 12_000);
  if (!res.ok) throw new Error(`规则请求失败 ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('规则接口返回的不是 JSON');
  }
}

function splitLines(source: Source, rule: any, chapters: any): PlayLine[] {
  const cfg = rule.chapterApiConfig || {};
  const vars: Record<string, string | number> = {};
  for (const [k, path] of Object.entries(cfg.variables || {})) {
    vars[k] = pick(chapters, String(path));
  }

  if (cfg.format === 'delimited') {
    const names: string[] = String(
      pick(chapters, cfg.roadNamePath || cfg.roadNamesPath || '') || '',
    ).split(cfg.roadDelimiter || '$$$');
    const lists: string[] = String(
      pick(chapters, cfg.roadUrlPath || cfg.episodeListPath || '') || '',
    ).split(cfg.roadDelimiter || '$$$');
    return names.map((name, li) => {
      const episodes: Episode[] = [];
      String(lists[li] || '')
        .split(cfg.episodeDelimiter || '#')
        .forEach((part, ei) => {
          const [epName, epUrl] = part.split(cfg.nameDelimiter || '$');
          const url = absoluteUrl(epUrl || '', rule?.baseURL || source.api);
          if (!url) return;
          episodes.push({
            name: epName || `第${ei + 1}集`,
            url,
            index: ei,
            playable: isMediaUrl(url),
          });
        });
      return { name: name || `线路${li + 1}`, episodes };
    }).filter((l) => l.episodes.length);
  }

  const roads = queryPath(chapters, cfg.roadsPath || '$.data.playSources[*]');
  const lines: PlayLine[] = [];
  for (let ri = 0; ri < roads.length; ri++) {
    const road = roads[ri];
    const roadName = pick(road, cfg.roadNamePath || '$.name', `线路${ri + 1}`);
    const eps = queryPath(road, cfg.episodesPath || '$.episodes[*]');
    const episodes: Episode[] = [];
    for (let ei = 0; ei < eps.length; ei++) {
      const ep = eps[ei];
      let url = cfg.episodeUrlPath ? pick(ep, cfg.episodeUrlPath) : '';
      if (cfg.episodePage?.url) {
        const pageVars: Record<string, string | number> = {
          ...vars,
          ...(cfg.variables ? {} : {}),
          roadIndex: ri,
          episodeIndex: ei,
          roadNumber: ri + 1,
          episodeNumber: ei + 1,
          episodeUrl: url,
          episodeName: pick(ep, cfg.episodeNamePath || '$.name'),
        };
        let page = applyTemplate(cfg.episodePage.url, pageVars);
        page = absoluteUrl(page, rule?.baseURL || source.api);
        try {
          const u = new URL(page);
          for (const [k, v] of Object.entries(cfg.episodePage.query || {})) {
            u.searchParams.set(k, applyTemplate(String(v), pageVars));
          }
          url = u.toString();
        } catch {
          url = page;
        }
      }
      if (!/^https?:\/\//i.test(url)) continue;
      episodes.push({
        name: pick(ep, cfg.episodeNamePath || '$.name', `第${ei + 1}集`),
        url,
        index: ei,
        playable: isMediaUrl(url),
      });
    }
    if (episodes.length) lines.push({ name: roadName, episodes });
  }
  return lines;
}

export async function searchKazumi(source: Source, keyword: string): Promise<Work[]> {
  const rule = source.rule;
  const cfg = rule?.searchApiConfig;
  if (!cfg?.request?.url) throw new Error('规则缺少 searchApiConfig');
  return cached(`kazumi:search:${source.id}:${keyword}`, 3 * 60_000, async () => {
    const data = await executeRequest(cfg.request, { keyword }, rule, source);
    const list = queryPath(data, cfg.listPath || '$.data[*]');
    const works: Work[] = [];
    for (const item of list) {
      const sourceValue = pick(item, cfg.sourcePath || '$.id');
      let vodId = sourceValue;
      if (cfg.sourceTemplate) {
        vodId = applyTemplate(cfg.sourceTemplate, { source: encodeURIComponent(sourceValue) });
      }
      works.push(
        toWork(source, {
          vodId,
          title: pick(item, cfg.namePath || '$.name'),
          cover: pick(item, cfg.coverPath || '$.cover', ''),
          year: pick(item, cfg.yearPath || '$.year', ''),
          remarks: pick(item, cfg.remarksPath || '$.remarks', ''),
          synopsis: pick(item, cfg.descPath || '$.desc', ''),
        }),
      );
    }
    return works;
  });
}

export async function getKazumiDetail(source: Source, vodId: string): Promise<WorkDetail | null> {
  const rule = source.rule;
  const cfg = rule?.chapterApiConfig;
  if (!cfg?.request?.url) throw new Error('规则缺少 chapterApiConfig');
  return cached(`kazumi:detail:${source.id}:${vodId}`, 5 * 60_000, async () => {
    const data = await executeRequest(cfg.request, { source: vodId }, rule, source);
    const lines = splitLines(source, rule, data);
    if (!lines.length) return null;
    const first = lines[0].episodes[0];
    const total = Math.max(...lines.map((l) => l.episodes.length));
    return {
      ...toWork(source, {
        vodId,
        title: pick(data, rule.titlePath || '$.data.name', vodId),
        cover: pick(data, rule.coverPath || '$.data.cover', ''),
        year: pick(data, rule.yearPath || '$.data.year', ''),
        synopsis: pick(data, rule.descPath || '$.data.desc', ''),
        remarks: `${total} 集`,
      }),
      lines,
      total,
      episodeCount: total,
      synopsis: stripHtml(pick(data, rule.descPath || '$.data.desc', '')),
      ...(first ? {} : {}),
    };
  });
}

export async function testKazumiSource(source: Source) {
  const started = Date.now();
  const rule = source.rule || {};
  const sample = rule?.searchApiConfig ? await searchKazumi(source, rule.testKeyword || '紫罗兰') : [];
  return {
    ok: true,
    latency: Date.now() - started,
    mode: 'kazumi',
    categories: 0,
    animeCategories: [],
    sample: sample.slice(0, 3).map((w) => w.title),
    total: sample.length,
    note: `Kazumi 规则：${rule.name || source.name} v${rule.version || '?'}`,
  };
}
