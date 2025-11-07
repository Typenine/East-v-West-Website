import { NextResponse } from 'next/server';
import { getNextDraftOwnership } from '@/lib/server/trade-assets';
import { getTeamsData } from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';

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

    const totals = new Map<string, { overall: number; firstTwo: number }>();
    const ensureTotals = (team: string) => {
      if (!totals.has(team)) totals.set(team, { overall: 0, firstTwo: 0 });
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

    const factoids: string[] = [];
    if (mostOverall && mostOverall.count > 0) {
      factoids.push(`${mostOverall.team} lead the war chest with ${mostOverall.count} total picks.`);
    }
    if (mostFirstTwo && mostFirstTwo.count > 0) {
      factoids.push(`${mostFirstTwo.team} control ${mostFirstTwo.count} premium picks in rounds 1-2.`);
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
        },
      },
      transfers,
    });
  } catch (error) {
    console.error('Failed to build draft order data', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
