import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Info,
  Layers,
  Loader2,
  MessageCircle,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  TriangleAlert,
  X,
} from 'lucide-react';
import Stage from '../components/Stage';
import Comments from '../components/Comments';
import { useToast } from '../components/Toast';
import { apiGet, apiPost, detailHref, prettyLine, proxyUrl } from '../lib/api';
import { useApi, useLocalState, useTitle } from '../lib/hooks';
import { healthLabel, statsLabel, useLineHealth } from '../lib/lineHealth';
import type {
  Danmaku,
  DanmakuMap,
  DanmakuSourceId,
  DanmakuSourceInfo,
  HistoryItem,
  PlaySourceItem,
  WorkDetail,
} from '../lib/types';

const COLORS = ['#ffffff', '#ff6b81', '#ffd166', '#7bed9f', '#70a1ff', '#c084fc'];
const MEDIA_RE = /\.(m3u8|mp4)(\?|#|$)/i;
const DM_SOURCE_LABELS: Record<DanmakuSourceId, string> = {
  local: '本地',
  bilibili: 'B站',
  dandan: 'DanDan',
};
const DM_PRIORITIES = [
  ['merge', '合并'],
  ['bilibili', 'B站优先'],
  ['dandan', 'DanDan 优先'],
  ['local', '仅本地'],
] as const;

function historyTitleKey(title: string) {
  return String(title || '')
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function episodeNumber(name: string) {
  const s = String(name || '');
  const m = s.match(/第?\s*(\d{1,4})\s*[集话話]/) || s.match(/(\d{1,4})/);
  return m ? Number(m[1]) : 0;
}

/** 跨源换集：优先按“第 N 集/数字”对齐，其次退回相同索引 */
function targetEpisodeIndex(
  episodes: Array<{ name: string }>,
  currentName: string,
  fallback: number,
) {
  if (!episodes.length) return 0;
  const n = episodeNumber(currentName);
  if (n) {
    const hit = episodes.findIndex((e) => episodeNumber(e.name) === n);
    if (hit >= 0) return hit;
  }
  return Math.max(0, Math.min(fallback, episodes.length - 1));
}

export default function Player() {
  const { sourceId = '', vodId = '', line = '0', ep = '0' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const lineIndex = Math.max(0, Number(line) || 0);
  const epIndex = Math.max(0, Number(ep) || 0);
  const [searchParams] = useSearchParams();
  const catalogSeason = searchParams.get('catalog') || '';
  const catalogQuery = catalogSeason ? `?catalog=${encodeURIComponent(catalogSeason)}` : '';
  const startAt = Math.max(0, Number(searchParams.get('t') || 0) || 0);
  const autoTried = useRef(searchParams.get('auto') === '1');
  const fallbackBusy = useRef(false);

  const { data, loading, error } = useApi<WorkDetail>(
    `/api/detail?sourceId=${encodeURIComponent(sourceId)}&vodId=${encodeURIComponent(vodId)}`,
  );
  useTitle(data ? `${data.title} · 第${epIndex + 1}集` : '播放');

  const episodes = data?.lines?.[lineIndex]?.episodes || [];
  const current = episodes[epIndex];
  const danmakuKey = `${sourceId}:${vodId}:${epIndex}`;
  const historyKey = `${sourceId}:${vodId}`;
  const workKey = historyKey;

  const [danmaku, setDanmaku] = useState<Danmaku[]>([]);
  const [dmSources, setDmSources] = useState<DanmakuSourceInfo[]>([]);
  const [dmMapOpen, setDmMapOpen] = useState(false);
  const [biliOffset, setBiliOffset] = useState(0);
  const [dandanOffset, setDandanOffset] = useState(0);
  const [biliSeasonInput, setBiliSeasonInput] = useState('');
  const [mapVersion, setMapVersion] = useState(0);
  const [mapSaving, setMapSaving] = useState(false);
  const [dmText, setDmText] = useState('');
  const [dmColor, setDmColor] = useState('#ffffff');
  const [dmMode, setDmMode] = useState<'scroll' | 'top' | 'bottom'>('scroll');
  const [dmEnabled, setDmEnabled] = useLocalState('bf-danmaku', true);
  const [dmSourcePrefs, setDmSourcePrefs] = useLocalState<Record<string, boolean>>(
    'bf-dm-sources',
    { local: true, bilibili: true, dandan: true },
  );
  const [dmPriority, setDmPriority] = useLocalState<'merge' | 'bilibili' | 'dandan' | 'local'>(
    'bf-dm-priority',
    'merge',
  );
  const [dmBlocked, setDmBlocked] = useLocalState<string[]>('bf-dm-blocked', []);
  const [dmBlockInput, setDmBlockInput] = useState('');
  const [dmOpacity, setDmOpacity] = useLocalState('bf-danmaku-opacity', 0.9);
  const [dmFontSize, setDmFontSize] = useLocalState('bf-danmaku-size', 22);
  const [dmSettings, setDmSettings] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [playSources, setPlaySources] = useState<PlaySourceItem[]>([]);
  const [psLoading, setPsLoading] = useState(false);
  const healthLines = useMemo(() => {
    const out: Array<{ key: string; url: string; sourceId?: string }> = [];
    (data?.lines || []).forEach((l, i) => {
      const probe = l.episodes.find((e) => e.playable) || l.episodes[0];
      if (probe?.url) out.push({ key: `cur:${i}`, url: probe.url, sourceId: data?.sourceId });
    });
    for (const item of playSources) {
      for (const line of item.lines) {
        if (line.testUrl) {
          out.push({
            key: `alt:${item.work.key}:${line.index}`,
            url: line.testUrl,
            sourceId: item.work.sourceId,
          });
        }
      }
    }
    return out;
  }, [data, playSources]);
  const { health, stats, busy: healthBusy, recheck } = useLineHealth(healthLines);
  const healthyCount = healthLines.filter((l) =>
    ['ok', 'slow'].includes(health[l.key]?.status || ''),
  ).length;
  const [mediaSrc, setMediaSrc] = useState('');
  const [mediaState, setMediaState] = useState<'idle' | 'sniffing' | 'ready' | 'failed'>('idle');
  const [resume, setResume] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const timeRef = useRef({ time: 0, duration: 0 });

  useEffect(() => {
    if (startAt > 5) {
      setResume(startAt);
      return;
    }
    setResume(0);
    apiGet<HistoryItem[]>('/api/history')
      .then((list) => {
        const exact = list.find((x) => x.key === historyKey);
        // 同一作品换源后 history key 会变；按标题 + 集数回退到最近进度
        const title = historyTitleKey(data?.title || '');
        const sameWork = title
          ? list
              .filter(
                (x) =>
                  x.episodeIndex === epIndex &&
                  historyTitleKey(x.title) === title &&
                  x.position > 8 &&
                  x.duration - x.position > 15,
              )
              .sort((a, b) => b.updatedAt - a.updatedAt)[0]
          : undefined;
        const h =
          exact &&
          exact.episodeIndex === epIndex &&
          exact.position > 8 &&
          exact.duration - exact.position > 15
            ? exact
            : sameWork;
        if (h) setResume(h.position);
      })
      .catch(() => {});
  }, [historyKey, epIndex, lineIndex, startAt, data?.title]);

  useEffect(() => {
    let alive = true;
    apiGet<{ map: DanmakuMap }>(`/api/danmaku/map?key=${encodeURIComponent(workKey)}`)
      .then((res) => {
        if (!alive) return;
        const map = res.map || {};
        setBiliOffset(Number(map.biliOffset) || 0);
        setDandanOffset(Number(map.dandanOffset) || 0);
        setBiliSeasonInput(map.biliSeasonId ? String(map.biliSeasonId) : '');
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [workKey, mapVersion]);

  useEffect(() => {
    let alive = true;
    setDanmaku([]);
    setDmSources([]);
    const params = new URLSearchParams({ key: danmakuKey, ep: String(epIndex) });
    if (data?.title) params.set('title', data.title);
    if (catalogSeason) params.set('catalog', catalogSeason);
    params.set('priority', dmPriority);
    apiGet<{ items: Danmaku[]; sources: DanmakuSourceInfo[] }>(
      `/api/danmaku/resolve?${params.toString()}`,
    )
      .then((res) => {
        if (!alive) return;
        setDanmaku(res.items || []);
        setDmSources(res.sources || []);
      })
      .catch(() => {
        if (!alive) return;
        setDanmaku([]);
        setDmSources([]);
      });
    return () => {
      alive = false;
    };
  }, [danmakuKey, epIndex, catalogSeason, data?.title, mapVersion, dmPriority]);

  useEffect(() => {
    if (!sourceOpen || !data?.title) return;
    let alive = true;
    setPsLoading(true);
    apiGet<{ items: PlaySourceItem[] }>(
      `/api/play-sources?title=${encodeURIComponent(data.title)}&exclude=${encodeURIComponent(data.key)}`,
    )
      .then((res) => {
        if (alive) setPlaySources(res.items || []);
      })
      .catch(() => {
        if (alive) setPlaySources([]);
      })
      .finally(() => {
        if (alive) setPsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [sourceOpen, data?.title, data?.key]);

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

  const buildPlayHref = useCallback(
    (sid: string, vid: string, li: number, ei: number, auto = false) => {
      const params = new URLSearchParams();
      if (catalogSeason) params.set('catalog', catalogSeason);
      const t = Math.floor(timeRef.current.time);
      if (t > 5) params.set('t', String(t));
      if (auto) params.set('auto', '1');
      const q = params.toString();
      return `/play/${encodeURIComponent(sid)}/${encodeURIComponent(vid)}/${li}/${ei}${q ? `?${q}` : ''}`;
    },
    [catalogSeason],
  );

  const switchLine = (li: number) => {
    if (!data) return;
    const eps = data.lines[li]?.episodes || [];
    if (!eps.length) return;
    const idx = targetEpisodeIndex(eps, current?.name || '', epIndex);
    setSourceOpen(false);
    navigate(buildPlayHref(data.sourceId, data.vodId, li, idx));
    toast(`已切换线路：${prettyLine(data.lines[li]?.name || '', li)}`, 'success');
  };

  const switchOther = (item: PlaySourceItem, line: PlaySourceItem['lines'][number]) => {
    if (!line.episodes.length) return;
    const idx = targetEpisodeIndex(line.episodes, current?.name || '', epIndex);
    setSourceOpen(false);
    navigate(buildPlayHref(item.work.sourceId, item.work.vodId, line.index, idx));
    toast(`已换到 ${item.work.sourceName}`, 'success');
  };

  const handlePlaybackFail = useCallback(
    async (message: string) => {
      reportLine(false, message);
      if (autoTried.current || fallbackBusy.current || !data || !current) return;
      fallbackBusy.current = true;

      // 先尝试当前片源的其他线路
      for (let i = 0; i < data.lines.length; i++) {
        if (i === lineIndex) continue;
        if (health[`cur:${i}`]?.status === 'dead') continue;
        const eps = data.lines[i].episodes || [];
        const idx = targetEpisodeIndex(eps, current.name, epIndex);
        if (eps[idx]?.playable) {
          autoTried.current = true;
          toast(`当前线路失败，自动切到 ${prettyLine(data.lines[i].name, i)}`, 'info');
          navigate(buildPlayHref(data.sourceId, data.vodId, i, idx, true), { replace: true });
          return;
        }
      }

      // 再尝试其他片源的同集
      try {
        const res = await apiGet<{ items: PlaySourceItem[] }>(
          `/api/play-sources?title=${encodeURIComponent(data.title)}&exclude=${encodeURIComponent(data.key)}`,
        );
        for (const item of res.items) {
          if (item.work.sourceId === data.sourceId && item.work.vodId === data.vodId) continue;
          for (const line of item.lines) {
            if (!line.episodes.length) continue;
            if (health[`alt:${item.work.key}:${line.index}`]?.status === 'dead') continue;
            const idx = targetEpisodeIndex(line.episodes, current.name, epIndex);
            const hasPlayable = line.episodes.some((e) => e.playable);
            if (!hasPlayable || line.episodes[idx]?.playable) {
              autoTried.current = true;
              toast(`当前片源失败，自动切到 ${item.work.sourceName}`, 'info');
              navigate(
                buildPlayHref(item.work.sourceId, item.work.vodId, line.index, idx, true),
                { replace: true },
              );
              return;
            }
          }
        }
      } catch {
        /* ignore */
      }

      autoTried.current = true;
      toast('当前线路播放失败，可以手动换源', 'error');
    },
    [data, current, lineIndex, epIndex, health, buildPlayHref, navigate, toast, reportLine],
  );

  const sendDanmaku = async () => {
    const text = dmText.trim();
    if (!text) {
      toast('先写点内容吧', 'info');
      return;
    }
    try {
      if (dmSourcePrefs.local === false) {
        setDmSourcePrefs((prev) => ({ ...prev, local: true }));
      }
      const item = await apiPost<Danmaku>('/api/danmaku', {
        key: danmakuKey,
        text,
        color: dmColor,
        mode: dmMode,
        time: timeRef.current.time,
      });
      setDanmaku((prev) => [...prev, item].sort((a, b) => a.time - b.time));
      setDmSources((prev) => {
        const local = prev.find((s) => s.id === 'local');
        if (local) {
          return prev.map((s) => (s.id === 'local' ? { ...s, count: s.count + 1 } : s));
        }
        return [...prev, { id: 'local', label: '本地', count: 1, ok: true }];
      });
      setDmText('');
      toast('弹幕已发送', 'success');
    } catch (err: any) {
      toast(err.message || '发送失败', 'error');
    }
  };

  const saveDmMap = async (reset = false) => {
    setMapSaving(true);
    try {
      const nextBili = reset ? 0 : biliOffset;
      const nextDandan = reset ? 0 : dandanOffset;
      const nextSeason = reset ? 0 : Number(biliSeasonInput) || 0;
      await apiPost('/api/danmaku/map', {
        key: workKey,
        biliOffset: nextBili,
        dandanOffset: nextDandan,
        biliSeasonId: nextSeason,
      });
      if (reset) {
        setBiliOffset(0);
        setDandanOffset(0);
        setBiliSeasonInput('');
      }
      setMapVersion((v) => v + 1);
      toast(reset ? '已恢复自动匹配' : '弹幕校正已保存', 'success');
    } catch (err: any) {
      toast(err?.message || '保存失败', 'error');
    } finally {
      setMapSaving(false);
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

  const sourceOn = useCallback(
    (id: DanmakuSourceId) => dmSourcePrefs[id] !== false,
    [dmSourcePrefs],
  );

  const toggleDmSource = (id: DanmakuSourceId) => {
    setDmSourcePrefs((prev) => ({ ...prev, [id]: prev[id] === false }));
  };

  const safeBlocked = useMemo(() => (Array.isArray(dmBlocked) ? dmBlocked : []), [dmBlocked]);
  const blockedWords = useMemo(
    () => safeBlocked.map((w) => String(w || '').trim().toLowerCase()).filter(Boolean),
    [safeBlocked],
  );
  const blockedCount = useMemo(
    () =>
      blockedWords.length
        ? danmaku.filter((d) => blockedWords.some((w) => d.text.toLowerCase().includes(w))).length
        : 0,
    [danmaku, blockedWords],
  );

  const sortedDanmaku = useMemo(
    () =>
      [...danmaku]
        .filter((d) => dmSourcePrefs[d.source || 'local'] !== false)
        .filter((d) => !blockedWords.some((w) => d.text.toLowerCase().includes(w)))
        .sort((a, b) => a.time - b.time),
    [danmaku, dmSourcePrefs, blockedWords],
  );

  const addBlockedWord = () => {
    const word = dmBlockInput.trim().slice(0, 20);
    if (!word) return;
    setDmBlocked((prev) => {
      if (prev.some((w) => w.toLowerCase() === word.toLowerCase())) return prev;
      return [...prev, word].slice(0, 30);
    });
    setDmBlockInput('');
  };

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
          <div className="player-meta mt-1 flex items-center gap-2 text-[11.5px] text-white/35">
            <span className="rounded bg-white/10 px-1.5 py-0.5 text-white/60">{data.sourceName}</span>
            <span>线路：{prettyLine(data.lines[lineIndex]?.name || '', lineIndex)}</span>
            <span>·</span>
            <span>第 {epIndex + 1} / {episodes.length} 集</span>
            {dmSources
              .filter((s) => s.count > 0)
              .map((s) => (
                <span key={s.id} className="contents">
                  <span>·</span>
                  <button
                    className={`transition-colors ${
                      sourceOn(s.id)
                        ? 'text-[#ff97a8] hover:text-[#ffb6c2]'
                        : 'text-white/20 line-through hover:text-white/40'
                    }`}
                    onClick={() => toggleDmSource(s.id)}
                    title={`${sourceOn(s.id) ? '隐藏' : '显示'}${s.label}弹幕`}
                  >
                    {s.label}弹幕 {s.count}
                  </button>
                </span>
              ))}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setDmMapOpen((v) => !v)}
            className={`btn h-9 px-3 text-[12.5px] ${
              dmMapOpen ? 'border-[#ff4d6d]/35 bg-[#ff4d6d]/10 text-[#ffb3c0]' : ''
            }`}
            title="弹幕集数校正"
          >
            <Settings2 size={13} /> 校正
          </button>
          <button
            className={`btn h-9 px-3 text-[12.5px] ${
              sourceOpen ? 'border-[#ff4d6d]/35 bg-[#ff4d6d]/10 text-[#ffb3c0]' : ''
            }`}
            onClick={() => setSourceOpen((v) => !v)}
            title="切换片源或线路"
          >
            <Layers size={13} /> 换源 / 线路
          </button>
          <Link to={detailHref(data)} className="btn h-9 px-3 text-[12.5px]">
            详情
          </Link>
        </div>
      </div>

      {dmMapOpen && (
        <div className="panel mb-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold">弹幕集数校正</div>
              <div className="mt-0.5 text-[11px] text-white/35">
                按作品保存：片源第 N 集可映射到 B站 / DanDan 的第 N + 偏移集。
              </div>
            </div>
            <button
              className="text-[11.5px] text-white/35 hover:text-white"
              onClick={() => setDmMapOpen(false)}
            >
              关闭
            </button>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-[11px] text-white/45">
              B站偏移
              <input
                type="number"
                value={biliOffset}
                onChange={(e) => setBiliOffset(Math.max(-99, Math.min(99, Number(e.target.value) || 0)))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#ff4d6d]/50"
              />
            </label>
            <label className="block text-[11px] text-white/45">
              DanDan 偏移
              <input
                type="number"
                value={dandanOffset}
                onChange={(e) => setDandanOffset(Math.max(-99, Math.min(99, Number(e.target.value) || 0)))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-[#ff4d6d]/50"
              />
            </label>
            <label className="block text-[11px] text-white/45">
              B站 season（留空自动）
              <input
                type="number"
                value={biliSeasonInput}
                onChange={(e) => setBiliSeasonInput(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="例如 46089"
                className="mt-1 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white outline-none placeholder:text-white/20 focus:border-[#ff4d6d]/50"
              />
            </label>
          </div>

          <div className="mt-2 text-[11px] text-white/35">
            第 {epIndex + 1} 集 → B站第 {Math.max(1, epIndex + 1 + biliOffset)} 集 · DanDan 第{' '}
            {Math.max(1, epIndex + 1 + dandanOffset)} 集
          </div>

          <div className="mt-3 flex gap-2">
            <button
              className="btn btn-primary h-8 px-3 text-[12px]"
              onClick={() => saveDmMap(false)}
              disabled={mapSaving}
            >
              {mapSaving ? '保存中…' : '保存并重载'}
            </button>
            <button
              className="btn h-8 px-3 text-[12px]"
              onClick={() => saveDmMap(true)}
              disabled={mapSaving}
            >
              恢复自动
            </button>
          </div>
        </div>
      )}

      {sourceOpen && (
        <div className="panel mb-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold">
                <Layers size={14} className="text-[#ff8a9d]" />
                切换片源 / 线路
              </div>
              <div className="mt-0.5 text-[11px] text-white/35">
                会尽量按当前集数对齐；切换后从当前播放进度继续。
                {healthLines.length > 0 && (
                  <span className="ml-1 text-white/25">
                    · {healthBusy ? '正在检测线路…' : `${healthyCount}/${healthLines.length} 条可用`}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {healthLines.length > 0 && (
                <button
                  className="btn-icon h-6 w-6"
                  onClick={recheck}
                  disabled={healthBusy}
                  title="重新检测所有线路（跳过缓存）"
                >
                  <RefreshCw size={12} className={healthBusy ? 'animate-spin' : ''} />
                </button>
              )}
              <button
                className="text-[11.5px] text-white/35 hover:text-white"
                onClick={() => setSourceOpen(false)}
              >
                关闭
              </button>
            </div>
          </div>

          <div className="mt-4 text-[11px] text-white/40">本片源 · {data.sourceName}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.lines.map((l, i) => {
              const h = health[`cur:${i}`];
              const st = stats[`cur:${i}`];
              return (
                <button
                  key={`${l.name}-${i}`}
                  className={`line-pill h-7 px-2.5 text-[11.5px] ${i === lineIndex ? 'active' : ''}`}
                  onClick={() => switchLine(i)}
                  title={`${healthLabel(h)}${statsLabel(st) ? ` · ${statsLabel(st)}` : ''}`}
                >
                  <span className={`health-dot ${h?.status || 'checking'}`} />
                  {prettyLine(l.name, i)}
                  <span className="ml-1.5 text-[10px] opacity-50">{l.episodes.length}</span>
                  {h?.status === 'ok' && h.latency > 0 && (
                    <span className="ml-1 text-[9.5px] opacity-35">{h.latency}ms</span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2 text-[11px] text-white/40">
            其他片源
            {psLoading && <Loader2 size={12} className="animate-spin" />}
            {!psLoading && <span className="text-white/25">{playSources.length} 个</span>}
          </div>

          {psLoading ? (
            <div className="mt-3 flex items-center gap-2 text-[12px] text-white/35">
              <Loader2 size={13} className="animate-spin" /> 正在匹配其他片源…
            </div>
          ) : playSources.length ? (
            <div className="mt-2 max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {playSources.map((item) => (
                <div
                  key={item.work.key}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <div className="clamp-1 min-w-0 flex-1 text-[12.5px] text-white/80">
                      {item.work.title}
                    </div>
                    <span className="shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/55">
                      {item.work.sourceName}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.lines.map((line) => {
                      const idx = targetEpisodeIndex(
                        line.episodes,
                        current?.name || '',
                        epIndex,
                      );
                      const ep = line.episodes[idx];
                      const hk = `alt:${item.work.key}:${line.index}`;
                      const h = health[hk];
                      const st = stats[hk];
                      return (
                        <button
                          key={line.index}
                          className="line-pill h-7 px-2.5 text-[11.5px]"
                          onClick={() => switchOther(item, line)}
                          title={`${ep ? `同集：${ep.name}` : '该线路没有剧集'} · ${healthLabel(h)}${
                            statsLabel(st) ? ` · ${statsLabel(st)}` : ''
                          }`}
                        >
                          <span className={`health-dot ${h?.status || 'checking'}`} />
                          {prettyLine(line.name, line.index)}
                          <span className="ml-1.5 text-[10px] opacity-45">
                            {line.episodes.length}
                          </span>
                          {h?.status === 'ok' && h.latency > 0 && (
                            <span className="ml-1 text-[9.5px] opacity-35">{h.latency}ms</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-[12px] text-white/30">
              没有匹配到其他片源，可以回详情页换关键词搜索。
            </div>
          )}
        </div>
      )}

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
          onPlaybackFail={handlePlaybackFail}
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
        <div className="flex w-full flex-none basis-full items-center gap-2 sm:w-auto sm:min-w-[160px] sm:flex-1 sm:basis-0">
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
            <div className="fixed inset-x-3 bottom-20 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-[#15171e] p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-11 sm:right-0 sm:w-64">
              <div className="mb-3 flex items-center justify-between text-[12.5px] text-white/70">
                <span className="font-semibold">弹幕设置</span>
                <button
                  className="text-[11.5px] text-white/40 hover:text-white"
                  onClick={() => setDmSettings(false)}
                >
                  关闭
                </button>
              </div>
              <div className="mb-3 flex items-center justify-between text-[12.5px] text-white/70">
                <span>显示弹幕</span>
                <button className={`switch ${dmEnabled ? 'on' : ''}`} onClick={() => setDmEnabled((v) => !v)} />
              </div>

              <div className="mb-4">
                <div className="mb-2 text-[11px] text-white/35">弹幕来源</div>
                <div className="space-y-1">
                  {(['local', 'bilibili', 'dandan'] as DanmakuSourceId[]).map((id) => {
                    const info = dmSources.find((s) => s.id === id);
                    return (
                      <button
                        key={id}
                        className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-[12px] text-white/60 hover:bg-white/5"
                        onClick={() => toggleDmSource(id)}
                      >
                        <span className="w-[56px] shrink-0 text-left">{DM_SOURCE_LABELS[id]}</span>
                        <span className="min-w-0 flex-1 text-left text-[10.5px] text-white/25">
                          {info?.count ? `${info.count} 条` : '暂无'}
                        </span>
                        <span className={`switch ${sourceOn(id) ? 'on' : ''}`} />
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex gap-3 text-[10.5px]">
                  <button
                    className="text-white/35 hover:text-white"
                    onClick={() => setDmSourcePrefs({ local: true, bilibili: true, dandan: true })}
                  >
                    全部显示
                  </button>
                  <button
                    className="text-white/35 hover:text-white"
                    onClick={() => setDmSourcePrefs({ local: true, bilibili: false, dandan: false })}
                  >
                    仅本地
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="mb-2 text-[11px] text-white/35">源优先级</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {DM_PRIORITIES.map(([value, label]) => (
                    <button
                      key={value}
                      className={`rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${
                        dmPriority === value
                          ? 'border-[#ff4d6d]/35 bg-[#ff4d6d]/10 text-[#ffb3c0]'
                          : 'border-white/10 bg-white/[0.02] text-white/45 hover:text-white'
                      }`}
                      onClick={() => setDmPriority(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] leading-4 text-white/25">
                  B站优先/DanDan 优先会先取主源，主源为空才请求另一个；合并则两个都要。
                </p>
              </div>

              <div className="mb-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-white/35">
                  <span>屏蔽词</span>
                  {blockedCount > 0 && (
                    <span className="text-[#ff97a8]/70">已屏蔽 {blockedCount} 条</span>
                  )}
                </div>
                <div className="flex gap-1.5">
                  <input
                    className="field h-8 min-w-0 flex-1 px-2 text-[12px]"
                    value={dmBlockInput}
                    onChange={(e) => setDmBlockInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addBlockedWord();
                      }
                    }}
                    maxLength={20}
                    placeholder="输入词，回车添加"
                  />
                  <button className="btn h-8 px-2.5 text-[11.5px]" onClick={addBlockedWord}>
                    添加
                  </button>
                </div>
                {blockedWords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {safeBlocked.map((word) => (
                      <button
                        key={word}
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[10.5px] text-white/55 hover:border-[#ff4d6d]/30 hover:text-white"
                        onClick={() => setDmBlocked((prev) => prev.filter((w) => w !== word))}
                        title="点击移除"
                      >
                        {word}
                        <X size={10} />
                      </button>
                    ))}
                    <button
                      className="px-1 py-1 text-[10.5px] text-white/25 hover:text-white/60"
                      onClick={() => setDmBlocked([])}
                    >
                      清空
                    </button>
                  </div>
                )}
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
          <MessageSquareTextIcon count={danmaku.length} />
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
