import { NextRequest } from 'next/server';
import {
  getActiveOrLatestDraftId,
  getDraftOverview,
  getDraftTradesForTeam,
  getAdminPendingTrades,
  getDraftTradeById,
  createDraftTrade,
  addTradeAcceptance,
  updateTradeStatus,
  approveDraftTrade,
  clearTradeAnimation,
  getRosterSnapshot,
  getFuturePicks,
  pauseDraft,
  type TradeAssetType,
} from '@/server/db/queries.fixed';
import { requireTeamUser } from '@/lib/server/session';

function isAdmin(req: NextRequest): boolean {
  try {
    const cookie = req.cookies.get('evw_admin')?.value;
    return cookie === (process.env.EVW_ADMIN_SECRET || '002023');
  } catch { return false; }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ok(data: unknown) {
  return Response.json(data);
}
function bad(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'get_team';
  const draftIdParam = url.searchParams.get('draftId') || '';

  const draftId = draftIdParam || (await getActiveOrLatestDraftId().catch(() => null)) || '';
  if (!draftId) return bad('no active draft', 404);

  // get_assets — returns roster snapshot + current picks + future picks for a team
  if (action === 'get_assets') {
    const team = url.searchParams.get('team') || '';
    if (!team) return bad('team required');
    const [rosterPlayers, futurePicks, overview] = await Promise.all([
      getRosterSnapshot(draftId, team),
      getFuturePicks(draftId, team),
      getDraftOverview(draftId),
    ]);
    // Current draft picks owned by this team (not yet made)
    const allSlots = overview?.allSlots || [];
    const allPicksMade = new Set((overview?.allPicks || []).map(p => p.overall));
    const currentPicks = allSlots.filter(s => s.team === team && !allPicksMade.has(s.overall));
    return ok({ rosterPlayers, futurePicks, currentPicks });
  }

  // get_admin_pending — admin only
  if (action === 'get_admin_pending') {
    if (!isAdmin(req)) return bad('forbidden', 403);
    const trades = await getAdminPendingTrades(draftId);
    return ok({ trades });
  }

  // get_team — trades involving myTeam
  if (action === 'get_team') {
    const teamParam = url.searchParams.get('team');
    const team = teamParam || (await requireTeamUser().catch(() => null))?.team || '';
    if (!team) return bad('team required');
    const trades = await getDraftTradesForTeam(draftId, team);
    return ok({ trades });
  }

  return bad('unknown action');
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === 'string' ? body.action : '';
  const draftIdParam = typeof body.draftId === 'string' ? body.draftId : '';

  const draftId = draftIdParam || (await getActiveOrLatestDraftId().catch(() => null)) || '';
  if (!draftId) return bad('no active draft', 404);

  const adminReq = isAdmin(req);
  const ident = adminReq ? null : await requireTeamUser().catch(() => null);
  const myTeam = ident?.team || null;

  // propose — create a new trade offer
  if (action === 'propose') {
    if (!myTeam && !adminReq) return bad('not authenticated', 401);
    const proposingTeam = (typeof body.proposedBy === 'string' ? body.proposedBy : myTeam) || '';
    if (!proposingTeam) return bad('proposedBy required');
    const teams = Array.isArray(body.teams) ? (body.teams as string[]) : [];
    if (teams.length < 2 || teams.length > 3) return bad('2 or 3 teams required');
    if (!teams.includes(proposingTeam)) return bad('proposing team must be in teams list');
    const assets = Array.isArray(body.assets) ? (body.assets as Array<{
      fromTeam: string; toTeam: string; assetType: TradeAssetType;
      playerId?: string; playerName?: string; playerPos?: string;
      pickOverall?: number; pickYear?: number; pickRound?: number; pickOriginalTeam?: string;
    }>) : [];
    if (assets.length === 0) return bad('assets required');
    const notes = typeof body.notes === 'string' ? body.notes : null;
    const counterOf = typeof body.counterOf === 'string' ? body.counterOf : null;
    // If countering, mark original as countered
    if (counterOf) {
      const original = await getDraftTradeById(counterOf);
      if (!original || !['pending', 'accepted'].includes(original.status)) return bad('original trade not found or not counterable');
      await updateTradeStatus(counterOf, 'countered');
    }
    const tradeId = await createDraftTrade({ draftId, proposedBy: proposingTeam, teams, assets, counterOf, notes });
    return ok({ ok: true, tradeId });
  }

  // accept
  if (action === 'accept') {
    const team = (typeof body.team === 'string' ? body.team : myTeam) || '';
    const tradeId = typeof body.tradeId === 'string' ? body.tradeId : '';
    if (!team || !tradeId) return bad('team and tradeId required');
    const trade = await getDraftTradeById(tradeId);
    if (!trade || trade.draftId !== draftId) return bad('trade not found');
    if (!trade.teams.includes(team)) return bad('team not part of this trade');
    if (trade.status !== 'pending') return bad('trade is not pending');
    const result = await addTradeAcceptance(tradeId, team);
    return ok({ ok: true, allAccepted: result.allAccepted, trade: result.trade });
  }

  // reject
  if (action === 'reject') {
    const team = (typeof body.team === 'string' ? body.team : myTeam) || '';
    const tradeId = typeof body.tradeId === 'string' ? body.tradeId : '';
    if (!team || !tradeId) return bad('team and tradeId required');
    const trade = await getDraftTradeById(tradeId);
    if (!trade || trade.draftId !== draftId) return bad('trade not found');
    if (!trade.teams.includes(team)) return bad('team not part of this trade');
    if (!['pending', 'accepted'].includes(trade.status)) return bad('trade cannot be rejected');
    await updateTradeStatus(tradeId, 'rejected');
    return ok({ ok: true });
  }

  // cancel — proposing team withdraws offer
  if (action === 'cancel') {
    const team = (typeof body.team === 'string' ? body.team : myTeam) || '';
    const tradeId = typeof body.tradeId === 'string' ? body.tradeId : '';
    if (!team || !tradeId) return bad('team and tradeId required');
    const trade = await getDraftTradeById(tradeId);
    if (!trade || trade.draftId !== draftId) return bad('trade not found');
    if (trade.proposedBy !== team && !adminReq) return bad('only proposing team can cancel');
    if (!['pending', 'accepted'].includes(trade.status)) return bad('trade cannot be cancelled');
    await updateTradeStatus(tradeId, 'cancelled');
    return ok({ ok: true });
  }

  // approve — admin only
  if (action === 'approve') {
    if (!adminReq) return bad('forbidden', 403);
    const tradeId = typeof body.tradeId === 'string' ? body.tradeId : '';
    if (!tradeId) return bad('tradeId required');
    const trade = await getDraftTradeById(tradeId);
    if (!trade || trade.draftId !== draftId) return bad('trade not found');
    if (trade.status !== 'accepted') return bad('trade must be accepted before approval');
    // Pause the draft clock during animation
    await pauseDraft(draftId);
    const approved = await approveDraftTrade(tradeId);
    if (!approved) return bad('trade approval failed');
    return ok({ ok: true, trade: approved });
  }

  // reject_admin — commissioner rejects
  if (action === 'reject_admin') {
    if (!adminReq) return bad('forbidden', 403);
    const tradeId = typeof body.tradeId === 'string' ? body.tradeId : '';
    if (!tradeId) return bad('tradeId required');
    const trade = await getDraftTradeById(tradeId);
    if (!trade || trade.draftId !== draftId) return bad('trade not found');
    await updateTradeStatus(tradeId, 'rejected');
    return ok({ ok: true });
  }

  // clear_trade_animation — called by overlay after animation plays
  if (action === 'clear_trade_animation') {
    await clearTradeAnimation(draftId);
    return ok({ ok: true });
  }

  return bad('unknown action');
}
