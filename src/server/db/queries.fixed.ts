import { getDb } from './client';
import { randomUUID } from 'crypto';
import { users, suggestions, taxiSquadMembers, taxiSquadEvents, teamPins, taxiObservations, userDocs, tenures, txnCache, taxiSnapshots, tradeBlockEvents } from './schema';
import { eq, and, isNull, desc, lt, sql, ne } from 'drizzle-orm';

export type Role = 'admin' | 'user';

export async function createUser(params: { email: string; displayName?: string; role?: Role }) {
  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({ email: params.email, displayName: params.displayName, role: (params.role || 'user') as 'admin' | 'user' })
    .returning();
  return row;
}

// --- Suggestion title (for ballots)
export async function ensureSuggestionTitleColumn() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS title varchar(255)`);
  } catch {}
}

export async function setSuggestionTitle(id: string, title: string | null) {
  try {
    await ensureSuggestionTitleColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET title = ${title} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionTitlesMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    await ensureSuggestionTitleColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, title FROM suggestions WHERE title IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; title: string | null }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const t = typeof r.title === 'string' ? r.title : '';
      if (id && t) out[id] = t;
    }
  } catch {}
  return out;
}

export async function getSuggestionBallotAddedAtMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    await ensureSuggestionBallotNotifyColumns();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, ballot_eligible_at FROM suggestions WHERE ballot_eligible_at IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; ballot_eligible_at: Date | string | null }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const ts = r.ballot_eligible_at;
      if (id && ts) {
        out[id] = new Date(ts).toISOString();
      }
    }
  } catch {}
  return out;
}

// =====================
// Draft Travel (Flights / Arrivals)
// =====================

export async function ensureDraftTravelTable() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_travel (
      id uuid PRIMARY KEY,
      trip varchar(16) NOT NULL,
      entry_type varchar(16) NOT NULL,
      person varchar(255) NOT NULL,
      team varchar(255),
      airline varchar(64),
      flight_no varchar(32),
      airport varchar(32),
      dt timestamp NULL,
      seats integer,
      can_pickup integer NOT NULL DEFAULT 0,
      can_dropoff integer NOT NULL DEFAULT 0,
      notes text,
      created_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_travel_trip_dt ON draft_travel(trip, dt, created_at)`);
}

export type DraftTravelEntry = {
  id: string;
  trip: string;
  entryType: 'arrival' | 'departure';
  person: string;
  team?: string | null;
  airline?: string | null;
  flightNo?: string | null;
  airport?: string | null;
  dt?: string | null; // ISO string or null
  seats?: number | null;
  canPickup?: boolean;
  canDropoff?: boolean;
  notes?: string | null;
  createdAt: string; // ISO
};

export async function addDraftTravelEntry(params: {
  trip: string;
  entryType: 'arrival' | 'departure';
  person: string;
  team?: string | null;
  airline?: string | null;
  flightNo?: string | null;
  airport?: string | null;
  dt?: Date | null;
  seats?: number | null;
  canPickup?: boolean;
  canDropoff?: boolean;
  notes?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    await ensureDraftTravelTable();
    const db = getDb();
    const id = randomUUID();
    const trip = String(params.trip || '').trim();
    const et = String(params.entryType || '').toLowerCase() === 'departure' ? 'departure' : 'arrival';
    const person = String(params.person || '').trim();
    if (!trip || !person) return { ok: false, error: 'missing_fields' };
    const team = params.team ? String(params.team).trim() : null;
    const airline = params.airline ? String(params.airline).trim() : null;
    const flightNo = params.flightNo ? String(params.flightNo).trim() : null;
    const airport = params.airport ? String(params.airport).trim() : null;
    const dt = params.dt ? new Date(params.dt) : null;
    const seats = params.seats == null ? null : (Number(params.seats) | 0);
    const canPickup = params.canPickup ? 1 : 0;
    const canDropoff = params.canDropoff ? 1 : 0;
    const notes = params.notes ? String(params.notes) : null;
    await db.execute(sql`
      INSERT INTO draft_travel (id, trip, entry_type, person, team, airline, flight_no, airport, dt, seats, can_pickup, can_dropoff, notes)
      VALUES (${id}::uuid, ${trip}, ${et}, ${person}, ${team}, ${airline}, ${flightNo}, ${airport}, ${dt}, ${seats}, ${canPickup}, ${canDropoff}, ${notes})
    `);
    return { ok: true, id } as const;
  } catch (e) {
    return { ok: false, error: String(e || 'unknown') } as const;
  }
}

