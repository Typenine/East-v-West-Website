import { NextRequest, NextResponse } from 'next/server';
import {
  ensureDraftTables,
  createDraftWithOrder,
  resetDraft,
  deleteDraft,
  skipPick,
  updateDraftSlot,
  getActiveOrLatestDraftId,
  getDraftOverview,
  startDraft,
  pauseDraft,
  resumeDraft,
  setClockSeconds,
  forcePick,
  undoLastPick,
  getTeamQueue,
  setTeamQueue,
  getDraftPickedPlayerIds,
  countDraftPlayers,
  getDraftPlayers,
  setDraftPlayers,
  clearDraftPlayers,
  checkAndAutoPick,
  submitPendingPick,
  getPendingPick,
  resolvePendingPick,
} from '@/server/db/queries';
import type { DraftOverview } from '@/server/db/queries';
import { TEAM_NAMES } from '@/lib/constants/league';
import { requireTeamUser } from '@/lib/server/session';
import { getAllPlayersCached, type SleeperPlayer } from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdminSecret(): string {
  return process.env.EVW_ADMIN_SECRET || '002023';
}
function isAdmin(req: NextRequest): boolean {
  try {
    const cookie = req.cookies.get('evw_admin')?.value;
    return cookie === getAdminSecret();
  } catch {
    return false;
  }
}

