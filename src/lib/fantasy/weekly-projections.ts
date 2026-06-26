import { getLeagueIdForSeason, LEAGUE_IDS } from '@/lib/constants/league';
import { normalizeTeamCode } from '@/lib/constants/nfl-teams';
import { loadTradeBlockLeagueContext } from '@/lib/server/trade-assets';
import {
  getAllPlayersCached,
  getLeagueMatchups,
  getNFLState,
  type SleeperMatchup,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import {
  buildPlayerAvailabilitySnapshot,
  type PlayerAvailabilityEntry,
} from '@/lib/utils/player-availability';
import type {
  LineupOptimizerResponse,
  WeeklyLineupEntry,
  WeeklyProjectedPlayer,
  WeeklyProjectionBaseline,
} from '@/lib/fantasy/lineup-types';

type ScheduleWeek = {
  opponents: Record<string, string>;
  hasGames: boolean;
};

type HistoricalWeek = {
  season: string;
  leagueId: string;
  week: number;
};

type ProjectionHistory = {
  samplesByPlayer: Record<string, number[]>;
  defenseSamples: Record<string, Record<string, number[]>>;
  playerMap: Record<string, SleeperPlayer>;
};

export type WeeklyProjectionContext = {
  baselines: Record<string, WeeklyProjectionBaseline>;
  defenseFactors: Record<string, Record<string, number>>;
  schedule: ScheduleWeek;
  playerMap: Record<string, SleeperPlayer>;
};

const HISTORY_TTL_MS = 30 * 60 * 1000;
const SCHEDULE_TTL_MS = 60 * 60 * 1000;
const historyCache = new Map<string, { ts: number; data: ProjectionHistory }>();
const scheduleCache = new Map<string, { ts: number; data: ScheduleWeek }>();

const DEFAULT_MEAN: Record<string, number> = {
  QB: 17,
  RB: 7.5,
  WR: 7.5,
  TE: 5.5,
  K: 7.5,
  DEF: 7.5,
};

const DEFAULT_SD: Record<string, number> = {
  QB: 6,
  RB: 5,
  WR: 5,
  TE: 4,
  K: 3,
  DEF: 4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  return Math.sqrt(
    values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1)
  );
}

function decayedMean(values: number[], halfLifeGames = 3): number {
  if (!values.length) return 0;
  const lambda = Math.log(2) / halfLifeGames;
  let weighted = 0;
  let weights = 0;
  for (let index = 0; index < values.length; index += 1) {
    const age = values.length - 1 - index;
    const weight = Math.exp(-lambda * age);
    weighted += values[index] * weight;
    weights += weight;
  }
  return weights > 0 ? weighted / weights : 0;
}

function percentile(values: number[], percentileValue: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(
    0,
    Math.min(sorted.length - 1, Math.floor(percentileValue * (sorted.length - 1)))
  );
  return sorted[index];
}

function playerName(player: SleeperPlayer | undefined): string {
  const name = `${player?.first_name || ''} ${player?.last_name || ''}`.trim();
  return name || 'Player unavailable';
}

function normalizedPosition(player: SleeperPlayer | undefined): string {
  return String(player?.position || 'UNK').toUpperCase();
}

