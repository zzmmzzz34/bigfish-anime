import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Play, Search, Star } from 'lucide-react';
import { catalogHref, imgUrl, searchHref } from '../lib/api';
import type { BiliCard } from '../lib/types';

export default function Hero({ slides }: { slides: BiliCard[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % slides.length), 9000);
    return () => clearInterval(timer);
  }, [slides.length, paused]);

  if (!slides.length) return null;
  const current = slides[Math.min(index, slides.length - 1)];

  const go = (dir: number) => {
    setIndex((i) => (i + dir + slides.length) % slides.length);
  };

  return (
    <section
      className="hero-panel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {slides.map((s, i) => (
        <img
          key={s.id}
          src={imgUrl(s.cover)}
          alt=""
          aria-hidden
          className={`hero-panel-bg ${i === index ? 'visible' : ''}`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ))}
      <div className="hero-panel-shade" />

      <div className="hero-panel-body">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="chip chip-accent">编辑推荐</span>
          {current.score ? (
            <span className="score-chip">
              <Star size={11} fill="currentColor" strokeWidth={0} />
              {current.score.toFixed(1)}
              <em>B站</em>
            </span>
          ) : null}
          {current.genres?.slice(0, 2).map((g) => (
            <span key={g} className="chip">
              {g}
            </span>
          ))}
        </div>

        <h1 className="hero-panel-title clamp-2">{current.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-white/55">
          {current.year && <span>{current.year}</span>}
          {current.area && <span>{current.area}</span>}
          {current.episodesText && <span>{current.episodesText}</span>}
          {current.orderText && <span className="text-white/35">{current.orderText}</span>}
        </div>

        <p className="hero-panel-sub clamp-2">
          {current.synopsis || '暂无简介，点进详情查看剧集与播放线路。'}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <Link to={catalogHref(current.id)} className="btn btn-primary h-10 px-5">
            <Play size={15} fill="currentColor" strokeWidth={0} />
            查看详情
          </Link>
          <Link to={searchHref(current.title)} className="btn h-10 px-4">
            <Search size={15} />
            在片源中找
          </Link>
        </div>
      </div>

      {current.cover && (
        <Link to={catalogHref(current.id)} className="hero-panel-poster hidden xl:block" aria-label={current.title}>
          <img src={imgUrl(current.cover)} alt={current.title} />
        </Link>
      )}

      {slides.length > 1 && (
        <>
          <button className="hero-arrow left-3" onClick={() => go(-1)} aria-label="上一张">
            <ChevronLeft size={18} />
          </button>
          <button className="hero-arrow right-3" onClick={() => go(1)} aria-label="下一张">
            <ChevronRight size={18} />
          </button>
          <div className="hero-dots">
            {slides.map((s, i) => (
              <button
                key={s.id}
                className={`hero-dot ${i === index ? 'active' : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`切换到 ${s.title}`}
              />
            ))}
          </div>
        </>
      )}

    </section>
  );
}
