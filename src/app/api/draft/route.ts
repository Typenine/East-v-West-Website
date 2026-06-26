import { NextRequest, NextResponse } from 'next/server';
import { snapshotDraftRosters, snapshotDraftFuturePicks } from '@/server/draft-snapshot';
import {
  ensureDraftTables,
  createDraftWithOrder,
  resetDraft,
  resetDraftTrades,
  setDraftOrder,
  setDraftSlots,
  deleteDraft,
  skipPick,
  updateDraftSlot,
  getActiveOrLatestDraftId,
  getDraftOverview,
  startDraft,
  pauseDraft,
  resumeDraft,
  pauseDraftForAnimation,
  pauseDraftManual,
  resumeAfterAnimation,
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

// In-memory presence tracking: team -> last heartbeat timestamp.
//
// IMPORTANT: This map lives in a single Next.js/Node.js process. On Vercel,
// serverless functions are not shared across instances, so a team on a different
// cold instance will NOT appear here. This list is APPROXIMATE and should be
// displayed with a disclaimer in the UI — do not use it for access control or
// draft-state decisions.
const draftPresence = new Map<string, number>();
const PRESENCE_TIMEOUT_MS = 20000; // 20 s — wider window reduces false-offline flips

function getActiveViewers(): string[] {
  const now = Date.now();
  const active: string[] = [];
  for (const [team, lastSeen] of draftPresence.entries()) {
    if (now - lastSeen < PRESENCE_TIMEOUT_MS) {
      active.push(team);
    } else {
      draftPresence.delete(team); // Clean up stale entries
    }
  }
  return active;
}

function recordPresence(team: string): void {
  if (team) draftPresence.set(team, Date.now());
}

function isAdmin(req: NextRequest): boolean {
  try {
    const cookie = req.cookies.get('evw_admin')?.value;
    return isAdminCookieValue(cookie);
  } catch {
    return false;
  }
}

function ok(data: unknown, status = 200, metricLabel?: string) {
  const payload = JSON.stringify(data);
  if (metricLabel && (process.env.DRAFT_METRICS === '1' || process.env.NODE_ENV !== 'production')) {
    const bytes = Buffer.byteLength(payload, 'utf8');
    // Local transfer measurement helper; safe in production (logs only when enabled).
    console.info(`[draft-metrics] ${metricLabel} bytes=${bytes}`);
  }
  return new NextResponse(payload, { status, headers: { 'content-type': 'application/json' } });
}
function bad(msg: string, status = 400) { return ok({ error: msg }, status); }

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

/** NFL team defenses always come from Sleeper — custom prospect pools typically omit DEF. */
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
  const fromPool = rows
    .filter((r) => !taken.has(r.player_id))
    .map(draftRowToAvail);
  const sleeperDefs = (await getSleeperDefensesAvailable(taken)).filter((d) => !customIds.has(d.id));
  return [...fromPool, ...sleeperDefs];
}

