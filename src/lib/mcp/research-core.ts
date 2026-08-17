import { getLeagueIdForSeason } from '@/lib/constants/league';
import { TEAM_ALIASES, normalizeName } from '@/lib/constants/team-mapping';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import type { LeagueStatsDataset } from '@/lib/stats/types';
import { getAllPlayersCached, getLeagueMatchups, type SleeperPlayer } from '@/lib/utils/sleeper-api';
import { buildAssetTradeTree } from '@/server/trade-tree';
import { handleGetEvwPlayerV2 } from '@/lib/mcp/v2-handlers';
import { RESEARCH_VERSION } from '@/lib/mcp/research-store';

export const MAX_RESEARCH_LIMIT = 100;
export type ResearchInput = Record<string, unknown>;
export type JsonRecord = Record<string, unknown>;

export function inputText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function inputNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function inputBool(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function researchLimit(value: unknown, fallback = 25): number {
  return Math.max(1, Math.min(MAX_RESEARCH_LIMIT, Math.floor(inputNumber(value) ?? fallback)));
}

function teamAliasTarget(raw: string): string {
  const norm = normalizeName(raw);
  const pair = Object.entries(TEAM_ALIASES).find(([alias]) => normalizeName(alias) === norm);
  return pair?.[1] || raw;
}

export function resolveFranchiseName(dataset: LeagueStatsDataset, raw: string): string | null {
  const target = normalizeName(teamAliasTarget(raw));
  return dataset.franchises.find((row) => normalizeName(row.teamName) === target)?.teamName
    || dataset.franchises.find((row) => normalizeName(row.teamName).includes(target) || target.includes(normalizeName(row.teamName)))?.teamName
    || null;
}

function playerCandidates(dataset: LeagueStatsDataset, raw: string) {
  const query = normalizeName(raw);
  return dataset.players
    .map((row) => {
      const name = normalizeName(row.name);
      const exactId = row.playerId === raw;
      const exact = name === query;
      const prefix = name.startsWith(query);
      const contains = name.includes(query);
      const score = exactId ? 1 : exact ? 0.99 : prefix ? 0.9 : contains ? 0.78 : 0;
      return { row, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.row.points - a.row.points || a.row.name.localeCompare(b.row.name));
}

export async function resolvePlayerId(dataset: LeagueStatsDataset, input: ResearchInput): Promise<string> {
  const id = inputText(input.id);
  if (id && dataset.players.some((row) => row.playerId === id)) return id;
  const raw = inputText(input.player) || inputText(input.name) || id;
  if (!raw) throw new Error('Provide id, player, or name');
  const candidates = playerCandidates(dataset, raw);
  if (!candidates.length) throw new Error(`Player not found: ${raw}`);
  if (candidates.length > 1 && candidates[0].score - candidates[1].score < 0.08) {
    throw new Error(`Ambiguous player: ${raw}. Candidates: ${candidates.slice(0, 5).map((item) => item.row.name).join(', ')}`);
  }
  return candidates[0].row.playerId;
}

export function researchProvenance(dataset: LeagueStatsDataset, source: string) {
  return {
    backendVersion: RESEARCH_VERSION,
    statsVersion: 'v3',
    source,
    sourceGeneratedAt: dataset.generatedAt,
    seasons: dataset.seasons,
    gameClassification: 'regular | playoffs(championship path) | toilet(losers bracket) | postseason(placement)',
    playerPoints: 'ownership-attributed weekly EVW scoring',
  };
}

export async function handleResolveEntity(input: ResearchInput) {
  const query = inputText(input.query);
  if (!query) throw new Error('query is required');
  const kind = inputText(input.kind) || 'auto';
  const dataset = await getLeagueStatsDatasetV3();
  const candidates: JsonRecord[] = [];
  if (kind === 'auto' || kind === 'player') {
    for (const item of playerCandidates(dataset, query).slice(0, 10)) {
      candidates.push({ kind: 'player', id: item.row.playerId, name: item.row.name, position: item.row.position, confidence: item.score });
    }
  }
  if (kind === 'auto' || kind === 'franchise') {
    const resolved = resolveFranchiseName(dataset, query);
    if (resolved) {
      const exact = normalizeName(resolved) === normalizeName(teamAliasTarget(query));
      candidates.push({ kind: 'franchise', id: resolved, name: resolved, confidence: exact ? 0.99 : 0.86 });
    }
  }
  if ((kind === 'auto' || kind === 'season') && dataset.seasons.includes(query)) {
    candidates.push({ kind: 'season', id: query, name: query, confidence: 1 });
  }
  candidates.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
  return {
    query,
    requestedKind: kind,
    resolved: candidates[0] || null,
    ambiguous: candidates.length > 1 && Number(candidates[0]?.confidence || 0) - Number(candidates[1]?.confidence || 0) < 0.08,
    candidates,
    provenance: researchProvenance(dataset, 'entity-resolver'),
  };
}

type FullRosterWeekPlayer = {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  season: string;
  week: number;
  franchiseName: string;
  rosterId: number;
  started: boolean;
  points: number;
};

function directoryPlayer(players: Record<string, SleeperPlayer>, playerId: string) {
  const player = players[playerId];
  return {
    name: player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() || playerId : playerId,
    position: player?.position || 'UNK',
    nflTeam: player?.team || null,
  };
}

export async function fullRosterWeek(
  dataset: LeagueStatsDataset,
  players: Record<string, SleeperPlayer>,
  season: string,
  week: number,
): Promise<FullRosterWeekPlayer[]> {
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) return [];
  const rosterNames = new Map(dataset.seasonTeams.filter((row) => row.season === season).map((row) => [row.rosterId, row.teamName] as const));
  const matchups = await getLeagueMatchups(leagueId, week, { retries: 2, retryDelayMs: 250, timeoutMs: 12_000 }).catch(() => []);
  const rows: FullRosterWeekPlayer[] = [];
  for (const matchup of matchups) {
    const franchiseName = rosterNames.get(matchup.roster_id) || `Roster ${matchup.roster_id}`;
    const starters = new Set(matchup.starters || []);
    const points = matchup.players_points || {};
    for (const playerId of matchup.players || []) {
      if (!playerId) continue;
      rows.push({
        playerId,
        ...directoryPlayer(players, playerId),
        season,
        week,
        franchiseName,
        rosterId: matchup.roster_id,
        started: starters.has(playerId),
        points: Number(points[playerId] ?? 0) || 0,
      });
    }
  }
  return rows;
}

function ownershipSegments(rows: FullRosterWeekPlayer[]) {
  const sorted = [...rows].sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week || a.franchiseName.localeCompare(b.franchiseName));
  const segments: Array<{ season: string; franchise: string; startWeek: number; endWeek: number; rosteredWeeks: number; starts: number; points: number }> = [];
  for (const row of sorted) {
    const last = segments.at(-1);
    if (last && last.season === row.season && last.franchise === row.franchiseName && row.week <= last.endWeek + 1) {
      last.endWeek = Math.max(last.endWeek, row.week);
      last.rosteredWeeks += 1;
      last.starts += row.started ? 1 : 0;
      last.points += row.points;
    } else {
      segments.push({ season: row.season, franchise: row.franchiseName, startWeek: row.week, endWeek: row.week, rosteredWeeks: 1, starts: row.started ? 1 : 0, points: row.points });
    }
  }
  return segments;
}

async function fullPlayerOwnershipRows(dataset: LeagueStatsDataset, playerId: string): Promise<FullRosterWeekPlayer[]> {
  const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));
  const career = dataset.players.find((row) => row.playerId === playerId);
  const seasons = career?.seasons || dataset.seasons;
  const found: FullRosterWeekPlayer[] = [];
  for (const season of seasons) {
    const weeks = Array.from(new Set(dataset.games.filter((game) => game.season === season).map((game) => game.week))).sort((a, b) => a - b);
    for (let start = 0; start < weeks.length; start += 6) {
      const batch = await Promise.all(weeks.slice(start, start + 6).map((week) => fullRosterWeek(dataset, players, season, week)));
      for (const row of batch.flat()) if (row.playerId === playerId) found.push(row);
    }
  }
  return found;
}