function ok(data: unknown, status = 200) { return new NextResponse(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }
function bad(msg: string, status = 400) { return ok({ error: msg }, status); }

export async function GET(req: NextRequest) {
  try {
    await ensureDraftTables();
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const includeAvail = url.searchParams.get('include') === 'available';
    const draftId = id || (await getActiveOrLatestDraftId());
    if (!draftId) return ok({ draft: null });
    // Check for auto-pick on clock expiry before returning overview
    await checkAndAutoPick(draftId);
    const overview = await getDraftOverview(draftId);
    if (!overview) return ok({ draft: null });
    // Compute clock remaining
    const now = Date.now();
    const dl = overview.deadlineTs ? Date.parse(overview.deadlineTs) : 0;
    const remainingSec = overview.status === 'LIVE' && dl > now
      ? Math.max(0, Math.floor((dl - now) / 1000))
      : overview.status === 'PAUSED' && overview.pausedRemainingSecs != null
      ? overview.pausedRemainingSecs
      : null;
    const pendingPick = await getPendingPick(draftId);
    const resp: { draft: DraftOverview; remainingSec: number | null; pendingPick?: typeof pendingPick; available?: Array<{ id: string; name: string; pos: string; nfl: string }>; usingCustom?: boolean } = { draft: overview, remainingSec, pendingPick: pendingPick ?? undefined };
    if (includeAvail) {
      const taken = new Set(await getDraftPickedPlayerIds(draftId));
      const useCustom = (await countDraftPlayers(draftId)) > 0;
      resp.usingCustom = useCustom;
      const allowed = new Set(['QB','RB','WR','TE','K']);
      if (useCustom) {
        const rows = await getDraftPlayers(draftId);
        const avail = rows
          .filter((r) => allowed.has((r.pos || '').toUpperCase()) && !taken.has(r.player_id))
          .sort((a, b) => {
            const ra = a.rank == null ? Number.POSITIVE_INFINITY : a.rank;
            const rb = b.rank == null ? Number.POSITIVE_INFINITY : b.rank;
            if (ra !== rb) return ra - rb;
            return a.name.localeCompare(b.name);
          });
        resp.available = avail.slice(0, 500).map((r) => ({ id: r.player_id, name: r.name, pos: r.pos, nfl: r.nfl || '' }));
      } else {
        const players = await getAllPlayersCached();
        const avail = Object.values(players).filter((p: SleeperPlayer) => {
          const pos = (p.position || '').toUpperCase();
          return allowed.has(pos) && !taken.has(p.player_id);
        })
        .sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`))
        .slice(0, 500);
        resp.available = avail.map((p) => ({ id: p.player_id, name: `${p.first_name} ${p.last_name}`.trim(), pos: p.position, nfl: p.team }));
      }
    }
    return ok(resp);
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
    if (['create','reset','delete','skip_pick','update_slot','start','pause','resume','set_clock','force_pick','undo','upload_players','clear_players','auto_pick','approve_pick','reject_pick'].includes(action)) {
      if (!isAdmin(req)) return bad('forbidden', 403);
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
        const draft = await getDraftOverview(result.id);
        return ok({ ok: true, id: result.id, draft });
      }
      if (action === 'reset') {
        const draftId = id || (await getActiveOrLatestDraftId());
        if (!draftId) return bad('no_draft');
        await resetDraft(draftId);
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
        return ok(result);
      }
      if (action === 'update_slot') {
        const overall = Number(body.overall || 0);
        const team = typeof body.team === 'string' ? body.team : '';
        if (!overall || !team) return bad('overall and team required');
        const result = await updateDraftSlot(draftId, overall, team);
        if (!result.ok) return bad(result.error || 'failed', 400);
        return ok({ ok: true });
      }
      if (action === 'start') { await startDraft(draftId); return ok({ ok: true }); }
      if (action === 'pause') { await pauseDraft(draftId); return ok({ ok: true }); }
      if (action === 'resume') { await resumeDraft(draftId); return ok({ ok: true }); }
      if (action === 'set_clock') {
        const seconds = Number(body.seconds || 60);
        await setClockSeconds(draftId, seconds);
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
        if (!r.ok) return bad(r.error || 'failed');
        return ok({ ok: true });
      }
      if (action === 'upload_players') {
        const arr = Array.isArray(body.players) ? (body.players as Array<{ id: string; name: string; pos: string; nfl?: string | null }>) : [];
        if (arr.length === 0) return bad('players required');
        await setDraftPlayers(draftId, arr);
        const count = await countDraftPlayers(draftId);
        return ok({ ok: true, count });
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
        // Resume first so makePick sees LIVE status, then forcePick sets fresh clock for next pick
        await resumeDraft(draftId);
        const res = await forcePick({ draftId, playerId: pending.playerId, playerName: pending.playerName, playerPos: pending.playerPos, playerNfl: pending.playerNfl, team: pending.team, madeBy: 'admin_approved' });
        if (!res.ok) return bad(res.error || 'failed', 400);
        await resolvePendingPick(pending.id, 'approved');
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
      if (overview.status !== 'LIVE') return bad('draft_not_live');
      // Admin picks on behalf of whoever is on the clock
      const pickingTeam = adminOverride ? (overview.onClockTeam || '') : ident!.team;
      if (!adminOverride && overview.onClockTeam !== pickingTeam) return bad('not_your_turn');
      if (!pickingTeam) return bad('no_team_on_clock');
      // Check player not already taken
      const takenIds = await getDraftPickedPlayerIds(draftId);
      if (takenIds.includes(playerId)) return bad('player_already_picked');
      // Submit as pending (awaiting admin approval) and pause the clock
      await submitPendingPick(draftId, {
        overall: overview.curOverall,
        team: pickingTeam,
        playerId,
        playerName,
        playerPos,
        playerNfl,
      });
      await pauseDraft(draftId);
      return ok({ ok: true, pending: true });
    }

    if (action === 'queue_get') {
      const ident = await requireTeamUser();
      if (!ident) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      const team = ident.team;
      const list = await getTeamQueue(draftId, team);
      return ok({ ok: true, queue: list });
    }

    if (action === 'queue_set') {
      const ident = await requireTeamUser();
      if (!ident) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      // Accept either array of player objects or array of IDs (for backwards compatibility)
      let players: Array<{ id: string; name?: string; pos?: string; nfl?: string }> = [];
      if (Array.isArray(body.players)) {
        players = body.players as Array<{ id: string; name?: string; pos?: string; nfl?: string }>;
      } else if (Array.isArray(body.playerIds)) {
        // Legacy format: convert IDs to objects
        players = (body.playerIds as string[]).map(id => ({ id }));
      }
      await setTeamQueue(draftId, ident.team, players);
      return ok({ ok: true });
    }

    if (action === 'available') {
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return ok({ available: [] });
      const taken = new Set(await getDraftPickedPlayerIds(draftId));
      const useCustom = (await countDraftPlayers(draftId)) > 0;
      const q = typeof body.q === 'string' ? body.q.trim().toLowerCase() : '';
      const pos = typeof body.pos === 'string' ? body.pos.trim().toUpperCase() : '';
      const allowed = new Set(['QB','RB','WR','TE','K']);
      if (useCustom) {
        let list = (await getDraftPlayers(draftId)).filter((r) => allowed.has((r.pos || '').toUpperCase()) && !taken.has(r.player_id));
        if (pos) list = list.filter((r) => (r.pos || '').toUpperCase() === pos);
        if (q) list = list.filter((r) => r.name.toLowerCase().includes(q));
        list.sort((a, b) => {
          const ra = a.rank == null ? Number.POSITIVE_INFINITY : a.rank;
          const rb = b.rank == null ? Number.POSITIVE_INFINITY : b.rank;
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        });
        const limit = Math.max(1, Math.min(200, Number(body.limit || 50)));
        return ok({ available: list.slice(0, limit).map((r) => ({ id: r.player_id, name: r.name, pos: r.pos, nfl: r.nfl || '' })) });
      } else {
        const players = await getAllPlayersCached();
        let list = Object.values(players).filter((p: SleeperPlayer) => allowed.has((p.position || '').toUpperCase()) && !taken.has(p.player_id));
        if (pos) list = list.filter((p) => (p.position || '').toUpperCase() === pos);
        if (q) list = list.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q));
        list.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
        const limit = Math.max(1, Math.min(200, Number(body.limit || 50)));
        return ok({ available: list.slice(0, limit).map((p) => ({ id: p.player_id, name: `${p.first_name} ${p.last_name}`.trim(), pos: p.position, nfl: p.team })) });
      }
    }

    if (action === 'players_info') {
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return ok({ useCustom: false, count: 0 });
      const count = await countDraftPlayers(draftId);
      return ok({ useCustom: count > 0, count });
    }

    return bad('unknown_action');
  } catch (e) {
    console.error('POST /api/draft failed', e);
    return bad('failed');
  }
}
