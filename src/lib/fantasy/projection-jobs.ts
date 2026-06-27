import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getLeagueMatchups, getNFLState } from '@/lib/utils/sleeper-api';
import {
  buildLeagueProjectionSnapshotsV3,
  PROJECTION_MODEL_VERSION,
} from '@/lib/fantasy/weekly-projections-next';
import { loadProjectionSnapshotsForWeek } from '@/lib/fantasy/projection-snapshot-store';
import {
  buildProjectionValidation,
  saveProjectionValidation,
} from '@/lib/fantasy/projection-calibration';

export async function runProjectionSnapshotJob() {
  const state = await getNFLState();
  const season = Number(state.season || new Date().getFullYear());
  const currentWeek = Math.max(1, Math.min(18, Number(state.week ?? state.display_week ?? 1)));
  let validatedRows = 0;
  let validatedTeams = 0;

  if (currentWeek > 1) {
    const leagueId = getLeagueIdForSeason(season);
    if (leagueId) {
      const validationRows = [];
      const firstWeek = Math.max(1, currentWeek - 3);
      for (let week = firstWeek; week < currentWeek; week += 1) {
        const [snapshots, matchups] = await Promise.all([
          loadProjectionSnapshotsForWeek({ season, week, modelVersion: PROJECTION_MODEL_VERSION }),
          getLeagueMatchups(leagueId, week).catch(() => []),
        ]);
        const actualByPlayer = new Map<string, number>();
        for (const matchup of matchups) {
          for (const [id, points] of Object.entries(matchup.players_points || {})) {
            const value = Number(points);
            if (Number.isFinite(value)) actualByPlayer.set(id, value);
          }
        }
        for (const snapshot of snapshots) {
          const validation = buildProjectionValidation({ response: snapshot, actualByPlayer, source: 'live' });
          validationRows.push(...validation.rows);
          validatedRows += validation.rows.length;
          validatedTeams += 1;
        }
      }
      await saveProjectionValidation(validationRows);
    }
  }

  const snapshots = await buildLeagueProjectionSnapshotsV3();
  return {
    ok: true,
    modelVersion: PROJECTION_MODEL_VERSION,
    generatedSnapshots: snapshots.length,
    season,
    week: currentWeek,
    validatedTeams,
    validatedRows,
  };
}
