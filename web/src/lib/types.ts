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

export interface PlaySourceLine {
  index: number;
  name: string;
  testUrl: string;
  episodes: Array<{ index: number; name: string; playable: boolean }>;
}

export interface PlaySourceItem {
  work: Work;
  lines: PlaySourceLine[];
}

export interface BiliReview {
  id: string;
  user: string;
  avatar: string;
  score: number;
  content: string;
  likes: number;
  date: string;
  link: string;
}

export interface MemeComment {
  id: string;
  text: string;
  likes: number;
  replies: number;
  author: string;
  avatar: string;
  date: string;
  link: string;
}

export interface MemeAnime {
  seasonId: string;
  title: string;
  cover: string;
  orderText: string;
  episode: { id: string; aid: number; title: string; longTitle: string };
  comments: MemeComment[];
}

export interface BiliLongReview {
  id: string;
  user: string;
  avatar: string;
  title: string;
  content: string;
  likes: number;
  replies: number;
  date: string;
  link: string;
  spoiler: boolean;
}

export interface BiliCommunity {
  seasonId: string;
  mediaId: string;
  stat: {
    views: number;
    danmakus: number;
    favorites: number;
    reply: number;
    likes: number;
    coins: number;
    share: number;
    followText: string;
  };
  rating: { score: number; count: number };
  reviews: BiliReview[];
  longReviews: BiliLongReview[];
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

export interface DanmakuSourceInfo {
  id: DanmakuSourceId;
  label: string;
  count: number;
  ok: boolean;
  error?: string;
}

export interface DanmakuMap {
  biliOffset?: number;
  dandanOffset?: number;
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
  site: 'bilibili' | 'anilist' | 'bangumi';
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
  biliSeasonId?: number;
  status?: string;
  subtitle?: string;
  seasonTitle?: string;
  studio?: string;
  yearText?: string;
}

export interface ManualMatch {
  sourceId: string;
  sourceName: string;
  vodId: string;
  title: string;
  cover: string;
  year: string;
  remarks: string;
  createdAt: number;
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
  href?: string;
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
