/**
 * Derive Module
 * Transforms raw Sleeper data into matchup pairs, upcoming pairs, and scored events
 */

import type {
  MatchupPair,
  UpcomingPair,
  ScoredEvent,
  DerivedData,
  RelevanceConfig,
} from './types';
import { RELEVANCE_CONFIG } from './config';

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

function buildMatchupPairs(
  matchups: SleeperMatchup[],
  rostersIndex: Map<number, { owner_id: string; owner_name: string }>
): MatchupPair[] {
  const groups = new Map<string | number, Array<{ owner_name: string; points: number }>>();
  
  for (const m of matchups) {
    const k = m.matchup_id ?? 'unknown';
    if (!groups.has(k)) groups.set(k, []);
    const owner_name = rostersIndex.get(m.roster_id)?.owner_name || `Roster ${m.roster_id}`;
    groups.get(k)!.push({ owner_name, points: Number(m.points ?? 0) });
  }

  const pairs: MatchupPair[] = [];
  for (const [mid, entries] of Array.from(groups.entries())) {
    if (!entries.length) continue;
    const sorted = [...entries].sort((a, b) => b.points - a.points);
    const winner = sorted[0];
    const loser = sorted[sorted.length - 1];
    const margin = Number((winner.points - loser.points).toFixed(2));
    pairs.push({
      matchup_id: mid,
      teams: entries.map(e => ({ name: e.owner_name, points: e.points })),
      winner: { name: winner.owner_name, points: winner.points },
      loser: { name: loser.owner_name, points: loser.points },
      margin,
    });
  }
  return pairs.sort((a, b) => b.margin - a.margin);
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

export interface BuildDerivedInput {
  users: SleeperUser[];
  rosters: SleeperRoster[];
  matchups: SleeperMatchup[];
  nextMatchups?: SleeperMatchup[];
  transactions: SleeperTransaction[];
}

export function buildDerived(input: BuildDerivedInput): DerivedData {
  const cfg = RELEVANCE_CONFIG;
  const usersById = mapUsersById(input.users);
  const rostersIndex = mapRosters(input.rosters, usersById);

  const matchup_pairs = buildMatchupPairs(input.matchups, rostersIndex);
  const upcoming_pairs = buildUpcomingPairs(input.nextMatchups, rostersIndex);

  const events_normalized = normalizeTransactions(input.transactions, rostersIndex);
  const events_scored = scoreEvents(events_normalized, cfg);

  return { matchup_pairs, upcoming_pairs, events_scored };
}

export { mapUsersById, mapRosters };
