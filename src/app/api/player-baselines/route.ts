import { NextRequest, NextResponse } from 'next/server';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getLeague, getNFLState } from '@/lib/utils/sleeper-api';
import { projectWeeklyPlayersV3 } from '@/lib/fantasy/weekly-projections-next';
import { getLeagueScoredBaselines } from '@/lib/fantasy/weekly-projections';
import { PROJECTION_MODEL_VERSION, numericScoring } from '@/lib/fantasy/weekly-projection-data';
import type { WeeklyProjectedPlayer } from '@/lib/fantasy/lineup-types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type MatchupBaseline = {
  mean: number;
  stddev: number;
  games: number;
  last3Avg: number;
  decayedMean: number;
};

function parsePlayersParam(param: string | null): string[] {
  if (!param) return [];
  return Array.from(new Set(
    param
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ));
}

/**
 * RosterColumn and WinProbability pre-date the V3 projection engine. They treat
 * `games < 6` as a reason to shrink a baseline back toward a generic positional
 * mean, and then apply availability once more on top of the supplied baseline.
 *
 * V3 already models role, availability, matchup, team opportunity and external
 * projection anchors. Feed those legacy live-game consumers an authoritative
 * full-game baseline instead of letting them flatten V3 back to QB/RB/WR
 * defaults. The availability adjustment is backed out here because those two
 * consumers re-apply the same probability while calculating remaining points.
 */
function toMatchupBaseline(player: WeeklyProjectedPlayer): MatchupBaseline {
  const activeProbability = Number.isFinite(player.activeProbability)
    ? Math.max(0, Math.min(1, player.activeProbability))
    : 1;
  const divisor = activeProbability > 0 ? activeProbability : 1;
  const fullGameMean = player.projection / divisor;
  const projectedSd = Math.max(0.1, (player.rangeHigh - player.rangeLow) / 2.564);
  const fullGameSd = projectedSd / Math.sqrt(Math.max(0.01, divisor));

  return {
    mean: Number(fullGameMean.toFixed(3)),
    stddev: Number(fullGameSd.toFixed(3)),
    // Six tells the legacy matchup UI that this is an authoritative projection,
    // not a sparse historical average that should be shrunk to a position prior.
    games: 6,
    last3Avg: Number(fullGameMean.toFixed(3)),
    decayedMean: Number(fullGameMean.toFixed(3)),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const players = parsePlayersParam(searchParams.get('players'));
    if (!players.length) {
      return NextResponse.json({ error: 'missing_players' }, { status: 400 });
    }

    const state = await getNFLState().catch(() => ({
      season: String(new Date().getFullYear()),
      week: 1,
      display_week: 1,
    }));
    const season = searchParams.get('season') || String(state.season || new Date().getFullYear());
    const requestedThroughWeek = Number(searchParams.get('throughWeek'));
    const throughWeek = Number.isFinite(requestedThroughWeek)
      ? Math.max(0, Math.min(18, requestedThroughWeek))
      : Math.max(0, Number(state.week ?? state.display_week ?? 1) - 1);
    const compare = searchParams.get('compare') === '1';
    const includeDetails = searchParams.get('details') === '1';

    const leagueId = getLeagueIdForSeason(season);
    const historicalMode = Number(season) < Number(state.season || new Date().getFullYear());
    let projectionResult: Awaited<ReturnType<typeof projectWeeklyPlayersV3>> | null = null;
    let baselines: Record<string, MatchupBaseline> = {};

    if (leagueId) {
      const league = await getLeague(leagueId);
      projectionResult = await projectWeeklyPlayersV3({
        season,
        week: Math.max(1, Math.min(18, throughWeek + 1)),
        playerIds: players,
        scoringSettings: numericScoring(league.scoring_settings),
        leagueId,
        historicalMode,
        saveOverrides: !historicalMode,
      });
      baselines = Object.fromEntries(
        projectionResult.players.map((player) => [player.id, toMatchupBaseline(player)]),
      );
    }

    const emptyPrevious: Awaited<ReturnType<typeof getLeagueScoredBaselines>> = {};
    const previous = compare
      ? await getLeagueScoredBaselines({ season, throughWeek, playerIds: players }).catch(() => emptyPrevious)
      : emptyPrevious;

    const rawProjectionById = new Map(
      (projectionResult?.players || []).map((player) => [player.id, player.projection] as const),
    );
    const comparison = compare
      ? Object.fromEntries(players.map((playerId) => {
          const current = rawProjectionById.get(playerId) ?? 0;
          const old = previous[playerId]?.mean ?? 0;
          return [playerId, {
            old: Number(old.toFixed(1)),
            new: Number(current.toFixed(1)),
            delta: Number((current - old).toFixed(1)),
          }];
        }))
      : undefined;

    let details: Record<string, unknown> | undefined;
    if (includeDetails && projectionResult) {
      details = Object.fromEntries(projectionResult.players.map((player) => [player.id, {
        id: player.id,
        name: player.name,
        position: player.position,
        nflTeam: player.nflTeam,
        projection: player.projection,
        expectedRole: player.expectedRole,
        workload: player.workload,
        workloadProbability: player.workloadProbability,
        roleTrend: player.roleTrend,
        historicalGames: player.historicalGames,
        dataQuality: player.dataQuality,
        dataQualityNotes: player.dataQualityNotes,
        targetShare: player.targetShare,
        carryShare: player.carryShare,
        externalProjectionPoints: player.externalProjectionPoints,
        externalProjectionWeight: player.externalProjectionWeight,
        externalProjectionSource: player.externalProjectionSource,
        externalProjectionDisagreement: player.externalProjectionDisagreement,
        statLine: player.statLine,
        assumption: player.assumption,
        projectionTrace: player.projectionTrace,
      }]));
    }

    return NextResponse.json(
      {
        season,
        throughWeek,
        players: players.length,
        modelVersion: PROJECTION_MODEL_VERSION,
        baselines,
        comparison,
        details,
      },
      { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    console.error('player-baselines API error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
