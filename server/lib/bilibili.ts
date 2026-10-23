import { cached, request, HttpError } from './http.js';
import { UA } from './config.js';
import { titleKey } from './util.js';

const API = 'https://api.bilibili.com';
const HEADERS = {
  'User-Agent': UA,
  Referer: 'https://www.bilibili.com/',
  Origin: 'https://www.bilibili.com',
  Accept: 'application/json, text/plain, */*',
};

export async function bili<T = any>(path: string, timeout = 15_000): Promise<T> {
  const res = await request(API + path, { headers: HEADERS }, timeout);
  if (!res.ok) throw new HttpError(`B站接口返回 ${res.status}`, 502);
  const json: any = await res.json();
  if (json?.code !== 0) throw new HttpError(`B站接口错误: ${json?.message || json?.code}`, 502);
  return (json.data ?? json.result) as T;
}

function fixUrl(url: string) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice(7)}`;
  return raw;
}

const CN_SEASON: Record<string, string> = {
  一: '1',
  二: '2',
  三: '3',
  四: '4',
  五: '5',
  六: '6',
  七: '7',
  八: '8',
  九: '9',
  十: '10',
};

function seasonMarker(title: string) {
  const s = String(title || '');
  const m =
    s.match(/第\s*([一二三四五六七八九十\d]+)\s*[季期部]/) ||
    s.match(/Season\s*(\d+)/i) ||
    s.match(/\bS(\d+)\b/i);
  return m ? CN_SEASON[m[1]] || m[1] : '';
}

const BILI_DUB = /中配|中文配音|国语|粤语|台配|日语版/i;

/** 按标题搜 B站番剧；仅返回标题与季数都匹配的 season_id，避免乱映射 */
export async function findSeasonByTitle(title: string): Promise<number> {
  const key = titleKey(title);
  if (!key) return 0;
  const wantedSeason = seasonMarker(title);
  const targetDub = BILI_DUB.test(title);
  return cached(`bili:title-season:${key}:${wantedSeason}:${targetDub}`, 7 * 24 * 3600_000, async () => {
    const url =
      `/x/web-interface/search/type?search_type=media_bangumi&keyword=${encodeURIComponent(title)}`;
    const data: any = await bili(url);
    const list = Array.isArray(data?.result) ? data.result : [];
    const hit = list.find((item: any) => {
      const name = String(item?.title || '').replace(/<[^>]+>/g, '');
      if (!targetDub && BILI_DUB.test(name)) return false;
      return titleKey(name) === key && seasonMarker(name) === wantedSeason;
    });
    return Number(hit?.season_id) || 0;
  });
}

export interface BiliCard {
  id: string;
  site: 'bilibili';
  title: string;
  cover: string;
  score: number;
  scoreText: string;
  orderText: string;
  episodesText: string;
  isFinish: boolean;
  badge: string;
  link: string;
  year?: string;
  area?: string;
  genres?: string[];
  synopsis?: string;
  total?: number;
  actors?: string;
  staff?: string;
}

function toCard(raw: any): BiliCard {
  return {
    id: String(raw.season_id ?? raw.seasonId),
    site: 'bilibili',
    title: String(raw.title || '').trim(),
    cover: fixUrl(raw.cover),
    score: Number(raw.score) || 0,
    scoreText: Number(raw.score) ? String(raw.score) : '',
    orderText: String(raw.order || ''),
    episodesText: String(raw.index_show || raw.subTitle || ''),
    isFinish: Boolean(raw.is_finish),
    badge: String(raw.badge || ''),
    link: String(raw.link || ''),
  };
}

const ORDER = { play: 2, follow: 3, score: 4 } as const;

export async function getIndex(
  type: 'play' | 'follow' | 'score' = 'follow',
  page = 1,
  size = 24,
  airing = false,
): Promise<BiliCard[]> {
  const order = ORDER[type] || 3;
  const flag = airing ? '&is_finish=0' : '';
  return cached(`bili:index:${type}:${page}:${size}:${airing}`, 15 * 60_000, async () => {
    const data: any = await bili(
      `/pgc/season/index/result?season_type=1&order=${order}&sort=0&page=${page}&pagesize=${size}&type=1${flag}`,
    );
    const list = Array.isArray(data?.list) ? data.list : [];
    return list.map(toCard).filter((c) => c.id && c.title);
  });
}

function parseFollows(text: string) {
  const m = String(text || '').match(/([\d.]+)\s*(万|亿)?\s*追/);
  if (!m) return 0;
  const n = Number(m[1]) || 0;
  if (m[2] === '亿') return n * 100_000_000;
  if (m[2] === '万') return n * 10_000;
  return n;
}

const AIRING_BLOCK =
  /剧场版|电影|中配|中文配音|国语|小猪佩奇|汪汪队|宝宝|儿歌|儿童|亲子|早教|益智|奥特曼|超级飞侠|贝乐虎|布鲁可|瑞奇宝宝|碰碰狐|工程车|恐龙|动画片/i;

export async function getAiring(size = 18): Promise<BiliCard[]> {
  return cached(`bili:airing:${size}`, 20 * 60_000, async () => {
    const list = await getIndex('follow', 1, 50, true);
    const seen = new Set<string>();
    const out: BiliCard[] = [];
    for (const c of list) {
      if (c.isFinish) continue;
      if (AIRING_BLOCK.test(c.title)) continue;
      if (/裸熊|迪士尼|超能陆战队/.test(c.title)) continue;
      if (/上映/.test(c.episodesText)) continue;
      const epNum = Number((c.episodesText.match(/(\d+)/) || [])[1] || 0);
      if (epNum > 200) continue;
      const follow = parseFollows(c.orderText);
      if (follow > 0 && follow < 30_000) continue;
      const key = c.title.replace(/（中配）|\(中配\)|中文配音|国语版?/g, '').trim();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(c);
      if (out.length >= size) break;
    }
    return out;
  });
}

export interface BiliSeason extends BiliCard {
  ratingCount: number;
  status: string;
  subtitle: string;
  episodes: Array<{ title: string; longTitle: string; cover: string; pubTime: number }>;
  seasonTitle: string;
}

export async function getSeason(id: string | number): Promise<BiliSeason> {
  return cached(`bili:season:${id}`, 60 * 60_000, async () => {
    const r: any = await bili(`/pgc/view/web/season?season_id=${id}`);
    const publish = r?.publish || {};
    const eps = Array.isArray(r?.episodes) ? r.episodes : [];
    return {
      id: String(r?.season_id ?? id),
      site: 'bilibili',
      title: String(r?.title || r?.season_title || '').trim(),
      seasonTitle: String(r?.season_title || r?.title || '').trim(),
      cover: fixUrl(r?.cover),
      score: Number(r?.rating?.score) || 0,
      scoreText: r?.rating?.score ? String(r.rating.score) : '',
      ratingCount: Number(r?.rating?.count) || 0,
      orderText: String(r?.stat?.follow_text || ''),
      episodesText: String(r?.new_ep?.desc || ''),
      isFinish: Boolean(publish?.is_finish),
      badge: '',
      link: String(r?.link || `https://www.bilibili.com/bangumi/play/ss${id}`),
      year: String(publish?.pub_time || '').slice(0, 4),
      area: (r?.areas || []).map((a: any) => a.name).filter(Boolean).join(' / '),
      genres: Array.isArray(r?.styles) ? r.styles : [],
      synopsis: String(r?.evaluate || '').trim(),
      total: Number(r?.total) || eps.length,
      actors: String(r?.actors || '').trim(),
      staff: String(r?.staff || '').trim(),
      status: String(r?.new_ep?.desc || (publish?.is_finish ? '已完结' : '连载中')),
      subtitle: String(r?.subtitle || ''),
      episodes: eps.map((e: any) => ({
        title: String(e.title || ''),
        longTitle: String(e.long_title || ''),
        cover: fixUrl(e.cover),
        pubTime: Number(e.pub_time) || 0,
      })),
    };
  });
}

