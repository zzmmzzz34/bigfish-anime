import { useCallback, useEffect, useRef, useState } from 'react';
import { apiPost } from './api';

export type HealthStatus = 'ok' | 'slow' | 'dead' | 'unknown' | 'checking';

export interface HealthInfo {
  status: HealthStatus;
  latency: number;
  note?: string;
}

export type HealthMap = Record<string, HealthInfo>;

export interface LineStatInfo {
  ok: number;
  fail: number;
  rate: number;
}

export type StatsMap = Record<string, LineStatInfo>;

export interface HealthLine {
  key: string;
  url: string;
  sourceId?: string;
}

interface ApiHealth {
  key: string;
  url: string;
  status: Exclude<HealthStatus, 'checking'>;
  latency: number;
  note?: string;
}

/**
 * 批量探测线路健康度；结果按 key 返回，10 分钟内服务端会复用缓存。
 * recheck() 会带 force=1 跳过缓存。
 */
export function useLineHealth(lines: HealthLine[]) {
  const [health, setHealth] = useState<HealthMap>({});
  const [stats, setStats] = useState<StatsMap>({});
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  const forceRef = useRef(false);
  const reqRef = useRef(0);
  const signature = lines.map((l) => `${l.key}|${l.url}`).join('~');

  useEffect(() => {
    if (!lines.length) {
      setHealth({});
      setStats({});
      setBusy(false);
      return;
    }
    let alive = true;
    const requestId = ++reqRef.current;
    const force = forceRef.current;
    forceRef.current = false;

    const initial: HealthMap = {};
    for (const l of lines) initial[l.key] = { status: 'checking', latency: 0 };
    setHealth(initial);
    setBusy(true);

    apiPost<{ results: ApiHealth[]; stats?: StatsMap }>('/api/lines/health', {
      lines: lines.map(({ key, url, sourceId }) => ({ key, url, sourceId })),
      force,
    })
      .then((res) => {
        if (!alive || requestId !== reqRef.current) return;
        const map: HealthMap = {};
        for (const r of res.results || []) {
          map[r.key] = { status: r.status, latency: r.latency, note: r.note };
        }
        setHealth(map);
        setStats(res.stats || {});
      })
      .catch(() => {
        if (!alive || requestId !== reqRef.current) return;
        setHealth((prev) => {
          const next: HealthMap = { ...prev };
          for (const k of Object.keys(next)) {
            if (next[k].status === 'checking') {
              next[k] = { status: 'unknown', latency: 0, note: '检测请求失败' };
            }
          }
          return next;
        });
      })
      .finally(() => {
        if (alive && requestId === reqRef.current) setBusy(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, nonce]);

  const recheck = useCallback(() => {
    forceRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  return { health, stats, busy, recheck };
}

const RANK: Record<HealthStatus, number> = {
  ok: 0,
  slow: 1,
  unknown: 2,
  checking: 4,
  dead: 5,
};

/**
 * 自动选线：健康状态优先，叠加真实成功率风险，再比延迟和可直连集数。
 * 全部死亡/仍在检测时返回 -1，保持当前选择。
 */
export function recommendedIndex(
  items: Array<{ key: string; playable?: number }>,
  health: HealthMap,
  stats?: StatsMap,
) {
  let best = -1;
  let bestScore: number[] | null = null;

  items.forEach((item, index) => {
    const h = health[item.key];
    if (!h || h.status === 'checking' || h.status === 'dead') return;

    const st = stats?.[item.key];
    const total = (st?.ok || 0) + (st?.fail || 0);
    const rate = total ? st!.rate : 0;
    const risk = total ? (1 - rate) * 1.8 : 0;
    const unreliable = total >= 3 && rate < 0.35 ? 1 : 0;

    const score = [
      RANK[h.status] + risk + unreliable,
      h.latency || 9999,
      -(item.playable || 0),
    ];

    if (
      !bestScore ||
      score[0] < bestScore[0] ||
      (score[0] === bestScore[0] && score[1] < bestScore[1]) ||
      (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2] < bestScore[2])
    ) {
      bestScore = score;
      best = index;
    }
  });

  return best;
}

export function healthLabel(h?: HealthInfo) {
  if (!h || h.status === 'checking') return '检测中…';
  if (h.status === 'ok') return `可用 · ${h.latency}ms`;
  if (h.status === 'slow') return `较慢 · ${h.latency}ms`;
  if (h.status === 'unknown') return h.note || '需嗅探';
  return h.note ? `不可用 · ${h.note}` : '不可用';
}

export function statsLabel(s?: LineStatInfo) {
  if (!s) return '';
  const total = s.ok + s.fail;
  if (!total) return '';
  return `成功率 ${Math.round(s.rate * 100)}% (${s.ok}/${total})`;
}

const STORAGE_PREFIX = 'bf-line:';

function readSaved(workKey: string) {
  try {
    return localStorage.getItem(STORAGE_PREFIX + workKey);
  } catch {
    return null;
  }
}

function writeSaved(workKey: string, lineKey: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + workKey, lineKey);
  } catch {
    /* ignore */
  }
}

function clearSaved(workKey: string) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + workKey);
  } catch {
    /* ignore */
  }
}

/**
 * 自动选线 + 记住上次线路。
 * - 有本地记录且该线路没判死：优先恢复；
 * - 否则用 recommendedIndex；
 * - 用户手动点线路后，不再被健康结果覆盖，并写入本地记录。
 */
export function useAutoLine(
  workKey: string,
  items: Array<{ key: string }>,
  health: HealthMap,
  recommended: number,
) {
  const [line, setLine] = useState(0);
  const pickedRef = useRef(false);

  useEffect(() => {
    pickedRef.current = false;
    setLine(0);
  }, [workKey]);

  useEffect(() => {
    if (pickedRef.current || !items.length) return;

    const saved = readSaved(workKey);
    if (saved) {
      const idx = items.findIndex((i) => i.key === saved);
      const h = health[saved];
      if (idx >= 0 && h && h.status !== 'checking') {
        if (h.status === 'dead') {
          clearSaved(workKey);
        } else {
          setLine(idx);
          return;
        }
      }
    }

    if (recommended >= 0 && recommended < items.length) setLine(recommended);
  }, [workKey, recommended, health, items]);

  const choose = useCallback(
    (index: number) => {
      pickedRef.current = true;
      setLine(index);
      const item = items[index];
      if (item) writeSaved(workKey, item.key);
    },
    [items, workKey],
  );

  return { line, choose };
}
