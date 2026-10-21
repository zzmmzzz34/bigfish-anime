import { useMemo, useState } from 'react';
import { CalendarDays, Flame, Star } from 'lucide-react';
import PosterCard, { type PosterItem } from '../components/PosterCard';
import { catalogHref } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import type { AniCard } from '../lib/types';

export default function Airing() {
  useTitle('本季新番');
  const { data, loading, error, reload } = useApi<{ items: AniCard[] }>('/api/anilist/airing');
  const [sort, setSort] = useState<'follow' | 'score'>('follow');

  const items = useMemo(() => {
    const list = [...(data?.items || [])];
    if (sort === 'score') list.sort((a, b) => b.score - a.score);
    else list.sort((a, b) => b.popularity - a.popularity);
    return list;
  }, [data, sort]);

  const posters: PosterItem[] = items.map((c) => ({
    key: `anilist-${c.id}`,
    title: c.title,
    cover: c.cover,
    href: catalogHref(`anilist-${c.id}`),
    badge: c.episodesText || undefined,
    score: c.score || undefined,
    meta: [c.year, c.popularityText].filter(Boolean).join(' · ') || 'AniList',
  }));

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-[24px] font-bold tracking-tight">
            <CalendarDays size={22} className="text-[#ff8a9d]" />
            本季新番
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            AniList 当季片单，中文标题优先；点开后可自动匹配你的片源线路。
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

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="empty">
          <div className="text-[14px] text-white/60">{error}</div>
          <button className="btn" onClick={reload}>
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