async function loadScheduleWeek(season: string, week: number): Promise<ScheduleWeek> {
  const key = `${season}:${week}`;
  const cached = scheduleCache.get(key);
  if (cached && Date.now() - cached.ts < SCHEDULE_TTL_MS) return cached.data;

  const common = `week=${week}&seasontype=2&year=${encodeURIComponent(season)}`;
  const urls = [
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`,
    `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?${common}`,
  ];
  const headers = {
    'User-Agent': 'Mozilla/5.0',
    Accept: 'application/json,text/plain,*/*',
  };

  type Competitor = {
    homeAway?: 'home' | 'away';
    team?: { abbreviation?: string };
  };
  type Event = {
    competitions?: Array<{ competitors?: Competitor[] }>;
  };

  for (const url of urls) {
    try {
      const response = await fetch(url, { headers, cache: 'force-cache' });
      if (!response.ok) continue;
      const payload = await response.json() as { events?: Event[] };
      const opponents: Record<string, string> = {};
      for (const event of payload.events || []) {
        const competitors = event.competitions?.[0]?.competitors || [];
        const home = normalizeTeamCode(
          competitors.find((entry) => entry.homeAway === 'home')?.team?.abbreviation
        );
        const away = normalizeTeamCode(
          competitors.find((entry) => entry.homeAway === 'away')?.team?.abbreviation
        );
        if (home && away) {
          opponents[home] = away;
          opponents[away] = home;
        }
      }
      const data = { opponents, hasGames: Object.keys(opponents).length > 0 };
      scheduleCache.set(key, { ts: Date.now(), data });
      return data;
    } catch {
      // Try the fallback ESPN endpoint.
    }
  }

  return { opponents: {}, hasGames: false };
}

function buildHistoryWeeks(season: string, throughWeek: number): HistoricalWeek[] {
  const weeks: HistoricalWeek[] = [];
  const currentLeagueId = getLeagueIdForSeason(season);
  if (currentLeagueId && throughWeek > 0) {
    const firstWeek = Math.max(1, throughWeek - 7);
    for (let week = firstWeek; week <= throughWeek; week += 1) {
      weeks.push({ season, leagueId: currentLeagueId, week });
    }
  }

  if (throughWeek < 4) {
    const previousSeason = String(Number(season) - 1);
    const previousLeagueId = getLeagueIdForSeason(previousSeason);
    if (previousLeagueId) {
      for (let week = 10; week <= 17; week += 1) {
        weeks.push({ season: previousSeason, leagueId: previousLeagueId, week });
      }
    }
  }

  if (!weeks.length) {
    const fallbackLeagueId = currentLeagueId || LEAGUE_IDS.CURRENT;
    for (let week = 1; week <= Math.max(1, throughWeek); week += 1) {
      weeks.push({ season, leagueId: fallbackLeagueId, week });
    }
  }

  return weeks;
}

async function loadProjectionHistory(
  season: string,
  throughWeek: number
): Promise<ProjectionHistory> {
  const cacheKey = `${season}:${throughWeek}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < HISTORY_TTL_MS) return cached.data;

  const [playerMap, historicalWeeks] = await Promise.all([
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    Promise.resolve(buildHistoryWeeks(season, throughWeek)),
  ]);

  const weekData = await Promise.all(
    historicalWeeks.map(async (spec) => {
      const [matchups, schedule] = await Promise.all([
        getLeagueMatchups(spec.leagueId, spec.week).catch(() => [] as SleeperMatchup[]),
        loadScheduleWeek(spec.season, spec.week),
      ]);
      return { ...spec, matchups, schedule };
    })
  );

  const samplesByPlayer: Record<string, number[]> = {};
  const defenseSamples: Record<string, Record<string, number[]>> = {};

  for (const week of weekData) {
    const weeklyAllowed: Record<string, Record<string, number>> = {};
    const seenPlayers = new Set<string>();

    for (const matchup of week.matchups) {
      for (const [playerId, rawPoints] of Object.entries(matchup.players_points || {})) {
        if (seenPlayers.has(playerId)) continue;
        seenPlayers.add(playerId);
        const points = Number(rawPoints);
        if (!Number.isFinite(points)) continue;
        (samplesByPlayer[playerId] ||= []).push(points);

        const player = playerMap[playerId];
        const position = normalizedPosition(player);
        if (!['QB', 'RB', 'WR', 'TE', 'K'].includes(position)) continue;
        const nflTeam = normalizeTeamCode(player?.team);
        const defense = nflTeam ? week.schedule.opponents[nflTeam] : undefined;
        if (!defense) continue;
        weeklyAllowed[defense] ||= {};
        weeklyAllowed[defense][position] = (weeklyAllowed[defense][position] || 0) + points;
      }
    }

    for (const [defense, byPosition] of Object.entries(weeklyAllowed)) {
      defenseSamples[defense] ||= {};
      for (const [position, points] of Object.entries(byPosition)) {
        (defenseSamples[defense][position] ||= []).push(points);
      }
    }
  }

  const data = { samplesByPlayer, defenseSamples, playerMap };
  historyCache.set(cacheKey, { ts: Date.now(), data });
  return data;
}

function buildBaselines(
  playerIds: string[],
  history: ProjectionHistory
): Record<string, WeeklyProjectionBaseline> {
  const meansByPosition: Record<string, number[]> = {};
  for (const [playerId, allSamples] of Object.entries(history.samplesByPlayer)) {
    const samples = allSamples.slice(-8);
    if (!samples.length) continue;
    const position = normalizedPosition(history.playerMap[playerId]);
    (meansByPosition[position] ||= []).push(decayedMean(samples));
  }

  const fallbacks: Record<string, number> = { ...DEFAULT_MEAN };
  for (const [position, values] of Object.entries(meansByPosition)) {
    const derived = percentile(values.filter((value) => value > 0), 0.6);
    if (derived > 0) fallbacks[position] = derived;
  }

  const baselines: Record<string, WeeklyProjectionBaseline> = {};
  for (const playerId of playerIds) {
    const samples = (history.samplesByPlayer[playerId] || []).slice(-8);
    const position = normalizedPosition(history.playerMap[playerId]);
    const fallback = fallbacks[position] ?? 6;
    const games = samples.length;
    const rawMean = games ? average(samples) : fallback;
    const recent = games ? decayedMean(samples) : fallback;
    const alpha = clamp(games / 4, 0, 1);
    const blended = (alpha * ((recent * 0.7) + (rawMean * 0.3))) + ((1 - alpha) * fallback);
    const deviation = games > 1
      ? standardDeviation(samples)
      : (DEFAULT_SD[position] ?? 4);

    // Existing matchup components shrink toward their own position defaults.
    // Six games makes this league-scored, already-blended baseline authoritative.
    baselines[playerId] = {
      mean: blended,
      stddev: Math.max(0.1, deviation),
      games: 6,
      last3Avg: blended,
      decayedMean: blended,
    };
  }
  return baselines;
}

