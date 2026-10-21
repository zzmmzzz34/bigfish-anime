import { getAiring, getIndex, getSeason, type BiliCard, type BiliSeason } from './bilibili.js';
import {
  getAniListWork,
  getSeasonAnime,
  getTopAnime,
  getWeekSchedule,
  type AniCard,
  type AniWeekDay,
} from './anilist.js';
import { buildHome, detailSource, getSource, searchAll } from './sources.js';
import { titleKey } from './util.js';
import type { PlayLine, Work } from './types.js';

export interface MatchLine extends PlayLine {
  lineIndex: number;
}

export interface SourceMatch {
  sourceId: string;
  sourceName: string;
  vodId: string;
  title: string;
  cover: string;
  year: string;
  remarks: string;
  score: number;
  lines: MatchLine[];
}

export interface CatalogWork extends BiliSeason {
  studio: string;
  yearText: string;
}

export interface DiscoverHome {
  hero: CatalogWork[];
  trending: BiliCard[];
  topRated: BiliCard[];
  popular: BiliCard[];
  airing: BiliCard[];
  anilistAiring: AniCard[];
  anilistTop: AniCard[];
  anilistWeek: AniWeekDay[];
  latest: Work[];
  updatedAt: number;
}

function seriesKey(title: string) {
  return String(title || '')
    .replace(/\s*第\s*[0-9一二三四五六七八九十]+\s*[季期部]/g, '')
    .replace(/\s*[·:：-]?\s*[^\s]{1,8}(篇|章)$/g, '')
    .trim();
}

