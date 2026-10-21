import { getSeasonAnime } from './anilist.js';
import { bangumiIdFor } from './anilistZh.js';
import { fetchBangumiEpisodes, fetchBangumiSubject, bangumiEnabled, bangumiFreshMs } from './bangumi.js';
import { subjectGet } from './bangumiDb.js';
import { getDb } from './store.js';

export type PrefetchScope = 'season' | 'favorites' | 'all';

export interface PrefetchStatus {
  running: boolean;
  scope: PrefetchScope | '';
  total: number;
  done: number;
  ok: number;
  failed: number;
  current: number;
  message: string;
  startedAt: number;
  finishedAt: number;
}

let status: PrefetchStatus = {
  running: false,
  scope: '',
  total: 0,
  done: 0,
  ok: 0,
  failed: 0,
  current: 0,
  message: '',
  startedAt: 0,
  finishedAt: 0,
};
let task: Promise<void> | null = null;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function prefetchStatus() {
  return status;
}

async function collectIds(scope: PrefetchScope) {
  const ids = new Set<number>();

  if (scope === 'season' || scope === 'all') {
    try {
      const season = await getSeasonAnime(30);
      for (const card of season) {
        const id = bangumiIdFor(card.id, [card.title]);
        if (id) ids.add(id);
      }
    } catch (err: any) {
      status.message = `当季列表失败：${err?.message || err}`;
    }
  }

  if (scope === 'favorites' || scope === 'all') {
    try {
      for (const fav of getDb().favorites) {
        const id = bangumiIdFor(undefined, [fav.title]);
        if (id) ids.add(id);
      }
    } catch {
      /* ignore */
    }
  }

  return [...ids];
}

async function run(scope: PrefetchScope) {
  if (!bangumiEnabled()) {
    status.message = '未配置 BANGUMI_BASE';
    return;
  }

  const ids = await collectIds(scope);
  status.total = ids.length;
  status.message = ids.length ? '' : '没有可预热的条目（可能缺少 Bangumi ID 映射）';

  for (const id of ids) {
    status.current = id;
    const row = subjectGet(id);
    if (row && Date.now() - row.fetched_at < bangumiFreshMs()) {
      status.done++;
      continue;
    }

    try {
      await fetchBangumiSubject(id);
      status.ok++;
    } catch (err: any) {
      status.failed++;
      status.message = `#${id} 失败：${err?.message || err}`;
    }

    try {
      await fetchBangumiEpisodes(id);
    } catch {
      /* 集数失败不影响主体 */
    }

    status.done++;
    await sleep(350);
  }
}

/** 启动后台预热；立即返回当前状态，前端轮询 */
export async function startPrefetch(scope: PrefetchScope = 'season') {
  if (task) return status;
  status = {
    running: true,
    scope,
    total: 0,
    done: 0,
    ok: 0,
    failed: 0,
    current: 0,
    message: '正在收集条目…',
    startedAt: Date.now(),
    finishedAt: 0,
  };
  task = run(scope)
    .catch((err: any) => {
      status.message = `预热失败：${err?.message || err}`;
    })
    .finally(() => {
      status.running = false;
      status.finishedAt = Date.now();
      if (!status.message && status.total) {
        status.message = `完成：${status.ok} 成功，${status.failed} 失败`;
      }
      task = null;
    });
  return status;
}
