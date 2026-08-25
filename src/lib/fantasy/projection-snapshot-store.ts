import { neon } from "@neondatabase/serverless";
import type { LineupOptimizerResponse } from "@/lib/fantasy/lineup-types";

function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;
}

function withDisplayFallback(payload: LineupOptimizerResponse): LineupOptimizerResponse {
  const hasCurrentLineup = (payload.currentLineup || []).some((entry) => Boolean(entry.player));
  const hasCurrentTotal = payload.currentTotal !== null && payload.currentTotal !== undefined;

  if (hasCurrentLineup && hasCurrentTotal) return payload;

  return {
    ...payload,
    currentTotal: hasCurrentTotal ? payload.currentTotal : payload.optimalTotal,
    currentLineup: hasCurrentLineup ? payload.currentLineup : payload.optimalLineup,
  };
}

export async function loadProjectionSnapshotsForWeek(args: {
  season: number;
  week: number;
  modelVersion?: string;
}): Promise<LineupOptimizerResponse[]> {
  const url = databaseUrl();
  if (!url) return [];
  try {
    const sql = neon(url);
    const version = args.modelVersion || null;
    const rows = await sql`
      SELECT DISTINCT ON (team) payload
      FROM weekly_projection_snapshots
      WHERE season = ${args.season}
        AND week = ${args.week}
        AND (${version}::text IS NULL OR model_version = ${version})
      ORDER BY team, generated_at DESC
    ` as Array<{ payload: LineupOptimizerResponse }>;
    return rows.map((row) => row.payload).filter(Boolean).map(withDisplayFallback);
  } catch (error) {
    console.warn("[projection-snapshots] unable to load weekly snapshots", error);
    return [];
  }
}

export async function loadAllProjectionSnapshotsForWeek(args: {
  season: number;
  week: number;
  modelVersion?: string;
}): Promise<LineupOptimizerResponse[]> {
  const url = databaseUrl();
  if (!url) return [];
  try {
    const sql = neon(url);
    const version = args.modelVersion || null;
    const rows = await sql`
      SELECT payload
      FROM weekly_projection_snapshots
      WHERE season = ${args.season}
        AND week = ${args.week}
        AND (${version}::text IS NULL OR model_version = ${version})
      ORDER BY generated_at ASC
    ` as Array<{ payload: LineupOptimizerResponse }>;
    return rows.map((row) => row.payload).filter(Boolean);
  } catch (error) {
    console.warn("[projection-snapshots] unable to load validation snapshots", error);
    return [];
  }
}
