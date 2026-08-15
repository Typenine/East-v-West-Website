import { CURRENT_SEASON, LEAGUE_IDS, TEAM_NAMES, getLeagueIdForSeason } from '@/lib/constants/league';
import { CANONICAL_TEAM_BY_USER_ID } from '@/lib/constants/team-mapping';
import { canonicalizeTeamName, getUserIdForTeam } from '@/lib/server/user-identity';
import {
  buildSeasonPlayerWeeklyAttribution,
  getAllPlayersCached,
  getNFLState,
  getTeamsData,
} from '@/lib/utils/sleeper-api';
import { getPlayerProfile } from '@/lib/players/player-profile-service';
import {
  listActiveHallOfFameEntries,
  listActiveHallOfFameEntriesForPlayer,
  type HallOfFameDbEntry,
} from '@/server/db/hall-of-fame-queries';
import type {
  HallOfFameCandidate,
  HallOfFameEntryPublic,
  HallOfFameFranchise,
  HallOfFameIndexResponse,
  PlayerHallOfFameHonor,
} from './types';

const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
const franchiseHistoryCache = new Map<string, { ts: number; data: HallOfFameCandidate[] }>();

export function getHallOfFameFranchises(): HallOfFameFranchise[] {
  return TEAM_NAMES.map((franchiseName) => ({
    franchiseName,
    franchiseId: getUserIdForTeam(franchiseName),
  }));
}

export function getFranchiseNameForId(franchiseId: string): string {
  return CANONICAL_TEAM_BY_USER_ID[franchiseId] ?? franchiseId;
}

async function attributionEndWeekForSeason(season: string): Promise<number> {
  if (season !== CURRENT_SEASON) return 17;
  try {
    const state = await getNFLState();
    if (String(state.season ?? '') !== season) return 0;
    const seasonType = String(state.season_type ?? '').toLowerCase();
    if (!seasonType.startsWith('regular')) return seasonType.startsWith('post') ? 17 : 0;
    const week = Number(state.week ?? 0);
    if (!Number.isFinite(week)) return 0;
    return Math.max(0, Math.min(17, Math.floor(week)));
  } catch {
    return 0;
  }
}

function blankCareer() {
  return {
    seasons: [] as string[],
    firstSeason: null as string | null,
    lastSeason: null as string | null,
    totalPoints: 0,
    rosteredWeeks: 0,
    starts: 0,
  };
}

