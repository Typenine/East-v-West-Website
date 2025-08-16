import { LEAGUE_IDS } from '@/lib/constants/league';
import { SleeperTransaction, SleeperDraftPick, getLeagueTrades, getLeagueRosters, getAllPlayers, getRosterIdToTeamNameMap, getLeagueDrafts, getDraftById, getDraftPicks } from '@/lib/utils/sleeper-api';

// Define trade types
export type TradeAsset = {
  type: 'player' | 'pick';
  name: string;
  position?: string;
  team?: string;
  year?: string;
  round?: number;
  value?: number; // For trade value analysis
  // Pick lineage (only for type === 'pick')
  originalOwner?: string; // Canonical team name of original owner of the pick
  became?: string; // Player name the pick turned into (if drafted)
};

export type TradeTeam = {
  name: string;
  assets: TradeAsset[];
  totalValue?: number;
};

export type Trade = {
  id: string;
  date: string;
  teams: TradeTeam[];
  status: 'completed' | 'pending' | 'vetoed';
  notes?: string;
  relatedTrades?: string[]; // IDs of related trades for trade trees
};

export type TradeTreeNode = {
  tradeId: string;
  date: string;
  teams: string[];
  children: TradeTreeNode[];
};

// Cache for player data to avoid repeated API calls
// Using any here is acceptable since we're caching Sleeper API player data with unknown structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let playersCache: Record<string, any> | null = null;

// Cache draft context per league-season to avoid repeated Sleeper API calls
type DraftContext = {
  draftId: string;
  draftOrder: Map<number, number>; // roster_id -> draft slot
  picks: SleeperDraftPick[];
};
const draftContextCache: Map<string, Map<string, DraftContext>> = new Map(); // leagueId -> season -> ctx

function getLeagueIdForSeason(season: string): string | null {
  if (season === '2025') return LEAGUE_IDS.CURRENT;
  const prev = LEAGUE_IDS.PREVIOUS[season as keyof typeof LEAGUE_IDS.PREVIOUS];
  return prev || null;
}

async function getDraftContext(leagueId: string, season: string): Promise<DraftContext | null> {
  try {
    // Check cache
    const bySeason = draftContextCache.get(leagueId) || new Map<string, DraftContext>();
    if (bySeason.has(season)) return bySeason.get(season)!;

    // Find draft for the season
    const drafts = await getLeagueDrafts(leagueId);
    const draft = drafts.find((d) => d.season === season);
    if (!draft) return null;

    // Get draft details (order) and picks
    const [draftDetails, picks] = await Promise.all([
      getDraftById(draft.draft_id),
      getDraftPicks(draft.draft_id)
    ]);
    const orderObj = draftDetails.draft_order || {};
    const order = new Map<number, number>();
    for (const [key, val] of Object.entries(orderObj)) {
      const rid = Number(key);
      const slot = Number(val);
      if (Number.isFinite(rid) && Number.isFinite(slot)) order.set(rid, slot);
    }

    const ctx: DraftContext = { draftId: draft.draft_id, draftOrder: order, picks };
    bySeason.set(season, ctx);
    draftContextCache.set(leagueId, bySeason);
    return ctx;
  } catch (e) {
    console.error('Failed to build draft context:', e);
    return null;
  }
}

async function resolvePickBecame(season: string, round: number, originalRosterId: number): Promise<string | undefined> {
  const seasonLeagueId = getLeagueIdForSeason(season);
  if (!seasonLeagueId) return undefined;
  const ctx = await getDraftContext(seasonLeagueId, season);
  if (!ctx) return undefined;
  const slot = ctx.draftOrder.get(originalRosterId);
  if (!slot) return undefined;
  const dp = ctx.picks.find((p) => Number(p.round) === Number(round) && Number(p.draft_slot) === Number(slot));
  if (!dp || !dp.player_id) return undefined;
  if (!playersCache) playersCache = await getAllPlayers();
  const pl = playersCache[dp.player_id];
  if (!pl) return undefined;
  return `${pl.first_name} ${pl.last_name}`.trim();
}

