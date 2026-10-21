import { Link } from 'react-router-dom';
import { Play, RefreshCw } from 'lucide-react';
import { detailHref, imgUrl } from '../lib/api';
import type { Work } from '../lib/types';

export function LatestPanel({ items }: { items: Work[] }) {
  return (
    <section className="panel latest-panel">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[14.5px] font-bold">
          <RefreshCw size={14} className="text-[#ff8a9d]" />
          最近更新
        </div>
        <span className="text-[11px] text-white/30">{items.length} 部</span>
      </div>
      <div className="space-y-1">
        {items.slice(0, 4).map((w) => (
          <Link key={w.key} to={detailHref(w)} className="latest-row group">
            <div className="latest-cover">
              <img src={imgUrl(w.cover)} alt="" loading="lazy" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="clamp-1 text-[12.5px] font-medium text-white/85 group-hover:text-white">
                {w.title}
              </div>
              <div className="mt-0.5 clamp-1 text-[11px] text-white/35">
                {w.remarks || (w.episodeCount ? `全 ${w.episodeCount} 集` : '已收录')}
              </div>
            </div>
            <span className="latest-play">
              <Play size={12} fill="currentColor" strokeWidth={0} style={{ marginLeft: 1 }} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
