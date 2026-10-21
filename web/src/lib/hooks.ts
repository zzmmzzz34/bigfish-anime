import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../lib/api';

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(path));
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    apiGet<T>(path, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setData(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err?.message || '加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1), setData };
}

export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

export function useTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} · 大肥鱼番剧` : '大肥鱼番剧';
  }, [title]);
}
