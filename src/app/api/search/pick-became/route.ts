import { NextRequest, NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueDrafts, getDraftById, getDraftPicks, getLeagueRosters, getAllPlayers, getRosterIdToTeamNameMap } from '@/lib/utils/sleeper-api';

function getLeagueIdForSeason(season: string): string | null {
  if (season === '2025') return LEAGUE_IDS.CURRENT;
  const prev = LEAGUE_IDS.PREVIOUS[season as keyof typeof LEAGUE_IDS.PREVIOUS];
  return prev || null;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const season = (url.searchParams.get('season') || '').trim();
    const roundStr = (url.searchParams.get('round') || '').trim();
    const originalOwner = (url.searchParams.get('originalOwner') || '').trim();

    const round = Number(roundStr);
    if (!season || !Number.isFinite(round) || round <= 0) {
      return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
    }

    const leagueId = getLeagueIdForSeason(season);
    if (!leagueId) return NextResponse.json({ error: 'unknown_season' }, { status: 400 });

    // Find roster id for the original owner
    const rosterIdToTeam = await getRosterIdToTeamNameMap(leagueId);
    const rosters = await getLeagueRosters(leagueId);
    // Build reverse map name -> roster_id (use roster metadata fallback)
    const nameToRoster = new Map<string, number>();
    for (const r of rosters) {
      const name = rosterIdToTeam.get(r.roster_id) || (r.metadata?.team_name ?? `Roster ${r.roster_id}`);
      nameToRoster.set(name, r.roster_id);
    }
    const rosterId = originalOwner ? nameToRoster.get(originalOwner) : undefined;

    // Load draft info for the season
    const drafts = await getLeagueDrafts(leagueId);
    const draft = drafts.find((d) => d.season === season);
    if (!draft) return NextResponse.json({ error: 'no_draft_for_season' }, { status: 404 });
    const draftDetails = await getDraftById(draft.draft_id);
    const picks = await getDraftPicks(draft.draft_id);

    // Try to infer the draft slot for the original roster
    let draftSlot: number | undefined = undefined;
    if (rosterId) {
      const orderObj = (draftDetails.draft_order || {}) as Record<string, number>;
      const v = orderObj[String(rosterId)];
      if (Number.isFinite(Number(v))) draftSlot = Number(v);
      if (!draftSlot) {
        // Sometimes keyed by owner_id, fallback using owner mapping
        const ownerId = rosters.find(r => r.roster_id === rosterId)?.owner_id;
        if (ownerId && Number.isFinite(Number(orderObj[String(ownerId)]))) {
          draftSlot = Number(orderObj[String(ownerId)]);
        }
      }
    }

    // Find the pick matching round + slot (if known), otherwise best-effort
    type DraftPick = { round?: number | string; draft_slot?: number | string; pick_no?: number | string; roster_id?: number };
    let match: DraftPick | undefined = undefined;
    if (Number.isFinite(draftSlot)) {
      match = picks.find(p => Number(p.round) === round && Number(p.draft_slot) === draftSlot);
    }
    if (!match) {
      // Fallback: first pick found for that round as a weak guess
      match = picks.find(p => Number(p.round) === round);
    }

    let pickInRound: number | undefined = undefined;
    let overallPick: number | undefined = undefined;
    let became: { id?: string; name?: string; position?: string; team?: string } | undefined = undefined;

    if (match) {
      const rosterCount = rosters.length || 12;
      if (Number.isFinite(Number(match.pick_no)) && rosterCount > 0) {
        pickInRound = ((Number(match.pick_no) - 1) % rosterCount) + 1;
        overallPick = Number(match.pick_no);
      } else if (Number.isFinite(Number(match.draft_slot))) {
        pickInRound = Number(match.draft_slot);
      }
      const mp: unknown = (match as unknown as Record<string, unknown>)['player_id'];
      if (typeof mp === 'string' && mp) {
        const playersUnknown = (await getAllPlayers()) as unknown;
        const p = playersUnknown && typeof playersUnknown === 'object'
          ? (playersUnknown as Record<string, unknown>)[mp] as Record<string, unknown> | undefined
          : undefined;
        if (p) {
          const first = typeof p['first_name'] === 'string' ? p['first_name'] as string : '';
          const last = typeof p['last_name'] === 'string' ? p['last_name'] as string : '';
          const position = typeof p['position'] === 'string' ? p['position'] as string : undefined;
          const team = typeof p['team'] === 'string' ? p['team'] as string : undefined;
          became = { id: mp, name: `${first} ${last}`.trim(), position, team };
        }
      }
    }

    return NextResponse.json({
      season,
      round,
      originalOwner: originalOwner || null,
      draftSlot: Number.isFinite(draftSlot) ? draftSlot : null,
      pickInRound: Number.isFinite(pickInRound as number) ? (pickInRound as number) : null,
      overallPick: Number.isFinite(overallPick as number) ? (overallPick as number) : null,
      became: became || null,
    }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
