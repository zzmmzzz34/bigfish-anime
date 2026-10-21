import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  Layers,
  Play,
  RefreshCw,
  Share2,
  TriangleAlert,
} from 'lucide-react';
import { apiGet, apiPost, detailHref, imgUrl, playHref, prettyLine } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import { useToast } from '../components/Toast';
import {
  healthLabel,
  recommendedIndex,
  statsLabel,
  useAutoLine,
  useLineHealth,
} from '../lib/lineHealth';
import type { FavoriteItem, Work, WorkDetail } from '../lib/types';

export default function Detail() {
  const { sourceId = '', vodId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { data, loading, error, reload } = useApi<WorkDetail>(
    `/api/detail?sourceId=${encodeURIComponent(sourceId)}&vodId=${encodeURIComponent(vodId)}`,
  );
  useTitle(data?.title);

  const [expanded, setExpanded] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [alternates, setAlternates] = useState<Work[]>([]);
  const [altLoading, setAltLoading] = useState(false);

  useEffect(() => {
    setExpanded(false);
    setAlternates([]);
  }, [sourceId, vodId]);

  useEffect(() => {
    apiGet<FavoriteItem[]>('/api/favorites')
      .then((list) => setFavorited(list.some((f) => f.key === data?.key)))
      .catch(() => {});
  }, [data?.key]);

  useEffect(() => {
    if (!data?.title) return;
    let alive = true;
    setAltLoading(true);
    apiGet<{ items: Work[] }>(
      `/api/alternates?title=${encodeURIComponent(data.title)}&exclude=${encodeURIComponent(data.key)}`,
    )
      .then((res) => {
        if (alive) setAlternates(res.items);
      })
      .catch(() => {})
      .finally(() => alive && setAltLoading(false));
    return () => {
      alive = false;
    };
  }, [data?.title, data?.key]);

  const lineItems = useMemo(
    () =>
      (data?.lines || [])
        .map((l, i) => ({
          key: `${data!.key}:${i}`,
          url: (l.episodes.find((e) => e.playable) || l.episodes[0])?.url || '',
          sourceId: data!.sourceId,
          playable: l.episodes.filter((e) => e.playable).length,
        }))
        .filter((x) => x.url),
    [data],
  );
  const { health, stats, busy, recheck } = useLineHealth(lineItems);
  const recommended = useMemo(
    () => recommendedIndex(lineItems, health, stats),
    [lineItems, health, stats],
  );
  const healthyCount = lineItems.filter((l) => ['ok', 'slow'].includes(health[l.key]?.status || '')).length;
  const checking = lineItems.length > 0 && lineItems.some((l) => {
    const s = health[l.key]?.status;
    return !s || s === 'checking';
  });

  const { line, choose } = useAutoLine(
    `detail:${sourceId}:${vodId}`,
    lineItems,
    health,
    recommended,
  );

  const lineData = data?.lines?.[line];
  const playableCount = lineData?.episodes.filter((e) => e.playable).length || 0;
  const currentStat = data ? stats[`${data.key}:${line}`] : undefined;

  const toggleFavorite = async () => {
    if (!data) return;
    try {
      const res = await apiPost<{ favorited: boolean }>('/api/favorites', data);
      setFavorited(res.favorited);
      toast(res.favorited ? '已加入收藏' : '已取消收藏', 'success');
    } catch (err: any) {
      toast(err.message || '操作失败', 'error');
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('链接已复制', 'success');
    } catch {
      toast('复制失败，请手动复制地址栏', 'error');
    }
  };

  if (loading && !data) {
    return (
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[230px_1fr]">
          <div className="skeleton aspect-[2/3] rounded-2xl" />
          <div className="space-y-4">
            <div className="skeleton h-10 w-2/3 rounded-lg" />
            <div className="skeleton h-6 w-1/2 rounded" />
            <div className="skeleton h-24 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container-page">
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">{error || '作品不存在'}</div>
          <div className="flex gap-2">
            <button className="btn" onClick={reload}>
              重试
            </button>
            <button className="btn" onClick={() => navigate(-1)}>
              返回
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="detail-backdrop -z-0">
        <img src={imgUrl(data.cover)} alt="" aria-hidden />
      </div>

      <div className="container-page relative z-10 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft size={15} /> 返回
        </button>

        <div className="grid gap-8 md:grid-cols-[232px_minmax(0,1fr)] lg:gap-12">
          <div>
            <div className="relative overflow-hidden rounded-2xl">
              <img src={imgUrl(data.cover)} alt={data.title} className="poster" />
            </div>
            <div className="mt-4 hidden md:block">
              <Link to={playHref(data, line, 0)} className="btn btn-primary w-full">
                <Play size={16} fill="currentColor" strokeWidth={0} />
                开始观看
              </Link>
              <div className="mt-2 flex gap-2">
                <button className="btn flex-1" onClick={toggleFavorite}>
                  {favorited ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
                  {favorited ? '已收藏' : '收藏'}
                </button>
                <button className="btn btn-icon h-[42px] w-[42px]" onClick={share} aria-label="复制链接">
                  <Share2 size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <h1 className="text-[clamp(26px,3.2vw,40px)] font-extrabold leading-tight tracking-tight">
              {data.title}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {data.year && <span className="chip chip-accent">{data.year}</span>}
              {data.area && <span className="chip">{data.area}</span>}
              {data.typeName && <span className="chip">{data.typeName}</span>}
              {data.total > 0 && <span className="chip">共 {data.total} 集</span>}
              {data.remarks && <span className="chip">{data.remarks}</span>}
            </div>

            <div className="mt-5 space-y-2 text-[13px] leading-relaxed text-white/55">
              {data.director && (
                <div>
                  <span className="text-white/35">导演 / 制作：</span>
                  {data.director}
                </div>
              )}
              {data.actors.length > 0 && (
                <div className="clamp-2">
                  <span className="text-white/35">声优 / 演员：</span>
                  {data.actors.join('、')}
                </div>
              )}
              {data.updatedAt && (
                <div>
                  <span className="text-white/35">更新时间：</span>
                  {new Date(data.updatedAt).toLocaleDateString('zh-CN')}
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className={`text-[13.5px] leading-[1.9] text-white/70 ${expanded ? '' : 'clamp-3'}`}>
                {data.synopsis || '暂无简介。'}
              </div>
              {data.synopsis && data.synopsis.length > 130 && (
                <button
                  className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-[#ff97a8] hover:text-[#ffb6c2]"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? '收起' : '展开全部'}
                  {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-2 md:hidden">
              <Link to={playHref(data, line, 0)} className="btn btn-primary flex-1">
                <Play size={16} fill="currentColor" strokeWidth={0} /> 开始观看
              </Link>
              <button className="btn" onClick={toggleFavorite}>
                {favorited ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}
              </button>
              <button className="btn btn-icon h-[42px] w-[42px]" onClick={share}>
                <Share2 size={16} />
              </button>
            </div>

            <div className="panel mt-8 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[14px] font-semibold">
                  <Layers size={16} className="text-[#ff8a9d]" />
                  播放线路
                  <span className="chip h-5 text-[10.5px]">{data.sourceName}</span>
                  <span className="text-[12px] font-normal text-white/35">
                    {lineData ? `共 ${lineData.episodes.length} 集` : ''}
                    {playableCount > 0 && playableCount < (lineData?.episodes.length || 0)
                      ? ` · ${playableCount} 集可直连`
                      : ''}
                    {lineItems.length
                      ? checking
                        ? ` · 检测 ${healthyCount}/${lineItems.length}`
                        : ` · ${healthyCount}/${lineItems.length} 条可用`
                      : ''}
                    {currentStat && statsLabel(currentStat) ? ` · ${statsLabel(currentStat)}` : ''}
                  </span>
                  {lineItems.length > 0 && (
                    <button
                      className="btn-icon h-6 w-6"
                      onClick={recheck}
                      disabled={busy}
                      title="重新检测线路（跳过 10 分钟缓存）"
                    >
                      <RefreshCw size={12} className={busy ? 'animate-spin' : ''} />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(data.lines || []).map((l, i) => {
                    const h = health[`${data.key}:${i}`];
                    const st = stats[`${data.key}:${i}`];
                    const extra = statsLabel(st);
                    return (
                      <button
                        key={l.name + i}
                        className={`line-pill ${i === line ? 'active' : ''}`}
                        onClick={() => choose(i)}
                        title={`${l.name} · ${healthLabel(h)}${extra ? ` · ${extra}` : ''}`}
                      >
                        <span className={`health-dot ${h?.status || 'checking'}`} />
                        {prettyLine(l.name, i)}
                        <span className="ml-1.5 text-[10.5px] opacity-55">{data.sourceName}</span>
                        <span className="ml-1 text-[10.5px] opacity-40">{l.episodes.length}</span>
                        {recommended === i && <span className="rec-badge">推荐</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {lineData?.episodes.length ? (
                <div className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-2 overflow-y-auto pr-1">
                  {lineData.episodes.map((ep) => (
                    <Link
                      key={`${ep.index}-${ep.url}`}
                      to={playHref(data, line, ep.index)}
                      className="ep-btn"
                      title={`${ep.name}${ep.playable ? '' : '（需嗅探）'}`}
                    >
                      {ep.name}
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-[13px] text-white/40">
                  这个线路还没有解析到剧集，试试下面的其他片源。
                </div>
              )}
            </div>

            <div className="mt-8">
              <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
                <RefreshCw size={15} className={altLoading ? 'animate-spin text-white/40' : 'text-white/40'} />
                其他片源
                <span className="text-[12px] font-normal text-white/35">
                  {altLoading ? '正在匹配…' : alternates.length ? `${alternates.length} 个可用` : '暂无'}
                </span>
              </div>
              {alternates.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {alternates.map((w) => (
                    <Link
                      key={w.key}
                      to={detailHref(w)}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 transition-all hover:border-white/15 hover:bg-white/[0.05]"
                    >
                      <img
                        src={imgUrl(w.cover)}
                        alt=""
                        className="h-[58px] w-[42px] shrink-0 rounded-md object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="clamp-1 text-[12.5px] font-medium">{w.title}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/65">{w.sourceName}</span>
                          <span>{w.year}</span>
                          {w.remarks && <span className="clamp-1">{w.remarks}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                !altLoading && (
                  <div className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[12.5px] text-white/35">
                    其他片源没有找到同名作品，换个关键词搜索试试。
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
