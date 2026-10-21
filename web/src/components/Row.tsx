import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import PosterCard, { type PosterItem } from './PosterCard';

interface Props {
  title: string;
  subtitle?: string;
  items: PosterItem[];
  hrefMore?: string;
}

export default function Row({ title, subtitle, items, hrefMore }: Props) {
  if (!items.length) return null;

  return (
    <section>
      <div className="section-head">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          {subtitle && <p className="mt-1.5 pl-[14px] text-[12.5px] text-muted">{subtitle}</p>}
        </div>
        {hrefMore && (
          <Link to={hrefMore} className="flex items-center gap-0.5 text-[12.5px] text-white/40 hover:text-white">
            更多 <ChevronRight size={14} />
          </Link>
        )}
      </div>
      <div className="row-track hide-scrollbar">
        {items.map((item) => (
          <PosterCard key={item.key} item={item} />
        ))}
      </div>
    </section>
  );
}
