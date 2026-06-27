import { getLeagueIdForSeason } from '@/lib/constants/league';
import { normalizeTeamCode } from '@/lib/constants/nfl-teams';
import { loadTradeBlockLeagueContext } from '@/lib/server/trade-assets';
import {
  getAllPlayersCached,
  getLeagueMatchups,
  getNFLState,
  getNFLWeekStats,
  type SleeperMatchup,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import {
  buildPlayerAvailabilitySnapshot,
  type PlayerAvailabilityEntry,
} from '@/lib/utils/player-availability';
import { loadNflverseTeamWeeks, filterCompletedTeamWeeks, type NflverseTeamWeek } from '@/lib/fantasy/nflverse-team-stats';
import { buildPlayerStatProjection, type PlayerGameSample } from '@/lib/fantasy/projection-model';
import { savePregameProjectionSnapshot } from '@/lib/fantasy/projection-snapshots';
import type {
  LineupOptimizerResponse,
  ProjectionConfidence,
  WeeklyLineupEntry,
  WeeklyProjectedPlayer,
} from '@/lib/fantasy/lineup-types';

const MODEL_VERSION = 'statline-v2.0';
const DATA_TTL_MS = 30 * 60 * 1000;

type ScheduleWeek = {
  opponents: Record<string, string>;
  kickoffByTeam: Record<string, string>;
  earliestKickoff: string | null;
  hasGames: boolean;
  seasonValidated: boolean;
};

type ProjectionData = {
  playerMap: Record<string, SleeperPlayer>;
  gamesByPlayer: Record<string, PlayerGameSample[]>;
  currentTeamWeeks: NflverseTeamWeek[];
  previousTeamWeeks: NflverseTeamWeek[];
};

const projectionDataCache = new Map<string, { ts: number; data: ProjectionData }>();
const scheduleCache = new Map<string, { ts: number; data: ScheduleWeek }>();

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function playerName(player: SleeperPlayer | undefined): string {
  return `${player?.first_name || ''} ${player?.last_name || ''}`.trim() || 'Player unavailable';
}

function normalizedPosition(player: SleeperPlayer | undefined): string {
  return String(player?.position || 'UNK').toUpperCase();
}

function numericScoring(settings: unknown): Record<string, number> {
  const scoring: Record<string, number> = {};
  if (!settings || typeof settings !== 'object') return scoring;
  for (const [key, value] of Object.entries(settings as Record<string, unknown>)) {
    const n = Number(value);
    if (Number.isFinite(n)) scoring[key] = n;
  }
  return scoring;
}

async function loadScheduleWeek(season: string, week: number): Promise<ScheduleWeek> {
  const key = `${season}:${week}`;
  const cached = scheduleCache.get(key);
  if (cached && Date.now() - cached.ts < DATA_TTL_MS) return cached.data;
  const common = `week=${week}&seasontype=2&year=${encodeURIComponent(season)}`;
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`,
    `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`,
  ];
  type Competitor = { homeAway?: 'home' | 'away'; team?: { abbreviation?: string } };
  type Event = {
    date?: string;
    season?: { year?: number };
    competitions?: Array<{ date?: string; competitors?: Competitor[] }>;
  };
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
      const kickoffValues: string[] = [];
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
        if (home && away) {
          opponents[home] = away;
          opponents[away] = home;
          if (kickoff) {
            kickoffByTeam[home] = kickoff;
            kickoffByTeam[away] = kickoff;
            kickoffValues.push(kickoff);
          }
        }
      }
      const earliestKickoff = kickoffValues.length
        ? kickoffValues.sort((a, b) => Date.parse(a) - Date.parse(b))[0]
        : null;
      const data = {
        opponents,
        kickoffByTeam,
        earliestKickoff,
        hasGames: Object.keys(opponents).length > 0,
        seasonValidated,
      };
      scheduleCache.set(key, { ts: Date.now(), data });
      return data;
    } catch {
      // Try the fallback endpoint.
    }
  }
  return { opponents: {}, kickoffByTeam: {}, earliestKickoff: null, hasGames: false, seasonValidated: false };
}

async function loadPlayerGames(
  season: number,
  throughWeek: number,
  playerIds: string[],
): Promise<Record<string, PlayerGameSample[]>> {
  const previousSeason = season - 1;
  const specs: Array<{ season: number; week: number }> = [];
  for (let week = 1; week <= 18; week += 1) specs.push({ season: previousSeason, week });
  for (let week = 1; week <= throughWeek; week += 1) specs.push({ season, week });
  const targetIds = new Set(playerIds);
  const weeks = await Promise.all(specs.map(async (spec) => ({
    ...spec,
    stats: await getNFLWeekStats(spec.season, spec.week).catch(() => ({})),
  })));
  const gamesByPlayer: Record<string, PlayerGameSample[]> = {};
  for (const item of weeks) {
    for (const [playerId, raw] of Object.entries(item.stats as Record<string, Record<string, number | string | undefined>>)) {
      if (!targetIds.has(playerId) || !raw || typeof raw !== 'object') continue;
      (gamesByPlayer[playerId] ||= []).push({ season: item.season, week: item.week, stats: raw });
    }
  }
  return gamesByPlayer;
}

async function loadProjectionData(args: {
  season: number;
  throughWeek: number;
  playerIds: string[];
}): Promise<ProjectionData> {
  const cacheKey = `${args.season}:${args.throughWeek}:${[...args.playerIds].sort().join(',')}`;
  const cached = projectionDataCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DATA_TTL_MS) return cached.data;
  const [playerMap, gamesByPlayer, currentRaw, previousRaw] = await Promise.all([
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    loadPlayerGames(args.season, args.throughWeek, args.playerIds),
    loadNflverseTeamWeeks(args.season),
    loadNflverseTeamWeeks(args.season - 1),
  ]);
  const data = {
    playerMap,
    gamesByPlayer,
    currentTeamWeeks: filterCompletedTeamWeeks(currentRaw, args.throughWeek),
    previousTeamWeeks: filterCompletedTeamWeeks(previousRaw, 18),
  };
  projectionDataCache.set(cacheKey, { ts: Date.now(), data });
  return data;
}

function rowsForOffense(data: ProjectionData, team: string | null): NflverseTeamWeek[] {
  if (!team) return [];
  return [
    ...data.previousTeamWeeks.filter((row) => row.team === team),
    ...data.currentTeamWeeks.filter((row) => row.team === team),
  ];
}

function rowsAllowedByDefense(data: ProjectionData, opponent: string | null): NflverseTeamWeek[] {
  if (!opponent) return [];
  return data.currentTeamWeeks.filter((row) => row.opponent === opponent);
}

function aggregateConfidence(players: WeeklyProjectedPlayer[]): ProjectionConfidence {
  if (!players.length) return 'low';
  const score = players.reduce((sum, player) => sum + (player.confidence === 'high' ? 2 : player.confidence === 'medium' ? 1 : 0), 0) / players.length;
  return score >= 1.45 ? 'high' : score >= 0.65 ? 'medium' : 'low';
}

export async function projectWeeklyPlayers(args: {
  season: string;
  week: number;
  playerIds: string[];
  scoringSettings: Record<string, number>;
  availability?: Record<string, PlayerAvailabilityEntry>;
}): Promise<{ players: WeeklyProjectedPlayer[]; schedule: ScheduleWeek; preseason: boolean }> {
  const season = Number(args.season);
  const throughWeek = Math.max(0, args.week - 1);
  const [data, schedule] = await Promise.all([
    loadProjectionData({ season, throughWeek, playerIds: args.playerIds }),
    loadScheduleWeek(args.season, args.week),
  ]);
  const preseason = throughWeek === 0 || data.currentTeamWeeks.length === 0;
  const players = args.playerIds.map((playerId) => {
    const player = data.playerMap[playerId];
    const position = normalizedPosition(player);
    const nflTeam = normalizeTeamCode(player?.team) || null;
    const opponent = schedule.seasonValidated && nflTeam ? schedule.opponents[nflTeam] || null : null;
    const isBye = Boolean(schedule.seasonValidated && schedule.hasGames && nflTeam && !opponent);
    const injuryStatus = String(player?.injury_status || player?.status || '') || null;
    const result = buildPlayerStatProjection({
      position,
      games: data.gamesByPlayer[playerId] || [],
      availability: args.availability?.[playerId],
      currentTeam: nflTeam,
      opponent,
      teamWeeks: rowsForOffense(data, nflTeam),
      opponentWeeks: position === 'DEF' ? rowsForOffense(data, opponent) : rowsAllowedByDefense(data, opponent),
      currentSeasonGames: data.currentTeamWeeks.filter((row) => row.team === nflTeam).length,
      projectionSeason: season,
      preseason,
      scoring: args.scoringSettings,
      injuryStatus,
    });
    const projection = isBye || !nflTeam ? 0 : result.points;
    return {
      id: playerId,
      name: playerName(player),
      position,
      nflTeam,
      opponent,
      projection: Number(projection.toFixed(1)),
      baseline: Number(result.neutralPoints.toFixed(1)),
      matchupFactor: Number(result.matchupFactor.toFixed(3)),
      availabilityWeight: Number(result.activeProbability.toFixed(3)),
      isBye,
      confidence: result.confidence,
      rangeLow: Number((isBye ? 0 : result.rangeLow).toFixed(1)),
      rangeHigh: Number((isBye ? 0 : result.rangeHigh).toFixed(1)),
      expectedRole: result.expectedRole,
      workload: isBye ? 'Bye week' : result.workload,
      assumption: isBye ? 'No game scheduled for this NFL week.' : result.assumption,
      startProbability: Number(result.startProbability.toFixed(3)),
      activeProbability: Number(result.activeProbability.toFixed(3)),
      statLine: isBye ? {} : result.statLine,
    } satisfies WeeklyProjectedPlayer;
  });
  return { players, schedule, preseason };
}

function eligibleForSlot(position: string, slot: string): boolean {
  const normalizedSlot = slot.toUpperCase();
  if (normalizedSlot === position) return true;
  if (normalizedSlot === 'FLEX') return ['RB', 'WR', 'TE'].includes(position);
  if (normalizedSlot === 'SUPER_FLEX') return ['QB', 'RB', 'WR', 'TE'].includes(position);
  if (normalizedSlot === 'REC_FLEX') return ['WR', 'TE'].includes(position);
  if (normalizedSlot === 'WRRB_FLEX') return ['WR', 'RB'].includes(position);
  if (normalizedSlot === 'IDP_FLEX') return ['DL', 'LB', 'DB'].includes(position);
  return false;
}

export function optimizeProjectedLineup(
  players: WeeklyProjectedPlayer[],
  slots: string[],
): Array<WeeklyProjectedPlayer | null> {
  type State = { score: number; assignment: Array<WeeklyProjectedPlayer | null> };
  let states = new Map<number, State>([[0, { score: 0, assignment: Array.from({ length: slots.length }, () => null) }]]);
  for (const player of players) {
    const next = new Map(states);
    for (const [mask, state] of states.entries()) {
      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const bit = 1 << slotIndex;
        if ((mask & bit) !== 0 || !eligibleForSlot(player.position, slots[slotIndex])) continue;
        const nextMask = mask | bit;
        const score = state.score + player.projection;
        const existing = next.get(nextMask);
        if (!existing || score > existing.score) {
          const assignment = [...state.assignment];
          assignment[slotIndex] = player;
          next.set(nextMask, { score, assignment });
        }
      }
    }
    states = next;
  }
  const fullMask = (1 << slots.length) - 1;
  const full = states.get(fullMask);
  if (full) return full.assignment;
  let bestMask = 0;
  let bestState = states.get(0)!;
  for (const [mask, state] of states.entries()) {
    const filled = mask.toString(2).replace(/0/g, '').length;
    const bestFilled = bestMask.toString(2).replace(/0/g, '').length;
    if (filled > bestFilled || (filled === bestFilled && state.score > bestState.score)) {
      bestMask = mask;
      bestState = state;
    }
  }
  return bestState.assignment;
}

function lineupEntries(
  slots: string[],
  assignedPlayers: Array<WeeklyProjectedPlayer | null>,
  comparisonIds: Set<string>,
): WeeklyLineupEntry[] {
  return slots.map((slot, slotIndex) => {
    const player = assignedPlayers[slotIndex] || null;
    return { slot, slotIndex, player, changed: Boolean(player && !comparisonIds.has(player.id)) };
  });
}

export async function buildTeamLineupOptimizer(teamName: string): Promise<LineupOptimizerResponse> {
  const [context, state] = await Promise.all([
    loadTradeBlockLeagueContext(),
    getNFLState().catch(() => ({ week: 1, display_week: 1, season: String(new Date().getFullYear()) })),
  ]);
  const roster = context.rosters.find((entry) => context.nameMap.get(entry.roster_id) === teamName) as (typeof context.rosters[number] & { starters?: string[] }) | undefined;
  if (!roster || !context.league) throw new Error('Team roster not found');
  const season = String(context.league.season || state.season || new Date().getFullYear());
  const week = clamp(Number(state.week ?? state.display_week ?? 1), 1, 18);
  const matchups = await getLeagueMatchups(context.leagueId, week).catch(() => [] as SleeperMatchup[]);
  const teamMatchup = matchups.find((entry) => entry.roster_id === roster.roster_id);
  const starterSlots = (context.league.roster_positions || []).filter((slot) => slot !== 'BN');
  const currentStarterIds = (teamMatchup?.starters || []).filter((id) => id && id !== '0');
  const taxi = new Set((roster.taxi || []).filter(Boolean));
  const reserve = new Set((roster.reserve || []).filter(Boolean));
  const activePlayerIds = (roster.players || []).filter((id) => id && !taxi.has(id) && !reserve.has(id));
  const availability = await buildPlayerAvailabilitySnapshot({
    leagueId: context.leagueId,
    uptoWeek: week,
    playerIds: activePlayerIds,
  }).catch(() => ({} as Record<string, PlayerAvailabilityEntry>));
  const projectionResult = await projectWeeklyPlayers({
    season,
    week,
    playerIds: activePlayerIds,
    scoringSettings: numericScoring(context.league.scoring_settings),
    availability,
  });
  const projectedPlayers = projectionResult.players;
  const projectedById = new Map(projectedPlayers.map((player) => [player.id, player] as const));
  const currentAssigned = starterSlots.map((_, index) => {
    const playerId = teamMatchup?.starters?.[index];
    return playerId && playerId !== '0' ? projectedById.get(playerId) || null : null;
  });
  const optimalAssigned = optimizeProjectedLineup(projectedPlayers, starterSlots);
  const currentIds = new Set(currentAssigned.flatMap((player) => player ? [player.id] : []));
  const optimalIds = new Set(optimalAssigned.flatMap((player) => player ? [player.id] : []));
  const currentTotal = currentAssigned.reduce((sum, player) => sum + (player?.projection || 0), 0);
  const optimalTotal = optimalAssigned.reduce((sum, player) => sum + (player?.projection || 0), 0);
  const available = Boolean(starterSlots.length && currentStarterIds.length);
  const confidence = aggregateConfidence(optimalAssigned.filter((player): player is WeeklyProjectedPlayer => Boolean(player)));
  const response: LineupOptimizerResponse = {
    generatedAt: new Date().toISOString(),
    teamName,
    season,
    week,
    available,
    reason: available ? null : `Sleeper has not published a Week ${week} lineup for this team yet.`,
    currentTotal: available ? Number(currentTotal.toFixed(1)) : null,
    optimalTotal: optimalAssigned.some(Boolean) ? Number(optimalTotal.toFixed(1)) : null,
    potentialGain: available ? Number(Math.max(0, optimalTotal - currentTotal).toFixed(1)) : null,
    currentLineup: lineupEntries(starterSlots, currentAssigned, optimalIds),
    optimalLineup: lineupEntries(starterSlots, optimalAssigned, currentIds),
    projectedPlayers,
    modelVersion: MODEL_VERSION,
    projectionPhase: projectionResult.preseason ? 'preseason' : 'in_season',
    confidence,
    confidenceNote: projectionResult.preseason
      ? 'Preseason estimate. Roles, injuries, and team environments remain uncertain until current-season games are played.'
      : confidence === 'high'
        ? 'Current-season workload and role information are established.'
        : confidence === 'medium'
          ? 'Current-season information is available, but some workload or role uncertainty remains.'
          : 'Limited current-season information or an unsettled role makes this projection volatile.',
  };
  await savePregameProjectionSnapshot({ response, earliestKickoff: projectionResult.schedule.earliestKickoff });
  return response;
}

export async function getLeagueScoredBaselines(args: {
  season: string;
  throughWeek: number;
  playerIds: string[];
}): Promise<Record<string, { mean: number; stddev: number; games: number; last3Avg: number; decayedMean: number }>> {
  const context = await loadTradeBlockLeagueContext();
  const result = await projectWeeklyPlayers({
    season: args.season,
    week: Math.max(1, args.throughWeek + 1),
    playerIds: args.playerIds,
    scoringSettings: numericScoring(context.league?.scoring_settings),
  });
  return Object.fromEntries(result.players.map((player) => [player.id, {
    mean: player.baseline,
    stddev: Math.max(0.1, (player.rangeHigh - player.rangeLow) / 2),
    games: 0,
    last3Avg: player.baseline,
    decayedMean: player.baseline,
  }]));
}

export async function getLeagueDefenseFactors(args: {
  season: string;
  throughWeek: number;
}): Promise<Record<string, Record<string, number>>> {
  const rows = filterCompletedTeamWeeks(
    await loadNflverseTeamWeeks(Number(args.season)),
    Math.max(0, args.throughWeek),
  );
  if (!rows.length) return {};
  const teams = Array.from(new Set(rows.flatMap((row) => row.opponent ? [row.opponent] : [])));
  const factors: Record<string, Record<string, number>> = {};
  for (const team of teams) {
    const allowed = rows.filter((row) => row.opponent === team);
    const games = allowed.length;
    if (!games) continue;
    const avgPassYards = allowed.reduce((sum, row) => sum + row.passYards, 0) / games;
    const avgRushYards = allowed.reduce((sum, row) => sum + row.rushYards, 0) / games;
    const avgPassTds = allowed.reduce((sum, row) => sum + row.passTouchdowns, 0) / games;
    const avgRushTds = allowed.reduce((sum, row) => sum + row.rushTouchdowns, 0) / games;
    const confidence = clamp(games / 8, 0, 1) * 0.35;
    const passRaw = ((avgPassYards / 225) * 0.7) + ((avgPassTds / 1.45) * 0.3);
    const rushRaw = ((avgRushYards / 112) * 0.7) + ((avgRushTds / 0.85) * 0.3);
    const pass = clamp(1 + ((passRaw - 1) * confidence), 0.94, 1.06);
    const rush = clamp(1 + ((rushRaw - 1) * confidence), 0.94, 1.06);
    factors[team] = {
      QB: Number(pass.toFixed(3)),
      RB: Number(rush.toFixed(3)),
      WR: Number(pass.toFixed(3)),
      TE: Number(pass.toFixed(3)),
      K: 1,
      ALL: Number(((pass * 0.7) + (rush * 0.3)).toFixed(3)),
    };
  }
  return factors;
}
