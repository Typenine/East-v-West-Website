import { sql } from 'drizzle-orm';
import { CURRENT_SEASON, LEAGUE_IDS, getLeagueIdForSeason } from '@/lib/constants/league';
import { buildAllEvwTeams } from '@/lib/history/league-history';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import type { LeagueStatsDataset, StatsGameRow, StatsPlayerGameRow, StatsPlayerSeasonRow } from '@/lib/stats/types';
import { getSeasonAwardsUsingLeagueScoring, type SeasonAwards } from '@/lib/utils/sleeper-api';
import { getDb } from '@/server/db/client';
import { rowsFromExecute } from '@/server/db/execute-rows';

export const RESEARCH_VERSION = 'research-v1';
export const AWARD_RULES_VERSION = 'annual-awards-v1-regular-season';
export const RECORD_RULES_VERSION = 'records-v1-v3-postseason';
let tablesReady = false;

type JsonRecord = Record<string, unknown>;
export type WarehouseSeasonSnapshot = {
  version: string;
  season: string;
  leagueId: string;
  sourceGeneratedAt: string;
  frozenAt: string;
  gameTypeVersion: 'v3';
  awardRulesVersion: string;
  games: StatsGameRow[];
  playerGames: StatsPlayerGameRow[];
  playerSeasons: StatsPlayerSeasonRow[];
  seasonTeams: LeagueStatsDataset['seasonTeams'];
  awards: SeasonAwards | null;
  allEvw: ReturnType<typeof buildAllEvwTeams>[number] | null;
};

function asPayload<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; } catch { return null; }
  }
  return value as T;
}

export function completedSeasons(): string[] {
  return Object.keys(LEAGUE_IDS.PREVIOUS || {}).filter((season) => season < CURRENT_SEASON).sort();
}

