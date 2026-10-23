import { useState } from 'react';
import { PlayCircle, Star, TrendingUp, Trophy } from 'lucide-react';
import PosterCard, { type PosterItem } from '../components/PosterCard';
import { catalogHref } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import type { AniCard, BiliCard } from '../lib/types';

type RankType = 'anilist' | 'follow' | 'play';

const TABS: Array<{ key: RankType; label: string; desc: string; icon: any }> = [
  { key: 'anilist', label: 'AniList 高分', desc: '全球评分，口碑向', icon: Star },
  { key: 'follow', label: 'B站追番', desc: '追番人数最多，国内热度向', icon: Trophy },
  { key: 'play', label: 'B站播放', desc: '累计播放量最高', icon: PlayCircle },
];

export default function Ranking() {
  const [type, setType] = useState<RankType>('anilist');
  useTitle('排行榜');
  const path = type === 'anilist' ? '/api/anilist/top' : `/api/ranking?type=${type}`;
  const { data, loading, error, reload } = useApi<{ items: Array<AniCard | BiliCard> }>(path);

  const items = data?.items || [];
  const meta = TABS.find((t) => t.key === type)!;
  const friendlyError =
    error && /403|temporarily disabled/i.test(error)
      ? 'AniList 暂时不可用（官方 API 停摆），可以先看 B站榜单。'
      : error;

  const posters: PosterItem[] = items.map((c, i) => {
    if ('popularityText' in c) {
      return {
        key: `anilist-${c.id}`,
        title: c.title,
        cover: c.cover,
        href: catalogHref(`anilist-${c.id}`),
        rank: i + 1,
        score: c.score || undefined,
        meta: [c.year, c.popularityText].filter(Boolean).join(' · '),
      };
    }
    return {
      key: c.id,
      title: c.title,
      cover: c.cover,
      href: catalogHref(c.id),
      rank: i + 1,
      score: c.score || undefined,
      meta: [c.year, c.orderText].filter(Boolean).join(' · '),
    };
  });

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-[24px] font-bold tracking-tight">
          <TrendingUp size={22} className="text-[#ff8a9d]" />
          排行榜
        </h1>
        <p className="mt-2 text-[13px] text-muted">{meta.desc}</p>
      </div>

      <div className="mb-7 flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`line-pill h-9 px-4 ${type === key ? 'active' : ''}`}
            onClick={() => setType(key)}
          >
            <Icon size={13} className="mr-1.5 inline" />
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="empty">
          <div className="text-[14px] text-white/60">{friendlyError}</div>
          <div className="flex gap-2">
            <button className="btn" onClick={reload}>
              重试
            </button>
            {type === 'anilist' && (
              <button className="btn" onClick={() => setType('follow')}>
                查看 B站追番
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {posters.map((p) => (
            <PosterCard key={p.key} item={p} />
          ))}
        </div>
      )}
    </div>
  );
}
