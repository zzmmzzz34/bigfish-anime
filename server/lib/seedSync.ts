import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.js';
import { reloadSeed, seedStatus } from './anilistZh.js';

const SCRIPT = path.join(ROOT, 'scripts', 'sync-bangumi.mjs');
const MAX_AGE = 7 * 24 * 3600_000;
const CHECK_EVERY = 6 * 3600_000;

let state = {
  running: false,
  ok: false,
  startedAt: 0,
  finishedAt: 0,
  message: '',
};
let scheduled = false;

export function seedSyncStatus() {
  return { ...state, seed: seedStatus() };
}

export function startSeedSync() {
  if (state.running) return seedSyncStatus();
  state = { running: true, ok: false, startedAt: Date.now(), finishedAt: 0, message: '开始同步…' };

  const child = spawn(process.execPath, [SCRIPT], {
    cwd: ROOT,
    env: process.env,
    windowsHide: true,
  });
  let output = '';
  const append = (chunk: Buffer) => {
    output += chunk.toString('utf8');
    if (output.length > 6000) output = output.slice(-6000);
    state.message = output.slice(-1500);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  child.on('error', (err) => {
    state = {
      running: false,
      ok: false,
      startedAt: state.startedAt,
      finishedAt: Date.now(),
      message: `同步失败：${err.message}`,
    };
    console.warn('[seed]', err);
  });
  child.on('close', (code) => {
    state = {
      running: false,
      ok: code === 0,
      startedAt: state.startedAt,
      finishedAt: Date.now(),
      message: code === 0 ? '同步完成' : `同步失败（exit ${code}）`,
    };
    if (code === 0) reloadSeed();
    console.log(`[seed] ${state.message}`);
  });

  return seedSyncStatus();
}

export function startSeedScheduler() {
  if (scheduled) return;
  scheduled = true;
  const check = () => {
    try {
      const status = seedStatus();
      const age = status.mtime ? Date.now() - status.mtime : Infinity;
      if (age > MAX_AGE) startSeedSync();
    } catch (err: any) {
      console.warn('[seed] 检查失败:', err?.message || err);
    }
  };
  setTimeout(check, 15_000);
  setInterval(check, CHECK_EVERY).unref();
}