function buildDefenseFactors(
  defenseSamples: ProjectionHistory['defenseSamples']
): Record<string, Record<string, number>> {
  const positions = ['QB', 'RB', 'WR', 'TE', 'K'];
  const leagueValues: Record<string, number[]> = {};
  for (const byPosition of Object.values(defenseSamples)) {
    for (const position of positions) {
      const samples = byPosition[position] || [];
      if (samples.length) (leagueValues[position] ||= []).push(average(samples));
    }
  }

  const leagueMeans: Record<string, number> = {};
  for (const position of positions) {
    leagueMeans[position] = average(leagueValues[position] || []);
  }

  const factors: Record<string, Record<string, number>> = {};
  for (const [defense, byPosition] of Object.entries(defenseSamples)) {
    const row: Record<string, number> = {};
    for (const position of positions) {
      const samples = byPosition[position] || [];
      const leagueMean = leagueMeans[position] || 0;
      if (!samples.length || leagueMean <= 0) {
        row[position] = 1;
        continue;
      }
      const raw = average(samples) / leagueMean;
      const confidence = clamp(samples.length / 6, 0, 1);
      row[position] = Number(clamp(1 + ((raw - 1) * confidence), 0.8, 1.2).toFixed(3));
    }
    row.ALL = Number((
      (row.QB * 0.25)
      + (row.RB * 0.25)
      + (row.WR * 0.35)
      + (row.TE * 0.15)
    ).toFixed(3));
    factors[defense] = row;
  }
  return factors;
}

export async function getWeeklyProjectionContext(args: {
  season: string;
  week: number;
  playerIds: string[];
}): Promise<WeeklyProjectionContext> {
  const throughWeek = Math.max(0, args.week - 1);
  const [history, schedule] = await Promise.all([
    loadProjectionHistory(args.season, throughWeek),
    loadScheduleWeek(args.season, args.week),
  ]);
  return {
    baselines: buildBaselines(args.playerIds, history),
    defenseFactors: buildDefenseFactors(history.defenseSamples),
    schedule,
    playerMap: history.playerMap,
  };
}

export async function getLeagueScoredBaselines(args: {
  season: string;
  throughWeek: number;
  playerIds: string[];
}): Promise<Record<string, WeeklyProjectionBaseline>> {
  const history = await loadProjectionHistory(args.season, Math.max(0, args.throughWeek));
  return buildBaselines(args.playerIds, history);
}

export async function getLeagueDefenseFactors(args: {
  season: string;
  throughWeek: number;
}): Promise<Record<string, Record<string, number>>> {
  const history = await loadProjectionHistory(args.season, Math.max(0, args.throughWeek));
  return buildDefenseFactors(history.defenseSamples);
}

function injuryWeight(player: SleeperPlayer | undefined): number {
  const status = String(player?.injury_status || player?.status || '').toLowerCase();
  if (/out|ir|pup|nfi|susp|inactive/.test(status)) return 0;
  if (/doubtful/.test(status)) return 0.4;
  if (/questionable/.test(status)) return 0.85;
  return 1;
}