export async function listDraftTravelEntries(trip: string): Promise<DraftTravelEntry[]> {
  await ensureDraftTravelTable();
  const db = getDb();
  const res = await db.execute(sql`
    SELECT
      id::text AS id,
      trip,
      entry_type AS entry_type,
      person,
      team,
      airline,
      flight_no,
      airport,
      dt,
      seats,
      can_pickup,
      can_dropoff,
      notes,
      created_at
    FROM draft_travel
    WHERE trip = ${trip}
    ORDER BY dt ASC NULLS LAST, created_at ASC
  `);
  type Row = {
    id: string;
    trip: string;
    entry_type: string;
    person: string;
    team: string | null;
    airline: string | null;
    flight_no: string | null;
    airport: string | null;
    dt: Date | null;
    seats: number | null;
    can_pickup: number;
    can_dropoff: number;
    notes: string | null;
    created_at: Date;
  };
  const rows = (res as unknown as { rows?: Row[] }).rows || [];
  return rows.map((r) => ({
    id: String(r.id),
    trip: String(r.trip),
    entryType: r.entry_type === 'departure' ? 'departure' : 'arrival',
    person: String(r.person),
    team: r.team || null,
    airline: r.airline || null,
    flightNo: r.flight_no || null,
    airport: r.airport || null,
    dt: r.dt ? new Date(r.dt).toISOString() : null,
    seats: r.seats == null ? null : Number(r.seats),
    canPickup: r.can_pickup === 1,
    canDropoff: r.can_dropoff === 1,
    notes: r.notes || null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

// =====================
// Draft Brain (DB layer)
// =====================
type DraftStatus = 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';

export type DraftOverview = {
  id: string;
  year: number;
  rounds: number;
  clockSeconds: number;
  status: DraftStatus;
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  curOverall: number;
  onClockTeam?: string | null;
  clockStartedAt?: string | null;
  deadlineTs?: string | null;
  pausedRemainingSecs?: number | null;
  eventName?: string | null;
  eventLogoUrl?: string | null;
  eventColor1?: string | null;
  eventColor2?: string | null;
  pendingTradeAnimation?: { teams: string[]; assets: TradeAsset[] } | null;
  recentPicks: Array<{ overall: number; round: number; team: string; playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null; madeAt: string }>;
  allPicks: Array<{ overall: number; round: number; team: string; playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null; madeAt: string }>;
  upcoming: Array<{ overall: number; round: number; team: string }>;
  allSlots: Array<{ overall: number; round: number; team: string }>;
};

export async function ensureDraftTables() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS drafts (
      id uuid PRIMARY KEY,
      year integer NOT NULL,
      rounds integer NOT NULL,
      clock_seconds integer NOT NULL DEFAULT 60,
      status varchar(24) NOT NULL DEFAULT 'NOT_STARTED',
      created_at timestamp NOT NULL DEFAULT now(),
      started_at timestamp NULL,
      completed_at timestamp NULL,
      cur_overall integer NOT NULL DEFAULT 1,
      clock_started_at timestamp NULL,
      deadline_ts timestamp NULL,
      paused_remaining_secs integer NULL
    )
  `);
  // Migration: add paused_remaining_secs if missing
  await db.execute(sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS paused_remaining_secs integer NULL`).catch(() => {});
  // Migration: add event branding columns
  await db.execute(sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS event_name varchar(255)`).catch(() => {});
  await db.execute(sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS event_logo_url text`).catch(() => {});
  await db.execute(sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS event_color_1 varchar(16)`).catch(() => {});
  await db.execute(sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS event_color_2 varchar(16)`).catch(() => {});
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_slots (
      draft_id uuid NOT NULL,
      overall integer NOT NULL,
      round integer NOT NULL,
      pick_in_round integer NOT NULL,
      team varchar(255) NOT NULL,
      PRIMARY KEY (draft_id, overall)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_picks (
      id uuid PRIMARY KEY,
      draft_id uuid NOT NULL,
      overall integer NOT NULL,
      round integer NOT NULL,
      team varchar(255) NOT NULL,
      player_id varchar(64) NOT NULL,
      player_name varchar(255),
      player_pos varchar(8),
      player_nfl varchar(8),
      made_by varchar(255) NOT NULL,
      made_at timestamp NOT NULL DEFAULT now()
    )
  `);
  // Add columns if they don't exist (migration)
  await db.execute(sql`
    ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS player_pos varchar(8)
  `).catch(() => {}); // Ignore if already exists
  await db.execute(sql`
    ALTER TABLE draft_picks ADD COLUMN IF NOT EXISTS player_nfl varchar(8)
  `).catch(() => {}); // Ignore if already exists
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_queues (
      draft_id uuid NOT NULL,
      team varchar(255) NOT NULL,
      rank integer NOT NULL,
      player_id varchar(64) NOT NULL,
      player_name varchar(255),
      player_pos varchar(8),
      player_nfl varchar(8),
      created_at timestamp NOT NULL DEFAULT now(),
      PRIMARY KEY (draft_id, team, rank)
    )
  `);
  // Add columns if they don't exist (migration for existing tables)
  await db.execute(sql`ALTER TABLE draft_queues ADD COLUMN IF NOT EXISTS player_name varchar(255)`).catch(() => {});
  await db.execute(sql`ALTER TABLE draft_queues ADD COLUMN IF NOT EXISTS player_pos varchar(8)`).catch(() => {});
  await db.execute(sql`ALTER TABLE draft_queues ADD COLUMN IF NOT EXISTS player_nfl varchar(8)`).catch(() => {});
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_picks_draft ON draft_picks(draft_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON draft_picks(player_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_slots_team ON draft_slots(draft_id, team)`);
  await db.execute(sql`ALTER TABLE draft_slots ADD COLUMN IF NOT EXISTS original_team varchar(255)`).catch(() => {});
  await db.execute(sql`UPDATE draft_slots SET original_team = team WHERE original_team IS NULL`).catch(() => {});
  // Player videos table (player_id → video_url + image_url, global across drafts)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS player_videos (
      player_id varchar(64) NOT NULL PRIMARY KEY,
      video_url text DEFAULT '',
      image_url text,
      player_name varchar(255),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  // Backfill for pre-existing tables that lack image_url or still have NOT NULL on video_url
  await db.execute(sql`ALTER TABLE player_videos ADD COLUMN IF NOT EXISTS image_url text`).catch(() => {});
  await db.execute(sql`ALTER TABLE player_videos ALTER COLUMN video_url DROP NOT NULL`).catch(() => {});
  // Pending picks (user-submitted, awaiting admin approval)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_pending_picks (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      draft_id uuid NOT NULL,
      overall integer NOT NULL,
      team varchar(128) NOT NULL,
      player_id varchar(64) NOT NULL,
      player_name varchar(255),
      player_pos varchar(16),
      player_nfl varchar(16),
      submitted_at timestamp NOT NULL DEFAULT now(),
      status varchar(16) NOT NULL DEFAULT 'pending'
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_pending_picks_draft ON draft_pending_picks(draft_id, status)`);
  // Trade system tables
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_roster_snapshots (
      draft_id uuid NOT NULL,
      team varchar(255) NOT NULL,
      player_id varchar(64) NOT NULL,
      player_name varchar(255),
      player_pos varchar(8),
      player_nfl varchar(8),
      acquired_via varchar(16) NOT NULL DEFAULT 'sleeper',
      PRIMARY KEY (draft_id, team, player_id)
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_future_picks (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      draft_id uuid NOT NULL,
      owner_team varchar(255) NOT NULL,
      original_team varchar(255) NOT NULL,
      year integer NOT NULL,
      round integer NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_future_picks ON draft_future_picks(draft_id, owner_team)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_trades (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      draft_id uuid NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'pending',
      proposed_by varchar(255) NOT NULL,
      teams jsonb NOT NULL,
      accepted_by jsonb NOT NULL DEFAULT '[]',
      counter_of uuid NULL,
      notes text NULL,
      proposed_at timestamp NOT NULL DEFAULT now(),
      updated_at timestamp NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_trades ON draft_trades(draft_id, status)`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_trade_assets (
      id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      trade_id uuid NOT NULL,
      from_team varchar(255) NOT NULL,
      to_team varchar(255) NOT NULL,
      asset_type varchar(16) NOT NULL,
      player_id varchar(64) NULL,
      player_name varchar(255) NULL,
      player_pos varchar(8) NULL,
      pick_overall integer NULL,
      pick_year integer NULL,
      pick_round integer NULL,
      pick_original_team varchar(255) NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_trade_assets ON draft_trade_assets(trade_id)`);
  // Migration: pending trade animation trigger column
  await db.execute(sql`ALTER TABLE drafts ADD COLUMN IF NOT EXISTS pending_trade_animation jsonb NULL`).catch(() => {});
}

// Optional per-draft custom player pool (alternative to Sleeper dataset)
export async function ensureDraftPlayersTable() {
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS draft_players (
      draft_id uuid NOT NULL,
      player_id varchar(64) NOT NULL,
      name varchar(255) NOT NULL,
      pos varchar(16) NOT NULL,
      nfl varchar(16),
      rank integer,
      meta jsonb,
      PRIMARY KEY (draft_id, player_id)
    )
  `);
  // Backfill safety for older tables
  await db.execute(sql`ALTER TABLE draft_players ADD COLUMN IF NOT EXISTS rank integer`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_draft_players_draft ON draft_players(draft_id)`);
}

export type DraftPlayerRow = { player_id: string; name: string; pos: string; nfl: string | null; rank: number | null };

export async function setDraftPlayers(
  draftId: string,
  players: Array<{ id: string; name: string; pos: string; nfl?: string | null; rank?: number | null; meta?: unknown }>
) {
  await ensureDraftPlayersTable();
  const db = getDb();
  await db.execute(sql`DELETE FROM draft_players WHERE draft_id = ${draftId}::uuid`);
  for (const p of players) {
    const id = String(p.id || '').trim();
    const name = String(p.name || '').trim();
    const pos = String(p.pos || '').trim().toUpperCase();
    if (!id || !name || !pos) continue;
    const nfl = (p.nfl ? String(p.nfl).toUpperCase() : null) as string | null;
    const rank = p.rank == null ? null : Number(p.rank);
    await db.execute(sql`
      INSERT INTO draft_players (draft_id, player_id, name, pos, nfl, rank, meta)
      VALUES (${draftId}::uuid, ${id}, ${name}, ${pos}, ${nfl}, ${rank}, ${p.meta ?? null})
      ON CONFLICT (draft_id, player_id) DO UPDATE SET name = EXCLUDED.name, pos = EXCLUDED.pos, nfl = EXCLUDED.nfl, rank = EXCLUDED.rank, meta = EXCLUDED.meta
    `);
  }
  return true as const;
}

export async function clearDraftPlayers(draftId: string) {
  await ensureDraftPlayersTable();
  const db = getDb();
  await db.execute(sql`DELETE FROM draft_players WHERE draft_id = ${draftId}::uuid`);
  return true as const;
}

export async function getDraftPlayers(draftId: string): Promise<DraftPlayerRow[]> {
  await ensureDraftPlayersTable();
  const db = getDb();
  const res = await db.execute(sql`SELECT player_id, name, pos, nfl, rank FROM draft_players WHERE draft_id = ${draftId}::uuid`);
  const rows = (res as unknown as { rows?: Array<DraftPlayerRow> }).rows || [];
  return rows;
}

export async function countDraftPlayers(draftId: string): Promise<number> {
  await ensureDraftPlayersTable();
  const db = getDb();
  const res = await db.execute(sql`SELECT COUNT(1)::int AS c FROM draft_players WHERE draft_id = ${draftId}::uuid`);
  const row = (res as unknown as { rows?: Array<{ c: number | string }> }).rows?.[0];
  if (!row) return 0;
  const c = typeof row.c === 'number' ? row.c : Number(row.c || 0);
  return c | 0;
}

export async function resetDraftTrades(draftId: string) {
  const db = getDb();
  // 1. Restore all current-draft pick slots to original owners (undo traded picks)
  await db.execute(sql`UPDATE draft_slots SET team = original_team WHERE draft_id = ${draftId}::uuid AND original_team IS NOT NULL`);
  // 2. Delete all trade records and assets
  await db.execute(sql`DELETE FROM draft_trade_assets WHERE trade_id IN (SELECT id FROM draft_trades WHERE draft_id = ${draftId}::uuid)`);
  await db.execute(sql`DELETE FROM draft_trades WHERE draft_id = ${draftId}::uuid`);
  // 3. Clear roster snapshots so next get_assets re-snapshots from Sleeper (original owners)
  await db.execute(sql`DELETE FROM draft_roster_snapshots WHERE draft_id = ${draftId}::uuid`);
  // 4. Clear future picks (traded future picks are removed; re-snapshotted from source on next access)
  await db.execute(sql`DELETE FROM draft_future_picks WHERE draft_id = ${draftId}::uuid`);
  // 5. Clear any pending trade animation
  await db.execute(sql`UPDATE drafts SET pending_trade_animation = NULL WHERE id = ${draftId}::uuid`);
  return { ok: true };
}

export async function resetDraft(draftId: string) {
  const db = getDb();
  // Clear all picks, queues, and trade data but KEEP draft structure (slots remain)
  await db.execute(sql`DELETE FROM draft_picks WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM draft_queues WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM draft_pending_picks WHERE draft_id = ${draftId}::uuid`);
  // Clear trade system data
  await db.execute(sql`DELETE FROM draft_trade_assets WHERE trade_id IN (SELECT id FROM draft_trades WHERE draft_id = ${draftId}::uuid)`);
  await db.execute(sql`DELETE FROM draft_trades WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM draft_roster_snapshots WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM draft_future_picks WHERE draft_id = ${draftId}::uuid`);
  // Restore all draft slots to their original owners (undo any traded picks)
  await db.execute(sql`UPDATE draft_slots SET team = original_team WHERE draft_id = ${draftId}::uuid AND original_team IS NOT NULL`);
  // Reset draft to NOT_STARTED with cur_overall = 1, clear any pending animation
  await db.execute(sql`
    UPDATE drafts 
    SET status = 'NOT_STARTED',
        cur_overall = 1,
        clock_started_at = NULL,
        deadline_ts = NULL,
        started_at = NULL,
        completed_at = NULL,
        pending_trade_animation = NULL
    WHERE id = ${draftId}::uuid
  `);
  return { ok: true };
}

export async function deleteDraft(draftId: string) {
  const db = getDb();
  await db.execute(sql`DELETE FROM draft_picks WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM draft_queues WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM draft_slots WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM draft_players WHERE draft_id = ${draftId}::uuid`);
  await db.execute(sql`DELETE FROM drafts WHERE id = ${draftId}::uuid`);
  return { ok: true };
}

export async function skipPick(draftId: string) {
  const db = getDb();
  const res = await db.execute(sql`
    UPDATE drafts 
    SET cur_overall = cur_overall + 1,
        clock_started_at = NOW(),
        deadline_ts = NOW() + (clock_seconds || interval '1 second')
    WHERE id = ${draftId}::uuid
    RETURNING cur_overall
  `);
  const newOverall = (res as unknown as { rows?: Array<{ cur_overall: number }> }).rows?.[0]?.cur_overall || 1;
  return { ok: true, newOverall };
}

export async function updateDraftSlot(draftId: string, overall: number, team: string) {
  const db = getDb();
  // Check if pick has already been made for this slot
  const pickCheck = await db.execute(sql`SELECT 1 FROM draft_picks WHERE draft_id = ${draftId}::uuid AND overall = ${overall} LIMIT 1`);
  const hasPick = (pickCheck as unknown as { rows?: Array<Record<string, unknown>> }).rows?.length || 0;
  if (hasPick > 0) return { ok: false as const, error: 'slot_has_pick' };
  
  // Update the slot
  await db.execute(sql`UPDATE draft_slots SET team = ${team} WHERE draft_id = ${draftId}::uuid AND overall = ${overall}`);
  return { ok: true as const };
}

export async function createDraftWithOrder(params: { 
  year: number; 
  rounds: number; 
  teams: string[]; // Round 1 order (legacy, used if roundOrders not provided)
  roundOrders?: Record<number, string[]>; // Per-round team orders (round number -> team names in order)
  clockSeconds?: number; 
  id?: string 
}) {
  const id = params.id || randomUUID();
  const rounds = Math.max(1, params.rounds | 0);
  const baseTeams = (params.teams || []).filter(Boolean);
  if (baseTeams.length === 0) throw new Error('teams required');
  const clockSeconds = Math.max(10, Math.min(24 * 60 * 60, (params.clockSeconds || 60) | 0));
  const db = getDb();
  await ensureDraftTables();
  await db.execute(sql`
    INSERT INTO drafts (id, year, rounds, clock_seconds, status, created_at, cur_overall)
    VALUES (${id}::uuid, ${params.year}, ${rounds}, ${clockSeconds}, 'NOT_STARTED', now(), 1)
    ON CONFLICT (id) DO NOTHING
  `);
  let overall = 1;
  for (let r = 1; r <= rounds; r++) {
    // Use per-round order if provided, otherwise use base teams (linear, no snake)
    const order = params.roundOrders?.[r] || baseTeams;
    for (let i = 0; i < order.length; i++) {
      const pickInRound = i + 1;
      const team = order[i];
      await db.execute(sql`
        INSERT INTO draft_slots (draft_id, overall, round, pick_in_round, team, original_team)
        VALUES (${id}::uuid, ${overall}, ${r}, ${pickInRound}, ${team}, ${team})
        ON CONFLICT (draft_id, overall) DO NOTHING
      `);
      overall += 1;
    }
  }
  return { id };
}

export async function getActiveOrLatestDraftId(): Promise<string | null> {
  await ensureDraftTables();
  const db = getDb();
  const a = await db.execute(sql`SELECT id::text AS id FROM drafts WHERE status IN ('LIVE','PAUSED') ORDER BY created_at DESC LIMIT 1`);
  const ar = (a as unknown as { rows?: Array<{ id: string }> }).rows || [];
  if (ar.length > 0) return ar[0].id;
  const b = await db.execute(sql`SELECT id::text AS id FROM drafts ORDER BY created_at DESC LIMIT 1`);
  const br = (b as unknown as { rows?: Array<{ id: string }> }).rows || [];
  return br[0]?.id || null;
}

export async function getDraftOverview(draftId: string): Promise<DraftOverview | null> {
  await ensureDraftTables();
  const db = getDb();
  const headRes = await db.execute(sql`SELECT id::text AS id, year, rounds, clock_seconds, status, created_at, started_at, completed_at, cur_overall, clock_started_at, deadline_ts, paused_remaining_secs, event_name, event_logo_url, event_color_1, event_color_2, pending_trade_animation FROM drafts WHERE id = ${draftId}::uuid LIMIT 1`);
  const head = (headRes as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0];
  if (!head) return null;
  const curOverall = Number(head.cur_overall || 1);
  const slotRes = await db.execute(sql`SELECT team, round FROM draft_slots WHERE draft_id = ${draftId}::uuid AND overall = ${curOverall} LIMIT 1`);
  const slot = (slotRes as unknown as { rows?: Array<{ team: string; round: number }> }).rows?.[0] || null;
  const picksRes = await db.execute(sql`SELECT overall, round, team, player_id, player_name, player_pos, player_nfl, made_at FROM draft_picks WHERE draft_id = ${draftId}::uuid ORDER BY overall ASC`);
  const picksRows = (picksRes as unknown as { rows?: Array<{ overall: number; round: number; team: string; player_id: string; player_name?: string; player_pos?: string; player_nfl?: string; made_at: Date }> }).rows || [];
  const mapPick = (p: typeof picksRows[number]) => ({ overall: p.overall, round: p.round, team: p.team, playerId: p.player_id, playerName: p.player_name || null, playerPos: p.player_pos || null, playerNfl: p.player_nfl || null, madeAt: new Date(p.made_at).toISOString() });
  const allPicks = picksRows.map(mapPick);
  const recentPicks = picksRows.slice(-10).map(mapPick);
  const upRes = await db.execute(sql`SELECT overall, round, team FROM draft_slots WHERE draft_id = ${draftId}::uuid AND overall >= ${curOverall} ORDER BY overall ASC LIMIT 10`);
  const upcoming = (upRes as unknown as { rows?: Array<{ overall: number; round: number; team: string }> }).rows || [];
  // Fetch ALL slots for full grid display (needed for team logos in all rounds)
  const allSlotsRes = await db.execute(sql`SELECT overall, round, team FROM draft_slots WHERE draft_id = ${draftId}::uuid ORDER BY overall ASC`);
  const allSlots = (allSlotsRes as unknown as { rows?: Array<{ overall: number; round: number; team: string }> }).rows || [];
  return {
    id: String(head.id),
    year: Number(head.year),
    rounds: Number(head.rounds),
    clockSeconds: Number(head.clock_seconds),
    status: head.status as DraftStatus,
    createdAt: new Date(head.created_at as string).toISOString(),
    startedAt: head.started_at ? new Date(head.started_at as string).toISOString() : null,
    completedAt: head.completed_at ? new Date(head.completed_at as string).toISOString() : null,
    curOverall,
    onClockTeam: slot?.team || null,
    clockStartedAt: head.clock_started_at ? new Date(head.clock_started_at as string).toISOString() : null,
    deadlineTs: head.deadline_ts ? new Date(head.deadline_ts as string).toISOString() : null,
    pausedRemainingSecs: head.paused_remaining_secs != null ? Number(head.paused_remaining_secs) : null,
    eventName: (head.event_name as string | null) ?? null,
    eventLogoUrl: (head.event_logo_url as string | null) ?? null,
    eventColor1: (head.event_color_1 as string | null) ?? null,
    eventColor2: (head.event_color_2 as string | null) ?? null,
    pendingTradeAnimation: (head.pending_trade_animation as { teams: string[]; assets: TradeAsset[] } | null) ?? null,
    recentPicks,
    allPicks,
    upcoming,
    allSlots,
  } as DraftOverview;
}

// ── Draft Order ───────────────────────────────────────────────────────────
export async function setDraftOrder(draftId: string, teams: string[]): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  const n = teams.length;
  if (n === 0) return;

  // Get current status and all slots
  const statusRes = await db.execute(sql`SELECT status FROM drafts WHERE id = ${draftId}::uuid LIMIT 1`);
  const status = ((statusRes as unknown as { rows?: Array<{ status: string }> }).rows?.[0]?.status) || 'NOT_STARTED';
  const slotsRes = await db.execute(sql`SELECT overall, round FROM draft_slots WHERE draft_id = ${draftId}::uuid ORDER BY overall ASC`);
  const slots = (slotsRes as unknown as { rows?: Array<{ overall: number; round: number }> }).rows || [];

  for (const slot of slots) {
    const overall = Number(slot.overall);
    const round = Number(slot.round);
    const pickInRound = ((overall - 1) % n) + 1; // 1-indexed within round
    const isEvenRound = round % 2 === 0;
    const teamIdx = isEvenRound ? (n - pickInRound) : (pickInRound - 1);
    const newTeam = teams[Math.max(0, Math.min(n - 1, teamIdx))];
    if (status === 'NOT_STARTED') {
      // Pre-draft: update both current owner and original
      await db.execute(sql`UPDATE draft_slots SET team = ${newTeam}, original_team = ${newTeam} WHERE draft_id = ${draftId}::uuid AND overall = ${overall}`);
    } else {
      // Mid-draft: only update original_team (affects future resets, not live picks)
      await db.execute(sql`UPDATE draft_slots SET original_team = ${newTeam} WHERE draft_id = ${draftId}::uuid AND overall = ${overall}`);
    }
  }
}

// ── Player Videos ─────────────────────────────────────────────────────────
export async function updateDraftBranding(draftId: string, branding: {
  eventName?: string | null;
  eventLogoUrl?: string | null;
  eventColor1?: string | null;
  eventColor2?: string | null;
}): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`
    UPDATE drafts
    SET event_name = ${branding.eventName ?? null},
        event_logo_url = ${branding.eventLogoUrl ?? null},
        event_color_1 = ${branding.eventColor1 ?? null},
        event_color_2 = ${branding.eventColor2 ?? null}
    WHERE id = ${draftId}::uuid
  `);
}

export async function getPlayerVideos(): Promise<Array<{ playerId: string; videoUrl: string | null; imageUrl: string | null; playerName: string | null }>> {
  await ensureDraftTables();
  const db = getDb();
  try {
    const res = await db.execute(sql`SELECT player_id, video_url, image_url, player_name FROM player_videos ORDER BY player_id`);
    const rows = (res as unknown as { rows?: Array<{ player_id: string; video_url: string | null; image_url: string | null; player_name: string | null }> }).rows || [];
    return rows.map(r => ({ playerId: r.player_id, videoUrl: r.video_url || null, imageUrl: r.image_url || null, playerName: r.player_name || null }));
  } catch {
    // Fallback: image_url column may not yet exist on old DB instances
    const res = await db.execute(sql`SELECT player_id, video_url, player_name FROM player_videos ORDER BY player_id`);
    const rows = (res as unknown as { rows?: Array<{ player_id: string; video_url: string | null; player_name: string | null }> }).rows || [];
    return rows.map(r => ({ playerId: r.player_id, videoUrl: r.video_url || null, imageUrl: null, playerName: r.player_name || null }));
  }
}

export async function setPlayerVideo(playerId: string, videoUrl: string, playerName?: string | null): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`
    INSERT INTO player_videos (player_id, video_url, player_name, updated_at)
    VALUES (${playerId}, ${videoUrl}, ${playerName ?? null}, now())
    ON CONFLICT (player_id) DO UPDATE SET video_url = ${videoUrl}, player_name = COALESCE(${playerName ?? null}, player_videos.player_name), updated_at = now()
  `);
}