async function ensureResearchTables(): Promise<void> {
  if (tablesReady) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS evw_history_snapshots (
      season varchar(8) PRIMARY KEY,
      version varchar(64) NOT NULL,
      league_id varchar(64) NOT NULL,
      source_generated_at timestamptz NOT NULL,
      stored_at timestamptz NOT NULL DEFAULT now(),
      payload jsonb NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS evw_award_records (
      season varchar(8) NOT NULL,
      award_key varchar(64) NOT NULL,
      player_id varchar(64) NOT NULL,
      rules_version varchar(96) NOT NULL,
      generated_at timestamptz NOT NULL DEFAULT now(),
      payload jsonb NOT NULL,
      PRIMARY KEY (season, award_key, player_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS evw_record_snapshots (
      snapshot_key varchar(128) PRIMARY KEY,
      rules_version varchar(96) NOT NULL,
      generated_at timestamptz NOT NULL DEFAULT now(),
      payload jsonb NOT NULL
    )
  `);
  tablesReady = true;
}

async function seasonAwards(dataset: LeagueStatsDataset, season: string): Promise<SeasonAwards | null> {
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) return null;
  const endWeek = Math.max(0, ...dataset.games.filter((game) => game.season === season && game.gameType === 'regular').map((game) => game.week));
  if (!endWeek) return null;
  return getSeasonAwardsUsingLeagueScoring(season, leagueId, endWeek).catch(() => null);
}

export async function readWarehouseSeason(season: string): Promise<WarehouseSeasonSnapshot | null> {
  try {
    await ensureResearchTables();
    const rows = rowsFromExecute<{ payload: unknown; version: string }>(await getDb().execute(sql`
      SELECT payload, version FROM evw_history_snapshots WHERE season = ${season} LIMIT 1
    `));
    if (!rows[0] || rows[0].version !== RESEARCH_VERSION) return null;
    return asPayload<WarehouseSeasonSnapshot>(rows[0].payload);
  } catch { return null; }
}

async function freezeAwards(season: string, awards: SeasonAwards | null): Promise<void> {
  if (!awards) return;
  try {
    await ensureResearchTables();
    const entries: Array<{ key: string; winner: JsonRecord }> = [];
    for (const winner of awards.mvp || []) entries.push({ key: 'mvp', winner: winner as unknown as JsonRecord });
    for (const winner of awards.roy || []) entries.push({ key: 'rookie_of_year', winner: winner as unknown as JsonRecord });
    for (const entry of entries) {
      const playerId = String(entry.winner.playerId || entry.winner.player_id || 'unknown');
      await getDb().execute(sql`
        INSERT INTO evw_award_records (season, award_key, player_id, rules_version, payload)
        VALUES (${season}, ${entry.key}, ${playerId}, ${AWARD_RULES_VERSION}, ${JSON.stringify(entry.winner)}::jsonb)
        ON CONFLICT (season, award_key, player_id) DO NOTHING
      `);
    }
  } catch { /* live canonical data remains available */ }
}

async function buildWarehouseSeason(dataset: LeagueStatsDataset, season: string): Promise<WarehouseSeasonSnapshot> {
  const awards = await seasonAwards(dataset, season);
  return {
    version: RESEARCH_VERSION,
    season,
    leagueId: getLeagueIdForSeason(season) || '',
    sourceGeneratedAt: dataset.generatedAt,
    frozenAt: new Date().toISOString(),
    gameTypeVersion: 'v3',
    awardRulesVersion: AWARD_RULES_VERSION,
    games: dataset.games.filter((row) => row.season === season),
    playerGames: dataset.playerGames.filter((row) => row.season === season),
    playerSeasons: dataset.playerSeasons.filter((row) => row.season === season),
    seasonTeams: dataset.seasonTeams.filter((row) => row.season === season),
    awards,
    allEvw: buildAllEvwTeams(dataset).find((row) => row.season === season) || null,
  };
}

async function persistWarehouseSeason(snapshot: WarehouseSeasonSnapshot): Promise<void> {
  try {
    await ensureResearchTables();
    await getDb().execute(sql`
      INSERT INTO evw_history_snapshots (season, version, league_id, source_generated_at, stored_at, payload)
      VALUES (${snapshot.season}, ${snapshot.version}, ${snapshot.leagueId}, ${snapshot.sourceGeneratedAt}::timestamptz, now(), ${JSON.stringify(snapshot)}::jsonb)
      ON CONFLICT (season) DO UPDATE SET
        version = excluded.version, league_id = excluded.league_id,
        source_generated_at = excluded.source_generated_at, stored_at = now(), payload = excluded.payload
      WHERE evw_history_snapshots.version <> excluded.version
    `);
    await freezeAwards(snapshot.season, snapshot.awards);
  } catch { /* warehouse failure must not take history offline */ }
}

async function freezeCompletedRecordBook(dataset: LeagueStatsDataset): Promise<void> {
  const through = completedSeasons().at(-1) || 'none';
  const snapshotKey = `through:${through}:${RESEARCH_VERSION}`;
  try {
    await ensureResearchTables();
    const existing = rowsFromExecute(await getDb().execute(sql`
      SELECT snapshot_key FROM evw_record_snapshots WHERE snapshot_key = ${snapshotKey} LIMIT 1
    `));
    if (existing.length) return;
    const completed = new Set(completedSeasons());
    const payload = {
      version: RESEARCH_VERSION,
      throughSeason: through,
      sourceGeneratedAt: dataset.generatedAt,
      rulesVersion: RECORD_RULES_VERSION,
      records: dataset.records,
      completedSeasonGameCount: dataset.games.filter((game) => completed.has(game.season)).length,
    };
    await getDb().execute(sql`
      INSERT INTO evw_record_snapshots (snapshot_key, rules_version, payload)
      VALUES (${snapshotKey}, ${RECORD_RULES_VERSION}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (snapshot_key) DO NOTHING
    `);
  } catch { /* live record calculations remain available */ }
}

export async function warmResearchWarehouse(dataset?: LeagueStatsDataset) {
  const live = dataset || await getLeagueStatsDatasetV3();
  const results: Array<{ season: string; source: 'warehouse' | 'canonical-v3'; stored: boolean }> = [];
  for (const season of completedSeasons()) {
    const existing = await readWarehouseSeason(season);
    if (existing) { results.push({ season, source: 'warehouse', stored: true }); continue; }
    const snapshot = await buildWarehouseSeason(live, season);
    await persistWarehouseSeason(snapshot);
    results.push({ season, source: 'canonical-v3', stored: Boolean(await readWarehouseSeason(season)) });
  }
  await freezeCompletedRecordBook(live);
  return results;
}

export async function readFrozenAwards(season: string): Promise<{ mvp: JsonRecord[]; roy: JsonRecord[] } | null> {
  try {
    await ensureResearchTables();
    const rows = rowsFromExecute<{ award_key: string; payload: unknown }>(await getDb().execute(sql`
      SELECT award_key, payload FROM evw_award_records
      WHERE season = ${season} AND rules_version = ${AWARD_RULES_VERSION}
      ORDER BY award_key, player_id
    `));
    if (!rows.length) return null;
    return {
      mvp: rows.filter((row) => row.award_key === 'mvp').map((row) => asPayload<JsonRecord>(row.payload) || {}),
      roy: rows.filter((row) => row.award_key === 'rookie_of_year').map((row) => asPayload<JsonRecord>(row.payload) || {}),
    };
  } catch { return null; }
}

export async function readCompletedRecordBook(): Promise<JsonRecord | null> {
  const through = completedSeasons().at(-1) || 'none';
  try {
    await ensureResearchTables();
    const rows = rowsFromExecute<{ payload: unknown }>(await getDb().execute(sql`
      SELECT payload FROM evw_record_snapshots
      WHERE snapshot_key = ${`through:${through}:${RESEARCH_VERSION}`} LIMIT 1
    `));
    return rows[0] ? asPayload<JsonRecord>(rows[0].payload) : null;
  } catch { return null; }
}

export async function storedWarehouseSeasons(): Promise<string[]> {
  try {
    await ensureResearchTables();
    return rowsFromExecute<{ season: string }>(await getDb().execute(sql`
      SELECT season FROM evw_history_snapshots WHERE version = ${RESEARCH_VERSION} ORDER BY season
    `)).map((row) => row.season);
  } catch { return []; }
}
