import { getPlayerProfile } from '@/lib/players/player-profile-service';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import { buildAllEvwTeams } from '@/lib/history/league-history';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getSeasonAwardsUsingLeagueScoring, type SeasonAwards } from '@/lib/utils/sleeper-api';
import type { PlayerHonor, PlayerProfileWithHonors } from '@/lib/types/player-honors';

const HONORS_CACHE_TTL_MS = 5 * 60 * 1000;
let honorsIndexCache: { ts: number; data: Map<string, PlayerHonor[]> } | null = null;

function addHonor(index: Map<string, PlayerHonor[]>, playerId: string, honor: PlayerHonor) {
  const rows = index.get(playerId) || [];
  rows.push(honor);
  index.set(playerId, rows);
}

function honorSort(a: PlayerHonor, b: PlayerHonor): number {
  if (a.season !== b.season) return b.season.localeCompare(a.season);
  const rank: Record<PlayerHonor['kind'], number> = {
    mvp: 0,
    rookie_of_year: 1,
    all_evw_first: 2,
    all_evw_second: 3,
  };
  return rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label);
}

async function loadSeasonAwards(season: string, regularSeasonEndWeek: number): Promise<SeasonAwards | null> {
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId || regularSeasonEndWeek <= 0) return null;
  try {
    return await getSeasonAwardsUsingLeagueScoring(season, leagueId, regularSeasonEndWeek);
  } catch {
    return null;
  }
}

async function buildHonorsIndex(): Promise<Map<string, PlayerHonor[]>> {
  const cached = honorsIndexCache;
  if (cached && Date.now() - cached.ts < HONORS_CACHE_TTL_MS) return cached.data;

  const index = new Map<string, PlayerHonor[]>();
  const dataset = await getLeagueStatsDatasetV3();
  const allEvwSeasons = buildAllEvwTeams(dataset);

  for (const season of allEvwSeasons) {
    for (const row of season.firstTeam) {
      addHonor(index, row.playerId, {
        id: `${season.season}:all-evw-first:${row.playerId}`,
        season: season.season,
        kind: 'all_evw_first',
        label: 'First Team All-EVW',
        position: row.position,
        slot: row.slot,
        source: 'statistical',
      });
    }
    for (const row of season.secondTeam) {
      addHonor(index, row.playerId, {
        id: `${season.season}:all-evw-second:${row.playerId}`,
        season: season.season,
        kind: 'all_evw_second',
        label: 'Second Team All-EVW',
        position: row.position,
        slot: row.slot,
        source: 'statistical',
      });
    }
  }

  // Reuse the league's existing historical MVP/ROY calculation instead of maintaining
  // a second manual awards list. The end week is taken from the corrected Stats dataset,
  // so postseason scoring never leaks into a regular-season annual award.
  const awardSeasons = dataset.seasons
    .map((season) => ({
      season,
      endWeek: Math.max(
        0,
        ...dataset.games
          .filter((game) => game.season === season && game.gameType === 'regular')
          .map((game) => game.week),
      ),
    }))
    .filter((row) => row.endWeek > 0);

  const seasonAwards = await Promise.all(
    awardSeasons.map((row) => loadSeasonAwards(row.season, row.endWeek)),
  );

  for (const awards of seasonAwards) {
    if (!awards) continue;
    for (const winner of awards.mvp) {
      addHonor(index, winner.playerId, {
        id: `${awards.season}:mvp:${winner.playerId}`,
        season: awards.season,
        kind: 'mvp',
        label: 'East v. West MVP',
        source: 'statistical',
      });
    }
    for (const winner of awards.roy) {
      addHonor(index, winner.playerId, {
        id: `${awards.season}:rookie-of-year:${winner.playerId}`,
        season: awards.season,
        kind: 'rookie_of_year',
        label: 'East v. West Rookie of the Year',
        source: 'statistical',
      });
    }
  }

  for (const rows of index.values()) rows.sort(honorSort);
  honorsIndexCache = { ts: Date.now(), data: index };
  return index;
}

export async function getPlayerHonors(playerId: string): Promise<PlayerHonor[]> {
  const index = await buildHonorsIndex();
  return [...(index.get(playerId) || [])];
}

export async function getPlayerProfileWithHonors(playerId: string): Promise<PlayerProfileWithHonors | null> {
  const [profile, honors] = await Promise.all([
    getPlayerProfile(playerId),
    getPlayerHonors(playerId).catch(() => [] as PlayerHonor[]),
  ]);
  if (!profile) return null;
  return { ...profile, honors };
}
