import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bookmark, Fish, Search, Server } from 'lucide-react';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setQ(location.pathname === '/search' ? params.get('q') || '' : '');
  }, [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /INPUT|TEXTAREA|SELECT/.test(target?.tagName || '');
      if (!typing && (e.key === '/' || (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = q.trim();
    if (!value) return;
    navigate(`/search?q=${encodeURIComponent(value)}`);
    inputRef.current?.blur();
  };

  return (
    <header className="site-header">
      <div className="container-page header-inner">
        <Link to="/" className="flex shrink-0 items-center gap-2 md:hidden">
          <span className="logo-mark h-8 w-8">
            <Fish size={17} strokeWidth={2.1} />
          </span>
          <span className="text-[15px] font-extrabold tracking-tight">大肥鱼番剧</span>
        </Link>

        <form onSubmit={submit} className="search-shell header-search">
          <Search size={15} className="shrink-0 text-white/35" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索番剧名称…（按 / 快速聚焦）"
            aria-label="搜索番剧"
          />
          <kbd className="hidden rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40 sm:block">
            Enter
          </kbd>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Link to="/sources" className="btn hidden h-9 px-3 text-[12.5px] sm:inline-flex">
            <Server size={14} /> 片源
          </Link>
          <Link
            to="/library"
            className="btn-icon h-9 w-9 border border-white/10"
            title="我的收藏"
            aria-label="我的收藏"
          >
            <Bookmark size={16} />
          </Link>
        </div>
      </div>
    </header>
  );
}
