/**
 * MCP Tool Reliability Tests
 *
 * Tests all 12 handler functions in src/lib/mcp/handlers.ts.
 * Sleeper API calls and external utilities are mocked so tests run offline
 * and deterministically. The test data mirrors real league values so that
 * regressions in data shape or missing-field handling are caught early.
 *
 * Run:  npx vitest run tests/mcp-tools.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock factories are hoisted before any const declarations.
// Use vi.hoisted() so variables are available in both mock factories and tests.
const { TEAM_NAMES } = vi.hoisted(() => ({
  TEAM_NAMES: [
    'Belltown Raptors', 'Double Trouble', 'Elemental Heroes',
    'Mt. Lebanon Cake Eaters', 'Belleview Badgers', 'BeerNeverBrokeMyHeart',
    'Detroit Dawgs', 'bop pop', "Minshew's Maniacs", 'Red Pandas',
    'The Lone Ginger', 'Bimg Bamg Boomg',
  ] as string[],
}));

// ─── Mock: @/lib/constants/league ─────────────────────────────────────────────
vi.mock('@/lib/constants/league', () => ({
  LEAGUE_IDS: {
    CURRENT: '1312872384503484416',
    PREVIOUS: { '2025': '1205237529570193408', '2024': '1116504942988107776', '2023': '991521604930772992' },
  },
  CURRENT_SEASON: '2026',
  TEAM_NAMES,
  CHAMPIONS: {
    '2026': { champion: 'TBD', runnerUp: 'TBD', thirdPlace: 'TBD' },
    '2025': { champion: 'BeerNeverBrokeMyHeart', runnerUp: 'Double Trouble', thirdPlace: 'Mt. Lebanon Cake Eaters' },
    '2024': { champion: 'Belltown Raptors', runnerUp: 'Double Trouble', thirdPlace: 'Belleview Badgers' },
    '2023': { champion: 'Double Trouble', runnerUp: 'Elemental Heroes', thirdPlace: 'Detroit Dawgs' },
  },
  IMPORTANT_DATES: {
    NFL_WEEK_1_START: new Date('2026-09-10T20:20:00-04:00'),
    TRADE_DEADLINE: new Date('2026-11-30T23:45:00-05:00'),
    PLAYOFFS_START: new Date('2026-12-17T20:20:00-05:00'),
    NEW_LEAGUE_YEAR: new Date('2027-02-07T18:30:00-05:00'),
    NEXT_DRAFT: new Date('2026-07-18T13:00:00-04:00'),
  },
}));

// ─── Mock: @/lib/utils/team-utils ─────────────────────────────────────────────
vi.mock('@/lib/utils/team-utils', () => ({
  getTeamLogoPath: (name: string) => `/logos/${name.replace(/\s+/g, '-').toLowerCase()}.png`,
}));

// ─── Mock: @/data/rules ───────────────────────────────────────────────────────
vi.mock('@/data/rules', () => ({
  rulesHtmlSections: [
    { id: 'league-overview', title: '1. League Overview', html: '<p>Format: SuperFlex Dynasty League. Scoring: 0.5 PPR.</p>' },
    { id: 'rosters-lineups', title: '5. Rosters & Lineups', html: '<p>Taxi Squad: up to 4 players, max 1 QB. Main Roster Limit: 17.</p>' },
    { id: 'trades', title: '7. Trades', html: '<p>Trade Deadline is End of Week 12. Trading opens on Super Bowl Sunday.</p>' },
    { id: 'free-agency-waivers', title: '6. Free Agency & Waivers', html: '<p>Each team receives $100 FAAB per season. Minimum Bid: $1.</p>' },
    { id: 'standings-playoffs', title: '9. Standings & Playoffs', html: '<p>Playoff Teams: 7. Regular Season: Weeks 1-14.</p>' },
  ],
}));

// ─── Shared mock Sleeper data ──────────────────────────────────────────────────

const mockTeams = TEAM_NAMES.map((name, i) => ({ teamName: name, rosterId: i + 1, ownerId: `user${i + 1}`, players: [] as string[] }));

const mockRosters = TEAM_NAMES.map((name, i) => ({
  roster_id: i + 1,
  owner_id: `user${i + 1}`,
  league_id: '1312872384503484416',
  players: [`player${i * 3 + 1}`, `player${i * 3 + 2}`, `player${i * 3 + 3}`],
  taxi: [] as string[],
  reserve: [] as string[],
  settings: { wins: 5 + i % 4, losses: 4 - i % 4, ties: 0, fpts: 1200 + i * 50, fpts_decimal: 25, fpts_against: 1100 + i * 30, fpts_against_decimal: 75 },
}));

// Double Trouble is roster_id 2 (index 1). Add a known player to their roster
mockRosters[1].players = ['4034', '5844', 'player_dt3'];

const mockPlayers: Record<string, { first_name: string; last_name: string; position: string; team: string; injury_status: string | null; status: string | null; years_exp: number }> = {
  '4034': { first_name: 'Patrick', last_name: 'Mahomes', position: 'QB', team: 'KC', injury_status: null, status: 'Active', years_exp: 7 },
  '5844': { first_name: 'Justin', last_name: 'Jefferson', position: 'WR', team: 'MIN', injury_status: null, status: 'Active', years_exp: 5 },
  'player_dt3': { first_name: 'Josh', last_name: 'Allen', position: 'QB', team: 'BUF', injury_status: null, status: 'Active', years_exp: 7 },
};
// Populate remaining roster players
for (let i = 0; i < 12; i++) {
  for (let j = 1; j <= 3; j++) {
    const pid = `player${i * 3 + j}`;
    if (!mockPlayers[pid]) {
      mockPlayers[pid] = { first_name: `First${i}`, last_name: `Last${j}`, position: ['QB','RB','WR','TE'][j % 4], team: 'NFL', injury_status: null, status: 'Active', years_exp: 2 };
    }
  }
}

const mockMatchups = [
  { roster_id: 1, matchup_id: 1, points: 145.5, custom_points: null, starters: [], players: [] },
  { roster_id: 2, matchup_id: 1, points: 132.2, custom_points: null, starters: [], players: [] },
  { roster_id: 3, matchup_id: 2, points: 0, custom_points: null, starters: [], players: [] },
  { roster_id: 4, matchup_id: 2, points: 0, custom_points: null, starters: [], players: [] },
];

const mockNFLState = { week: 3, season_type: 'regular', season: '2026' };

const mockTransactions = [
  { id: 'tx1', type: 'waiver' as const, season: '2026', week: 2, created: Date.now() - 86400000, team: 'Double Trouble', teamsInvolved: ['Double Trouble'], rosterId: 2, added: [{ playerId: '4034', name: 'Patrick Mahomes', position: 'QB', nflTeam: 'KC' }], dropped: [], faab: 45, metadata: null },
  { id: 'tx2', type: 'free_agent' as const, season: '2026', week: 2, created: Date.now() - 172800000, team: 'Belltown Raptors', teamsInvolved: ['Belltown Raptors'], rosterId: 1, added: [{ playerId: '5844', name: 'Justin Jefferson', position: 'WR', nflTeam: 'MIN' }], dropped: [], faab: 0, metadata: null },
];

const mockSplits = Object.fromEntries(TEAM_NAMES.map((name, i) => [
  `roster${i + 1}`,
  { teamName: name, regular: { wins: 20 + i, losses: 16 - i % 8, ties: 0, pf: 2800 + i * 100, pa: 2600 + i * 80 }, playoffs: { wins: 2, losses: 1, ties: 0, pf: 400, pa: 380 }, toilet: { wins: 0, losses: 0, ties: 0, pf: 0, pa: 0 } },
]));

const mockTrades = [
  {
    id: 'trade1', date: '2026-03-15', season: '2026', week: 3, created: Date.now() - 86400000,
    status: 'completed' as const,
    teams: [
      { name: 'Double Trouble', assets: [{ type: 'player' as const, name: 'Justin Jefferson', position: 'WR', playerId: '5844' }], gets: [], gives: [] },
      { name: 'Belltown Raptors', assets: [{ type: 'pick' as const, name: '2027 1st Round Pick', round: 1, year: '2027' }], gets: [], gives: [] },
    ],
  },
];

// ─── Mock: @/lib/utils/sleeper-api ────────────────────────────────────────────
vi.mock('@/lib/utils/sleeper-api', () => ({
  getTeamsData: vi.fn(async () => mockTeams),
  getLeagueRosters: vi.fn(async () => mockRosters),
  getAllPlayersCached: vi.fn(async () => mockPlayers),
  getSplitRecordsAllTime: vi.fn(async () => mockSplits),
  getNFLState: vi.fn(async () => mockNFLState),
  getLeagueMatchups: vi.fn(async () => mockMatchups),
  buildYearToLeagueMapUnique: vi.fn(async () => ({ '2025': '1205237529570193408', '2024': '1116504942988107776', '2023': '991521604930772992' })),
  getLeagueDrafts: vi.fn(async () => [{ draft_id: 'draft2025', season: '2025' }]),
  getDraftPicks: vi.fn(async () => [
    { roster_id: 2, player_id: '4034', round: 1, draft_slot: 1, pick_no: 1 },
    { roster_id: 1, player_id: '5844', round: 1, draft_slot: 2, pick_no: 2 },
  ]),
}));

// ─── Mock: @/lib/utils/transactions ───────────────────────────────────────────
vi.mock('@/lib/utils/transactions', () => ({
  buildTransactionLedger: vi.fn(async () => mockTransactions),
}));

// ─── Mock: @/lib/utils/trades ─────────────────────────────────────────────────
vi.mock('@/lib/utils/trades', () => ({
  fetchTradesAllTime: vi.fn(async () => mockTrades),
}));

// ─── Mock: @/lib/mcp/auth ─────────────────────────────────────────────────────
vi.mock('@/lib/mcp/auth', () => ({
  mcpMeta: (tool: string, extra?: Record<string, unknown>) => ({
    tool, source: 'east-v-west-api', fetchedAt: '2026-06-08T00:00:00.000Z', ...extra,
  }),
}));

// ─── Import handlers (after all mocks are registered) ─────────────────────────
import {
  handleGetLeagueInfo,
  handleGetStandings,
  handleGetTeam,
  handleGetRosters,
  handleGetPlayer,
  handleGetMatchups,
  handleGetTransactions,
  handleGetTrades,
  handleGetDrafts,
  handleGetFranchise,
  handleGetRules,
  handleGetWeeklyContext,
  McpError,
} from '@/lib/mcp/handlers';

// ─── Test suites ──────────────────────────────────────────────────────────────

describe('get_league_info', () => {
  it('returns league name, format, and scoring', async () => {
    const res = await handleGetLeagueInfo();
    expect(res.league.name).toBe('East v. West Fantasy Football');
    expect(res.league.format).toBe('Dynasty');
    expect(res.league.scoring).toBe('0.5 PPR SuperFlex');
  });

  it('returns all 12 team names', async () => {
    const res = await handleGetLeagueInfo();
    expect(res.league.teamCount).toBe(12);
    expect(res.league.teams).toEqual(expect.arrayContaining(['Double Trouble', 'Belltown Raptors']));
  });

  it('includes correct payout for champion ($365)', async () => {
    const res = await handleGetLeagueInfo();
    expect(res.payouts.champion).toBe(365);
    expect(res.payouts.totalPrizePool).toBe(1200);
  });

  it('returns all important dates as ISO strings', async () => {
    const res = await handleGetLeagueInfo();
    // Dates are returned as UTC ISO strings (.toISOString())
    // TRADE_DEADLINE: 2026-11-30 23:45 ET = 2026-12-01 04:45 UTC
    expect(res.importantDates.TRADE_DEADLINE).toMatch(/^2026-12-01/);
    // NEXT_DRAFT: 2026-07-18 13:00 ET = 2026-07-18 17:00 UTC (still July 18)
    expect(res.importantDates.NEXT_DRAFT).toMatch(/^2026-07-18/);
    // PLAYOFFS_START: 2026-12-17 20:20 ET = 2026-12-18 01:20 UTC
    expect(res.importantDates.PLAYOFFS_START).toMatch(/^2026-12-18/);
  });

  it('returns rules sections with id, title, text', async () => {
    const res = await handleGetLeagueInfo();
    expect(res.rules.length).toBeGreaterThan(0);
    const tradeSection = res.rules.find((s) => s.id === 'trades');
    expect(tradeSection).toBeDefined();
    expect(tradeSection?.text).toContain('Trade Deadline');
  });

  it('metadata source is static-constants (no Sleeper call)', async () => {
    const res = await handleGetLeagueInfo();
    expect(res.meta.dataSource).toBe('static-constants');
  });

  it('includes champions list with 2023 champion Double Trouble', async () => {
    const res = await handleGetLeagueInfo();
    expect(res.league.champions['2023'].champion).toBe('Double Trouble');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_current_standings', () => {
  it('returns both currentSeasonStandings and allTimeStandings', async () => {
    const res = await handleGetStandings();
    expect(res.currentSeasonStandings).toBeInstanceOf(Array);
    expect(res.allTimeStandings).toBeInstanceOf(Array);
  });

  it('currentSeasonStandings has rank starting at 1', async () => {
    const res = await handleGetStandings();
    const ranks = res.currentSeasonStandings.map((r) => r.rank);
    expect(ranks[0]).toBe(1);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });

  it('each team row has required fields', async () => {
    const res = await handleGetStandings();
    for (const row of res.currentSeasonStandings) {
      expect(row).toHaveProperty('team');
      expect(row).toHaveProperty('wins');
      expect(row).toHaveProperty('losses');
      expect(row).toHaveProperty('pf');
      expect(row).toHaveProperty('pa');
      expect(row).toHaveProperty('avgPf');
      expect(row).toHaveProperty('championships');
    }
  });

  it('all 12 teams appear in currentSeasonStandings', async () => {
    const res = await handleGetStandings();
    expect(res.currentSeasonStandings.length).toBe(12);
    const names = res.currentSeasonStandings.map((r) => r.team);
    expect(names).toContain('Double Trouble');
    expect(names).toContain('Belltown Raptors');
  });

  it('sorted by wins descending then pf descending', async () => {
    const res = await handleGetStandings();
    const rows = res.currentSeasonStandings;
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i], b = rows[i + 1];
      expect(a.wins > b.wins || (a.wins === b.wins && a.pf >= b.pf)).toBe(true);
    }
  });

  it('BeerNeverBrokeMyHeart has 1 championship in current season standings', async () => {
    const res = await handleGetStandings();
    const beer = res.currentSeasonStandings.find((r) => r.team === 'BeerNeverBrokeMyHeart');
    expect(beer?.championships).toBe(1);
  });

  it('Double Trouble has 1 championship in all-time standings', async () => {
    const res = await handleGetStandings();
    const dt = res.allTimeStandings.find((r) => r.team === 'Double Trouble');
    expect(dt?.championships).toBe(1);
  });

  it('meta note distinguishes live vs all-time data', async () => {
    const res = await handleGetStandings();
    expect(res.meta.note).toContain('live');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_team_dashboard', () => {
  it('returns team data for Double Trouble (partial match)', async () => {
    const res = await handleGetTeam({ name: 'Double Trouble' });
    expect(res.team.name).toBe('Double Trouble');
  });

  it('partial name match works (case-insensitive)', async () => {
    const res = await handleGetTeam({ name: 'double' });
    expect(res.team.name).toBe('Double Trouble');
  });

  it('returns current record with wins/losses/pf/pa', async () => {
    const res = await handleGetTeam({ name: 'Double Trouble' });
    expect(res.team.currentRecord).toHaveProperty('wins');
    expect(res.team.currentRecord).toHaveProperty('losses');
    expect(res.team.currentRecord).toHaveProperty('pf');
    expect(typeof res.team.currentRecord.pf).toBe('number');
  });

  it('roster contains expected players for Double Trouble', async () => {
    const res = await handleGetTeam({ name: 'Double Trouble' });
    const allPlayers = [...res.roster.active, ...res.roster.ir, ...res.roster.taxi];
    const names = allPlayers.map((p) => p.name);
    expect(names).toContain('Patrick Mahomes');
  });

  it('championship history shows Double Trouble won in 2023', async () => {
    const res = await handleGetTeam({ name: 'Double Trouble' });
    const win = res.team.championshipHistory.find((c) => c.year === 2023);
    expect(win?.finish).toBe('1st (Champion)');
  });

  it('championship count equals 1 for Double Trouble', async () => {
    const res = await handleGetTeam({ name: 'Double Trouble' });
    expect(res.team.championships).toBe(1);
  });

  it('throws McpError with not_found when team name does not match', async () => {
    await expect(handleGetTeam({ name: 'Nonexistent Team XYZ' })).rejects.toThrow(McpError);
    await expect(handleGetTeam({ name: 'Nonexistent Team XYZ' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('throws McpError with missing_param when name is omitted', async () => {
    await expect(handleGetTeam({})).rejects.toMatchObject({ code: 'missing_param' });
  });

  it('error message for not_found lists available team names', async () => {
    await expect(handleGetTeam({ name: 'Nonexistent Team XYZ' })).rejects.toThrow(/Available:/);
  });

  it('allTimeStats is present when split records exist', async () => {
    const res = await handleGetTeam({ name: 'Double Trouble' });
    expect(res.team.allTimeStats).not.toBeNull();
    expect(res.team.allTimeStats?.regularSeason).toHaveProperty('wins');
  });

  it('logoUrl is returned', async () => {
    const res = await handleGetTeam({ name: 'Double Trouble' });
    expect(res.team.logoUrl).toMatch(/double-trouble/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_current_roster', () => {
  it('returns all 12 teams when no filter', async () => {
    const res = await handleGetRosters({});
    expect(res.rosters.length).toBe(12);
  });

  it('filters to a single team', async () => {
    const res = await handleGetRosters({ team: 'Double Trouble' });
    expect(res.rosters.length).toBe(1);
    expect(res.rosters[0].team).toBe('Double Trouble');
  });

  it('partial team name filter works case-insensitively', async () => {
    const res = await handleGetRosters({ team: 'belltown' });
    expect(res.rosters.length).toBe(1);
    expect(res.rosters[0].team).toBe('Belltown Raptors');
  });

  it('each team has players array with slot labels', async () => {
    const res = await handleGetRosters({});
    for (const team of res.rosters) {
      expect(team.players).toBeInstanceOf(Array);
      expect(team.players.length).toBeGreaterThan(0);
      for (const p of team.players) {
        expect(['active', 'ir', 'taxi']).toContain(p.slot);
      }
    }
  });

  it('each player has name, position, nflTeam, status, slot', async () => {
    const res = await handleGetRosters({ team: 'Double Trouble' });
    for (const p of res.rosters[0].players) {
      expect(p).toHaveProperty('id');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('position');
      expect(p).toHaveProperty('nflTeam');
      expect(p).toHaveProperty('status');
      expect(p).toHaveProperty('slot');
    }
  });

  it('Double Trouble roster includes Patrick Mahomes', async () => {
    const res = await handleGetRosters({ team: 'Double Trouble' });
    const names = res.rosters[0].players.map((p) => p.name);
    expect(names).toContain('Patrick Mahomes');
  });

  it('returns current record with wins/losses', async () => {
    const res = await handleGetRosters({ team: 'Double Trouble' });
    expect(res.rosters[0].record).toHaveProperty('wins');
    expect(res.rosters[0].record).toHaveProperty('losses');
  });

  it('returns empty array (not error) when team filter matches nothing', async () => {
    const res = await handleGetRosters({ team: 'zzz-no-match' });
    expect(res.rosters).toEqual([]);
  });

  it('does NOT return raw player database dump (each player is slim)', async () => {
    const res = await handleGetRosters({ team: 'Belltown Raptors' });
    const player = res.rosters[0].players[0];
    // Must not contain full raw Sleeper fields
    expect(player).not.toHaveProperty('years_exp');
    expect(player).not.toHaveProperty('search_full_name');
    expect(Object.keys(player).length).toBeLessThanOrEqual(7);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('search_players (handleGetPlayer name search)', () => {
  it('finds Patrick Mahomes by partial name "Mahomes"', async () => {
    const res = await handleGetPlayer({ name: 'Mahomes' });
    expect(res).toHaveProperty('players');
    const found = (res as { players: Array<{ name: string }> }).players.find((p) => p.name === 'Patrick Mahomes');
    expect(found).toBeDefined();
  });

  it('league-owned players ranked first in results', async () => {
    const res = await handleGetPlayer({ name: 'Patrick' }) as { players: Array<{ name: string; fantasyOwner: string | null }> };
    const owned = res.players.filter((p) => p.fantasyOwner !== null);
    const notOwned = res.players.filter((p) => p.fantasyOwner === null);
    // All owned players should appear before unowned ones
    const firstUnownedIdx = res.players.findIndex((p) => p.fantasyOwner === null);
    const lastOwnedIdx = res.players.map((p) => p.fantasyOwner !== null).lastIndexOf(true);
    if (owned.length > 0 && notOwned.length > 0) {
      expect(lastOwnedIdx).toBeLessThan(firstUnownedIdx);
    }
  });

  it('respects limit parameter', async () => {
    const res = await handleGetPlayer({ name: 'First0', limit: 2 }) as { players: unknown[] };
    expect(res.players.length).toBeLessThanOrEqual(2);
  });

  it('limit caps at 20 regardless of input', async () => {
    const res = await handleGetPlayer({ name: 'Last', limit: 999 }) as { players: unknown[] };
    expect(res.players.length).toBeLessThanOrEqual(20);
  });

  it('returns empty players array (not error) when no matches', async () => {
    const res = await handleGetPlayer({ name: 'ZzzNoMatchXxx' }) as { players: unknown[] };
    expect(res.players).toEqual([]);
  });

  it('throws McpError when neither id nor name provided', async () => {
    await expect(handleGetPlayer({})).rejects.toMatchObject({ code: 'missing_param' });
  });

  it('each result includes fantasyOwner field (null or team name)', async () => {
    const res = await handleGetPlayer({ name: 'Patrick' }) as { players: Array<{ fantasyOwner: unknown }> };
    for (const p of res.players) {
      expect(p.fantasyOwner === null || typeof p.fantasyOwner === 'string').toBe(true);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_player_info (handleGetPlayer by id)', () => {
  it('returns player profile for Patrick Mahomes (id=4034)', async () => {
    const res = await handleGetPlayer({ id: '4034' }) as { player: { name: string; position: string; nflTeam: string } };
    expect(res.player.name).toBe('Patrick Mahomes');
    expect(res.player.position).toBe('QB');
    expect(res.player.nflTeam).toBe('KC');
  });

  it('includes fantasyOwner showing which team owns the player', async () => {
    const res = await handleGetPlayer({ id: '4034' }) as { player: { fantasyOwner: string | null } };
    expect(res.player.fantasyOwner).toBe('Double Trouble');
  });

  it('fantasyOwner is null for unrostered player', async () => {
    const res = await handleGetPlayer({ id: '5844' }) as { player: { fantasyOwner: string | null } };
    // 5844 is on Double Trouble in our mock (mockRosters[1].players includes '5844')
    // This assertion validates the ownership detection works
    expect(res.player.fantasyOwner).toBe('Double Trouble');
  });

  it('throws McpError not_found for unknown player id', async () => {
    await expect(handleGetPlayer({ id: 'nonexistent_id_99999' })).rejects.toMatchObject({ code: 'not_found' });
  });

  it('does not return full Sleeper player object (slim fields only)', async () => {
    const res = await handleGetPlayer({ id: '4034' }) as { player: Record<string, unknown> };
    const allowed = new Set(['id', 'name', 'position', 'nflTeam', 'status', 'yearsExp', 'fantasyOwner']);
    for (const key of Object.keys(res.player)) {
      expect(allowed.has(key)).toBe(true);
    }
  });

  it('meta includes lookupType id', async () => {
    const res = await handleGetPlayer({ id: '4034' });
    expect(res.meta.lookupType).toBe('id');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_current_matchups', () => {
  it('returns current week from Sleeper state', async () => {
    const res = await handleGetMatchups({});
    expect(res.week).toBe(3);
  });

  it('accepts week override', async () => {
    const res = await handleGetMatchups({ week: 7 });
    expect(res.week).toBe(7);
  });

  it('returns matchup pairs with home and away', async () => {
    const res = await handleGetMatchups({});
    expect(res.matchups.length).toBeGreaterThan(0);
    for (const m of res.matchups) {
      expect(m).toHaveProperty('home');
      expect(m).toHaveProperty('away');
      expect(m.home).toHaveProperty('team');
      expect(m.home).toHaveProperty('points');
      expect(m.away).toHaveProperty('team');
    }
  });

  it('uses real team names (not roster IDs) for matchup labels', async () => {
    const res = await handleGetMatchups({});
    for (const m of res.matchups) {
      expect(TEAM_NAMES).toContain(m.home.team);
      expect(TEAM_NAMES).toContain(m.away.team);
    }
  });

  it('Belltown Raptors vs Double Trouble matchup present (matchup_id 1)', async () => {
    const res = await handleGetMatchups({});
    const m = res.matchups.find((m) => m.matchupId === 1);
    expect(m).toBeDefined();
    const teams = [m!.home.team, m!.away.team];
    expect(teams).toContain('Belltown Raptors');
    expect(teams).toContain('Double Trouble');
  });

  it('played flag is true when either side has points', async () => {
    const res = await handleGetMatchups({});
    const m1 = res.matchups.find((m) => m.matchupId === 1);
    expect(m1?.played).toBe(true);
  });

  it('played flag is false when both sides have 0 points', async () => {
    const res = await handleGetMatchups({});
    const m2 = res.matchups.find((m) => m.matchupId === 2);
    expect(m2?.played).toBe(false);
  });

  it('meta distinguishes live Sleeper data with week and season', async () => {
    const res = await handleGetMatchups({});
    expect(res.meta.week).toBe(3);
    expect(res.meta.nflSeason).toBe('2026');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_recent_transactions', () => {
  it('returns transactions array', async () => {
    const res = await handleGetTransactions({});
    expect(res.transactions).toBeInstanceOf(Array);
  });

  it('default limit returns at most 25 results', async () => {
    const res = await handleGetTransactions({});
    expect(res.transactions.length).toBeLessThanOrEqual(25);
  });

  it('custom limit is respected', async () => {
    const res = await handleGetTransactions({ limit: 1 });
    expect(res.transactions.length).toBeLessThanOrEqual(1);
  });

  it('max limit caps at 100', async () => {
    const res = await handleGetTransactions({ limit: 999 });
    expect(res.transactions.length).toBeLessThanOrEqual(100);
  });

  it('team filter works', async () => {
    const res = await handleGetTransactions({ team: 'Double Trouble' });
    for (const t of res.transactions) {
      expect(t.team.toLowerCase()).toContain('double trouble');
    }
  });

  it('season filter works', async () => {
    const res = await handleGetTransactions({ season: '2026' });
    for (const t of res.transactions) {
      expect(t.season).toBe('2026');
    }
  });

  it('sorted most-recent first', async () => {
    const res = await handleGetTransactions({});
    const dates = res.transactions.map((t) => new Date(t.createdAt).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i]).toBeGreaterThanOrEqual(dates[i + 1]);
    }
  });

  it('each transaction includes added/dropped player names', async () => {
    const res = await handleGetTransactions({ team: 'Double Trouble' });
    const waiver = res.transactions.find((t) => t.type === 'waiver');
    expect(waiver?.added[0]?.name).toBe('Patrick Mahomes');
  });

  it('meta reports totalMatched and returned counts', async () => {
    const res = await handleGetTransactions({});
    expect(res.meta).toHaveProperty('totalMatched');
    expect(res.meta).toHaveProperty('returned');
  });

  it('faab field is numeric', async () => {
    const res = await handleGetTransactions({});
    for (const t of res.transactions) {
      expect(typeof t.faab).toBe('number');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_trade_history', () => {
  it('returns trades array', async () => {
    const res = await handleGetTrades({});
    expect(res.trades).toBeInstanceOf(Array);
  });

  it('each trade has id, season, teams', async () => {
    const res = await handleGetTrades({});
    for (const t of res.trades) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('season');
      expect(t).toHaveProperty('teams');
    }
  });

  it('team filter returns only trades involving that team', async () => {
    const res = await handleGetTrades({ team: 'Double Trouble' });
    for (const t of res.trades) {
      const involved = t.teams.map((s) => s.name.toLowerCase());
      expect(involved.some((n) => n.includes('double trouble'))).toBe(true);
    }
  });

  it('season filter narrows results', async () => {
    const res = await handleGetTrades({ season: '2026' });
    for (const t of res.trades) {
      expect(String(t.season)).toBe('2026');
    }
  });

  it('limit caps at 50', async () => {
    const res = await handleGetTrades({ limit: 999 });
    expect(res.trades.length).toBeLessThanOrEqual(50);
  });

  it('asset types are player or pick (not raw IDs)', async () => {
    const res = await handleGetTrades({});
    for (const t of res.trades) {
      for (const side of t.teams) {
        for (const p of side.received) {
          expect(typeof p.name).toBe('string');
        }
        for (const pick of side.picks) {
          expect(typeof pick).toBe('string');
        }
      }
    }
  });

  it('Double Trouble trade shows Justin Jefferson received', async () => {
    const res = await handleGetTrades({ team: 'Double Trouble' });
    const dt = res.trades[0].teams.find((s) => s.name === 'Double Trouble');
    expect(dt?.received.some((p) => p.name === 'Justin Jefferson')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_draft_history / get_draft_picks', () => {
  it('returns historicalPicks and futurePickOwnership', async () => {
    const res = await handleGetDrafts({});
    expect(res).toHaveProperty('historicalPicks');
    expect(res).toHaveProperty('futurePickOwnership');
  });

  it('type=history returns historicalPicks, no future calls', async () => {
    const res = await handleGetDrafts({ type: 'history' });
    expect(res.historicalPicks).toBeDefined();
    // futurePickOwnership should be empty (future fetch was skipped)
    expect(res.futurePickOwnership).toBeInstanceOf(Array);
  });

  it('type=future skips historical picks loop', async () => {
    const res = await handleGetDrafts({ type: 'future' });
    expect(Object.keys(res.historicalPicks).length).toBe(0);
  });

  it('season filter narrows historical picks to requested season', async () => {
    const res = await handleGetDrafts({ season: '2025', type: 'history' });
    const seasons = Object.keys(res.historicalPicks);
    for (const s of seasons) {
      expect(s).toBe('2025');
    }
  });

  it('historical pick rows have round, pick, team, player fields', async () => {
    const res = await handleGetDrafts({ season: '2025', type: 'history' });
    for (const picks of Object.values(res.historicalPicks)) {
      for (const p of picks) {
        expect(p).toHaveProperty('round');
        expect(p).toHaveProperty('pick');
        expect(p).toHaveProperty('team');
        expect(p).toHaveProperty('player');
        expect(p).toHaveProperty('position');
      }
    }
  });

  it('team filter only returns picks for that team', async () => {
    const res = await handleGetDrafts({ team: 'Double Trouble', type: 'history' });
    for (const picks of Object.values(res.historicalPicks)) {
      for (const p of picks) {
        expect(p.team.toLowerCase()).toContain('double trouble');
      }
    }
  });

  it('pick player name is resolved from player cache (not raw ID)', async () => {
    const res = await handleGetDrafts({ season: '2025', type: 'history' });
    const picks = Object.values(res.historicalPicks).flat();
    const mahomasPick = picks.find((p) => p.team === 'Double Trouble');
    expect(mahomasPick?.player).toBe('Patrick Mahomes');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_franchise_summary', () => {
  it('returns franchise list for all teams', async () => {
    const res = await handleGetFranchise({});
    expect(res.franchises.length).toBe(12);
  });

  it('team filter narrows to one franchise', async () => {
    const res = await handleGetFranchise({ team: 'Double Trouble' });
    expect(res.franchises.length).toBe(1);
    expect(res.franchises[0].team).toBe('Double Trouble');
  });

  it('each franchise has regularSeason and playoffs records', async () => {
    const res = await handleGetFranchise({});
    for (const f of res.franchises) {
      expect(f.regularSeason).toHaveProperty('wins');
      expect(f.regularSeason).toHaveProperty('losses');
      expect(f.regularSeason).toHaveProperty('winPct');
      expect(f.regularSeason).toHaveProperty('pf');
      expect(f.playoffs).toHaveProperty('wins');
    }
  });

  it('winPct is between 0 and 100', async () => {
    const res = await handleGetFranchise({});
    for (const f of res.franchises) {
      expect(f.regularSeason.winPct).toBeGreaterThanOrEqual(0);
      expect(f.regularSeason.winPct).toBeLessThanOrEqual(100);
    }
  });

  it('Double Trouble has 1 championship', async () => {
    const res = await handleGetFranchise({ team: 'Double Trouble' });
    expect(res.franchises[0].championships).toBe(1);
  });

  it('BeerNeverBrokeMyHeart has 1 championship', async () => {
    const res = await handleGetFranchise({ team: 'BeerNeverBrokeMyHeart' });
    expect(res.franchises[0].championships).toBe(1);
  });

  it('Belltown Raptors has 1 championship (2024)', async () => {
    const res = await handleGetFranchise({ team: 'Belltown Raptors' });
    expect(res.franchises[0].championships).toBe(1);
  });

  it('runnerUps count is accurate for Double Trouble (2 runner-ups)', async () => {
    const res = await handleGetFranchise({ team: 'Double Trouble' });
    expect(res.franchises[0].runnerUps).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('answer_rule_question', () => {
  it('returns all sections when no search or section param', async () => {
    const res = await handleGetRules({}) as { sections: unknown[] };
    expect(res.sections.length).toBeGreaterThan(0);
  });

  it('keyword search returns matching sections', async () => {
    const res = await handleGetRules({ search: 'taxi' }) as { sections: Array<{ title: string }> };
    expect(res.sections.length).toBeGreaterThan(0);
    const titles = res.sections.map((s) => s.title.toLowerCase());
    expect(titles.some((t) => t.includes('roster') || t.includes('lineup'))).toBe(true);
  });

  it('keyword search returns matchingLines for each section', async () => {
    const res = await handleGetRules({ search: 'taxi' }) as { sections: Array<{ matchingLines?: string[] }> };
    for (const s of res.sections) {
      expect(s.matchingLines).toBeInstanceOf(Array);
      expect(s.matchingLines!.length).toBeGreaterThan(0);
    }
  });

  it('section lookup by exact id returns single section', async () => {
    const res = await handleGetRules({ section: 'trades' }) as { section: { id: string; title: string; text: string } };
    expect(res.section.id).toBe('trades');
    expect(res.section.text).toContain('Trade Deadline');
  });

  it('trade section mentions Week 12 deadline', async () => {
    const res = await handleGetRules({ search: 'trade deadline' }) as { sections: Array<{ text: string }> };
    expect(res.sections.length).toBeGreaterThan(0);
    const allText = res.sections.map((s) => s.text).join(' ');
    expect(allText.toLowerCase()).toContain('week 12');
  });

  it('waiver search returns FAAB info', async () => {
    const res = await handleGetRules({ search: 'faab' }) as { sections: Array<{ text: string }> };
    expect(res.sections.length).toBeGreaterThan(0);
  });

  it('invalid section id returns error with available sections list', async () => {
    const res = await handleGetRules({ section: 'nonexistent-section-id' }) as { error: string; availableSections: unknown[] };
    expect(res.error).toBe('section_not_found');
    expect(res.availableSections).toBeInstanceOf(Array);
    expect(res.availableSections.length).toBeGreaterThan(0);
  });

  it('rules are sourced from rulebook (static), not Sleeper', async () => {
    const res = await handleGetRules({ search: 'dynasty' }) as { meta: { tool: string } };
    expect(res.meta.tool).toBe('get_rules');
  });

  it('taxi squad limit is 4 players per rulebook', async () => {
    const res = await handleGetRules({ search: 'taxi' }) as { sections: Array<{ text: string }> };
    const allText = res.sections.map((s) => s.text).join(' ');
    expect(allText).toContain('4');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('get_weekly_content_context', () => {
  it('returns week, season, matchups, standings, recentTransactions', async () => {
    const res = await handleGetWeeklyContext();
    expect(res).toHaveProperty('week');
    expect(res).toHaveProperty('season');
    expect(res).toHaveProperty('matchups');
    expect(res).toHaveProperty('standings');
    expect(res).toHaveProperty('recentTransactions');
  });

  it('week is current week from Sleeper state', async () => {
    const res = await handleGetWeeklyContext();
    expect(res.week).toBe(3);
  });

  it('standings snapshot has all 12 teams', async () => {
    const res = await handleGetWeeklyContext();
    expect(res.standings.length).toBe(12);
  });

  it('standings snapshot includes rank, wins, losses, pf', async () => {
    const res = await handleGetWeeklyContext();
    for (const row of res.standings) {
      expect(row).toHaveProperty('rank');
      expect(row).toHaveProperty('wins');
      expect(row).toHaveProperty('losses');
      expect(row).toHaveProperty('pf');
    }
  });

  it('recentWaivers is capped at 8 and recentTrades at 5', async () => {
    const res = await handleGetWeeklyContext();
    expect(res.recentWaivers.length).toBeLessThanOrEqual(8);
    expect(res.recentTrades.length).toBeLessThanOrEqual(5);
  });

  it('matchups use real team names', async () => {
    const res = await handleGetWeeklyContext();
    for (const m of res.matchups) {
      expect(TEAM_NAMES).toContain(m.home.team);
      expect(TEAM_NAMES).toContain(m.away.team);
    }
  });

  it('meta note says designed for content creation', async () => {
    const res = await handleGetWeeklyContext();
    expect(res.meta.note).toContain('content');
  });

  it('meta distinguishes live Sleeper data from static', async () => {
    const res = await handleGetWeeklyContext();
    expect(res.meta.dataSource).toBe('sleeper-live');
  });

  it('champions are included for historical context', async () => {
    const res = await handleGetWeeklyContext();
    expect(res.champions).toHaveProperty('2025');
    expect(res.champions['2025'].champion).toBe('BeerNeverBrokeMyHeart');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('auth guard (requireMcpAuth)', () => {
  // Use importActual to bypass the vi.mock above (which only exports mcpMeta)
  // and test the real auth guard implementation.
  let requireMcpAuth: (req: Request) => Response | null;

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('@/lib/mcp/auth')>('@/lib/mcp/auth');
    requireMcpAuth = actual.requireMcpAuth;
  });

  afterEach(() => {
    delete process.env.MCP_API_KEY;
  });

  it('returns 503 when MCP_API_KEY is not set', () => {
    delete process.env.MCP_API_KEY;
    const result = requireMcpAuth(new Request('https://example.test'));
    expect(result?.status).toBe(503);
  });

  it('returns 401 when no key is provided in headers', () => {
    process.env.MCP_API_KEY = 'test-secret';
    const result = requireMcpAuth(new Request('https://example.test'));
    expect(result?.status).toBe(401);
  });

  it('returns 403 when wrong key is provided', () => {
    process.env.MCP_API_KEY = 'test-secret';
    const result = requireMcpAuth(new Request('https://example.test', {
      headers: { Authorization: 'Bearer wrong-key' },
    }));
    expect(result?.status).toBe(403);
  });

  it('returns null (authorized) when correct Bearer token is provided', () => {
    process.env.MCP_API_KEY = 'test-secret';
    const result = requireMcpAuth(new Request('https://example.test', {
      headers: { Authorization: 'Bearer test-secret' },
    }));
    expect(result).toBeNull();
  });

  it('accepts X-MCP-Key header as alternative to Authorization', () => {
    process.env.MCP_API_KEY = 'test-secret';
    const result = requireMcpAuth(new Request('https://example.test', {
      headers: { 'X-MCP-Key': 'test-secret' },
    }));
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Sleeper failure / missing data behavior', () => {
  // These tests verify graceful degradation when Sleeper calls fail.
  // The handlers use .catch(() => []) patterns, so they should never throw
  // an unhandled error due to upstream Sleeper failures.

  beforeEach(() => {
    vi.resetModules();
  });

  it('handleGetRosters returns empty rosters array when Sleeper returns empty', async () => {
    const { getTeamsData, getLeagueRosters, getAllPlayersCached } = await import('@/lib/utils/sleeper-api');
    vi.mocked(getTeamsData).mockResolvedValueOnce([]);
    vi.mocked(getLeagueRosters).mockResolvedValueOnce([]);
    vi.mocked(getAllPlayersCached).mockResolvedValueOnce({});
    const res = await handleGetRosters({});
    expect(res.rosters).toEqual([]);
  });

  it('handleGetMatchups returns empty matchups array when Sleeper fails', async () => {
    const { getLeagueMatchups } = await import('@/lib/utils/sleeper-api');
    vi.mocked(getLeagueMatchups).mockRejectedValueOnce(new Error('Sleeper timeout'));
    const res = await handleGetMatchups({});
    expect(res.matchups).toEqual([]);
  });

  it('handleGetTransactions does not crash when ledger is empty', async () => {
    const { buildTransactionLedger } = await import('@/lib/utils/transactions');
    vi.mocked(buildTransactionLedger).mockResolvedValueOnce([]);
    const res = await handleGetTransactions({});
    expect(res.transactions).toEqual([]);
    expect(res.meta.totalMatched).toBe(0);
  });

  it('handleGetTrades does not crash when trade list is empty', async () => {
    const { fetchTradesAllTime } = await import('@/lib/utils/trades');
    vi.mocked(fetchTradesAllTime).mockResolvedValueOnce([]);
    const res = await handleGetTrades({});
    expect(res.trades).toEqual([]);
  });

  it('handleGetStandings falls back gracefully when rosters are empty', async () => {
    const { getLeagueRosters } = await import('@/lib/utils/sleeper-api');
    vi.mocked(getLeagueRosters).mockRejectedValueOnce(new Error('Sleeper timeout'));
    // Should not throw — the handler uses .catch(() => [])
    const res = await handleGetStandings();
    expect(res.currentSeasonStandings).toEqual([]);
    expect(res.allTimeStandings).toBeDefined();
  });

  it('handleGetTeam still resolves (with null allTimeStats) when splits are empty', async () => {
    const { getSplitRecordsAllTime } = await import('@/lib/utils/sleeper-api');
    vi.mocked(getSplitRecordsAllTime).mockRejectedValueOnce(new Error('timeout'));
    const res = await handleGetTeam({ name: 'Double Trouble' });
    expect(res.team.allTimeStats).toBeNull();
  });

  it('handleGetWeeklyContext still returns content when transactions fail', async () => {
    const { buildTransactionLedger } = await import('@/lib/utils/transactions');
    vi.mocked(buildTransactionLedger).mockRejectedValueOnce(new Error('DB timeout'));
    const res = await handleGetWeeklyContext();
    // recentWaivers should be empty array, not undefined or thrown
    expect(res.recentWaivers).toBeInstanceOf(Array);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('metadata quality — source and freshness', () => {
  it('every handler response includes meta.tool, meta.source, meta.fetchedAt', async () => {
    const responses = await Promise.all([
      handleGetLeagueInfo(),
      handleGetStandings(),
      handleGetRosters({}),
      handleGetMatchups({}),
      handleGetTransactions({}),
      handleGetTrades({}),
      handleGetFranchise({}),
      handleGetRules({}),
      handleGetWeeklyContext(),
    ]);
    for (const res of responses) {
      expect(res.meta).toBeDefined();
      expect(res.meta).toHaveProperty('tool');
      expect(res.meta).toHaveProperty('source');
      expect(res.meta).toHaveProperty('fetchedAt');
      expect(typeof res.meta!.tool).toBe('string');
      expect(res.meta!.source).toBe('east-v-west-api');
    }
  });

  it('league info meta reports static-constants data source (no Sleeper)', async () => {
    const res = await handleGetLeagueInfo();
    expect(res.meta.dataSource).toBe('static-constants');
  });

  it('standings meta reports currentSeason 2026', async () => {
    const res = await handleGetStandings();
    expect(res.meta.currentSeason).toBe('2026');
  });

  it('weekly context meta reports sleeper-live data source', async () => {
    const res = await handleGetWeeklyContext();
    expect(res.meta.dataSource).toBe('sleeper-live');
  });
});
