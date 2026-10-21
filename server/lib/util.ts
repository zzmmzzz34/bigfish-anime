import { stripHtml } from './http.js';
import type { Episode, PlayLine, Source, Work } from './types.js';

/** 标题归一化：用于跨源去重/匹配 */
export function titleKey(title: string) {
  return String(title || '')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[\[【(（]\s*(电影)?解说\s*[\]】)）]/g, '')
    .replace(/[【】\[\]（）()《》<>「」『』·,，.。!！?？:：;；'"“”‘’~～\-—_/\\|+*&]/g, '')
    .replace(/第[一二三四五六七八九十百千0-9]+[季部期]/g, '')
    .replace(/(全|共)?\d+[集话話]/g, '')
    .replace(/(国语|粤语|日语|中配|台配|英语|中字)版?/g, '')
    .replace(/(高清|蓝光|中文字幕|无删减|完整版|hd|bd|1080p|720p|4k)/g, '')
    .trim();
}

export function normalizeCover(src: string) {
  const v = String(src || '').trim();
  if (!v) return '';
  if (v.startsWith('//')) return 'https:' + v;
  if (v.startsWith('http://')) return 'https://' + v.slice(7);
  return v;
}

export function splitActors(raw: string) {
  return String(raw || '')
    .split(/[,，/、|]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function episodeNumber(name: string): number | null {
  const n = String(name || '');
  const patterns = [
    /第\s*(\d+)\s*[集话話期]/,
    /(?:^|[^a-z])ep?\.?\s*(\d{1,4})(?:[^0-9]|$)/i,
    /(?:^|\D)(\d{1,4})\s*[集话話]/,
    /^\s*(\d{1,4})\s*$/,
  ];
  for (const re of patterns) {
    const m = n.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

export function toWork(
  source: Pick<Source, 'id' | 'name'>,
  raw: {
    vodId: string | number;
    title: string;
    cover?: string;
    year?: string | number;
    area?: string;
    typeName?: string;
    remarks?: string;
    director?: string;
    actors?: string;
    synopsis?: string;
    updatedAt?: string;
    episodeCount?: number;
  },
): Work {
  const vodId = String(raw.vodId);
  return {
    key: `${source.id}:${vodId}`,
    sourceId: source.id,
    sourceName: source.name,
    vodId,
    title: String(raw.title || '').trim() || '未命名',
    cover: normalizeCover(raw.cover || ''),
    year: String(raw.year || '').trim(),
    area: String(raw.area || '').trim(),
    typeName: String(raw.typeName || '').trim(),
    remarks: String(raw.remarks || '').trim(),
    director: String(raw.director || '').trim(),
    actors: splitActors(String(raw.actors || '')),
    synopsis: stripHtml(String(raw.synopsis || '')).slice(0, 1200),
    updatedAt: String(raw.updatedAt || '').trim(),
    episodeCount: Number(raw.episodeCount || 0) || 0,
  };
}

const MEDIA_RE = /\.(m3u8|mp4)(\?|#|$)/i;

export function isMediaUrl(url: string) {
  return MEDIA_RE.test(String(url || ''));
}

/** 解析 MacCMS 的 vod_play_from / vod_play_url */
export function parseMacPlayUrls(item: any): PlayLine[] {
  const froms = String(item.vod_play_from || '').split('$$$');
  const urls = String(item.vod_play_url || '').split('$$$');
  const lines: PlayLine[] = [];

  for (let i = 0; i < Math.max(froms.length, urls.length); i++) {
    const name = (froms[i] || `线路${i + 1}`).trim() || `线路${i + 1}`;
    const chunk = urls[i] || '';
    if (!chunk.trim()) continue;

    const episodes: Episode[] = [];
    const seen = new Set<string>();
    for (const part of chunk.split('#')) {
      const idx = part.indexOf('$');
      let epName = idx >= 0 ? part.slice(0, idx) : '';
      let url = idx >= 0 ? part.slice(idx + 1) : part;
      url = String(url || '').trim();
      if (!/^https?:\/\//i.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      epName = epName.trim() || `第${episodes.length + 1}集`;
      episodes.push({
        name: epName,
        url,
        index: episodes.length,
        playable: isMediaUrl(url),
      });
    }

    if (!episodes.length) continue;
    // 优先保留直链线路（m3u8/mp4），没有直链也保留，方便手动嗅探
    lines.push({ name, episodes });
  }

  lines.sort((a, b) => {
    const ap = a.episodes.filter((e) => e.playable).length / a.episodes.length;
    const bp = b.episodes.filter((e) => e.playable).length / b.episodes.length;
    return bp - ap;
  });
  return lines;
}

export function pickBestLine(lines: PlayLine[]): PlayLine | null {
  return lines.find((l) => l.episodes.some((e) => e.playable)) || lines[0] || null;
}

export function formatUpdate(raw: any) {
  const t = Number(raw?.vod_time || 0);
  if (!t) return '';
  return new Date(t * 1000).toISOString();
}
