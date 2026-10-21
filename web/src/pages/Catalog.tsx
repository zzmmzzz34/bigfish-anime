import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Layers,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { imgUrl, prettyLine, searchHref } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import {
  healthLabel,
  recommendedIndex,
  statsLabel,
  useAutoLine,
  useLineHealth,
} from '../lib/lineHealth';
import type { BiliCard, PlayLine, SourceMatch } from '../lib/types';

interface CatalogLine extends PlayLine {
  sourceId: string;
  sourceName: string;
  vodId: string;
  lineIndex: number;
  label: string;
  healthKey: string;
}

export default function Catalog() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const workQ = useApi<BiliCard>(`/api/catalog/${encodeURIComponent(id)}`);
  const matchQ = useApi<{ title: string; matches: SourceMatch[] }>(
    `/api/catalog/${encodeURIComponent(id)}/matches`,
  );
  const work = workQ.data;
  useTitle(work?.title);

  const [expanded, setExpanded] = useState(false);

  const lines = useMemo<CatalogLine[]>(() => {
    const matches = matchQ.data?.matches || [];
    const out: CatalogLine[] = [];
    let n = 0;
    for (const m of matches) {
      for (let i = 0; i < m.lines.length; i++) {
        const l = m.lines[i];
        if (!l.episodes.length) continue;
        n += 1;
        out.push({
          ...l,
          sourceId: m.sourceId,
          sourceName: m.sourceName,
          vodId: m.vodId,
          lineIndex: i,
          label: `线路 ${n}`,
          healthKey: `${m.sourceId}:${m.vodId}:${i}`,
        });
      }
    }
    return out;
  }, [matchQ.data]);

  const healthInputs = useMemo(
    () =>
      lines
        .map((l) => ({
          key: l.healthKey,
          url: (l.episodes.find((e) => e.playable) || l.episodes[0])?.url || '',
          sourceId: l.sourceId,
        }))
        .filter((l) => l.url),
    [lines],
  );
  const { health, stats, busy, recheck } = useLineHealth(healthInputs);

  const scored = useMemo(
    () =>
      lines.map((l) => ({
        key: l.healthKey,
        playable: l.episodes.filter((e) => e.playable).length,
      })),
    [lines],
  );
  const recommended = useMemo(
    () => recommendedIndex(scored, health, stats),
    [scored, health, stats],
  );
  const healthyCount = lines.filter((l) =>
    ['ok', 'slow'].includes(health[l.healthKey]?.status || ''),
  ).length;
  const checking = lines.length > 0 && healthyCount < lines.length && lines.some((l) => {
    const s = health[l.healthKey]?.status;
    return !s || s === 'checking';
  });

  const autoItems = useMemo(() => lines.map((l) => ({ key: l.healthKey })), [lines]);
  const { line, choose } = useAutoLine(`catalog:${id}`, autoItems, health, recommended);

  const current = lines[line];
  const currentStat = current ? stats[current.healthKey] : undefined;
  const playable = current?.episodes.filter((e) => e.playable).length || 0;
  const firstEp = current?.episodes[0];
  const catalogQuery =
    work?.site === 'bilibili' ? `?catalog=${encodeURIComponent(work.id)}` : '';
  const epHref = (index: number) =>
    `/play/${encodeURIComponent(current?.sourceId || '')}/${encodeURIComponent(current?.vodId || '')}/${current?.lineIndex ?? 0}/${index}${catalogQuery}`;

  if (workQ.loading && !work) {
    return (
      <div className="container-page py-14">
        <div className="grid gap-10 md:grid-cols-[220px_1fr]">
          <div className="skeleton aspect-[2/3] rounded-2xl" />
          <div className="space-y-4">
            <div className="skeleton h-10 w-2/3 rounded-lg" />
            <div className="skeleton h-6 w-1/2 rounded" />
            <div className="skeleton h-28 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (workQ.error || !work) {
    return (
      <div className="container-page">
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">{workQ.error || '番剧不存在'}</div>
          <div className="flex gap-2">
            <button className="btn" onClick={workQ.reload}>
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
      <div className="detail-backdrop">
        <img src={imgUrl(work.cover)} alt="" aria-hidden />
      </div>

      <div className="container-page relative z-10 pt-6">
        <button
          onClick={() => navigate(-1)}
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-white/50 transition-colors hover:text-white"
        >
          <ArrowLeft size={15} /> 返回
        </button>

        <div className="grid gap-8 md:grid-cols-[220px_minmax(0,1fr)] lg:gap-12">
          <div>
            <div className="relative overflow-hidden rounded-2xl">
              <img src={imgUrl(work.cover)} alt={work.title} className="poster" />
            </div>
            <div className="mt-4 hidden md:block">
              {firstEp ? (
                <Link to={epHref(firstEp.index)} className="btn btn-primary w-full">
                  <Play size={16} fill="currentColor" strokeWidth={0} /> 开始观看
                </Link>
              ) : (
                <Link to={searchHref(work.title)} className="btn btn-primary w-full">
                  <Search size={16} /> 去片源中找
                </Link>
              )}
              <a
                href={work.link}
                target="_blank"
                rel="noreferrer"
                className="btn mt-2 w-full text-[12.5px]"
              >
                <ArrowUpRight size={14} /> {work.site === 'anilist' ? 'AniList 页面' : 'B站页面'}
              </a>
            </div>
          </div>

          <div className="min-w-0">
            <h1 className="text-[clamp(26px,3.2vw,40px)] font-extrabold leading-tight tracking-tight">
              {work.title}
            </h1>
            {work.site === 'anilist' && work.titleAlt && (
              <div className="mt-1.5 text-[12.5px] text-white/35">{work.titleAlt}</div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {work.score ? (
                <span className="score-big">
                  <Star size={16} fill="currentColor" strokeWidth={0} />
                  {work.score.toFixed(1)}
                  <em>
                    {work.scoreSource === 'bangumi'
                      ? 'Bangumi'
                      : work.site === 'anilist'
                        ? 'AniList'
                        : 'B站'}
                    评分
                  </em>
                </span>
              ) : null}
              {work.ratingCount ? (
                <span className="chip">{work.ratingCount.toLocaleString('zh-CN')} 人评分</span>
              ) : null}
              {work.scoreSource === 'bangumi' && work.anilistScore ? (
                <span className="chip">AniList {work.anilistScore.toFixed(1)}</span>
              ) : null}
              {work.bangumiRank ? <span className="chip">Bangumi #{work.bangumiRank}</span> : null}
              {work.scoreSource === 'bangumi' && work.bangumiRatingTotal ? (
                <span className="chip">
                  {work.bangumiRatingTotal.toLocaleString('zh-CN')} 人评分
                </span>
              ) : null}
              {work.bangumiStale && work.bangumiCachedAt ? (
                <span
                  className="chip"
                  title={new Date(work.bangumiCachedAt).toLocaleString('zh-CN')}
                >
                  Bangumi 缓存 ·{' '}
                  {Math.max(1, Math.floor((Date.now() - work.bangumiCachedAt) / 86_400_000))} 天前
                </span>
              ) : null}
              {work.year && <span className="chip chip-accent">{work.year}</span>}
              {work.area && <span className="chip">{work.area}</span>}
              {work.status && <span className="chip">{work.status}</span>}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(work.genres || []).map((g) => (
                <span key={g} className="tag">
                  {g}
                </span>
              ))}
            </div>

            <div className="mt-5 space-y-2 text-[13px] leading-relaxed text-white/55">
              {work.studio && (
                <div>
                  <span className="text-white/35">动画制作：</span>
                  {work.studio}
                </div>
              )}
              {work.actors && (
                <div className="clamp-2">
                  <span className="text-white/35">声优：</span>
                  {work.actors.replace(/\n/g, '、')}
                </div>
              )}
              {work.orderText && (
                <div>
                  <span className="text-white/35">热度：</span>
                  {work.orderText}
                </div>
              )}
            </div>

            <div className="mt-6">
              {work.synopsisLang === 'en' && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10.5px] text-white/45">
                  英文简介 · AniList
                </div>
              )}
              <div className={`text-[13.5px] leading-[1.9] text-white/70 ${expanded ? '' : 'clamp-3'}`}>
                {work.synopsis || '暂无简介。'}
              </div>
              {work.synopsis && work.synopsis.length > 120 && (
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
              {firstEp ? (
                <Link to={epHref(firstEp.index)} className="btn btn-primary flex-1">
                  <Play size={16} fill="currentColor" strokeWidth={0} /> 开始观看
                </Link>
              ) : (
                <Link to={searchHref(work.title)} className="btn btn-primary flex-1">
                  <Search size={16} /> 去片源中找
                </Link>
              )}
            </div>

            <div className="panel mt-8 p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[14px] font-semibold">
                  <Layers size={16} className="text-[#ff8a9d]" />
                  播放线路
                  <span className="text-[12px] font-normal text-white/35">
                    {matchQ.loading
                      ? '正在匹配片源…'
                      : lines.length
                        ? checking
                          ? `检测线路 ${healthyCount}/${lines.length}…`
                          : `${healthyCount}/${lines.length} 条可用 · ${matchQ.data?.matches.length || 0} 个片源`
                        : '暂未匹配到片源'}
                  </span>
                  {lines.length > 0 && (
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
                {current && (
                  <div className="flex flex-wrap gap-1.5">
                    {lines.map((l, i) => {
                      const h = health[l.healthKey];
                      const st = stats[l.healthKey];
                      const extra = statsLabel(st);
                      return (
                        <button
                          key={`${l.sourceId}-${l.vodId}-${l.lineIndex}`}
                          className={`line-pill ${i === line ? 'active' : ''}`}
                          onClick={() => choose(i)}
                          title={`${l.sourceName} · ${healthLabel(h)}${extra ? ` · ${extra}` : ''}`}
                        >
                          <span className={`health-dot ${h?.status || 'checking'}`} />
                          {l.label}
                          <span className="ml-1.5 text-[10.5px] opacity-60">{l.sourceName}</span>
                          {recommended === i && <span className="rec-badge">推荐</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {matchQ.loading && !matchQ.data ? (
                <div className="flex items-center gap-2 py-8 text-[12.5px] text-white/40">
                  <Loader2 size={15} className="animate-spin" />
                  正在从所有片源里匹配同名作品和线路…
                </div>
              ) : current ? (
                <>
                  <div className="mb-3 flex items-center justify-between text-[11.5px] text-white/35">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className={`health-dot ${health[current.healthKey]?.status || 'checking'}`} />
                      <span className="text-white/55">{healthLabel(health[current.healthKey])}</span>
                      {currentStat && statsLabel(currentStat) && (
                        <>
                          <span className="text-white/20">·</span>
                          <span>{statsLabel(currentStat)}</span>
                        </>
                      )}
                      <span className="text-white/20">·</span>
                      {prettyLine(current.name, line)} · 共 {current.episodes.length} 集
                      {playable ? ` · ${playable} 集可直连` : ''}
                    </span>
                    <Link
                      to={`/detail/${current.sourceId}/${current.vodId}`}
                      className="text-[#ff97a8]/80 hover:text-[#ff97a8]"
                    >
                      片源详情
                    </Link>
                  </div>
                  <div className="grid max-h-[420px] grid-cols-[repeat(auto-fill,minmax(68px,1fr))] gap-2 overflow-y-auto pr-1">
                    {current.episodes.map((ep) => (
                      <Link
                        key={`${ep.index}-${ep.url}`}
                        to={`/play/${current.sourceId}/${current.vodId}/${current.lineIndex}/${ep.index}`}
                        className="ep-btn"
                        title={`${ep.name}${ep.playable ? '' : '（需嗅探）'}`}
                      >
                        {ep.name}
                      </Link>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-8 text-center">
                  <div className="text-[13px] text-white/45">
                    还没有片源收录这部作品，换个关键词或添加更多接口试试。
                  </div>
                  <div className="mt-3 flex justify-center gap-2">
                    <Link to={searchHref(work.title)} className="btn h-9 px-3 text-[12.5px]">
                      <Search size={14} /> 在片源中搜索
                    </Link>
                    <Link to="/sources" className="btn h-9 px-3 text-[12.5px]">
                      管理片源
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {matchQ.data?.matches?.length ? (
              <div className="mt-7">
                <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold">
                  <Search size={14} className="text-white/35" />
                  匹配到的片源
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {matchQ.data.matches.map((m) => (
                    <Link
                      key={m.sourceId + m.vodId}
                      to={`/detail/${m.sourceId}/${m.vodId}`}
                      className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 transition-all hover:border-white/15 hover:bg-white/[0.05]"
                    >
                      <img
                        src={imgUrl(m.cover)}
                        alt=""
                        className="h-[58px] w-[42px] shrink-0 rounded-md object-cover"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="clamp-1 text-[12.5px] font-medium">{m.title}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/40">
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/65">
                            {m.sourceName}
                          </span>
                          <span>{m.year}</span>
                          {m.remarks && <span className="clamp-1">{m.remarks}</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-6 text-[11.5px] text-white/25">
              元数据与评分来自{' '}
              {work.scoreSource === 'bangumi'
                ? 'Bangumi（中文标题由 bangumi-data 映射）'
                : work.site === 'anilist'
                  ? 'AniList（中文标题由 bangumi-data 映射）'
                  : 'B 站番剧'}
              ；播放线路来自本地配置的片源，两者独立。
              {work.link && (
                <a href={work.link} target="_blank" rel="noreferrer" className="ml-1 text-white/40 hover:text-white">
                  查看原页面 ↗
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