export async function setPlayerImage(playerId: string, imageUrl: string, playerName?: string | null): Promise<void> {
  await ensureDraftTables(); // ensures image_url column exists via ALTER TABLE IF NOT EXISTS
  const db = getDb();
  await db.execute(sql`
    INSERT INTO player_videos (player_id, video_url, image_url, player_name, updated_at)
    VALUES (${playerId}, '', ${imageUrl}, ${playerName ?? null}, now())
    ON CONFLICT (player_id) DO UPDATE SET image_url = ${imageUrl}, player_name = COALESCE(${playerName ?? null}, player_videos.player_name), updated_at = now()
  `);
}

export async function deletePlayerVideo(playerId: string): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`DELETE FROM player_videos WHERE player_id = ${playerId}`);
}

// ── Draft Pending Picks ─────────────────────────────────────────────────────
export async function submitPendingPick(draftId: string, data: {
  overall: number; team: string; playerId: string;
  playerName?: string | null; playerPos?: string | null; playerNfl?: string | null;
}): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  // Clear any old pending for this draft first
  await db.execute(sql`DELETE FROM draft_pending_picks WHERE draft_id = ${draftId}::uuid AND status = 'pending'`);
  await db.execute(sql`
    INSERT INTO draft_pending_picks (draft_id, overall, team, player_id, player_name, player_pos, player_nfl, status)
    VALUES (${draftId}::uuid, ${data.overall}, ${data.team}, ${data.playerId},
            ${data.playerName ?? null}, ${data.playerPos ?? null}, ${data.playerNfl ?? null}, 'pending')
  `);
}

export async function getPendingPick(draftId: string): Promise<{
  id: string; overall: number; team: string; playerId: string;
  playerName: string | null; playerPos: string | null; playerNfl: string | null; submittedAt: string;
} | null> {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`SELECT id::text, overall, team, player_id, player_name, player_pos, player_nfl, submitted_at FROM draft_pending_picks WHERE draft_id = ${draftId}::uuid AND status = 'pending' ORDER BY submitted_at DESC LIMIT 1`);
  const row = (res as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0];
  if (!row) return null;
  return {
    id: String(row.id), overall: Number(row.overall), team: String(row.team),
    playerId: String(row.player_id), playerName: row.player_name as string | null,
    playerPos: row.player_pos as string | null, playerNfl: row.player_nfl as string | null,
    submittedAt: new Date(row.submitted_at as string).toISOString(),
  };
}

export async function resolvePendingPick(pendingId: string, status: 'approved' | 'rejected'): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`UPDATE draft_pending_picks SET status = ${status} WHERE id = ${pendingId}::uuid`);
}

export async function startDraft(draftId: string) {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`
    SELECT s.overall
    FROM draft_slots s
    WHERE s.draft_id = ${draftId}::uuid
      AND NOT EXISTS (SELECT 1 FROM draft_picks p WHERE p.draft_id = s.draft_id AND p.overall = s.overall)
    ORDER BY s.overall ASC LIMIT 1
  `);
  const row = (res as unknown as { rows?: Array<{ overall: number }> }).rows?.[0];
  const first = row ? Number(row.overall) : 1;
  const r2 = await db.execute(sql`SELECT clock_seconds FROM drafts WHERE id = ${draftId}::uuid LIMIT 1`);
  const secs = (r2 as unknown as { rows?: Array<{ clock_seconds: number }> }).rows?.[0]?.clock_seconds || 60;
  await db.execute(sql`UPDATE drafts SET status = 'LIVE', started_at = COALESCE(started_at, now()), cur_overall = ${first}, clock_started_at = now(), deadline_ts = now() + (interval '1 second' * ${secs}) WHERE id = ${draftId}::uuid`);
  return true;
}

export async function getDraftPickedPlayerIds(draftId: string): Promise<string[]> {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`SELECT player_id FROM draft_picks WHERE draft_id = ${draftId}::uuid`);
  const rows = (res as unknown as { rows?: Array<{ player_id: string }> }).rows || [];
  return rows.map((r) => r.player_id).filter(Boolean);
}

export async function pauseDraft(draftId: string) {
  await ensureDraftTables();
  const db = getDb();
  // Save remaining seconds at pause time so resume can restore them
  await db.execute(sql`
    UPDATE drafts
    SET status = 'PAUSED',
        paused_remaining_secs = GREATEST(0, EXTRACT(EPOCH FROM (deadline_ts - now()))::integer)
    WHERE id = ${draftId}::uuid
  `);
  return true;
}