function uniqueSeries(list: BiliCard[]) {
  const seen = new Set<string>();
  const out: BiliCard[] = [];
  for (const c of list) {
    const key = seriesKey(c.title) || c.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function parseStudio(staff: string) {
  const m = String(staff || '').match(/动画制作[：:]\s*([^\n]+)/);
  return m ? m[1].trim() : '';
}

async function enrichCard(card: BiliCard): Promise<CatalogWork | null> {
  try {
    const s = await getSeason(card.id);
    return {
      ...s,
      title: card.title || s.title,
      cover: s.cover || card.cover,
      score: s.score || card.score,
      scoreText: s.scoreText || card.scoreText,
      studio: parseStudio(s.staff),
      yearText: s.year || '',
    };
  } catch {
    return null;
  }
}

export async function homeDiscover(): Promise<DiscoverHome> {
  const [followR, scoreR, playR, airingR, homeR, aniAirR, aniTopR, aniWeekR] =
    await Promise.allSettled([
      getIndex('follow', 1, 24),
      getIndex('score', 1, 24),
      getIndex('play', 1, 24),
      getAiring(18),
      buildHome(),
      getSeasonAnime(30),
      getTopAnime(30),
      getWeekSchedule(),
    ]);

  const follow = followR.status === 'fulfilled' ? followR.value : [];
  const topRated = scoreR.status === 'fulfilled' ? scoreR.value : [];
  const popular = playR.status === 'fulfilled' ? playR.value : [];
  const airing = airingR.status === 'fulfilled' ? airingR.value : [];
  const anilistAiring = aniAirR.status === 'fulfilled' ? aniAirR.value : [];
  const anilistTop = aniTopR.status === 'fulfilled' ? aniTopR.value : [];
  const anilistWeek = aniWeekR.status === 'fulfilled' ? aniWeekR.value : [];
  const latest =
    homeR.status === 'fulfilled'
      ? homeR.value.rows.find((r) => r.id === 'latest')?.items || homeR.value.rows[0]?.items || []
      : [];

  const hero = (
    await Promise.all(
      uniqueSeries(follow)
        .filter((c) => !/剧场版|电影|特别篇|总集篇/.test(c.title))
        .slice(0, 5)
        .map((c) => enrichCard(c)),
    )
  ).filter((x): x is CatalogWork => Boolean(x));

  return {
    hero,
    trending: follow,
    topRated,
    popular,
    airing,
    anilistAiring,
    anilistTop,
    anilistWeek,
    latest,
    updatedAt: Date.now(),
  };
}

export async function getCatalogWork(id: string): Promise<any> {
  if (id.startsWith('anilist-')) return getAniListWork(id.slice('anilist-'.length));
  const s = await getSeason(id);
  return { ...s, studio: parseStudio(s.staff), yearText: s.year || '' };
}

function scoreTitle(groupTitle: string, query: string) {
  const a = titleKey(query);
  const b = titleKey(groupTitle);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.startsWith(a)) return 70;
  if (a.startsWith(b)) return 55;
  if (b.includes(a)) return 45;
  return 0;
}

function normTitle(input: string) {
  return String(input || '')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[【】\[\]（）()《》「」『』·,，.。!！?？:：;；'"“”‘’~～\-—_/\\|+*&]/g, '');
}

function seasonOf(input: string) {
  const m = String(input || '').match(/第\s*([0-9一二三四五六七八九十]+)\s*[季期部]/);
  return m ? m[1] : '';
}

const DUB = /(国语|粤语|中配|台配|日语)版?/;

/** 严格同名：季数必须一致、配音版本必须一致，只允许极短的弧名补充 */
function strictMatch(candidate: string, target: string) {
  if (/解说|预告|花絮|片段/i.test(candidate)) return false;
  const a = normTitle(candidate);
  const b = normTitle(target);
  if (!a || !b) return false;
  if (a === b) return true;
  const sa = seasonOf(candidate);
  const sb = seasonOf(target);
  if (sa !== sb) return false;
  if (DUB.test(candidate) !== DUB.test(target)) return false;
  if (a.startsWith(b) && a.length - b.length <= 2) return true;
  if (b.startsWith(a) && b.length - a.length <= 2) return true;
  return false;
}

export async function matchSourceWorks(title: string): Promise<SourceMatch[]> {
  const queries = [
    title,
    title.replace(/\s*第\s*[0-9一二三四五六七八九十]+\s*[季期部]/g, '').trim(),
    title.replace(/[（(].*?[)）]/g, '').trim(),
  ].filter((v, i, arr) => v && arr.indexOf(v) === i);

  const pool: Work[] = [];
  for (const q of queries.slice(0, 2)) {
    try {
      const res = await searchAll(q);
      for (const g of res.groups) {
        if (scoreTitle(g.title, title) < 45) continue;
        pool.push(...g.items);
      }
    } catch {
      /* 单个源失败不影响整体 */
    }
    if (pool.length > 0) break;
  }

  const targetLen = normTitle(title).length;
  const candidates = pool
    .filter((w) => strictMatch(w.title, title))
    .filter((w, i, arr) => arr.findIndex((x) => x.key === w.key) === i)
    .sort(
      (a, b) =>
        Math.abs(normTitle(a.title).length - targetLen) -
        Math.abs(normTitle(b.title).length - targetLen),
    )
    .slice(0, 4);

  const matches: SourceMatch[] = [];
  for (const w of candidates) {
    const source = getSource(w.sourceId);
    if (!source) continue;
    try {
      const d = await detailSource(source, w.vodId);
      if (!d) continue;
      const lines = (d.lines || [])
        .map((l, i) => ({ ...l, lineIndex: i }))
        .filter((l) => l.episodes.length > 0)
        .sort((a, b) => {
          const ap = a.episodes.filter((e) => e.playable).length / a.episodes.length;
          const bp = b.episodes.filter((e) => e.playable).length / b.episodes.length;
          return bp - ap;
        });
      if (!lines.length) continue;
      matches.push({
        sourceId: w.sourceId,
        sourceName: w.sourceName,
        vodId: w.vodId,
        title: d.title,
        cover: d.cover || w.cover,
        year: d.year || w.year,
        remarks: d.remarks || w.remarks,
        score: 0,
        lines,
      });
    } catch {
      /* ignore */
    }
  }
  return matches;
}
