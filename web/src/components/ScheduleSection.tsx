import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import PosterCard, { type PosterItem } from './PosterCard';
import { catalogHref } from '../lib/api';
import type { AniWeekDay } from '../lib/types';

interface Props {
  days: AniWeekDay[];
  limit?: number;
}

export default function ScheduleSection({ days, limit = 8 }: Props) {
  const initial = useMemo(() => {
    const today = days.find((d) => d.isToday && d.items.length);
    if (today) return today.weekday;
    const first = days.find((d) => d.items.length);
    return first ? first.weekday : 1;
  }, [days]);
  const [active, setActive] = useState(initial);

  useEffect(() => setActive(initial), [initial]);

  if (!days.length) return null;
  const day = days.find((d) => d.weekday === active) || days[0];

  const items: PosterItem[] = day.items.slice(0, limit).map((item) => ({
    key: `${item.id}:${item.episode}`,
    title: item.title,
    cover: item.cover,
    href: catalogHref(`anilist-${item.id}`),
    badge: item.episode ? `第 ${item.episode} 话` : undefined,
    score: item.score || undefined,
    meta: [item.timeText, item.popularityText].filter(Boolean).join(' · '),
  }));

  return (
    <section>
      <div className="section-head">
        <div>
          <h2 className="section-title">新番周报</h2>
          <p className="mt-1.5 pl-[14px] text-[12.5px] text-muted">
            放送表来自 AniList · 时间为北京时间
          </p>
        </div>
        <Link to="/schedule" className="flex items-center gap-0.5 text-[12.5px] text-white/40 hover:text-white">
          更多 <ChevronRight size={14} />
        </Link>
      </div>

      <div className="schedule-tabs hide-scrollbar">
        {days.map((d) => (
          <button
            key={d.weekday}
            className={`schedule-tab ${d.weekday === active ? 'active' : ''}`}
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

      {items.length ? (
        <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {items.map((item) => (
            <PosterCard key={item.key} item={item} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/10 px-4 py-8 text-[12.5px] text-white/35">
          <CalendarDays size={15} /> 这一天暂时没有放送数据
        </div>
      )}
    </section>
  );
}
