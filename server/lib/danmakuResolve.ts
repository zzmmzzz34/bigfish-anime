import { biliSeasonForAniList, getBilibiliDanmaku } from './bilibiliDanmaku.js';
import { dandanEnabled, getDandanDanmaku } from './dandan.js';
import { getDb } from './store.js';
import type { Danmaku, DanmakuSourceId } from './types.js';

export interface DanmakuSourceInfo {
  id: DanmakuSourceId;
  label: string;
  count: number;
  ok: boolean;
  error?: string;
}

export type DanmakuPriority = 'merge' | 'bilibili' | 'dandan' | 'local';

export interface ResolveInput {
  key: string;
  title?: string;
  ep: number;
  catalogSeason?: number;
  priority?: DanmakuPriority;
}

function merge(items: Danmaku[]) {
  const seen = new Set<string>();
  const out: Danmaku[] = [];
  for (const item of items) {
    const dedupe = `${item.time.toFixed(2)}|${item.mode}|${item.text}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(item);
  }
  return out.sort((a, b) => a.time - b.time);
}

/**
 * 统一弹幕解析：
 * 本地（始终）→ B站（有 season 时）→ DanDan（有凭证时）。
 * 播放器只依赖这个入口，新增源不需要改播放器。
 */
export async function resolveDanmaku(input: ResolveInput) {
  const db = getDb();
  const cut = input.key.lastIndexOf(':');
  const workKey = cut > 0 ? input.key.slice(0, cut) : input.key;
  const map = db.danmakuMap[workKey] || {};
  const biliOffset = Number(map.biliOffset) || 0;
  const dandanOffset = Number(map.dandanOffset) || 0;
  let catalogSeason = Number(map.biliSeasonId) || input.catalogSeason || 0;
  // 从片源详情直接进播放器时没有 catalog，按标题补一次 B站 season
  if (!catalogSeason && input.title) {
    catalogSeason = await biliSeasonForAniList(undefined, [input.title]).catch(() => 0);
  }
  const biliEp = input.ep + biliOffset;
  const dandanEp = input.ep + dandanOffset;

  const local: Danmaku[] = (db.danmaku[input.key] || []).map((item) => ({
    ...item,
    source: 'local' as const,
  }));

  const sources: DanmakuSourceInfo[] = [
    { id: 'local', label: '本地', count: local.length, ok: true },
  ];
  const warnings: string[] = [];

  if (catalogSeason && biliEp < 0) {
    warnings.push('B站弹幕：偏移后小于第 1 集');
  }
  if (input.title && dandanEnabled() && dandanEp < 0) {
    warnings.push('DanDanPlay：偏移后小于第 1 集');
  }

  const getBili = () =>
    catalogSeason && biliEp >= 0
      ? getBilibiliDanmaku(catalogSeason, biliEp)
          .then((res) => res.items as Danmaku[])
          .catch((err: any) => {
            warnings.push(`B站弹幕：${err?.message || err}`);
            return [] as Danmaku[];
          })
      : Promise.resolve([] as Danmaku[]);

  const getDandan = () =>
    input.title && dandanEnabled() && dandanEp >= 0
      ? getDandanDanmaku(input.title, dandanEp)
          .then((res) => res?.items || [])
          .catch((err: any) => {
            warnings.push(`DanDanPlay：${err?.message || err}`);
            return [] as Danmaku[];
          })
      : Promise.resolve([] as Danmaku[]);

  let bili: Danmaku[] = [];
  let dandan: Danmaku[] = [];
  const priority = input.priority || 'merge';
  if (priority === 'local') {
    /* 只本地 */
  } else if (priority === 'bilibili') {
    bili = await getBili();
    if (!bili.length) dandan = await getDandan();
  } else if (priority === 'dandan') {
    dandan = await getDandan();
    if (!dandan.length) bili = await getBili();
  } else {
    [bili, dandan] = await Promise.all([getBili(), getDandan()]);
  }

  if (catalogSeason) {
    sources.push({
      id: 'bilibili',
      label: 'B站',
      count: bili.length,
      ok: !warnings.some((w) => w.startsWith('B站弹幕')),
      error: warnings.find((w) => w.startsWith('B站弹幕')),
    });
  }
  if (input.title && dandanEnabled()) {
    sources.push({
      id: 'dandan',
      label: 'DanDan',
      count: dandan.length,
      ok: !warnings.some((w) => w.startsWith('DanDanPlay')),
      error: warnings.find((w) => w.startsWith('DanDanPlay')),
    });
  }

  return {
    items: merge([...local, ...bili, ...dandan]),
    sources,
    warnings,
    mapping: {
      workKey,
      biliOffset,
      dandanOffset,
      biliSeasonId: catalogSeason,
      biliEp: biliEp >= 0 ? biliEp : 0,
      dandanEp: dandanEp >= 0 ? dandanEp : 0,
    },
  };
}
