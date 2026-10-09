import type { Metadata } from 'next';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import type { StatsRookieLeaderRow } from '@/lib/stats/types';
import {
  computeSeasonTotalsCustomScoringFromStats,
  getAllPlayersCached,
  getNFLSeasonStats,
  getTeamsData,
  type SleeperNFLSeasonPlayerStats,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import StatsReferenceRouter from './StatsReferenceRouter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'League Statistics — East v. West',
  description: 'East v. West player, franchise, season, game and record-book statistics.',
};

function round1(value: number): number {
  return Number((Number(value) || 0).toFixed(1));
}

async function loadCurrentSeasonRookieLeaders(): Promise<StatsRookieLeaderRow[]> {
  const leagueId = LEAGUE_IDS.CURRENT;
  const options = { timeoutMs: 5000, retries: 1, retryDelayMs: 150 } as const;

  const teams = await getTeamsData(leagueId, options).catch(() => []);
  const completedWeeks = teams.length
    ? Math.max(0, Math.min(...teams.map((team) => team.wins + team.losses + team.ties)))
    : 0;
  if (completedWeeks <= 0) return [];

  const [totals, players, seasonStats] = await Promise.all([
    computeSeasonTotalsCustomScoringFromStats(CURRENT_SEASON, leagueId, completedWeeks, options).catch(() => ({} as Record<string, number>)),
    getAllPlayersCached(12 * 60 * 60 * 1000, options).catch(() => ({} as Record<string, SleeperPlayer>)),
    getNFLSeasonStats(CURRENT_SEASON, 15 * 60 * 1000, options).catch(() => ({} as Record<string, SleeperNFLSeasonPlayerStats>)),
  ]);

  const ownerByPlayer = new Map<string, string>();
  for (const team of teams) {
    for (const playerId of team.players || []) {
      if (playerId) ownerByPlayer.set(playerId, team.teamName);
    }
  }

  const seasonNumber = Number(CURRENT_SEASON);
  return Object.entries(totals)
    .map(([playerId, rawPoints]) => {
      const player = players[playerId];
      if (!player) return null;

      const explicitRookieYear = Number(player.rookie_year ?? NaN);
      const isRookie =
        (Number.isFinite(explicitRookieYear) && explicitRookieYear === seasonNumber) ||
        (!Number.isFinite(explicitRookieYear) && Number(player.years_exp) === 0) ||
        Number(player.years_exp) === 0;
      if (!isRookie) return null;

      const points = Number(rawPoints);
      if (!Number.isFinite(points) || points <= 0) return null;

      const stats = seasonStats[playerId];
      const rawGames = Number(stats?.gp ?? stats?.gms_active ?? 0);
      const gamesPlayed = Number.isFinite(rawGames)
        ? Math.max(0, Math.min(completedWeeks, Math.floor(rawGames)))
        : 0;
      const ppg = gamesPlayed > 0 ? points / gamesPlayed : points / completedWeeks;
      const name = `${player.first_name || ''} ${player.last_name || ''}`.trim() || playerId;

      return {
        playerId,
        name,
        position: player.position || 'UNK',
        nflTeam: player.team || null,
        points: round1(points),
        gamesPlayed,
        ppg: round1(ppg),
        ownerTeam: ownerByPlayer.get(playerId) || null,
      } satisfies StatsRookieLeaderRow;
    })
    .filter((row): row is StatsRookieLeaderRow => Boolean(row))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
}

export default async function LeagueStatsPage() {
  const [dataset, currentSeasonRookies] = await Promise.all([
    getLeagueStatsDatasetV3(),
    loadCurrentSeasonRookieLeaders(),
  ]);
  return <StatsReferenceRouter dataset={dataset} currentSeasonRookies={currentSeasonRookies} />;
}
