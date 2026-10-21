import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { api } from './routes.js';
import { DIST_DIR, HOST, PORT } from './lib/config.js';
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
app.use(express.json({ limit: '4mb' }));

app.use('/api', api);

if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
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
});

function shutdown() {
  saveDbNow();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