export async function handleGetPlayerOwnershipTimeline(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  const playerId = await resolvePlayerId(dataset, input);
  const player = dataset.players.find((row) => row.playerId === playerId)!;
  const rows = await fullPlayerOwnershipRows(dataset, playerId);
  const segments = ownershipSegments(rows);
  const transitions = segments.slice(1).map((row, index) => ({ season: row.season, week: row.startWeek, from: segments[index].franchise, to: row.franchise })).filter((row) => row.from !== row.to);
  return {
    player: { id: playerId, name: player.name, position: player.position },
    segments,
    transitions,
    weeklyOwnership: rows,
    franchiseCareerSplits: player.franchises,
    coverage: 'Weekly ownership is reconstructed from Sleeper historical matchup roster arrays, including zero-point rostered weeks. Historical taxi/IR designations are not reliably preserved and are therefore not inferred.',
    provenance: researchProvenance(dataset, 'full-weekly-ownership-timeline'),
  };
}

export async function handleGetEvwPlayerResearch(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  const playerId = await resolvePlayerId(dataset, input);
  const [profile, ownership] = await Promise.all([handleGetEvwPlayerV2({ id: playerId }), handleGetPlayerOwnershipTimeline({ id: playerId })]);
  return { ...profile, ownership, provenance: researchProvenance(dataset, 'player-profile+ownership') };
}