// Convert Sleeper transaction to our Trade format
async function convertSleeperTradeToTrade(transaction: SleeperTransaction, leagueId: string): Promise<Trade> {
  // Build rosterId -> canonical team name map for the league
  const rosterIdToTeam = await getRosterIdToTeamNameMap(leagueId);
  const rosters = await getLeagueRosters(leagueId);
  const rosterMap = new Map(rosters.map(r => [r.roster_id, r]));
  
  // Resolve canonical names in transaction order
  const teamNames = transaction.roster_ids.map((rosterId) => {
    const name = rosterIdToTeam.get(rosterId);
    if (name) return name;
    // Fallback to roster metadata team name if available
    const roster = rosterMap.get(rosterId);
    const metaName = roster?.metadata?.team_name;
    return metaName ? metaName : `Roster ${rosterId}`;
  });
  
  // Fetch players data if not already cached
  if (!playersCache) {
    playersCache = await getAllPlayers();
  }
  
  // Create trade teams
  const tradeTeams: TradeTeam[] = [];
  
  // Process each roster involved in the trade
  for (let i = 0; i < transaction.roster_ids.length; i++) {
    const rosterId = transaction.roster_ids[i];
    const teamName = teamNames[i];
    const assets: TradeAsset[] = [];
    
    // Process player adds (players received by this team)
    if (transaction.adds) {
      Object.entries(transaction.adds).forEach(([playerId, receivingRosterId]) => {
        if (receivingRosterId === rosterId) {
          const player = playersCache?.[playerId];
          if (player) {
            assets.push({
              type: 'player',
              name: `${player.first_name} ${player.last_name}`,
              position: player.position,
              team: player.team || 'FA'
            });
          }
        }
      });
    }
    
    // Process draft picks received by this team
    if (transaction.draft_picks) {
      const picksReceived = transaction.draft_picks
        .filter(pick => pick.owner_id === rosterId && pick.previous_owner_id !== rosterId);
      for (const pick of picksReceived) {
        const originalOwnerName = rosterIdToTeam.get(pick.roster_id) || (rosterMap.get(pick.roster_id)?.metadata?.team_name ?? `Roster ${pick.roster_id}`);
        let became: string | undefined = undefined;
        try {
          became = await resolvePickBecame(pick.season, pick.round, pick.roster_id);
        } catch {
          // Non-fatal
        }
        assets.push({
          type: 'pick',
          name: `${pick.season} ${getOrdinal(pick.round)} Round Pick`,
          year: pick.season,
          round: pick.round,
          originalOwner: originalOwnerName,
          became,
        });
      }
    }
    
    // Add FAAB if applicable
    if (transaction.waiver_budget) {
      transaction.waiver_budget
        .filter(budget => budget.receiver === rosterId)
        .forEach(budget => {
          assets.push({
            type: 'pick',
            name: `$${budget.amount} FAAB`
          });
        });
    }
    
    tradeTeams.push({
      name: teamName,
      assets
    });
  }
  
  // Create the trade object
  return {
    id: transaction.transaction_id,
    date: new Date(transaction.created).toISOString().split('T')[0],
    teams: tradeTeams,
    status: transaction.status as 'completed' | 'pending' | 'vetoed',
    relatedTrades: [] // We'll populate this later if needed
  };
}

// Helper function to get ordinal suffix
function getOrdinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Cache for converted trades
const tradesCache: Record<string, Trade> = {};

