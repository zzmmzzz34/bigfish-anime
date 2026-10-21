import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SearchX, TriangleAlert } from 'lucide-react';
import PosterCard, { type PosterItem } from '../components/PosterCard';
import { detailHref } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import type { SearchGroup } from '../lib/types';

const HOT = ['紫罗兰永恒花园', '葬送的芙莉莲', '间谍过家家', '进击的巨人', '鬼灭之刃', '咒术回战'];

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = (params.get('q') || '').trim();
  useTitle(q ? `搜索 ${q}` : '搜索');

  const { data, loading, error } = useApi<{
    query: string;
    groups: SearchGroup[];
    errors: { source: string; message: string }[];
  }>(q ? `/api/search?q=${encodeURIComponent(q)}` : null);

  const groups = data?.groups || [];
  const total = useMemo(() => groups.reduce((n, g) => n + g.items.length, 0), [groups]);

  const posters: PosterItem[] = groups.map((g) => ({
    key: g.titleKey,
    title: g.title,
    cover: g.cover,
    href: detailHref(g.items[0]),
    badge: `${g.items.length} 个片源`,
    meta: [g.year, g.typeName].filter(Boolean).join(' · ') || '已收录',
  }));

  return (
    <div className="container-page py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">
            {q ? (
              <>
                <span className="text-white/35">搜索 · </span>
                {q}
              </>
            ) : (
              '搜索番剧'
            )}
          </h1>
          {q && !loading && (
            <p className="mt-2 text-[13px] text-muted">
              找到 {groups.length} 部作品 · 合并了 {total} 个片源结果
            </p>
          )}
        </div>
        {data?.errors?.length ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.07] px-3 py-2 text-[12px] text-amber-200/80">
            <TriangleAlert size={14} />
            {data.errors.map((e) => e.source).join('、')} 暂时不可用
          </div>
        ) : null}
      </div>

      {!q && (
        <div className="panel p-8">
          <div className="text-[15px] font-semibold">试试这些</div>
          <div className="mt-4 flex flex-wrap gap-2">
            {HOT.map((kw) => (
              <Link key={kw} to={`/search?q=${encodeURIComponent(kw)}`} className="chip hover:text-white">
                {kw}
              </Link>
            ))}
          </div>
          <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-white/40">
            搜索会同时检索所有已启用的片源，同名作品自动合并并标注可用片源数量。
            点开详情后，播放线路就是不同片源之间的切换入口。
          </p>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">搜索失败</div>
          <div>{error}</div>
        </div>
      )}

      {!loading && !error && q && groups.length === 0 && (
        <div className="empty">
          <div className="empty-icon">
            <SearchX size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">没有找到「{q}」</div>
          <div className="text-[13px]">换个关键词，或者去「片源」页添加更多接口</div>
        </div>
      )}

      {!loading && posters.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {posters.map((p) => (
            <PosterCard key={p.key} item={p} />
          ))}
        </div>
      )}
    </div>
  );
}
