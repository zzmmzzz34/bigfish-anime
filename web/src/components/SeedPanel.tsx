import { useEffect, useState } from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { apiGet, apiPost, humanSize } from '../lib/api';

interface SeedStatus {
  running: boolean;
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  message: string;
  seed: {
    generatedAt: string;
    counts: Record<string, number>;
    file: string;
    size: number;
    mtime: number;
  };
}

export default function SeedPanel() {
  const [data, setData] = useState<SeedStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setData(await apiGet<SeedStatus>('/api/seed/status'));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!data?.running) return;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [data?.running]);

  async function sync() {
    setBusy(true);
    try {
      const res = await apiPost<SeedStatus>('/api/seed/sync');
      setData(res);
    } finally {
      setBusy(false);
    }
  }

  const counts = data?.seed.counts || {};
  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <Database size={16} className="text-[#8b7bff]" />
          Bangumi 映射种子
        </div>
        <button className="btn h-8 px-3 text-[11.5px]" onClick={sync} disabled={busy || data?.running}>
          {data?.running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {data?.running ? '同步中…' : '立即同步'}
        </button>
      </div>

      {!data ? (
        <div className="mt-3 text-[12px] text-white/35">正在读取种子状态…</div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">条目</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {counts.items || 0}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">Bangumi 映射</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {counts.bgmByAniList || 0}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">B站 映射</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {counts.biliByAniList || 0}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">文件</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {humanSize(data.seed.size || 0)}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-white/30">
            {data.seed.generatedAt
              ? `生成于 ${new Date(data.seed.generatedAt).toLocaleString('zh-CN')}`
              : '还没有生成时间'}
            。每 6 小时检查一次，超过 7 天自动在后台同步；也点按钮手动跑。
            {data.message && <span className="ml-1 text-white/20">{data.message}</span>}
          </p>
        </>
      )}
    </section>
  );
}
