/**
 * Derive Module
 * Transforms raw Sleeper data into matchup pairs, upcoming pairs, and scored events
 * Now includes player name resolution for better readability
 */

import type {
  MatchupPair,
  UpcomingPair,
  ScoredEvent,
  DerivedData,
  RelevanceConfig,
} from './types';
import { RELEVANCE_CONFIG } from './config';

// Player name cache - populated lazily
let playerNameCache: Record<string, string> | null = null;

/**
 * Set the player name cache for resolving player IDs to names
 * Should be called with data from getAllPlayersCached before buildDerived
 */
export function setPlayerNameCache(players: Record<string, { full_name?: string; first_name?: string; last_name?: string }>) {
  playerNameCache = {};
  for (const [id, player] of Object.entries(players)) {
    playerNameCache[id] = player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim() || `Player ${id}`;
  }
}

/**
 * Resolve a player ID to a name
 */
export function resolvePlayerName(playerId: string): string {
  if (!playerNameCache) return playerId;
  return playerNameCache[playerId] || playerId;
}

// ============ Helper Functions ============

interface SleeperUser {
  user_id: string;
  display_name?: string;
  username?: string;
  metadata?: { team_name?: string };
}

interface SleeperRoster {
  roster_id: number;
  owner_id: string;
  players?: string[];
}

interface SleeperMatchup {
  roster_id: number;
  matchup_id: number | null;
  points?: number;
  starters?: string[];
  players?: string[];
  players_points?: Record<string, number>;
}

interface SleeperTransaction {
  transaction_id?: string;
  type: 'trade' | 'waiver' | 'free_agent';
  leg?: number;
  roster_ids?: number[];
  roster_id?: number;
  adds?: Record<string, number>;
  drops?: Record<string, number>;
  draft_picks?: unknown[];
  waiver_bid?: number;
}

function mapUsersById(users: SleeperUser[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of users) {
    const teamName = (u?.metadata?.team_name || '').trim();
    const best = teamName || u.display_name || u.username || `User ${u.user_id}`;
    map.set(u.user_id, best);
  }
  return map;
}

function mapRosters(
  rosters: SleeperRoster[],
  usersById: Map<string, string>
): Map<number, { owner_id: string; owner_name: string }> {
  const map = new Map<number, { owner_id: string; owner_name: string }>();
  for (const r of rosters) {
    const owner = usersById.get(r.owner_id) || `Owner ${r.owner_id}`;
    map.set(r.roster_id, { owner_id: r.owner_id, owner_name: owner });
  }
  return map;
}

// ============ Matchup Pairs ============

/**
 * Get bracket label for a playoff matchup based on matchup_id and week
 * Sleeper playoff bracket structure (6-team playoffs, 2 byes):
 * - Week 15 (Round 1): matchup_id 1-2 are winners bracket first round, 3-6 are losers bracket
 * - Week 16 (Round 2): matchup_id 1-2 are winners bracket semifinals, 3-6 are consolation
 * - Week 17 (Round 3): matchup_id 1 is Championship, 2 is 3rd place, 3-6 are lower consolation
 */
/**
 * Extract top scoring players from a matchup
 */
function extractTopPlayers(matchup: SleeperMatchup | undefined, count: number = 3): Array<{ name: string; points: number }> {
  try {
    if (!matchup?.players_points || !matchup?.starters) return [];

    // Get points for starters only (not bench players)
    const starterPoints: Array<{ playerId: string; points: number }> = [];
    for (const playerId of matchup.starters) {
      if (playerId && matchup.players_points[playerId] !== undefined) {
        const pts = Number(matchup.players_points[playerId] ?? 0);
        if (!Number.isFinite(pts)) continue;
        starterPoints.push({ playerId, points: pts });
      }
    }

    // Sort by points descending and take top N
    starterPoints.sort((a, b) => b.points - a.points);

    return starterPoints.slice(0, count).map(p => ({
      name: resolvePlayerName(p.playerId),
      points: Number(p.points.toFixed(1)),
    }));
  } catch (err) {
    console.warn('[Derive] extractTopPlayers failed for a matchup; returning empty list:', err);
    return [];
  }
}

