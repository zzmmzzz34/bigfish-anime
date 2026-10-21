import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Clock3, Play, Trash2, X } from 'lucide-react';
import { apiDelete, apiGet, apiPost, detailHref, formatTime, imgUrl } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import { useToast } from '../components/Toast';
import type { FavoriteItem, HistoryItem } from '../lib/types';

export default function Library() {
  useTitle('收藏与历史');
  const toast = useToast();
  const [tab, setTab] = useState<'history' | 'favorites'>('history');
  const history = useApi<HistoryItem[]>('/api/history');
  const favorites = useApi<FavoriteItem[]>('/api/favorites');

  const removeHistory = async (key: string) => {
    try {
      await apiDelete(`/api/history?key=${encodeURIComponent(key)}`);
      history.setData((prev) => (prev || []).filter((h) => h.key !== key));
    } catch {
      toast('删除失败', 'error');
    }
  };

  const clearHistory = async () => {
    try {
      await apiDelete('/api/history');
      history.setData([]);
      toast('已清空观看记录', 'success');
    } catch {
      toast('清空失败', 'error');
    }
  };

  const removeFavorite = async (key: string) => {
    try {
      await apiPost('/api/favorites', { key });
      favorites.setData((prev) => (prev || []).filter((f) => f.key !== key));
      toast('已取消收藏', 'success');
    } catch {
      toast('操作失败', 'error');
    }
  };

  const hist = history.data || [];
  const favs = favorites.data || [];

  return (
    <div className="container-page py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">我的</h1>
          <p className="mt-2 text-[13px] text-muted">观看进度与收藏都保存在本地服务端</p>
        </div>
        {tab === 'history' && hist.length > 0 && (
          <button className="btn h-9 px-3 text-[12.5px]" onClick={clearHistory}>
            <Trash2 size={14} /> 清空记录
          </button>
        )}
      </div>

      <div className="mb-6 flex border-b border-white/[0.07]">
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          <Clock3 size={14} className="mr-1.5 inline" />
          观看记录 <span className="ml-1 text-white/30">{hist.length}</span>
        </button>
        <button
          className={`tab-btn ${tab === 'favorites' ? 'active' : ''}`}
          onClick={() => setTab('favorites')}
        >
          <Bookmark size={14} className="mr-1.5 inline" />
          我的收藏 <span className="ml-1 text-white/30">{favs.length}</span>
        </button>
      </div>

      {tab === 'history' &&
        (hist.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Clock3 size={22} />
            </div>
            <div className="text-[15px] font-semibold text-white/80">还没有观看记录</div>
            <Link to="/" className="btn btn-primary mt-1">
              去挑一部
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {hist.map((h) => {
              const progress = h.duration ? Math.min(100, (h.position / h.duration) * 100) : 0;
              return (
                <div
                  key={h.key}
                  className="group relative flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.025] p-2.5 transition-all hover:border-white/15 hover:bg-white/[0.05]"
                >
                  <Link
                    to={`/play/${h.sourceId}/${h.vodId}/${h.lineIndex}/${h.episodeIndex}`}
                    className="relative h-[92px] w-[65px] shrink-0 overflow-hidden rounded-lg bg-white/5"
                  >
                    <img src={imgUrl(h.cover)} alt="" className="h-full w-full object-cover" loading="lazy" />
                    <span className="absolute inset-0 grid place-items-center bg-black/45 opacity-0 transition-opacity group-hover:opacity-100">
                      <Play size={19} fill="white" strokeWidth={0} />
                    </span>
                  </Link>
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    <Link
                      to={detailHref(h)}
                      className="clamp-1 pr-6 text-[13.5px] font-semibold hover:text-[#ff97a8]"
                    >
                      {h.title}
                    </Link>
                    <div className="mt-1 clamp-1 text-[11.5px] text-white/45">
                      {h.episodeName} · {h.duration ? formatTime(h.position) : '未开始'}
                    </div>
                    <div className="mt-1 text-[10.5px] text-white/25">
                      {new Date(h.updatedAt).toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </div>
                    <div className="progress-line mt-2">
                      <span style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  <button
                    className="absolute right-2 top-2 rounded-md p-1 text-white/25 opacity-0 transition-all hover:bg-white/10 hover:text-white group-hover:opacity-100"
                    onClick={() => removeHistory(h.key)}
                    aria-label="删除记录"
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        ))}

      {tab === 'favorites' &&
        (favs.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <Bookmark size={22} />
            </div>
            <div className="text-[15px] font-semibold text-white/80">收藏夹还是空的</div>
            <div className="text-[13px]">在作品详情页点一下「收藏」就会出现在这里</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
            {favs.map((f) => (
              <div key={f.key} className="group relative">
                <Link to={detailHref(f)}>
                  <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.03] transition-all group-hover:-translate-y-1 group-hover:border-[var(--accent)]/40">
                    <img
                      src={imgUrl(f.cover)}
                      alt={f.title}
                      loading="lazy"
                      className="aspect-[2/3] w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="clamp-1 mt-2 text-[12.5px] font-medium">{f.title}</div>
                  <div className="mt-0.5 text-[11px] text-white/35">
                    {f.year || '未知年份'} {f.typeName ? `· ${f.typeName}` : ''}
                  </div>
                </Link>
                <button
                  className="absolute right-2 top-2 rounded-md bg-black/50 p-1 text-white/60 opacity-0 backdrop-blur transition-all hover:text-white group-hover:opacity-100"
                  onClick={() => removeFavorite(f.key)}
                  aria-label="取消收藏"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}
