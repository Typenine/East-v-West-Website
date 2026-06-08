/**
 * MCP Tool: get_drafts
 * Returns slim draft history and current future-pick ownership.
 * Reuses getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayersCached, and
 * buildYearToLeagueMapUnique from sleeper-api.ts.
 * Never returns the full export/drafts payload.
 *
 * Query params:
 *   ?season=2025  — filter to a specific season (default: all seasons)
 *   ?team=Belltown+Raptors — show only picks owned by or originally from a team
 *   ?type=future  — return only future-pick ownership (skips historical picks)
 *   ?type=history — return only historical draft picks (skips future ownership)
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  buildYearToLeagueMapUnique,
  getLeagueDrafts,
  getDraftPicks,
  getTeamsData,
  getAllPlayersCached,
  type SleeperPlayer,
  type SleeperDraftPick,
} from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  try {
    const url = new URL(request.url);
    const seasonFilter = (url.searchParams.get('season') ?? '').trim();
    const teamFilter = (url.searchParams.get('team') ?? '').toLowerCase().trim();
    const typeFilter = (url.searchParams.get('type') ?? '').toLowerCase().trim(); // 'future' | 'history' | ''

    const opts = { timeoutMs: 20000 };
    const yearToLeague = await buildYearToLeagueMapUnique(opts);

    const seasons = Object.keys(yearToLeague)
      .filter((y) => !seasonFilter || y === seasonFilter)
      .sort();

    const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));

    // ── Historical picks ────────────────────────────────────────────────────
    type PickRow = {
      season: string;
      round: number;
      pick: number;
      team: string;
      player: string | null;
      position: string | null;
      acquiredVia: 'original' | 'trade';
    };

    const historyBySeason: Record<string, PickRow[]> = {};

    if (typeFilter !== 'future') {
      for (const season of seasons) {
        const leagueId = yearToLeague[season];
        if (!leagueId) continue;

        const [drafts, teams] = await Promise.all([
          getLeagueDrafts(leagueId, opts).catch(() => []),
          getTeamsData(leagueId, opts).catch(() => []),
        ]);

        const draft = drafts.find((d) => d.season === season) ?? drafts[0];
        if (!draft) continue;

        const picks = await getDraftPicks(draft.draft_id, opts).catch(
          () => [] as SleeperDraftPick[],
        );
        const rosterIdToName = new Map<number, string>(
          teams.map((t) => [t.rosterId, t.teamName]),
        );

        const rows: PickRow[] = picks
          .reduce<PickRow[]>((acc, p) => {
            const pl = p.player_id ? (players[p.player_id] as SleeperPlayer | undefined) : undefined;
            const teamName = rosterIdToName.get(p.roster_id as number) ?? `Roster ${p.roster_id}`;
            if (teamFilter && !teamName.toLowerCase().includes(teamFilter)) return acc;
            acc.push({
              season,
              round: Number(p.round),
              pick: Number(p.draft_slot ?? p.pick_no ?? 0),
              team: teamName,
              player: pl ? `${pl.first_name || ''} ${pl.last_name || ''}`.trim() || null : null,
              position: pl?.position ?? null,
              acquiredVia: 'original',
            });
            return acc;
          }, [])
          .sort((a, b) => a.round - b.round || a.pick - b.pick);

        if (rows.length > 0) historyBySeason[season] = rows;
      }
    }

    // ── Future pick ownership (current league only) ─────────────────────────
    type FuturePickRow = {
      season: string;
      round: number;
      originalTeam: string;
      currentOwner: string;
      traded: boolean;
    };

    const futurePicks: FuturePickRow[] = [];

    if (typeFilter !== 'history') {
      const currentLeagueId = LEAGUE_IDS.CURRENT;
      try {
        const resp = await fetch(
          `https://api.sleeper.app/v1/league/${currentLeagueId}/traded_picks`,
          { cache: 'no-store', signal: AbortSignal.timeout(8000) },
        );
        const currentTeams = await getTeamsData(currentLeagueId, opts).catch(() => []);
        const rosterIdToName = new Map<number, string>(
          currentTeams.map((t) => [t.rosterId, t.teamName]),
        );

        type TradedPick = { season?: string | number; round?: number; roster_id?: number; owner_id?: number };
        const tradedPicks: TradedPick[] = resp.ok ? ((await resp.json()) as TradedPick[]) : [];

        for (const tp of tradedPicks) {
          const season = String(tp.season ?? '');
          if (seasonFilter && season !== seasonFilter) continue;
          const origTeam = rosterIdToName.get(Number(tp.roster_id)) ?? `Roster ${tp.roster_id}`;
          const ownerTeam = rosterIdToName.get(Number(tp.owner_id)) ?? `Roster ${tp.owner_id}`;
          if (teamFilter && !origTeam.toLowerCase().includes(teamFilter) && !ownerTeam.toLowerCase().includes(teamFilter)) continue;
          futurePicks.push({
            season,
            round: Number(tp.round ?? 0),
            originalTeam: origTeam,
            currentOwner: ownerTeam,
            traded: origTeam !== ownerTeam,
          });
        }

        futurePicks.sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round);
      } catch {
        // best-effort; return empty array on failure
      }
    }

    return NextResponse.json({
      meta: mcpMeta('get_drafts', {
        seasonsQueried: seasons,
        filters: { season: seasonFilter || null, team: teamFilter || null, type: typeFilter || 'all' },
        note: 'historicalPicks shows completed draft selections. futurePickOwnership shows traded picks for upcoming drafts.',
      }),
      historicalPicks: historyBySeason,
      futurePickOwnership: futurePicks,
    });
  } catch (err) {
    console.error('[mcp/drafts]', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
