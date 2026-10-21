import { useEffect, useState } from 'react';
import { Database, Download, HardDrive, Loader2, RefreshCw } from 'lucide-react';
import { apiGet, apiPost, humanSize } from '../lib/api';

interface CacheStats {
  enabled: boolean;
  subjects: number;
  episodes: number;
  latestFetchedAt: number;
  fileBytes: number;
  file: string;
}

interface PrefetchStatus {
  running: boolean;
  scope: string;
  total: number;
  done: number;
  ok: number;
  failed: number;
  current: number;
  message: string;
  startedAt: number;
  finishedAt: number;
}

const EMPTY_STATS: CacheStats = {
  enabled: false,
  subjects: 0,
  episodes: 0,
  latestFetchedAt: 0,
  fileBytes: 0,
  file: '',
};

function ago(ts: number) {
  if (!ts) return '还没有缓存';
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function BangumiCachePanel() {
  const [stats, setStats] = useState<CacheStats>(EMPTY_STATS);
  const [status, setStatus] = useState<PrefetchStatus | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function loadStats() {
    try {
      setStats(await apiGet<CacheStats>('/api/bangumi/cache/stats'));
    } catch {
      /* ignore */
    }
  }

  async function loadStatus() {
    try {
      setStatus(await apiGet<PrefetchStatus>('/api/bangumi/prefetch/status'));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadStats();
    loadStatus();
  }, []);

  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(async () => {
      try {
        const next = await apiGet<PrefetchStatus>('/api/bangumi/prefetch/status');
        setStatus(next);
        if (!next.running) loadStats();
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearInterval(timer);
  }, [status?.running]);

  async function start(scope: 'season' | 'favorites') {
    setBusy(scope);
    setError('');
    try {
      const next = await apiPost<PrefetchStatus>('/api/bangumi/prefetch', { scope });
      setStatus(next);
    } catch (err: any) {
      setError(err?.message || '启动失败');
    } finally {
      setBusy('');
    }
  }

  const pct = status && status.total ? Math.round((status.done / status.total) * 100) : 0;

  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <Database size={16} className="text-[#ff8a9d]" />
            Bangumi 缓存
          </h2>
          <p className="mt-1 text-[12px] text-white/40">
            把评分、排名、简介和集数存在本地 SQLite；反代被墙时继续用旧数据。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn"
            onClick={() => start('season')}
            disabled={Boolean(busy) || Boolean(status?.running)}
          >
            {busy === 'season' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            预热当季
          </button>
          <button
            className="btn"
            onClick={() => start('favorites')}
            disabled={Boolean(busy) || Boolean(status?.running)}
          >
            {busy === 'favorites' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            预热收藏
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <div className="text-[10px] text-white/35">已缓存番剧</div>
          <div className="mt-0.5 text-[18px] font-bold">{stats.subjects}</div>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <div className="text-[10px] text-white/35">已缓存集数</div>
          <div className="mt-0.5 text-[18px] font-bold">{stats.episodes}</div>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <div className="text-[10px] text-white/35">最近更新</div>
          <div className="mt-0.5 text-[13px] font-semibold">{ago(stats.latestFetchedAt)}</div>
        </div>
        <div className="rounded-lg border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <div className="flex items-center gap-1 text-[10px] text-white/35">
            <HardDrive size={10} /> 占用
          </div>
          <div className="mt-0.5 text-[13px] font-semibold">{humanSize(stats.fileBytes)}</div>
        </div>
      </div>

      {status?.running && (
        <div className="mt-3 rounded-lg border border-[#ff4d6d]/20 bg-[#ff4d6d]/[0.05] px-3 py-2.5">
          <div className="flex items-center justify-between text-[11.5px] text-white/60">
            <span>
              正在预热 · {status.done}/{status.total || '…'}
              {status.current ? ` · #${status.current}` : ''}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-[#ff4d6d] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {!status?.running && status?.message && (
        <div className="mt-3 text-[11.5px] text-white/40">{status.message}</div>
      )}
      {error && <div className="mt-3 text-[11.5px] text-[#ff8a9d]">{error}</div>}
      {!stats.enabled && (
        <div className="mt-3 text-[11.5px] text-white/35">
          当前 Node 不支持 `node:sqlite`，缓存未启用；升级到 Node 22.5+ 即可。
        </div>
      )}
    </section>
  );
}
