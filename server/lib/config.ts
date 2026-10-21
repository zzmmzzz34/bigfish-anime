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
export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
