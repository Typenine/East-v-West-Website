import { NextResponse } from 'next/server';
import { getNextDraftOwnership } from '@/lib/server/trade-assets';
import { getTeamsData, getLeagueWinnersBracket, type SleeperBracketGame, derivePodiumFromWinnersBracketByYear } from '@/lib/utils/sleeper-api';
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

    // Comparator: worse regular-season standing first
    const byStandingAsc = (a: typeof teams[number], b: typeof teams[number]) => {
      if (a.wins !== b.wins) return a.wins - b.wins;
      if (a.losses !== b.losses) return b.losses - a.losses;
      if (a.fpts !== b.fpts) return a.fpts - b.fpts;
      if (a.fptsAgainst !== b.fptsAgainst) return a.fptsAgainst - b.fptsAgainst;
      return a.teamName.localeCompare(b.teamName);
    };

    // Use winners bracket to determine playoff participants and finalists
    let slotOrder: Array<{ slot: number; rosterId: number; team: string; record: { wins: number; losses: number; ties: number; fpts: number; fptsAgainst: number } }> = [];
    try {
      const winners: SleeperBracketGame[] = await getLeagueWinnersBracket(leagueId, { forceFresh: true }).catch(() => []);
      const participantIds = new Set<number>();
      for (const g of winners) {
        if (g.t1 != null) participantIds.add(g.t1);
        if (g.t2 != null) participantIds.add(g.t2);
      }

      // Map loser -> elimination round (round they lost)
      const eliminatedInRound = new Map<number, number>();
      for (const g of winners) {
        const r = g.r ?? 0;
        if (g.t1 != null && g.t2 != null && g.w != null) {
          const loser = g.w === g.t1 ? g.t2 : g.t1;
          if (loser != null && !eliminatedInRound.has(loser)) eliminatedInRound.set(loser, r);
        }
      }

      // Identify finalists and third-place game using semifinal winners/losers
      let champId: number | null = null;
      let runnerId: number | null = null;
      let thirdWinnerId: number | null = null;
      let thirdLoserId: number | null = null;
      let maxRound = 0;
      if (winners.length > 0) {
        maxRound = Math.max(...winners.map((g) => g.r ?? 0));
        const semiRound = maxRound - 1;
        const lastRoundGames = winners.filter((g) => (g.r ?? 0) === maxRound && g.t1 != null && g.t2 != null);
        const semiGames = winners.filter((g) => (g.r ?? 0) === semiRound && g.t1 != null && g.t2 != null);
        const semiWinners = new Set<number>();
        const semiLosers = new Set<number>();
        for (const sg of semiGames) {
          if (sg.w != null) semiWinners.add(sg.w);
          const loser = sg.l ?? (sg.w === sg.t1 ? sg.t2 ?? null : sg.t1 ?? null);
          if (loser != null) semiLosers.add(loser);
        }
        const finalGame = lastRoundGames.find((g) => (semiWinners.has(g.t1 as number) && semiWinners.has(g.t2 as number)) && g.w != null);
        const thirdGame = lastRoundGames.find((g) => (semiLosers.has(g.t1 as number) && semiLosers.has(g.t2 as number)) && g.w != null);
        if (finalGame) {
          champId = finalGame.w ?? null;
          runnerId = finalGame.l ?? (finalGame.w === finalGame.t1 ? (finalGame.t2 ?? null) : (finalGame.t1 ?? null));
        }
        if (thirdGame) {
          thirdWinnerId = thirdGame.w ?? null;
          thirdLoserId = thirdGame.l ?? (thirdGame.w === thirdGame.t1 ? (thirdGame.t2 ?? null) : (thirdGame.t1 ?? null));
        }
      }

      // Fallback: derive podium by year if finalists not detected
      if ((champId == null || runnerId == null) && ownership?.season) {
        const yearStr = String(Number(ownership.season) - 1);
        try {
          const podium = await derivePodiumFromWinnersBracketByYear(yearStr, { forceFresh: true });
          if (podium) {
            const nameToRoster = new Map(teams.map((t) => [t.teamName, t.rosterId] as const));
            if (champId == null && podium.champion && nameToRoster.has(podium.champion)) {
              champId = nameToRoster.get(podium.champion)!;
            }
            if (runnerId == null && podium.runnerUp && nameToRoster.has(podium.runnerUp)) {
              runnerId = nameToRoster.get(podium.runnerUp)!;
            }
          }
        } catch {}
      }

      if (participantIds.size > 0 && champId != null && runnerId != null) {
        const byRoster = new Map(teams.map((t) => [t.rosterId, t] as const));
        const nonPlayoff = teams.filter((t) => !participantIds.has(t.rosterId)).sort(byStandingAsc);
        const playoffNonFinalists = teams.filter((t) => participantIds.has(t.rosterId) && t.rosterId !== champId && t.rosterId !== runnerId);
        // Bucket playoff non-finalists by elimination round, lowest round first
        const rounds = Array.from(new Set(playoffNonFinalists.map((t) => eliminatedInRound.get(t.rosterId) ?? Number.MAX_SAFE_INTEGER)))
          .filter((r) => Number.isFinite(r))
          .sort((a, b) => (a as number) - (b as number)) as number[];
        const playoffOrdered: Array<typeof teams[number]> = [];
        const semiRound = maxRound > 0 ? maxRound - 1 : -1;
        for (const r of rounds) {
          const bucket = playoffNonFinalists.filter((t) => (eliminatedInRound.get(t.rosterId) ?? Number.MAX_SAFE_INTEGER) === r);
          if (r === semiRound && thirdWinnerId != null && thirdLoserId != null) {
            bucket.sort((a, b) => {
              const aId = a.rosterId;
              const bId = b.rosterId;
              const aTP = aId === thirdWinnerId || aId === thirdLoserId;
              const bTP = bId === thirdWinnerId || bId === thirdLoserId;
              if (aTP && bTP) {
                if (aId === thirdLoserId && bId === thirdWinnerId) return -1; // 4th place first
                if (aId === thirdWinnerId && bId === thirdLoserId) return 1;  // then 3rd place
              }
              return byStandingAsc(a, b);
            });
          } else {
            bucket.sort(byStandingAsc);
          }
          playoffOrdered.push(...bucket);
        }
        // Ensure semifinal losers (third-place game participants) occupy picks 9–10 in loser/winner order
        let playoffOrderedAdjusted = playoffOrdered;
        if (thirdWinnerId != null && thirdLoserId != null) {
          const withoutThirds = playoffOrdered.filter((t) => t.rosterId !== thirdLoserId && t.rosterId !== thirdWinnerId);
          const thirdLoserTeam = byRoster.get(thirdLoserId);
          const thirdWinnerTeam = byRoster.get(thirdWinnerId);
          if (thirdLoserTeam && thirdWinnerTeam) {
            playoffOrderedAdjusted = [...withoutThirds, thirdLoserTeam, thirdWinnerTeam];
          }
        }
        const finalists = [byRoster.get(runnerId)!, byRoster.get(champId)!];

        const ordered = [
          ...nonPlayoff,
          ...playoffOrderedAdjusted,
          finalists[0], // runner-up gets pick 11
          finalists[1], // champion gets pick 12
        ].filter(Boolean);

        slotOrder = ordered.map((team, index) => ({
          slot: index + 1,
          rosterId: team!.rosterId,
          team: team!.teamName,
          record: {
            wins: team!.wins,
            losses: team!.losses,
            ties: team!.ties,
            fpts: team!.fpts,
            fptsAgainst: team!.fptsAgainst,
          },
        }));
      }
    } catch {
      // fall back to record-only ordering
    }

    if (slotOrder.length === 0) {
      const fallback = [...teams].sort(byStandingAsc);
      slotOrder = fallback.map((team, index) => ({
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
    }

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
    const uniqueIds = Array.from(new Set(transfers.map((t) => t.tradeId))).filter(Boolean).slice(0, 30);
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
    }, { headers: { 'Cache-Control': 's-maxage=30, stale-while-revalidate=60' } });
  } catch (error) {
    console.error('Failed to build draft order data', error);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
