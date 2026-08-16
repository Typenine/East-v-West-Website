import type { Metadata } from 'next';
import Link from 'next/link';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { getSeasonAwardsUsingLeagueScoring, type AwardWinner, type SeasonAwards } from '@/lib/utils/sleeper-api';
import { getTeamColorStyle } from '@/lib/utils/team-utils';
import type { LeagueStatsDataset, StatsGameType } from '@/lib/stats/types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Awards & Scoring Highs — East v. West',
  description: 'East v. West MVP, Rookie of the Year, weekly high scores and all-time scoring-week leaders.',
};

type TeamScoreWeek = {
  season: string;
  week: number;
  gameType: StatsGameType;
  teamName: string;
  opponent: string;
  points: number;
  opponentPoints: number;
};

function fmt(value: number): string {
  return Number(value || 0).toFixed(1);
}

function teamScoreWeeks(dataset: LeagueStatsDataset): TeamScoreWeek[] {
  return dataset.games.flatMap((game) => [
    {
      season: game.season,
      week: game.week,
      gameType: game.gameType,
      teamName: game.teamA,
      opponent: game.teamB,
      points: game.scoreA,
      opponentPoints: game.scoreB,
    },
    {
      season: game.season,
      week: game.week,
      gameType: game.gameType,
      teamName: game.teamB,
      opponent: game.teamA,
      points: game.scoreB,
      opponentPoints: game.scoreA,
    },
  ]);
}

function topScores(rows: TeamScoreWeek[], gameType?: StatsGameType, top = 10): TeamScoreWeek[] {
  return rows
    .filter((row) => !gameType || row.gameType === gameType)
    .sort((a, b) => b.points - a.points || b.season.localeCompare(a.season) || b.week - a.week)
    .slice(0, top);
}

