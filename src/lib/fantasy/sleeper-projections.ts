import type { ProjectedStatLine } from '@/lib/fantasy/lineup-types';
import { scoreProjectedStatLine } from '@/lib/fantasy/projection-model';

export type SleeperProjectionSource = 'sleeper-weekly' | 'sleeper-season';

export type SleeperExternalProjection = {
  playerId: string;
  points: number;
  statLine: ProjectedStatLine;
  source: SleeperProjectionSource;
  games: number;
  directPoints: number | null;
};

export type SleeperProjectionLoadResult = {
  byPlayer: Map<string, SleeperExternalProjection>;
  requested: number;
  found: number;
  coverage: number;
  status: 'available' | 'partial' | 'unavailable';
};

type JsonRecord = Record<string, unknown>;
type NextRequestInit = RequestInit & { next?: { revalidate: number } };

const BULK_TTL_SECONDS = 60 * 60;
const SEASON_TTL_SECONDS = 6 * 60 * 60;
const FETCH_TIMEOUT_MS = 3_000;
const SEASON_FETCH_CONCURRENCY = 24;

const CORE_STAT_KEYS = new Set([
  'pass_att', 'pass_cmp', 'pass_inc', 'pass_yd', 'pass_td', 'pass_int', 'pass_fd', 'pass_2pt',
  'rush_att', 'rush_yd', 'rush_td', 'rush_fd', 'rush_2pt',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rec_fd', 'rec_2pt',
  'fum_lost',
  'xpa', 'xpm', 'fga', 'fgm', 'fgmiss', 'fgm_0_19', 'fgm_20_29', 'fgm_30_39', 'fgm_40_49', 'fgm_50p',
  'sack', 'int', 'fum_rec', 'def_td', 'safe', 'blk_kick',
  'pts_allow_0', 'pts_allow_1_6', 'pts_allow_7_13', 'pts_allow_14_20', 'pts_allow_21_27', 'pts_allow_28_34', 'pts_allow_35p',
  'yds_allow_0_100', 'yds_allow_100_199', 'yds_allow_200_299', 'yds_allow_300_349',
  'yds_allow_350_399', 'yds_allow_400_449', 'yds_allow_450_499', 'yds_allow_500p',
]);

const requestCache = new Map<string, { expiresAt: number; promise: Promise<unknown | null> }>();

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoringPointKey(scoring: Record<string, number>): 'pts_std' | 'pts_half_ppr' | 'pts_ppr' {
  const receptionPoints = finite(scoring.rec);
  if (receptionPoints >= 0.75) return 'pts_ppr';
  if (receptionPoints >= 0.25) return 'pts_half_ppr';
  return 'pts_std';
}

function addExpectedBonuses(line: ProjectedStatLine, position: string): void {
  if (position === 'QB') {
    const yards = finite(line.pass_yd);
    line.bonus_pass_yd_300 = clamp((yards - 250) / 100, 0, 1);
    line.bonus_pass_yd_400 = clamp((yards - 350) / 100, 0, 1);
  }
  if (position === 'RB' || position === 'WR' || position === 'TE') {
    const rushYards = finite(line.rush_yd);
    const receivingYards = finite(line.rec_yd);
    line.bonus_rush_yd_100 = clamp((rushYards - 75) / 75, 0, 1);
    line.bonus_rush_yd_200 = clamp((rushYards - 175) / 75, 0, 1);
    line.bonus_rec_yd_100 = clamp((receivingYards - 75) / 75, 0, 1);
    line.bonus_rec_yd_200 = clamp((receivingYards - 175) / 75, 0, 1);
  }
}

function projectedGames(payload: JsonRecord, stats: JsonRecord): number {
  const candidates = [stats.gp, stats.gms_active, stats.games, payload.gp, payload.gms_active, payload.games];
  for (const candidate of candidates) {
    const value = finite(candidate);
    if (value >= 1 && value <= 18) return value;
  }
  return 17;
}