export async function resumeDraft(draftId: string) {
  await ensureDraftTables();
  const db = getDb();
  // Use saved remaining secs from pause; fall back to full clock if missing
  const r = await db.execute(sql`SELECT clock_seconds, paused_remaining_secs FROM drafts WHERE id = ${draftId}::uuid LIMIT 1`);
  const row = (r as unknown as { rows?: Array<{ clock_seconds: number; paused_remaining_secs: number | null }> }).rows?.[0];
  const secs = (row?.paused_remaining_secs != null && row.paused_remaining_secs > 0)
    ? row.paused_remaining_secs
    : (row?.clock_seconds || 60);
  await db.execute(sql`
    UPDATE drafts
    SET status = 'LIVE',
        clock_started_at = now(),
        deadline_ts = now() + (interval '1 second' * ${secs}),
        paused_remaining_secs = NULL
    WHERE id = ${draftId}::uuid
  `);
  return true;
}

export async function resetPickClock(draftId: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    UPDATE drafts
    SET clock_started_at = now(),
        deadline_ts = now() + (interval '1 second' * clock_seconds),
        paused_remaining_secs = NULL
    WHERE id = ${draftId}::uuid AND status = 'LIVE'
  `);
}

export async function setClockSeconds(draftId: string, seconds: number) {
  const db = getDb();
  const s = Math.max(10, Math.min(24 * 60 * 60, seconds | 0));
  await db.execute(sql`UPDATE drafts SET clock_seconds = ${s} WHERE id = ${draftId}::uuid`);
  return true;
}

export async function makePick(params: { draftId: string; team: string; playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null; madeBy: string }) {
  await ensureDraftTables();
  const db = getDb();
  const picked = await db.execute(sql`SELECT 1 FROM draft_picks WHERE draft_id = ${params.draftId}::uuid AND player_id = ${params.playerId} LIMIT 1`);
  const already = (picked as unknown as { rows?: Array<Record<string, unknown>> }).rows?.length || 0;
  if (already > 0) return { ok: false as const, error: 'player_taken' };
  const slotRes = await db.execute(sql`SELECT s.overall, s.round, s.team, d.status FROM draft_slots s JOIN drafts d ON d.id = s.draft_id WHERE s.draft_id = ${params.draftId}::uuid AND s.overall = d.cur_overall LIMIT 1`);
  const slot = (slotRes as unknown as { rows?: Array<{ overall: number; round: number; team: string; status: DraftStatus }> }).rows?.[0];
  if (!slot) return { ok: false as const, error: 'no_slot' };
  if (slot.status !== 'LIVE') return { ok: false as const, error: 'not_live' };
  if (slot.team !== params.team) return { ok: false as const, error: 'not_on_clock' };
  const pickId = randomUUID();
  await db.execute(sql`
    INSERT INTO draft_picks (id, draft_id, overall, round, team, player_id, player_name, player_pos, player_nfl, made_by)
    VALUES (${pickId}::uuid, ${params.draftId}::uuid, ${slot.overall}, ${slot.round}, ${slot.team}, ${params.playerId}, ${params.playerName || null}, ${params.playerPos || null}, ${params.playerNfl || null}, ${params.madeBy})
  `);
  const nextRes = await db.execute(sql`
    SELECT s.overall FROM draft_slots s
    WHERE s.draft_id = ${params.draftId}::uuid AND s.overall > ${slot.overall}
      AND NOT EXISTS (SELECT 1 FROM draft_picks p WHERE p.draft_id = s.draft_id AND p.overall = s.overall)
    ORDER BY s.overall ASC LIMIT 1
  `);
  const next = (nextRes as unknown as { rows?: Array<{ overall: number }> }).rows?.[0]?.overall as number | undefined;
  if (typeof next === 'number') {
    const clkRes = await db.execute(sql`SELECT clock_seconds FROM drafts WHERE id = ${params.draftId}::uuid LIMIT 1`);
    const secs = (clkRes as unknown as { rows?: Array<{ clock_seconds: number }> }).rows?.[0]?.clock_seconds || 60;
    await db.execute(sql`UPDATE drafts SET cur_overall = ${next}, clock_started_at = now(), deadline_ts = now() + (interval '1 second' * ${secs}) WHERE id = ${params.draftId}::uuid`);
  } else {
    await db.execute(sql`UPDATE drafts SET status = 'COMPLETED', completed_at = now(), cur_overall = ${slot.overall} WHERE id = ${params.draftId}::uuid`);
  }
  return { ok: true as const };
}

export async function forcePick(params: { draftId: string; playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null; team?: string | null; madeBy: string }) {
  await ensureDraftTables();
  const db = getDb();
  const curRes = await db.execute(sql`SELECT d.cur_overall, s.team FROM drafts d JOIN draft_slots s ON s.draft_id = d.id AND s.overall = d.cur_overall WHERE d.id = ${params.draftId}::uuid LIMIT 1`);
  const cur = (curRes as unknown as { rows?: Array<{ cur_overall: number; team: string }> }).rows?.[0];
  const team = params.team || cur?.team;
  if (!team) return { ok: false as const, error: 'no_team' };
  return makePick({ draftId: params.draftId, team, playerId: params.playerId, playerName: params.playerName || null, playerPos: params.playerPos || null, playerNfl: params.playerNfl || null, madeBy: params.madeBy });
}

export async function undoLastPick(draftId: string) {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`SELECT overall FROM draft_picks WHERE draft_id = ${draftId}::uuid ORDER BY overall DESC LIMIT 1`);
  const last = (res as unknown as { rows?: Array<{ overall: number }> }).rows?.[0];
  if (!last) return { ok: false as const, error: 'no_picks' };
  const overall = Number(last.overall);
  await db.execute(sql`DELETE FROM draft_picks WHERE draft_id = ${draftId}::uuid AND overall = ${overall}`);
  // set cur_overall back to this pick and pause clock
  await db.execute(sql`UPDATE drafts SET status = 'PAUSED', cur_overall = ${overall}, clock_started_at = NULL, deadline_ts = NULL WHERE id = ${draftId}::uuid`);
  return { ok: true as const };
}

export type QueuePlayer = { id: string; name: string; pos: string; nfl: string };

export async function getTeamQueue(draftId: string, team: string): Promise<QueuePlayer[]> {
  await ensureDraftTables();
  const db = getDb();
  const q = await db.execute(sql`SELECT player_id, player_name, player_pos, player_nfl FROM draft_queues WHERE draft_id = ${draftId}::uuid AND team = ${team} ORDER BY rank ASC`);
  const rows = (q as unknown as { rows?: Array<{ player_id: string; player_name?: string; player_pos?: string; player_nfl?: string }> }).rows || [];
  return rows.map((r) => ({ id: r.player_id, name: r.player_name || r.player_id, pos: r.player_pos || '', nfl: r.player_nfl || '' }));
}

export async function removePlayerFromQueue(draftId: string, team: string, playerId: string): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`DELETE FROM draft_queues WHERE draft_id = ${draftId}::uuid AND team = ${team} AND player_id = ${playerId}`);
}

export async function setTeamQueue(draftId: string, team: string, players: Array<{ id: string; name?: string; pos?: string; nfl?: string }>) {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`DELETE FROM draft_queues WHERE draft_id = ${draftId}::uuid AND team = ${team}`);
  let i = 1;
  for (const p of players) {
    await db.execute(sql`INSERT INTO draft_queues (draft_id, team, rank, player_id, player_name, player_pos, player_nfl) VALUES (${draftId}::uuid, ${team}, ${i}, ${p.id}, ${p.name || null}, ${p.pos || null}, ${p.nfl || null})`);
    i += 1;
  }
  return true;
}

// Auto-pick: check if clock expired and make pick from queue or highest-ranked available
// If force=true, bypass clock check and pick immediately
export async function checkAndAutoPick(draftId: string, force = false): Promise<{ picked: boolean; playerId?: string; playerName?: string; error?: string }> {
  await ensureDraftTables();
  const db = getDb();
  // Check if draft is LIVE and deadline has passed (unless forced)
  const draftRes = await db.execute(sql`
    SELECT d.status, d.deadline_ts, d.cur_overall, s.team
    FROM drafts d
    JOIN draft_slots s ON s.draft_id = d.id AND s.overall = d.cur_overall
    WHERE d.id = ${draftId}::uuid
    LIMIT 1
  `);
  const draft = (draftRes as unknown as { rows?: Array<{ status: string; deadline_ts: string | null; cur_overall: number; team: string }> }).rows?.[0];
  if (!draft) return { picked: false, error: 'no_draft' };
  if (draft.status !== 'LIVE') return { picked: false, error: 'draft_not_live' };
  
  // Only check clock expiry if not forced
  if (!force) {
    if (!draft.deadline_ts) return { picked: false };
    const deadline = new Date(draft.deadline_ts).getTime();
    if (Date.now() < deadline) return { picked: false }; // clock not expired
  }

  const team = draft.team;
  const takenRes = await db.execute(sql`SELECT player_id FROM draft_picks WHERE draft_id = ${draftId}::uuid`);
  const taken = new Set(((takenRes as unknown as { rows?: Array<{ player_id: string }> }).rows || []).map(r => r.player_id));

  // If there is already a pending pick waiting for admin approval, do not interfere
  const existingPending = await getPendingPick(draftId);
  if (existingPending) return { picked: false };

  // Try queue first
  const queueRes = await db.execute(sql`SELECT player_id, player_name, player_pos, player_nfl FROM draft_queues WHERE draft_id = ${draftId}::uuid AND team = ${team} ORDER BY rank ASC`);
  const queue = ((queueRes as unknown as { rows?: Array<{ player_id: string; player_name?: string; player_pos?: string; player_nfl?: string }> }).rows || []);
  for (const qp of queue) {
    if (!taken.has(qp.player_id)) {
      if (force) {
        // Admin-forced: bypass approval, pick immediately
        const pickRes = await forcePick({ draftId, playerId: qp.player_id, playerName: qp.player_name || null, playerPos: qp.player_pos || null, playerNfl: qp.player_nfl || null, team, madeBy: 'auto' });
        if (pickRes.ok) {
          await db.execute(sql`DELETE FROM draft_queues WHERE draft_id = ${draftId}::uuid AND team = ${team} AND player_id = ${qp.player_id}`);
          return { picked: true, playerId: qp.player_id, playerName: qp.player_name || undefined };
        }
      } else {
        // Clock expired: submit as pending pick so admin can approve
        await submitPendingPick(draftId, {
          overall: draft.cur_overall,
          team,
          playerId: qp.player_id,
          playerName: qp.player_name || null,
          playerPos: qp.player_pos || null,
          playerNfl: qp.player_nfl || null,
        });
        await pauseDraft(draftId);
        return { picked: true, playerId: qp.player_id, playerName: qp.player_name || undefined };
      }
    }
  }

  // Try custom player pool (sorted by rank)
  await ensureDraftPlayersTable();
  const customRes = await db.execute(sql`
    SELECT player_id, name FROM draft_players
    WHERE draft_id = ${draftId}::uuid
    ORDER BY COALESCE(rank, 999999) ASC, name ASC
  `);
  const customPlayers = (customRes as unknown as { rows?: Array<{ player_id: string; name: string }> }).rows || [];
  for (const p of customPlayers) {
    if (!taken.has(p.player_id)) {
      const pickRes = await forcePick({ draftId, playerId: p.player_id, playerName: p.name, team, madeBy: 'auto' });
      if (pickRes.ok) return { picked: true, playerId: p.player_id, playerName: p.name };
    }
  }

  // No custom pool, skip pick (or could pick random from Sleeper - leaving as skip for now)
  // Advance clock to next pick without making a selection (skip)
  const clkRes = await db.execute(sql`SELECT clock_seconds FROM drafts WHERE id = ${draftId}::uuid LIMIT 1`);
  const secs = (clkRes as unknown as { rows?: Array<{ clock_seconds: number }> }).rows?.[0]?.clock_seconds || 60;
  const nextRes = await db.execute(sql`
    SELECT s.overall FROM draft_slots s
    WHERE s.draft_id = ${draftId}::uuid AND s.overall > ${draft.cur_overall}
      AND NOT EXISTS (SELECT 1 FROM draft_picks p WHERE p.draft_id = s.draft_id AND p.overall = s.overall)
    ORDER BY s.overall ASC LIMIT 1
  `);
  const next = (nextRes as unknown as { rows?: Array<{ overall: number }> }).rows?.[0]?.overall as number | undefined;
  if (typeof next === 'number') {
    await db.execute(sql`UPDATE drafts SET cur_overall = ${next}, clock_started_at = now(), deadline_ts = now() + (interval '1 second' * ${secs}) WHERE id = ${draftId}::uuid`);
  } else {
    await db.execute(sql`UPDATE drafts SET status = 'COMPLETED', completed_at = now() WHERE id = ${draftId}::uuid`);
  }
  return { picked: false, error: 'no_available_player' };
}

// =====================
// Pick Videos
// =====================
export async function getPickVideos(draftId: string): Promise<Array<{ overall: number; videoUrl: string; playerName: string | null }>> {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`SELECT overall, video_url, player_name FROM draft_pick_videos WHERE draft_id = ${draftId}::uuid ORDER BY overall ASC`);
  const rows = (res as unknown as { rows?: Array<{ overall: number; video_url: string; player_name: string | null }> }).rows || [];
  return rows.map(r => ({ overall: Number(r.overall), videoUrl: r.video_url, playerName: r.player_name || null }));
}

export async function setPickVideo(draftId: string, overall: number, videoUrl: string, playerName?: string | null): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`
    INSERT INTO draft_pick_videos (draft_id, overall, video_url, player_name)
    VALUES (${draftId}::uuid, ${overall}, ${videoUrl}, ${playerName || null})
    ON CONFLICT (draft_id, overall) DO UPDATE SET video_url = EXCLUDED.video_url, player_name = EXCLUDED.player_name
  `);
}

export async function deletePickVideo(draftId: string, overall: number): Promise<void> {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`DELETE FROM draft_pick_videos WHERE draft_id = ${draftId}::uuid AND overall = ${overall}`);
}

export async function prunePriorSeasonsKeepOfficial(currentSeason: number) {
  const db = getDb();
  try {
    // Delete any snapshot for seasons before currentSeason that is not sun_pm_official
    await db
      .delete(taxiSnapshots)
      .where(and(lt(taxiSnapshots.season, currentSeason), ne(taxiSnapshots.runType, 'sun_pm_official')));
    return { ok: true } as const;
  } catch (err) {
    return { ok: false, error: String(err || 'unknown') } as const;
  }
}

export async function listAllUserDocs() {
  const db = getDb();
  const rows = await db.select().from(userDocs);
  return rows;
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row || null;
}

export async function createSuggestion(params: { userId?: string | null; text: string; category?: string | null; createdAt?: Date }) {
  await ensureSuggestionDisplayNumberColumn();
  const db = getDb();
  // Create suggestion with atomically assigned display_number in a single statement
  // Note: This CTE approach is atomic within Postgres. The entire INSERT statement
  // executes atomically, so MAX(display_number) is evaluated and used within the
  // same transaction. This prevents duplicate display numbers under normal conditions.
  // For extreme concurrency, consider using a Postgres SEQUENCE instead.
  const res = await db.execute(sql`
    WITH next_num AS (
      SELECT COALESCE(MAX(display_number), 0) + 1 AS num
      FROM suggestions
    )
    INSERT INTO suggestions (id, user_id, text, category, status, created_at, display_number)
    VALUES (
      gen_random_uuid(),
      ${params.userId || null}::uuid,
      ${params.text},
      ${params.category || null},
      'open',
      ${params.createdAt ? params.createdAt.toISOString() : sql`now()`},
      (SELECT num FROM next_num)
    )
    RETURNING *
  `);
  const row = (res as unknown as { rows?: Array<{ 
    id: string; 
    user_id: string | null; 
    text: string; 
    category: string | null; 
    status: string;
    created_at: Date | string;
    resolved_at: Date | string | null;
    display_number: number | string;
  }> }).rows?.[0];
  if (!row) return null;
  // Note: display_number should always be assigned in the INSERT, but handle missing gracefully
  const displayNumber = row.display_number 
    ? (typeof row.display_number === 'number' ? row.display_number : Number(row.display_number))
    : undefined;
  return {
    id: row.id,
    userId: row.user_id,
    text: row.text,
    category: row.category,
    status: row.status as 'draft' | 'open' | 'accepted' | 'rejected',
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    displayNumber,
  };
}

export async function listSuggestions() {
  const db = getDb();
  const rows = await db.select().from(suggestions).orderBy(desc(suggestions.createdAt));
  return rows;
}

export async function updateSuggestionStatus(id: string, status: 'draft' | 'open' | 'accepted' | 'rejected') {
  const db = getDb();
  type SuggestionInsert = typeof suggestions.$inferInsert;
  const set: Partial<SuggestionInsert> = { status } as Partial<SuggestionInsert>;
  if (status === 'accepted' || status === 'rejected') {
    set.resolvedAt = new Date();
  } else {
    set.resolvedAt = null;
  }
  const [row] = await db.update(suggestions).set(set).where(eq(suggestions.id, id)).returning();
  return row || null;
}

export async function deleteSuggestion(id: string) {
  const db = getDb();
  const rows = await db.delete(suggestions).where(eq(suggestions.id, id)).returning();
  return Array.isArray(rows) ? rows.length > 0 : false;
}

// --- Suggestion sponsors (persist "endorse as team") ---
export async function ensureSuggestionSponsorColumn() {
  try {
    const db = getDb();
    // Best-effort: add column if missing. Safe in Postgres 9.6+.
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS sponsor_team varchar(255)`);
  } catch {}
}

