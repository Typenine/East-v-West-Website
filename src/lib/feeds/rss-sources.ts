// Public NFL RSS sources used for player news/injuries
// Keep this list small and reputable. All are free public feeds.
// If a feed becomes unavailable, the fetcher will skip it gracefully.

export type RssSource = {
  id: string;
  name: string;
  url: string;
  // Optional keyword allow/deny lists for quick filtering
  includeKeywords?: string[];
  excludeKeywords?: string[];
};

export const RSS_SOURCES: RssSource[] = [
  {
    id: 'rotowire-news',
    name: 'RotoWire News',
    // RotoWire NFL player news RSS
    url: 'https://www.rotowire.com/rss/news.php?sport=nfl',
  },
  {
    id: 'pfrumors',
    name: 'ProFootballRumors',
    url: 'https://www.profootballrumors.com/feed',
    // Try to drop obvious transaction-only posts
    excludeKeywords: ['signed', 're-signed', 'released', 'waived', 'claimed', 'practice squad', 'contract', 'extension', 'trade', 'traded'],
  },
  // ESPN NFL News
  {
    id: 'espn-nfl',
    name: 'ESPN NFL',
    url: 'https://www.espn.com/espn/rss/nfl/news',
  },
  // CBS Sports NFL Headlines
  {
    id: 'cbs-nfl',
    name: 'CBS Sports NFL',
    url: 'https://www.cbssports.com/rss/headlines/nfl/',
  },
  // Yahoo Sports NFL
  {
    id: 'yahoo-nfl',
    name: 'Yahoo Sports NFL',
    url: 'https://sports.yahoo.com/nfl/rss.xml',
  },
  // ProFootballTalk (NBC Sports)
  {
    id: 'pft',
    name: 'ProFootballTalk',
    url: 'https://profootballtalk.nbcsports.com/feed/',
  },
  // FantasyPros NFL Player News
  {
    id: 'fantasypros-nfl',
    name: 'FantasyPros NFL',
    url: 'https://www.fantasypros.com/rss/nfl-news.xml',
  },
  // NFLTradeRumors (transactions, injuries, roster moves)
  {
    id: 'nfltraderumors',
    name: 'NFLTradeRumors',
    url: 'https://nfltraderumors.co/feed/',
  },
  // NFL.com News (official league site)
  {
    id: 'nfl-com',
    name: 'NFL.com News',
    url: 'https://www.nfl.com/news/rss.xml',
  },
  // Sports Illustrated NFL
  {
    id: 'si-nfl',
    name: 'Sports Illustrated NFL',
    url: 'https://www.si.com/nfl/.rss/full',
  },
  // USA Today Touchdown Wire
  {
    id: 'usatoday-touchdownwire',
    name: 'USA Today Touchdown Wire',
    url: 'https://touchdownwire.usatoday.com/feed/',
  },
  // The 33rd Team
  {
    id: 'the33rdteam',
    name: 'The 33rd Team',
    url: 'https://www.the33rdteam.com/feed/',
  },
  // SB Nation NFL
  {
    id: 'sbnation-nfl',
    name: 'SB Nation NFL',
    url: 'https://www.sbnation.com/rss/nfl/index.xml',
  },
];
