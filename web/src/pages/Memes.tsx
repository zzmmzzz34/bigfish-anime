import { Flame, MessageCircle, ThumbsUp, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { catalogHref, imgUrl } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import type { MemeAnime } from '../lib/types';

function episodeLabel(item: MemeAnime) {
  const long = item.episode.longTitle?.trim();
  if (long && long !== item.episode.title) return long;
  return item.episode.title || '最新一集';
}

export default function Memes() {
  useTitle('B站热梗');
  const { data, loading, error, reload } = useApi<{ items: MemeAnime[] }>(
    '/api/bilibili/memes?limit=12',
  );
  const items = data?.items || [];

  return (
    <div className="container-page py-8">
      <div className="mb-7">
        <h1 className="flex items-center gap-2 text-[24px] font-bold tracking-tight">
          <Flame size={22} className="text-[#ff8a9d]" />
          B站热梗
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          自动抓取 B站热门番最新一集的热评，按番剧聚合 · 图一乐
          <span className="mt-1 block text-[11px] text-white/25">
            只聚合 B站有热评的番；Netflix 独占或 B站未收录的作品（如赛博朋克）不会出现在这里。
          </span>
        </p>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-48 rounded-2xl" />
          ))}
        </div>
      ) : error && !data ? (
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert size={22} />
          </div>
          <div className="text-[14px] text-white/60">{error}</div>
          <button className="btn" onClick={reload}>
            重试
          </button>
        </div>
      ) : items.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <article
              key={item.seasonId}
              className="panel overflow-hidden p-4 transition-colors hover:border-white/15"
            >
              <div className="flex items-center gap-3">
                <Link
                  to={catalogHref(item.seasonId)}
                  className="h-[62px] w-[46px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/5"
                >
                  <img
                    src={imgUrl(item.cover)}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={catalogHref(item.seasonId)}
                    className="clamp-1 text-[14px] font-semibold hover:text-[#ffb3c0]"
                  >
                    {item.title}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-white/35">
                    <span className="rounded bg-[#ff4d6d]/10 px-1.5 py-0.5 text-[#ff9aab]/80">
                      B站热评
                    </span>
                    {item.orderText && <span>{item.orderText}</span>}
                    <span className="text-white/20">·</span>
                    <span>{episodeLabel(item)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                {item.comments.map((c) => (
                  <a
                    key={c.id}
                    href={c.link}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-xl border border-white/[0.05] bg-white/[0.025] px-3 py-2.5 transition-colors hover:border-white/15 hover:bg-white/[0.045]"
                  >
                    <p className="text-[12.5px] leading-5 text-white/70">{c.text}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/25">
                      <span className="truncate">{c.author}</span>
                      <span className="text-white/15">·</span>
                      <span className="flex items-center gap-0.5">
                        <ThumbsUp size={10} /> {c.likes}
                      </span>
                      {c.replies > 0 && (
                        <span className="flex items-center gap-0.5">
                          <MessageCircle size={10} /> {c.replies}
                        </span>
                      )}
                      {c.date && <span className="ml-auto">{c.date}</span>}
                    </div>
                  </a>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="empty-icon">
            <Flame size={22} />
          </div>
          <div className="text-[14px] text-white/55">暂时没有抓到热评，过一会儿再试。</div>
          <button className="btn" onClick={reload}>
            重试
          </button>
        </div>
      )}

      <p className="mt-8 text-[11px] text-white/20">
        热评来自 B站公开接口，按热度排序；仅作讨论索引，不存储视频。
      </p>
    </div>
  );
}
