import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import { buildFranchiseHistory, findFranchiseByHistoryId, franchiseHistoryId } from '@/lib/history/league-history';
import { getReadableTextForColors, getTeamColors, getTeamLogoPath } from '@/lib/utils/team-utils';
import type { StatsGameRow } from '@/lib/stats/types';

export const dynamic = 'force-dynamic';

type PageParams = { id: string };

function fmt(value: number, digits = 1): string {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function pct(value: number): string {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function record(w: number, l: number, t: number): string {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`;
}

function gameType(type: string): string {
  if (type === 'regular') return 'Regular';
  if (type === 'playoffs') return 'Playoffs';
  if (type === 'toilet') return 'Toilet Bowl';
  return 'Postseason';
}

function splitRecord(games: StatsGameRow[], teamName: string) {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let pointsFor = 0;
  let pointsAgainst = 0;
  for (const game of games) {
    const isA = game.teamA === teamName;
    pointsFor += isA ? game.scoreA : game.scoreB;
    pointsAgainst += isA ? game.scoreB : game.scoreA;
    if (game.tie) ties += 1;
    else if (game.winner === teamName) wins += 1;
    else losses += 1;
  }
  return { wins, losses, ties, pointsFor, pointsAgainst };
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 space-y-3"><div className="border-b border-[var(--border)] pb-2"><h2 className="text-xl font-black">{title}</h2>{subtitle ? <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p> : null}</div>{children}</section>;
}

function Stat({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-[11px] font-bold uppercase tracking-wide text-[var(--muted)]">{label}</div><div className="mt-1 text-2xl font-black tabular-nums">{value}</div>{note ? <div className="mt-1 text-xs text-[var(--muted)]">{note}</div> : null}</div>;
}

function Th({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap border-b border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-[var(--muted)] ${className}`}>{children}</th>;
}

function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-sm ${className}`}>{children}</td>;
}

function Table({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--surface)]"><table className="w-full">{children}</table></div>;
}

export async function generateMetadata({ params }: { params: Promise<PageParams> }): Promise<Metadata> {
  const { id } = await params;
  const dataset = await getLeagueStatsDatasetV3();
  const franchise = findFranchiseByHistoryId(dataset, id);
  return { title: franchise ? `${franchise.teamName} History — East v. West` : 'Franchise Not Found — East v. West' };
}

export default async function FranchiseHistoryPage({ params }: { params: Promise<PageParams> }) {
  const { id } = await params;
  const dataset = await getLeagueStatsDatasetV3();
  const franchise = findFranchiseByHistoryId(dataset, id);
  if (!franchise) notFound();
  const history = buildFranchiseHistory(dataset, franchise);
  const colors = getTeamColors(franchise.teamName);
  const headerText = getReadableTextForColors([colors.primary, colors.secondary]);
  const regularGames = franchise.regularWins + franchise.regularLosses + franchise.regularTies;
  const toiletGames = dataset.games.filter((game) => game.gameType === 'toilet' && (game.teamA === franchise.teamName || game.teamB === franchise.teamName));
  const toilet = splitRecord(toiletGames, franchise.teamName);

  return (
    <main className="container mx-auto max-w-[1500px] px-4 py-8">
      <div className="text-sm text-[var(--muted)]"><Link href="/history" className="hover:underline">History</Link> / <Link href="/history/franchises" className="hover:underline">Franchises</Link> / {franchise.teamName}</div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center" style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`, color: headerText }}>
          <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-white/90 p-2">
            <Image src={getTeamLogoPath(franchise.teamName)} alt={`${franchise.teamName} logo`} fill sizes="96px" className="object-contain p-2" priority />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-black uppercase tracking-[0.2em] opacity-80">East v. West Franchise History</div>
            <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{franchise.teamName}</h1>
            <div className="mt-2 text-sm font-semibold opacity-90">{franchise.firstSeason === franchise.lastSeason ? franchise.firstSeason : `${franchise.firstSeason}–${franchise.lastSeason}`} · {regularGames} regular-season games · {franchise.titles} championship{franchise.titles === 1 ? '' : 's'}</div>
          </div>
          {franchise.currentRosterId != null ? <Link href={`/teams/${franchise.currentRosterId}`} className="rounded-lg border border-white/50 bg-black/15 px-4 py-2 text-sm font-bold backdrop-blur-sm hover:bg-black/25">Current team page →</Link> : null}
        </div>
        <nav className="flex gap-1 overflow-x-auto bg-[var(--surface)] px-3" aria-label="Franchise history sections">
          {['overview', 'seasons', 'players', 'games', 'records', 'honors', 'milestones'].map((anchor) => <a key={anchor} href={`#${anchor}`} className="whitespace-nowrap border-b-2 border-transparent px-3 py-3 text-sm font-bold capitalize text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--text)]">{anchor}</a>)}
        </nav>
      </div>

      <div className="mt-8 space-y-10">
        <Section id="overview" title="Franchise Overview" subtitle="Regular season, championship playoffs and Toilet Bowl are tracked separately.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <Stat label="Regular Record" value={record(franchise.regularWins, franchise.regularLosses, franchise.regularTies)} note={pct(franchise.regularWinPct)} />
            <Stat label="Points For" value={fmt(franchise.regularPointsFor)} note={`${fmt(franchise.avgScore)} per game`} />
            <Stat label="Points Against" value={fmt(franchise.regularPointsAgainst)} />
            <Stat label="Playoff Record" value={record(franchise.playoffWins, franchise.playoffLosses, franchise.playoffTies)} note="Championship path only" />
            <Stat label="Toilet Bowl" value={record(toilet.wins, toilet.losses, toilet.ties)} note={toiletGames.length ? `${fmt(toilet.pointsFor)} PF` : 'No games'} />
            <Stat label="Championships" value={franchise.titles} note={history.championshipYears.join(', ') || 'None'} />
            <Stat label="Title Games" value={franchise.championshipAppearances} note={history.runnerUpYears.length ? `Runner-up: ${history.runnerUpYears.join(', ')}` : undefined} />
          </div>
        </Section>

        <Section id="seasons" title="Season History" subtitle="Regular-season, championship-playoff and Toilet Bowl records are separated by year.">
          <Table><thead><tr><Th>Season</Th><Th>Regular</Th><Th className="text-right">Win %</Th><Th className="text-right">PF</Th><Th className="text-right">PA</Th><Th className="text-right">Avg</Th><Th>Playoffs</Th><Th>Toilet Bowl</Th><Th>Finish</Th></tr></thead><tbody>{history.seasons.map((row) => {
            const seasonToiletGames = dataset.games.filter((game) => game.season === row.regular.season && game.gameType === 'toilet' && (game.teamA === franchise.teamName || game.teamB === franchise.teamName));
            const seasonToilet = splitRecord(seasonToiletGames, franchise.teamName);
            return <tr key={row.regular.season}><Td className="font-bold">{row.regular.season}</Td><Td>{record(row.regular.wins, row.regular.losses, row.regular.ties)}</Td><Td className="text-right">{pct(row.regular.winPct)}</Td><Td className="text-right tabular-nums">{fmt(row.regular.pointsFor)}</Td><Td className="text-right tabular-nums">{fmt(row.regular.pointsAgainst)}</Td><Td className="text-right tabular-nums">{fmt(row.regular.avgScore)}</Td><Td>{record(row.playoffWins, row.playoffLosses, row.playoffTies)}</Td><Td>{seasonToiletGames.length ? record(seasonToilet.wins, seasonToilet.losses, seasonToilet.ties) : '—'}</Td><Td className="font-semibold">{row.finish || '—'}</Td></tr>;
          })}</tbody></Table>
        </Section>

        <Section id="players" title="Franchise Player Leaders" subtitle="EVW points are attributed only to weeks the player was rostered by this franchise.">
          <Table><thead><tr><Th>Rk</Th><Th>Player</Th><Th>Pos</Th><Th>Seasons</Th><Th className="text-right">Wks</Th><Th className="text-right">Starts</Th><Th className="text-right">Pts</Th><Th className="text-right">Pts/Wk</Th></tr></thead><tbody>{history.players.slice(0, 100).map((row, index) => <tr key={row.playerId}><Td>{index + 1}</Td><Td><Link href={`/players/${row.playerId}`} className="font-bold text-[var(--accent)] hover:underline">{row.name}</Link></Td><Td>{row.position}</Td><Td>{row.seasons.join(', ') || '—'}</Td><Td className="text-right">{row.rosteredWeeks}</Td><Td className="text-right">{row.starts}</Td><Td className="text-right font-bold tabular-nums">{fmt(row.points)}</Td><Td className="text-right tabular-nums">{row.rosteredWeeks ? fmt(row.points / row.rosteredWeeks) : '—'}</Td></tr>)}</tbody></Table>
        </Section>

        <Section id="games" title="Game Archive" subtitle="Regular season, championship playoffs, Toilet Bowl and placement games are labeled separately.">
          <Table><thead><tr><Th>Season</Th><Th>Week</Th><Th>Type</Th><Th>Result</Th><Th>Opponent</Th><Th className="text-right">PF</Th><Th className="text-right">PA</Th><Th className="text-right">Margin</Th><Th>Gamebook</Th></tr></thead><tbody>{history.games.map((game) => <tr key={game.id}><Td>{game.season}</Td><Td>{game.week}</Td><Td>{gameType(game.gameType)}</Td><Td className={game.result === 'W' ? 'font-black' : ''}>{game.result}</Td><Td>{game.opponent}</Td><Td className="text-right tabular-nums">{fmt(game.pointsFor, 2)}</Td><Td className="text-right tabular-nums">{fmt(game.pointsAgainst, 2)}</Td><Td className="text-right tabular-nums">{fmt(game.margin, 2)}</Td><Td><Link href={`/history/gamebook/${game.season}/${game.week}`} className="font-semibold text-[var(--accent)] hover:underline">Week {game.week} →</Link></Td></tr>)}</tbody></Table>
        </Section>

        <Section id="records" title="Franchise Records">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{history.records.map((row) => <Stat key={row.label} label={row.label} value={row.value} note={row.note} />)}</div>
        </Section>

        <Section id="honors" title="Honors & All-EVW Selections" subtitle="All-EVW teams are selected from regular-season, ownership-attributed EVW scoring.">
          <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <Stat label="Championship Seasons" value={history.championshipYears.length} note={history.championshipYears.join(', ') || 'None'} />
              <Stat label="Runner-up Seasons" value={history.runnerUpYears.length} note={history.runnerUpYears.join(', ') || 'None'} />
              <Link href="/history/all-evw" className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-bold text-[var(--accent)] hover:underline">View complete All-EVW archive →</Link>
            </div>
            <Table><thead><tr><Th>Season</Th><Th>Team</Th><Th>Slot</Th><Th>Player</Th><Th>Pos</Th><Th className="text-right">Pts</Th></tr></thead><tbody>{history.allEvw.length ? history.allEvw.map((row) => <tr key={`${row.season}-${row.team}-${row.slot}-${row.playerId}`}><Td>{row.season}</Td><Td>{row.team}</Td><Td>{row.slot}</Td><Td><Link href={`/players/${row.playerId}`} className="font-bold text-[var(--accent)] hover:underline">{row.name}</Link></Td><Td>{row.position}</Td><Td className="text-right font-bold tabular-nums">{fmt(row.points)}</Td></tr>) : <tr><td colSpan={6} className="p-5 text-center text-sm text-[var(--muted)]">No All-EVW selections in the available seasons.</td></tr>}</tbody></Table>
          </div>
        </Section>

        <Section id="milestones" title="Franchise Milestones" subtitle="Automatic career, franchise, record and championship milestones connected to this franchise.">
          <div className="grid gap-3 md:grid-cols-2">{history.milestones.length ? history.milestones.map((item) => <div key={item.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"><div className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">{item.season}{item.week ? ` · Week ${item.week}` : ''} · {item.type}</div><div className="mt-1 font-black">{item.title}</div><div className="mt-1 text-sm text-[var(--muted)]">{item.detail}</div>{item.week ? <Link href={`/history/gamebook/${item.season}/${item.week}`} className="mt-2 inline-block text-xs font-bold text-[var(--accent)] hover:underline">Open that week →</Link> : null}</div>) : <div className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm text-[var(--muted)]">No qualifying milestones yet.</div>}</div>
          <Link href="/history/milestones" className="inline-block text-sm font-bold text-[var(--accent)] hover:underline">View league-wide milestones →</Link>
        </Section>
      </div>

      <div className="mt-10 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">Franchise history ID: {franchiseHistoryId(franchise)} · Generated {new Date(dataset.generatedAt).toLocaleString()}.</div>
    </main>
  );
}
