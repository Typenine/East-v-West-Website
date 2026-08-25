import { neon } from "@neondatabase/serverless";
import type { LineupOptimizerResponse } from "@/lib/fantasy/lineup-types";
import { loadScheduleWeek } from "@/lib/fantasy/weekly-projection-data";

function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;
}

export async function savePregameProjectionSnapshot(args: {
  response: LineupOptimizerResponse;
  earliestKickoff: string | null;
}): Promise<void> {
  const now = Date.now();
  const schedule = await loadScheduleWeek(args.response.season, args.response.week).catch(() => null);
  const futureKickoffs = (args.response.projectedPlayers || [])
    .flatMap((player) => {
      const kickoff = player.nflTeam && schedule?.kickoffByTeam
        ? schedule.kickoffByTeam[player.nflTeam]
        : null;
      const kickoffMs = kickoff ? Date.parse(kickoff) : NaN;
      return Number.isFinite(kickoffMs) && kickoffMs > now ? [kickoffMs] : [];
    });

  if (schedule?.hasGames && schedule.seasonValidated && futureKickoffs.length === 0) return;

  const fallbackKickoffMs = args.earliestKickoff ? Date.parse(args.earliestKickoff) : NaN;
  if (!schedule && Number.isFinite(fallbackKickoffMs) && now >= fallbackKickoffMs) return;

  const nextKickoff = futureKickoffs.length
    ? new Date(Math.min(...futureKickoffs)).toISOString()
    : args.earliestKickoff;

  const url = databaseUrl();
  if (!url) return;
  try {
    const sql = neon(url);
    const snapshotDate = new Date().toISOString().slice(0, 10);
    await sql`
      INSERT INTO weekly_projection_snapshots (
        season, week, team, model_version, phase, snapshot_date,
        generated_at, earliest_kickoff, payload
      ) VALUES (
        ${Number(args.response.season)}, ${args.response.week}, ${args.response.teamName},
        ${args.response.modelVersion}, ${args.response.projectionPhase}, ${snapshotDate}::date,
        ${args.response.generatedAt}::timestamptz,
        ${nextKickoff}::timestamptz,
        ${JSON.stringify(args.response)}::jsonb
      )
      ON CONFLICT (season, week, team, model_version, phase, snapshot_date)
      DO NOTHING
    `;
  } catch (error) {
    console.warn("[weekly-projections] unable to save pregame snapshot", error);
  }
}

export async function loadLatestProjectionSnapshot(args: {
  season: number;
  week: number;
  team: string;
}): Promise<LineupOptimizerResponse | null> {
  const url = databaseUrl();
  if (!url) return null;
  try {
    const sql = neon(url);
    const rows = await sql`
      SELECT payload
      FROM weekly_projection_snapshots
      WHERE season = ${args.season}
        AND week = ${args.week}
        AND team = ${args.team}
      ORDER BY generated_at DESC
      LIMIT 1
    ` as Array<{ payload: LineupOptimizerResponse }>;
    return rows[0]?.payload || null;
  } catch (error) {
    console.warn("[weekly-projections] unable to load projection snapshot", error);
    return null;
  }
}
