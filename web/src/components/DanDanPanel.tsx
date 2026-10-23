import { useEffect, useState } from 'react';
import { Database, Loader2, RefreshCw } from 'lucide-react';
import { apiGet } from '../lib/api';

interface DanDanStatus {
  configured: boolean;
  base: string;
  appId: string;
  cache: {
    enabled: boolean;
    results: number;
    anime: number;
    misses: number;
    lastAt: number;
  };
  usage: { today: number; month: number; all: number };
  limits: { daily: number; monthly: number };
  remaining: { today: number; month: number };
}

function ago(ts: number) {
  if (!ts) return '暂无缓存';
  const min = Math.floor((Date.now() - ts) / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export default function DanDanPanel() {
  const [data, setData] = useState<DanDanStatus | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      setData(await apiGet<DanDanStatus>('/api/dandan/status'));
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <Database size={16} className="text-[#8b7bff]" />
          DanDanPlay 弹幕
          {data && (
            <span className={`chip h-5 text-[10px] ${data.configured ? 'chip-accent' : ''}`}>
              {data.configured ? '已配置' : '未配置'}
            </span>
          )}
        </div>
        <button className="btn-icon h-7 w-7" onClick={load} disabled={busy} title="刷新状态">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
        </button>
      </div>

      {!data ? (
        <div className="mt-3 text-[12px] text-white/35">正在读取状态…</div>
      ) : !data.configured ? (
        <p className="mt-3 text-[12px] leading-5 text-white/40">
          未配置 AppId / AppSecret。填到 config.env 后重启服务即可启用；未配置时只使用本地和 B站弹幕。
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">缓存分集</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.cache.results}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">匹配作品</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.cache.anime}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">今日 API</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.usage.today}
                <span className="ml-1 text-[10px] font-normal text-white/25">
                  / {data.limits.daily}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">本月 API</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.usage.month}
                <span className="ml-1 text-[10px] font-normal text-white/25">
                  / {data.limits.monthly}
                </span>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-white/30">
            分集弹幕缓存 6 小时，匹配缓存 7 天；无匹配负缓存 6 小时（{data.cache.misses} 条）。
            命中缓存不消耗 API 额度。今日剩余 {data.remaining.today} 次，本月剩余{' '}
            {data.remaining.month} 次。最近缓存：{ago(data.cache.lastAt)}。
          </p>
        </>
      )}
    </section>
  );
}
