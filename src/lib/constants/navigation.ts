export type UserNavItem = {
  id: string;
  label: string;
  href?: string;
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

export const DRAFT_VIEW_IDS = ['next', '2027', 'past'] as const;
export const DRAFT_NEXT_TAB_IDS = ['airbnb', 'travel', 'order'] as const;

export const USER_NAV_CONFIG: UserNavItem[] = [
  { id: 'home', label: 'Home', href: '/' },
  {
    id: 'league',
    label: 'League',
    children: [
      { id: 'league.teams', label: 'Teams', href: '/teams' },
      { id: 'league.standings', label: 'Standings', href: '/standings' },
      { id: 'league.rules', label: 'Rules', href: '/rules' },
    ],
  },
  {
    id: 'history',
    label: 'History',
    children: [
      { id: 'history.champions', label: 'Champions', href: '/history?tab=champions' },
      { id: 'history.brackets', label: 'Brackets', href: '/history?tab=brackets' },
      { id: 'history.leaderboards', label: 'Leaderboards', href: '/history?tab=leaderboards' },
      { id: 'history.weekly-highs', label: 'Weekly Highs', href: '/history?tab=weekly-highs' },
      { id: 'history.franchises', label: 'Franchises', href: '/history?tab=franchises' },
      { id: 'history.records', label: 'Records', href: '/history?tab=records' },
    ],
  },
  {
    id: 'draft',
    label: 'Draft',
    children: [
      {
        id: 'draft.next',
        label: 'Next Draft',
        href: '/draft?view=next',
        children: [
          { id: 'draft.next.airbnb', label: 'Airbnb Info', href: '/draft?view=next&next=airbnb' },
          { id: 'draft.next.travel', label: 'Flights/Arrivals', href: '/draft?view=next&next=travel' },
          { id: 'draft.next.order', label: 'Draft Order', href: '/draft?view=next&next=order' },
        ],
      },
      { id: 'draft.2027', label: '2027 Draft', href: '/draft?view=2027' },
      { id: 'draft.past', label: 'Previous Drafts', href: '/draft?view=past' },
    ],
  },
  {
    id: 'transactions',
    label: 'Transactions',
    children: [
      { id: 'transactions.free-agency', label: 'Free Agency & Waivers', href: '/transactions' },
      { id: 'transactions.trades', label: 'Trades', href: '/trades' },
      { id: 'transactions.trade-block', label: 'Trade Block', href: '/trades/block' },
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
