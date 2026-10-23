import { cached, stripHtml } from './http.js';
import { bili, getAiring, getIndex } from './bilibili.js';
import { getBiliEpisodes, type BiliEpisode } from './bilibiliDanmaku.js';

export interface MemeComment {
  id: string;
  text: string;
  likes: number;
  replies: number;
  author: string;
  avatar: string;
  date: string;
  link: string;
}

export interface MemeAnime {
  seasonId: string;
  title: string;
  cover: string;
  orderText: string;
  episode: {
    id: string;
    aid: number;
    title: string;
    longTitle: string;
  };
  comments: MemeComment[];
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
    month: '2-digit',
    day: '2-digit',
  });
}

function latestEpisode(eps: BiliEpisode[]) {
  const usable = eps.filter(
    (e) => e.aid && !/预告|PV|CM|花絮|特典|访谈|直播|片段/i.test(`${e.title} ${e.longTitle}`),
  );
  const list = usable.length ? usable : eps.filter((e) => e.aid);
  return list[list.length - 1] || null;
}

async function hotComments(ep: BiliEpisode): Promise<MemeComment[]> {
  const data: any = await bili(
    `/x/v2/reply?type=1&oid=${ep.aid}&sort=2&ps=20&pn=1`,
  );
  const list = Array.isArray(data?.replies) ? data.replies : [];
  const link = `https://www.bilibili.com/bangumi/play/ep${ep.id}`;
  return list
    .map((r: any) => {
      const text = stripHtml(String(r?.content?.message || ''))
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length < 2 || text.length > 80) return null;
      if (/https?:\/\//i.test(text) || text.startsWith('@')) return null;
      return {
        id: String(r?.rpid || ''),
        text,
        likes: Number(r?.like) || 0,
        replies: Number(r?.rcount) || 0,
        author: String(r?.member?.uname || 'B站用户'),
        avatar: fixUrl(r?.member?.avatar || ''),
        date: dateOf(Number(r?.ctime) || 0),
        link,
      } satisfies MemeComment;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => b.likes - a.likes)
    .slice(0, 3) as MemeComment[];
}

/** 自动抓当季热门番的最新一集热评，按番剧聚合 */
const DUB = /中配|中文配音|国语|粤语|台配|日语版/i;
const KIDS =
  /蜡笔小新|哆啦A梦|樱桃小丸子|猫和老鼠|喜羊羊|熊出没|小猪佩奇|汪汪队|奥特曼|儿歌|宝宝|儿童|亲子|早教|动画片/i;

function seriesKey(title: string) {
  return String(title || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/第\s*[0-9一二三四五六七八九十]+\s*[季期部]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export async function getBiliMemes(limit = 10): Promise<MemeAnime[]> {
  const size = Math.max(1, Math.min(12, Number(limit) || 10));
  return cached(`bili:memes:v2:${size}`, 20 * 60_000, async () => {
    const [airing, play, follow] = await Promise.allSettled([
      getAiring(30),
      getIndex('play', 1, 18),
      getIndex('follow', 1, 18),
    ]);
    const seen = new Set<string>();
    const cards = [
      ...(airing.status === 'fulfilled' ? airing.value : []),
      ...(play.status === 'fulfilled' ? play.value : []),
      ...(follow.status === 'fulfilled' ? follow.value : []),
    ]
      .filter((c) => {
        if (!c.id || seen.has(c.id) || DUB.test(c.title) || KIDS.test(c.title)) return false;
        const key = seriesKey(c.title);
        if (!key || seen.has(`series:${key}`)) return false;
        seen.add(c.id);
        seen.add(`series:${key}`);
        return true;
      })
      .slice(0, size * 2);

    const settled = await Promise.allSettled(
      cards.map(async (card) => {
        const eps = await getBiliEpisodes(Number(card.id));
        const ep = latestEpisode(eps);
        if (!ep) return null;
        const comments = await hotComments(ep);
        if (!comments.length) return null;
        return {
          seasonId: String(card.id),
          title: card.title,
          cover: card.cover,
          orderText: card.orderText,
          episode: {
            id: String(ep.id),
            aid: ep.aid,
            title: ep.title,
            longTitle: ep.longTitle,
          },
          comments,
        } satisfies MemeAnime;
      }),
    );

    return settled
      .flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
      .slice(0, size);
  });
}
