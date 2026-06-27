import { normalizeTeamCode } from '@/lib/constants/nfl-teams';
import {
  getAllPlayersCached,
  getNFLWeekStats,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import type { PlayerAvailabilityEntry } from '@/lib/utils/player-availability';
import type { NflverseTeamWeek } from '@/lib/fantasy/nflverse-team-stats';
import type { PlayerGameSample } from '@/lib/fantasy/projection-model';
import type { ProjectionOverrideRecord } from '@/lib/fantasy/projection-overrides';
import type { ProjectionConfidence, WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';

export const PROJECTION_MODEL_VERSION = 'statline-v3.0';
const DATA_TTL_MS = 30 * 60 * 1000;
const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

export type ProjectionScheduleWeek = {
  opponents: Record<string, string>;
  kickoffByTeam: Record<string, string>;
  earliestKickoff: string | null;
  hasGames: boolean;
  seasonValidated: boolean;
};

export type StatsBatch = {
  season: number;
  week: number;
  stats: Record<string, Record<string, number | string | undefined>>;
};

const scheduleCache = new Map<string, { ts: number; data: ProjectionScheduleWeek }>();
const statsBatchCache = new Map<string, { ts: number; data: StatsBatch[] }>();

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function numericScoring(settings: unknown): Record<string, number> {
  const scoring: Record<string, number> = {};
  if (!settings || typeof settings !== 'object') return scoring;
  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) scoring[key] = parsed;
  }
  return scoring;
}

export function playerName(player: SleeperPlayer | undefined): string {
  return `${player?.first_name || ''} ${player?.last_name || ''}`.trim() || 'Player unavailable';
}

export function normalizedPosition(player: SleeperPlayer | undefined): string {
  return String(player?.position || 'UNK').toUpperCase();
}

function statTeam(stats: Record<string, number | string | undefined>): string | null {
  return normalizeTeamCode(String(stats.team || stats.recent_team || stats.player_team || '')) || null;
}

export function resolveTeamForSamples(player: SleeperPlayer | undefined, games: PlayerGameSample[], historicalMode: boolean): string | null {
  if (historicalMode) {
    const sampleTeam = [...games]
      .sort((a, b) => (b.season - a.season) || (b.week - a.week))
      .map((game) => statTeam(game.stats))
      .find(Boolean);
    if (sampleTeam) return sampleTeam;
  }
  return normalizeTeamCode(player?.team) || null;
}

