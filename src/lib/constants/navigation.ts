export type UserNavItem = {
  id: string;
  label: string;
  href?: string;
  /** Optional helper text for non-navigation surfaces. Dropdown menus intentionally stay label-only. */
  description?: string;
  /** Section heading inside a parent dropdown (e.g. "Playoffs") */
  group?: string;
  children?: UserNavItem[];
};

export const HISTORY_TAB_IDS = [
  'champions',
  'brackets',
  'leaderboards',
  'weekly-highs',
  'franchises',
  'records',
] as const;

export const DRAFT_VIEW_IDS = ['next', '2028', 'past', 'team-prospect-draftboard'] as const;
export const DRAFT_NEXT_TAB_IDS = ['airbnb', 'travel', 'order'] as const;

export const USER_NAV_CONFIG: UserNavItem[] = [
  { id: 'home', label: 'Home', href: '/' },
  {
    id: 'league',
    label: 'League',
    children: [
      { id: 'league.teams', label: 'Teams', href: '/teams' },
      { id: 'league.hall-of-fame', label: 'Team Hall of Fame', href: '/hall-of-fame' },
      { id: 'league.rosters', label: 'Rosters', href: '/rosters' },
      { id: 'league.standings', label: 'Standings', href: '/standings' },
      { id: 'league.rules', label: 'Rules', href: '/rules' },
      { id: 'league.rivalries', label: 'Rivalries', href: '/rivalries' },
      { id: 'league.votes', label: 'Votes', href: '/votes' },
    ],
  },
  {
    id: 'history',
    label: 'History',
    children: [
      { id: 'history.champions', label: 'Champions', href: '/history?tab=champions', group: 'League History' },
      { id: 'history.brackets', label: 'Brackets', href: '/history?tab=brackets', group: 'League History' },
      { id: 'history.franchise-history', label: 'Franchise History', href: '/history/franchises', group: 'League History' },
      { id: 'history.all-evw', label: 'All-EVW Teams', href: '/history/all-evw', group: 'League History' },
      { id: 'history.awards', label: 'Awards & Highs', href: '/history/awards', group: 'League History' },
      { id: 'history.gamebooks', label: 'Weekly Gamebooks', href: '/history/gamebook', group: 'League History' },
      { id: 'history.milestones', label: 'Milestones', href: '/history/milestones', group: 'League History' },
      { id: 'history.stats.overview', label: 'Stats Overview', href: '/history/stats', group: 'Stats & Records' },
      { id: 'history.stats.players', label: 'Players', href: '/history/stats?tab=players', group: 'Stats & Records' },
      { id: 'history.stats.franchises', label: 'Franchises', href: '/history/stats?tab=franchises', group: 'Stats & Records' },
      { id: 'history.stats.seasons', label: 'Seasons', href: '/history/stats?tab=seasons', group: 'Stats & Records' },
      { id: 'history.stats.games', label: 'Games', href: '/history/stats?tab=games', group: 'Stats & Records' },
      { id: 'history.stats.records', label: 'Records', href: '/history/stats?tab=records', group: 'Stats & Records' },
      { id: 'history.stats.explorer', label: 'Explorer', href: '/history/stats?tab=explorer', group: 'Stats & Records' },
    ],
  },
  {
    id: 'draft',
    label: 'Draft',
    children: [
      { id: 'draft.live-room', label: 'Draft Room', href: '/draft/room', group: 'Live' },
      {
        id: 'draft.next',
        label: 'Next Draft Hub',
        href: '/draft?view=next',
        group: '2027 Draft',
        children: [
          { id: 'draft.next.airbnb', label: 'Airbnb Info', href: '/draft?view=next&next=airbnb' },
          { id: 'draft.next.travel', label: 'Flights & Arrivals', href: '/draft?view=next&next=travel' },
          { id: 'draft.next.order', label: 'Draft Order', href: '/draft?view=next&next=order' },
        ],
      },
      { id: 'draft.2028', label: '2028 Draft', href: '/draft?view=2028', group: 'Other Drafts' },
      { id: 'draft.past', label: 'Previous Drafts', href: '/draft?view=past', group: 'Other Drafts' },
      { id: 'draft.team-prospect-draftboard', label: 'Prospect Draftboards', href: '/draft?view=team-prospect-draftboard', group: 'Other Drafts' },
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    children: [
      { id: 'transactions.free-agency', label: 'Free Agency & Waivers', href: '/transactions', group: 'Roster Moves' },
      { id: 'transactions.trades', label: 'Trade History', href: '/trades', group: 'Trades' },
      { id: 'transactions.trade-block', label: 'Trade Block', href: '/trades/block', group: 'Trades' },
      { id: 'transactions.trade-analyzer', label: 'Trade Analyzer', href: '/trades/analyzer', group: 'Trades' },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    children: [
      { id: 'media.podcast', label: 'Podcast', href: '/podcast' },
      { id: 'media.newsletter', label: 'Newsletter', href: '/newsletter' },
    ],
  },
  { id: 'suggestions', label: 'Suggestions', href: '/suggestions' },
];
