import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Flame, Play, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import Hero from '../components/Hero';
import Row from '../components/Row';
import { LatestPanel } from '../components/LatestPanel';
import ScheduleSection from '../components/ScheduleSection';
import type { PosterItem } from '../components/PosterCard';
import { catalogHref, detailHref, formatTime, imgUrl } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import type { AniCard, BiliCard, DiscoverHome, HistoryItem, HomeRow, Work } from '../lib/types';

function biliItem(c: BiliCard, badge?: string): PosterItem {
  return {
    key: c.id,
    title: c.title,
    cover: c.cover,
    href: catalogHref(c.id),
    badge: badge ?? (c.episodesText || undefined),
    score: c.score || undefined,
    meta: [c.year, c.orderText].filter(Boolean).join(' · ') || 'B站番剧',
  };
}

function aniItem(c: AniCard): PosterItem {
  return {
    key: `anilist-${c.id}`,
    title: c.title,
    cover: c.cover,
    href: catalogHref(`anilist-${c.id}`),
    badge: c.episodesText || undefined,
    score: c.score || undefined,
    meta: [c.year, c.popularityText].filter(Boolean).join(' · ') || 'AniList',
  };
}

function dedupeSeries(list: BiliCard[]) {
  const seen = new Set<string>();
  const out: BiliCard[] = [];
  for (const c of list) {
    const base = c.title
      .replace(/\s*第\s*[0-9一二三四五六七八九十]+\s*[季期部]/g, '')
      .replace(/\s*[·:：-]?\s*[^\s]{1,8}(篇|章)$/g, '')
      .trim();
    const key = base || c.title;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

function workItem(w: Work): PosterItem {
  return {
    key: w.key,
    title: w.title,
    cover: w.cover,
    href: detailHref(w),
    badge: w.remarks || (w.episodeCount ? `全 ${w.episodeCount} 集` : undefined),
    meta: [w.year, w.typeName].filter(Boolean).join(' · ') || '已收录',
  };
}

function Skeleton() {
  return (
    <div className="container-page pt-6">
      <div className="home-top">
        <div className="skeleton hero-panel !h-[420px]" />
        <div className="home-aside">
          <div className="skeleton h-[300px] rounded-2xl" />
          <div className="skeleton h-[140px] rounded-2xl" />
        </div>
      </div>
      <div className="mt-10 space-y-10">
        {[0, 1].map((i) => (
          <div key={i}>
            <div className="skeleton mb-4 h-6 w-32 rounded" />
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, j) => (
                <div key={j} className="skeleton aspect-[2/3] rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FallbackHero({ work }: { work: Work }) {
  return (
    <section className="hero-panel">
      <img src={imgUrl(work.cover)} alt="" aria-hidden className="hero-panel-bg visible" />
      <div className="hero-panel-shade" />
      <div className="hero-panel-body">
        <div className="mb-3 flex items-center gap-2">
          <span className="chip chip-accent">片源推荐</span>
          <span className="chip">{work.sourceName}</span>
        </div>
        <h1 className="hero-panel-title clamp-2">{work.title}</h1>
        <div className="mt-3 flex flex-wrap gap-3 text-[12.5px] text-white/55">
          {work.year && <span>{work.year}</span>}
          {work.area && <span>{work.area}</span>}
          {work.episodeCount ? <span>全 {work.episodeCount} 集</span> : null}
        </div>
        <p className="hero-panel-sub clamp-3">{work.synopsis || '暂无简介'}</p>
        <div className="mt-6 flex gap-2">
          <Link to={detailHref(work)} className="btn btn-primary h-10 px-5">
            <Play size={15} fill="currentColor" strokeWidth={0} /> 查看详情
          </Link>
        </div>
      </div>
      {work.cover && (
        <Link to={detailHref(work)} className="hero-panel-poster hidden xl:block">
          <img src={imgUrl(work.cover)} alt={work.title} />
        </Link>
      )}
    </section>
  );
}

function ContinueRow({ items }: { items: HistoryItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <div className="section-head">
        <div>
          <h2 className="section-title">继续观看</h2>
          <p className="mt-1.5 pl-[14px] text-[12.5px] text-muted">接着上次的进度</p>
        </div>
        <Link to="/library" className="flex items-center gap-0.5 text-[12.5px] text-white/40 hover:text-white">
          观看记录 <ArrowRight size={14} />
        </Link>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        {items.slice(0, 4).map((h) => {
          const progress = h.duration ? Math.min(100, (h.position / h.duration) * 100) : 0;
          return (
            <Link
              key={h.key}
              to={`/play/${h.sourceId}/${h.vodId}/${h.lineIndex}/${h.episodeIndex}`}
              className="continue-card group"
            >
              <div className="continue-cover">
                <img src={imgUrl(h.cover)} alt="" loading="lazy" />
                <span className="continue-play">
                  <Play size={13} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="clamp-1 text-[12.5px] font-medium">{h.title}</div>
                <div className="mt-0.5 clamp-1 text-[11px] text-white/35">
                  {h.episodeName} · {formatTime(h.position)}
                </div>
                <div className="progress-line mt-2">
                  <span style={{ width: `${progress}%` }} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function Home() {
  useTitle();
  const discover = useApi<DiscoverHome>('/api/discover');
  const fallback = useApi<{ rows: HomeRow[]; hero: Work[] }>(discover.error ? '/api/home' : null);
  const history = useApi<HistoryItem[]>('/api/history');

  const data = discover.data;
  const rows = fallback.data?.rows || [];

  const latest = data?.latest || [];
  const items = useMemo(
    () => ({
      airing: data?.anilistAiring?.length
        ? data.anilistAiring.map(aniItem)
        : (data?.airing || []).map((c) => biliItem(c)),
      top: data?.anilistTop?.length
        ? data.anilistTop.slice(0, 18).map(aniItem)
        : (data?.topRated || []).slice(0, 18).map((c) => biliItem(c)),
      trending: dedupeSeries(data?.trending || [])
        .slice(0, 18)
        .map((c) => biliItem(c)),
      latest: latest.slice(0, 18).map(workItem),
    }),
    [data, latest],
  );

  if (discover.loading && !data) return <Skeleton />;

  if (discover.error && !fallback.data) {
    return (
      <div className="container-page">
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">首页加载失败</div>
          <div className="max-w-md text-[13px]">{discover.error}</div>
          <button className="btn mt-2" onClick={discover.reload}>
            <RefreshCw size={15} /> 重试
          </button>
        </div>
      </div>
    );
  }

  const hero = data?.hero || [];
  const fallbackHero = fallback.data?.hero?.[0] || rows[0]?.items?.[0] || latest[0];
  const promoItem = data?.anilistAiring?.[0] || data?.airing?.[0];
  const promoCount = data?.anilistAiring?.length || data?.airing?.length || 0;

  return (
    <div className="container-page home-page fade-up">
      <div className="home-top">
        {hero.length > 0 ? (
          <Hero slides={hero} />
        ) : fallbackHero ? (
          <FallbackHero work={fallbackHero} />
        ) : (
          <div className="skeleton hero-panel !h-[420px]" />
        )}

        <aside className="home-aside">
          <LatestPanel items={latest.length ? latest : rows.flatMap((r) => r.items)} />
          {promoItem ? (
            <Link to="/airing" className="promo-card">
              <img
                src={imgUrl(promoItem.cover)}
                alt=""
                aria-hidden
                className="promo-bg"
                loading="lazy"
              />
              <div className="promo-shade" />
              <div className="promo-body">
                <div className="flex items-center gap-1.5 text-[11px] text-white/55">
                  <Flame size={12} className="text-[#ff9a62]" /> 本季新番
                </div>
                <div className="mt-1 text-[15px] font-bold">
                  {promoCount} 部正在放送
                </div>
                <div className="mt-1 clamp-1 text-[11.5px] text-white/45">
                  《{promoItem.title}》等
                </div>
                <span className="promo-action">
                  查看片单 <ArrowRight size={13} />
                </span>
              </div>
            </Link>
          ) : (
            <div className="panel p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold">
                <Sparkles size={14} className="text-[#ff8a9d]" /> 还没有可展示的新番
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-white/35">
                B站放送接口不可用时会自动回退到片源首页。
              </p>
            </div>
          )}
        </aside>
      </div>

      <div className="mt-10 space-y-11 pb-4">
        {history.data && <ContinueRow items={history.data} />}

        {data?.anilistWeek?.length ? <ScheduleSection days={data.anilistWeek} /> : null}

        {items.airing.length > 0 && (
          <Row
            title="本季新番"
            subtitle="正在更新 · AniList 评分与关注度"
            items={items.airing}
            hrefMore="/airing"
          />
        )}

        {items.top.length > 0 && (
          <Row
            title="高分好评"
            subtitle="AniList 评分榜 · 先看口碑"
            items={items.top}
            hrefMore="/ranking?type=anilist"
          />
        )}

        {items.latest.length > 0 && (
          <Row title="最近更新" subtitle="来自你启用的片源，点开即可看" items={items.latest} />
        )}

        {items.trending.length > 0 && (
          <Row
            title="大家都在追"
            subtitle="追番人数榜 · B站"
            items={items.trending}
            hrefMore="/ranking?type=follow"
          />
        )}

        {!hero.length && rows.length > 0 && (
          <div className="space-y-10">
            {rows.map((row) => (
              <Row
                key={row.id}
                title={row.title}
                subtitle={row.subtitle}
                items={row.items.map(workItem)}
              />
            ))}
          </div>
        )}

        {!items.latest.length && !hero.length && !rows.length && (
          <div className="empty">
            <div className="empty-icon">
              <RefreshCw size={22} />
            </div>
            <div className="text-[15px] font-semibold text-white/80">还没有内容</div>
            <div className="text-[13px]">去「片源」页添加接口后再回来看看</div>
            <Link to="/sources" className="btn btn-primary mt-1">
              管理片源
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
