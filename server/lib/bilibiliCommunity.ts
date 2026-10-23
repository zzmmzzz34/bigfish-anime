import { cached, HttpError } from './http.js';
import { bili } from './bilibili.js';

export interface BiliReview {
  id: string;
  user: string;
  avatar: string;
  score: number;
  content: string;
  likes: number;
  date: string;
  link: string;
}

export interface BiliLongReview {
  id: string;
  user: string;
  avatar: string;
  title: string;
  content: string;
  likes: number;
  replies: number;
  date: string;
  link: string;
  spoiler: boolean;
}

export interface BiliCommunity {
  seasonId: string;
  mediaId: string;
  stat: {
    views: number;
    danmakus: number;
    favorites: number;
    reply: number;
    likes: number;
    coins: number;
    share: number;
    followText: string;
  };
  rating: { score: number; count: number };
  reviews: BiliReview[];
  longReviews: BiliLongReview[];
}

function fixUrl(url: string) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http://')) return `https://${raw.slice(7)}`;
  return raw;
}

function dateOf(sec: number) {
  if (!sec) return '';
  return new Date(sec * 1000).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** B站番剧热度 + 短评；短评失败时只返回热度，不拖垮详情页 */
export async function getBiliCommunity(seasonId: string): Promise<BiliCommunity> {
  const id = String(seasonId || '').trim();
  if (!id) throw new HttpError('缺少 season_id', 400);

  return cached(`bili:community:${id}`, 30 * 60_000, async () => {
    const season: any = await bili(`/pgc/view/web/season?season_id=${encodeURIComponent(id)}`);
    const mediaId = String(season?.media_id || '');
    const stat = season?.stat || {};
    const rating = season?.rating || {};
    const result: BiliCommunity = {
      seasonId: String(season?.season_id || id),
      mediaId,
      stat: {
        views: Number(stat.views) || 0,
        danmakus: Number(stat.danmakus) || 0,
        favorites: Number(stat.favorites || stat.favorite) || 0,
        reply: Number(stat.reply) || 0,
        likes: Number(stat.likes) || 0,
        coins: Number(stat.coins) || 0,
        share: Number(stat.share) || 0,
        followText: String(stat.follow_text || ''),
      },
      rating: {
        score: Number(rating.score) || 0,
        count: Number(rating.count) || 0,
      },
      reviews: [],
      longReviews: [],
    };

    if (!mediaId) return result;

    const [shortRes, longRes] = await Promise.allSettled([
      bili(`/pgc/review/short/list?media_id=${encodeURIComponent(mediaId)}&ps=8&sort=0`),
      bili(`/pgc/review/long/list?media_id=${encodeURIComponent(mediaId)}&ps=6&sort=0`),
    ]);

    if (shortRes.status === 'fulfilled') {
      const list = Array.isArray((shortRes.value as any)?.list) ? (shortRes.value as any).list : [];
      result.reviews = list
        .map((r: any) => {
          const content = String(r?.content || '').trim();
          if (!content) return null;
          return {
            id: String(r?.review_id || ''),
            user: String(r?.author?.uname || 'B站用户'),
            avatar: fixUrl(r?.author?.avatar || ''),
            score: Number(r?.score) || 0,
            content,
            likes: Number(r?.stat?.likes) || 0,
            date: dateOf(Number(r?.ctime) || 0),
            link: r?.review_id
              ? `https://www.bilibili.com/bangumi/media/md${mediaId}/review/${r.review_id}`
              : `https://www.bilibili.com/bangumi/media/md${mediaId}`,
          } satisfies BiliReview;
        })
        .filter(Boolean)
        .slice(0, 6) as BiliReview[];
    }

    if (longRes.status === 'fulfilled') {
      const list = Array.isArray((longRes.value as any)?.list) ? (longRes.value as any).list : [];
      result.longReviews = list
        .map((r: any) => {
          const content = String(r?.content || '')
            .replace(/\[图片\]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          const title = String(r?.title || '').replace(/\s+/g, ' ').trim();
          if (!content || !title) return null;
          const articleId = Number(r?.article_id) || 0;
          return {
            id: String(r?.review_id || articleId),
            user: String(r?.author?.uname || 'B站用户'),
            avatar: fixUrl(r?.author?.avatar || ''),
            title,
            content,
            likes: Number(r?.stat?.likes) || 0,
            replies: Number(r?.stat?.reply) || 0,
            date: dateOf(Number(r?.ctime) || 0),
            link: String(r?.url || (articleId ? `https://www.bilibili.com/read/cv${articleId}` : `https://www.bilibili.com/bangumi/media/md${mediaId}`)),
            spoiler: Boolean(r?.is_spoiler),
          } satisfies BiliLongReview;
        })
        .filter(Boolean)
        .slice(0, 4) as BiliLongReview[];
    }

    return result;
  });
}
