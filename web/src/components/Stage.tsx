import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  Loader2,
  Maximize,
  MessageSquareText,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Volume2,
  VolumeX,
  Wand2,
} from 'lucide-react';
import DanmakuLayer from './DanmakuLayer';
import { formatTime, imgUrl } from '../lib/api';
import type { Danmaku } from '../lib/types';

interface Props {
  src: string;
  poster?: string;
  title?: string;
  danmaku: Danmaku[];
  danmakuEnabled: boolean;
  danmakuOpacity: number;
  danmakuFontSize?: number;
  initialTime?: number;
  autoPlay?: boolean;
  hasNext?: boolean;
  onNext?: () => void;
  onTime?: (time: number, duration: number) => void;
  onEnded?: () => void;
  onSniff?: () => Promise<string | null>;
  onToggleDanmaku?: () => void;
  fallbackHref?: string;
  onPlaybackOk?: () => void;
  onPlaybackFail?: (message: string) => void;
}

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function Stage({
  src,
  poster,
  title,
  danmaku,
  danmakuEnabled,
  danmakuOpacity,
  initialTime = 0,
  autoPlay = false,
  hasNext,
  onNext,
  onTime,
  onEnded,
  onSniff,
  danmakuFontSize = 22,
  onToggleDanmaku,
  fallbackHref,
  onPlaybackOk,
  onPlaybackFail,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const appliedInitial = useRef(false);
  const autoPlayTried = useRef(false);
  const hlsRetry = useRef(0);
  const okReported = useRef(false);
  const failReported = useRef(false);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => {
    const saved = Number(localStorage.getItem('bf-volume'));
    return Number.isFinite(saved) && saved >= 0 && saved <= 1 ? saved : 0.85;
  });
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [levels, setLevels] = useState<{ height: number; index: number }[]>([]);
  const [level, setLevel] = useState(-1);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [showRate, setShowRate] = useState(false);
  const [showQuality, setShowQuality] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const hlsRef = useRef<Hls | null>(null);

  const notifyTime = useCallback(
    (t: number, d: number) => {
      onTime?.(t, d);
    },
    [onTime],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    appliedInitial.current = false;
    autoPlayTried.current = false;
    hlsRetry.current = 0;
    okReported.current = false;
    failReported.current = false;
    setError('');
    setLoading(true);
    setPlaying(false);
    setStarted(false);
    setCurrent(0);
    setDuration(0);
    setBuffered(0);
    setLevels([]);
    setLevel(-1);
    hlsRef.current?.destroy();
    hlsRef.current = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 60,
        maxBufferLength: 40,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 3,
      });
      hlsRef.current = hls;
      hls.loadSource(src);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(data.levels.map((l, i) => ({ height: l.height, index: i })));
        setLoading(false);
        if (autoPlay) video.play().catch(() => {});
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setLevel(data.level));
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR && hlsRetry.current < 2) {
          hlsRetry.current += 1;
          setError('网络异常，正在重试…');
          hls.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && hlsRetry.current < 2) {
          hlsRetry.current += 1;
          setError('解码异常，正在恢复…');
          hls.recoverMediaError();
          return;
        }
        setError('视频加载失败，这条线路可能已失效，试试切换线路');
        setLoading(false);
        if (!failReported.current) {
          failReported.current = true;
          onPlaybackFail?.('HLS fatal: ' + (data.details || data.type || ''));
        }
        hls.destroy();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      setLoading(false);
      if (autoPlay) video.play().catch(() => {});
    } else {
      setError('当前浏览器不支持 HLS 播放');
      setLoading(false);
    }

    return () => {
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src, autoPlay, retryKey]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (video && (!video.duration || Number.isNaN(video.duration))) {
        setError('视频加载超时，这条线路可能已失效，试试切换线路');
        setLoading(false);
      }
    }, 15_000);
    return () => clearTimeout(timer);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
    localStorage.setItem('bf-volume', String(volume));
  }, [volume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, [rate]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const video = videoRef.current;
      if (video && !video.paused) setControlsVisible(false);
    }, 2800);
  }, []);

  useEffect(() => {
    showControls();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, [showControls]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
    showControls();
  }, [showControls]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target?.tagName || '')) return;
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-5);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(5);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setMuted(false);
          setVolume((v) => Math.min(1, Math.round((v + 0.1) * 10) / 10));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10));
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          setMuted((m) => !m);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekBy, toggleFullscreen]);

  const applyInitial = (video: HTMLVideoElement) => {
    if (appliedInitial.current) return;
    if (initialTime > 3 && video.duration && initialTime < video.duration - 3) {
      video.currentTime = initialTime;
      appliedInitial.current = true;
    }
  };

  const onLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration || 0);
    applyInitial(video);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (video && duration > 0) applyInitial(video);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTime, duration]);

  const onTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrent(video.currentTime);
    notifyTime(video.currentTime, video.duration || 0);
    if (video.buffered.length) {
      setBuffered(video.buffered.end(video.buffered.length - 1));
    }
    if (
      !okReported.current &&
      !video.paused &&
      video.readyState >= 3 &&
      video.currentTime > 5
    ) {
      okReported.current = true;
      onPlaybackOk?.();
    }
  };

  const sniff = async () => {
    if (!onSniff) return;
    setResolving(true);
    try {
      const found = await onSniff();
      if (!found) setError('没有嗅探到可播放的视频地址');
    } finally {
      setResolving(false);
    }
  };

  const pct = duration ? (current / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={stageRef}
      className={`stage group ${fullscreen ? 'show-controls' : ''} ${
        controlsVisible ? 'show-controls' : 'hide-cursor'
      }`}
      onMouseMove={showControls}
      onMouseLeave={() => playing && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        playsInline
        preload="metadata"
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onCanPlay={() => {
          setLoading(false);
          const video = videoRef.current;
          if (autoPlay && video && !autoPlayTried.current) {
            autoPlayTried.current = true;
            video.play().catch(() => {});
          }
        }}
        onEnded={() => {
          setPlaying(false);
          onEnded?.();
        }}
        onError={() => {
          if (!hlsRef.current) setError('视频无法播放，请尝试切换线路');
          setLoading(false);
          if (!failReported.current) {
            failReported.current = true;
            onPlaybackFail?.('video element error');
          }
        }}
      />

      {poster && !started && (
        <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden">
          <img
            src={imgUrl(poster)}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-2xl"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/55" />
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <img
              src={imgUrl(poster)}
              alt={title}
              className="max-h-full w-auto max-w-[42%] rounded-xl border border-white/10 object-contain shadow-[0_30px_80px_-20px_rgba(0,0,0,.95)]"
            />
          </div>
        </div>
      )}

      <DanmakuLayer
        videoRef={videoRef}
        items={danmaku}
        enabled={danmakuEnabled}
        opacity={danmakuOpacity}
        fontSize={danmakuFontSize}
      />

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-[2] grid place-items-center">
          <Loader2 className="animate-spin text-white/70" size={34} />
        </div>
      )}

      {!playing && !loading && !error && (
        <button
          onClick={toggle}
          className="absolute left-1/2 top-1/2 z-[2] grid h-[70px] w-[70px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/90 text-black shadow-2xl transition-transform hover:scale-105"
          aria-label="播放"
        >
          <Play size={28} fill="currentColor" strokeWidth={0} style={{ marginLeft: 3 }} />
        </button>
      )}

      {error && (
        <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-3 bg-black/75 px-6 text-center">
          <div className="text-[14px] font-semibold text-white/85">{error}</div>
          <div className="flex flex-wrap justify-center gap-2">
            <button className="btn h-9 px-3 text-[12.5px]" onClick={() => setRetryKey((k) => k + 1)}>
              <RotateCcw size={14} /> 重试
            </button>
            {onSniff && (
              <button className="btn h-9 px-3 text-[12.5px]" onClick={sniff} disabled={resolving}>
                {resolving ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                嗅探视频
              </button>
            )}
            <a
              className="btn h-9 px-3 text-[12.5px]"
              href={src}
              target="_blank"
              rel="noreferrer"
            >
              新窗口打开
            </a>
            {fallbackHref && (
              <a className="btn h-9 px-3 text-[12.5px]" href={fallbackHref}>
                换线路
              </a>
            )}
          </div>
        </div>
      )}

      <div className="player-controls" onClick={(e) => e.stopPropagation()}>
        <div className="relative mb-2">
          <div
            className="pointer-events-none absolute left-0 top-1/2 h-[4px] -translate-y-1/2 rounded bg-white/20"
            style={{ width: `${bufferedPct}%` }}
          />
          <input
            type="range"
            className="range relative w-full"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            style={{ '--fill': `${pct}%` } as React.CSSProperties}
            onChange={(e) => {
              const video = videoRef.current;
              if (!video) return;
              video.currentTime = Number(e.target.value);
              setCurrent(Number(e.target.value));
            }}
            aria-label="播放进度"
          />
        </div>

        <div className="flex items-center gap-1 text-white">
          <button className="player-btn" onClick={toggle} aria-label={playing ? '暂停' : '播放'}>
            {playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
          </button>

          <button className="player-btn" onClick={() => seekBy(-10)} title="后退 10 秒">
            <RotateCcw size={17} />
          </button>

          <div className="group/vol flex items-center">
            <button
              className="player-btn"
              onClick={() => setMuted((m) => !m)}
              aria-label={muted ? '取消静音' : '静音'}
            >
              {muted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <input
              type="range"
              className="range w-0 opacity-0 transition-all duration-200 group-hover/vol:w-[74px] group-hover/vol:opacity-100"
              min={0}
              max={1}
              step={0.01}
              value={muted ? 0 : volume}
              style={{ '--fill': `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                setMuted(v === 0);
              }}
              aria-label="音量"
            />
          </div>

          <div className="ml-1 font-mono text-[12px] tabular-nums text-white/80">
            {formatTime(current)}
            <span className="mx-1 text-white/30">/</span>
            {formatTime(duration)}
          </div>

          <div className="ml-auto flex items-center gap-0.5">
            <button
              className={`player-btn ${danmakuEnabled ? 'active' : ''}`}
              onClick={onToggleDanmaku}
              title="弹幕开关"
            >
              <MessageSquareText size={18} />
            </button>

            <div className="relative">
              <button
                className="player-btn w-auto px-1.5 text-[12px] font-semibold"
                onClick={() => {
                  setShowRate((v) => !v);
                  setShowQuality(false);
                }}
                title="倍速"
              >
                {rate.toFixed(rate === 1 ? 0 : 2).replace(/0$/, '')}x
              </button>
              {showRate && (
                <div className="absolute bottom-10 right-0 z-10 w-24 overflow-hidden rounded-lg border border-white/10 bg-[#15171e] py-1 shadow-2xl">
                  {RATES.map((r) => (
                    <button
                      key={r}
                      className={`block w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-white/10 ${
                        r === rate ? 'text-[var(--accent)]' : 'text-white/75'
                      }`}
                      onClick={() => {
                        setRate(r);
                        setShowRate(false);
                      }}
                    >
                      {r}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {levels.length > 1 && (
              <div className="relative">
                <button
                  className="player-btn"
                  onClick={() => {
                    setShowQuality((v) => !v);
                    setShowRate(false);
                  }}
                  title="画质"
                >
                  <Settings2 size={17} />
                </button>
                {showQuality && (
                  <div className="absolute bottom-10 right-0 z-10 w-28 overflow-hidden rounded-lg border border-white/10 bg-[#15171e] py-1 shadow-2xl">
                    <button
                      className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-white/10 ${
                        level === -1 ? 'text-[var(--accent)]' : 'text-white/75'
                      }`}
                      onClick={() => {
                        if (hlsRef.current) hlsRef.current.currentLevel = -1;
                        setLevel(-1);
                        setShowQuality(false);
                      }}
                    >
                      自动
                    </button>
                    {levels.map((l) => (
                      <button
                        key={l.index}
                        className={`block w-full px-3 py-1.5 text-left text-[12px] hover:bg-white/10 ${
                          level === l.index ? 'text-[var(--accent)]' : 'text-white/75'
                        }`}
                        onClick={() => {
                          if (hlsRef.current) hlsRef.current.currentLevel = l.index;
                          setLevel(l.index);
                          setShowQuality(false);
                        }}
                      >
                        {l.height ? `${l.height}P` : `线路 ${l.index + 1}`}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {hasNext && (
              <button className="player-btn" onClick={onNext} title="下一集">
                <SkipForward size={18} />
              </button>
            )}

            <button
              className="player-btn hidden sm:inline-flex"
              onClick={() => videoRef.current?.requestPictureInPicture?.().catch(() => {})}
              title="画中画"
            >
              <PictureInPicture2 size={17} />
            </button>

            <button className="player-btn" onClick={toggleFullscreen} title="全屏">
              {fullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