function hasCoreStat(position: string, line: ProjectedStatLine): boolean {
  if (position === 'QB') return finite(line.pass_att) + finite(line.pass_yd) + finite(line.rush_att) > 0;
  if (position === 'RB') return finite(line.rush_att) + finite(line.rec_tgt) + finite(line.rec) > 0;
  if (position === 'WR' || position === 'TE') return finite(line.rec_tgt) + finite(line.rec) + finite(line.rec_yd) > 0;
  if (position === 'K') return finite(line.fga) + finite(line.fgm) + finite(line.xpa) + finite(line.xpm) > 0;
  if (position === 'DEF') return finite(line.sack) + finite(line.int) + finite(line.fum_rec) + finite(line.def_td) > 0;
  return false;
}

function directProjectionPoints(
  payload: JsonRecord,
  stats: JsonRecord,
  scoring: Record<string, number>,
  divisor: number,
): number | null {
  const key = scoringPointKey(scoring);
  const candidates = [stats[key], payload[key], stats.pts_ppr, payload.pts_ppr, stats.pts_std, payload.pts_std];
  for (const candidate of candidates) {
    const value = finite(candidate);
    if (value > 0) return value / divisor;
  }
  return null;
}

export function normalizeSleeperProjection(args: {
  playerId: string;
  payload: unknown;
  position: string;
  scoring: Record<string, number>;
  source: SleeperProjectionSource;
}): SleeperExternalProjection | null {
  if (!isRecord(args.payload)) return null;
  const stats = isRecord(args.payload.stats) ? args.payload.stats : args.payload;
  const seasonProjection = args.source === 'sleeper-season';
  const games = seasonProjection ? projectedGames(args.payload, stats) : 1;
  const divisor = seasonProjection ? games : 1;
  const line: ProjectedStatLine = {};
  const eligibleKeys = new Set([
    ...CORE_STAT_KEYS,
    ...Object.keys(args.scoring).filter((key) => !key.startsWith('bonus_')),
  ]);

  for (const key of eligibleKeys) {
    const value = finite(stats[key]);
    if (value !== 0) line[key] = value / divisor;
  }
  addExpectedBonuses(line, args.position.toUpperCase());

  const directPoints = directProjectionPoints(args.payload, stats, args.scoring, divisor);
  const componentPoints = scoreProjectedStatLine(line, args.scoring, args.position);
  const points = hasCoreStat(args.position.toUpperCase(), line) && componentPoints > 0.05
    ? componentPoints
    : directPoints || 0;

  if (!Number.isFinite(points) || points <= 0.05 || points > 50) return null;

  return {
    playerId: args.playerId,
    points: Number(points.toFixed(3)),
    statLine: Object.fromEntries(Object.entries(line).map(([key, value]) => [key, Number(value.toFixed(3))])),
    source: args.source,
    games,
    directPoints: directPoints == null ? null : Number(directPoints.toFixed(3)),
  };
}

async function fetchJson(url: string, revalidateSeconds: number): Promise<unknown | null> {
  const cached = requestCache.get(url);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
        cache: 'force-cache',
        next: { revalidate: revalidateSeconds },
      } as NextRequestInit);
      if (response.status === 404 || response.status === 409) return null;
      if (!response.ok) throw new Error(`Sleeper projections returned HTTP ${response.status}`);
      return await response.json() as unknown;
    } catch (error) {
      console.warn('[sleeper-projections] projection request failed', { url, error });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  })();

  const entry = {
    expiresAt: Date.now() + (Math.min(revalidateSeconds, 15 * 60) * 1000),
    promise: request,
  };
  requestCache.set(url, entry);
  void request.then((result) => {
    const current = requestCache.get(url);
    if (!current || current.promise !== request) return;
    current.expiresAt = Date.now() + ((result == null ? 15 * 60 : revalidateSeconds) * 1000);
  });
  return request;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  if (!values.length) return [];
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

