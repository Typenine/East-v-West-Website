import { NextRequest, NextResponse } from 'next/server';
import {
  ensureDraftTables,
  createDraftWithOrder,
  getActiveOrLatestDraftId,
  getDraftOverview,
  startDraft,
  pauseDraft,
  resumeDraft,
  setClockSeconds,
  makePick,
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
    const remainingSec = overview.status === 'LIVE' && dl > now ? Math.max(0, Math.floor((dl - now) / 1000)) : null;
    const resp: { draft: DraftOverview; remainingSec: number | null; available?: Array<{ id: string; name: string; pos: string; nfl: string }>; usingCustom?: boolean } = { draft: overview, remainingSec };
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
        }).slice(0, 500);
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
    if (['create','start','pause','resume','set_clock','force_pick','undo','upload_players','clear_players','auto_pick'].includes(action)) {
      if (!isAdmin(req)) return bad('forbidden', 403);
      if (action === 'create') {
        const year = Number(body.year || new Date().getFullYear());
        const rounds = Number(body.rounds || 4);
        const teams = Array.isArray(body.teams) && body.teams.length > 0 ? (body.teams as string[]) : TEAM_NAMES;
        const clockSeconds = Number(body.clockSeconds || 60);
        const snake = body.snake !== false;
        const result = await createDraftWithOrder({ year, rounds, teams, clockSeconds, snake });
        const draft = await getDraftOverview(result.id);
        return ok({ ok: true, id: result.id, draft });
      }
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
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
        const team = typeof body.team === 'string' ? body.team : null;
        if (!playerId) return bad('playerId required');
        const res = await forcePick({ draftId, playerId, playerName, team, madeBy: 'admin' });
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
        const result = await checkAndAutoPick(draftId);
        return ok({ ok: result.picked, ...result });
      }
    }

    // Team actions
    if (action === 'pick') {
      const ident = await requireTeamUser();
      if (!ident) return bad('auth_required', 401);
      const draftId = id || (await getActiveOrLatestDraftId());
      if (!draftId) return bad('no_draft');
      const playerId = String(body.playerId || '').trim();
      const playerName = typeof body.playerName === 'string' ? body.playerName : null;
      if (!playerId) return bad('playerId required');
      const res = await makePick({ draftId, team: ident.team, playerId, playerName, madeBy: ident.userId });
      if (!res.ok) return bad(res.error || 'failed', 400);
      return ok({ ok: true });
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
      const arr = Array.isArray(body.playerIds) ? (body.playerIds as string[]) : [];
      await setTeamQueue(draftId, ident.team, arr);
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
