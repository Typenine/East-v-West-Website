import { NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getLeagueDrafts,
  getDraftPicks,
  getTeamsData,
  getAllPlayersCached,
  type SleeperDraftPick,
  type SleeperPlayer,
  type TeamData,
  type SleeperFetchOptions,
} from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type DraftExportPick = {
  season: string;
  draftId: string;
  round: number;
  overall: number;
  pickInRound: number;
  rosterId: number;
  team: string;
  playerId?: string;
  playerName?: string;
  position?: string;
  price?: number | null;
};

type DraftSeasonExport = {
  draftId: string;
  season: string;
  rounds: number;
  picksPerRound: number;
  picks: DraftExportPick[];
};

function buildYearToLeagueMap(): Record<string, string | undefined> {
  return {
    '2025': LEAGUE_IDS.CURRENT,
    ...LEAGUE_IDS.PREVIOUS,
  } as Record<string, string | undefined>;
}

function computePrice(pick: SleeperDraftPick): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyPick = pick as any;
  const metaAmountRaw = anyPick?.metadata?.amount;
  const metaAmount = typeof metaAmountRaw === 'string' && metaAmountRaw.trim() !== '' ? Number(metaAmountRaw) : undefined;
  const rootAmountRaw = anyPick?.amount ?? anyPick?.price;
  const rootAmount = typeof rootAmountRaw === 'string'
    ? Number(rootAmountRaw)
    : (typeof rootAmountRaw === 'number' ? rootAmountRaw : undefined);
  const price = Number.isFinite(metaAmount)
    ? (metaAmount as number)
    : (Number.isFinite(rootAmount) ? (rootAmount as number) : undefined);
  return Number.isFinite(price) ? (price as number) : null;
}

export async function GET() {
  try {
    const yearToLeague = buildYearToLeagueMap();
    const seasons = Object.keys(yearToLeague)
      .filter((season) => Boolean(yearToLeague[season]))
      .sort();

    const opts: SleeperFetchOptions = { timeoutMs: 20000 };
    const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));

    const draftsBySeason: Record<string, DraftSeasonExport | null> = {};

    for (const season of seasons) {
      const leagueId = yearToLeague[season];
      if (!leagueId) {
        draftsBySeason[season] = null;
        continue;
      }

      const drafts = await getLeagueDrafts(leagueId, opts).catch(
        () => [] as Awaited<ReturnType<typeof getLeagueDrafts>>,
      );
      const teams = await getTeamsData(leagueId, opts).catch(
        () => [] as TeamData[],
      );

      const draft = drafts.find((d) => d.season === season) || drafts[0];
      if (!draft) {
        draftsBySeason[season] = null;
        continue;
      }

      const picks = await getDraftPicks(draft.draft_id, opts).catch(() => [] as SleeperDraftPick[]);
      if (!picks.length) {
        draftsBySeason[season] = {
          draftId: draft.draft_id,
          season,
          rounds: 0,
          picksPerRound: 0,
          picks: [],
        };
        continue;
      }

      const rounds = picks.reduce((max, p) => Math.max(max, Number(p.round) || 0), 0);
      const picksInRound1 = picks.filter((p) => Number(p.round) === 1).length || teams.length || 0;

      const rosterIdToTeam = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName] as const));

      const exportPicks: DraftExportPick[] = picks.map((p) => {
        const rosterId = p.roster_id as number;
        const teamName = rosterIdToTeam.get(rosterId) || `Roster ${rosterId}`;
        const player: SleeperPlayer | undefined = p.player_id ? players[p.player_id] : undefined;
        const name = player ? `${player.first_name || ''} ${player.last_name || ''}`.trim() || undefined : undefined;
        const overall = typeof p.pick_no === 'number' && Number.isFinite(p.pick_no)
          ? (p.pick_no as number)
          : ((Number(p.round) - 1) * (picksInRound1 || 1) + Number(p.draft_slot || 1));
        const pickInRound = Number(p.draft_slot || ((overall - 1) % (picksInRound1 || 1)) + 1);
        const price = computePrice(p);
        return {
          season,
          draftId: draft.draft_id,
          round: Number(p.round),
          overall,
          pickInRound,
          rosterId,
          team: teamName,
          playerId: p.player_id,
          playerName: name,
          position: player?.position,
          price,
        };
      });

      draftsBySeason[season] = {
        draftId: draft.draft_id,
        season,
        rounds,
        picksPerRound: picksInRound1,
        picks: exportPicks.sort((a, b) => a.overall - b.overall),
      };
    }

    const body = {
      meta: {
        type: 'drafts-and-picks',
        version: 1,
        generatedAt: new Date().toISOString(),
      },
      draftsBySeason,
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="evw-drafts-and-picks.json"',
      },
    });
  } catch (err) {
    console.error('export/drafts GET error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