function buildDraftRevision(
  overview: DraftOverview,
  pendingPick: Awaited<ReturnType<typeof getPendingPick>> | null
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    // player_info — returns college + details for a Sleeper player (no DB access needed)
    const action = url.searchParams.get('action');
    if (action === 'player_info') {
      const playerId = url.searchParams.get('playerId') || '';
      if (!playerId) return ok({ college: null });
      const players = await getAllPlayersCached();
      const p = players[playerId];
      if (!p) return ok({ college: null });
      return ok({ college: p.college || null, name: `${p.first_name} ${p.last_name}`.trim(), pos: p.position, nfl: p.team }, 200, 'GET action=player_info');
    }

    await ensureDraftTables();
    const id = url.searchParams.get('id');
    const includeAvail = url.searchParams.get('include') === 'available';
    const mode = url.searchParams.get('mode');
    const draftId = id || (await getActiveOrLatestDraftId());
    if (!draftId) return ok({ draft: null });
    // Check for auto-pick on clock expiry before returning overview
    await checkAndAutoPick(draftId);
    // Server-side fallback: if a pick-animation pause has been held too long
    // (overlay tab closed, network glitch), auto-resume the clock.
    await checkStaleAnimationPause(draftId).catch(() => {});
    const overview = await getDraftOverview(draftId);
    if (!overview) return ok({ draft: null });
    // Compute clock remaining
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
      return ok(
        {
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
          },
          remainingSec,
          pendingPick: pendingPick ?? undefined,
          revision,
        },
        200,
        'GET mode=live'
      );
    }

    const sanitizedOverview = {
      ...overview,
      eventLogoUrl: sanitizeLogoForResponse(overview.eventLogoUrl),
    };
    const resp: { draft: DraftOverview; remainingSec: number | null; pendingPick?: typeof pendingPick; available?: Array<{ id: string; name: string; pos: string; nfl: string; college?: string | null }>; usingCustom?: boolean; revision: string; activeViewers: string[]; presenceApproximate: boolean } = { draft: sanitizedOverview, remainingSec, pendingPick: pendingPick ?? undefined, revision, activeViewers: getActiveViewers(), presenceApproximate: true };
    if (includeAvail) {
      const taken = new Set(await getDraftPickedPlayerIds(draftId));
      if (pendingPick?.playerId) taken.add(pendingPick.playerId);
      const useCustom = (await countDraftPlayers(draftId)) > 0;
      resp.usingCustom = useCustom;
      const allowed = new Set(['QB','RB','WR','TE','K','DEF','FB','RB/FB']);
      if (useCustom) {
        const rows = await getDraftPlayers(draftId);
        const rankById = new Map(rows.map((r) => [r.player_id, r.rank]));
        const merged = await buildCustomPoolAvailable(rows, taken);
        merged.sort((a, b) => {
          const ra = rankById.get(a.id);
          const rb = rankById.get(b.id);
          const rankA = ra == null ? Number.POSITIVE_INFINITY : ra;
          const rankB = rb == null ? Number.POSITIVE_INFINITY : rb;
          if (rankA !== rankB) return rankA - rankB;
          return a.name.localeCompare(b.name);
        });
        resp.available = merged.slice(0, 500);
      } else {
        const players = await getAllPlayersCached();
        const avail = Object.values(players).filter((p: SleeperPlayer) => {
          const pos = (p.position || '').toUpperCase();
          return allowed.has(pos) && !taken.has(p.player_id);
        })
        .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
        .slice(0, 500);
        resp.available = avail.map((p) => ({
          id: p.player_id,
          name: `${p.first_name} ${p.last_name}`.trim(),
          pos: p.position,
          nfl: p.team,
          college: p.college || null,
        }));
      }
    }
    return ok(resp, 200, `GET includeAvail=${includeAvail ? 1 : 0}`);
  } catch (e) {
    console.error('GET /api/draft failed', e);
    return bad('failed');
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDraftTables();
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';
    const id = typeof body.id === 'string' ? body.id : '';

    // Admin-only actions
    const adminOnlyActions = ['create', 'delete', 'start', 'pause', 'resume', 'set_clock', 'reset_clock', 'force_pick', 'undo', 'skip_pick', 'approve_pick', 'reject_pick', 'auto_pick', 'reset', 'reset_trades', 'set_draft_order', 'set_draft_slots', 'update_slot', 'upload_players', 'clear_players', 'update_branding', 'admin_workspace', 'delete_player_pool', 'apply_player_pool'];
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
          ? (body.players as Array<{ id: string; name: string; pos: string; nfl?: string | null; rank?: number | null; meta?: unknown }>)
          : [];
        if (arr.length === 0) return bad('players required');
        let poolId = typeof body.poolId === 'string' && body.poolId.trim() ? body.poolId.trim() : '';
        const poolLabel = typeof body.poolLabel === 'string' ? body.poolLabel.trim() : '';
        if (!poolId) {
          poolId = await createPlayerPool(poolLabel || `Pool ${new Date().toISOString().slice(0, 10)}`);
        }
        await replacePlayerPoolRows(poolId, arr.map((p) => ({
          id: p.id,
          name: p.name,
          pos: p.pos,
          nfl: p.nfl ?? null,
          rank: p.rank ?? null,
          meta: p.meta,
        })));
        await setDraftWorkspaceDefaultPool(poolId);
        const draftIdForUpload = (typeof body.id === 'string' && body.id) ? body.id : (await getActiveOrLatestDraftId());
        if (draftIdForUpload) {
          await setDraftPlayers(draftIdForUpload, arr.map((p) => ({
            id: p.id,
            name: p.name,
            pos: p.pos,
            nfl: p.nfl ?? null,
            rank: p.rank ?? null,
            meta: p.meta,
          })));
        }
        const count = draftIdForUpload ? await countDraftPlayers(draftIdForUpload) : arr.length;
        return ok({ ok: true, count, poolId });
      }
      if (action === 'update_branding') {
        const eventName = typeof body.eventName === 'string' ? body.eventName : null;
        const eventLogoUrl = typeof body.eventLogoUrl === 'string' ? body.eventLogoUrl : null;
        const eventColor1 = typeof body.eventColor1 === 'string' ? body.eventColor1 : null;
        const eventColor2 = typeof body.eventColor2 === 'string' ? body.eventColor2 : null;
        if (isDataUrl(eventLogoUrl)) {
          return bad('Direct logo file/base64 uploads are disabled. Use a project path like /draft-logos/2026-draft-logo.png or an https URL.', 400);
        }
        const draftIdBr = typeof body.id === 'string' && body.id ? body.id : '';
        if (!draftIdBr) {
          await saveDraftWorkspaceBranding({ eventName, eventLogoUrl, eventColor1, eventColor2 });
          return ok({ ok: true });
        }
        await updateDraftBranding(draftIdBr, { eventName, eventLogoUrl, eventColor1, eventColor2 });
        return ok({ ok: true });
      }
      if (action === 'apply_player_pool') {
        const poolId = typeof body.poolId === 'string' ? body.poolId.trim() : '';
        if (!poolId) return bad('poolId required');
        const draftIdApply = (typeof body.id === 'string' && body.id) ? body.id : (await getActiveOrLatestDraftId());
        if (!draftIdApply) return bad('no_draft');
        await copyPlayerPoolToDraft(poolId, draftIdApply);
        await setDraftWorkspaceDefaultPool(poolId);
        const count = await countDraftPlayers(draftIdApply);
        return ok({ ok: true, count });
      }
      if (action === 'create') {
        const year = Number(body.year || new Date().getFullYear());
        const rounds = Number(body.rounds || 4);
        const teams = Array.isArray(body.teams) && body.teams.length > 0 ? (body.teams as string[]) : TEAM_NAMES;
        const clockSeconds = Number(body.clockSeconds || 60);
        // Accept per-round orders for dynasty drafts with trades
        const roundOrders = (body.roundOrders && typeof body.roundOrders === 'object') 
          ? body.roundOrders as Record<number, string[]> 
          : undefined;
        const result = await createDraftWithOrder({ year, rounds, teams, clockSeconds, roundOrders });
        await seedDraftFromWorkspace(result.id);
        const draft = await getDraftOverview(result.id);
        return ok({ ok: true, id: result.id, draft });
      }
      if (action === 'reset') {
        const draftId = id || (await getActiveOrLatestDraftId());
        if (!draftId) return bad('no_draft');
        await resetDraft(draftId);
        return ok({ ok: true });
      }
      if (action === 'reset_trades') {
        const draftId = id || (await getActiveOrLatestDraftId());
        if (!draftId) return bad('no_draft');
        await resetDraftTrades(draftId);
        return ok({ ok: true });
      }
      if (action === 'set_draft_order') {
        const draftId = id || (await getActiveOrLatestDraftId());
        if (!draftId) return bad('no_draft');
        const teams = body.teams as string[];
        if (!Array.isArray(teams) || teams.length === 0) return bad('teams array required');
        await setDraftOrder(draftId, teams);
        return ok({ ok: true });
      }
      if (action === 'set_draft_slots') {
        const draftId = id || (await getActiveOrLatestDraftId());
        if (!draftId) return bad('no_draft');
        const slots = body.slots as Array<{ overall: number; team: string }>;
        if (!Array.isArray(slots) || slots.length === 0) return bad('slots array required');
        const setAsDefault = Boolean(body.setAsDefault);
        await setDraftSlots(draftId, slots, setAsDefault);
        return ok({ ok: true });
      }
      if (action === 'delete') {
        const draftId = id || (await getActiveOrLatestDraftId());
        if (!draftId) return bad('no_draft');
        await deleteDraft(draftId);
        return ok({ ok: true });
      }
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      if (action === 'skip_pick') {
        const result = await skipPick(draftId);
        if (!result.ok) return bad(result.error || 'failed', 400);
        return ok(result);
      }
      if (action === 'update_slot') {
        const overall = Number(body.overall || 0);
        const team = typeof body.team === 'string' ? body.team.trim() : '';
        if (!overall || !team) return bad('overall and team required');
        // Validate team is a canonical league team name.
        if (!TEAM_NAMES.includes(team)) return bad('invalid_team', 400);
        const result = await updateDraftSlot(draftId, overall, team);
        if (!result.ok) return bad(result.error || 'failed', 400);
        return ok({ ok: true });
      }
      if (action === 'start') {
        const startRes = await startDraft(draftId);
        if (!startRes.ok) return bad(startRes.error || 'failed', 400);
        // Await snapshots so trade operations have fresh data. Log but do not block
        // the start response on snapshot failure — the commissioner can see the error
        // and retry via the trade panel if needed.
        const snapResults = await Promise.allSettled([
          snapshotDraftRosters(draftId),
          snapshotDraftFuturePicks(draftId),
        ]);
        const snapErrors = snapResults
          .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
          .map((r) => String(r.reason));
        if (snapErrors.length) console.error('[draft/start] snapshot failures:', snapErrors);
        return ok({ ok: true, snapshotErrors: snapErrors.length ? snapErrors : undefined });
      }
      if (action === 'pause') {
        const overview = await getDraftOverview(draftId);
        if (!overview) return bad('no_draft');
        if (overview.status !== 'LIVE') return bad('invalid_state', 400);
        await pauseDraftManual(draftId);
        return ok({ ok: true });
      }
      if (action === 'resume') {
        const overview = await getDraftOverview(draftId);
        if (!overview) return bad('no_draft');
        if (overview.status === 'COMPLETED') return bad('draft_completed', 400);
        if (overview.status === 'NOT_STARTED') return bad('draft_not_started', 400);
        if (overview.status !== 'PAUSED') return bad('invalid_state', 400);
        // Block manual resume while a pending pick awaits approval.
        const pendingCheck = await getPendingPick(draftId);
        if (pendingCheck) return bad('pending_pick_exists', 400);
        await resumeDraft(draftId);
        return ok({ ok: true });
      }
      if (action === 'set_clock') {
        const seconds = Number(body.seconds || 60);
        await setClockSeconds(draftId, seconds);
        return ok({ ok: true });
      }
      if (action === 'reset_clock') {
        await resetPickClock(draftId);
        return ok({ ok: true });
      }
      if (action === 'force_pick') {
        const playerId = String(body.playerId || '').trim();
        const playerName = typeof body.playerName === 'string' ? body.playerName : null;
        const playerPos = typeof body.playerPos === 'string' ? body.playerPos : null;
        const playerNfl = typeof body.playerNfl === 'string' ? body.playerNfl : null;
        const team = typeof body.team === 'string' ? body.team : null;
        if (!playerId) return bad('playerId required');
        const res = await forcePick({ draftId, playerId, playerName, playerPos, playerNfl, team, madeBy: 'admin' });
        if (!res.ok) return bad(res.error || 'failed', 400);
        return ok({ ok: true });
      }
      if (action === 'undo') {
        const r = await undoLastPick(draftId);
        if (!r.ok) return bad(r.error || 'failed', 400);
        return ok({ ok: true, overall: r.overall });
      }
      if (action === 'clear_players') {
        await clearDraftPlayers(draftId);
        return ok({ ok: true, count: 0 });
      }
      if (action === 'auto_pick') {
        // Force auto-pick immediately (bypass clock check)
        const result = await checkAndAutoPick(draftId, true);
        return ok({ ok: result.picked, ...result });
      }
      if (action === 'approve_pick') {
        const pending = await getPendingPick(draftId);
        if (!pending) return bad('no_pending_pick');
        // Resume first so commitPick sees LIVE status.
        await resumeDraft(draftId);
        // Use commitPick with expectedOverall so the commit is rejected if the
        // cursor has moved since the pending pick was created (e.g., admin
        // approved a different pick first, or a concurrent request advanced it).
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
        if (!res.ok) return bad(res.error || 'failed', 400);
        await resolvePendingPick(pending.id, 'approved');
        // Add drafted player to roster snapshot so they can be traded.
        addPlayerToRosterSnapshot(draftId, pending.team, {
          playerId: pending.playerId,
          playerName: pending.playerName,
          playerPos: pending.playerPos,
          playerNfl: null,
        }, 'drafted').catch(() => {});
        // Clean the approved player from the team's queue (handles offline team clients).
        await removePlayerFromQueue(draftId, pending.team, pending.playerId);
        // Freeze clock at full configured time so it only starts once the pick +
        // "Now on the Clock" animations finish (clients call anim_clock_start).
        await pauseDraftForAnimation(draftId);
        return ok({ ok: true });
      }
      if (action === 'reject_pick') {
        const pending = await getPendingPick(draftId);
        if (!pending) return bad('no_pending_pick');
        await resolvePendingPick(pending.id, 'rejected');
        // Restore the paused clock so picking team still has their remaining time
        await resumeDraft(draftId);
        return ok({ ok: true });
      }
    }

    // anim_clock_start — non-admin, idempotent: starts the clock only if the draft is
    // paused for a pick animation (not a round-end pause). Called by clients when their
    // pick + "Now on the Clock" animations have finished playing.
    if (action === 'anim_clock_start') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser().catch(() => null);
      if (!ident && !adminReq) return bad('auth_required', 401);
      const animDraftId = id || (await getActiveOrLatestDraftId());
      if (!animDraftId) return bad('no_draft');
      await resumeAfterAnimation(animDraftId);
      return ok({ ok: true });
    }

    // Team actions
    if (action === 'pick') {
      const adminOverride = isAdmin(req);
      const ident = adminOverride ? null : await requireTeamUser();
      if (!ident && !adminOverride) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      const playerId = String(body.playerId || '').trim();
      const playerName = typeof body.playerName === 'string' ? body.playerName : null;
      const playerPos = typeof body.playerPos === 'string' ? body.playerPos : null;
      const playerNfl = typeof body.playerNfl === 'string' ? body.playerNfl : null;
      if (!playerId) return bad('playerId required');
      // Validate it's actually this team's turn
      const overview = await getDraftOverview(draftId);
      if (!overview) return bad('no_draft');
      if (overview.status !== 'LIVE' && overview.status !== 'PAUSED') return bad('draft_not_live');
      if (overview.status === 'PAUSED') {
        // Don't allow a new pick if one is already waiting for admin approval
        const alreadyPending = await getPendingPick(draftId);
        if (alreadyPending) return bad('pick_already_pending');
        // Also block during round-end pause — admin must start the next round first
        if (overview.roundEndPause) return bad('round_end_pause');
      }
      // Admin picks on behalf of whoever is on the clock (canonical names so session matches DB team labels)
      const onClockCanon = canonicalizeTeamName(overview.onClockTeam || '');
      const pickingTeam = adminOverride
        ? canonicalizeTeamName(overview.onClockTeam || '')
        : canonicalizeTeamName(ident!.team);
      if (!adminOverride && onClockCanon !== pickingTeam) return bad('not_your_turn');
      if (!pickingTeam) return bad('no_team_on_clock');
      // Check player not already taken
      const takenIds = await getDraftPickedPlayerIds(draftId);
      if (takenIds.includes(playerId)) return bad('player_already_picked');
      // Submit as pending (awaiting admin approval).
      // submitPendingPick is idempotent: returns { created: false } if a pending
      // pick already exists for this slot (e.g., a duplicate tab submission).
      // It returns null if the draft state changed between the checks above and
      // the insert (stale request).
      const pendingResult = await submitPendingPick(draftId, {
        overall: overview.curOverall,
        team: pickingTeam,
        playerId,
        playerName,
        playerPos,
        playerNfl,
      });
      if (!pendingResult) return bad('pick_not_accepted');
      // Only pause the clock when this request actually created the pending pick.
      // If a duplicate submission returned the existing pending, the draft is
      // already paused — calling pauseDraft again would corrupt paused_remaining_secs.
      if (pendingResult.created) await pauseDraft(draftId);
      return ok({ ok: true, pending: true });
    }

    if (action === 'queue_get') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser();
      if (!ident && !adminReq) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      // Admin can pass explicit team; regular user always uses their own team
      const team = adminReq ? (typeof body.team === 'string' ? body.team : '') : ident!.team;
      if (!team) return bad('no_team');
      const list = await getTeamQueue(draftId, team);
      return ok({ ok: true, queue: list });
    }

    if (action === 'queue_set') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser();
      if (!ident && !adminReq) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      // Admin can pass explicit team; regular user always uses their own team
      const team = adminReq ? (typeof body.team === 'string' ? body.team : '') : ident!.team;
      if (!team) return bad('no_team');
      // Accept either array of player objects or array of IDs (for backwards compatibility)
      let players: Array<{ id: string; name?: string; pos?: string; nfl?: string }> = [];
      if (Array.isArray(body.players)) {
        players = body.players as Array<{ id: string; name?: string; pos?: string; nfl?: string }>;
      } else if (Array.isArray(body.playerIds)) {
        players = (body.playerIds as string[]).map(pid => ({ id: pid }));
      }
      await setTeamQueue(draftId, team, players);
      return ok({ ok: true });
    }

    if (action === 'available') {
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return ok({ available: [] });
      const showAll = Boolean(body.showAll);
      const taken = showAll ? new Set<string>() : new Set(await getDraftPickedPlayerIds(draftId));
      if (!showAll) {
        const pending = await getPendingPick(draftId);
        if (pending?.playerId) taken.add(pending.playerId);
      }
      const useCustom = (await countDraftPlayers(draftId)) > 0;
      const q = typeof body.q === 'string' ? body.q.trim().toLowerCase() : '';
      const pos = typeof body.pos === 'string' ? body.pos.trim().toUpperCase() : '';
      const allowed = new Set(['QB','RB','WR','TE','K','DEF','FB','RB/FB']);
      if (useCustom) {
        const rows = await getDraftPlayers(draftId);
        const rankById = new Map(rows.map((r) => [r.player_id, r.rank]));
        let list = await buildCustomPoolAvailable(rows, taken);
        if (pos) list = list.filter((p) => (p.pos || '').toUpperCase() === pos);
        if (q) list = list.filter((p) => p.name.toLowerCase().includes(q));
        list.sort((a, b) => {
          const ra = rankById.get(a.id);
          const rb = rankById.get(b.id);
          const rankA = ra == null ? Number.POSITIVE_INFINITY : ra;
          const rankB = rb == null ? Number.POSITIVE_INFINITY : rb;
          if (rankA !== rankB) return rankA - rankB;
          return a.name.localeCompare(b.name);
        });
        const limit = Math.max(1, Math.min(200, Number(body.limit || 50)));
        return ok({ available: list.slice(0, limit) });
      } else {
        const players = await getAllPlayersCached();
        let list = Object.values(players).filter((p: SleeperPlayer) => allowed.has((p.position || '').toUpperCase()) && !taken.has(p.player_id));
        if (pos) list = list.filter((p) => (p.position || '').toUpperCase() === pos);
        if (q) list = list.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q));
        list.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
        const limit = Math.max(1, Math.min(200, Number(body.limit || 50)));
        return ok({
          available: list.slice(0, limit).map((p) => ({
            id: p.player_id,
            name: `${p.first_name} ${p.last_name}`.trim(),
            pos: p.position,
            nfl: p.team,
            college: p.college || null,
          })),
        });
      }
    }

    if (action === 'players_info') {
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return ok({ useCustom: false, count: 0 });
      const count = await countDraftPlayers(draftId);
      return ok({ useCustom: count > 0, count });
    }

    // Presence heartbeat — teams call this to indicate they're viewing the draft room
    if (action === 'presence') {
      const adminReq = isAdmin(req);
      const ident = adminReq ? null : await requireTeamUser().catch(() => null);
      const team = adminReq
        ? (typeof body.team === 'string' ? body.team : 'Admin')
        : ident?.team || null;
      if (team) recordPresence(team);
      // presenceApproximate: true signals to clients that this list is best-effort
      // (single-instance in-memory) and must not be shown as authoritative.
      return ok({ ok: true, activeViewers: getActiveViewers(), presenceApproximate: true });
    }

    return bad('unknown_action');
  } catch (e) {
    console.error('POST /api/draft failed', e);
    // Return the action name in the error so client can show a contextual message.
    const action = (() => { try { return new URL((e as { url?: string })?.url || '').searchParams.get('action'); } catch { return null; } })();
    return bad(action ? `${action}_failed` : 'server_error', 500);
  }
}
