export interface Episode {
  name: string;
  url: string;
  index: number;
  /** 解析后的可直接播放地址（m3u8/mp4），可能为空，需要服务端“嗅探” */
  playable?: boolean;
}

export interface PlayLine {
  name: string;
  episodes: Episode[];
}

export interface Work {
  key: string;
  sourceId: string;
  sourceName: string;
  vodId: string;
  title: string;
  cover: string;
  year: string;
  area: string;
  typeName: string;
  remarks: string;
  director: string;
  actors: string[];
  synopsis: string;
  updatedAt: string;
  episodeCount: number;
}

export interface WorkDetail extends Work {
  lines: PlayLine[];
  total: number;
}

export type SourceType = 'maccms' | 'kazumi';

export interface Source {
  id: string;
  name: string;
  type: SourceType;
  /** MacCMS: .../api.php/provide/vod/  Kazumi: baseURL */
  api: string;
  enabled: boolean;
  /** 请求时需要携带的 Referer，留空则自动推断 */
  referer?: string;
  userAgent?: string;
  /** 首页取哪些分类，留空自动识别 */
  animeTypes?: (string | number)[];
  /** Kazumi 规则原文 */
  rule?: any;
  createdAt?: number;
}

export type DanmakuSourceId = 'local' | 'bilibili' | 'dandan';

export interface Danmaku {
  id: string;
  key: string;
  text: string;
  color: string;
  mode: 'scroll' | 'top' | 'bottom';
  time: number;
  createdAt: number;
  source?: DanmakuSourceId;
}

export interface DanmakuMap {
  /** 片源第 N 集 -> B站第 N+offset 集 */
  biliOffset?: number;
  /** 片源第 N 集 -> DanDan 第 N+offset 集 */
  dandanOffset?: number;
  /** 手动覆盖 B站 season_id */
  biliSeasonId?: number;
  updatedAt?: number;
}

export interface Comment {
  id: string;
  key: string;
  author: string;
  text: string;
  parentId?: string;
  createdAt: number;
  likes?: number;
}

export interface HistoryItem {
  key: string;
  sourceId: string;
  sourceName: string;
  vodId: string;
  title: string;
  cover: string;
  lineIndex: number;
  episodeIndex: number;
  episodeName: string;
  position: number;
  duration: number;
  updatedAt: number;
}

export interface LineStat {
  key: string;
  sourceId: string;
  host: string;
  lineName?: string;
  ok: number;
  fail: number;
  lastAt: number;
  lastError?: string;
}

export interface FavoriteItem {
  key: string;
  sourceId: string;
  vodId: string;
  title: string;
  cover: string;
  year: string;
  typeName: string;
  createdAt: number;
}