function getPlayoffBracketLabel(matchupId: string | number, week: number, playoffStartWeek: number = 15): string | undefined {
  if (week < playoffStartWeek) return undefined;
  
  const playoffRound = week - playoffStartWeek + 1; // 1, 2, or 3
  const mid = typeof matchupId === 'string' ? parseInt(matchupId, 10) : matchupId;
  
  if (isNaN(mid)) return undefined;
  
  // Championship week (typically week 17, round 3)
  if (playoffRound === 3) {
    switch (mid) {
      case 1: return '🏆 Championship';
      case 2: return '🥉 3rd Place Game';
      case 3: return '5th Place Game';
      case 4: return '7th Place Game';
      case 5: return '9th Place Game';
      case 6: return '🚽 Toilet Bowl';
      default: return `Consolation ${mid}`;
    }
  }
  
  // Semifinals week (typically week 16, round 2)
  if (playoffRound === 2) {
    switch (mid) {
      case 1: return 'Semifinal 1';
      case 2: return 'Semifinal 2';
      case 3: return '5th Place Semifinal';
      case 4: return '7th Place Semifinal';
      case 5: return '9th Place Semifinal';
      case 6: return 'Toilet Bowl Semifinal';
      default: return `Round 2 Matchup ${mid}`;
    }
  }
  
  // First round (typically week 15, round 1)
  if (playoffRound === 1) {
    switch (mid) {
      case 1: return 'Quarterfinal 1';
      case 2: return 'Quarterfinal 2';
      case 3: return 'Consolation Round 1';
      case 4: return 'Consolation Round 1';
      case 5: return 'Consolation Round 1';
      case 6: return 'Consolation Round 1';
      default: return `Round 1 Matchup ${mid}`;
    }
  }
  
  return undefined;
}

function buildMatchupPairs(
  matchups: SleeperMatchup[],
  rostersIndex: Map<number, { owner_id: string; owner_name: string }>,
  week?: number,
  playoffStartWeek?: number
): MatchupPair[] {
  // Build a map of roster_id -> matchup data for player extraction
  const matchupByRoster = new Map<number, SleeperMatchup>();
  for (const m of matchups) {
    matchupByRoster.set(m.roster_id, m);
  }

  const groups = new Map<string | number, Array<{ owner_name: string; points: number; roster_id: number }>>();
  
  for (const m of matchups) {
    const k = m.matchup_id ?? 'unknown';
    if (!groups.has(k)) groups.set(k, []);
    const owner_name = rostersIndex.get(m.roster_id)?.owner_name || `Roster ${m.roster_id}`;
    groups.get(k)!.push({ owner_name, points: Number(m.points ?? 0), roster_id: m.roster_id });
  }

  const pairs: MatchupPair[] = [];
  for (const [mid, entries] of Array.from(groups.entries())) {
    if (!entries.length) continue;
    const sorted = [...entries].sort((a, b) => b.points - a.points);
    const winner = sorted[0];
    const loser = sorted[sorted.length - 1];
    const margin = Number((winner.points - loser.points).toFixed(2));
    
    // Get bracket label for playoff weeks
    const bracketLabel = week && playoffStartWeek 
      ? getPlayoffBracketLabel(mid, week, playoffStartWeek)
      : undefined;

    // Extract top players for winner and loser
    const winnerMatchup = matchupByRoster.get(winner.roster_id);
    const loserMatchup = matchupByRoster.get(loser.roster_id);
    
    const winnerTopPlayers = extractTopPlayers(winnerMatchup, 3);
    const loserTopPlayers = extractTopPlayers(loserMatchup, 3);
    
    pairs.push({
      matchup_id: mid,
      teams: entries.map(e => ({ name: e.owner_name, points: e.points })),
      winner: { name: winner.owner_name, points: winner.points, topPlayers: winnerTopPlayers },
      loser: { name: loser.owner_name, points: loser.points, topPlayers: loserTopPlayers },
      margin,
      bracketLabel,
    });
  }
  
  // Sort: Championship first, then by bracket importance, then by margin
  return pairs.sort((a, b) => {
    // Championship always first
    if (a.bracketLabel?.includes('Championship')) return -1;
    if (b.bracketLabel?.includes('Championship')) return 1;
    // 3rd place second
    if (a.bracketLabel?.includes('3rd Place')) return -1;
    if (b.bracketLabel?.includes('3rd Place')) return 1;
    // Toilet Bowl last among labeled games
    if (a.bracketLabel?.includes('Toilet Bowl') && !b.bracketLabel?.includes('Toilet Bowl')) return 1;
    if (b.bracketLabel?.includes('Toilet Bowl') && !a.bracketLabel?.includes('Toilet Bowl')) return -1;
    // Otherwise sort by margin
    return b.margin - a.margin;
  });
}

