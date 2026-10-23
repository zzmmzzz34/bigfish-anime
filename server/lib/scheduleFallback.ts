import { getBangumiCalendar } from './bangumi.js';
import { getTimeline } from './bilibili.js';
import type { AniScheduleItem, AniWeekDay } from './anilist.js';

const LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const pad = (n: number) => String(n).padStart(2, '0');

function weekDates() {
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const date = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    return { weekday: i + 1, label, date, isToday: date === today };
  });
}

function bangumiItem(item: any): AniScheduleItem {
  const title = String(item.name_cn || item.name || '');
  const score = Number(item.rating?.score) || 0;
  const doing = Number(item.collection?.doing) || 0;
  return {
    id: `bgm-${item.id}`,
    site: 'anilist',
    title,
    titleAlt: '',
    nativeTitle: '',
    englishTitle: '',
    cover: String(item.images?.large || item.images?.common || ''),
    banner: '',
    score: item.rating?.total >= 20 ? score : 0,
    scoreText: item.rating?.total >= 20 && score ? score.toFixed(1) : '',
    popularity: doing,
    popularityText: doing ? `${doing} 人在看` : '',
    episodes: 0,
    episodesText: item.eps ? `${item.eps} 话` : '',
    status: 'RELEASING',
    statusText: '连载中',
    year: String(item.air_date || '').slice(0, 4),
    season: '',
    genres: [],
    description: '',
    link: '',
    airingAt: 0,
    episode: 0,
    timeText: '',
    href: `/catalog/bgm-${item.id}`,
  };
}

/** AniList 不可用时，优先 Bangumi 日历，再退回 B站时间表 */
export async function getScheduleFallback(): Promise<{
  days: AniWeekDay[];
  source: 'bangumi' | 'bilibili';
}> {
  try {
    const calendar = await getBangumiCalendar();
    if (calendar.length) {
      const dates = weekDates();
      return {
        source: 'bangumi',
        days: dates.map((d) => {
          const entry = calendar.find((x: any) => Number(x.weekday?.id) === d.weekday);
          const items = Array.isArray(entry?.items) ? entry.items.map(bangumiItem) : [];
          return { ...d, items };
        }),
      };
    }
  } catch {
    /* 继续退回 B站 */
  }

  const days = await getTimeline();
  return {
    source: 'bilibili',
    days: days.map((day) => ({
      weekday: day.weekday,
      label: day.label,
      date: day.date,
      isToday: day.isToday,
      items: day.items.map((item) => {
        const m = String(item.pubIndex || '').match(/(\d+)/);
        return {
          id: String(item.seasonId || item.id || ''),
          site: 'anilist',
          title: String(item.title || ''),
          titleAlt: '',
          nativeTitle: '',
          englishTitle: '',
          cover: String(item.cover || ''),
          banner: '',
          score: 0,
          scoreText: '',
          popularity: 0,
          popularityText: '',
          episodes: 0,
          episodesText: String(item.pubIndex || ''),
          status: 'RELEASING',
          statusText: '连载中',
          year: '',
          season: '',
          genres: [],
          description: '',
          link: '',
          airingAt: 0,
          episode: m ? Number(m[1]) : 0,
          timeText: String(item.pubTime || ''),
          href: `/catalog/${encodeURIComponent(String(item.seasonId || ''))}`,
        };
      }),
    })),
  };
}
