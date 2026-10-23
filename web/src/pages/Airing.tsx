import { useMemo, useState } from 'react';
import { CalendarDays, Flame, Star } from 'lucide-react';
import PosterCard, { type PosterItem } from '../components/PosterCard';
import { catalogHref, searchHref } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import type { AniCard, AniWeekDay, BiliCard } from '../lib/types';

export default function Airing() {
  useTitle('本季新番');
  const ani = useApi<{ items: AniCard[] }>('/api/anilist/airing');
  const bili = useApi<{ items: BiliCard[] }>('/api/airing');
  const [sort, setSort] = useState<'follow' | 'score'>('follow');

  const aniItems = ani.data?.items || [];
  const biliItems = bili.data?.items || [];
  const bgm = useApi<{ days: AniWeekDay[]; source?: string }>('/api/bangumi/week');
  const bgmItems = useMemo(
    () => (bgm.data?.days || []).flatMap((d) => d.items),
    [bgm.data],
  );
  const usingFallback = !aniItems.length && (biliItems.length > 0 || bgmItems.length > 0);

  const posters: PosterItem[] = useMemo(() => {
    const norm = (s: string) =>
      String(s || '')
        .replace(/[（(][^）)]*[）)]/g, '')
        .replace(/第\s*[0-9一二三四五六七八九十]+\s*[季期部]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();
    const seen = new Set<string>();
    const list: PosterItem[] = [];

    if (aniItems.length) {
      const sorted = [...aniItems];
      if (sort === 'score') sorted.sort((a, b) => b.score - a.score);
      else sorted.sort((a, b) => b.popularity - a.popularity);
      for (const c of sorted) {
        const k = norm(c.title);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        list.push({
          key: `anilist-${c.id}`,
          title: c.title,
          cover: c.cover,
          href: catalogHref(`anilist-${c.id}`),
          badge: c.episodesText || undefined,
          score: c.score || undefined,
          meta: [c.year, c.popularityText].filter(Boolean).join(' · ') || 'AniList',
        });
      }
    } else {
      const sorted = [...biliItems];
      if (sort === 'score') sorted.sort((a, b) => b.score - a.score);
      for (const c of sorted) {
        const k = norm(c.title);
        if (!k || seen.has(k)) continue;
        seen.add(k);
        list.push({
          key: c.id,
          title: c.title,
          cover: c.cover,
          href: catalogHref(c.id),
          badge: c.episodesText || undefined,
          score: c.score || undefined,
          meta: [c.year, c.orderText].filter(Boolean).join(' · ') || 'B站',
        });
      }
    }

    // Bangumi 始终作为补充，防止 AniList/B站 漏掉非 B站新番
    for (const c of bgmItems) {
      const k = norm(c.title);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      list.push({
        key: c.id,
        title: c.title,
        cover: c.cover,
        href: c.href || searchHref(c.title),
        badge: c.episodesText || undefined,
        score: c.score || undefined,
        meta: [c.year, c.popularityText].filter(Boolean).join(' · ') || 'Bangumi',
      });
    }

    if (sort === 'score') list.sort((a, b) => (b.score || 0) - (a.score || 0));
    return list;
  }, [aniItems, biliItems, bgmItems, sort]);

  const loading =
    (ani.loading && !ani.data) ||
    (bili.loading && !bili.data) ||
    (bgm.loading && !bgm.data);
  const error =
    !aniItems.length && !biliItems.length && !bgmItems.length
      ? ani.error || bili.error || bgm.error
      : '';

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[24px] font-bold tracking-tight">
            <CalendarDays size={22} className="text-[#ff8a9d]" />
            本季新番
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {usingFallback
              ? 'AniList 暂时不可用，合并 B站与 Bangumi 当季片单。'
              : 'AniList 当季片单 + Bangumi 补充；点开后可自动匹配你的片源线路。'}
          </p>
        </div>
        <div className="flex rounded-lg border border-white/10 p-0.5">
          <button
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] transition-colors ${
              sort === 'follow' ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white/80'
            }`}
            onClick={() => setSort('follow')}
          >
            <Flame size={12} /> 关注度
          </button>
          <button
            className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] transition-colors ${
              sort === 'score' ? 'bg-white/12 text-white' : 'text-white/45 hover:text-white/80'
            }`}
            onClick={() => setSort('score')}
          >
            <Star size={12} /> 评分
          </button>
        </div>
      </div>

      {loading && !ani.data && !bili.data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="empty">
          <div className="text-[14px] text-white/60">{error}</div>
          <button
            className="btn"
            onClick={() => {
              ani.reload();
              bili.reload();
              bgm.reload();
            }}
          >
            重试
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {posters.map((p) => (
            <PosterCard key={p.key} item={p} />
          ))}
        </div>
      )}

      {!loading && !error && !posters.length && (
        <div className="empty">
          <div className="text-[14px] text-white/60">暂时没有在播番剧数据</div>
        </div>
      )}
    </div>
  );
}