export async function projectWeeklyPlayers(args: {
  season: string;
  week: number;
  playerIds: string[];
  availability?: Record<string, PlayerAvailabilityEntry>;
}): Promise<WeeklyProjectedPlayer[]> {
  const context = await getWeeklyProjectionContext(args);
  return args.playerIds.map((playerId) => {
    const player = context.playerMap[playerId];
    const position = normalizedPosition(player);
    const nflTeam = normalizeTeamCode(player?.team) || null;
    const opponent = nflTeam ? context.schedule.opponents[nflTeam] || null : null;
    const isBye = Boolean(context.schedule.hasGames && nflTeam && !opponent);
    const baseline = context.baselines[playerId]?.mean ?? (DEFAULT_MEAN[position] ?? 6);
    const matchupFactor = opponent
      ? context.defenseFactors[opponent]?.[position]
        ?? context.defenseFactors[opponent]?.ALL
        ?? 1
      : 1;
    const snapshotWeight = args.availability?.[playerId]?.weight;
    const availabilityWeight = clamp(
      Math.min(
        injuryWeight(player),
        Number.isFinite(snapshotWeight) ? Number(snapshotWeight) : 1
      ),
      0,
      1
    );
    const projection = isBye || !nflTeam
      ? 0
      : baseline * matchupFactor * availabilityWeight;

    return {
      id: playerId,
      name: playerName(player),
      position,
      nflTeam,
      opponent,
      projection: Number(projection.toFixed(1)),
      baseline: Number(baseline.toFixed(1)),
      matchupFactor: Number(matchupFactor.toFixed(3)),
      availabilityWeight: Number(availabilityWeight.toFixed(3)),
      isBye,
    };
  });
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
  slots: string[]
): Array<WeeklyProjectedPlayer | null> {
  type State = { score: number; assignment: Array<WeeklyProjectedPlayer | null> };
  let states = new Map<number, State>([
    [0, { score: 0, assignment: Array.from({ length: slots.length }, () => null) }],
  ]);

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
  comparisonIds: Set<string>
): WeeklyLineupEntry[] {
  return slots.map((slot, slotIndex) => {
    const player = assignedPlayers[slotIndex] || null;
    return {
      slot,
      slotIndex,
      player,
      changed: Boolean(player && !comparisonIds.has(player.id)),
    };
  });
}

export async function buildTeamLineupOptimizer(teamName: string): Promise<LineupOptimizerResponse> {
  const [context, state] = await Promise.all([
    loadTradeBlockLeagueContext(),
    getNFLState().catch(() => ({
      week: 1,
      display_week: 1,
      season: String(new Date().getFullYear()),
    })),
  ]);
  const roster = context.rosters.find(
    (entry) => context.nameMap.get(entry.roster_id) === teamName
  ) as (typeof context.rosters[number] & { starters?: string[] }) | undefined;
  if (!roster || !context.league) throw new Error('Team roster not found');

  const season = String(context.league.season || state.season || new Date().getFullYear());
  const week = clamp(Number(state.week ?? state.display_week ?? 1), 1, 18);
  const matchups = await getLeagueMatchups(context.leagueId, week)
    .catch(() => [] as SleeperMatchup[]);
  const teamMatchup = matchups.find((entry) => entry.roster_id === roster.roster_id);
  const starterSlots = (context.league.roster_positions || []).filter(
    (slot) => slot !== 'BN'
  );
  const currentStarterIds = (teamMatchup?.starters || []).filter(
    (id) => id && id !== '0'
  );
  const taxi = new Set((roster.taxi || []).filter(Boolean));
  const reserve = new Set((roster.reserve || []).filter(Boolean));
  const activePlayerIds = (roster.players || []).filter(
    (id) => id && !taxi.has(id) && !reserve.has(id)
  );

  const availability = await buildPlayerAvailabilitySnapshot({
    leagueId: context.leagueId,
    uptoWeek: week,
    playerIds: activePlayerIds,
  }).catch(() => ({} as Record<string, PlayerAvailabilityEntry>));
  const projectedPlayers = await projectWeeklyPlayers({
    season,
    week,
    playerIds: activePlayerIds,
    availability,
  });
  const projectedById = new Map(
    projectedPlayers.map((player) => [player.id, player] as const)
  );
  const currentAssigned = starterSlots.map((_, index) => {
    const playerId = teamMatchup?.starters?.[index];
    return playerId && playerId !== '0'
      ? projectedById.get(playerId) || null
      : null;
  });
  const optimalAssigned = optimizeProjectedLineup(projectedPlayers, starterSlots);
  const currentIds = new Set<string>(
    currentAssigned.flatMap((player) => player ? [player.id] : [])
  );
  const optimalIds = new Set<string>(
    optimalAssigned.flatMap((player) => player ? [player.id] : [])
  );
  const currentTotal = currentAssigned.reduce(
    (sum, player) => sum + (player?.projection || 0),
    0
  );
  const optimalTotal = optimalAssigned.reduce(
    (sum, player) => sum + (player?.projection || 0),
    0
  );
  const available = Boolean(starterSlots.length && currentStarterIds.length);

  return {
    generatedAt: new Date().toISOString(),
    teamName,
    season,
    week,
    available,
    reason: available
      ? null
      : `Sleeper has not published a Week ${week} lineup for this team yet.`,
    currentTotal: available ? Number(currentTotal.toFixed(1)) : null,
    optimalTotal: optimalAssigned.some(Boolean)
      ? Number(optimalTotal.toFixed(1))
      : null,
    potentialGain: available
      ? Number(Math.max(0, optimalTotal - currentTotal).toFixed(1))
      : null,
    currentLineup: lineupEntries(starterSlots, currentAssigned, optimalIds),
    optimalLineup: lineupEntries(starterSlots, optimalAssigned, currentIds),
  };
}