export async function setSuggestionSponsor(id: string, team: string | null) {
  try {
    await ensureSuggestionSponsorColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET sponsor_team = ${team} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionSponsorsMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    await ensureSuggestionSponsorColumn();
    const db = getDb();
    // Return id::text for stable mapping across drivers
    const res = await db.execute(sql`SELECT id::text AS id, sponsor_team FROM suggestions WHERE sponsor_team IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; sponsor_team: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const team = typeof r.sponsor_team === 'string' ? r.sponsor_team : '';
      if (id && team) out[id] = team;
    }
  } catch {}
  return out;
}

// --- Ballot eligibility notification (persisted, atomic) ---
export async function ensureSuggestionBallotNotifyColumns() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS ballot_eligible_notified integer DEFAULT 0 NOT NULL`);
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS ballot_eligible_at timestamp NULL`);
  } catch {}
}

export async function markBallotEligibleIfThreshold(id: string): Promise<{ becameEligible: boolean; eligibleCount: number }> {
  await ensureSuggestionEndorsementsTable();
  await ensureSuggestionProposerColumn();
  await ensureSuggestionBallotNotifyColumns();
  const db = getDb();
  // Atomically compute eligible count (exclude proposer) and set notified flag if crossing threshold
  // Threshold is 3 endorsements (excluding proposer's own endorsement)
  const res = await db.execute(sql`
    WITH cnt AS (
      SELECT COUNT(1)::int AS c
      FROM suggestion_endorsements e
      LEFT JOIN suggestions s ON s.id = e.suggestion_id
      WHERE e.suggestion_id = ${id}::uuid
        AND (s.proposer_team IS NULL OR e.team <> s.proposer_team)
    ),
    upd AS (
      UPDATE suggestions
      SET ballot_eligible_notified = 1,
          ballot_eligible_at = now()
      WHERE id = ${id}::uuid
        AND ballot_eligible_notified = 0
        AND (SELECT c FROM cnt) >= 3
      RETURNING 1 AS updated
    )
    SELECT (SELECT c FROM cnt) AS count,
           EXISTS(SELECT 1 FROM upd) AS updated
  `);
  type Row = { count: number | string; updated: boolean };
  const row = (res as unknown as { rows?: Row[] }).rows?.[0];
  const eligibleCount = row ? (typeof row.count === 'number' ? row.count : Number(row.count || 0)) : 0;
  const becameEligible = Boolean(row && row.updated);
  return { becameEligible, eligibleCount };
}

// --- Suggestion proposer (who submitted publicly when also endorsing) ---
export async function ensureSuggestionProposerColumn() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS proposer_team varchar(255)`);
  } catch {}
}

export async function setSuggestionProposer(id: string, team: string | null) {
  try {
    await ensureSuggestionProposerColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET proposer_team = ${team} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionProposersMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    await ensureSuggestionProposerColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, proposer_team FROM suggestions WHERE proposer_team IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; proposer_team: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const team = typeof r.proposer_team === 'string' ? r.proposer_team : '';
      if (id && team) out[id] = team;
    }
  } catch {}
  return out;
}

// --- Suggestion VAGUE flag ---
export async function ensureSuggestionVagueColumn() {
  try {
    const db = getDb();
    // use integer 0/1 for compatibility
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS vague integer DEFAULT 0 NOT NULL`);
  } catch {}
}

export async function setSuggestionVague(id: string, vague: boolean) {
  try {
    await ensureSuggestionVagueColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET vague = ${vague ? 1 : 0} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionVagueMap(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  try {
    await ensureSuggestionVagueColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, vague FROM suggestions`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; vague: number | string }> }).rows || [];
    type Row = { id: string; vague: number | string };
    for (const r of rawRows as Row[]) {
      const id = typeof r.id === 'string' ? r.id : '';
      const vRaw = r.vague;
      const vNum = typeof vRaw === 'number' ? vRaw : Number(vRaw ?? 0);
      if (id) out[id] = vNum === 1;
    }
  } catch {}
  return out;
}

// --- Suggestion endorsements (multiple teams) ---
export async function ensureSuggestionEndorsementsTable() {
  try {
    const db = getDb();
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS suggestion_endorsements (
        suggestion_id uuid NOT NULL,
        team varchar(255) NOT NULL,
        endorsed_at timestamp DEFAULT now() NOT NULL,
        PRIMARY KEY (suggestion_id, team)
      )
    `);
  } catch {}
}

export async function addSuggestionEndorsement(suggestionId: string, team: string) {
  try {
    await ensureSuggestionEndorsementsTable();
    const db = getDb();
    await db.execute(sql`INSERT INTO suggestion_endorsements (suggestion_id, team) VALUES (${suggestionId}::uuid, ${team}) ON CONFLICT DO NOTHING`);
    return true;
  } catch {
    return false;
  }
}

export async function removeSuggestionEndorsement(suggestionId: string, team: string) {
  try {
    await ensureSuggestionEndorsementsTable();
    const db = getDb();
    await db.execute(sql`DELETE FROM suggestion_endorsements WHERE suggestion_id = ${suggestionId}::uuid AND team = ${team}`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionEndorsementsMap(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  try {
    await ensureSuggestionEndorsementsTable();
    await ensureSuggestionProposerColumn();
    const db = getDb();
    // Exclude proposer's own endorsement from the map (same logic as threshold check)
    const res = await db.execute(sql`
      SELECT e.suggestion_id::text AS suggestion_id, e.team
      FROM suggestion_endorsements e
      LEFT JOIN suggestions s ON s.id = e.suggestion_id
      WHERE s.proposer_team IS NULL OR e.team <> s.proposer_team
    `);
    const rawRows = (res as unknown as { rows?: Array<{ suggestion_id: string; team: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.suggestion_id === 'string' ? r.suggestion_id : '';
      const team = typeof r.team === 'string' ? r.team : '';
      if (!id || !team) continue;
      if (!out[id]) out[id] = [];
      out[id].push(team);
    }
    // sort for stable UI
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.localeCompare(b));
  } catch {}
  return out;
}

// --- Suggestion vote tags (Voted On / Vote Passed / Vote Failed) ---
export async function ensureSuggestionVoteTagColumn() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS vote_tag varchar(32)`);
  } catch {}
}

