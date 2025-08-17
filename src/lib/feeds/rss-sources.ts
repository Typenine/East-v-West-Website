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
];
