import { NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getLeagueDrafts,
  getDraftPicks,
  getTeamsData,
  getAllPlayersCached,
  getDraftById,
  getLeagueTrades,
  getLeague,
  getLeagueRosters,
  getRosterIdToTeamNameMap,
  getNFLState,
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

type FuturePickOwnershipEntry = {
  originalRosterId: number;
  originalTeam: string;
  ownerRosterId: number;
  ownerTeam: string;
};

type FuturePickOwnership = Record<string, Record<string, FuturePickOwnershipEntry[]>>;

async function buildYearToLeagueMap(): Promise<Record<string, string | undefined>> {
  let seasonNum = new Date().getFullYear();
  try {
    const st = await getNFLState();
    const s = Number((st as { season?: string | number }).season ?? seasonNum);
    if (Number.isFinite(s)) seasonNum = s;
  } catch {}

  const map: Record<string, string | undefined> = {};
  // Current season
  map[String(seasonNum)] = LEAGUE_IDS.CURRENT;

  // Previous season (season - 1)
  const prevYear = String(seasonNum - 1);
  const prevId = (LEAGUE_IDS.PREVIOUS as Record<string, string | undefined>)[prevYear];
  if (prevId) map[prevYear] = prevId;

  // Optionally include older seasons from PREVIOUS without duplicating keys
  for (const [y, lid] of Object.entries(LEAGUE_IDS.PREVIOUS || {})) {
    if (map[y] === undefined) map[y] = lid;
  }

  return map;
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

async function buildFuturePickOwnershipForSeasons(
  leagueId: string,
  options: SleeperFetchOptions,
  seasons: string[],
): Promise<FuturePickOwnership> {
  const league = await getLeague(leagueId, options).catch(() => null as unknown);
  const rosters = await getLeagueRosters(leagueId, options).catch(
    () => [] as Awaited<ReturnType<typeof getLeagueRosters>>,
  );
  const nameMap = await getRosterIdToTeamNameMap(leagueId, options).catch(
    () => new Map<number, string>(),
  );
  if (!league || !rosters.length) return {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyLeague = league as any;
  const roundsRaw = (anyLeague?.settings?.draft_rounds ?? 4) as number | string;
  const roundsNum = typeof roundsRaw === 'string' ? Number(roundsRaw) : roundsRaw;
  const totalRounds = Number.isFinite(roundsNum) && roundsNum > 0 ? (roundsNum as number) : 4;

  type SleeperTradedPick = { season?: string | number; round?: number; roster_id?: number; owner_id?: number };
  let tradedPicks: SleeperTradedPick[] = [];
  try {
    const resp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, { cache: 'no-store' });
    if (resp.ok) {
      tradedPicks = (await resp.json()) as SleeperTradedPick[];
    }
  } catch {
    tradedPicks = [];
  }

  let transactions: SleeperTransaction[] = [];
  try {
    transactions = await getLeagueTrades(leagueId, options).catch(
      () => [] as SleeperTransaction[],
    );
  } catch {
    transactions = [];
  }

  const result: FuturePickOwnership = {};

  for (const season of seasons) {
    const seasonStr = String(season);
    const baseOwners = new Map<string, number>();

    for (const r of rosters) {
      for (let rd = 1; rd <= totalRounds; rd++) {
        baseOwners.set(`${r.roster_id}-${rd}`, r.roster_id);
      }
    }

    for (const tp of tradedPicks) {
      if (!tp || String(tp.season) !== seasonStr) continue;
      const rosterId = Number(tp.roster_id);
      const round = Number(tp.round);
      const ownerId = Number(tp.owner_id);
      if (!Number.isFinite(rosterId) || !Number.isFinite(round) || !Number.isFinite(ownerId)) continue;
      const key = `${rosterId}-${round}`;
      baseOwners.set(key, ownerId);
    }

    for (const txn of transactions) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyTxn = txn as any;
      const dps = Array.isArray(anyTxn?.draft_picks)
        ? (anyTxn.draft_picks as Array<{
          season?: string | number;
          round?: number;
          roster_id?: number;
          owner_id?: number;
        }>)
        : [];
      for (const dp of dps) {
        if (!dp || String(dp.season) !== seasonStr) continue;
        const round = Number(dp.round);
        const origRosterId = Number(dp.roster_id);
        const newOwner = Number(dp.owner_id);
        if (!Number.isFinite(round) || !Number.isFinite(origRosterId) || !Number.isFinite(newOwner)) continue;
        const key = `${origRosterId}-${round}`;
        baseOwners.set(key, newOwner);
      }
    }

    const seasonOwnership: Record<string, FuturePickOwnershipEntry[]> = {};
    for (const [key, ownerRosterId] of baseOwners.entries()) {
      const [origRosterIdStr, roundStr] = key.split('-');
      const origRosterId = Number(origRosterIdStr);
      const round = Number(roundStr);
      if (!Number.isFinite(origRosterId) || !Number.isFinite(round)) continue;
      const originalTeam = nameMap.get(origRosterId) || `Roster ${origRosterId}`;
      const ownerTeam = nameMap.get(ownerRosterId) || `Roster ${ownerRosterId}`;
      const arrKey = String(round);
      const arr = seasonOwnership[arrKey] || [];
      arr.push({
        originalRosterId: origRosterId,
        originalTeam,
        ownerRosterId,
        ownerTeam,
      });
      seasonOwnership[arrKey] = arr;
    }

    result[seasonStr] = seasonOwnership;
  }

  return result;
}

export async function GET() {
  try {
    const yearToLeague = await buildYearToLeagueMap();
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

    let futurePickOwnership: FuturePickOwnership = {};
    try {
      const currentLeagueId = LEAGUE_IDS.CURRENT;
      if (currentLeagueId) {
        futurePickOwnership = await buildFuturePickOwnershipForSeasons(
          currentLeagueId,
          opts,
          ['2026', '2027', '2028'],
        );
      }
    } catch {
      futurePickOwnership = {};
    }

    const body = {
      meta: {
        type: 'drafts-and-picks',
        version: 1,
        generatedAt: new Date().toISOString(),
      },
      draftsBySeason,
      futurePickOwnership,
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