export async function loadScheduleWeek(season: string, week: number): Promise<ProjectionScheduleWeek> {
  const key = `${season}:${week}`;
  const cached = scheduleCache.get(key);
  if (cached && Date.now() - cached.ts < DATA_TTL_MS) return cached.data;
  const common = `week=${week}&seasontype=2&year=${encodeURIComponent(season)}`;
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`,
    `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`,
  ];
  type Competitor = { homeAway?: 'home' | 'away'; team?: { abbreviation?: string } };
  type Event = { date?: string; season?: { year?: number }; competitions?: Array<{ date?: string; competitors?: Competitor[] }> };
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json,text/plain,*/*' },
        next: { revalidate: 3600 },
      });
      if (!response.ok) continue;
      const payload = await response.json() as { events?: Event[]; season?: { year?: number } };
      const opponents: Record<string, string> = {};
      const kickoffByTeam: Record<string, string> = {};
      const kickoffs: string[] = [];
      let seasonValidated = false;
      for (const event of payload.events || []) {
        const eventSeason = Number(event.season?.year ?? payload.season?.year);
        if (eventSeason && String(eventSeason) !== season) continue;
        seasonValidated = seasonValidated || eventSeason === Number(season);
        const competition = event.competitions?.[0];
        const competitors = competition?.competitors || [];
        const home = normalizeTeamCode(competitors.find((entry) => entry.homeAway === 'home')?.team?.abbreviation);
        const away = normalizeTeamCode(competitors.find((entry) => entry.homeAway === 'away')?.team?.abbreviation);
        const kickoff = competition?.date || event.date || '';
        if (!home || !away) continue;
        opponents[home] = away;
        opponents[away] = home;
        if (kickoff) {
          kickoffByTeam[home] = kickoff;
          kickoffByTeam[away] = kickoff;
          kickoffs.push(kickoff);
        }
      }
      const data: ProjectionScheduleWeek = {
        opponents,
        kickoffByTeam,
        earliestKickoff: kickoffs.length ? kickoffs.sort((a, b) => Date.parse(a) - Date.parse(b))[0] : null,
        hasGames: Object.keys(opponents).length > 0,
        seasonValidated,
      };
      scheduleCache.set(key, { ts: Date.now(), data });
      return data;
    } catch {}
  }
  return { opponents: {}, kickoffByTeam: {}, earliestKickoff: null, hasGames: false, seasonValidated: false };
}

export async function loadStatsBatches(season: number, throughWeek: number): Promise<StatsBatch[]> {
  const key = `${season}:${throughWeek}`;
  const cached = statsBatchCache.get(key);
  if (cached && Date.now() - cached.ts < DATA_TTL_MS) return cached.data;
  const specs: Array<{ season: number; week: number }> = [];
  for (let week = 1; week <= 18; week += 1) specs.push({ season: season - 1, week });
  for (let week = 1; week <= throughWeek; week += 1) specs.push({ season, week });
  const data = await Promise.all(specs.map(async (spec) => ({
    ...spec,
    stats: await getNFLWeekStats(spec.season, spec.week).catch(() => ({})),
  }))) as StatsBatch[];
  statsBatchCache.set(key, { ts: Date.now(), data });
  return data;
}

export function gamesForPlayer(batches: StatsBatch[], playerId: string): PlayerGameSample[] {
  const games: PlayerGameSample[] = [];
  for (const batch of batches) {
    const stats = batch.stats[playerId];
    if (!stats || typeof stats !== 'object') continue;
    games.push({ season: batch.season, week: batch.week, stats });
  }
  return games;
}

export function inferHistoricalAvailability(position: string, games: PlayerGameSample[]): PlayerAvailabilityEntry {
  const recent = [...games]
    .sort((a, b) => (b.season - a.season) || (b.week - a.week))
    .filter((game) => finite(game.stats.pass_att) + finite(game.stats.rush_att) + finite(game.stats.rec_tgt) > 0)
    .slice(0, 4);
  if (!recent.length) return { tier: 'unknown', weight: 0.9, reasons: ['walk-forward-no-recent-usage'] };
  const average = (key: string) => recent.reduce((sum, game) => sum + finite(game.stats[key]), 0) / recent.length;
  if (position === 'QB') {
    return average('pass_att') >= 18
      ? { tier: 'starter', weight: 0.98, reasons: ['walk-forward-recent-starting-usage'] }
      : { tier: 'primary_backup', weight: 0.94, reasons: ['walk-forward-limited-qb-usage'] };
  }
  const opportunities = average('rush_att') + average('rec_tgt');
  if (opportunities >= 7) return { tier: 'starter', weight: 0.98, reasons: ['walk-forward-established-usage'] };
  if (opportunities >= 3) return { tier: 'primary_backup', weight: 0.97, reasons: ['walk-forward-secondary-usage'] };
  return { tier: 'rotational', weight: 0.95, reasons: ['walk-forward-rotational-usage'] };
}

export function applyOverrideToAvailability(entry: PlayerAvailabilityEntry, override: ProjectionOverrideRecord | undefined): PlayerAvailabilityEntry {
  if (!override) return entry;
  const next: PlayerAvailabilityEntry = { ...entry, reasons: [...entry.reasons, `manual-override-${override.id}`] };
  if (override.activeProbability != null) {
    next.weight = clamp(override.activeProbability, 0, 1);
    if (override.activeProbability <= 0.05) next.tier = 'inactive';
  }
  if (override.startProbability != null) {
    if (override.startProbability >= 0.72) next.tier = 'starter';
    else if (override.startProbability >= 0.25) next.tier = 'primary_backup';
    else next.tier = 'rotational';
  }
  return next;
}

export function groupTeamRows(rows: NflverseTeamWeek[]): Map<string, NflverseTeamWeek[]> {
  const grouped = new Map<string, NflverseTeamWeek[]>();
  for (const row of rows) {
    const list = grouped.get(row.team) || [];
    list.push(row);
    grouped.set(row.team, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => (a.season - b.season) || (a.week - b.week));
  return grouped;
}

export function rowsAllowedByDefense(rows: NflverseTeamWeek[], opponent: string | null): NflverseTeamWeek[] {
  if (!opponent) return [];
  return rows.filter((row) => row.opponent === opponent);
}

export function aggregateConfidence(players: WeeklyProjectedPlayer[]): ProjectionConfidence {
  if (!players.length) return 'low';
  const score = players.reduce((sum, player) => sum + (player.confidence === 'high' ? 2 : player.confidence === 'medium' ? 1 : 0), 0) / players.length;
  return score >= 1.45 ? 'high' : score >= 0.65 ? 'medium' : 'low';
}

export async function loadProjectionInputs(args: {
  season: number;
  throughWeek: number;
  requestedIds: string[];
  historicalMode: boolean;
}): Promise<{
  playerMap: Record<string, SleeperPlayer>;
  batches: StatsBatch[];
  candidateIds: string[];
}> {
  const [playerMap, batches] = await Promise.all([
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    loadStatsBatches(args.season, args.throughWeek),
  ]);
  const relevantTeams = new Set<string>();
  if (args.historicalMode) {
    for (const id of args.requestedIds) {
      const team = statTeam(gamesForPlayer(batches, id).at(-1)?.stats || {});
      if (team) relevantTeams.add(team);
    }
  } else {
    for (const id of args.requestedIds) {
      const team = normalizeTeamCode(playerMap[id]?.team);
      if (team) relevantTeams.add(team);
    }
  }
  const ids = new Set(args.requestedIds);
  if (args.historicalMode) {
    for (const batch of batches) {
      for (const [id, stats] of Object.entries(batch.stats)) {
        const team = statTeam(stats);
        if (team && relevantTeams.has(team)) ids.add(id);
      }
    }
  } else {
    for (const [id, player] of Object.entries(playerMap)) {
      const team = normalizeTeamCode(player.team);
      if (team && relevantTeams.has(team) && SKILL_POSITIONS.has(normalizedPosition(player))) ids.add(id);
    }
  }
  const candidateIds = Array.from(ids).filter((id) => {
    const position = normalizedPosition(playerMap[id]);
    return args.requestedIds.includes(id) || SKILL_POSITIONS.has(position) || position === 'DEF';
  });
  return { playerMap, batches, candidateIds };
}
