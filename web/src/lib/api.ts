export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let message = `请求失败 (${res.status})`;
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: 'DELETE', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`请求失败 (${res.status})`);
  return res.json();
}

export function imgUrl(url: string, ref?: string) {
  if (!url) return '';
  if (url.startsWith('/')) return url;
  const params = new URLSearchParams({ url });
  if (ref) params.set('ref', ref);
  return `/api/image?${params.toString()}`;
}

export function proxyUrl(url: string, ref?: string) {
  const params = new URLSearchParams({ url });
  if (ref) params.set('ref', ref);
  return `/api/proxy?${params.toString()}`;
}

export function playHref(work: { sourceId: string; vodId: string }, line = 0, ep = 0) {
  return `/play/${encodeURIComponent(work.sourceId)}/${encodeURIComponent(work.vodId)}/${line}/${ep}`;
}

export function catalogHref(id: string | number) {
  return `/catalog/${encodeURIComponent(String(id))}`;
}

export function searchHref(title: string) {
  return `/search?q=${encodeURIComponent(title)}`;
}

export function detailHref(w: { sourceId: string; vodId: string }) {
  return `/detail/${encodeURIComponent(w.sourceId)}/${encodeURIComponent(w.vodId)}`;
}

const TECH_LINE = /m3u8|zy$|^360|^lz|^ff|^line|^liangzi|^feifan|^lzm|^ffm/i;

export function prettyLine(name: string, index: number) {
  if (!name || TECH_LINE.test(name) || name.length > 16) return `线路 ${index + 1}`;
  return name;
}

export function humanSize(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 62%)`;
}

export function cx(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(' ');
}
