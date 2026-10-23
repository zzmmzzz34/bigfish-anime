import path from 'node:path';
import fs from 'node:fs';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const DIST_DIR = path.join(ROOT, 'dist');

for (const dir of [DATA_DIR, CACHE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const PORT = Number(process.env.PORT || 8787);
export const HOST = process.env.HOST || '127.0.0.1';
export const ALLOW_PRIVATE = process.env.ALLOW_PRIVATE === '1';
/** Bangumi 反代地址（如 Cloudflare Worker 自定义域名）；留空则自动跳过 Bangumi */
export const BANGUMI_BASE = (process.env.BANGUMI_BASE || '').replace(/\/+$/, '');
/** DanDanPlay 开放弹幕网络（可选）；AppSecret 只放服务端 */
export const DANDAN_BASE = (process.env.DANDAN_BASE || 'https://api.dandanplay.net').replace(
  /\/+$/,
  '',
);
export const DANDAN_APP_ID = process.env.DANDAN_APP_ID || '';
export const DANDAN_APP_SECRET = process.env.DANDAN_APP_SECRET || '';
/** DevCenter 基础层额度；0 表示不限制 */
export const DANDAN_DAILY_LIMIT = Number(process.env.DANDAN_DAILY_LIMIT || 610);
export const DANDAN_MONTHLY_LIMIT = Number(process.env.DANDAN_MONTHLY_LIMIT || 14_640);
/** 公网登录用的用户名/密码；留空则不启用 */
export const AUTH_USER = process.env.AUTH_USER || '';
export const AUTH_PASS = process.env.AUTH_PASS || '';
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