export type VoteTag = 'voted_on' | 'vote_passed' | 'vote_failed';

export async function setSuggestionVoteTag(id: string, tag: VoteTag | null) {
  try {
    await ensureSuggestionVoteTagColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET vote_tag = ${tag} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionVoteTagsMap(): Promise<Record<string, VoteTag>> {
  const out: Record<string, VoteTag> = {};
  try {
    await ensureSuggestionVoteTagColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, vote_tag FROM suggestions WHERE vote_tag IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; vote_tag: string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const tag = typeof r.vote_tag === 'string' ? (r.vote_tag as VoteTag) : undefined;
      if (id && tag) out[id] = tag;
    }
  } catch {}
  return out;
}

// --- Suggestion grouping (multi-suggestion submissions) ---
export async function ensureSuggestionGroupColumns() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS group_id varchar(64)`);
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS group_pos integer DEFAULT 1 NOT NULL`);
  } catch {}
}

export async function setSuggestionGroup(id: string, groupId: string | null, groupPos?: number | null) {
  try {
    await ensureSuggestionGroupColumns();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET group_id = ${groupId}, group_pos = ${groupPos ?? 1} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getSuggestionGroupsMap(): Promise<Record<string, { groupId: string; groupPos: number }>> {
  const out: Record<string, { groupId: string; groupPos: number }> = {};
  try {
    await ensureSuggestionGroupColumns();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, group_id, group_pos FROM suggestions WHERE group_id IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; group_id: string; group_pos: number | string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const gid = typeof r.group_id === 'string' ? r.group_id : '';
      const posRaw = r.group_pos;
      const pos = typeof posRaw === 'number' ? posRaw : Number(posRaw ?? 1);
      if (id && gid) out[id] = { groupId: gid, groupPos: pos > 0 ? pos : 1 };
    }
  } catch {}
  return out;
}

// --- Suggestion display numbers (stable sequential numbering) ---
export async function ensureSuggestionDisplayNumberColumn() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS display_number integer`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS suggestions_display_number_idx ON suggestions(display_number) WHERE display_number IS NOT NULL`);
  } catch {}
}

export async function backfillSuggestionDisplayNumbers() {
  try {
    await ensureSuggestionDisplayNumberColumn();
    const db = getDb();
    // Backfill display_number for existing rows by ascending createdAt (ties broken by id)
    await db.execute(sql`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS num
        FROM suggestions
        WHERE display_number IS NULL
      )
      UPDATE suggestions
      SET display_number = numbered.num
      FROM numbered
      WHERE suggestions.id = numbered.id
    `);
    return true;
  } catch {
    return false;
  }
}

export async function getNextDisplayNumber(): Promise<number> {
  try {
    await ensureSuggestionDisplayNumberColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT COALESCE(MAX(display_number), 0) + 1 AS next FROM suggestions`);
    const row = (res as unknown as { rows?: Array<{ next: number | string }> }).rows?.[0];
    return row ? (typeof row.next === 'number' ? row.next : Number(row.next || 1)) : 1;
  } catch {
    return 1;
  }
}

export async function assignDisplayNumber(id: string): Promise<number | null> {
  try {
    await ensureSuggestionDisplayNumberColumn();
    const db = getDb();
    // Atomically assign next display number using a single transaction
    const res = await db.execute(sql`
      WITH next_num AS (
        SELECT COALESCE(MAX(display_number), 0) + 1 AS num
        FROM suggestions
      )
      UPDATE suggestions
      SET display_number = (SELECT num FROM next_num)
      WHERE id = ${id}::uuid AND display_number IS NULL
      RETURNING display_number
    `);
    const row = (res as unknown as { rows?: Array<{ display_number: number | string }> }).rows?.[0];
    return row ? (typeof row.display_number === 'number' ? row.display_number : Number(row.display_number || 0)) : null;
  } catch {
    return null;
  }
}

export async function getSuggestionDisplayNumbersMap(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  try {
    await ensureSuggestionDisplayNumberColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, display_number FROM suggestions WHERE display_number IS NOT NULL`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; display_number: number | string }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      const num = typeof r.display_number === 'number' ? r.display_number : Number(r.display_number || 0);
      if (id && num > 0) out[id] = num;
    }
  } catch {}
  return out;
}

// --- Ballot forced (admin override to add/remove from ballot) ---
export async function ensureBallotForcedColumn() {
  try {
    const db = getDb();
    await db.execute(sql`ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS ballot_forced integer DEFAULT 0 NOT NULL`);
  } catch {}
}

export async function setBallotForced(id: string, forced: boolean) {
  try {
    await ensureBallotForcedColumn();
    const db = getDb();
    await db.execute(sql`UPDATE suggestions SET ballot_forced = ${forced ? 1 : 0} WHERE id = ${id}::uuid`);
    return true;
  } catch {
    return false;
  }
}

export async function getBallotForcedMap(): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  try {
    await ensureBallotForcedColumn();
    const db = getDb();
    const res = await db.execute(sql`SELECT id::text AS id, ballot_forced FROM suggestions WHERE ballot_forced = 1`);
    const rawRows = (res as unknown as { rows?: Array<{ id: string; ballot_forced: number }> }).rows || [];
    for (const r of rawRows) {
      const id = typeof r.id === 'string' ? r.id : '';
      if (id) out[id] = true;
    }
  } catch {}
  return out;
}

export async function addTaxiMember(teamId: string, playerId: string, activeFrom?: Date) {
  const db = getDb();
  const [row] = await db.insert(taxiSquadMembers).values({ teamId, playerId, activeFrom: activeFrom || new Date() }).returning();
  return row;
}

export async function removeTaxiMember(teamId: string, playerId: string, activeTo?: Date) {
  const db = getDb();
  const [row] = await db
    .update(taxiSquadMembers)
    .set({ activeTo: activeTo || new Date() })
    .where(and(eq(taxiSquadMembers.teamId, teamId), eq(taxiSquadMembers.playerId, playerId), isNull(taxiSquadMembers.activeTo)))
    .returning();
  return row || null;
}

export async function listTaxiMembers(teamId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSquadMembers)
    .where(and(eq(taxiSquadMembers.teamId, teamId), isNull(taxiSquadMembers.activeTo)));
  return rows;
}

export async function logTaxiEvent(params: {
  teamId: string;
  playerId: string;
  eventType: 'add' | 'remove' | 'promote' | 'demote';
  eventAt?: Date;
  meta?: Record<string, unknown> | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(taxiSquadEvents)
    .values({ teamId: params.teamId, playerId: params.playerId, eventType: params.eventType, eventAt: params.eventAt || new Date(), meta: params.meta || null })
    .returning();
  return row;
}

export async function listTaxiEvents(teamId: string, limit = 100) {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSquadEvents)
    .where(eq(taxiSquadEvents.teamId, teamId))
    .orderBy(desc(taxiSquadEvents.eventAt));
  return rows.slice(0, limit);
}

export async function getTeamPinBySlug(teamSlug: string) {
  const db = getDb();
  const [row] = await db.select().from(teamPins).where(eq(teamPins.teamSlug, teamSlug)).limit(1);
  return row || null;
}

export async function setTeamPin(teamSlug: string, value: { hash: string; salt: string; pinVersion: number; updatedAt?: Date }) {
  const db = getDb();
  const [row] = await db
    .insert(teamPins)
    .values({ teamSlug, hash: value.hash, salt: value.salt, pinVersion: value.pinVersion, updatedAt: value.updatedAt || new Date() })
    .onConflictDoUpdate({ target: teamPins.teamSlug, set: { hash: value.hash, salt: value.salt, pinVersion: value.pinVersion, updatedAt: value.updatedAt || new Date() } })
    .returning();
  return row;
}

export async function getTaxiObservation(team: string) {
  const db = getDb();
  const [row] = await db.select().from(taxiObservations).where(eq(taxiObservations.team, team)).limit(1);
  return row || null;
}

export async function setTaxiObservation(
  team: string,
  payload: { updatedAt: Date; players: Record<string, { firstSeen: string; lastSeen: string; seenCount: number }> }
) {
  const db = getDb();
  const [row] = await db
    .insert(taxiObservations)
    .values({ team, updatedAt: payload.updatedAt, players: payload.players })
    .onConflictDoUpdate({ target: taxiObservations.team, set: { updatedAt: payload.updatedAt, players: payload.players } })
    .returning();
  return row;
}

// ===== Taxi Auditor: Tenures / Txn Cache / Snapshots =====

export type AcqVia = 'free_agent' | 'waiver' | 'trade' | 'draft' | 'other';

export async function upsertTenure(params: { teamId: string; playerId: string; acquiredAt: Date; acquiredVia: AcqVia }) {
  const db = getDb();
  const [row] = await db
    .insert(tenures)
    .values({
      teamId: params.teamId,
      playerId: params.playerId,
      acquiredAt: params.acquiredAt,
      acquiredVia: params.acquiredVia,
      activeSeen: 0,
      lastActiveAt: null,
    })
    .onConflictDoUpdate({
      target: [tenures.teamId, tenures.playerId],
      // IMPORTANT: Do NOT reset activeSeen on re-acquisition
      // We need to preserve historical activation data across drop/re-acquire cycles
      // Only update acquisition metadata
      set: { acquiredAt: params.acquiredAt, acquiredVia: params.acquiredVia },
    })
    .returning();
  return row;
}

export async function markTenureActive(params: { teamId: string; playerId: string; at?: Date }) {
  const db = getDb();
  const [row] = await db
    .update(tenures)
    .set({ activeSeen: 1, lastActiveAt: params.at || new Date() })
    .where(and(eq(tenures.teamId, params.teamId), eq(tenures.playerId, params.playerId)))
    .returning();
  return row || null;
}

/**
 * Check if a player was ever activated by a team (across all tenures/acquisitions).
 * Returns true if activeSeen = 1, meaning the player appeared on active roster at some point.
 * This persists across drop/re-acquire cycles.
 */
export async function wasPlayerEverActivatedByTeam(params: { teamId: string; playerId: string }): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ activeSeen: tenures.activeSeen })
    .from(tenures)
    .where(and(eq(tenures.teamId, params.teamId), eq(tenures.playerId, params.playerId)))
    .limit(1);
  
  if (rows.length === 0) return false;
  return (rows[0].activeSeen ?? 0) === 1;
}

