import { cached } from './http.js';
import { alternates, detailSource, getSource } from './sources.js';
import { manualWorks } from './manualMatches.js';
import { titleKey } from './util.js';
import type { Work } from './types.js';

export interface PlaySourceLine {
  index: number;
  name: string;
  /** 仅用于线路健康探测；真正播放仍走播放页的 resolve */
  testUrl: string;
  episodes: Array<{ index: number; name: string; playable: boolean }>;
}

export interface PlaySourceItem {
  work: Work;
  lines: PlaySourceLine[];
}

const CN_NUM: Record<string, string> = {
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

function seasonOf(title: string) {
  const s = String(title || '');
  const m =
    s.match(/第\s*([一二三四五六七八九十\d]+)\s*季/) ||
    s.match(/Season\s*(\d+)/i) ||
    s.match(/\bS(\d+)\b/i);
  if (!m) return '';
  return CN_NUM[m[1]] || m[1];
}

function sameSeason(a: string, b: string) {
  return seasonOf(a) === seasonOf(b);
}

const NOT_SERIES = /剧场|OVA|OAD|总集篇|特别篇|外传|解说|预告|花絮|片段/i;

/** 同作品的跨源线路清单；只返回索引/名称，不把视频直链发给前端 */
export async function getPlaySources(title: string, excludeKey: string) {
  const key = `play-sources:${titleKey(title)}:${seasonOf(title)}:${excludeKey}`;
  return cached<PlaySourceItem[]>(key, 5 * 60_000, async () => {
    const seen = new Set<string>();
    const manual = manualWorks(title);
    const auto = (await alternates(title, excludeKey)).filter(
      (w) => sameSeason(title, w.title) && !NOT_SERIES.test(w.title),
    );
    const alts = [...manual, ...auto].filter((w) => {
      if (!w.key || seen.has(w.key)) return false;
      seen.add(w.key);
      return true;
    });
    const settled = await Promise.allSettled(
      alts.slice(0, 8).map(async (work) => {
        const source = getSource(work.sourceId);
        if (!source) return null;
        const detail = await detailSource(source, work.vodId);
        if (!detail?.lines?.length) return null;
        return {
          work,
          lines: detail.lines.map((line, index) => {
            const probe = line.episodes.find((ep) => ep.playable) || line.episodes[0];
            return {
              index,
              name: line.name,
              testUrl: String(probe?.url || ''),
              episodes: line.episodes.map((ep) => ({
                index: ep.index,
                name: ep.name,
                playable: Boolean(ep.playable),
              })),
            };
          }),
        } satisfies PlaySourceItem;
      }),
    );
    return settled
      .flatMap((r) => (r.status === 'fulfilled' && r.value ? [r.value] : []))
      .filter((item) => item.lines.some((l) => l.episodes.length));
  });
}
