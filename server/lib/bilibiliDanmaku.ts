import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, UA } from './config.js';
import { cached, stripHtml } from './http.js';

export interface BiliDanmakuItem {
  id: string;
  key: string;
  text: string;
  color: string;
  mode: 'scroll' | 'top' | 'bottom';
  time: number;
  createdAt: number;
}

export interface BiliEpisode {
  index: number;
  id: number;
  cid: number;
  title: string;
  longTitle: string;
  cover: string;
}

const DM_DIR = path.join(CACHE_DIR, 'bilibili-dm');
const HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/',
  Accept: 'application/json, text/plain, */*',
};

async function biliGetJson(pathname: string) {
  const res = await fetch(`https://api.bilibili.com${pathname}`, {
    headers: HEADERS,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`B站 HTTP ${res.status}`);
  const json: any = await res.json();
  if (json?.code !== 0) throw new Error(`B站接口：${json?.message || json?.code}`);
  return json.result;
}

export async function getBiliEpisodes(seasonId: number): Promise<BiliEpisode[]> {
  return cached(`bili:season:${seasonId}`, 60 * 60_000, async () => {
    const result = await biliGetJson(`/pgc/view/web/season?season_id=${seasonId}`);
    const eps = Array.isArray(result?.episodes) ? result.episodes : [];
    if (!eps.length) throw new Error('这部番没有可用的 B站分集');
    return eps.map((ep: any, index: number) => ({
      index,
      id: Number(ep.id) || 0,
      cid: Number(ep.cid) || 0,
      title: String(ep.title || index + 1),
      longTitle: String(ep.long_title || ep.title || ''),
      cover: String(ep.cover || ''),
    }));
  });
}

function modeOf(raw: number): BiliDanmakuItem['mode'] {
  if (raw === 4) return 'bottom';
  if (raw === 5) return 'top';
  return 'scroll';
}

function colorOf(raw: number) {
  const n = Math.max(0, Math.min(0xffffff, raw || 0xffffff));
  return `#${n.toString(16).padStart(6, '0')}`;
}

function parseXml(xml: string, cid: number): BiliDanmakuItem[] {
  const items: BiliDanmakuItem[] = [];
  const re = /<d p="([^"]*)"[^>]*>([\s\S]*?)<\/d>/g;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = re.exec(xml))) {
    const parts = match[1].split(',');
    const time = Number(parts[0]);
    if (!Number.isFinite(time) || time < 0) continue;
    const text = stripHtml(match[2]).replace(/\s+/g, ' ').trim();
    if (!text || text.length > 200) continue;
    items.push({
      id: `bili:${cid}:${i++}`,
      key: `bili:${cid}`,
      text,
      color: colorOf(Number(parts[3]) || 0xffffff),
      mode: modeOf(Number(parts[1]) || 1),
      time: Math.round(time * 100) / 100,
      createdAt: 0,
    });
    if (items.length >= 3000) break;
  }
  return items;
}

async function fetchXml(cid: number, pid: number) {
  const res = await fetch(`https://api.bilibili.com/x/v1/dm/list.so?oid=${cid}`, {
    headers: {
      ...HEADERS,
      Referer: `https://www.bilibili.com/bangumi/play/ep${pid}`,
      Accept: 'text/xml,application/xml,*/*',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`B站弹幕 HTTP ${res.status}`);
  const xml = await res.text();
  if (!xml.includes('<d p=')) throw new Error('B站没有返回弹幕 XML');
  return xml;
}

async function loadDanmaku(cid: number, pid: number): Promise<BiliDanmakuItem[]> {
  fs.mkdirSync(DM_DIR, { recursive: true });
  const file = path.join(DM_DIR, `${cid}.json`);
  try {
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs < 6 * 3600_000) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (Array.isArray(raw?.items)) return raw.items;
    }
  } catch {
    /* cache miss */
  }

  const xml = await fetchXml(cid, pid);
  const items = parseXml(xml, cid);
  try {
    fs.writeFileSync(file, JSON.stringify({ cid, at: Date.now(), items }), 'utf8');
  } catch {
    /* 缓存写失败不影响播放 */
  }
  return items;
}

export async function getBilibiliDanmaku(seasonId: number, epIndex: number) {
  return cached(`bili:dm:${seasonId}:${epIndex}`, 10 * 60_000, async () => {
    const episodes = await getBiliEpisodes(seasonId);
    const ep = episodes[epIndex];
    if (!ep) {
      const err: any = new Error(`B站没有第 ${epIndex + 1} 集`);
      err.status = 404;
      throw err;
    }
    if (!ep.cid) throw new Error('这一集缺少 B站 cid，无法获取弹幕');
    const items = await loadDanmaku(ep.cid, ep.id);
    return {
      source: 'bilibili',
      seasonId,
      episodeIndex: epIndex,
      cid: ep.cid,
      episodeTitle: ep.longTitle || ep.title,
      count: items.length,
      items,
    };
  });
}