export async function loadSleeperExternalProjections(args: {
  season: number;
  week: number;
  playerIds: string[];
  positionByPlayer: Map<string, string>;
  scoring: Record<string, number>;
  preseason: boolean;
}): Promise<SleeperProjectionLoadResult> {
  const playerIds = Array.from(new Set(args.playerIds.filter(Boolean)));
  const byPlayer = new Map<string, SleeperExternalProjection>();
  if (!playerIds.length) {
    return { byPlayer, requested: 0, found: 0, coverage: 0, status: 'unavailable' };
  }

  const week = clamp(Math.round(args.week || 1), 1, 18);
  const bulkUrl = `https://api.sleeper.app/v1/projections/nfl/regular/${args.season}/${week}`;
  const bulkPayload = await fetchJson(bulkUrl, BULK_TTL_SECONDS);
  if (isRecord(bulkPayload)) {
    for (const playerId of playerIds) {
      const normalized = normalizeSleeperProjection({
        playerId,
        payload: bulkPayload[playerId],
        position: args.positionByPlayer.get(playerId) || 'UNK',
        scoring: args.scoring,
        source: 'sleeper-weekly',
      });
      if (normalized) byPlayer.set(playerId, normalized);
    }
  }

  const missing = playerIds.filter((playerId) => !byPlayer.has(playerId));
  if (missing.length) {
    const seasonResults = await mapWithConcurrency(missing, SEASON_FETCH_CONCURRENCY, async (playerId) => {
      const url = `https://api.sleeper.com/projections/nfl/player/${encodeURIComponent(playerId)}?season=${args.season}&season_type=regular&grouping=season`;
      const payload = await fetchJson(url, SEASON_TTL_SECONDS);
      return normalizeSleeperProjection({
        playerId,
        payload,
        position: args.positionByPlayer.get(playerId) || 'UNK',
        scoring: args.scoring,
        source: 'sleeper-season',
      });
    });
    for (const projection of seasonResults) if (projection) byPlayer.set(projection.playerId, projection);
  }

  const found = byPlayer.size;
  const coverage = found / playerIds.length;
  return {
    byPlayer,
    requested: playerIds.length,
    found,
    coverage: Number(coverage.toFixed(3)),
    status: found === 0 ? 'unavailable' : coverage >= 0.75 ? 'available' : 'partial',
  };
}

export function blendSleeperProjection(args: {
  internalPoints: number;
  external: SleeperExternalProjection | undefined;
  preseason: boolean;
  activeProbability: number;
  roleTrend?: 'expanded' | 'declining' | 'stable' | 'insufficient';
  manualOverride: boolean;
}): { points: number; weight: number; disagreement: number | null } {
  const internal = Math.max(0, finite(args.internalPoints));
  if (!args.external || args.manualOverride) return { points: internal, weight: 0, disagreement: null };

  const external = Math.max(0, finite(args.external.points));
  if (external <= 0.05) return { points: internal, weight: 0, disagreement: null };

  const disagreement = Math.abs(internal - external) / Math.max(4, external);
  let weight = args.preseason
    ? args.external.source === 'sleeper-season' ? 0.80 : 0.75
    : args.external.source === 'sleeper-weekly' ? 0.65 : 0.50;

  if (disagreement >= 0.20) weight = args.preseason ? 0.90 : Math.max(weight, 0.78);
  if (args.roleTrend === 'expanded' || args.roleTrend === 'declining') weight -= 0.08;
  if (args.activeProbability < 0.75) weight = Math.min(weight, 0.45);
  weight = clamp(weight, 0, 0.92);

  const availabilityMultiplier = args.activeProbability < 0.75
    ? clamp(args.activeProbability, 0, 1)
    : 1;
  const externalExpected = external * availabilityMultiplier;
  const points = (internal * (1 - weight)) + (externalExpected * weight);
  return {
    points: Math.max(0, points),
    weight: Number(weight.toFixed(3)),
    disagreement: Number(disagreement.toFixed(3)),
  };
}
