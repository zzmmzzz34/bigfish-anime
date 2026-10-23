import { getDb, type ManualMatch } from './store.js';
import { titleKey } from './util.js';
import type { Work } from './types.js';

export type { ManualMatch };

export function manualList(title: string): ManualMatch[] {
  return getDb().manualMatches[titleKey(title)] || [];
}

export function manualAdd(title: string, match: ManualMatch) {
  const db = getDb();
  const key = titleKey(title);
  db.manualMatches ||= {};
  const list = db.manualMatches[key] || [];
  if (list.some((m) => m.sourceId === match.sourceId && m.vodId === match.vodId)) return;
  db.manualMatches[key] = [match, ...list].slice(0, 10);
}

export function manualRemove(title: string, sourceId: string, vodId: string) {
  const db = getDb();
  const key = titleKey(title);
  const list = db.manualMatches[key] || [];
  db.manualMatches[key] = list.filter((m) => !(m.sourceId === sourceId && m.vodId === vodId));
  if (!db.manualMatches[key].length) delete db.manualMatches[key];
}

export function manualWorks(title: string): Work[] {
  const seen = new Set<string>();
  return manualList(title)
    .filter((m) => {
      const key = `${m.sourceId}:${m.vodId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((m) => ({
      key: `${m.sourceId}:${m.vodId}`,
      sourceId: m.sourceId,
      sourceName: m.sourceName,
      vodId: m.vodId,
      title: m.title,
      cover: m.cover,
      year: m.year,
      area: '',
      typeName: '',
      remarks: m.remarks,
      director: '',
      actors: [],
      synopsis: '',
      updatedAt: '',
      episodeCount: 0,
    }));
}