/* Sample trades removed - replaced with real Sleeper API data */
/*
  'trade-001': {
    id: 'trade-001',
    date: '2025-07-10',
    teams: [
      {
        name: TEAM_NAMES[0], // Belltown Raptors
        assets: [
          { type: 'player', name: 'Justin Jefferson', position: 'WR', team: 'MIN', value: 95 },
          { type: 'pick', name: '2026 2nd Round Pick', year: '2026', round: 2, value: 15 }
        ],
        totalValue: 110
      },
      {
        name: TEAM_NAMES[1], // Double Trouble
        assets: [
          { type: 'player', name: 'Ja\'Marr Chase', position: 'WR', team: 'CIN', value: 92 },
          { type: 'pick', name: '2026 3rd Round Pick', year: '2026', round: 3, value: 10 }
        ],
        totalValue: 102
      }
    ],
    status: 'completed',
    notes: 'A blockbuster WR swap between two contending teams. Both Jefferson and Chase are considered elite dynasty assets, with Jefferson having a slight edge in value due to his consistent production.',
    relatedTrades: ['trade-004']
  },
  'trade-002': {
    id: 'trade-002',
    date: '2025-06-22',
    teams: [
      {
        name: 'Kittle Me This',
        assets: [
          { type: 'player', name: 'Travis Kelce', position: 'TE', team: 'KC', value: 40 },
          { type: 'player', name: 'Rachaad White', position: 'RB', team: 'TB', value: 25 }
        ],
        totalValue: 65
      },
      {
        name: TEAM_NAMES[3], // Mt. Lebanon Cake Eaters
        assets: [
          { type: 'player', name: 'George Kittle', position: 'TE', team: 'SF', value: 35 },
          { type: 'player', name: 'Javonte Williams', position: 'RB', team: 'DEN', value: 20 },
          { type: 'pick', name: '2026 1st Round Pick', year: '2026', round: 1, value: 25 }
        ],
        totalValue: 80
      }
    ],
    status: 'completed',
    notes: 'Kittle Me This is making a win-now move with Kelce, while Waddle Waddle gets younger at TE and adds future draft capital.',
    relatedTrades: []
  },
  'trade-003': {
    id: 'trade-003',
    date: '2025-05-15',
    teams: [
      {
        name: TEAM_NAMES[4], // Belleview Badgers
        assets: [
          { type: 'player', name: 'Nick Chubb', position: 'RB', team: 'CLE', value: 35 },
          { type: 'pick', name: '2026 4th Round Pick', year: '2026', round: 4, value: 5 }
        ],
        totalValue: 40
      },
      {
        name: 'Lamb Chops',
        assets: [
          { type: 'player', name: 'Tony Pollard', position: 'RB', team: 'DAL', value: 30 },
          { type: 'pick', name: '2026 2nd Round Pick', year: '2026', round: 2, value: 15 }
        ],
        totalValue: 45
      }
    ],
    status: 'completed',
    notes: 'A running back swap with Chubb Thumpers getting the more established but older RB in Chubb, while Lamb Chops gets a younger option plus draft capital.',
    relatedTrades: ['trade-007']
  },
  'trade-004': {
    id: 'trade-004',
    date: '2024-11-10',
    teams: [
      {
        name: TEAM_NAMES[6], // Detroit Dawgs
        assets: [
          { type: 'player', name: 'Joe Mixon', position: 'RB', team: 'CIN', value: 28 }
        ],
        totalValue: 28
      },
      {
        name: 'Najee By Nature',
        assets: [
          { type: 'player', name: 'Najee Harris', position: 'RB', team: 'PIT', value: 25 },
          { type: 'pick', name: '2025 3rd Round Pick', year: '2025', round: 3, value: 10 }
        ],
        totalValue: 35
      }
    ],
    status: 'completed',
    notes: 'A mid-season RB swap with Mixon It Up getting the more productive back for a playoff push.',
    relatedTrades: ['trade-001', 'trade-008']
  },
  'trade-005': {
    id: 'trade-005',
    date: '2024-10-28',
    teams: [
      {
        name: TEAM_NAMES[8], // Minshew's Maniacs
        assets: [
          { type: 'player', name: 'Jalen Hurts', position: 'QB', team: 'PHI', value: 75 },
          { type: 'pick', name: '2025 2nd Round Pick', year: '2025', round: 2, value: 15 }
        ],
        totalValue: 90
      },
      {
        name: TEAM_NAMES[9], // Red Pandas
        assets: [
          { type: 'player', name: 'Patrick Mahomes', position: 'QB', team: 'KC', value: 85 }
        ],
        totalValue: 85
      }
    ],
    status: 'completed',
    notes: 'A swap of elite QBs with Chase-ing Wins getting the slightly more valuable Mahomes, while Hurts So Good gets Hurts plus draft capital.',
    relatedTrades: []
  },
  'trade-006': {
    id: 'trade-006',
    date: '2024-09-15',
    teams: [
      {
        name: TEAM_NAMES[10], // The Lone Ginger
        assets: [
          { type: 'player', name: 'Justin Herbert', position: 'QB', team: 'LAC', value: 70 },
          { type: 'player', name: 'Mike Williams', position: 'WR', team: 'LAC', value: 15 }
        ],
        totalValue: 85
      },
      {
        name: TEAM_NAMES[11], // Maholmes and Watson
        assets: [
          { type: 'player', name: 'Kyle Pitts', position: 'TE', team: 'ATL', value: 30 },
          { type: 'player', name: 'Tua Tagovailoa', position: 'QB', team: 'MIA', value: 40 },
          { type: 'pick', name: '2025 1st Round Pick', year: '2025', round: 1, value: 25 }
        ],
        totalValue: 95
      }
    ],
    status: 'completed',
    notes: 'Herbert the Pervert consolidates value at QB, while Pitts and Giggles gets a high-upside TE, a serviceable QB, and valuable draft capital.',
    relatedTrades: []
  },
  'trade-007': {
    id: 'trade-007',
    date: '2024-08-20',
    teams: [
      {
        name: TEAM_NAMES[5], // BeerNeverBrokeMyHeart
        assets: [
          { type: 'player', name: 'Nick Chubb', position: 'RB', team: 'CLE', value: 35 }
        ],
        totalValue: 35
      },
      {
        name: TEAM_NAMES[10], // The Lone Ginger
        assets: [
          { type: 'player', name: 'Austin Ekeler', position: 'RB', team: 'LAC', value: 25 },
          { type: 'pick', name: '2025 3rd Round Pick', year: '2025', round: 3, value: 10 }
        ],
        totalValue: 35
      }
    ],
    status: 'completed',
    notes: 'Lamb Chops acquires Nick Chubb shortly after trading for him, flipping him for Ekeler and a pick.',
    relatedTrades: ['trade-003']
  },
  'trade-008': {
    id: 'trade-008',
    date: '2024-07-15',
    teams: [
      {
        name: TEAM_NAMES[7], // bop pop
        assets: [
          { type: 'player', name: 'Joe Mixon', position: 'RB', team: 'CIN', value: 28 },
          { type: 'pick', name: '2025 4th Round Pick', year: '2025', round: 4, value: 5 }
        ],
        totalValue: 33
      },
      {
        name: TEAM_NAMES[2], // Elemental Heroes
        assets: [
          { type: 'player', name: 'Jonathan Taylor', position: 'RB', team: 'IND', value: 45 }
        ],
        totalValue: 45
      }
    ],
    status: 'completed',
    notes: 'Najee By Nature acquires Mixon before flipping him to Mixon It Up later in the season.',
    relatedTrades: ['trade-004']
  }
};

/**
 * Fetch trades for a specific year
 * @param year The year to filter trades by
 * @returns Array of trades for the specified year
 */
