import { NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getLeagueDrafts,
  getDraftPicks,
  getTeamsData,
  getAllPlayersCached,
  getDraftById,
  getLeagueTrades,
  type SleeperDraftPick,
  type SleeperPlayer,
  type TeamData,
  type SleeperFetchOptions,
  type SleeperTransaction,
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
  // Provenance: where this pick originally came from and how it was acquired
  fromTeam?: string;
  acquiredVia?: 'original' | 'trade' | 'unknown';
  tradeId?: string | null;
  // Player class (e.g., 2023, 2024, 2025 rookie class) when available
  playerClass?: string | number | null;
};

type DraftSeasonExport = {
  draftId: string;
  season: string;
  rounds: number;
  picksPerRound: number;
   // Draft configuration
   draftType?: string | null;
   draftOrder?: Array<{
     slot: number;
     rosterId: number | null;
     team: string | null;
   }>;
   // Ownership of picks by round before the draft (after all trades)
   pickOwnership?: Record<string, Array<{
     originalRosterId: number;
     originalTeam: string;
     ownerRosterId: number;
     ownerTeam: string;
   }>>;
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

      // Draft metadata for this season (type + order)
      let draftType: string | null = null;
      let draftOrder: Array<{ slot: number; rosterId: number | null; team: string | null }> = [];
      try {
        const details = await getDraftById(draft.draft_id, opts).catch(() => null as unknown);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anyDetails = details as any;
        draftType = (anyDetails?.type || null) as string | null;
        const rawOrder = (anyDetails?.draft_order || {}) as Record<string, number>;
        const rosterIdToTeam = new Map<number, string>(
          teams.map((t) => [t.rosterId, t.teamName] as const),
        );
        const tmp: Array<{ slot: number; rosterId: number | null; team: string | null }> = [];
        for (const [key, val] of Object.entries(rawOrder)) {
          const slot = Number(val);
          if (!Number.isFinite(slot)) continue;
          const keyNum = Number(key);
          let rosterId: number | null = null;
          let teamName: string | null = null;
          if (Number.isFinite(keyNum)) {
            // draft_order keyed by roster_id
            rosterId = keyNum;
            teamName = rosterIdToTeam.get(rosterId) ?? null;
          } else {
            // draft_order keyed by owner_id (user id)
            const ownerId = key;
            const t = teams.find((tt) => tt.ownerId === ownerId);
            if (t) {
              rosterId = t.rosterId;
              teamName = t.teamName;
            }
          }
          tmp.push({ slot, rosterId, team: teamName });
        }
        draftOrder = tmp.sort((a, b) => a.slot - b.slot);
      } catch {
        draftType = draft?.type ?? null;
        draftOrder = [];
      }

      const picks = await getDraftPicks(draft.draft_id, opts).catch(() => [] as SleeperDraftPick[]);
      if (!picks.length) {
        draftsBySeason[season] = {
          draftId: draft.draft_id,
          season,
          rounds: 0,
          picksPerRound: 0,
          draftType,
          draftOrder,
          picks: [],
        };
        continue;
      }

      const rounds = picks.reduce((max, p) => Math.max(max, Number(p.round) || 0), 0);
      const picksInRound1 = picks.filter((p) => Number(p.round) === 1).length || teams.length || 0;

      const rosterIdToTeam = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName] as const));

      // Build pick ownership map using trade history: origin -> current owner
      const ownershipByOrigin = new Map<string, { ownerRosterId: number; tradeId: string | null }>();
      for (const t of teams) {
        for (let r = 1; r <= rounds; r++) {
          const key = `${r}:${t.rosterId}`;
          ownershipByOrigin.set(key, { ownerRosterId: t.rosterId, tradeId: null });
        }
      }
      try {
        const trades = await getLeagueTrades(leagueId, opts).catch(
          () => [] as SleeperTransaction[],
        );
        for (const txn of trades) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyTxn = txn as any;
          const dps = Array.isArray(anyTxn?.draft_picks)
            ? (anyTxn.draft_picks as Array<{ season: string | number; round: number; roster_id: number; owner_id: number }> )
            : [];
          for (const dp of dps) {
            const dpSeason = String(dp.season);
            if (dpSeason !== season) continue;
            const roundNum = Number(dp.round);
            if (!Number.isFinite(roundNum) || roundNum < 1) continue;
            const origRosterId = Number(dp.roster_id);
            const newOwnerId = Number(dp.owner_id);
            if (!Number.isFinite(origRosterId) || !Number.isFinite(newOwnerId)) continue;
            const key = `${roundNum}:${origRosterId}`;
            ownershipByOrigin.set(key, { ownerRosterId: newOwnerId, tradeId: txn.transaction_id });
          }
        }
      } catch {
        // best-effort; if trades fail, ownershipByOrigin will reflect original holders only
      }

      // Build provenance map keyed by final owner
      const provenanceByFinal = new Map<string, { originalRosterId: number; tradeId: string | null }>();
      for (const [key, value] of ownershipByOrigin.entries()) {
        const [roundStr, origStr] = key.split(':');
        const roundNum = Number(roundStr);
        const origRosterId = Number(origStr);
        if (!Number.isFinite(roundNum) || !Number.isFinite(origRosterId)) continue;
        const finalOwner = value.ownerRosterId;
        const finalKey = `${roundNum}:${finalOwner}`;
        provenanceByFinal.set(finalKey, { originalRosterId: origRosterId, tradeId: value.tradeId });
      }

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

        const roundNum = Number(p.round);
        const provKey = `${roundNum}:${rosterId}`;
        const prov = provenanceByFinal.get(provKey);
        const originalRosterId = prov?.originalRosterId ?? rosterId;
        const fromTeam = rosterIdToTeam.get(originalRosterId) || `Roster ${originalRosterId}`;
        const acquiredVia: 'original' | 'trade' | 'unknown' = prov
          ? (prov.tradeId ? 'trade' : 'original')
          : 'original';
        const tradeId = prov?.tradeId ?? null;

        const playerClass: string | number | null =
          player && Object.prototype.hasOwnProperty.call(player, 'rookie_year')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ? ((player as any).rookie_year ?? null)
            : null;
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
          fromTeam,
          acquiredVia,
          tradeId,
          playerClass,
        };
      });

      // pickOwnership: ownership of each pick (by round) before the draft, after trades
      const pickOwnership: Record<string, Array<{
        originalRosterId: number;
        originalTeam: string;
        ownerRosterId: number;
        ownerTeam: string;
      }>> = {};
      for (const [key, value] of ownershipByOrigin.entries()) {
        const [roundStr, origStr] = key.split(':');
        const roundNum = Number(roundStr);
        const origRosterId = Number(origStr);
        if (!Number.isFinite(roundNum) || !Number.isFinite(origRosterId)) continue;
        const ownerRosterId = value.ownerRosterId;
        const originalTeam = rosterIdToTeam.get(origRosterId) || `Roster ${origRosterId}`;
        const ownerTeam = rosterIdToTeam.get(ownerRosterId) || `Roster ${ownerRosterId}`;
        const arrKey = String(roundNum);
        const arr = (pickOwnership[arrKey] ||= []);
        arr.push({ originalRosterId: origRosterId, originalTeam, ownerRosterId, ownerTeam });
      }

      draftsBySeason[season] = {
        draftId: draft.draft_id,
        season,
        rounds,
        picksPerRound: picksInRound1,
        draftType,
        draftOrder,
        pickOwnership,
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
