import { useState } from 'react';
import {
  CheckCircle2,
  CircleSlash,
  Database,
  Loader2,
  Pencil,
  Plus,
  Server,
  Trash2,
  TriangleAlert,
  X,
  Zap,
} from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '../lib/api';
import { useApi, useTitle } from '../lib/hooks';
import { useToast } from '../components/Toast';
import BangumiCachePanel from '../components/BangumiCachePanel';
import BackupPanel from '../components/BackupPanel';
import DanDanPanel from '../components/DanDanPanel';
import SeedPanel from '../components/SeedPanel';
import type { Source, SourceTest } from '../lib/types';

interface Draft {
  id?: string;
  type: 'maccms' | 'kazumi';
  name: string;
  api: string;
  referer: string;
  ruleText: string;
}

const emptyDraft = (): Draft => ({ type: 'maccms', name: '', api: '', referer: '', ruleText: '' });

export default function Sources() {
  useTitle('片源管理');
  const toast = useToast();
  const { data, loading, setData, reload } = useApi<Source[]>('/api/sources');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [test, setTest] = useState<SourceTest | null>(null);
  const [busy, setBusy] = useState<'test' | 'save' | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testById, setTestById] = useState<Record<string, SourceTest>>({});

  const sources = data || [];
  const active = sources.filter((s) => s.enabled).length;

  const openAdd = () => {
    setDraft(emptyDraft());
    setTest(null);
    setOpen(true);
  };

  const openEdit = (s: Source) => {
    setDraft({
      id: s.id,
      type: s.type,
      name: s.name,
      api: s.api,
      referer: s.referer || '',
      ruleText: s.rule ? JSON.stringify(s.rule, null, 2) : '',
    });
    setTest(null);
    setOpen(true);
  };

  const buildBody = () => {
    const body: any = {
      name: draft.name.trim(),
      type: draft.type,
      api: draft.api.trim(),
      referer: draft.referer.trim(),
    };
    if (draft.type === 'kazumi') {
      if (!draft.ruleText.trim()) throw new Error('请粘贴 Kazumi 规则 JSON');
      let rule: any;
      try {
        rule = JSON.parse(draft.ruleText);
      } catch {
        throw new Error('规则 JSON 格式有误');
      }
      body.rule = rule;
      body.api = draft.api.trim() || rule.baseURL || '';
      body.name = body.name || rule.name || 'Kazumi 源';
    }
    if (!body.api) throw new Error('请填写接口地址');
    return body;
  };

  const runTest = async () => {
    setBusy('test');
    setTest(null);
    try {
      const body = buildBody();
      const res = await apiPost<SourceTest>('/api/sources/test', body);
      setTest(res);
    } catch (err: any) {
      toast(err.message || '测试失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    try {
      const body = buildBody();
      if (draft.id) {
        const res = await fetch(`/api/sources/${draft.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '保存失败');
      } else {
        await apiPost('/api/sources', body);
      }
      toast(draft.id ? '片源已更新' : '片源已添加', 'success');
      setOpen(false);
      reload();
    } catch (err: any) {
      toast(err.message || '保存失败', 'error');
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (s: Source) => {
    try {
      await fetch(`/api/sources/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !s.enabled }),
      });
      setData((prev) => (prev || []).map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)));
    } catch {
      toast('操作失败', 'error');
    }
  };

  const remove = async (s: Source) => {
    if (!confirm(`确定删除片源「${s.name}」吗？`)) return;
    try {
      await apiDelete(`/api/sources/${s.id}`);
      setData((prev) => (prev || []).filter((x) => x.id !== s.id));
      toast('已删除', 'success');
    } catch {
      toast('删除失败', 'error');
    }
  };

  const testSource = async (s: Source) => {
    setTestingId(s.id);
    try {
      const res = await apiPost<SourceTest>('/api/sources/test', { id: s.id });
      setTestById((prev) => ({ ...prev, [s.id]: res }));
      toast(`${s.name} 连接正常 · ${res.latency}ms`, 'success');
    } catch (err: any) {
      setTestById((prev) => ({
        ...prev,
        [s.id]: {
          ok: false,
          name: s.name,
          api: s.api,
          latency: 0,
          total: 0,
          categories: 0,
          animeCategories: [],
          sample: [],
          note: err.message,
        },
      }));
      toast(`${s.name} 连接失败`, 'error');
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="container-page py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">片源管理</h1>
          <p className="mt-2 text-[13px] text-muted">
            已启用 {active} / {sources.length} 个接口 · 所有剧集、简介、年份都由这里配置的源提供
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> 添加片源
        </button>
      </div>

      <div className="panel mb-6 flex flex-wrap items-start gap-3 p-4 text-[12.5px] leading-relaxed text-white/45">
        <Database size={18} className="mt-0.5 shrink-0 text-[#ff8a9d]" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-white/75">两种接入方式</div>
          <p className="mt-1">
            <b className="text-white/70">MacCMS 接口</b>：填形如{' '}
            <code className="rounded bg-white/10 px-1 py-0.5 text-[11.5px] text-white/70">
              https://xxx.com/api.php/provide/vod/
            </code>{' '}
            的地址，自动获得搜索、选集、简介、年份、导演信息。
          </p>
          <p className="mt-1">
            <b className="text-white/70">Kazumi 规则</b>：直接粘贴 Kazumi 的规则 JSON（API 模式），复用社区规则。
          </p>
          <p className="mt-2 text-white/30">
            本站只做聚合与播放，不存储视频；请仅添加你有权访问的接口。
          </p>
        </div>
      </div>

      {loading && !data && (
        <div className="grid gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-40 rounded-xl" />
          ))}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {sources.map((s) => {
          const t = testById[s.id];
          return (
            <div
              key={s.id}
              className={`relative min-w-0 overflow-hidden rounded-xl border p-4 transition-colors ${
                s.enabled
                  ? 'border-white/[0.08] bg-white/[0.03]'
                  : 'border-white/[0.05] bg-white/[0.012] opacity-60'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    s.enabled ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.8)]' : 'bg-white/20'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-semibold">{s.name}</span>
                    <span className="chip h-5 text-[10.5px]">
                      {s.type === 'maccms' ? 'MacCMS' : 'Kazumi'}
                    </span>
                    {s.rule?.version && <span className="chip h-5 text-[10.5px]">v{s.rule.version}</span>}
                    {!s.enabled && <span className="chip h-5 text-[10.5px]">已停用</span>}
                  </div>
                  <div className="mt-1.5 truncate font-mono text-[11.5px] text-white/35" title={s.api}>
                    {s.api}
                  </div>

                  {t && (
                    <div
                      className={`mt-2.5 rounded-lg border px-2.5 py-2 text-[11.5px] ${
                        t.ok
                          ? 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200/80'
                          : 'border-rose-400/20 bg-rose-400/[0.06] text-rose-200/80'
                      }`}
                    >
                      {t.ok ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 size={12} /> {t.latency}ms
                          </span>
                          <span>{t.categories ? `${t.categories} 个分类` : ''}</span>
                          {t.animeCategories.length > 0 && (
                            <span className="clamp-1">动漫分类：{t.animeCategories.slice(0, 3).join(' / ')}</span>
                          )}
                          {t.sample.length > 0 && (
                            <span className="clamp-1 w-full text-white/40">示例：{t.sample.join('、')}</span>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <TriangleAlert size={12} /> {t.note || '连接失败'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <button
                  className={`switch ${s.enabled ? 'on' : ''}`}
                  onClick={() => toggle(s)}
                  aria-label={s.enabled ? '停用' : '启用'}
                />
              </div>

              <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.05] pt-3">
                <button
                  className="btn h-8 px-2.5 text-[12px]"
                  onClick={() => testSource(s)}
                  disabled={testingId === s.id}
                >
                  {testingId === s.id ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                  测试
                </button>
                <button className="btn h-8 px-2.5 text-[12px]" onClick={() => openEdit(s)}>
                  <Pencil size={13} /> 编辑
                </button>
                <button
                  className="btn ml-auto h-8 px-2.5 text-[12px] text-rose-300/80 hover:text-rose-200"
                  onClick={() => remove(s)}
                >
                  <Trash2 size={13} /> 删除
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && sources.length === 0 && (
        <div className="empty">
          <div className="empty-icon">
            <Server size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">还没有任何片源</div>
          <button className="btn btn-primary mt-1" onClick={openAdd}>
            <Plus size={15} /> 添加第一个片源
          </button>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="text-[16px] font-bold">{draft.id ? '编辑片源' : '添加片源'}</div>
              <button className="btn-icon" onClick={() => setOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div className="flex gap-2">
                {[
                  { key: 'maccms', label: 'MacCMS 接口' },
                  { key: 'kazumi', label: 'Kazumi 规则' },
                ].map((t) => (
                  <button
                    key={t.key}
                    className={`line-pill ${draft.type === t.key ? 'active' : ''}`}
                    onClick={() => {
                      setDraft((d) => ({ ...d, type: t.key as any }));
                      setTest(null);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[12.5px] text-white/55">名称</span>
                <input
                  className="input"
                  placeholder="例如：量子资源"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>

              {draft.type === 'maccms' ? (
                <label className="block">
                  <span className="mb-1.5 block text-[12.5px] text-white/55">接口地址</span>
                  <input
                    className="input font-mono text-[12.5px]"
                    placeholder="https://example.com/api.php/provide/vod/"
                    value={draft.api}
                    onChange={(e) => setDraft((d) => ({ ...d, api: e.target.value }))}
                  />
                  <span className="mt-1.5 block text-[11px] leading-relaxed text-white/30">
                    支持苹果 CMS V10（?ac=detail&wd= 搜索）。填完可以点「测试连接」验证。
                  </span>
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] text-white/55">规则 JSON</span>
                    <textarea
                      className="input font-mono text-[11.5px]"
                      rows={11}
                      spellCheck={false}
                      placeholder='粘贴 Kazumi 规则，例如 { "name": "...", "baseURL": "https://...", "searchApiConfig": {...} }'
                      value={draft.ruleText}
                      onChange={(e) => setDraft((d) => ({ ...d, ruleText: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-[12.5px] text-white/55">
                      接口地址（留空则使用规则里的 baseURL）
                    </span>
                    <input
                      className="input font-mono text-[12.5px]"
                      placeholder="https://example.com/"
                      value={draft.api}
                      onChange={(e) => setDraft((d) => ({ ...d, api: e.target.value }))}
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className="mb-1.5 block text-[12.5px] text-white/55">Referer（可选）</span>
                <input
                  className="input font-mono text-[12.5px]"
                  placeholder="部分站点需要，例如 https://example.com/"
                  value={draft.referer}
                  onChange={(e) => setDraft((d) => ({ ...d, referer: e.target.value }))}
                />
              </label>

              {test && (
                <div
                  className={`rounded-lg border px-3 py-2.5 text-[12px] ${
                    test.ok
                      ? 'border-emerald-400/25 bg-emerald-400/[0.07] text-emerald-100/85'
                      : 'border-rose-400/25 bg-rose-400/[0.07] text-rose-100/85'
                  }`}
                >
                  {test.ok ? (
                    <>
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 size={14} /> 连接成功 · {test.latency}ms
                      </div>
                      <div className="mt-1 text-white/50">
                        共 {test.total} 条内容，{test.categories} 个分类
                        {test.animeCategories.length ? `，动漫分类：${test.animeCategories.join('、')}` : ''}
                      </div>
                      {test.sample.length > 0 && (
                        <div className="mt-1 clamp-2 text-white/40">示例：{test.sample.join('、')}</div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-start gap-2">
                      <CircleSlash size={14} className="mt-0.5 shrink-0" /> {test.note || '连接失败'}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-4">
              <button className="btn" onClick={runTest} disabled={busy !== null}>
                {busy === 'test' ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                测试连接
              </button>
              <button className="btn btn-primary" onClick={save} disabled={busy !== null}>
                {busy === 'save' ? <Loader2 size={15} className="animate-spin" /> : null}
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 space-y-4">
        <BackupPanel />
        <SeedPanel />
        <DanDanPanel />
        <BangumiCachePanel />
      </div>
    </div>
  );
}
