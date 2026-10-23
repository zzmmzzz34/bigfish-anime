import type { FavoriteItem, HistoryItem } from './types';

function groupKey(title: string) {
  return String(title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\u3000]/g, '')
    .replace(/[【】\[\]（）()《》「」『』·,，.。!！?？:：;；'"“”‘’~～\-—_/\\|+*&]/g, '');
}

export interface HistoryGroup {
  key: string;
  title: string;
  primary: HistoryItem;
  items: HistoryItem[];
  sources: string[];
}

export interface FavoriteGroup {
  key: string;
  title: string;
  primary: FavoriteItem;
  items: FavoriteItem[];
  sources: string[];
}

export function groupHistory(items: HistoryItem[]): HistoryGroup[] {
  const map = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const k = groupKey(item.title) || item.key;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  const groups: HistoryGroup[] = [];
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    groups.push({
      key,
      title: sorted[0].title,
      primary: sorted[0],
      items: sorted,
      sources: [...new Set(sorted.map((x) => x.sourceName))],
    });
  }
  return groups.sort((a, b) => b.primary.updatedAt - a.primary.updatedAt);
}

export function groupFavorites(items: FavoriteItem[]): FavoriteGroup[] {
  const map = new Map<string, FavoriteItem[]>();
  for (const item of items) {
    const k = groupKey(item.title) || item.key;
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  const groups: FavoriteGroup[] = [];
  for (const [key, list] of map) {
    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
    groups.push({
      key,
      title: sorted[0].title,
      primary: sorted[0],
      items: sorted,
      sources: [...new Set(sorted.map((x) => x.sourceId))],
    });
  }
  return groups.sort((a, b) => b.primary.createdAt - a.primary.createdAt);
}
