import { getLeagueIdForSeason } from "@/lib/constants/league";
import { getLeagueMatchups, getNFLState } from "@/lib/utils/sleeper-api";
import {
  buildLeagueProjectionSnapshotsV3,
  PROJECTION_MODEL_VERSION,
} from "@/lib/fantasy/weekly-projections-next";
import { loadAllProjectionSnapshotsForWeek } from "@/lib/fantasy/projection-snapshot-store";
import {
  buildProjectionValidation,
  saveProjectionValidation,
} from "@/lib/fantasy/projection-calibration";
import { loadScheduleWeek } from "@/lib/fantasy/weekly-projection-data";
import type { LineupOptimizerResponse, WeeklyProjectedPlayer } from "@/lib/fantasy/lineup-types";

type SelectedPregameProjection = {
  response: LineupOptimizerResponse;
  player: WeeklyProjectedPlayer;
  generatedAt: string;
};

function selectLatestPregameProjections(
  snapshots: LineupOptimizerResponse[],
  kickoffByTeam: Record<string, string>,
): Map<string, SelectedPregameProjection> {
  const selected = new Map<string, SelectedPregameProjection>();

  for (const response of snapshots) {
    const generatedMs = Date.parse(response.generatedAt);
    if (!Number.isFinite(generatedMs)) continue;

    for (const player of response.projectedPlayers || []) {
      const kickoffIso = player.nflTeam ? kickoffByTeam[player.nflTeam] : undefined;
      const kickoffMs = kickoffIso ? Date.parse(kickoffIso) : NaN;
      if (Number.isFinite(kickoffMs) && generatedMs >= kickoffMs) continue;

      const key = `${response.teamName}:${player.id}`;
      const existing = selected.get(key);
      if (!existing || Date.parse(existing.generatedAt) < generatedMs) {
        selected.set(key, {
          response,
          player,
          generatedAt: response.generatedAt,
        });
      }
    }
  }

  return selected;
}

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
        const [snapshots, matchups, schedule] = await Promise.all([
          loadAllProjectionSnapshotsForWeek({
            season,
            week,
            modelVersion: PROJECTION_MODEL_VERSION,
          }),
          getLeagueMatchups(leagueId, week).catch(() => []),
          loadScheduleWeek(String(season), week),
        ]);

        const actualByPlayer = new Map<string, number>();
        for (const matchup of matchups) {
          for (const [id, points] of Object.entries(matchup.players_points || {})) {
            const value = Number(points);
            if (Number.isFinite(value)) actualByPlayer.set(id, value);
          }
        }

        const selected = selectLatestPregameProjections(snapshots, schedule.kickoffByTeam);
        const teams = new Set<string>();

        for (const item of selected.values()) {
          if (!actualByPlayer.has(item.player.id)) continue;
          teams.add(item.response.teamName);

          const responseForPlayer: LineupOptimizerResponse = {
            ...item.response,
            generatedAt: item.generatedAt,
            projectedPlayers: [item.player],
            currentLineup: [],
            optimalLineup: [],
            available: false,
          };

          const validation = buildProjectionValidation({
            response: responseForPlayer,
            actualByPlayer,
            source: "live",
          });
          validationRows.push(...validation.rows);
          validatedRows += validation.rows.length;
        }

        validatedTeams += teams.size;
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
