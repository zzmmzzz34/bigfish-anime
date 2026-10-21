import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, Star } from 'lucide-react';
import { imgUrl } from '../lib/api';

export interface PosterItem {
  key: string;
  title: string;
  cover: string;
  href: string;
  meta?: string;
  badge?: string;
  score?: number;
  rank?: number;
}

export default function PosterCard({ item }: { item: PosterItem }) {
  const [failed, setFailed] = useState(false);

  return (
    <Link to={item.href} className="poster-card group">
      <div className="poster-media">
        {failed || !item.cover ? (
          <div className="poster-img flex items-center justify-center bg-gradient-to-br from-[#1c2029] to-[#0e1015] px-3 text-center">
            <span className="clamp-3 text-[12px] font-medium text-white/45">{item.title}</span>
          </div>
        ) : (
          <img
            src={imgUrl(item.cover)}
            alt={item.title}
            loading="lazy"
            className="poster-img"
            onError={() => setFailed(true)}
          />
        )}

        {item.badge && <span className="poster-badge">{item.badge}</span>}
        {item.score ? (
          <span className="poster-score">
            <Star size={10} fill="currentColor" strokeWidth={0} />
            {item.score.toFixed(1)}
          </span>
        ) : null}
        {item.rank ? <span className="poster-rank">{item.rank}</span> : null}

        <div className="poster-hover">
          <span className="play-fab">
            <Play size={19} fill="currentColor" strokeWidth={0} style={{ marginLeft: 2 }} />
          </span>
        </div>

        <div className="poster-gradient">
          <div className="poster-title clamp-2">{item.title}</div>
          {item.meta && <div className="poster-meta clamp-1">{item.meta}</div>}
        </div>
      </div>
    </Link>
  );
}
