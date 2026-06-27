import { neon } from '@neondatabase/serverless';

export type ProjectionOverrideRecord = {
  id: number;
  season: number | null;
  week: number | null;
  playerId: string | null;
  nflTeam: string | null;
  roleLabel: string | null;
  activeProbability: number | null;
  startProbability: number | null;
  targetShare: number | null;
  carryShare: number | null;
  passAttemptShare: number | null;
  teamPassAttempts: number | null;
  teamRushAttempts: number | null;
  projectionPoints: number | null;
  note: string | null;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ProjectionOverrideInput = Omit<ProjectionOverrideRecord, 'id' | 'active' | 'createdAt' | 'updatedAt'> & {
  active?: boolean;
};

function databaseUrl(): string | null {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || null;
}

function nullableNumber(value: unknown): number | null {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nullableString(value: unknown): string | null {
  const parsed = typeof value === 'string' ? value.trim() : '';
  return parsed || null;
}

function rowToOverride(row: Record<string, unknown>): ProjectionOverrideRecord {
  return {
    id: Number(row.id),
    season: nullableNumber(row.season),
    week: nullableNumber(row.week),
    playerId: nullableString(row.player_id),
    nflTeam: nullableString(row.nfl_team)?.toUpperCase() || null,
    roleLabel: nullableString(row.role_label),
    activeProbability: nullableNumber(row.active_probability),
    startProbability: nullableNumber(row.start_probability),
    targetShare: nullableNumber(row.target_share),
    carryShare: nullableNumber(row.carry_share),
    passAttemptShare: nullableNumber(row.pass_attempt_share),
    teamPassAttempts: nullableNumber(row.team_pass_attempts),
    teamRushAttempts: nullableNumber(row.team_rush_attempts),
    projectionPoints: nullableNumber(row.projection_points),
    note: nullableString(row.note),
    expiresAt: row.expires_at ? new Date(String(row.expires_at)).toISOString() : null,
    active: Boolean(row.active),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

export function sanitizeProjectionOverride(input: Record<string, unknown>): ProjectionOverrideInput {
  const season = nullableNumber(input.season);
  const week = nullableNumber(input.week);
  const playerId = nullableString(input.playerId);
  const nflTeam = nullableString(input.nflTeam)?.toUpperCase() || null;
  if (!playerId && !nflTeam) throw new Error('A player ID or NFL team is required.');
  if (week != null && (week < 1 || week > 18)) throw new Error('Week must be between 1 and 18.');

  const probability = (value: unknown, label: string): number | null => {
    const parsed = nullableNumber(value);
    if (parsed != null && (parsed < 0 || parsed > 1)) throw new Error(`${label} must be between 0 and 1.`);
    return parsed;
  };

  return {
    season,
    week,
    playerId,
    nflTeam,
    roleLabel: nullableString(input.roleLabel),
    activeProbability: probability(input.activeProbability, 'Active probability'),
    startProbability: probability(input.startProbability, 'Start probability'),
    targetShare: probability(input.targetShare, 'Target share'),
    carryShare: probability(input.carryShare, 'Carry share'),
    passAttemptShare: probability(input.passAttemptShare, 'Pass-attempt share'),
    teamPassAttempts: nullableNumber(input.teamPassAttempts),
    teamRushAttempts: nullableNumber(input.teamRushAttempts),
    projectionPoints: nullableNumber(input.projectionPoints),
    note: nullableString(input.note),
    expiresAt: nullableString(input.expiresAt),
    active: input.active !== false,
  };
}

export async function listProjectionOverrides(args?: {
  includeInactive?: boolean;
  season?: number;
  week?: number;
}): Promise<ProjectionOverrideRecord[]> {
  const url = databaseUrl();
  if (!url) return [];
  const sql = neon(url);
  const includeInactive = Boolean(args?.includeInactive);
  const season = args?.season ?? null;
  const week = args?.week ?? null;
  const rows = await sql`
    SELECT *
    FROM projection_overrides
    WHERE (${includeInactive} OR active = true)
      AND (${season}::integer IS NULL OR season IS NULL OR season = ${season})
      AND (${week}::integer IS NULL OR week IS NULL OR week = ${week})
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY
      (season IS NOT NULL)::integer DESC,
      (week IS NOT NULL)::integer DESC,
      updated_at ASC,
      id ASC
  ` as Array<Record<string, unknown>>;
  return rows.map(rowToOverride);
}

export async function loadApplicableProjectionOverrides(args: {
  season: number;
  week: number;
}): Promise<{
  byPlayer: Map<string, ProjectionOverrideRecord>;
  byTeam: Map<string, ProjectionOverrideRecord>;
}> {
  const rows = await listProjectionOverrides({ season: args.season, week: args.week });
  const byPlayer = new Map<string, ProjectionOverrideRecord>();
  const byTeam = new Map<string, ProjectionOverrideRecord>();
  for (const row of rows) {
    if (row.playerId) byPlayer.set(row.playerId, row);
    if (row.nflTeam && !row.playerId) byTeam.set(row.nflTeam, row);
  }
  return { byPlayer, byTeam };
}

export async function createProjectionOverride(input: ProjectionOverrideInput): Promise<ProjectionOverrideRecord> {
  const url = databaseUrl();
  if (!url) throw new Error('Database is not configured.');
  const sql = neon(url);
  const rows = await sql`
    INSERT INTO projection_overrides (
      season, week, player_id, nfl_team, role_label,
      active_probability, start_probability, target_share, carry_share,
      pass_attempt_share, team_pass_attempts, team_rush_attempts,
      projection_points, note, expires_at, active, updated_at
    ) VALUES (
      ${input.season}, ${input.week}, ${input.playerId}, ${input.nflTeam}, ${input.roleLabel},
      ${input.activeProbability}, ${input.startProbability}, ${input.targetShare}, ${input.carryShare},
      ${input.passAttemptShare}, ${input.teamPassAttempts}, ${input.teamRushAttempts},
      ${input.projectionPoints}, ${input.note}, ${input.expiresAt}::timestamptz,
      ${input.active !== false}, now()
    )
    RETURNING *
  ` as Array<Record<string, unknown>>;
  return rowToOverride(rows[0]);
}

export async function setProjectionOverrideActive(id: number, active: boolean): Promise<ProjectionOverrideRecord | null> {
  const url = databaseUrl();
  if (!url) return null;
  const sql = neon(url);
  const rows = await sql`
    UPDATE projection_overrides
    SET active = ${active}, updated_at = now()
    WHERE id = ${id}
    RETURNING *
  ` as Array<Record<string, unknown>>;
  return rows[0] ? rowToOverride(rows[0]) : null;
}

export async function deleteProjectionOverride(id: number): Promise<boolean> {
  const url = databaseUrl();
  if (!url) return false;
  const sql = neon(url);
  const rows = await sql`DELETE FROM projection_overrides WHERE id = ${id} RETURNING id` as Array<{ id: number }>;
  return rows.length > 0;
}