export async function handleGetRosterSnapshot(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  const season = inputText(input.season);
  const week = Math.floor(inputNumber(input.week) ?? 0);
  const rawTeam = inputText(input.team) || inputText(input.franchise);
  if (!season || week <= 0 || !rawTeam) throw new Error('season, week, and team are required');
  const team = resolveFranchiseName(dataset, rawTeam);
  if (!team) throw new Error(`Franchise not found: ${rawTeam}`);
  const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));
  const rows = (await fullRosterWeek(dataset, players, season, week)).filter((row) => row.franchiseName === team).sort((a, b) => Number(b.started) - Number(a.started) || b.points - a.points || a.name.localeCompare(b.name));
  const game = dataset.games.find((row) => row.season === season && row.week === week && (row.teamA === team || row.teamB === team));
  return {
    season,
    week,
    franchise: team,
    matchup: game || null,
    roster: rows,
    starters: rows.filter((row) => row.started),
    bench: rows.filter((row) => !row.started),
    totals: { rosteredPlayers: rows.length, starterPoints: rows.filter((row) => row.started).reduce((sum, row) => sum + row.points, 0), benchPoints: rows.filter((row) => !row.started).reduce((sum, row) => sum + row.points, 0) },
    coverage: 'This snapshot uses Sleeper historical matchup roster and starter arrays, so zero-point players remain present. Historical taxi/IR designation is not reliably preserved and is not inferred.',
    provenance: researchProvenance(dataset, 'full-weekly-roster-snapshot'),
  };
}

export async function handleGetTradeTreeResearch(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  const type = inputText(input.type) || (inputText(input.season) ? 'pick' : 'player');
  const depth = Math.max(1, Math.min(8, Math.floor(inputNumber(input.depth) ?? 5)));
  if (type === 'pick') {
    const season = inputText(input.season);
    const round = Math.floor(inputNumber(input.round) ?? 0);
    const slot = Math.floor(inputNumber(input.slot) ?? 0);
    if (!season || round <= 0 || slot <= 0) throw new Error('Pick trees require season, round, and slot');
    return { tree: await buildAssetTradeTree({ type: 'pick', season, round, slot }, { depth }), provenance: researchProvenance(dataset, 'trade-tree+asset-lineage') };
  }
  const playerId = await resolvePlayerId(dataset, input);
  const player = dataset.players.find((row) => row.playerId === playerId);
  return { player: player ? { id: playerId, name: player.name } : { id: playerId }, tree: await buildAssetTradeTree({ type: 'player', playerId }, { depth }), provenance: researchProvenance(dataset, 'trade-tree+asset-lineage') };
}