export interface TimelineItem {
  id: string;
  seasonId: string;
  title: string;
  cover: string;
  pubIndex: string;
  pubTime: string;
  episodeId: number;
  weekday: number;
  date: string;
}

export interface WeekDay {
  weekday: number;
  label: string;
  date: string;
  isToday: boolean;
  items: TimelineItem[];
}

const EXCLUDE = /小队|宝宝|儿歌|儿童|亲子|益智|启蒙|动画片|恐龙|工程车|早教|中配|中文配音|国语版|汽车|奥特曼|汪汪队|超级飞侠|小猪佩奇|贝乐虎|碰碰狐|瑞奇宝宝|布鲁可/i;

function cleanTitle(t: string) {
  return String(t || '').replace(/\s+/g, ' ').trim();
}

function dedupe(items: TimelineItem[]) {
  const seen = new Set<string>();
  const out: TimelineItem[] = [];
  for (const it of items) {
    const key = it.title + '|' + it.pubIndex;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

export async function getTimeline(): Promise<WeekDay[]> {
  return cached('bili:timeline', 20 * 60_000, async () => {
    const days: any[] = await bili('/pgc/web/timeline?types=1&before=6&after=6');
    const now = new Date();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

    const pad = (n: number) => String(n).padStart(2, '0');
    const md = (d: Date) => `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const byDate = new Map<string, any>();
    for (const d of days) if (d?.date) byDate.set(String(d.date), d);

    const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const result: WeekDay[] = [];
    for (let w = 1; w <= 7; w++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + w - 1);
      const key = md(date);
      const entry = byDate.get(key);
      const eps: any[] = Array.isArray(entry?.episodes) ? entry.episodes : [];
      const items = dedupe(
        eps
          .filter((e) => e && e.title && !EXCLUDE.test(String(e.title)))
          .map((e) => ({
            id: `${e.season_id}:${e.episode_id}`,
            seasonId: String(e.season_id || ''),
            title: cleanTitle(e.title),
            cover: fixUrl(e.cover),
            pubIndex: String(e.pub_index || ''),
            pubTime: String(e.pub_time || ''),
            episodeId: Number(e.episode_id) || 0,
            weekday: w,
            date: key,
          }))
          .filter((e) => e.seasonId && e.title),
      );
      result.push({
        weekday: w,
        label: labels[w - 1],
        date: key,
        isToday: key === md(now),
        items,
      });
    }
    return result;
  });
}
