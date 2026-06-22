// Public NFL RSS sources used for player news/injuries
// Keep this list small and reputable. All are free public feeds.
// If a feed becomes unavailable, the fetcher will skip it gracefully.

/**
 * Source profiles control matching strictness and ranking weight.
 *
 * player_news      – dedicated player-news feeds (RotoWire, FantasyPros); broad name match allowed
 * transaction_news – primarily reports NFL moves and contracts (PFR, NFLTradeRumors)
 * official_news    – official or near-official sources (NFL.com)
 * major_news       – large sports outlets with mixed content (ESPN, CBS, Yahoo, PFT)
 * broad_news       – general/analysis outlets requiring stricter player matching
 */
export type SourceProfile =
  | 'player_news'
  | 'transaction_news'
  | 'official_news'
  | 'major_news'
  | 'broad_news';

export type RssSource = {
  id: string;
  name: string;
  url: string;
  profile: SourceProfile;
  /** Quality multiplier used in relevance scoring (default 1.0). */
  weight: number;
  // Optional keyword allow/deny lists for quick filtering (kept for edge cases)
  includeKeywords?: string[];
  excludeKeywords?: string[];
};

export const RSS_SOURCES: RssSource[] = [
  {
    id: 'rotowire-news',
    name: 'RotoWire News',
    url: 'https://www.rotowire.com/rss/news.php?sport=nfl',
    profile: 'player_news',
    weight: 1.4,
  },
  {
    id: 'fantasypros-nfl',
    name: 'FantasyPros NFL',
    url: 'https://www.fantasypros.com/rss/nfl-news.xml',
    profile: 'player_news',
    weight: 1.2,
  },
  {
    // ProFootballRumors: primary source for NFL transactions, contracts, trade rumors.
    // Previously had broad keyword exclusions that dropped all transaction content.
    // Those exclusions are intentionally removed; source-aware relevance scoring
    // handles ranking instead.
    id: 'pfrumors',
    name: 'ProFootballRumors',
    url: 'https://www.profootballrumors.com/feed',
    profile: 'transaction_news',
    weight: 1.2,
  },
  {
    id: 'nfltraderumors',
    name: 'NFLTradeRumors',
    url: 'https://nfltraderumors.co/feed/',
    profile: 'transaction_news',
    weight: 1.05,
  },
  {
    id: 'nfl-com',
    name: 'NFL.com News',
    url: 'https://www.nfl.com/news/rss.xml',
    profile: 'official_news',
    weight: 1.3,
  },
  {
    id: 'espn-nfl',
    name: 'ESPN NFL',
    url: 'https://www.espn.com/espn/rss/nfl/news',
    profile: 'major_news',
    weight: 1.3,
  },
  {
    id: 'pft',
    name: 'ProFootballTalk',
    url: 'https://profootballtalk.nbcsports.com/feed/',
    profile: 'major_news',
    weight: 1.2,
  },
  {
    id: 'cbs-nfl',
    name: 'CBS Sports NFL',
    url: 'https://www.cbssports.com/rss/headlines/nfl/',
    profile: 'major_news',
    weight: 1.1,
  },
  {
    id: 'yahoo-nfl',
    name: 'Yahoo Sports NFL',
    url: 'https://sports.yahoo.com/nfl/rss.xml',
    profile: 'major_news',
    weight: 1.0,
  },
  {
    id: 'si-nfl',
    name: 'Sports Illustrated NFL',
    url: 'https://www.si.com/nfl/.rss/full',
    profile: 'broad_news',
    weight: 1.0,
  },
  {
    id: 'usatoday-touchdownwire',
    name: 'USA Today Touchdown Wire',
    url: 'https://touchdownwire.usatoday.com/feed/',
    profile: 'broad_news',
    weight: 0.95,
  },
  {
    id: 'the33rdteam',
    name: 'The 33rd Team',
    url: 'https://www.the33rdteam.com/feed/',
    profile: 'broad_news',
    weight: 0.95,
  },
  {
    id: 'sbnation-nfl',
    name: 'SB Nation NFL',
    url: 'https://www.sbnation.com/rss/nfl/index.xml',
    profile: 'broad_news',
    weight: 0.9,
  },
];
