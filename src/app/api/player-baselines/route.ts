import { NextRequest, NextResponse } from 'next/server';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getLeague, getNFLState } from '@/lib/utils/sleeper-api';
import { getLeagueScoredBaselinesV3, projectWeeklyPlayersV3 } from '@/lib/fantasy/weekly-projections-next';
import { getLeagueScoredBaselines } from '@/lib/fantasy/weekly-projections';
import { PROJECTION_MODEL_VERSION, numericScoring } from '@/lib/fantasy/weekly-projection-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function parsePlayersParam(param: string | null): string[] {
  if (!param) return [];
  return Array.from(new Set(
    param
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ));
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

    const emptyPrevious: Awaited<ReturnType<typeof getLeagueScoredBaselines>> = {};
    const [baselines, previous] = await Promise.all([
      getLeagueScoredBaselinesV3({ season, throughWeek, playerIds: players }),
      compare
        ? getLeagueScoredBaselines({ season, throughWeek, playerIds: players }).catch(() => emptyPrevious)
        : Promise.resolve(emptyPrevious),
    ]);

    const comparison = compare
      ? Object.fromEntries(players.map((playerId) => {
          const current = baselines[playerId]?.mean ?? 0;
          const old = previous[playerId]?.mean ?? 0;
          return [playerId, {
            old: Number(old.toFixed(1)),
            new: Number(current.toFixed(1)),
            delta: Number((current - old).toFixed(1)),
          }];
        }))
      : undefined;

    let details: Record<string, unknown> | undefined;
    if (includeDetails) {
      const leagueId = getLeagueIdForSeason(season);
      if (leagueId) {
        const league = await getLeague(leagueId);
        const historicalMode = Number(season) < Number(state.season || new Date().getFullYear());
        const result = await projectWeeklyPlayersV3({
          season,
          week: Math.max(1, Math.min(18, throughWeek + 1)),
          playerIds: players,
          scoringSettings: numericScoring(league.scoring_settings),
          leagueId,
          historicalMode,
          saveOverrides: !historicalMode,
        });
        details = Object.fromEntries(result.players.map((player) => [player.id, {
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
      { headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=900' } },
    );
  } catch (error) {
    console.error('player-baselines API error', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
