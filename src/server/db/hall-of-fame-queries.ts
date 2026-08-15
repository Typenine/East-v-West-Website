import { sql } from 'drizzle-orm';
import { getDb } from './client';

export interface HallOfFameDbEntry {
  id: string;
  franchiseId: string;
  playerId: string;
  inductionYear: number;
  bio: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  removedAt: string | null;
  removedBy: string | null;
  removalReason: string | null;
}

function rows(result: unknown): Record<string, unknown>[] {
  return ((result as { rows?: unknown[] }).rows ?? []) as Record<string, unknown>[];
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return String(value);
}

function rowToEntry(row: Record<string, unknown>): HallOfFameDbEntry {
  return {
    id: String(row.id),
    franchiseId: String(row.franchise_id),
    playerId: String(row.player_id),
    inductionYear: Number(row.induction_year),
    bio: String(row.bio ?? ''),
    createdBy: row.created_by == null ? null : String(row.created_by),
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    removedAt: toIso(row.removed_at),
    removedBy: row.removed_by == null ? null : String(row.removed_by),
    removalReason: row.removal_reason == null ? null : String(row.removal_reason),
  };
}

export async function listActiveHallOfFameEntries(): Promise<HallOfFameDbEntry[]> {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT *
      FROM team_hall_of_fame
      WHERE removed_at IS NULL
      ORDER BY induction_year DESC, created_at DESC, id DESC
    `);
    return rows(result).map(rowToEntry);
  } catch {
    return [];
  }
}

export async function listActiveHallOfFameEntriesForPlayer(playerId: string): Promise<HallOfFameDbEntry[]> {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT *
      FROM team_hall_of_fame
      WHERE player_id = ${playerId}
        AND removed_at IS NULL
      ORDER BY induction_year ASC, created_at ASC
    `);
    return rows(result).map(rowToEntry);
  } catch {
    return [];
  }
}

export async function getHallOfFameEntryById(id: string): Promise<HallOfFameDbEntry | null> {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      SELECT *
      FROM team_hall_of_fame
      WHERE id = ${id}::bigint
      LIMIT 1
    `);
    const row = rows(result)[0];
    return row ? rowToEntry(row) : null;
  } catch {
    return null;
  }
}

export async function upsertHallOfFameEntry(input: {
  franchiseId: string;
  playerId: string;
  inductionYear: number;
  bio: string;
  createdBy: string;
}): Promise<HallOfFameDbEntry | null> {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      INSERT INTO team_hall_of_fame (franchise_id, player_id, induction_year, bio, created_by, created_at, updated_at, removed_at, removed_by, removal_reason)
      VALUES (${input.franchiseId}, ${input.playerId}, ${input.inductionYear}, ${input.bio}, ${input.createdBy}, NOW(), NOW(), NULL, NULL, NULL)
      ON CONFLICT (franchise_id, player_id)
      DO UPDATE SET induction_year = EXCLUDED.induction_year, bio = EXCLUDED.bio, updated_at = NOW(), removed_at = NULL, removed_by = NULL, removal_reason = NULL
      RETURNING *
    `);
    const row = rows(result)[0];
    return row ? rowToEntry(row) : null;
  } catch {
    return null;
  }
}

export async function updateHallOfFameEntry(input: { id: string; inductionYear: number; bio: string }): Promise<HallOfFameDbEntry | null> {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      UPDATE team_hall_of_fame
      SET induction_year = ${input.inductionYear}, bio = ${input.bio}, updated_at = NOW()
      WHERE id = ${input.id}::bigint AND removed_at IS NULL
      RETURNING *
    `);
    const row = rows(result)[0];
    return row ? rowToEntry(row) : null;
  } catch {
    return null;
  }
}

export async function softRemoveHallOfFameEntry(input: { id: string; removedBy: string; reason?: string | null }): Promise<boolean> {
  try {
    const db = getDb();
    await db.execute(sql`
      UPDATE team_hall_of_fame
      SET removed_at = NOW(), removed_by = ${input.removedBy}, removal_reason = ${input.reason ?? null}, updated_at = NOW()
      WHERE id = ${input.id}::bigint AND removed_at IS NULL
    `);
    return true;
  } catch {
    return false;
  }
}
