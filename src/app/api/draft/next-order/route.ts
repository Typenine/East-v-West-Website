import { NextResponse } from 'next/server';
import { getNextDraftOwnership } from '@/lib/server/trade-assets';
import { getTeamsData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { fetchTradeById, Trade } from '@/lib/utils/trades';

export async function GET() {
  try {
    const ownership = await getNextDraftOwnership();
    if (!ownership) {
      return NextResponse.json({ error: 'ownership_unavailable' }, { status: 503 });
    }

    const leagueId = LEAGUE_IDS.CURRENT;
    const teams = await getTeamsData(leagueId);
    const teamByRosterId = new Map(teams.map((t) => [t.rosterId, t] as const));

    const sortedForDraft = [...teams].sort((a, b) => {
      if (a.wins !== b.wins) return a.wins - b.wins;
      if (a.losses !== b.losses) return b.losses - a.losses;
      if (a.fpts !== b.fpts) return a.fpts - b.fpts;
      if (a.fptsAgainst !== b.fptsAgainst) return a.fptsAgainst - b.fptsAgainst;
      return a.teamName.localeCompare(b.teamName);
    });

    const slotOrder = sortedForDraft.map((team, index) => ({
      slot: index + 1,
      rosterId: team.rosterId,
      team: team.teamName,
      record: {
        wins: team.wins,
        losses: team.losses,
        ties: team.ties,
        fpts: team.fpts,
        fptsAgainst: team.fptsAgainst,
      },
    }));

    const slotByRoster = new Map<number, number>();
    for (const entry of slotOrder) slotByRoster.set(entry.rosterId, entry.slot);

    const roundsToShow = Math.min(4, ownership.rounds || 4);
    const roundsData = Array.from({ length: roundsToShow }, (_, i) => i + 1).map((round) => {
      const picks = slotOrder.map((slotInfo) => {
        const key = `${slotInfo.rosterId}-${round}`;
        const entry = ownership.ownership[key];
        const ownerRosterId = entry?.ownerRosterId ?? slotInfo.rosterId;
        const ownerTeam = ownership.rosterIdToTeam[String(ownerRosterId)]
          ?? teamByRosterId.get(ownerRosterId)?.teamName
          ?? `Roster ${ownerRosterId}`;
        const originalTeam = ownership.rosterIdToTeam[String(slotInfo.rosterId)]
          ?? teamByRosterId.get(slotInfo.rosterId)?.teamName
          ?? `Roster ${slotInfo.rosterId}`;
        return {
          slot: slotInfo.slot,
          round,
          originalTeam,
          ownerTeam,
          originalRosterId: slotInfo.rosterId,
          ownerRosterId,
          history: entry?.history ?? [],
        };
      });
      return { round, picks };
    });

    const totals = new Map<string, { overall: number; firstTwo: number; r3: number; r4: number }>();
    const ensureTotals = (team: string) => {
      if (!totals.has(team)) totals.set(team, { overall: 0, firstTwo: 0, r3: 0, r4: 0 });
      return totals.get(team)!;
    };

    for (const [key, entry] of Object.entries(ownership.ownership)) {
      const [, roundStr] = key.split('-');
      const round = Number(roundStr);
      const ownerTeam = ownership.rosterIdToTeam[String(entry.ownerRosterId)]
        ?? teamByRosterId.get(entry.ownerRosterId)?.teamName
        ?? `Roster ${entry.ownerRosterId}`;
      const agg = ensureTotals(ownerTeam);
      agg.overall += 1;
      if (round <= 2) agg.firstTwo += 1;
      if (round === 3) agg.r3 += 1;
      if (round === 4) agg.r4 += 1;
    }

    for (const team of slotOrder.map((s) => s.team)) ensureTotals(team);

    const sortedTotals = [...totals.entries()].sort((a, b) => {
      if (b[1].overall !== a[1].overall) return b[1].overall - a[1].overall;
      if (b[1].firstTwo !== a[1].firstTwo) return b[1].firstTwo - a[1].firstTwo;
      return a[0].localeCompare(b[0]);
    });

    const sortedTopFirstTwo = [...totals.entries()].sort((a, b) => {
      if (b[1].firstTwo !== a[1].firstTwo) return b[1].firstTwo - a[1].firstTwo;
      if (b[1].overall !== a[1].overall) return b[1].overall - a[1].overall;
      return a[0].localeCompare(b[0]);
    });

    const mostOverall = sortedTotals[0]
      ? { team: sortedTotals[0][0], count: sortedTotals[0][1].overall }
      : null;
    const mostFirstTwo = sortedTopFirstTwo[0]
      ? { team: sortedTopFirstTwo[0][0], count: sortedTopFirstTwo[0][1].firstTwo }
      : null;
    const sortedTopR3 = [...totals.entries()].sort((a, b) => b[1].r3 - a[1].r3 || b[1].overall - a[1].overall || a[0].localeCompare(b[0]));
    const sortedTopR4 = [...totals.entries()].sort((a, b) => b[1].r4 - a[1].r4 || b[1].overall - a[1].overall || a[0].localeCompare(b[0]));
    const mostR3 = sortedTopR3[0] ? { team: sortedTopR3[0][0], count: sortedTopR3[0][1].r3 } : null;
    const mostR4 = sortedTopR4[0] ? { team: sortedTopR4[0][0], count: sortedTopR4[0][1].r4 } : null;

    const factoids: string[] = [];
    if (mostOverall && mostOverall.count > 0) {
      factoids.push(`${mostOverall.team} lead the war chest with ${mostOverall.count} total picks.`);
    }
    if (mostFirstTwo && mostFirstTwo.count > 0) {
      factoids.push(`${mostFirstTwo.team} control ${mostFirstTwo.count} premium picks in rounds 1-2.`);
    }
    if (mostR3 && mostR3.count > 0) {
      factoids.push(`${mostR3.team} have the most 3rd-round picks (${mostR3.count}).`);
    }
    if (mostR4 && mostR4.count > 0) {
      factoids.push(`${mostR4.team} have the most 4th-round picks (${mostR4.count}).`);
    }
    if (!factoids.length) {
      factoids.push('No trades yet — everyone still holds their original picks.');
    }

    const picksPerTeam = [...totals.entries()].map(([team, counts]) => ({
      team,
      overall: counts.overall,
      firstTwo: counts.firstTwo,
    })).sort((a, b) => b.overall - a.overall || b.firstTwo - a.firstTwo || a.team.localeCompare(b.team));

    const transfers = [] as Array<{
      round: number;
      slot: number | null;
      tradeId: string;
      timestamp: number;
      fromTeam: string;
      toTeam: string;
      originalTeam: string;
      ownerTeam: string;
      summary?: string;
    }>;

    for (const [key, entry] of Object.entries(ownership.ownership)) {
      const [origRosterIdStr, roundStr] = key.split('-');
      const round = Number(roundStr);
      const slot = slotByRoster.get(Number(origRosterIdStr)) ?? null;
      const originalTeam = ownership.rosterIdToTeam[origRosterIdStr]
        ?? teamByRosterId.get(Number(origRosterIdStr))?.teamName
        ?? `Roster ${origRosterIdStr}`;
      const ownerTeam = ownership.rosterIdToTeam[String(entry.ownerRosterId)]
        ?? teamByRosterId.get(entry.ownerRosterId)?.teamName
        ?? `Roster ${entry.ownerRosterId}`;
      for (const history of entry.history) {
        transfers.push({
          round,
          slot,
          tradeId: history.tradeId,
          timestamp: history.timestamp,
          fromTeam: history.fromTeam,
          toTeam: history.toTeam,
          originalTeam,
          ownerTeam,
        });
      }
    }

    transfers.sort((a, b) => b.timestamp - a.timestamp);

    // Attach trade summaries for context
    const uniqueIds = Array.from(new Set(transfers.map((t) => t.tradeId))).filter(Boolean);
    const tradeMap = new Map<string, Trade | null>();
    await Promise.all(uniqueIds.map(async (id) => {
      try {
        const tr = await fetchTradeById(id);
        tradeMap.set(id, tr);
      } catch {
        tradeMap.set(id, null);
      }
    }));

    function summarizeTrade(tr: Trade | null | undefined): string | undefined {
      if (!tr) return undefined;
      const parts: string[] = [];
      for (const team of tr.teams) {
        const labels = (team.assets || []).map((a) => a.name).slice(0, 4);
        const more = (team.assets || []).length > 4 ? '…' : '';
        parts.push(`${team.name} received: ${labels.join(', ')}${more}`);
      }
      return parts.join(' | ');
    }
    for (const t of transfers) {
      const tr = tradeMap.get(t.tradeId);
      t.summary = summarizeTrade(tr);
    }

    return NextResponse.json({
      season: ownership.season,
      rounds: roundsToShow,
      rosterCount: ownership.rosterCount,
      generatedAt: new Date().toISOString(),
      slotOrder,
      roundsData,
      summary: {
        factoids,
        picksPerTeam,
        leaders: {
          mostOverall,
          mostFirstTwo,
          mostR3,
          mostR4,
        },
      },
      transfers,
    });
  } catch (error) {
    console.error('Failed to build draft order data', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
