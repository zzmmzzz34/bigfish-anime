export interface Episode {
  name: string;
  url: string;
  index: number;
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
  synopsisLang?: 'zh' | 'en';
  updatedAt: string;
  episodeCount: number;
}

export interface WorkDetail extends Work {
  lines: PlayLine[];
  total: number;
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

export interface HomeRow {
  id: string;
  title: string;
  subtitle: string;
  items: Work[];
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

export interface Danmaku {
  id: string;
  key: string;
  text: string;
  color: string;
  mode: 'scroll' | 'top' | 'bottom';
  time: number;
  createdAt: number;
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

export interface Source {
  id: string;
  name: string;
  type: 'maccms' | 'kazumi';
  api: string;
  enabled: boolean;
  referer?: string;
  userAgent?: string;
  animeTypes?: (string | number)[];
  rule?: any;
  createdAt?: number;
}

export interface BiliCard {
  id: string;
  site: 'bilibili' | 'anilist';
  title: string;
  cover: string;
  score: number;
  scoreText: string;
  orderText: string;
  episodesText: string;
  isFinish: boolean;
  badge: string;
  link: string;
  year?: string;
  area?: string;
  genres?: string[];
  synopsis?: string;
  synopsisLang?: 'zh' | 'en';
  titleAlt?: string;
  total?: number;
  actors?: string;
  staff?: string;
  ratingCount?: number;
  scoreSource?: 'bangumi' | 'anilist' | 'bilibili';
  anilistScore?: number;
  bangumiRank?: number;
  bangumiId?: number;
  bangumiRatingTotal?: number;
  bangumiCachedAt?: number;
  bangumiStale?: boolean;
  status?: string;
  subtitle?: string;
  seasonTitle?: string;
  studio?: string;
  yearText?: string;
}

export interface SourceMatch {
  sourceId: string;
  sourceName: string;
  vodId: string;
  title: string;
  cover: string;
  year: string;
  remarks: string;
  score: number;
  lines: PlayLine[];
}

export interface AniCard {
  id: string;
  site: 'anilist';
  title: string;
  titleAlt: string;
  nativeTitle: string;
  englishTitle: string;
  cover: string;
  banner: string;
  score: number;
  scoreText: string;
  popularity: number;
  popularityText: string;
  episodes: number;
  episodesText: string;
  status: string;
  statusText: string;
  year: string;
  season: string;
  genres: string[];
  description: string;
  link: string;
  nextEpisode?: { airingAt: number; episode: number };
}

export interface AniScheduleItem extends AniCard {
  airingAt: number;
  episode: number;
  timeText: string;
}

export interface AniWeekDay {
  weekday: number;
  label: string;
  date: string;
  isToday: boolean;
  items: AniScheduleItem[];
}

export interface DiscoverHome {
  hero: BiliCard[];
  trending: BiliCard[];
  topRated: BiliCard[];
  popular: BiliCard[];
  airing: BiliCard[];
  anilistAiring: AniCard[];
  anilistTop: AniCard[];
  anilistWeek: AniWeekDay[];
  latest: Work[];
  updatedAt: number;
}

export interface SourceTest {
  ok: boolean;
  name: string;
  api: string;
  latency: number;
  total: number;
  categories: number;
  animeCategories: string[];
  sample: string[];
  note?: string;
  mode?: string;
}