function buildUpcomingPairs(
  nextMatchups: SleeperMatchup[] | undefined,
  rostersIndex: Map<number, { owner_id: string; owner_name: string }>
): UpcomingPair[] {
  const groups = new Map<string | number, string[]>();
  
  for (const m of nextMatchups || []) {
    const k = m.matchup_id ?? 'unknown';
    if (!groups.has(k)) groups.set(k, []);
    const owner_name = rostersIndex.get(m.roster_id)?.owner_name || `Roster ${m.roster_id}`;
    groups.get(k)!.push(owner_name);
  }

  const pairs: UpcomingPair[] = [];
  for (const [mid, names] of Array.from(groups.entries())) {
    if (names.length >= 2) {
      pairs.push({ matchup_id: mid, teams: [names[0], names[1]] });
    }
  }
  return pairs;
}

// ============ Transaction Normalization ============

interface NormalizedEvent {
  event_id: string;
  type: 'trade' | 'waiver' | 'fa_add';
  week: number | null;
  parties?: string[];
  assets_moved?: number;
  picks_moved?: number;
  team?: string;
  faab_spent?: number;
}

function normalizeTransactions(
  transactions: SleeperTransaction[],
  rostersIndex: Map<number, { owner_id: string; owner_name: string }>
): NormalizedEvent[] {
  const events: NormalizedEvent[] = [];

  for (const t of transactions || []) {
    const type = t.type;

    if (type === 'trade') {
      const parties = (t.roster_ids || []).map(
        id => rostersIndex.get(id)?.owner_name || `Roster ${id}`
      );
      const addsCount = t.adds ? Object.keys(t.adds).length : 0;
      const dropsCount = t.drops ? Object.keys(t.drops).length : 0;
      const picksCount = Array.isArray(t.draft_picks) ? t.draft_picks.length : 0;
      events.push({
        event_id: String(t.transaction_id || Math.random()),
        type: 'trade',
        week: t.leg || null,
        parties,
        assets_moved: addsCount + dropsCount + picksCount,
        picks_moved: picksCount,
      });
    } else if (type === 'waiver') {
      const faab = Number(t.waiver_bid || 0);
      const rosterId = t.roster_ids?.[0] ?? t.roster_id;
      const teamName = rosterId ? rostersIndex.get(rosterId)?.owner_name || `Roster ${rosterId}` : 'Unknown';
      events.push({
        event_id: String(t.transaction_id || Math.random()),
        type: 'waiver',
        week: t.leg || null,
        team: teamName,
        faab_spent: faab,
      });
    } else if (type === 'free_agent') {
      const rosterId = t.roster_ids?.[0] ?? t.roster_id;
      const teamName = rosterId ? rostersIndex.get(rosterId)?.owner_name || `Roster ${rosterId}` : 'Unknown';
      events.push({
        event_id: String(t.transaction_id || Math.random()),
        type: 'fa_add',
        week: t.leg || null,
        team: teamName,
      });
    }
  }
  return events;
}

// ============ Event Scoring ============

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function scoreWaiver(
  ev: NormalizedEvent,
  cfg: RelevanceConfig
): { score: number; reasons: string[] } {
  const W = cfg.waiver.weights;
  const faab = Number(ev.faab_spent || 0);

  const faabScore =
    faab >= 50 ? 0.9 :
    faab >= 35 ? 0.75 :
    faab >= 20 ? 0.6 :
    faab >= 10 ? 0.45 :
    faab >= 5 ? 0.35 : 0.25;

  const features: Record<string, number> = {
    faabSpentVsValue: faabScore,
    bidHeat: 0.5,
    needFit: 0.5,
    projectionRole: 0.5,
    timing: 0.5,
  };

  const totalW = Object.values(W).reduce((a, b) => a + b, 0);
  let score01 = 0;
  for (const k of Object.keys(W)) {
    score01 += (features[k] ?? 0.5) * (W[k] / totalW);
  }
  const score = Math.round(score01 * 100);

  const reasons: string[] = [];
  if (faab >= 35) reasons.push(`FAAB ${faab} (aggressive)`);
  else if (faab >= 20) reasons.push(`FAAB ${faab} (moderate)`);
  else reasons.push(`FAAB ${faab} (low)`);

  return { score, reasons };
}