export const fetchTradesByYear = async (year: string): Promise<Trade[]> => {
  try {
    // Map the provided year to the correct league ID
    const leagueId = year === '2025'
      ? LEAGUE_IDS.CURRENT
      : LEAGUE_IDS.PREVIOUS[year as keyof typeof LEAGUE_IDS.PREVIOUS];
    if (!leagueId) {
      console.error(`No league ID found for year ${year}`);
      return [];
    }
    
    // Fetch trades from Sleeper API
    const sleeperTrades = await getLeagueTrades(leagueId);
    
    // Convert Sleeper trades to our format
    const trades: Trade[] = [];
    
    for (const transaction of sleeperTrades) {
      // Skip if we've already processed this trade
      if (tradesCache[transaction.transaction_id]) {
        trades.push(tradesCache[transaction.transaction_id]);
        continue;
      }
      
      // Convert and cache the trade
      const trade = await convertSleeperTradeToTrade(transaction, leagueId);
      tradesCache[transaction.transaction_id] = trade;
      trades.push(trade);
    }
    
    return trades;
  } catch (error) {
    console.error('Error fetching trades by year:', error);
    return [];
  }
};

/**
 * Fetch a specific trade by ID
 * @param id The trade ID to fetch
 * @returns The trade object or null if not found
 */
export const fetchTradeById = async (id: string): Promise<Trade | null> => {
  try {
    // Check if the trade is already in the cache
    if (tradesCache[id]) {
      return tradesCache[id];
    }
    
    // If not in cache, we need to fetch all trades and find it
    // This is inefficient but necessary since we don't know which league the trade belongs to
    const yearToLeague: Record<string, string> = {
      '2025': LEAGUE_IDS.CURRENT,
      ...LEAGUE_IDS.PREVIOUS,
    } as const;

    for (const leagueId of Object.values(yearToLeague)) {
      const sleeperTrades = await getLeagueTrades(leagueId);
      const transaction = sleeperTrades.find(t => t.transaction_id === id);
      if (transaction) {
        const trade = await convertSleeperTradeToTrade(transaction, leagueId);
        tradesCache[id] = trade;
        return trade;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching trade by ID:', error);
    return null;
  }
};

/**
 * Build trade trees from real trade data
 * @returns Array of trade tree nodes
 */
export const buildTradeTrees = async (): Promise<TradeTreeNode[]> => {
  try {
    // Fetch all trades from all years
    const allTrades: Trade[] = [];
    
    for (const [yearKey, leagueId] of Object.entries(LEAGUE_IDS)) {
      if (typeof leagueId === 'string') {
        // Fetch trades for this year
        const yearTrades = await fetchTradesByYear(yearKey);
        allTrades.push(...yearTrades);
      }
    }
    
    // For now, we don't have related trades information from the Sleeper API
    // So we'll return an empty array until we implement a way to determine related trades
    return [];
    
    // In a real implementation, we would analyze the trades to find related ones
    // For example, trades involving the same draft picks or players within a short time period
  } catch (error) {
    console.error('Error building trade trees:', error);
    return [];
  }
};

/**
 * Get related trades for a specific trade
 * @param tradeId The trade ID to get related trades for
 * @returns Array of related trade objects
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const getRelatedTrades = async (_tradeId: string): Promise<Trade[]> => {
  // Parameter is prefixed with underscore to indicate it's intentionally unused
  try {
    // For now, we don't have related trades information from the Sleeper API
    // In a real implementation, we would analyze the trades to find related ones
    return [];
  } catch (error) {
    console.error('Error getting related trades:', error);
    return [];
  }
};
