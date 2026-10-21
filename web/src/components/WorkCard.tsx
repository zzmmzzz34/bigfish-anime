import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play } from 'lucide-react';
import { detailHref, imgUrl, cx } from '../lib/api';
import type { Work } from '../lib/types';

interface Props {
  work: Work;
  showSource?: boolean;
  compact?: boolean;
}

export default function WorkCard({ work, showSource = true, compact = false }: Props) {
  const [failed, setFailed] = useState(false);
  const badge = work.remarks || (work.episodeCount ? `全 ${work.episodeCount} 集` : '');

  return (
    <Link to={detailHref(work)} className={cx('work-card group', compact && 'rounded-xl')}>
      <div className="relative overflow-hidden">
        {failed || !work.cover ? (
          <div className="work-cover flex items-center justify-center bg-gradient-to-br from-[#1c2029] to-[#0e1015] px-3 text-center">
            <span className="clamp-3 text-[13px] font-medium text-white/45">{work.title}</span>
          </div>
        ) : (
          <img
            src={imgUrl(work.cover)}
            alt={work.title}
            loading="lazy"
            className="work-cover"
            onError={() => setFailed(true)}
          />
        )}
        {badge && <span className="work-badge">{badge}</span>}
        {showSource && <span className="work-source">{work.sourceName}</span>}
        <div className="work-overlay">
          <span className="play-fab">
            <Play size={20} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />
          </span>
        </div>
        <div className="work-meta">
          <div className="clamp-1 text-[13.5px] font-semibold leading-snug text-white">{work.title}</div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-white/55">
            <span>{work.year || '年份未知'}</span>
            {work.typeName && (
              <>
                <span className="h-0.5 w-0.5 rounded-full bg-white/40" />
                <span className="clamp-1">{work.typeName}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