export async function deleteTenure(params: { teamId: string; playerId: string }) {
  const db = getDb();
  // When a player is dropped, we keep the tenure record to preserve activation history
  // We just mark when they were last active (if they were)
  // The activeSeen flag is preserved so we know if they were ever activated by this team
  const existing = await db
    .select()
    .from(tenures)
    .where(and(eq(tenures.teamId, params.teamId), eq(tenures.playerId, params.playerId)))
    .limit(1);
  
  if (existing.length > 0 && existing[0].activeSeen === 0) {
    // Player was never activated, we can safely delete the tenure
    await db.delete(tenures).where(and(eq(tenures.teamId, params.teamId), eq(tenures.playerId, params.playerId)));
    return null;
  }
  
  // Player was activated - keep the record for historical tracking
  // Just update lastActiveAt if not already set
  const [row] = await db
    .update(tenures)
    .set({ lastActiveAt: new Date() })
    .where(and(eq(tenures.teamId, params.teamId), eq(tenures.playerId, params.playerId)))
    .returning();
  return row || null;
}

export async function bulkInsertTxnCacheWithPrune(rows: Array<{ week: number; teamId: string; playerId: string; type: string; direction: string; ts: Date }>) {
  if (!rows || rows.length === 0) return 0;
  const db = getDb();
  await db.insert(txnCache).values(rows).catch(() => undefined);
  // prune older than ~120 days
  const now = Date.now();
  const cutoff = new Date(now - 120 * 24 * 60 * 60 * 1000);
  try {
    await db.delete(txnCache).where(lt(txnCache.ts, cutoff));
  } catch {}
  return rows.length;
}

export async function writeTaxiSnapshot(params: {
  season: number; week: number; runType: 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | 'admin_rerun';
  runTs: Date; teamId: string; taxiIds: string[]; compliant: boolean; violations: Array<{ code: string; detail?: string; players?: string[] }>; degraded?: boolean;
}) {
  const db = getDb();
  const [row] = await db
    .insert(taxiSnapshots)
    .values({
      season: params.season,
      week: params.week,
      runType: params.runType,
      runTs: params.runTs,
      teamId: params.teamId,
      taxiIds: params.taxiIds as unknown as string[],
      compliant: params.compliant ? 1 : 0,
      violations: params.violations,
      degraded: params.degraded ? 1 : 0,
    })
    .onConflictDoUpdate({
      target: [taxiSnapshots.season, taxiSnapshots.week, taxiSnapshots.runType, taxiSnapshots.teamId],
      set: {
        runTs: params.runTs,
        taxiIds: params.taxiIds as unknown as string[],
        compliant: params.compliant ? 1 : 0,
        violations: params.violations,
        degraded: params.degraded ? 1 : 0,
      },
    })
    .returning();
  return row;
}

export async function getLatestTaxiRunMeta() {
  const db = getDb();
  const rows = await db.select().from(taxiSnapshots).orderBy(desc(taxiSnapshots.runTs)).limit(1);
  const latest = rows[0];
  if (!latest) return null as null | { season: number; week: number; runType: string; runTs: Date };
  return { season: latest.season, week: latest.week, runType: latest.runType, runTs: latest.runTs } as { season: number; week: number; runType: string; runTs: Date };
}

export async function getLatestAdminRerunMeta() {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSnapshots)
    .where(eq(taxiSnapshots.runType, 'admin_rerun'))
    .orderBy(desc(taxiSnapshots.runTs))
    .limit(1);
  const latest = rows[0];
  if (!latest) return null as null | { season: number; week: number; runType: 'admin_rerun'; runTs: Date };
  return { season: latest.season, week: latest.week, runType: 'admin_rerun', runTs: latest.runTs } as { season: number; week: number; runType: 'admin_rerun'; runTs: Date };
}

export async function getTaxiSnapshotsForRun(params: { season: number; week: number; runType: 'wed_warn' | 'thu_warn' | 'sun_am_warn' | 'sun_pm_official' | 'admin_rerun' }) {
  const db = getDb();
  const rows = await db
    .select()
    .from(taxiSnapshots)
    .where(and(eq(taxiSnapshots.season, params.season), eq(taxiSnapshots.week, params.week), eq(taxiSnapshots.runType, params.runType)));
  return rows;
}

export async function getFirstTaxiSeenForPlayer(params: { season: number; teamId: string; playerId: string }) {
  const db = getDb();
  const rows = await db
    .select({ season: taxiSnapshots.season, week: taxiSnapshots.week, runTs: taxiSnapshots.runTs, runType: taxiSnapshots.runType })
    .from(taxiSnapshots)
    .where(and(
      eq(taxiSnapshots.season, params.season),
      eq(taxiSnapshots.teamId, params.teamId),
      sql`${params.playerId} = ANY(${taxiSnapshots.taxiIds})`
    ))
    .orderBy(taxiSnapshots.runTs)
    .limit(1);
  return rows[0] || null as null | { season: number; week: number; runTs: Date; runType: string };
}

export async function getUserDoc(userId: string) {
  const db = getDb();
  const [row] = await db.select().from(userDocs).where(eq(userDocs.userId, userId)).limit(1);
  return row || null;
}

export async function getUserDocByTeam(team: string) {
  const db = getDb();
  const [row] = await db
    .select()
    .from(userDocs)
    .where(eq(userDocs.team, team))
    .orderBy(desc(userDocs.updatedAt))
    .limit(1);
  return row || null;
}

export async function setUserDoc(doc: {
  userId: string;
  team: string;
  version: number;
  updatedAt: Date;
  votes?: Record<string, Record<string, number>> | null;
  tradeBlock?: Array<Record<string, unknown>> | null;
  tradeWants?: { text?: string; positions?: string[] } | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(userDocs)
    .values({
      userId: doc.userId,
      team: doc.team,
      version: doc.version,
      updatedAt: doc.updatedAt,
      votes: doc.votes ?? null,
      tradeBlock: doc.tradeBlock ?? null,
      tradeWants: doc.tradeWants ?? null,
    })
    .onConflictDoUpdate({
      target: userDocs.userId,
      set: {
        team: doc.team,
        version: doc.version,
        updatedAt: doc.updatedAt,
        votes: doc.votes ?? null,
        tradeBlock: doc.tradeBlock ?? null,
        tradeWants: doc.tradeWants ?? null,
      },
    })
    .returning();
  return row;
}

// --- Trade Block Events ---
export async function createTradeBlockEvent(event: {
  team: string;
  eventType: string;
  assetType?: string | null;
  assetId?: string | null;
  assetLabel?: string | null;
  oldWants?: string | null;
  newWants?: string | null;
}) {
  const db = getDb();
  const [row] = await db
    .insert(tradeBlockEvents)
    .values({
      team: event.team,
      eventType: event.eventType,
      assetType: event.assetType ?? null,
      assetId: event.assetId ?? null,
      assetLabel: event.assetLabel ?? null,
      oldWants: event.oldWants ?? null,
      newWants: event.newWants ?? null,
    })
    .returning();
  return row;
}

export async function getPendingTradeBlockEvents(olderThanSeconds: number = 120) {
  const db = getDb();
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const rows = await db
    .select()
    .from(tradeBlockEvents)
    .where(and(
      isNull(tradeBlockEvents.sentAt),
      lt(tradeBlockEvents.createdAt, cutoff)
    ))
    .orderBy(tradeBlockEvents.team, tradeBlockEvents.createdAt);
  return rows;
}

export async function markTradeBlockEventsSent(eventIds: string[]) {
  if (eventIds.length === 0) return;
  const db = getDb();
  await db
    .update(tradeBlockEvents)
    .set({ sentAt: new Date() })
    .where(sql`${tradeBlockEvents.id} = ANY(${eventIds}::uuid[])`);
}

export async function clearAllPendingTradeBlockEvents() {
  const db = getDb();
  await db
    .update(tradeBlockEvents)
    .set({ sentAt: new Date() })
    .where(isNull(tradeBlockEvents.sentAt));
}

// ===== Draft Trade System =====

export type TradeStatus = 'pending' | 'accepted' | 'rejected' | 'countered' | 'approved' | 'cancelled';
export type TradeAssetType = 'player' | 'current_pick' | 'future_pick';

export type TradeAsset = {
  id: string;
  tradeId: string;
  fromTeam: string;
  toTeam: string;
  assetType: TradeAssetType;
  playerId?: string | null;
  playerName?: string | null;
  playerPos?: string | null;
  pickOverall?: number | null;
  pickYear?: number | null;
  pickRound?: number | null;
  pickOriginalTeam?: string | null;
};

export type DraftTrade = {
  id: string;
  draftId: string;
  status: TradeStatus;
  proposedBy: string;
  teams: string[];
  acceptedBy: string[];
  counterOf?: string | null;
  notes?: string | null;
  proposedAt: string;
  updatedAt: string;
  assets: TradeAsset[];
};

export type DraftRosterPlayer = {
  playerId: string;
  playerName: string | null;
  playerPos: string | null;
  playerNfl: string | null;
  acquiredVia: string;
};

export type DraftFuturePick = {
  id: string;
  draftId: string;
  ownerTeam: string;
  originalTeam: string;
  year: number;
  round: number;
};

// Roster snapshot helpers
export async function bulkInsertRosterSnapshot(draftId: string, team: string, players: Array<{ playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null }>, acquiredVia = 'sleeper') {
  await ensureDraftTables();
  const db = getDb();
  for (const p of players) {
    await db.execute(sql`
      INSERT INTO draft_roster_snapshots (draft_id, team, player_id, player_name, player_pos, player_nfl, acquired_via)
      VALUES (${draftId}::uuid, ${team}, ${p.playerId}, ${p.playerName ?? null}, ${p.playerPos ?? null}, ${p.playerNfl ?? null}, ${acquiredVia})
      ON CONFLICT (draft_id, team, player_id) DO NOTHING
    `);
  }
}

export async function addPlayerToRosterSnapshot(draftId: string, team: string, player: { playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null }, acquiredVia = 'draft_pick') {
  await ensureDraftTables();
  const db = getDb();
  await db.execute(sql`
    INSERT INTO draft_roster_snapshots (draft_id, team, player_id, player_name, player_pos, player_nfl, acquired_via)
    VALUES (${draftId}::uuid, ${team}, ${player.playerId}, ${player.playerName ?? null}, ${player.playerPos ?? null}, ${player.playerNfl ?? null}, ${acquiredVia})
    ON CONFLICT (draft_id, team, player_id) DO NOTHING
  `);
}

export async function movePlayerInSnapshot(draftId: string, playerId: string, fromTeam: string, toTeam: string) {
  const db = getDb();
  await db.execute(sql`
    UPDATE draft_roster_snapshots
    SET team = ${toTeam}, acquired_via = 'trade'
    WHERE draft_id = ${draftId}::uuid AND player_id = ${playerId} AND team = ${fromTeam}
  `);
}

export async function getRosterSnapshot(draftId: string, team: string): Promise<DraftRosterPlayer[]> {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`SELECT player_id, player_name, player_pos, player_nfl, acquired_via FROM draft_roster_snapshots WHERE draft_id = ${draftId}::uuid AND team = ${team} ORDER BY player_pos, player_name`);
  const rows = (res as unknown as { rows?: Array<{ player_id: string; player_name: string | null; player_pos: string | null; player_nfl: string | null; acquired_via: string }> }).rows || [];
  return rows.map(r => ({ playerId: r.player_id, playerName: r.player_name, playerPos: r.player_pos, playerNfl: r.player_nfl, acquiredVia: r.acquired_via }));
}

export async function hasRosterSnapshot(draftId: string): Promise<boolean> {
  const db = getDb();
  const res = await db.execute(sql`SELECT 1 FROM draft_roster_snapshots WHERE draft_id = ${draftId}::uuid LIMIT 1`);
  return ((res as unknown as { rows?: unknown[] }).rows?.length ?? 0) > 0;
}

