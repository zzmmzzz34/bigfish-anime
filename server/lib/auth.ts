import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AUTH_PASS, AUTH_USER } from './config.js';

const COOKIE = 'bf_auth';
const MAX_AGE = 30 * 24 * 3600;
const enabled = Boolean(AUTH_USER && AUTH_PASS);

const PUBLIC_PATHS = new Set(['/auth/status', '/auth/login', '/auth/logout', '/health']);
const attempts = new Map<string, { count: number; reset: number }>();

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function sign(exp: number) {
  return crypto
    .createHmac('sha256', AUTH_PASS)
    .update(`${AUTH_USER}:${exp}`)
    .digest('base64url');
}

function issueToken() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${exp}.${sign(exp)}`;
}

function verifyToken(token: string) {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  const sig = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(sig, sign(exp));
}

function cookies(req: Request) {
  const out: Record<string, string> = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

function isAuthed(req: Request) {
  return !enabled || verifyToken(cookies(req)[COOKIE] || '');
}

function secureCookie(req: Request) {
  return req.secure || String(req.headers['x-forwarded-proto'] || '').includes('https');
}

export function authEnabled() {
  return enabled;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!enabled) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  if (isAuthed(req)) return next();
  res.status(401).json({ error: '需要登录' });
}

export function authStatus(req: Request, res: Response) {
  res.json({ enabled, authed: isAuthed(req), user: isAuthed(req) ? AUTH_USER : '' });
}

export function authLogin(req: Request, res: Response) {
  if (!enabled) return res.json({ ok: true, enabled: false });

  const ip = String(req.ip || req.socket.remoteAddress || '');
  const now = Date.now();
  const hit = attempts.get(ip);
  if (hit && hit.reset > now && hit.count >= 10) {
    return res.status(429).json({ error: '尝试次数太多，请稍后再试' });
  }

  const user = String(req.body?.user || '');
  const pass = String(req.body?.pass || '');
  if (!safeEqual(user, AUTH_USER) || !safeEqual(pass, AUTH_PASS)) {
    const next = hit && hit.reset > now ? hit : { count: 0, reset: now + 60_000 };
    next.count += 1;
    attempts.set(ip, next);
    return res.status(401).json({ error: '用户名或密码不正确' });
  }

  attempts.delete(ip);
  res.cookie(COOKIE, issueToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookie(req),
    maxAge: MAX_AGE * 1000,
    path: '/',
  });
  res.json({ ok: true, enabled: true, user: AUTH_USER });
}

export function authLogout(_req: Request, res: Response) {
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}