export async function getFranchisePlayerHistory(franchiseId: string): Promise<HallOfFameCandidate[]> {
  const cached = franchiseHistoryCache.get(franchiseId);
  if (cached && Date.now() - cached.ts < HISTORY_CACHE_TTL_MS) return cached.data;

  const allPlayers = await getAllPlayersCached();
  const franchiseName = getFranchiseNameForId(franchiseId);
  const seasonNames = [CURRENT_SEASON, ...Object.keys(LEAGUE_IDS.PREVIOUS || {})]
    .filter((value, index, array) => array.indexOf(value) === index)
    .sort((a, b) => a.localeCompare(b));

  type Aggregate = {
    playerId: string;
    seasons: Set<string>;
    firstSeason: string | null;
    lastSeason: string | null;
    totalPoints: number;
    rosteredWeeks: number;
    starts: number;
    currentlyOnFranchise: boolean;
  };

  const aggregates = new Map<string, Aggregate>();
  let currentRosterIds = new Set<string>();

  for (const season of seasonNames) {
    const leagueId = getLeagueIdForSeason(season);
    if (!leagueId) continue;

    const teams = await getTeamsData(leagueId).catch(() => []);
    const franchiseTeam = teams.find((team) => String(team.ownerId) === franchiseId);
    if (!franchiseTeam) continue;

    if (season === CURRENT_SEASON) {
      currentRosterIds = new Set((franchiseTeam.players || []).map(String));
    }

    const endWeek = await attributionEndWeekForSeason(season);
    if (endWeek <= 0) continue;

    const attribution = await buildSeasonPlayerWeeklyAttribution(leagueId, endWeek).catch(
      () => ({} as Awaited<ReturnType<typeof buildSeasonPlayerWeeklyAttribution>>),
    );
    if (season === CURRENT_SEASON) {
      const stagedWeek = attribution[String(endWeek)];
      if (stagedWeek && !Object.values(stagedWeek).some((row) => Math.abs(Number(row.points) || 0) > 0)) {
        delete attribution[String(endWeek)];
      }
    }

    for (const week of Object.values(attribution)) {
      for (const [playerId, stat] of Object.entries(week)) {
        if (Number(stat.rosterId) !== Number(franchiseTeam.rosterId)) continue;
        const existing = aggregates.get(playerId) ?? {
          playerId,
          seasons: new Set<string>(),
          firstSeason: null,
          lastSeason: null,
          totalPoints: 0,
          rosteredWeeks: 0,
          starts: 0,
          currentlyOnFranchise: false,
        };
        existing.seasons.add(season);
        existing.firstSeason = existing.firstSeason == null || season < existing.firstSeason ? season : existing.firstSeason;
        existing.lastSeason = existing.lastSeason == null || season > existing.lastSeason ? season : existing.lastSeason;
        existing.totalPoints += Number(stat.points) || 0;
        if (stat.rostered) existing.rosteredWeeks += 1;
        if (stat.started) existing.starts += 1;
        aggregates.set(playerId, existing);
      }
    }
  }

  for (const playerId of currentRosterIds) {
    const existing = aggregates.get(playerId);
    if (existing) existing.currentlyOnFranchise = true;
  }

  const aggregatedResult: HallOfFameCandidate[] = Array.from(aggregates.values()).map((aggregate) => {
    const meta = allPlayers[aggregate.playerId];
    const playerName = meta
      ? `${meta.first_name || ''} ${meta.last_name || ''}`.trim() || aggregate.playerId
      : aggregate.playerId;
    return {
      playerId: aggregate.playerId,
      playerName,
      position: meta?.position || null,
      nflTeam: meta?.team || null,
      headshotUrl: `https://sleepercdn.com/content/nfl/players/${aggregate.playerId}.jpg`,
      seasons: Array.from(aggregate.seasons).sort(),
      firstSeason: aggregate.firstSeason,
      lastSeason: aggregate.lastSeason,
      totalPoints: Number(aggregate.totalPoints.toFixed(2)),
      rosteredWeeks: aggregate.rosteredWeeks,
      starts: aggregate.starts,
      currentlyOnFranchise: aggregate.currentlyOnFranchise,
    };
  });

  // Hall induction stats must use the same canonical franchise slice as the player profile.
  // This prevents a player's overall EVW career total from leaking into a specific team's
  // induction screen when that player has played for more than one franchise.
  const result: HallOfFameCandidate[] = [];
  for (const candidate of aggregatedResult) {
    const profile = await getPlayerProfile(candidate.playerId).catch(() => null);
    const franchiseCareer = profile?.evwCareer.franchises.find(
      (career) => canonicalizeTeamName(career.franchiseName) === canonicalizeTeamName(franchiseName),
    );

    if (!franchiseCareer) {
      result.push(candidate);
      continue;
    }

    result.push({
      ...candidate,
      seasons: [...franchiseCareer.seasons].sort(),
      firstSeason: franchiseCareer.firstSeason,
      lastSeason: franchiseCareer.lastSeason,
      totalPoints: Number(franchiseCareer.totalPoints.toFixed(2)),
      rosteredWeeks: franchiseCareer.rosteredWeeks,
      starts: franchiseCareer.starts,
    });
  }

  result.sort((a, b) => b.totalPoints - a.totalPoints || b.starts - a.starts || a.playerName.localeCompare(b.playerName));

  franchiseHistoryCache.set(franchiseId, { ts: Date.now(), data: result });
  return result;
}

async function enrichEntry(row: HallOfFameDbEntry): Promise<HallOfFameEntryPublic> {
  const franchiseName = getFranchiseNameForId(row.franchiseId);
  const profile = await getPlayerProfile(row.playerId).catch(() => null);
  const franchiseCareer = profile?.evwCareer.franchises.find(
    (career) => canonicalizeTeamName(career.franchiseName) === canonicalizeTeamName(franchiseName),
  );
  const career = franchiseCareer
    ? {
        seasons: franchiseCareer.seasons,
        firstSeason: franchiseCareer.firstSeason,
        lastSeason: franchiseCareer.lastSeason,
        totalPoints: franchiseCareer.totalPoints,
        rosteredWeeks: franchiseCareer.rosteredWeeks,
        starts: franchiseCareer.starts,
      }
    : blankCareer();

  return {
    id: row.id,
    franchiseId: row.franchiseId,
    franchiseName,
    playerId: row.playerId,
    playerName: profile?.identity.fullName ?? row.playerId,
    position: profile?.identity.position ?? null,
    nflTeam: profile?.identity.nflTeam ?? null,
    headshotUrl: profile?.identity.headshotUrl ?? `https://sleepercdn.com/content/nfl/players/${row.playerId}.jpg`,
    inductionYear: row.inductionYear,
    bio: row.bio,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    career,
  };
}

export async function getHallOfFameIndex(): Promise<HallOfFameIndexResponse> {
  const rows = await listActiveHallOfFameEntries();
  const entries: HallOfFameEntryPublic[] = [];
  for (const row of rows) entries.push(await enrichEntry(row));
  return { franchises: getHallOfFameFranchises(), entries };
}

export async function getPlayerHallOfFameHonors(playerId: string): Promise<PlayerHallOfFameHonor[]> {
  const rows = await listActiveHallOfFameEntriesForPlayer(playerId);
  return rows.map((row) => ({
    id: row.id,
    franchiseId: row.franchiseId,
    franchiseName: getFranchiseNameForId(row.franchiseId),
    inductionYear: row.inductionYear,
    bio: row.bio,
  }));
}