// Future picks helpers
export async function bulkInsertFuturePicks(draftId: string, picks: Array<{ ownerTeam: string; originalTeam: string; year: number; round: number }>) {
  await ensureDraftTables();
  const db = getDb();
  for (const p of picks) {
    await db.execute(sql`
      INSERT INTO draft_future_picks (draft_id, owner_team, original_team, year, round)
      VALUES (${draftId}::uuid, ${p.ownerTeam}, ${p.originalTeam}, ${p.year}, ${p.round})
    `);
  }
}

export async function getFuturePicks(draftId: string, ownerTeam?: string): Promise<DraftFuturePick[]> {
  await ensureDraftTables();
  const db = getDb();
  const res = ownerTeam
    ? await db.execute(sql`SELECT id::text AS id, draft_id::text AS draft_id, owner_team, original_team, year, round FROM draft_future_picks WHERE draft_id = ${draftId}::uuid AND owner_team = ${ownerTeam} ORDER BY year, round`)
    : await db.execute(sql`SELECT id::text AS id, draft_id::text AS draft_id, owner_team, original_team, year, round FROM draft_future_picks WHERE draft_id = ${draftId}::uuid ORDER BY owner_team, year, round`);
  const rows = (res as unknown as { rows?: Array<{ id: string; draft_id: string; owner_team: string; original_team: string; year: number; round: number }> }).rows || [];
  return rows.map(r => ({ id: r.id, draftId: r.draft_id, ownerTeam: r.owner_team, originalTeam: r.original_team, year: r.year, round: r.round }));
}

export async function moveFuturePick(pickId: string, toTeam: string) {
  const db = getDb();
  await db.execute(sql`UPDATE draft_future_picks SET owner_team = ${toTeam} WHERE id = ${pickId}::uuid`);
}

export async function hasFuturePickSnapshot(draftId: string): Promise<boolean> {
  const db = getDb();
  const res = await db.execute(sql`SELECT 1 FROM draft_future_picks WHERE draft_id = ${draftId}::uuid LIMIT 1`);
  return ((res as unknown as { rows?: unknown[] }).rows?.length ?? 0) > 0;
}

// Trade CRUD
export async function createDraftTrade(params: {
  draftId: string;
  proposedBy: string;
  teams: string[];
  assets: Array<{ fromTeam: string; toTeam: string; assetType: TradeAssetType; playerId?: string | null; playerName?: string | null; playerPos?: string | null; pickOverall?: number | null; pickYear?: number | null; pickRound?: number | null; pickOriginalTeam?: string | null }>;
  counterOf?: string | null;
  notes?: string | null;
}): Promise<string> {
  await ensureDraftTables();
  const db = getDb();
  const tradeId = randomUUID();
  const teamsJson = JSON.stringify(params.teams);
  const acceptedByJson = JSON.stringify([params.proposedBy]);
  await db.execute(sql`
    INSERT INTO draft_trades (id, draft_id, status, proposed_by, teams, accepted_by, counter_of, notes)
    VALUES (${tradeId}::uuid, ${params.draftId}::uuid, 'pending', ${params.proposedBy}, ${teamsJson}::jsonb, ${acceptedByJson}::jsonb, ${params.counterOf ? sql`${params.counterOf}::uuid` : sql`NULL`}, ${params.notes ?? null})
  `);
  for (const a of params.assets) {
    await db.execute(sql`
      INSERT INTO draft_trade_assets (trade_id, from_team, to_team, asset_type, player_id, player_name, player_pos, pick_overall, pick_year, pick_round, pick_original_team)
      VALUES (${tradeId}::uuid, ${a.fromTeam}, ${a.toTeam}, ${a.assetType}, ${a.playerId ?? null}, ${a.playerName ?? null}, ${a.playerPos ?? null}, ${a.pickOverall ?? null}, ${a.pickYear ?? null}, ${a.pickRound ?? null}, ${a.pickOriginalTeam ?? null})
    `);
  }
  return tradeId;
}

function parseJsonbArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; } }
  return [];
}

function mapTradeRow(r: Record<string, unknown>, assets: TradeAsset[]): DraftTrade {
  return {
    id: String(r.id),
    draftId: String(r.draft_id),
    status: r.status as TradeStatus,
    proposedBy: String(r.proposed_by),
    teams: parseJsonbArray(r.teams),
    acceptedBy: parseJsonbArray(r.accepted_by),
    counterOf: (r.counter_of as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    proposedAt: r.proposed_at ? new Date(r.proposed_at as string).toISOString() : '',
    updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : '',
    assets,
  };
}

function mapAssetRow(r: Record<string, unknown>): TradeAsset {
  return {
    id: String(r.id),
    tradeId: String(r.trade_id),
    fromTeam: String(r.from_team),
    toTeam: String(r.to_team),
    assetType: r.asset_type as TradeAssetType,
    playerId: (r.player_id as string | null) ?? null,
    playerName: (r.player_name as string | null) ?? null,
    playerPos: (r.player_pos as string | null) ?? null,
    pickOverall: r.pick_overall != null ? Number(r.pick_overall) : null,
    pickYear: r.pick_year != null ? Number(r.pick_year) : null,
    pickRound: r.pick_round != null ? Number(r.pick_round) : null,
    pickOriginalTeam: (r.pick_original_team as string | null) ?? null,
  };
}

async function fetchAssetsForTrades(db: ReturnType<typeof getDb>, tradeIds: string[]): Promise<Map<string, TradeAsset[]>> {
  if (tradeIds.length === 0) return new Map();
  const list = tradeIds.map(id => `'${id}'::uuid`).join(',');
  const res = await db.execute(sql`SELECT id::text AS id, trade_id::text AS trade_id, from_team, to_team, asset_type, player_id, player_name, player_pos, pick_overall, pick_year, pick_round, pick_original_team FROM draft_trade_assets WHERE trade_id = ANY(ARRAY[${sql.raw(list)}])`);
  const rows = (res as unknown as { rows?: Array<Record<string, unknown>> }).rows || [];
  const map = new Map<string, TradeAsset[]>();
  for (const r of rows) {
    const tid = String(r.trade_id);
    if (!map.has(tid)) map.set(tid, []);
    map.get(tid)!.push(mapAssetRow(r));
  }
  return map;
}

export async function getDraftTradesForTeam(draftId: string, team: string): Promise<DraftTrade[]> {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`
    SELECT id::text AS id, draft_id::text AS draft_id, status, proposed_by, teams, accepted_by, counter_of::text AS counter_of, notes, proposed_at, updated_at
    FROM draft_trades
    WHERE draft_id = ${draftId}::uuid AND teams @> ${JSON.stringify([team])}::jsonb
    ORDER BY proposed_at DESC
  `);
  const rows = (res as unknown as { rows?: Array<Record<string, unknown>> }).rows || [];
  const ids = rows.map(r => String(r.id));
  const assetsMap = await fetchAssetsForTrades(db, ids);
  return rows.map(r => mapTradeRow(r, assetsMap.get(String(r.id)) || []));
}

export async function getAdminPendingTrades(draftId: string): Promise<DraftTrade[]> {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`
    SELECT id::text AS id, draft_id::text AS draft_id, status, proposed_by, teams, accepted_by, counter_of::text AS counter_of, notes, proposed_at, updated_at
    FROM draft_trades
    WHERE draft_id = ${draftId}::uuid AND status = 'accepted'
    ORDER BY updated_at ASC
  `);
  const rows = (res as unknown as { rows?: Array<Record<string, unknown>> }).rows || [];
  const ids = rows.map(r => String(r.id));
  const assetsMap = await fetchAssetsForTrades(db, ids);
  return rows.map(r => mapTradeRow(r, assetsMap.get(String(r.id)) || []));
}

export async function getDraftTradeById(tradeId: string): Promise<DraftTrade | null> {
  await ensureDraftTables();
  const db = getDb();
  const res = await db.execute(sql`
    SELECT id::text AS id, draft_id::text AS draft_id, status, proposed_by, teams, accepted_by, counter_of::text AS counter_of, notes, proposed_at, updated_at
    FROM draft_trades WHERE id = ${tradeId}::uuid LIMIT 1
  `);
  const row = (res as unknown as { rows?: Array<Record<string, unknown>> }).rows?.[0];
  if (!row) return null;
  const assetsMap = await fetchAssetsForTrades(db, [String(row.id)]);
  return mapTradeRow(row, assetsMap.get(String(row.id)) || []);
}

export async function updateTradeStatus(tradeId: string, status: TradeStatus) {
  const db = getDb();
  await db.execute(sql`UPDATE draft_trades SET status = ${status}, updated_at = now() WHERE id = ${tradeId}::uuid`);
}

export async function addTradeAcceptance(tradeId: string, team: string): Promise<{ allAccepted: boolean; trade: DraftTrade | null }> {
  const db = getDb();
  await db.execute(sql`
    UPDATE draft_trades
    SET accepted_by = (accepted_by || ${JSON.stringify([team])}::jsonb) - 'null',
        updated_at = now()
    WHERE id = ${tradeId}::uuid AND NOT (accepted_by @> ${JSON.stringify([team])}::jsonb)
  `);
  const trade = await getDraftTradeById(tradeId);
  if (!trade) return { allAccepted: false, trade: null };
  const allAccepted = trade.teams.every(t => trade.acceptedBy.includes(t));
  if (allAccepted) {
    await updateTradeStatus(tradeId, 'accepted');
    trade.status = 'accepted';
  }
  return { allAccepted, trade };
}

export async function approveDraftTrade(tradeId: string): Promise<DraftTrade | null> {
  await ensureDraftTables();
  const db = getDb();
  const trade = await getDraftTradeById(tradeId);
  if (!trade || trade.status !== 'accepted') return null;
  // Execute asset swaps
  for (const asset of trade.assets) {
    if (asset.assetType === 'player' && asset.playerId) {
      await movePlayerInSnapshot(trade.draftId, asset.playerId, asset.fromTeam, asset.toTeam);
    } else if (asset.assetType === 'current_pick' && asset.pickOverall != null) {
      await db.execute(sql`UPDATE draft_slots SET team = ${asset.toTeam} WHERE draft_id = ${trade.draftId}::uuid AND overall = ${asset.pickOverall}`);
    } else if (asset.assetType === 'future_pick' && asset.pickYear != null && asset.pickRound != null && asset.pickOriginalTeam) {
      await db.execute(sql`UPDATE draft_future_picks SET owner_team = ${asset.toTeam} WHERE draft_id = ${trade.draftId}::uuid AND owner_team = ${asset.fromTeam} AND year = ${asset.pickYear} AND round = ${asset.pickRound} AND original_team = ${asset.pickOriginalTeam}`);
    }
  }
  await updateTradeStatus(tradeId, 'approved');
  // Set pending animation trigger for overlay
  const animPayload = JSON.stringify({
    teams: trade.teams,
    assets: trade.assets.map(a => ({
      fromTeam: a.fromTeam, toTeam: a.toTeam, assetType: a.assetType,
      playerName: a.playerName, playerPos: a.playerPos,
      pickOverall: a.pickOverall, pickYear: a.pickYear, pickRound: a.pickRound, pickOriginalTeam: a.pickOriginalTeam,
    })),
  });
  await db.execute(sql`UPDATE drafts SET pending_trade_animation = ${animPayload}::jsonb WHERE id = ${trade.draftId}::uuid`);
  return getDraftTradeById(tradeId);
}

export async function clearTradeAnimation(draftId: string): Promise<void> {
  const db = getDb();
  await db.execute(sql`UPDATE drafts SET pending_trade_animation = NULL WHERE id = ${draftId}::uuid`);
}
