import { Link, NavLink } from 'react-router-dom';
import {
  Bookmark,
  CalendarClock,
  CalendarDays,
  Fish,
  Flame,
  Heart,
  House,
  Server,
  Trophy,
} from 'lucide-react';

const NAV = [
  { to: '/', label: '首页', icon: House, end: true },
  { to: '/airing', label: '新番', icon: CalendarDays },
  { to: '/schedule', label: '放送', icon: CalendarClock },
  { to: '/ranking', label: '排行', icon: Trophy },
  { to: '/memes', label: '热梗', icon: Flame },
  { to: '/library', label: '收藏', icon: Bookmark },
  { to: '/sources', label: '片源', icon: Server },
];

export default function Sidebar() {
  return (
    <>
      <aside className="sidebar">
        <Link to="/" className="sidebar-logo" aria-label="大肥鱼番剧首页">
          <span className="logo-mark">
            <Fish size={20} strokeWidth={2.1} />
          </span>
        </Link>
        <span className="sidebar-brand">BIGFISH</span>

        <nav className="sidebar-nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `side-item ${isActive ? 'active' : ''}`}
            >
              <Icon size={19} strokeWidth={1.9} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <a
            className="side-item"
            href="https://github.com/Predidit/Kazumi"
            target="_blank"
            rel="noreferrer"
            title="参考项目 Kazumi"
          >
            <Heart size={18} strokeWidth={1.9} />
            <span>致谢</span>
          </a>
        </div>
      </aside>

      <nav className="bottom-nav">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) => `bottom-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={20} strokeWidth={1.9} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
