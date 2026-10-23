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
        const nextLevels = data.levels.map((l, i) => ({ height: l.height, index: i }));
        setLevels(nextLevels);
        const savedHeight = Number(localStorage.getItem('bf-quality-height') || 0);
        if (savedHeight > 0) {
          const idx = nextLevels.findIndex((l) => l.height === savedHeight);
          if (idx >= 0) {
            hls.currentLevel = idx;
            hls.loadLevel = idx;
            setLevel(idx);
          }
        }
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
    const onChange = () => {
      const fs = Boolean(document.fullscreenElement);
      setFullscreen(fs);
      const orientation = window.screen?.orientation as any;
      try {
        if (fs) {
          orientation?.lock?.('landscape')?.catch?.(() => {});
        } else {
          orientation?.unlock?.();
        }
      } catch {
        /* iOS / 桌面浏览器不支持方向锁 */
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      try {
        (window.screen?.orientation as any)?.unlock?.();
      } catch {
        /* ignore */
      }
    };
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

  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
    showControls();
  }, [showControls]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // 手机上可能 paused=false 但 readyState=0、currentTime=0；
    // 这种情况其实没在播，不能把它 pause 掉。
    if (video.paused || !playing || video.readyState < 2 || video.currentTime === 0) {
      playVideo();
    } else {
      video.pause();
    }
    showControls();
  }, [playing, playVideo, showControls]);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.muted || video.volume === 0 || muted) {
      const next = volume > 0 ? volume : 0.85;
      video.muted = false;
      video.volume = next;
      setMuted(false);
      setVolume(next);
    } else {
      video.muted = true;
      setMuted(true);
    }
    showControls();
  }, [muted, volume, showControls]);

  const seekBy = useCallback((delta: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + delta));
    showControls();
  }, [showControls]);

  const toggleFullscreen = useCallback(async () => {
    const el = stageRef.current;
    if (!el) return;
    const video = videoRef.current as any;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (el.requestFullscreen) {
        try {
          await el.requestFullscreen();
          return;
        } catch {
          /* iOS 不支持容器全屏，走原生视频全屏 */
        }
      }
      if (video?.webkitEnterFullscreen) video.webkitEnterFullscreen();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.altKey ||
        e.ctrlKey ||
        e.metaKey ||
        target?.isContentEditable ||
        target?.closest?.('input,textarea,select,button,a,[role="button"],[contenteditable="true"]')
      ) {
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      const repeatable = e.key.startsWith('Arrow');
      if (e.repeat && !repeatable) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          toggle();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          seekBy(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          seekBy(10);
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
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'd':
        case 'D':
          e.preventDefault();
          onToggleDanmaku?.();
          break;
        case 'n':
        case 'N':
          if (hasNext && onNext) {
            e.preventDefault();
            onNext();
          }
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle, seekBy, toggleFullscreen, toggleMute, hasNext, onNext, onToggleDanmaku]);

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
        {...{
          'webkit-playsinline': 'true',
          'x5-playsinline': 'true',
          'x5-video-player-type': 'h5',
          'x5-video-player-fullscreen': 'false',
        }}
        disablePictureInPicture={/iPad|iPhone|iPod/.test(navigator.userAgent)}
        controlsList="nodownload noplaybackrate noremoteplayback"
        preload="metadata"
        onClick={toggle}
        onDoubleClick={toggleFullscreen}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          const video = videoRef.current;
          if (video) setMuted(video.muted || video.volume === 0);
          showControls();
        }}
        onVolumeChange={() => {
          const video = videoRef.current;
          if (!video) return;
          setMuted(video.muted || video.volume === 0);
          if (video.volume > 0) setVolume(video.volume);
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

      {!playing && !loading && !error && (
        <button
          type="button"
          onClick={playVideo}
          className="group/play absolute inset-0 z-[3] flex flex-col items-center justify-center gap-2.5 bg-[radial-gradient(circle_at_center,rgba(0,0,0,.35),transparent_58%)]"
          aria-label="播放"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full border border-white/20 bg-black/35 text-white/90 shadow-[0_8px_28px_rgba(0,0,0,.35)] backdrop-blur-md transition-all duration-200 group-hover/play:scale-105 group-hover/play:border-[#ff8aa0]/55 group-hover/play:text-white group-active/play:scale-95 sm:h-16 sm:w-16">
            <Play size={23} fill="currentColor" strokeWidth={0} className="ml-0.5" />
          </span>
          <span className="rounded-full border border-white/10 bg-black/30 px-2.5 py-1 text-[9.5px] tracking-[0.16em] text-white/55 backdrop-blur-md">
            点击播放
          </span>
        </button>
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
              onClick={toggleMute}
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

          <div className="player-time ml-1 font-mono text-[12px] tabular-nums text-white/80">
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

            <div className="relative hidden sm:block">
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
                        localStorage.removeItem('bf-quality-height');
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
                          if (l.height) localStorage.setItem('bf-quality-height', String(l.height));
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
