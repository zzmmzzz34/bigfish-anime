import { Readable } from 'node:stream';
import type { Request, Response } from 'express';
import { ALLOW_PRIVATE, UA } from './config.js';

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|.*\.local$)/i;

export function assertSafeUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw Object.assign(new Error('无效的 URL'), { status: 400 });
  }
  if (!/^https?:$/.test(url.protocol)) throw Object.assign(new Error('仅支持 http/https'), { status: 400 });
  if (!ALLOW_PRIVATE && PRIVATE_HOST.test(url.hostname)) {
    throw Object.assign(new Error('出于安全考虑，不允许访问内网地址'), { status: 403 });
  }
  return url;
}

function proxyLink(absolute: string, ref: string) {
  const params = new URLSearchParams({ url: absolute });
  if (ref) params.set('ref', ref);
  return `/api/proxy?${params.toString()}`;
}

export function rewritePlaylist(text: string, baseUrl: string, ref: string) {
  const absolute = (raw: string) => {
    try {
      return new URL(raw, baseUrl).toString();
    } catch {
      return raw;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${proxyLink(absolute(uri), ref)}"`);
      }
      return proxyLink(absolute(trimmed), ref);
    })
    .join('\n');
}

export async function handleProxy(req: Request, res: Response) {
  const raw = String(req.query.url || '');
  if (!raw) return res.status(400).json({ error: '缺少 url 参数' });
  let target: URL;
  try {
    target = assertSafeUrl(raw);
  } catch (err: any) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const ref = String(req.query.ref || '') || target.origin + '/';
  const controller = new AbortController();
  let finished = false;
  const safeAbort = () => {
    if (!finished) controller.abort();
  };
  res.on('close', () => {
    finished = true;
    safeAbort();
  });
  const timer = setTimeout(() => controller.abort(), 25_000);

  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Referer: ref,
      Accept: '*/*',
    };
    if (req.headers.range) headers.Range = String(req.headers.range);

    const upstream = await fetch(target.toString(), {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });

    const contentType = upstream.headers.get('content-type') || '';
    const isHls =
      /mpegurl/i.test(contentType) ||
      /\.m3u8(\?|#|$)/i.test(target.toString()) ||
      /\.m3u8(\?|#|$)/i.test(upstream.url);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (isHls) {
      const text = await upstream.text();
      const rewritten = rewritePlaylist(text, upstream.url || target.toString(), ref);
      res.status(upstream.ok ? 200 : upstream.status);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.send(rewritten);
    }

    if (!upstream.ok) {
      res.status(upstream.status).end();
      return;
    }

    res.status(upstream.status);
    if (contentType) res.setHeader('Content-Type', contentType);
    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);
    const range = upstream.headers.get('content-range');
    if (range) res.setHeader('Content-Range', range);
    res.setHeader('Accept-Ranges', upstream.headers.get('accept-ranges') || 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    if (!upstream.body) return res.end();
    const stream = Readable.fromWeb(upstream.body as any);
    stream.on('error', () => {
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch (err: any) {
    if (!res.headersSent) res.status(502).json({ error: `代理失败: ${err?.message || err}` });
    else res.end();
  } finally {
    clearTimeout(timer);
  }
}

export async function handleImage(req: Request, res: Response) {
  const raw = String(req.query.url || '');
  if (!raw) return res.status(400).end();
  let target: URL;
  try {
    target = assertSafeUrl(raw);
  } catch {
    return res.status(400).end();
  }
  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': UA,
        Referer: String(req.query.ref || '') || target.origin + '/',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    const type = upstream.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const stream = Readable.fromWeb(upstream.body as any);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
}

/** 从播放页 HTML 里“嗅探” m3u8 / mp4 直链 */
export async function resolveMedia(raw: string) {
  const target = assertSafeUrl(raw);
  if (/\.(m3u8|mp4)(\?|#|$)/i.test(target.toString())) {
    return { url: target.toString(), candidates: [target.toString()] };
  }
  const res = await fetch(target.toString(), {
    headers: { 'User-Agent': UA, Referer: target.origin + '/' },
    signal: AbortSignal.timeout(15_000),
  });
  const html = (await res.text()).replace(/\\\//g, '/');
  const candidates = new Set<string>();
  const re = /(https?:\/\/[^\s"'<>\\]+?\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) candidates.add(m[1]);
  const list = [...candidates].slice(0, 20);
  return { url: list[0] || '', candidates: list };
}