function scoreTrade(
  ev: NormalizedEvent,
  cfg: RelevanceConfig
): { score: number; reasons: string[] } {
  const W = cfg.trade.weights;
  const assets = Number(ev.assets_moved || 0);
  const picks = Number(ev.picks_moved || 0);

  const dynastyRoleImpact = picks >= 2 ? 0.9 : picks === 1 ? 0.7 : assets >= 4 ? 0.6 : 0.5;
  const positionalScarcity = 0.5;
  const pointsImpact = assets >= 6 ? 0.8 : assets >= 4 ? 0.65 : assets >= 2 ? 0.55 : 0.45;
  const capitalPaid = picks >= 2 ? 0.8 : picks === 1 ? 0.65 : 0.5;
  const teamNeedFit = 0.5;
  const tagShiftPotential = picks >= 1 || assets >= 4 ? 0.6 : 0.5;

  const features: Record<string, number> = {
    dynastyRoleImpact,
    positionalScarcity,
    pointsImpact,
    capitalPaid,
    teamNeedFit,
    tagShiftPotential,
  };

  const totalW = Object.values(W).reduce((a, b) => a + b, 0);
  let score01 = 0;
  for (const k of Object.keys(W)) {
    score01 += clamp01(features[k]) * (W[k] / totalW);
  }
  let score = Math.round(score01 * 100);

  if (assets >= 6 || picks >= 2) score = Math.max(score, cfg.trade.blockbuster_floor);
  if (assets <= 2 && picks === 0) score = Math.min(score, cfg.trade.lateral_cap);

  const reasons: string[] = [];
  if (picks >= 2) reasons.push('multiple picks involved');
  else if (picks === 1) reasons.push('future pick involved');
  if (assets >= 6) reasons.push('many assets moved');
  else if (assets >= 4) reasons.push('several assets moved');
  else reasons.push('low volume swap');

  return { score, reasons };
}

function coverageLevel(
  score: number,
  thresholds: { lowMax: number; moderateMax: number }
): 'low' | 'moderate' | 'high' {
  if (score <= thresholds.lowMax) return 'low';
  if (score <= thresholds.moderateMax) return 'moderate';
  return 'high';
}

function scoreEvents(
  events: NormalizedEvent[],
  cfg: RelevanceConfig
): ScoredEvent[] {
  const out: ScoredEvent[] = [];

  for (const ev of events) {
    if (ev.type === 'waiver') {
      const { score, reasons } = scoreWaiver(ev, cfg);
      out.push({
        ...ev,
        relevance_score: score,
        coverage_level: coverageLevel(score, cfg.thresholds),
        reasons,
      });
    } else if (ev.type === 'fa_add') {
      const score = 30;
      out.push({
        ...ev,
        relevance_score: score,
        coverage_level: coverageLevel(score, cfg.thresholds),
        reasons: ['free agent add'],
      });
    } else if (ev.type === 'trade') {
      const { score, reasons } = scoreTrade(ev, cfg);
      out.push({
        ...ev,
        relevance_score: score,
        coverage_level: coverageLevel(score, cfg.thresholds),
        reasons,
      });
    }
  }
  return out;
}

// ============ Main Export ============

// Bracket game info for playoff labeling
export interface BracketGame {
  matchup_id: number;
  round: number;
  bracket: 'winners' | 'losers';
  // Derived label based on round and bracket position
  label?: string;
}

export interface BuildDerivedInput {
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  nextMatchups?: SleeperMatchup[];
  transactions: SleeperTransaction[];
  // Optional bracket context for playoff weeks
  bracketContext?: {
    week: number;
    playoffStartWeek: number;
    bracketGames: BracketGame[];
  };
}

export function buildDerived(input: BuildDerivedInput): DerivedData {
  const cfg = RELEVANCE_CONFIG;
  const usersById = mapUsersById(input.users);
  const rostersIndex = mapRosters(input.rosters, usersById);

  // Pass bracket context for playoff labeling
  const week = input.bracketContext?.week;
  const playoffStartWeek = input.bracketContext?.playoffStartWeek;
  
  const matchup_pairs = buildMatchupPairs(input.matchups, rostersIndex, week, playoffStartWeek);
  const upcoming_pairs = buildUpcomingPairs(input.nextMatchups, rostersIndex);

  const events_normalized = normalizeTransactions(input.transactions, rostersIndex);
  const events_scored = scoreEvents(events_normalized, cfg);

  return { matchup_pairs, upcoming_pairs, events_scored };
}

export { mapUsersById, mapRosters };
