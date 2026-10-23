import { useEffect, useRef, useState } from 'react';
import { Database, Download, Loader2, Upload } from 'lucide-react';
import { apiGet, apiPost } from '../lib/api';

interface BackupStatus {
  counts: {
    history: number;
    favorites: number;
    danmakuKeys: number;
    commentKeys: number;
    aliases: number;
    manualMatches: number;
  };
  backups: Array<{ name: string; size: number; mtime: number }>;
}

export default function BackupPanel() {
  const [data, setData] = useState<BackupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    try {
      setData(await apiGet<BackupStatus>('/api/backup/status'));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function importFile(file: File) {
    if (!window.confirm('导入会用备份覆盖当前观看记录、收藏、弹幕和校正数据，确定继续？')) return;
    setBusy(true);
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      await apiPost('/api/backup/import', payload);
      window.location.reload();
    } catch (err: any) {
      window.alert(err?.message || '导入失败');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <Database size={16} className="text-[#8b7bff]" />
          数据备份
        </div>
        <div className="flex gap-2">
          <a className="btn h-8 px-3 text-[11.5px]" href="/api/backup/export" download>
            <Download size={13} /> 导出 JSON
          </a>
          <button
            className="btn h-8 px-3 text-[11.5px]"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
            导入
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) importFile(file);
            }}
          />
        </div>
      </div>

      {!data ? (
        <div className="mt-3 text-[12px] text-white/35">正在读取备份状态…</div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">历史</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.counts.history}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">收藏</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.counts.favorites}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">弹幕库</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.counts.danmakuKeys}
              </div>
            </div>
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2">
              <div className="text-[10px] text-white/30">手动匹配</div>
              <div className="mt-0.5 text-[14px] font-semibold tabular-nums text-white/80">
                {data.counts.aliases + data.counts.manualMatches}
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-white/30">
            导出包含历史、收藏、弹幕、校正、别名和手动绑定；片源配置会一起备份，但导入时不覆盖当前片源。
            每天自动备份到 `data/backups/`，保留最近 14 份。
            {data.backups[0] && (
              <span className="ml-1 text-white/20">
                最近：{new Date(data.backups[0].mtime).toLocaleString('zh-CN')}
              </span>
            )}
          </p>
        </>
      )}
    </section>
  );
}
