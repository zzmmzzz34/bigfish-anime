import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Info,
  MessageCircle,
  Send,
  Settings2,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import Stage from '../components/Stage';
import Comments from '../components/Comments';
import { useToast } from '../components/Toast';
import { apiGet, apiPost, detailHref, prettyLine, proxyUrl } from '../lib/api';
import { useApi, useLocalState, useTitle } from '../lib/hooks';
import type { Danmaku, HistoryItem, WorkDetail } from '../lib/types';

const COLORS = ['#ffffff', '#ff6b81', '#ffd166', '#7bed9f', '#70a1ff', '#c084fc'];
const MEDIA_RE = /\.(m3u8|mp4)(\?|#|$)/i;

export default function Player() {
  const { sourceId = '', vodId = '', line = '0', ep = '0' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const lineIndex = Math.max(0, Number(line) || 0);
  const epIndex = Math.max(0, Number(ep) || 0);
  const [searchParams] = useSearchParams();
  const catalogSeason = searchParams.get('catalog') || '';
  const catalogQuery = catalogSeason ? `?catalog=${encodeURIComponent(catalogSeason)}` : '';

  const { data, loading, error } = useApi<WorkDetail>(
    `/api/detail?sourceId=${encodeURIComponent(sourceId)}&vodId=${encodeURIComponent(vodId)}`,
  );
  useTitle(data ? `${data.title} · 第${epIndex + 1}集` : '播放');

  const episodes = data?.lines?.[lineIndex]?.episodes || [];
  const current = episodes[epIndex];
  const danmakuKey = `${sourceId}:${vodId}:${epIndex}`;
  const historyKey = `${sourceId}:${vodId}`;

  const [danmaku, setDanmaku] = useState<Danmaku[]>([]);
  const [biliDanmaku, setBiliDanmaku] = useState<Danmaku[]>([]);
  const [dmText, setDmText] = useState('');
  const [dmColor, setDmColor] = useState('#ffffff');
  const [dmMode, setDmMode] = useState<'scroll' | 'top' | 'bottom'>('scroll');
  const [dmEnabled, setDmEnabled] = useLocalState('bf-danmaku', true);
  const [dmOpacity, setDmOpacity] = useLocalState('bf-danmaku-opacity', 0.9);
  const [dmFontSize, setDmFontSize] = useLocalState('bf-danmaku-size', 22);
  const [dmSettings, setDmSettings] = useState(false);
  const [mediaSrc, setMediaSrc] = useState('');
  const [mediaState, setMediaState] = useState<'idle' | 'sniffing' | 'ready' | 'failed'>('idle');
  const [resume, setResume] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const timeRef = useRef({ time: 0, duration: 0 });

  useEffect(() => {
    setResume(0);
    apiGet<HistoryItem[]>('/api/history')
      .then((list) => {
        const h = list.find((x) => x.key === historyKey);
        if (
          h &&
          h.episodeIndex === epIndex &&
          h.lineIndex === lineIndex &&
          h.position > 8 &&
          h.duration - h.position > 15
        ) {
          setResume(h.position);
        }
      })
      .catch(() => {});
  }, [historyKey, epIndex, lineIndex]);

  useEffect(() => {
    let alive = true;
    setDanmaku([]);
    apiGet<Danmaku[]>(`/api/danmaku?key=${encodeURIComponent(danmakuKey)}`)
      .then((list) => alive && setDanmaku(list))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [danmakuKey]);

  useEffect(() => {
    if (!catalogSeason) {
      setBiliDanmaku([]);
      return;
    }
    setBiliDanmaku([]);
    let alive = true;
    apiGet<{ items: Danmaku[] }>(
      `/api/danmaku/bilibili?season=${encodeURIComponent(catalogSeason)}&ep=${epIndex}`,
    )
      .then((res) => {
        if (alive) setBiliDanmaku(res.items || []);
      })
      .catch(() => {
        if (alive) setBiliDanmaku([]);
      });
    return () => {
      alive = false;
    };
  }, [catalogSeason, epIndex]);

  useEffect(() => {
    if (!current?.url) {
      setMediaSrc('');
      return;
    }
    let alive = true;
    setMediaState('sniffing');
    setMediaSrc('');
    if (MEDIA_RE.test(current.url)) {
      setMediaSrc(proxyUrl(current.url));
      setMediaState('ready');
      return;
    }
    apiGet<{ url: string }>(`/api/resolve?url=${encodeURIComponent(current.url)}`)
      .then((res) => {
        if (!alive) return;
        if (res.url) {
          setMediaSrc(proxyUrl(res.url));
          setMediaState('ready');
        } else {
          setMediaState('failed');
        }
      })
      .catch(() => alive && setMediaState('failed'));
    return () => {
      alive = false;
    };
  }, [current?.url]);

  const saveHistory = useCallback(
    (position: number, duration: number) => {
      if (!data || !current) return;
      apiPost('/api/history', {
        key: historyKey,
        sourceId: data.sourceId,
        sourceName: data.sourceName,
        vodId: data.vodId,
        title: data.title,
        cover: data.cover,
        lineIndex,
        episodeIndex: epIndex,
        episodeName: current.name,
        position: position > 3 ? position : 0,
        duration,
      }).catch(() => {});
    },
    [data, current, historyKey, lineIndex, epIndex],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const { time, duration } = timeRef.current;
      if (time > 3 && duration > 0) saveHistory(time, duration);
    }, 10_000);
    return () => {
      clearInterval(timer);
      const { time, duration } = timeRef.current;
      if (time > 3 && duration > 0) saveHistory(time, duration);
    };
  }, [saveHistory]);

  useEffect(() => {
    if (!data) return;
    const lines = data.lines || [];
    if (!lines.length) return;
    if (lineIndex >= lines.length) {
      navigate(
        `/play/${encodeURIComponent(sourceId)}/${encodeURIComponent(vodId)}/0/0${catalogQuery}`,
        { replace: true },
      );
      return;
    }
    const eps = lines[lineIndex].episodes || [];
    if (eps.length && epIndex >= eps.length) {
      navigate(
        `/play/${encodeURIComponent(sourceId)}/${encodeURIComponent(vodId)}/${lineIndex}/0${catalogQuery}`,
        { replace: true },
      );
    }
  }, [data, lineIndex, epIndex, sourceId, vodId, navigate]);

  const nextIndex = epIndex + 1;
  const hasNext = nextIndex < episodes.length;

  const goNext = () => {
    if (!hasNext) return;
    toast(`即将播放：${episodes[nextIndex].name}`, 'info');
    setAutoplay(true);
    navigate(
      `/play/${encodeURIComponent(sourceId)}/${encodeURIComponent(vodId)}/${lineIndex}/${nextIndex}${catalogQuery}`,
    );
  };

  const reportLine = useCallback(
    (ok: boolean, error?: string) => {
      if (!data || !current) return;
      apiPost('/api/lines/report', {
        sourceId: data.sourceId,
        url: current.url,
        lineName: data.lines[lineIndex]?.name,
        ok,
        error,
      }).catch(() => {});
    },
    [data, current, lineIndex],
  );

  const sendDanmaku = async () => {
    const text = dmText.trim();
    if (!text) {
      toast('先写点内容吧', 'info');
      return;
    }
    try {
      const item = await apiPost<Danmaku>('/api/danmaku', {
        key: danmakuKey,
        text,
        color: dmColor,
        mode: dmMode,
        time: timeRef.current.time,
      });
      setDanmaku((prev) => [...prev, item].sort((a, b) => a.time - b.time));
      setDmText('');
      toast('弹幕已发送', 'success');
    } catch (err: any) {
      toast(err.message || '发送失败', 'error');
    }
  };

  const sniff = async () => {
    if (!current?.url) return null;
    try {
      const res = await apiGet<{ url: string }>(`/api/resolve?url=${encodeURIComponent(current.url)}`);
      if (res.url) {
        setMediaSrc(proxyUrl(res.url));
        setMediaState('ready');
        return proxyUrl(res.url);
      }
    } catch {
      /* ignore */
    }
    setMediaState('failed');
    return null;
  };

  const sortedDanmaku = useMemo(
    () => [...danmaku, ...biliDanmaku].sort((a, b) => a.time - b.time),
    [danmaku, biliDanmaku],
  );

  if (loading && !data) {
    return (
      <div className="container-page py-6">
        <div className="skeleton mb-4 h-7 w-1/3 rounded" />
        <div className="skeleton aspect-video w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container-page">
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">{error || '没有找到这部作品'}</div>
          <Link to="/" className="btn">
            回到首页
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="container-page">
        <div className="empty">
          <div className="empty-icon">
            <TriangleAlert size={22} />
          </div>
          <div className="text-[15px] font-semibold text-white/80">这一集没有可用的播放地址</div>
          <div className="flex gap-2">
            <Link to={detailHref(data)} className="btn">
              返回详情
            </Link>
            <Link to="/" className="btn">
              回到首页
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="btn-icon border border-white/10"
          aria-label="返回"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[16px] font-bold">
            <Link to={detailHref(data)} className="clamp-1 hover:text-[#ff97a8]">
              {data.title}
            </Link>
            <ChevronRight size={15} className="shrink-0 text-white/25" />
            <span className="shrink-0 text-[13.5px] font-medium text-white/60">{current.name}</span>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-white/35">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/60">{data.sourceName}</span>
            <span>线路：{prettyLine(data.lines[lineIndex]?.name || '', lineIndex)}</span>
            <span>·</span>
            <span>第 {epIndex + 1} / {episodes.length} 集</span>
            {biliDanmaku.length > 0 && (
              <>
                <span>·</span>
                <span className="text-[#ff97a8]">B站弹幕 {biliDanmaku.length}</span>
              </>
            )}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Link to={detailHref(data)} className="btn h-9 px-3 text-[12.5px]">
            换源 / 详情
          </Link>
        </div>
      </div>

      {mediaSrc ? (
        <Stage
          src={mediaSrc}
          poster={data.cover}
          title={data.title}
          danmaku={sortedDanmaku}
          danmakuEnabled={dmEnabled}
          danmakuOpacity={dmOpacity}
          danmakuFontSize={dmFontSize}
          initialTime={resume}
          autoPlay={autoplay}
          hasNext={hasNext}
          onNext={goNext}
          onEnded={() => (hasNext ? goNext() : toast('已经是最后一集了', 'info'))}
          onTime={(t, d) => {
            timeRef.current = { time: t, duration: d };
          }}
          onToggleDanmaku={() => setDmEnabled((v) => !v)}
          onSniff={sniff}
          fallbackHref={detailHref(data)}
          onPlaybackOk={() => reportLine(true)}
          onPlaybackFail={(message) => reportLine(false, message)}
        />
      ) : (
        <div className="stage grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-center">
            {mediaState === 'failed' ? (
              <>
                <TriangleAlert size={26} className="text-amber-400" />
                <div className="text-[14px] text-white/75">这个地址不是直链，自动嗅探也没有找到视频</div>
                <div className="flex gap-2">
                  <button className="btn h-9 px-3 text-[12.5px]" onClick={sniff}>
                    再试一次
                  </button>
                  <a
                    className="btn h-9 px-3 text-[12.5px]"
                    href={current.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开源页面
                  </a>
                  <Link to={detailHref(data)} className="btn h-9 px-3 text-[12.5px]">
                    切换线路
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                <div className="text-[13px] text-white/55">正在解析播放地址…</div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="panel mt-3 flex flex-wrap items-center gap-2 p-2.5">
        <div className="flex min-w-[160px] flex-1 items-center gap-2">
          <div
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-black/70"
            style={{ background: dmColor }}
          >
            弹
          </div>
          <input
            className="dm-input"
            placeholder={dmEnabled ? '发条弹幕，一起看…' : '弹幕已关闭'}
            value={dmText}
            maxLength={60}
            onChange={(e) => setDmText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendDanmaku();
            }}
          />
        </div>

        <div className="flex items-center gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setDmColor(c)}
              className={`h-4 w-4 rounded-full border transition-transform ${
                dmColor === c ? 'scale-125 border-white' : 'border-white/25'
              }`}
              style={{ background: c }}
              aria-label={`弹幕颜色 ${c}`}
            />
          ))}
        </div>

        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {[
            { key: 'scroll', label: '滚动' },
            { key: 'top', label: '顶部' },
            { key: 'bottom', label: '底部' },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setDmMode(m.key as any)}
              className={`h-8 px-2.5 text-[11.5px] transition-colors ${
                dmMode === m.key ? 'bg-white/15 text-white' : 'text-white/45 hover:text-white/80'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <button
            className="btn-icon h-8 w-8 border border-white/10"
            onClick={() => setDmSettings((v) => !v)}
            title="弹幕设置"
          >
            <Settings2 size={14} />
          </button>
          {dmSettings && (
            <div className="absolute bottom-11 right-0 z-20 w-64 rounded-xl border border-white/10 bg-[#15171e] p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between text-[12.5px] text-white/70">
                <span>显示弹幕</span>
                <button className={`switch ${dmEnabled ? 'on' : ''}`} onClick={() => setDmEnabled((v) => !v)} />
              </div>
              <label className="mb-1 flex items-center justify-between text-[12px] text-white/55">
                <span>透明度</span>
                <span className="font-mono text-white/35">{Math.round(dmOpacity * 100)}%</span>
              </label>
              <input
                type="range"
                min={0.25}
                max={1}
                step={0.05}
                value={dmOpacity}
                onChange={(e) => setDmOpacity(Number(e.target.value))}
                className="range mb-4 w-full"
                style={{ '--fill': `${((dmOpacity - 0.25) / 0.75) * 100}%` } as React.CSSProperties}
              />
              <label className="mb-1 flex items-center justify-between text-[12px] text-white/55">
                <span>字号</span>
                <span className="font-mono text-white/35">{dmFontSize}px</span>
              </label>
              <input
                type="range"
                min={16}
                max={34}
                step={1}
                value={dmFontSize}
                onChange={(e) => setDmFontSize(Number(e.target.value))}
                className="range w-full"
                style={{ '--fill': `${((dmFontSize - 16) / 18) * 100}%` } as React.CSSProperties}
              />
              <p className="mt-3 text-[11px] leading-relaxed text-white/30">
                弹幕存在本地服务端，后续可接入 WebSocket 做实时同步。
              </p>
            </div>
          )}
        </div>

        <button className="btn btn-primary h-8 px-3 text-[12.5px]" onClick={sendDanmaku}>
          <Send size={13} />
          发送
        </button>

        <span className="hidden items-center gap-1 text-[11px] text-white/30 sm:flex">
          <MessageSquareTextIcon count={danmaku.length + biliDanmaku.length} />
        </span>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_336px]">
        <div className="space-y-5">
          <section className="panel p-5">
            <div className="mb-2 flex items-center gap-2 text-[14px] font-semibold">
              <Info size={15} className="text-white/40" />
              简介
            </div>
            <p className="clamp-3 whitespace-pre-wrap text-[13px] leading-[1.85] text-white/60">
              {data.synopsis || '暂无简介'}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[data.year, data.area, data.typeName, data.director && `导演：${data.director.split('/')[0]}`]
                .filter(Boolean)
                .map((t) => (
                  <span key={String(t)} className="chip h-6 text-[11px]">
                    {t}
                  </span>
                ))}
            </div>
          </section>

          <Comments commentKey={danmakuKey} />
        </div>

        <aside>
          <div className="panel sticky top-[82px] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[14px] font-semibold">
                <Sparkles size={15} className="text-[#ff8a9d]" />
                选集
              </div>
              <span className="text-[11.5px] text-white/35">{episodes.length} 集</span>
            </div>

            {data.lines.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {data.lines.map((l, i) => (
                  <button
                    key={l.name + i}
                    className={`line-pill h-7 px-2.5 text-[11.5px] ${i === lineIndex ? 'active' : ''}`}
                    onClick={() =>
                      navigate(
                        `/play/${encodeURIComponent(sourceId)}/${encodeURIComponent(vodId)}/${i}/0${catalogQuery}`,
                      )
                    }
                  >
                    {prettyLine(l.name, i)}
                  </button>
                ))}
              </div>
            )}

            <div className="grid max-h-[540px] grid-cols-3 gap-1.5 overflow-y-auto pr-1">
              {episodes.map((e) => (
                <Link
                  key={`${e.index}-${e.url}`}
                  to={`/play/${encodeURIComponent(sourceId)}/${encodeURIComponent(vodId)}/${lineIndex}/${e.index}${catalogQuery}`}
                  className={`ep-btn h-9 min-w-0 text-[11.5px] ${e.index === epIndex ? 'active' : ''}`}
                  title={e.name}
                >
                  {e.name}
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MessageSquareTextIcon({ count }: { count: number }) {
  return (
    <>
      <MessageCircle size={12} /> {count} 条弹幕
    </>
  );
}
