import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { api } from './routes.js';
import { DIST_DIR, HOST, PORT } from './lib/config.js';
import { authEnabled, authMiddleware } from './lib/auth.js';
import { startSeedScheduler } from './lib/seedSync.js';
import { startBackupScheduler } from './lib/backup.js';
import { saveDbNow } from './lib/store.js';
import { homeDiscover } from './lib/catalog.js';

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '4mb' }));

// 页面壳/manifest/sw 保持公开，API 用登录 Cookie 保护；否则 Android WebAPK 安装器拿不到 manifest
if (!authEnabled()) {
  console.warn('[auth] AUTH_USER / AUTH_PASS 未设置：当前没有登录保护，公网隧道不要裸奔');
}
app.use('/api', authMiddleware, api);

if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders(res, filePath) {
        const name = path.basename(filePath);
        // PWA 入口必须可更新，不能像 hash 资源一样缓存一年
        if (name === 'index.html' || name === 'sw.js' || name === 'manifest.webmanifest') {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
}

app.use((err: any, _req: any, res: any, _next: any) => {
  console.error('[server]', err);
  if (!res.headersSent) res.status(err?.status || 500).json({ error: err?.message || '服务器错误' });
});

const server = app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  console.log(`\n  🐟 大肥鱼番剧 API  →  ${url}`);
  console.log(`  ${fs.existsSync(path.join(DIST_DIR, 'index.html')) ? '已加载前端构建 dist/' : '开发模式：前端请访问 http://127.0.0.1:5173'}\n`);

  // 后台预热首页与发现层缓存，首屏少等几秒
  setTimeout(() => {
    homeDiscover().catch(() => {});
  }, 600);
  startSeedScheduler();
  startBackupScheduler();
});

function shutdown() {
  saveDbNow();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
