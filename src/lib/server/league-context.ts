/**
 * League Context Helper
 * Provides the current league context for multi-league support.
 * Returns the first active league from the database.
 * Future: derive from request context (subdomain, path, session).
 */

import { getDb } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export type League = {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  sleeperLeagueId: string | null;
  sleeperLeagueIds: Record<string, string>;
  logoUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  config: Record<string, unknown>;
  foundedYear: number | null;
  isActive: boolean;
};

let _cachedLeague: League | null = null;
let _cachedLeagueId: string | null = null;

/**
 * Get the current league context.
 * Returns the first active, setup-completed league from the database.
 * Returns null if no league is configured yet.
 */
export async function getCurrentLeague(): Promise<League | null> {
  if (_cachedLeague) return _cachedLeague;

  try {
    const db = getDb();
    const res = await db.execute(sql`
      SELECT * FROM leagues WHERE setup_completed = true AND is_active = true ORDER BY created_at ASC LIMIT 1
    `);

    const row = (res as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    if (row) {
      _cachedLeague = {
        id: String(row.id),
        slug: String(row.slug),
        name: String(row.name),
        shortName: row.short_name ? String(row.short_name) : null,
        sleeperLeagueId: row.sleeper_league_id ? String(row.sleeper_league_id) : null,
        sleeperLeagueIds: (row.sleeper_league_ids as Record<string, string>) || {},
        logoUrl: row.logo_url ? String(row.logo_url) : null,
        primaryColor: row.primary_color ? String(row.primary_color) : null,
        secondaryColor: row.secondary_color ? String(row.secondary_color) : null,
        config: (row.config as Record<string, unknown>) || {},
        foundedYear: row.founded_year ? Number(row.founded_year) : null,
        isActive: Boolean(row.is_active),
      };
      _cachedLeagueId = _cachedLeague.id;
      return _cachedLeague;
    }
  } catch {
    // DB not available or table not created yet
  }

  return null;
}

/**
 * Get the current league ID.
 * Returns null if no league is configured yet.
 */
export async function getCurrentLeagueId(): Promise<string | null> {
  if (_cachedLeagueId) return _cachedLeagueId;
  const league = await getCurrentLeague();
  return league?.id || null;
}

/**
 * Clear the cached league data.
 * Call this if league config is updated.
 */
export function clearLeagueCache(): void {
  _cachedLeague = null;
  _cachedLeagueId = null;
}

/**
 * Get a league by its slug.
 */
export async function getLeagueBySlug(slug: string): Promise<League | null> {
  try {
    const db = getDb();
    const res = await db.execute(sql`
      SELECT * FROM leagues WHERE slug = ${slug} LIMIT 1
    `);

    const row = (res as { rows?: Array<Record<string, unknown>> }).rows?.[0];
    if (!row) return null;

    return {
      id: String(row.id),
      slug: String(row.slug),
      name: String(row.name),
      shortName: row.short_name ? String(row.short_name) : null,
      sleeperLeagueId: row.sleeper_league_id ? String(row.sleeper_league_id) : null,
      sleeperLeagueIds: (row.sleeper_league_ids as Record<string, string>) || {},
      logoUrl: row.logo_url ? String(row.logo_url) : null,
      primaryColor: row.primary_color ? String(row.primary_color) : null,
      secondaryColor: row.secondary_color ? String(row.secondary_color) : null,
      config: (row.config as Record<string, unknown>) || {},
      foundedYear: row.founded_year ? Number(row.founded_year) : null,
      isActive: Boolean(row.is_active),
    };
  } catch {
    return null;
  }
}
