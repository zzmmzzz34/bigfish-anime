import { getDb, saveDb } from './store.js';
import { getAnimeCategories, getMacDetail, listLatest, searchMac, testMacSource } from './maccms.js';
import { getKazumiDetail, searchKazumi, testKazumiSource } from './kazumi.js';
import { titleKey } from './util.js';
import type { Source, Work, WorkDetail } from './types.js';

export function listSources(): Source[] {
  return getDb().sources;
}

export function getSource(id: string): Source | undefined {
  return getDb().sources.find((s) => s.id === id);
}

export function enabledSources(): Source[] {
  return listSources().filter((s) => s.enabled);
}

export async function searchSource(source: Source, keyword: string): Promise<Work[]> {
  if (source.type === 'kazumi') return searchKazumi(source, keyword);
  return searchMac(source, keyword);
}

export async function detailSource(source: Source, vodId: string): Promise<WorkDetail | null> {
  if (source.type === 'kazumi') return getKazumiDetail(source, vodId);
  return getMacDetail(source, vodId);
}

export async function testSource(source: Source) {
  if (source.type === 'kazumi') return testKazumiSource(source);
  return testMacSource(source);
}

export interface SearchGroup {
  titleKey: string;
  title: string;
  cover: string;
  year: string;
  area: string;
  typeName: string;
  synopsis: string;
  remarks: string;
  items: Work[];
}

export function groupWorks(works: Work[]): SearchGroup[] {
  const map = new Map<string, SearchGroup>();
  for (const w of works) {
    const k = titleKey(w.title) || w.key;
    const g = map.get(k);
    if (!g) {
      map.set(k, {
        titleKey: k,
        title: w.title,
        cover: w.cover,
        year: w.year,
        area: w.area,
        typeName: w.typeName,
        synopsis: w.synopsis,
        remarks: w.remarks,
        items: [w],
      });
    } else {
      g.items.push(w);
      if (!g.cover) g.cover = w.cover;
      if (!g.year) g.year = w.year;
      if (!g.synopsis) g.synopsis = w.synopsis;
    }
  }
  const quality = (w: Work) => {
    let score = 0;
    if (/解说|国语|粤语|中配|台配/i.test(w.title)) score += 3;
    if (/预告|花絮|片段/i.test(w.title)) score += 2;
    score += Math.min(w.title.length / 20, 1);
    return score;
  };
  const groups = [...map.values()];
  for (const g of groups) {
    g.items.sort((a, b) => quality(a) - quality(b));
    const best = g.items[0];
    g.title = best.title;
    g.cover = best.cover || g.cover;
    g.year = best.year || g.year;
    g.remarks = best.remarks || g.remarks;
    if (best.synopsis) g.synopsis = best.synopsis;
  }
  return groups.sort((a, b) => b.items.length - a.items.length);
}

export async function searchAll(keyword: string) {
  const sources = enabledSources();
  const settled = await Promise.allSettled(sources.map((s) => searchSource(s, keyword)));
  const works: Work[] = [];
  const errors: Array<{ source: string; message: string }> = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') works.push(...r.value);
    else errors.push({ source: sources[i].name, message: String((r.reason as any)?.message || r.reason) });
  });
  return { groups: groupWorks(works), errors };
}

/** 换源：优先严格同名，其次允许极短的续名（如“国语版”已被归一化） */
export async function alternates(title: string, excludeKey?: string, alias = '') {
  const query = alias.trim() || title;
  const { groups } = await searchAll(query);
  const key = titleKey(query);
  const all = groups.flatMap((g) => g.items);
  const block = /第二季|第三季|剧场|外传|解说|音乐会|ova|特别篇|总集篇|回忆|国语|粤语/i;

  const exact: Work[] = [];
  const near: Work[] = [];
  for (const w of all) {
    if (w.key === excludeKey) continue;
    if (/解说|预告|花絮|片段/i.test(w.title) && !/解说|预告|花絮|片段/i.test(query)) continue;
    const k = titleKey(w.title);
    if (k === key) exact.push(w);
    else if (k.startsWith(key) && k.length - key.length <= 2 && !block.test(k.slice(key.length))) {
      near.push(w);
    }
  }
  return [...exact, ...near].slice(0, 10);
}

export interface HomeRow {
  id: string;
  title: string;
  subtitle: string;
  items: Work[];
}

export async function buildHome() {
  const sources = enabledSources().slice(0, 5);
  const rows: HomeRow[] = [];
  const collected: Work[] = [];

  const results = await Promise.allSettled(
    sources.map(async (source) => {
      if (source.type !== 'maccms') return [] as Work[];
      const cats = await getAnimeCategories(source);
      const ids = cats.slice(0, 3).map((c) => c.id);
      const works = await listLatest(source, { typeIds: ids, page: 1, limit: 18 });
      return works;
    }),
  );

  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !r.value.length) return;
    const source = sources[i];
    collected.push(...r.value);
    rows.push({
      id: `src-${source.id}`,
      title: `${source.name} · 最近更新`,
      subtitle: r.value[0]?.typeName || '番剧',
      items: r.value,
    });
  });

  const merged = groupWorks(collected).slice(0, 18);
  if (merged.length) {
    rows.unshift({
      id: 'latest',
      title: '全源最新',
      subtitle: '聚合所有片源的最近更新',
      items: merged.map((g) => g.items[0]),
    });
  }

  const heroPool = merged.slice(0, 6).map((g) => g.items[0]);
  return { rows, hero: heroPool };
}
