import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import PosterCard, { type PosterItem } from '../components/PosterCard';
import { catalogHref } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import type { AniWeekDay } from '../lib/types';

export default function Schedule() {
  useTitle('新番周报');
  const { data, loading, error, reload } = useApi<{
    days: AniWeekDay[];
    fallback?: 'bilibili' | 'bangumi';
  }>('/api/anilist/week');
  const days = data?.days || [];
  const initial = days.find((d) => d.isToday)?.weekday || 1;
  const [active, setActive] = useState<number | null>(null);
  const current = days.find((d) => d.weekday === (active ?? initial)) || days[0];

  const posters: PosterItem[] = (current?.items || []).map((item) => ({
    key: `${item.id}:${item.episode}`,
    title: item.title,
    cover: item.cover,
    href: item.href || catalogHref(`anilist-${item.id}`),
    badge: item.episode ? `第 ${item.episode} 话` : undefined,
    score: item.score || undefined,
    meta: [item.timeText, item.popularityText].filter(Boolean).join(' · '),
  }));

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-[24px] font-bold tracking-tight">
          <CalendarDays size={22} className="text-[#ff8a9d]" />
          新番周报
        </h1>
        <p className="mt-2 text-[13px] text-muted">
          放送表 · 北京时间 · 本周（{days[0]?.date} 起）
        </p>
        {data?.fallback && (
          <p className="mt-1 text-[11px] text-[#ffb3c0]">
            AniList 暂时不可用，已切换到 {data.fallback === 'bangumi' ? 'Bangumi' : 'B站'} 放送表
          </p>
        )}
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
        <>
          <div className="schedule-tabs hide-scrollbar">
            {days.map((d) => (
              <button
                key={d.weekday}
                className={`schedule-tab ${d.weekday === current?.weekday ? 'active' : ''}`}
                onClick={() => setActive(d.weekday)}
              >
                <span className="flex items-center gap-1">
                  {d.label}
                  {d.isToday && <em>今天</em>}
                </span>
                <span className="schedule-date">{d.date}</span>
                <span className="schedule-count">{d.items.length}</span>
              </button>
            ))}
          </div>

          <div className="mb-4 flex items-center justify-between">
            <div className="text-[13px] text-white/55">
              {current?.label} · {current?.date} · {current?.items.length || 0} 部
            </div>
            <div className="flex gap-1">
              <button
                className="btn-icon h-8 w-8 border border-white/10"
                onClick={() => {
                  if (!current) return;
                  const i = days.findIndex((d) => d.weekday === current.weekday);
                  const prev = days[(i - 1 + days.length) % days.length];
                  setActive(prev.weekday);
                }}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                className="btn-icon h-8 w-8 border border-white/10"
                onClick={() => {
                  if (!current) return;
                  const i = days.findIndex((d) => d.weekday === current.weekday);
                  const next = days[(i + 1) % days.length];
                  setActive(next.weekday);
                }}
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          {posters.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
              {posters.map((p) => (
                <PosterCard key={p.key} item={p} />
              ))}
            </div>
          ) : (
            <div className="empty">这一天暂时没有放送数据</div>
          )}
        </>
      )}
    </div>
  );
}
