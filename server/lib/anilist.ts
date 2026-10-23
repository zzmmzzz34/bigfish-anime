import { cachedPersistent, stripHtml } from './http.js';
import { UA } from './config.js';
import { zhTitle } from './anilistZh.js';
import { enrichBangumi } from './bangumi.js';
import { biliSeasonForAniList } from './bilibiliDanmaku.js';

const ENDPOINT = 'https://graphql.anilist.co';

const MEDIA_FIELDS = `
  id
  title { romaji native english }
  synonyms
  coverImage { extraLarge large color }
  bannerImage
  averageScore
  popularity
  episodes
  status
  genres
  description
  season
  seasonYear
  siteUrl
  nextAiringEpisode { airingAt episode }
`;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': UA,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json: any = await res.json();
  if (json.errors?.length) throw new Error(`AniList: ${json.errors[0]?.message || 'GraphQL error'}`);
  return json.data as T;
}

export interface AniCard {
  id: string;
  site: 'anilist';
  title: string;
  titleAlt: string;
  nativeTitle: string;
  englishTitle: string;
  cover: string;
  banner: string;
  score: number;
  scoreText: string;
  popularity: number;
  popularityText: string;
  episodes: number;
  episodesText: string;
  status: string;
  statusText: string;
  year: string;
  season: string;
  genres: string[];
  description: string;
  link: string;
  nextEpisode?: { airingAt: number; episode: number };
}

export interface AniScheduleItem extends AniCard {
  airingAt: number;
  episode: number;
  timeText: string;
  href?: string;
}

export interface AniWeekDay {
  weekday: number;
  label: string;
  date: string;
  isToday: boolean;
  items: AniScheduleItem[];
}

const SH_OFFSET = 8 * 3600_000;
const pad = (n: number) => String(n).padStart(2, '0');

const GENRE_ZH: Record<string, string> = {
  Action: '动作',
  Adventure: '冒险',
  Comedy: '喜剧',
  Drama: '剧情',
  Fantasy: '奇幻',
  Horror: '恐怖',
  'Mahou Shoujo': '魔法少女',
  Mecha: '机甲',
  Music: '音乐',
  Mystery: '悬疑',
  Psychological: '心理',
  Romance: '恋爱',
  'Sci-Fi': '科幻',
  'Slice of Life': '日常',
  Sports: '运动',
  Supernatural: '超自然',
  Thriller: '惊悚',
  Ecchi: '福利',
  School: '校园',
  Historical: '历史',
  Military: '军事',
  Space: '太空',
  Vampire: '吸血鬼',
  Demons: '恶魔',
  Magic: '魔法',
  Isekai: '异世界',
  Josei: '女性向',
  Seinen: '青年向',
  Shounen: '少年向',
  Shoujo: '少女向',
  Gourmet: '美食',
  Workplace: '职场',
  'Time Travel': '时间旅行',
  Harem: '后宫',
  Detective: '侦探',
  Samurai: '武士',
  Idol: '偶像',
  Survival: '生存',
  Revenge: '复仇',
  Gore: '血腥',
  'Martial Arts': '武术',
  'Super Power': '超能力',
  Game: '游戏',
  Parody: '恶搞',
  Kids: '少儿',
  Cars: '赛车',
  Police: '警察',
  Mafia: '黑帮',
  'Post-Apocalyptic': '末世',
  'Gender Bender': '性转',
  'Love Triangle': '三角恋',
  'Adult Cast': '成人向',
};

function statusText(status: string) {
  if (status === 'RELEASING') return '连载中';
  if (status === 'FINISHED') return '已完结';
  if (status === 'NOT_YET_RELEASED') return '未开播';
  if (status === 'CANCELLED') return '已取消';
  if (status === 'HIATUS') return '停更';
  return status || '';
}

function popularityText(n: number) {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)} 万关注`;
  return `${n} 关注`;
}

function normalize(media: any): AniCard {
  const zh = zhTitle(media);
  const native = String(media?.title?.native || '');
  const romaji = String(media?.title?.romaji || '');
  const english = String(media?.title?.english || '');
  const title = zh || native || romaji || english || '未命名';
  const avg = Number(media?.averageScore) || 0;
  const score = avg ? Math.round(avg) / 10 : 0;
  const eps = Number(media?.episodes) || 0;
  const st = statusText(String(media?.status || ''));
  const next = media?.nextAiringEpisode;

  return {
    id: String(media?.id ?? ''),
    site: 'anilist',
    title,
    titleAlt: zh ? native || romaji : romaji || english,
    nativeTitle: native,
    englishTitle: english,
    cover: String(media?.coverImage?.extraLarge || media?.coverImage?.large || ''),
    banner: String(media?.bannerImage || ''),
    score,
    scoreText: score ? score.toFixed(1) : '',
    popularity: Number(media?.popularity) || 0,
    popularityText: popularityText(Number(media?.popularity) || 0),
    episodes: eps,
    episodesText: eps ? `${eps} 话` : st,
    status: String(media?.status || ''),
    statusText: st,
    year: String(media?.seasonYear || ''),
    season: String(media?.season || ''),
    genres: Array.isArray(media?.genres)
      ? media.genres.map((g: string) => GENRE_ZH[g] || g)
      : [],
    description: stripHtml(String(media?.description || '')).slice(0, 2000),
    link: String(media?.siteUrl || (media?.id ? `https://anilist.co/anime/${media.id}` : '')),
    nextEpisode: next
      ? { airingAt: Number(next.airingAt) || 0, episode: Number(next.episode) || 0 }
      : undefined,
  };
}

