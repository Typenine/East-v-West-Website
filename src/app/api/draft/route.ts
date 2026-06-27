import { NextRequest, NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { snapshotDraftRosters, snapshotDraftFuturePicks } from '@/server/draft-snapshot';
import { getDb } from '@/server/db/client';
import {
  ensureDraftTables,
  createDraftWithOrder,
  resetDraft,
  resetDraftTrades,
  setDraftOrder,
  setDraftSlots,
  deleteDraft,
  getActiveOrLatestDraftId,
  getDraftOverview,
  startDraft,
  pauseDraft,
  resumeDraft,
  pauseDraftForAnimation,
  pauseDraftManual,
  checkStaleAnimationPause,
  setClockSeconds,
  resetPickClock,
  commitPick,
  forcePick,
  undoLastPick,
  getTeamQueue,
  setTeamQueue,
  removePlayerFromQueue,
  updateDraftBranding,
  saveDraftWorkspaceBranding,
  seedDraftFromWorkspace,
  getDraftWorkspace,
  listPlayerPools,
  createPlayerPool,
  replacePlayerPoolRows,
  deletePlayerPool,
  copyPlayerPoolToDraft,
  setDraftWorkspaceDefaultPool,
  getDraftPickedPlayerIds,
  countDraftPlayers,
  getDraftPlayers,
  setDraftPlayers,
  clearDraftPlayers,
  checkAndAutoPick,
  submitPendingPick,
  getPendingPick,
  resolvePendingPick,
  addPlayerToRosterSnapshot,
} from '@/server/db/queries';
import type { DraftOverview } from '@/server/db/queries';
import { TEAM_NAMES } from '@/lib/constants/league';
import { requireTeamUser } from '@/lib/server/session';
import { canonicalizeTeamName } from '@/lib/server/user-identity';
import { getAllPlayersCached, type SleeperPlayer } from '@/lib/utils/sleeper-api';
import { isAdminCookieValue } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PauseReason = 'manual' | 'pick_animation' | 'round_end' | 'trade_animation' | 'pending_pick' | null;

const draftPresence = new Map<string, number>();
const PRESENCE_TIMEOUT_MS = 20000;

function getActiveViewers(): string[] {
  const now = Date.now();
  const active: string[] = [];
  for (const [team, lastSeen] of draftPresence.entries()) {
    if (now - lastSeen < PRESENCE_TIMEOUT_MS) active.push(team);
    else draftPresence.delete(team);
  }
  return active;
}

function recordPresence(team: string): void {
  if (team) draftPresence.set(team, Date.now());
}

function isAdmin(req: NextRequest): boolean {
  try {
    return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
  } catch {
    return false;
  }
}

function ok(data: unknown, status = 200) {
  return new NextResponse(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bad(msg: string, status = 400) {
  return ok({ error: msg }, status);
}

function isDataUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trimStart().toLowerCase().startsWith('data:');
}

function sanitizeLogoForResponse(value: string | null | undefined): string | null {
  if (!value) return null;
  return isDataUrl(value) ? null : value;
}

type DraftAvailPlayer = { id: string; name: string; pos: string; nfl: string; college?: string | null };

function draftRowToAvail(r: {
  player_id: string;
  name: string;
  pos: string;
  nfl: string | null;
  meta?: unknown | null;
}): DraftAvailPlayer {
  let college: string | null = null;
  if (r.meta && typeof r.meta === 'object') {
    const m = r.meta as Record<string, unknown>;
    const c = m.college ?? m.school;
    if (typeof c === 'string' && c.trim()) college = c.trim();
  }
  return { id: r.player_id, name: r.name, pos: r.pos, nfl: r.nfl || '', college };
}

async function getSleeperDefensesAvailable(taken: Set<string>): Promise<DraftAvailPlayer[]> {
  const players = await getAllPlayersCached();
  return Object.values(players)
    .filter((p: SleeperPlayer) => (p.position || '').toUpperCase() === 'DEF' && !taken.has(p.player_id))
    .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
    .map((p) => ({
      id: p.player_id,
      name: `${p.first_name} ${p.last_name}`.trim(),
      pos: 'DEF',
      nfl: p.team || '',
      college: p.college || null,
    }));
}

async function buildCustomPoolAvailable(
  rows: Awaited<ReturnType<typeof getDraftPlayers>>,
  taken: Set<string>,
): Promise<DraftAvailPlayer[]> {
  const customIds = new Set(rows.map((r) => r.player_id));
  const fromPool = rows.filter((r) => !taken.has(r.player_id)).map(draftRowToAvail);
  const sleeperDefs = (await getSleeperDefensesAvailable(taken)).filter((d) => !customIds.has(d.id));
  return [...fromPool, ...sleeperDefs];
}

function buildDraftRevision(
  overview: DraftOverview,
  pendingPick: Awaited<ReturnType<typeof getPendingPick>> | null,
): string {
  const tradeSig = overview.pendingTradeAnimation
    ? `${overview.pendingTradeAnimation.teams.join('|')}:${overview.pendingTradeAnimation.assets.length}`
    : '';
  return [
    overview.id,
    overview.status,
    overview.curOverall,
    overview.onClockTeam ?? '',
    overview.deadlineTs ?? '',
    pendingPick?.id ?? '',
    tradeSig,
    overview.roundEndPause ? 1 : 0,
  ].join('|');
}

async function ensureReliabilitySchema(): Promise<void> {
  const db = getDb();
  await db.execute(sql`ALTER TABLE draft_pending_picks ADD COLUMN IF NOT EXISTS origin_pause_reason varchar(32) NULL`);
  await db.execute(sql`ALTER TABLE draft_pending_picks ADD COLUMN IF NOT EXISTS origin_remaining_secs integer NULL`);
  await db.execute(sql`ALTER TABLE draft_pending_picks ADD COLUMN IF NOT EXISTS origin_pause_finished boolean NOT NULL DEFAULT false`);

  const active = await db.execute(sql`
    SELECT COUNT(1)::int AS count
    FROM drafts
    WHERE status IN ('LIVE', 'PAUSED')
  `);
  const count = Number((active as unknown as { rows?: Array<{ count: number | string }> }).rows?.[0]?.count || 0);
  if (count > 1) throw new Error('multiple_active_drafts');

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_drafts_single_active
    ON drafts ((1))
    WHERE status IN ('LIVE', 'PAUSED')
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_draft_picks_draft_overall
    ON draft_picks(draft_id, overall)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_draft_picks_draft_player
    ON draft_picks(draft_id, player_id)
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_picks_draft_overall
    ON draft_pending_picks(draft_id, overall)
    WHERE status = 'pending'
  `);
}

async function setPendingOrigin(
  pendingId: string,
  pauseReason: PauseReason,
  remainingSecs: number | null | undefined,
): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    UPDATE draft_pending_picks
    SET origin_pause_reason = ${pauseReason},
        origin_remaining_secs = ${remainingSecs ?? null},
        origin_pause_finished = false
    WHERE id = ${pendingId}::uuid
  `);
}

async function finishAnimationPause(
  draftId: string,
  reason: 'pick_animation' | 'trade_animation',
): Promise<{ pending: boolean; resumed: boolean }> {
  const db = getDb();
  const result = await db.execute(sql`
    WITH state AS (
      SELECT d.id, d.clock_seconds, d.paused_remaining_secs,
             EXISTS (
               SELECT 1
               FROM draft_pending_picks pp
               JOIN draft_slots s
                 ON s.draft_id = d.id
                AND s.overall = d.cur_overall
                AND s.team = pp.team
               WHERE pp.draft_id = d.id
                 AND pp.overall = d.cur_overall
                 AND pp.status = 'pending'
             ) AS has_pending
      FROM drafts d
      WHERE d.id = ${draftId}::uuid
        AND d.status = 'PAUSED'
        AND d.pause_reason = ${reason}
      FOR UPDATE
    ), updated AS (
      UPDATE drafts d
      SET status = CASE WHEN state.has_pending THEN 'PAUSED' ELSE 'LIVE' END,
          pause_reason = CASE WHEN state.has_pending THEN 'pending_pick' ELSE NULL END,
          clock_started_at = CASE WHEN state.has_pending THEN NULL ELSE now() END,
          deadline_ts = CASE
            WHEN state.has_pending THEN NULL
            ELSE now() + (interval '1 second' * COALESCE(NULLIF(state.paused_remaining_secs, 0), state.clock_seconds, 60))
          END,
          paused_remaining_secs = CASE
            WHEN state.has_pending THEN COALESCE(NULLIF(state.paused_remaining_secs, 0), state.clock_seconds, 60)
            ELSE NULL
          END
      FROM state
      WHERE d.id = state.id
      RETURNING state.has_pending
    )
    SELECT has_pending FROM updated
  `);
  const row = (result as unknown as { rows?: Array<{ has_pending: boolean | string | number }> }).rows?.[0];
  if (!row) return { pending: false, resumed: false };
  const pending = row.has_pending === true || row.has_pending === 1 || row.has_pending === 't' || row.has_pending === 'true';
  if (pending) {
    await db.execute(sql`
      UPDATE draft_pending_picks
      SET origin_pause_finished = true
      WHERE draft_id = ${draftId}::uuid
        AND status = 'pending'
    `);
  }
  return { pending, resumed: !pending };
}

async function finalizeCommittedPick(params: {
  draftId: string;
  team: string;
  playerId: string;
  playerName?: string | null;
  playerPos?: string | null;
  playerNfl?: string | null;
}): Promise<void> {
  await Promise.all([
    addPlayerToRosterSnapshot(params.draftId, params.team, {
      playerId: params.playerId,
      playerName: params.playerName ?? null,
      playerPos: params.playerPos ?? null,
      playerNfl: params.playerNfl ?? null,
    }, 'drafted'),
    removePlayerFromQueue(params.draftId, params.team, params.playerId),
  ]);

  const overview = await getDraftOverview(params.draftId);
  if (!overview || overview.status === 'COMPLETED' || overview.roundEndPause || overview.pauseReason === 'round_end') return;
  await pauseDraftForAnimation(params.draftId);
}

async function rejectPendingSafely(draftId: string, pendingId: string): Promise<void> {
  const db = getDb();
  const meta = await db.execute(sql`
    SELECT origin_pause_reason, origin_remaining_secs, origin_pause_finished
    FROM draft_pending_picks
    WHERE id = ${pendingId}::uuid
    LIMIT 1
  `);
  const row = (meta as unknown as {
    rows?: Array<{
      origin_pause_reason: PauseReason;
      origin_remaining_secs: number | null;
      origin_pause_finished: boolean | string | number;
    }>;
  }).rows?.[0];
  await resolvePendingPick(pendingId, 'rejected');

  const overview = await getDraftOverview(draftId);
  if (!overview) return;
  if (overview.pauseReason === 'pick_animation' || overview.pauseReason === 'trade_animation') return;

  const origin = row?.origin_pause_reason ?? null;
  const originFinished = row?.origin_pause_finished === true || row?.origin_pause_finished === 1 || row?.origin_pause_finished === 't' || row?.origin_pause_finished === 'true';
  if (origin === 'manual' && !originFinished) {
    await db.execute(sql`
      UPDATE drafts
      SET status = 'PAUSED',
          pause_reason = 'manual',
          paused_remaining_secs = COALESCE(${row?.origin_remaining_secs ?? null}, paused_remaining_secs, clock_seconds),
          clock_started_at = NULL,
          deadline_ts = NULL
      WHERE id = ${draftId}::uuid
    `);
    return;
  }
  await resumeDraft(draftId);
}

function validateOrder(teams: string[], rounds: number, roundOrders?: Record<number, string[]>): string | null {
  if (!Array.isArray(teams) || teams.length === 0) return 'teams_required';
  const validateRound = (order: string[]) => {
    if (order.length !== teams.length) return 'invalid_round_length';
    if (new Set(order).size !== order.length) return 'duplicate_team';
    if (order.some((team) => !TEAM_NAMES.includes(team))) return 'invalid_team';
    return null;
  };
  const baseError = validateRound(teams);
  if (baseError) return baseError;
  for (let round = 1; round <= rounds; round += 1) {
    const order = roundOrders?.[round] || teams;
    const error = validateRound(order);
    if (error) return error;
  }
  return null;
}

async function safeSkipPick(
  draftId: string,
  allowManual: boolean,
): Promise<{ ok: boolean; error?: string; newOverall?: number; completed?: boolean }> {
  const db = getDb();
  const result = await db.execute(sql`
    WITH state AS (
      SELECT d.id, d.cur_overall, d.clock_seconds, d.status, d.pause_reason, s.round AS cur_round
      FROM drafts d
      JOIN draft_slots s ON s.draft_id = d.id AND s.overall = d.cur_overall
      WHERE d.id = ${draftId}::uuid
        AND (
          d.status = 'LIVE'
          OR (${allowManual}::boolean AND d.status = 'PAUSED' AND d.pause_reason = 'manual')
        )
        AND NOT EXISTS (
          SELECT 1 FROM draft_pending_picks pp
          WHERE pp.draft_id = d.id AND pp.status = 'pending'
        )
      FOR UPDATE OF d
    ), next_slot AS (
      SELECT s.overall, s.round
      FROM draft_slots s, state
      WHERE s.draft_id = state.id
        AND s.overall > state.cur_overall
        AND NOT EXISTS (
          SELECT 1 FROM draft_picks p
          WHERE p.draft_id = s.draft_id AND p.overall = s.overall
        )
      ORDER BY s.overall
      LIMIT 1
    ), updated AS (
      UPDATE drafts d
      SET cur_overall = COALESCE((SELECT overall FROM next_slot), d.cur_overall),
          status = CASE
            WHEN NOT EXISTS (SELECT 1 FROM next_slot) THEN 'COMPLETED'
            WHEN (SELECT round FROM next_slot) > (SELECT cur_round FROM state) THEN 'PAUSED'
            ELSE 'LIVE'
          END,
          pause_reason = CASE
            WHEN NOT EXISTS (SELECT 1 FROM next_slot) THEN NULL
            WHEN (SELECT round FROM next_slot) > (SELECT cur_round FROM state) THEN 'round_end'
            ELSE NULL
          END,
          round_end_pause = CASE
            WHEN EXISTS (SELECT 1 FROM next_slot)
             AND (SELECT round FROM next_slot) > (SELECT cur_round FROM state) THEN true
            ELSE false
          END,
          clock_started_at = CASE
            WHEN EXISTS (SELECT 1 FROM next_slot)
             AND (SELECT round FROM next_slot) = (SELECT cur_round FROM state) THEN now()
            ELSE NULL
          END,
          deadline_ts = CASE
            WHEN EXISTS (SELECT 1 FROM next_slot)
             AND (SELECT round FROM next_slot) = (SELECT cur_round FROM state)
              THEN now() + (interval '1 second' * (SELECT clock_seconds FROM state))
            ELSE NULL
          END,
          paused_remaining_secs = CASE
            WHEN EXISTS (SELECT 1 FROM next_slot)
             AND (SELECT round FROM next_slot) > (SELECT cur_round FROM state)
              THEN (SELECT clock_seconds FROM state)
            ELSE NULL
          END,
          completed_at = CASE WHEN NOT EXISTS (SELECT 1 FROM next_slot) THEN now() ELSE NULL END
      FROM state
      WHERE d.id = state.id
      RETURNING d.cur_overall, d.status
    )
    SELECT cur_overall, status FROM updated
  `);
  const row = (result as unknown as { rows?: Array<{ cur_overall: number | string; status: string }> }).rows?.[0];
  if (!row) {
    const overview = await getDraftOverview(draftId);
    if (!overview) return { ok: false, error: 'no_draft' };
    if (overview.pauseReason === 'pending_pick') return { ok: false, error: 'pending_pick_exists' };
    if (overview.pauseReason === 'pick_animation' || overview.pauseReason === 'trade_animation') return { ok: false, error: 'animation_in_progress' };
    if (overview.pauseReason === 'round_end') return { ok: false, error: 'round_end_pause' };
    if (overview.status === 'PAUSED' && overview.pauseReason === 'manual' && !allowManual) return { ok: false, error: 'manual_skip_confirmation_required' };
    return { ok: false, error: 'invalid_state' };
  }
  return {
    ok: true,
    newOverall: Number(row.cur_overall),
    completed: row.status === 'COMPLETED',
  };
}

async function safeUpdateSlot(draftId: string, overall: number, team: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const check = await db.execute(sql`
    SELECT s.team,
           EXISTS (SELECT 1 FROM draft_picks p WHERE p.draft_id = s.draft_id AND p.overall = s.overall) AS has_pick,
           EXISTS (
             SELECT 1 FROM drafts d
             JOIN draft_pending_picks pp ON pp.draft_id = d.id AND pp.status = 'pending'
             WHERE d.id = s.draft_id AND d.cur_overall = s.overall
           ) AS has_pending
    FROM draft_slots s
    WHERE s.draft_id = ${draftId}::uuid AND s.overall = ${overall}
    LIMIT 1
  `);
  const row = (check as unknown as { rows?: Array<{ has_pick: boolean | string | number; has_pending: boolean | string | number }> }).rows?.[0];
  if (!row) return { ok: false, error: 'invalid_slot' };
  const hasPick = row.has_pick === true || row.has_pick === 1 || row.has_pick === 't' || row.has_pick === 'true';
  const hasPending = row.has_pending === true || row.has_pending === 1 || row.has_pending === 't' || row.has_pending === 'true';
  if (hasPick) return { ok: false, error: 'slot_has_pick' };
  if (hasPending) return { ok: false, error: 'pending_pick_exists' };
  const updated = await db.execute(sql`
    UPDATE draft_slots
    SET team = ${team}
    WHERE draft_id = ${draftId}::uuid AND overall = ${overall}
    RETURNING overall
  `);
  if (!(updated as unknown as { rows?: unknown[] }).rows?.length) return { ok: false, error: 'invalid_slot' };
  return { ok: true };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (action === 'player_info') {
      const playerId = url.searchParams.get('playerId') || '';
      if (!playerId) return ok({ college: null });
      const players = await getAllPlayersCached();
      const p = players[playerId];
      if (!p) return ok({ college: null });
      return ok({ college: p.college || null, name: `${p.first_name} ${p.last_name}`.trim(), pos: p.position, nfl: p.team });
    }

    await ensureDraftTables();
    await ensureReliabilitySchema();
    const id = url.searchParams.get('id');
    const includeAvail = url.searchParams.get('include') === 'available';
    const mode = url.searchParams.get('mode');
    const draftId = id || (await getActiveOrLatestDraftId());
    if (!draftId) return ok({ draft: null });

    await checkAndAutoPick(draftId);
    await checkStaleAnimationPause(draftId).catch(() => {});
    const overview = await getDraftOverview(draftId);
    if (!overview) return ok({ draft: null });

    const now = Date.now();
    const dl = overview.deadlineTs ? Date.parse(overview.deadlineTs) : 0;
    const rawRemainingSec = overview.status === 'LIVE' && dl > now
      ? Math.max(0, Math.floor((dl - now) / 1000))
      : overview.status === 'PAUSED' && overview.pausedRemainingSecs != null
        ? overview.pausedRemainingSecs
        : null;
    const remainingSec = rawRemainingSec == null
      ? null
      : Math.min(rawRemainingSec, Math.max(1, Number(overview.clockSeconds || 1)));
    const pendingPick = await getPendingPick(draftId);
    const revision = buildDraftRevision(overview, pendingPick);

    if (mode === 'live') {
      return ok({
        live: {
          id: overview.id,
          year: overview.year,
          rounds: overview.rounds,
          clockSeconds: overview.clockSeconds,
          status: overview.status,
          curOverall: overview.curOverall,
          onClockTeam: overview.onClockTeam ?? null,
          deadlineTs: overview.deadlineTs ?? null,
          eventName: overview.eventName ?? null,
          eventLogoUrl: sanitizeLogoForResponse(overview.eventLogoUrl),
          eventColor1: overview.eventColor1 ?? null,
          eventColor2: overview.eventColor2 ?? null,
          pausedRemainingSecs: overview.pausedRemainingSecs ?? null,
          pendingTradeAnimation: overview.pendingTradeAnimation ?? null,
          roundEndPause: overview.roundEndPause ?? null,
          pauseReason: overview.pauseReason ?? null,
        },
        remainingSec,
        pendingPick: pendingPick ?? undefined,
        revision,
      });
    }

    const resp: {
      draft: DraftOverview;
      remainingSec: number | null;
      pendingPick?: typeof pendingPick;
      available?: DraftAvailPlayer[];
      usingCustom?: boolean;
      revision: string;
      activeViewers: string[];
      presenceApproximate: boolean;
      presenceLabel: string;
    } = {
      draft: { ...overview, eventLogoUrl: sanitizeLogoForResponse(overview.eventLogoUrl) },
      remainingSec,
      pendingPick: pendingPick ?? undefined,
      revision,
      activeViewers: getActiveViewers(),
      presenceApproximate: true,
      presenceLabel: 'Recently active, approximate',
    };

    if (includeAvail) {
      const taken = new Set(await getDraftPickedPlayerIds(draftId));
      if (pendingPick?.playerId) taken.add(pendingPick.playerId);
      const useCustom = (await countDraftPlayers(draftId)) > 0;
      resp.usingCustom = useCustom;
      const allowed = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FB', 'RB/FB']);
      if (useCustom) {
        const rows = await getDraftPlayers(draftId);
        const rankById = new Map(rows.map((r) => [r.player_id, r.rank]));
        const merged = await buildCustomPoolAvailable(rows, taken);
        merged.sort((a, b) => {
          const ra = rankById.get(a.id) ?? Number.POSITIVE_INFINITY;
          const rb = rankById.get(b.id) ?? Number.POSITIVE_INFINITY;
          return ra !== rb ? ra - rb : a.name.localeCompare(b.name);
        });
        resp.available = merged.slice(0, 500);
      } else {
        const players = await getAllPlayersCached();
        resp.available = Object.values(players)
          .filter((p: SleeperPlayer) => allowed.has((p.position || '').toUpperCase()) && !taken.has(p.player_id))
          .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
          .slice(0, 500)
          .map((p) => ({
            id: p.player_id,
            name: `${p.first_name} ${p.last_name}`.trim(),
            pos: p.position,
            nfl: p.team,
            college: p.college || null,
          }));
      }
    }
    return ok(resp);
  } catch (e) {
    console.error('GET /api/draft failed', e);
    return bad(String(e).includes('multiple_active_drafts') ? 'multiple_active_drafts' : 'failed', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDraftTables();
    await ensureReliabilitySchema();
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';
    const id = typeof body.id === 'string' ? body.id : '';

    const adminOnlyActions = [
      'create', 'delete', 'start', 'pause', 'resume', 'set_clock', 'reset_clock',
      'force_pick', 'undo', 'skip_pick', 'approve_pick', 'reject_pick', 'auto_pick',
      'reset', 'reset_trades', 'set_draft_order', 'set_draft_slots', 'update_slot',
      'upload_players', 'clear_players', 'update_branding', 'admin_workspace',
      'delete_player_pool', 'apply_player_pool',
    ];

    if (adminOnlyActions.includes(action)) {
      if (!isAdmin(req)) return bad('forbidden', 403);

      if (action === 'admin_workspace') {
        const [workspace, pools] = await Promise.all([getDraftWorkspace(), listPlayerPools()]);
        return ok({ workspace, pools });
      }
      if (action === 'delete_player_pool') {
        const poolId = typeof body.poolId === 'string' ? body.poolId.trim() : '';
        if (!poolId) return bad('poolId required');
        await deletePlayerPool(poolId);
        return ok({ ok: true });
      }
      if (action === 'upload_players') {
        const arr = Array.isArray(body.players)
          ? body.players as Array<{ id: string; name: string; pos: string; nfl?: string | null; rank?: number | null; meta?: unknown }>
          : [];
        if (!arr.length) return bad('players required');
        let poolId = typeof body.poolId === 'string' && body.poolId.trim() ? body.poolId.trim() : '';
        if (!poolId) poolId = await createPlayerPool(typeof body.poolLabel === 'string' && body.poolLabel.trim() ? body.poolLabel.trim() : `Pool ${new Date().toISOString().slice(0, 10)}`);
        await replacePlayerPoolRows(poolId, arr.map((p) => ({ id: p.id, name: p.name, pos: p.pos, nfl: p.nfl ?? null, rank: p.rank ?? null, meta: p.meta })));
        await setDraftWorkspaceDefaultPool(poolId);
        const draftIdForUpload = id || (await getActiveOrLatestDraftId());
        if (draftIdForUpload) await setDraftPlayers(draftIdForUpload, arr.map((p) => ({ id: p.id, name: p.name, pos: p.pos, nfl: p.nfl ?? null, rank: p.rank ?? null, meta: p.meta })));
        return ok({ ok: true, count: draftIdForUpload ? await countDraftPlayers(draftIdForUpload) : arr.length, poolId });
      }
      if (action === 'update_branding') {
        const eventName = typeof body.eventName === 'string' ? body.eventName : null;
        const eventLogoUrl = typeof body.eventLogoUrl === 'string' ? body.eventLogoUrl : null;
        const eventColor1 = typeof body.eventColor1 === 'string' ? body.eventColor1 : null;
        const eventColor2 = typeof body.eventColor2 === 'string' ? body.eventColor2 : null;
        if (isDataUrl(eventLogoUrl)) return bad('Direct logo file/base64 uploads are disabled. Use a project path or https URL.');
        if (!id) await saveDraftWorkspaceBranding({ eventName, eventLogoUrl, eventColor1, eventColor2 });
        else await updateDraftBranding(id, { eventName, eventLogoUrl, eventColor1, eventColor2 });
        return ok({ ok: true });
      }
      if (action === 'apply_player_pool') {
        const poolId = typeof body.poolId === 'string' ? body.poolId.trim() : '';
        if (!poolId) return bad('poolId required');
        const draftIdApply = id || (await getActiveOrLatestDraftId());
        if (!draftIdApply) return bad('no_draft');
        await copyPlayerPoolToDraft(poolId, draftIdApply);
        await setDraftWorkspaceDefaultPool(poolId);
        return ok({ ok: true, count: await countDraftPlayers(draftIdApply) });
      }
      if (action === 'create') {
        const year = Number(body.year || new Date().getFullYear());
        const rounds = Math.max(1, Number(body.rounds || 4));
        const teams = Array.isArray(body.teams) && body.teams.length ? body.teams as string[] : TEAM_NAMES;
        const roundOrders = body.roundOrders && typeof body.roundOrders === 'object' ? body.roundOrders as Record<number, string[]> : undefined;
        const validationError = validateOrder(teams, rounds, roundOrders);
        if (validationError) return bad(validationError, 400);
        const result = await createDraftWithOrder({ year, rounds, teams, clockSeconds: Number(body.clockSeconds || 60), roundOrders });
        await seedDraftFromWorkspace(result.id);
        return ok({ ok: true, id: result.id, draft: await getDraftOverview(result.id) });
      }

      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');

      if (action === 'reset') {
        await resetDraft(draftId);
        return ok({ ok: true });
      }
      if (action === 'reset_trades') {
        await resetDraftTrades(draftId);
        return ok({ ok: true });
      }
      if (action === 'set_draft_order') {
        const teams = body.teams as string[];
        const error = validateOrder(teams, 1);
        if (error) return bad(error, 400);
        await setDraftOrder(draftId, teams);
        return ok({ ok: true });
      }
      if (action === 'set_draft_slots') {
        const slots = body.slots as Array<{ overall: number; team: string }>;
        if (!Array.isArray(slots) || !slots.length) return bad('slots array required');
        if (slots.some((slot) => !Number.isInteger(slot.overall) || slot.overall < 1 || !TEAM_NAMES.includes(slot.team))) return bad('invalid_slot');
        await setDraftSlots(draftId, slots, Boolean(body.setAsDefault));
        return ok({ ok: true });
      }
      if (action === 'delete') {
        await deleteDraft(draftId);
        return ok({ ok: true });
      }
      if (action === 'skip_pick') {
        const result = await safeSkipPick(draftId, body.confirmManualSkip === true);
        return result.ok ? ok(result) : bad(result.error || 'failed', 409);
      }
      if (action === 'update_slot') {
        const overall = Number(body.overall || 0);
        const team = typeof body.team === 'string' ? body.team.trim() : '';
        if (!overall || !TEAM_NAMES.includes(team)) return bad(!overall ? 'invalid_slot' : 'invalid_team');
        const result = await safeUpdateSlot(draftId, overall, team);
        return result.ok ? ok({ ok: true }) : bad(result.error || 'failed', 409);
      }
      if (action === 'start') {
        try {
          const startRes = await startDraft(draftId);
          if (!startRes.ok) return bad(startRes.error || 'failed', 409);
        } catch (e) {
          if (String(e).includes('uq_drafts_single_active') || String(e).includes('23505')) return bad('another_draft_active', 409);
          throw e;
        }
        const snapResults = await Promise.allSettled([snapshotDraftRosters(draftId), snapshotDraftFuturePicks(draftId)]);
        const snapshotErrors = snapResults.filter((r): r is PromiseRejectedResult => r.status === 'rejected').map((r) => String(r.reason));
        return ok({ ok: true, snapshotErrors: snapshotErrors.length ? snapshotErrors : undefined });
      }
      if (action === 'pause') {
        const overview = await getDraftOverview(draftId);
        if (!overview || overview.status !== 'LIVE') return bad('invalid_state');
        await pauseDraftManual(draftId);
        return ok({ ok: true });
      }
      if (action === 'resume') {
        const overview = await getDraftOverview(draftId);
        if (!overview) return bad('no_draft');
        if (overview.status === 'COMPLETED') return bad('draft_completed');
        if (overview.status === 'NOT_STARTED') return bad('draft_not_started');
        if (overview.status !== 'PAUSED') return bad('invalid_state');
        if (overview.pauseReason !== 'manual' && overview.pauseReason !== 'round_end') return bad(overview.pauseReason === 'pending_pick' ? 'pending_pick_exists' : 'animation_in_progress', 409);
        if (await getPendingPick(draftId)) return bad('pending_pick_exists', 409);
        await resumeDraft(draftId);
        return ok({ ok: true });
      }
      if (action === 'set_clock') {
        await setClockSeconds(draftId, Number(body.seconds || 60));
        return ok({ ok: true });
      }
      if (action === 'reset_clock') {
        await resetPickClock(draftId);
        return ok({ ok: true });
      }
      if (action === 'force_pick') {
        const playerId = String(body.playerId || '').trim();
        if (!playerId) return bad('playerId required');
        const before = await getDraftOverview(draftId);
        const team = canonicalizeTeamName(typeof body.team === 'string' && body.team ? body.team : before?.onClockTeam || '');
        if (!team) return bad('no_team_on_clock');
        const playerName = typeof body.playerName === 'string' ? body.playerName : null;
        const playerPos = typeof body.playerPos === 'string' ? body.playerPos : null;
        const playerNfl = typeof body.playerNfl === 'string' ? body.playerNfl : null;
        const res = await forcePick({ draftId, playerId, playerName, playerPos, playerNfl, team, madeBy: 'admin', expectedOverall: before?.curOverall ?? null });
        if (!res.ok) return bad(res.error || 'failed', 409);
        await finalizeCommittedPick({ draftId, team, playerId, playerName, playerPos, playerNfl });
        return ok({ ok: true });
      }
      if (action === 'undo') {
        const result = await undoLastPick(draftId);
        return result.ok ? ok({ ok: true, overall: result.overall }) : bad(result.error || 'failed');
      }
      if (action === 'clear_players') {
        await clearDraftPlayers(draftId);
        return ok({ ok: true, count: 0 });
      }
      if (action === 'auto_pick') {
        const before = await getDraftOverview(draftId);
        const result = await checkAndAutoPick(draftId, true);
        if (!result.picked || !result.playerId) return ok({ ok: false, ...result });
        const after = await getDraftOverview(draftId);
        const pick = after?.allPicks.find((p) => p.playerId === result.playerId && p.team === before?.onClockTeam);
        await finalizeCommittedPick({
          draftId,
          team: canonicalizeTeamName(before?.onClockTeam || ''),
          playerId: result.playerId,
          playerName: result.playerName || pick?.playerName || null,
          playerPos: pick?.playerPos || null,
          playerNfl: pick?.playerNfl || null,
        });
        return ok({ ok: true, ...result });
      }
      if (action === 'approve_pick') {
        const overview = await getDraftOverview(draftId);
        if (!overview) return bad('no_draft');
        if (overview.pauseReason === 'pick_animation' || overview.pauseReason === 'trade_animation') return bad('animation_in_progress', 409);
        const pending = await getPendingPick(draftId);
        if (!pending) return bad('no_pending_pick');
        if (pending.overall !== overview.curOverall || canonicalizeTeamName(pending.team) !== canonicalizeTeamName(overview.onClockTeam || '')) return bad('stale_pending_pick', 409);
        await resumeDraft(draftId);
        const res = await commitPick({
          draftId,
          playerId: pending.playerId,
          playerName: pending.playerName,
          playerPos: pending.playerPos,
          playerNfl: pending.playerNfl,
          team: pending.team,
          madeBy: 'admin_approved',
          expectedOverall: pending.overall,
        });
        if (!res.ok) return bad(res.error || 'failed', 409);
        await resolvePendingPick(pending.id, 'approved');
        await finalizeCommittedPick({
          draftId,
          team: pending.team,
          playerId: pending.playerId,
          playerName: pending.playerName,
          playerPos: pending.playerPos,
          playerNfl: pending.playerNfl,
        });
        return ok({ ok: true });
      }
      if (action === 'reject_pick') {
        const pending = await getPendingPick(draftId);
        if (!pending) return bad('no_pending_pick');
        await rejectPendingSafely(draftId, pending.id);
        return ok({ ok: true });
      }
    }

    if (action === 'anim_clock_start') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser().catch(() => null);
      if (!ident && !adminReq) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      const result = await finishAnimationPause(draftId, 'pick_animation');
      return ok({ ok: true, pendingPickExists: result.pending, resumed: result.resumed });
    }

    if (action === 'trade_anim_complete') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser().catch(() => null);
      if (!ident && !adminReq) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      const result = await finishAnimationPause(draftId, 'trade_animation');
      return ok({ ok: true, pendingPickExists: result.pending, resumed: result.resumed });
    }

    if (action === 'pick') {
      const adminOverride = isAdmin(req);
      const ident = adminOverride ? null : await requireTeamUser();
      if (!ident && !adminOverride) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      const playerId = String(body.playerId || '').trim();
      if (!playerId) return bad('playerId required');
      const overview = await getDraftOverview(draftId);
      if (!overview || (overview.status !== 'LIVE' && overview.status !== 'PAUSED')) return bad('draft_not_live');
      if (overview.status === 'PAUSED' && (overview.pauseReason === 'round_end' || overview.pauseReason === 'pending_pick')) {
        return bad(overview.pauseReason === 'round_end' ? 'round_end_pause' : 'pick_already_pending', 409);
      }
      if (overview.status === 'PAUSED' && !['manual', 'pick_animation', 'trade_animation'].includes(String(overview.pauseReason))) return bad('invalid_state');

      const onClockCanon = canonicalizeTeamName(overview.onClockTeam || '');
      const pickingTeam = adminOverride ? onClockCanon : canonicalizeTeamName(ident!.team);
      if (!pickingTeam) return bad('no_team_on_clock');
      if (!adminOverride && pickingTeam !== onClockCanon) return bad('not_your_turn');

      const existing = await getPendingPick(draftId);
      if (existing) {
        if (existing.overall === overview.curOverall && canonicalizeTeamName(existing.team) === pickingTeam && existing.playerId === playerId) {
          return ok({ ok: true, pending: true, duplicate: true });
        }
        return bad('pick_already_pending', 409);
      }
      if ((await getDraftPickedPlayerIds(draftId)).includes(playerId)) return bad('player_already_picked');

      const pendingResult = await submitPendingPick(draftId, {
        overall: overview.curOverall,
        team: pickingTeam,
        playerId,
        playerName: typeof body.playerName === 'string' ? body.playerName : null,
        playerPos: typeof body.playerPos === 'string' ? body.playerPos : null,
        playerNfl: typeof body.playerNfl === 'string' ? body.playerNfl : null,
      });
      if (!pendingResult) return bad('pick_not_accepted');
      if (!pendingResult.created) {
        const racedPending = await getPendingPick(draftId);
        if (racedPending && racedPending.overall === overview.curOverall && canonicalizeTeamName(racedPending.team) === pickingTeam && racedPending.playerId === playerId) {
          return ok({ ok: true, pending: true, duplicate: true });
        }
        return bad('pick_already_pending', 409);
      }
      await setPendingOrigin(pendingResult.id, overview.pauseReason ?? null, overview.pausedRemainingSecs);
      if (overview.status === 'LIVE') await pauseDraft(draftId);
      return ok({ ok: true, pending: true });
    }

    if (action === 'queue_get' || action === 'queue_set') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser();
      if (!ident && !adminReq) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      const team = adminReq ? (typeof body.team === 'string' ? body.team : '') : ident!.team;
      if (!team) return bad('no_team');
      if (action === 'queue_get') return ok({ ok: true, queue: await getTeamQueue(draftId, team) });
      const players = Array.isArray(body.players)
        ? body.players as Array<{ id: string; name?: string; pos?: string; nfl?: string }>
        : Array.isArray(body.playerIds)
          ? (body.playerIds as string[]).map((playerId) => ({ id: playerId }))
          : [];
      await setTeamQueue(draftId, team, players);
      return ok({ ok: true });
    }

    if (action === 'available') {
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return ok({ available: [] });
      const taken = body.showAll ? new Set<string>() : new Set(await getDraftPickedPlayerIds(draftId));
      if (!body.showAll) {
        const pending = await getPendingPick(draftId);
        if (pending?.playerId) taken.add(pending.playerId);
      }
      const q = typeof body.q === 'string' ? body.q.trim().toLowerCase() : '';
      const pos = typeof body.pos === 'string' ? body.pos.trim().toUpperCase() : '';
      const limit = Math.max(1, Math.min(200, Number(body.limit || 50)));
      if ((await countDraftPlayers(draftId)) > 0) {
        let list = await buildCustomPoolAvailable(await getDraftPlayers(draftId), taken);
        if (pos) list = list.filter((p) => p.pos.toUpperCase() === pos);
        if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
        return ok({ available: list.slice(0, limit) });
      }
      const allowed = new Set(['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'FB', 'RB/FB']);
      let list = Object.values(await getAllPlayersCached()).filter((p: SleeperPlayer) => allowed.has((p.position || '').toUpperCase()) && !taken.has(p.player_id));
      if (pos) list = list.filter((p) => (p.position || '').toUpperCase() === pos);
      if (q) list = list.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q));
      return ok({ available: list.slice(0, limit).map((p) => ({ id: p.player_id, name: `${p.first_name} ${p.last_name}`.trim(), pos: p.position, nfl: p.team, college: p.college || null })) });
    }

    if (action === 'players_info') {
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return ok({ useCustom: false, count: 0 });
      const count = await countDraftPlayers(draftId);
      return ok({ useCustom: count > 0, count });
    }

    if (action === 'presence') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser().catch(() => null);
      const team = adminReq ? (typeof body.team === 'string' ? body.team : 'Admin') : ident?.team || null;
      if (team) recordPresence(team);
      return ok({ ok: true, activeViewers: getActiveViewers(), presenceApproximate: true, presenceLabel: 'Recently active, approximate' });
    }

    return bad('unknown_action');
  } catch (e) {
    console.error('POST /api/draft failed', e);
    const message = String(e);
    if (message.includes('multiple_active_drafts')) return bad('multiple_active_drafts', 409);
    if (message.includes('uq_drafts_single_active') || message.includes('23505')) return bad('another_draft_active', 409);
    return bad('server_error', 500);
  }
}