function buildWeeklyHighs(rows: TeamScoreWeek[]) {
  const groups = new Map<string, TeamScoreWeek[]>();
  for (const row of rows) {
    if (row.gameType !== 'regular') continue;
    const key = `${row.season}:${row.week}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }

  const highs: TeamScoreWeek[] = [];
  for (const group of groups.values()) {
    const high = Math.max(...group.map((row) => row.points));
    highs.push(...group.filter((row) => row.points === high));
  }
  highs.sort((a, b) => b.season.localeCompare(a.season) || a.week - b.week || a.teamName.localeCompare(b.teamName));
  return highs;
}

function TeamPill({ teamName }: { teamName: string | null }) {
  if (!teamName) return <span className="text-[var(--muted)]">Unknown franchise</span>;
  return (
    <span className="inline-flex rounded px-2 py-1 text-xs font-bold" style={getTeamColorStyle(teamName, 'primary')}>
      {teamName}
    </span>
  );
}

function Winner({ winner }: { winner: AwardWinner }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-3">
      <Link href={`/players/${encodeURIComponent(winner.playerId)}`} className="font-black text-[var(--accent)] hover:underline">
        {winner.name}
      </Link>
      <div className="mt-2"><TeamPill teamName={winner.teamName} /></div>
      <div className="mt-2 text-sm font-bold tabular-nums text-[var(--text)]">{fmt(winner.points)} pts</div>
    </div>
  );
}

function ScoreTable({ title, rows }: { title: string; rows: TeamScoreWeek[] }) {
  return (
    <section>
      <h3 className="mb-2 text-base font-black uppercase tracking-wide text-[var(--text)]">{title}</h3>
      <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full">
          <thead>
            <tr className="bg-[var(--surface-strong)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <th className="px-3 py-2">Rk</th>
              <th className="px-3 py-2">Franchise</th>
              <th className="px-3 py-2 text-right">Score</th>
              <th className="px-3 py-2">Opponent</th>
              <th className="px-3 py-2">Season</th>
              <th className="px-3 py-2 text-right">Week</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${title}-${row.season}-${row.week}-${row.teamName}-${index}`} className="border-t border-[var(--border)] text-sm">
                <td className="px-3 py-2 text-[var(--muted)]">{index + 1}</td>
                <td className="px-3 py-2"><TeamPill teamName={row.teamName} /></td>
                <td className="px-3 py-2 text-right font-black tabular-nums">{fmt(row.points)}</td>
                <td className="px-3 py-2">{row.opponent} <span className="text-[var(--muted)]">({fmt(row.opponentPoints)})</span></td>
                <td className="px-3 py-2">{row.season}</td>
                <td className="px-3 py-2 text-right tabular-nums">{row.week}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function AwardsPage() {
  const dataset = await getLeagueStatsDatasetV3();
  const scores = teamScoreWeeks(dataset);
  const completedSeasons = dataset.seasons
    .filter((season) => dataset.games.some((game) => game.season === season && game.gameType === 'regular'))
    .sort((a, b) => b.localeCompare(a));

  const awards = (await Promise.all(
    completedSeasons.map(async (season) => {
      const leagueId = getLeagueIdForSeason(season);
      if (!leagueId) return null;
      const endWeek = Math.max(
        0,
        ...dataset.games
          .filter((game) => game.season === season && game.gameType === 'regular')
          .map((game) => game.week),
      );
      if (!endWeek) return null;
      return getSeasonAwardsUsingLeagueScoring(season, leagueId, endWeek).catch(() => null);
    }),
  )).filter((row): row is SeasonAwards => row !== null);

  const weeklyHighs = buildWeeklyHighs(scores);
  const highsBySeason = new Map<string, TeamScoreWeek[]>();
  for (const row of weeklyHighs) {
    const group = highsBySeason.get(row.season) || [];
    group.push(row);
    highsBySeason.set(row.season, group);
  }

  const weeklyHighTally = new Map<string, number>();
  for (const row of weeklyHighs) weeklyHighTally.set(row.teamName, (weeklyHighTally.get(row.teamName) || 0) + 1);
  const weeklyHighLeaders = Array.from(weeklyHighTally.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  return (
    <main className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="mb-2 text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / Awards & Highs</div>
      <div className="border-b-4 border-[var(--accent)] pb-4">
        <div className="text-xs font-black uppercase tracking-[0.22em] text-[var(--muted)]">League Archive</div>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--text)] sm:text-4xl">Awards & Scoring Highs</h1>
        <p className="mt-2 max-w-4xl text-sm text-[var(--muted)]">The league's annual MVP and Rookie of the Year archive, weekly scoring leaders, and highest single-team scoring weeks. Playoffs and Toilet Bowl games remain separate statistical categories.</p>
      </div>

      <section className="mt-8">
        <h2 className="text-2xl font-black text-[var(--text)]">MVP & Rookie of the Year</h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          {awards.map((season) => (
            <div key={season.season} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <h3 className="text-xl font-black">{season.season} Awards</h3>
              <div className="mt-4">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--muted)]">MVP</div>
                <div className="grid gap-2">{season.mvp.length ? season.mvp.map((winner) => <Winner key={`mvp-${season.season}-${winner.playerId}`} winner={winner} />) : <div className="text-sm text-[var(--muted)]">No MVP data.</div>}</div>
              </div>
              <div className="mt-4">
                <div className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--muted)]">Rookie of the Year</div>
                <div className="grid gap-2">{season.roy.length ? season.roy.map((winner) => <Winner key={`roy-${season.season}-${winner.playerId}`} winner={winner} />) : <div className="text-sm text-[var(--muted)]">No Rookie of the Year data.</div>}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-black text-[var(--text)]">Weekly High Score Leaders</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">Number of regular-season weeks each franchise finished as the league's highest scorer. Tied weekly highs credit each tied franchise.</p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]">
          <table className="w-full">
            <thead><tr className="bg-[var(--surface-strong)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><th className="px-3 py-2">Rk</th><th className="px-3 py-2">Franchise</th><th className="px-3 py-2 text-right">Weekly Highs</th></tr></thead>
            <tbody>{weeklyHighLeaders.map(([teamName, count], index) => <tr key={teamName} className="border-t border-[var(--border)]"><td className="px-3 py-2 text-sm text-[var(--muted)]">{index + 1}</td><td className="px-3 py-2"><TeamPill teamName={teamName} /></td><td className="px-3 py-2 text-right font-black tabular-nums">{count}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-black text-[var(--text)]">Highest Scoring Weeks</h2>
        <div className="mt-4 grid gap-6 xl:grid-cols-2">
          <ScoreTable title="Top 10 Regular Season" rows={topScores(scores, 'regular')} />
          <ScoreTable title="Top 10 Playoffs" rows={topScores(scores, 'playoffs')} />
          <ScoreTable title="Top 10 Toilet Bowl" rows={topScores(scores, 'toilet')} />
          <ScoreTable title="Top 10 All Games" rows={topScores(scores)} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-2xl font-black text-[var(--text)]">Weekly Highs by Season</h2>
        <div className="mt-4 space-y-3">
          {completedSeasons.map((season, index) => {
            const rows = highsBySeason.get(season) || [];
            return (
              <details key={season} open={index === 0} className="rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <summary className="cursor-pointer px-4 py-3 font-black">{season} Weekly Highs</summary>
                <div className="overflow-x-auto border-t border-[var(--border)]">
                  <table className="w-full">
                    <thead><tr className="bg-[var(--surface-strong)] text-left text-xs uppercase tracking-wide text-[var(--muted)]"><th className="px-3 py-2">Week</th><th className="px-3 py-2">Franchise</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2">Opponent</th></tr></thead>
                    <tbody>{rows.map((row, rowIndex) => <tr key={`${season}-${row.week}-${row.teamName}-${rowIndex}`} className="border-t border-[var(--border)] text-sm"><td className="px-3 py-2 font-bold">{row.week}</td><td className="px-3 py-2"><TeamPill teamName={row.teamName} /></td><td className="px-3 py-2 text-right font-black tabular-nums">{fmt(row.points)}</td><td className="px-3 py-2">{row.opponent} <span className="text-[var(--muted)]">({fmt(row.opponentPoints)})</span></td></tr>)}</tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </main>
  );
}