export function currentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const season = month <= 3 ? 'WINTER' : month <= 6 ? 'SPRING' : month <= 9 ? 'SUMMER' : 'FALL';
  return { season, year };
}

export async function getSeasonAnime(perPage = 30) {
  const { season, year } = currentSeason();
  return cachedPersistent(`anilist:season:${season}:${year}:${perPage}`, 30 * 60_000, async () => {
    const data = await gql<any>(
      `query($season: MediaSeason, $year: Int, $per: Int) {
        Page(page: 1, perPage: $per) {
          media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC,
                isAdult: false, format_in: [TV, TV_SHORT, ONA]) { ${MEDIA_FIELDS} }
        }
      }`,
      { season, year, per: perPage },
    );
    return (data.Page.media || []).map(normalize);
  });
}

export async function getTopAnime(perPage = 30) {
  return cachedPersistent(`anilist:top:${perPage}`, 60 * 60_000, async () => {
    const data = await gql<any>(
      `query($per: Int) {
        Page(page: 1, perPage: $per) {
          media(type: ANIME, sort: SCORE_DESC, isAdult: false, popularity_greater: 20000,
                format_in: [TV, TV_SHORT, ONA, OVA]) { ${MEDIA_FIELDS} }
        }
      }`,
      { per: perPage },
    );
    return (data.Page.media || []).map(normalize);
  });
}

export async function getWeekSchedule(): Promise<AniWeekDay[]> {
  return cachedPersistent('anilist:week', 20 * 60_000, async () => {
    const nowSh = new Date(Date.now() + SH_OFFSET);
    const dayIdx = (nowSh.getUTCDay() + 6) % 7;
    const mondayUtc = Date.UTC(
      nowSh.getUTCFullYear(),
      nowSh.getUTCMonth(),
      nowSh.getUTCDate() - dayIdx,
      0,
      0,
      0,
    );
    const start = Math.floor((mondayUtc - SH_OFFSET) / 1000);
    const end = start + 7 * 86_400;

    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        gql<any>(
          `query($start: Int, $end: Int, $page: Int) {
            Page(page: $page, perPage: 50) {
              airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
                airingAt episode media { ${MEDIA_FIELDS} }
              }
            }
          }`,
          { start, end, page },
        ),
      ),
    );
    const rows = pages.flatMap((d) => d.Page.airingSchedules || []);

    const labels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const today = `${pad(nowSh.getUTCMonth() + 1)}-${pad(nowSh.getUTCDate())}`;
    const days: AniWeekDay[] = Array.from({ length: 7 }, (_, i) => {
      const d = new Date((start + i * 86_400) * 1000 + SH_OFFSET);
      const date = `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      return { weekday: i + 1, label: labels[i], date, isToday: date === today, items: [] };
    });

    const seen = new Set<string>();
    for (const row of rows) {
      const at = Number(row.airingAt) || 0;
      const d = new Date(at * 1000 + SH_OFFSET);
      const wd = ((d.getUTCDay() + 6) % 7) + 1;
      const date = `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      const day = days[wd - 1];
      if (!day || day.date !== date) continue;
      const card = normalize(row.media);
      const key = `${card.id}:${row.episode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (day.items.length >= 10) continue;
      day.items.push({
        ...card,
        airingAt: at,
        episode: Number(row.episode) || 0,
        timeText: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      });
    }

    return days;
  });
}

export async function getAniListWork(id: string) {
  return cachedPersistent(`anilist:detail:${id}`, 60 * 60_000, async () => {
    const data = await gql<any>(
      `query($id: Int) {
        Media(id: $id, type: ANIME) {
          ${MEDIA_FIELDS}
          studios { nodes { name isAnimationStudio } }
        }
      }`,
      { id: Number(id) },
    );
    const card = normalize(data.Media);
    const studio =
      (data.Media?.studios?.nodes || []).find((n: any) => n.isAnimationStudio)?.name || '';
    const [bgm, biliSeason] = await Promise.all([
      enrichBangumi(card.title, card.id).catch(() => null),
      biliSeasonForAniList(card.id, [card.title, card.nativeTitle, card.englishTitle]).catch(() => 0),
    ]);
    const title = bgm?.nameCn || card.title;
    const score = bgm?.score || card.score;
    return {
      ...card,
      id: `anilist-${card.id}`,
      title,
      seasonTitle: title,
      score,
      scoreText: score ? score.toFixed(1) : '',
      scoreSource: bgm?.score ? 'bangumi' : 'anilist',
      anilistScore: card.score,
      bangumiRank: bgm?.rank || 0,
      bangumiId: bgm?.id || 0,
      bangumiRatingTotal: bgm?.ratingTotal || 0,
      bangumiCachedAt: bgm?.fetchedAt || 0,
      bangumiStale: Boolean(bgm?.stale),
      biliSeasonId: biliSeason || 0,
      ratingCount: 0,
      orderText: card.popularityText,
      isFinish: card.status === 'FINISHED',
      badge: '',
      area: '日本',
      synopsis: bgm?.summary || card.description,
      synopsisLang: bgm?.summary ? 'zh' : 'en',
      total: card.episodes,
      actors: '',
      staff: studio ? `动画制作：${studio}` : '',
      studio,
      yearText: card.year,
      status: card.statusText,
      subtitle: '',
      episodes: [],
    };
  });
}
