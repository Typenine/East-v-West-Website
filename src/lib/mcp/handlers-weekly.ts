import * as core from './handlers-core';
export * from './handlers-core';

export const WEEKLY_CONTENT_PLAYOFF_SPOTS = 7;
export const WEEKLY_CONTENT_FIRST_ROUND_BYES = 1;
const PLAYOFF_RACE_START_WEEK = 9;

export async function handleGetWeeklyContext(): Promise<Awaited<ReturnType<typeof core.handleGetWeeklyContext>>> {
  const data = await core.handleGetWeeklyContext();
  const standings = data.standings ?? [];
  const week = Number(data.week ?? 1);
  const playoffSpots = WEEKLY_CONTENT_PLAYOFF_SPOTS;
  const inPlayoffs = standings.filter(row => row.rank <= playoffSpots);
  const onBubble = standings.filter(row => row.rank > playoffSpots && row.rank <= playoffSpots + 2);
  const eliminated = standings.filter(row => row.rank > playoffSpots + 2 && week >= 12);
  const lastInSpot = standings[playoffSpots - 1] ?? null;
  const firstOut = standings[playoffSpots] ?? null;
  const bubbleGap = lastInSpot && firstOut
    ? { wins: lastInSpot.wins - firstOut.wins, pf: Math.round((lastInSpot.pf - firstOut.pf) * 100) / 100 }
    : null;
  const showPlayoffRace = week >= PLAYOFF_RACE_START_WEEK;

  const suggestedStorylines = (data.suggestedStorylines ?? []).filter(line => {
    if (showPlayoffRace) return true;
    return !/playoff|bubble|clinched|first out|last in/i.test(line);
  });
  const suggestedHeadlines = (data.suggestedHeadlines ?? []).filter(line => {
    if (/game of the week/i.test(line)) return false;
    if (!showPlayoffRace && /playoff race|who'?s in|who'?s out/i.test(line)) return false;
    return true;
  });

  return {
    ...data,
    playoffRace: {
      playoffSpots,
      firstRoundByes: WEEKLY_CONTENT_FIRST_ROUND_BYES,
      byeSeed: 1,
      showPlayoffRace,
      inPlayoffs: inPlayoffs.map(row => ({ team: row.team, rank: row.rank, wins: row.wins, losses: row.losses })),
      onBubble: showPlayoffRace ? onBubble.map(row => ({ team: row.team, rank: row.rank, wins: row.wins, losses: row.losses })) : [],
      eliminated: showPlayoffRace ? eliminated.map(row => row.team) : [],
      bubbleGap: showPlayoffRace ? bubbleGap : null,
      clinchNote: week >= 13 ? 'Seven teams qualify. The #1 seed receives the first-round bye; seeds #2-#7 play in the opening round.' : null,
    } as typeof data.playoffRace,
    suggestedStorylines,
    suggestedHeadlines,
    weeklyRecapFormat: {
      canonical: true,
      order: [
        'Opening Exchange',
        'Transactions Since the Last Issue',
        'All Six Completed Matchup Reviews',
        'Weekly Power Rankings',
        'League Pulse',
        'Stock Watch',
        "Clancy's Receipt Desk",
        'All Six Upcoming Matchup Previews',
        'Final Word',
      ],
      transactionsSecond: true,
      equalMatchupReviewWeightEarlySeason: true,
      forceGameOfWeekEarlySeason: false,
      showPlayoffRace,
      playoffSpots,
      firstRoundByes: WEEKLY_CONTENT_FIRST_ROUND_BYES,
      byeSeed: 1,
    },
  } as Awaited<ReturnType<typeof core.handleGetWeeklyContext>>;
}
