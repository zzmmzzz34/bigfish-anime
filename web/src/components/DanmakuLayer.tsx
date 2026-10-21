import { useEffect, useRef } from 'react';
import type { Danmaku } from '../lib/types';

interface ActiveItem {
  id: string;
  text: string;
  color: string;
  mode: 'scroll' | 'top' | 'bottom';
  lane: number;
  x: number;
  y: number;
  width: number;
  speed: number;
  age: number;
  duration: number;
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  items: Danmaku[];
  enabled: boolean;
  opacity: number;
  fontSize?: number;
}

export default function DanmakuLayer({ videoRef, items, enabled, opacity, fontSize = 22 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<ActiveItem[]>([]);
  const spawnedRef = useRef<Set<string>>(new Set());
  const lastTimeRef = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const opacityRef = useRef(opacity);
  opacityRef.current = opacity;

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let raf = 0;
    let lastFrame = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      activeRef.current = [];
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const laneHeight = fontSize + 10;
    const laneCount = () => Math.max(4, Math.floor((height * 0.7) / laneHeight));

    const pickLane = (mode: ActiveItem['mode']) => {
      const total = laneCount();
      const list = activeRef.current;
      const order = Array.from({ length: total }, (_, i) => (mode === 'bottom' ? total - 1 - i : i));
      for (const lane of order) {
        const conflict = list.some((it) => {
          if (it.lane !== lane) return false;
          if (it.mode === 'scroll') return it.x + it.width > width - 24;
          return it.age < it.duration;
        });
        if (!conflict) return lane;
      }
      return mode === 'bottom' ? total - 1 : 0;
    };

    const spawn = (time: number) => {
      const list = itemsRef.current;
      const from = time - 0.45;
      for (const dm of list) {
        if (dm.time > time + 0.12) break;
        if (dm.time < from) continue;
        if (spawnedRef.current.has(dm.id)) continue;
        spawnedRef.current.add(dm.id);
        if (!enabledRef.current) continue;

        ctx.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        const textWidth = Math.min(ctx.measureText(dm.text).width, width * 0.9);
        const lane = pickLane(dm.mode);
        const y =
          dm.mode === 'bottom'
            ? height - 18 - fontSize - lane * laneHeight
            : 14 + lane * laneHeight;
        const speed = Math.max(120, width / 7.2) * (0.92 + Math.random() * 0.16);
        activeRef.current.push({
          id: dm.id,
          text: dm.text,
          color: dm.color,
          mode: dm.mode,
          lane,
          x: dm.mode === 'scroll' ? width + 4 : (width - textWidth) / 2,
          y,
          width: textWidth,
          speed,
          age: 0,
          duration: dm.mode === 'scroll' ? (width + textWidth + 40) / speed : 4.2,
        });
      }
    };

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;

      if (!enabledRef.current) {
        ctx.clearRect(0, 0, width, height);
        activeRef.current = [];
        lastTimeRef.current = video.currentTime;
        return;
      }

      const t = video.currentTime;
      const last = lastTimeRef.current;

      if (t < last - 1.2 || t > last + 2.2) {
        activeRef.current = [];
        lastTimeRef.current = t;
        spawnedRef.current = new Set(
          itemsRef.current.filter((d) => d.time < t - 0.6).map((d) => d.id),
        );
      } else {
        if (t > last) spawn(t);
        lastTimeRef.current = t;
      }

      ctx.clearRect(0, 0, width, height);
      ctx.textBaseline = 'top';
      ctx.font = `700 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';

      const playing = !video.paused && !video.ended;
      const alive: ActiveItem[] = [];
      for (const item of activeRef.current) {
        if (playing) {
          item.age += dt;
          if (item.mode === 'scroll') item.x = width + 4 - item.speed * item.age;
        }
        if (item.age > item.duration) continue;
        if (item.x + item.width < -30) continue;

        const fade =
          item.mode === 'scroll' ? 1 : Math.min(1, Math.max(0, (item.duration - item.age) / 0.45));
        ctx.globalAlpha = opacityRef.current * fade;
        ctx.strokeText(item.text, item.x, item.y, width * 0.95);
        ctx.fillStyle = item.color || '#ffffff';
        ctx.fillText(item.text, item.x, item.y, width * 0.95);
        alive.push(item);
      }
      activeRef.current = alive;
      ctx.globalAlpha = 1;
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctx.clearRect(0, 0, width, height);
    };
  }, [videoRef, fontSize]);

  return <canvas ref={canvasRef} className="danmaku-canvas" />;
}
