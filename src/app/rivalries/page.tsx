import Image from 'next/image';
import { unstable_cache } from 'next/cache';
import SectionHeader from '@/components/ui/SectionHeader';
import { CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import { getTeamColors, getTeamLogoPath, resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import { getLatestCycle, getPairsForCycle } from '@/server/db/rivalry-queries';
import type { RivalryPair } from '@/lib/rivalry/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SleeperRoster = {
  roster_id: number;
  owner_id: string;
  metadata?: Record<string, string | null | undefined> | null;
};

type SleeperUser = {
  user_id: string;
  display_name?: string | null;
  username?: string | null;
  metadata?: Record<string, string | null | undefined> | null;
};

type SleeperMatchup = {
  matchup_id?: number | null;
  roster_id: number;
  points?: number | null;
  custom_points?: number | null;
};

type RivalryGame = {
  season: string;
  week: number;
  teamAPoints: number;
  teamBPoints: number;
  completed: boolean;
  rivalryWeek: boolean;
  winner: string | null;
  margin: number;
  combined: number;
};

type RivalryStats = {
  pair: RivalryPair;
  games: RivalryGame[];
  upcoming: RivalryGame[];
  teamAWins: number;
  teamBWins: number;
  ties: number;
  teamAPoints: number;
  teamBPoints: number;
  rivalryWeekAWins: number;
  rivalryWeekBWins: number;
  rivalryWeekTies: number;
  averageMargin: number;
  largestWin: RivalryGame | null;
  closestGame: RivalryGame | null;
  highestCombined: RivalryGame | null;
  latestMeeting: RivalryGame | null;
  streakTeam: string | null;
  streakLength: number;
};

type RivalryHubData = {
  rivalries: RivalryStats[];
  generatedAt: string;
  partial: boolean;
};

const RIVALRY_WEEKS = new Set([3, 14]);

const FALLBACK_PAIRS: RivalryPair[] = [
  {
    cycleId: 'permanent-rivalries',
    teamAId: 'BeerNeverBrokeMyHeart',
    teamBId: 'Cascade Marauders',
    teamAScoreForB: 0,
    teamBScoreForA: 0,
    combinedScore: 0,
    isBloodFeud: false,
    status: 'active',
  },
  {
    cycleId: 'permanent-rivalries',
    teamAId: 'Bimg Bamg Boomg',
    teamBId: 'bop pop',
    teamAScoreForB: 0,
    teamBScoreForA: 0,
    combinedScore: 0,
    isBloodFeud: false,
    status: 'active',
  },
  {
    cycleId: 'permanent-rivalries',
    teamAId: 'Double Trouble',
    teamBId: 'Elemental Heroes',
    teamAScoreForB: 0,
    teamBScoreForA: 0,
    combinedScore: 0,
    isBloodFeud: false,
    status: 'active',
  },
  {
    cycleId: 'permanent-rivalries',
    teamAId: 'Belleview Badgers',
    teamBId: 'Belltown Raptors',
    teamAScoreForB: 0,
    teamBScoreForA: 0,
    combinedScore: 0,
    isBloodFeud: false,
    status: 'active',
  },
  {
    cycleId: 'permanent-rivalries',
    teamAId: 'Red Pandas',
    teamBId: 'The Lone Ginger',
    teamAScoreForB: 0,
    teamBScoreForA: 0,
    combinedScore: 0,
    isBloodFeud: false,
    status: 'active',
  },
  {
    cycleId: 'permanent-rivalries',
    teamAId: 'Detroit Dawgs',
    teamBId: 'Mt. Lebanon Cake Eaters',
    teamAScoreForB: 0,
    teamBScoreForA: 0,
    combinedScore: 0,
    isBloodFeud: false,
    status: 'active',
  },
];

function pairKey(a: string, b: string): string {
  return [a, b].sort((left, right) => left.localeCompare(right)).join('::');
}

const PAIR_ORDER = new Map(FALLBACK_PAIRS.map((pair, index) => [pairKey(pair.teamAId, pair.teamBId), index]));

function orientPair(pair: RivalryPair): RivalryPair {
  const fallback = FALLBACK_PAIRS.find((item) => pairKey(item.teamAId, item.teamBId) === pairKey(pair.teamAId, pair.teamBId));
  if (!fallback || pair.teamAId === fallback.teamAId) return pair;
  return {
    ...pair,
    teamAId: pair.teamBId,
    teamBId: pair.teamAId,
    teamAScoreForB: Number(pair.teamBScoreForA || 0),
    teamBScoreForA: Number(pair.teamAScoreForB || 0),
  };
}

async function sleeperJson<T>(path: string, revalidate = 900): Promise<T> {
  const response = await fetch(`https://api.sleeper.app/v1${path}`, {
    next: { revalidate },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`Sleeper request failed: ${path} (${response.status})`);
  return response.json() as Promise<T>;
}

async function getPermanentPairs(): Promise<RivalryPair[]> {
  try {
    const cycle = await getLatestCycle();
    if (cycle) {
      const stored = await getPairsForCycle(cycle.id);
      const active = stored.filter((pair) => pair.status === 'active' || pair.status === 'proposed');
      if (active.length === 6) {
        return active
          .map((pair) => orientPair({
            ...pair,
            teamAScoreForB: Number(pair.teamAScoreForB || 0),
            teamBScoreForA: Number(pair.teamBScoreForA || 0),
            combinedScore: Number(pair.combinedScore || 0),
          }))
          .sort((a, b) => (PAIR_ORDER.get(pairKey(a.teamAId, a.teamBId)) ?? 99) - (PAIR_ORDER.get(pairKey(b.teamAId, b.teamBId)) ?? 99));
      }
    }
  } catch (error) {
    console.error('[rivalries] Unable to read stored permanent pairings', error);
  }
  return FALLBACK_PAIRS;
}

function pointsFor(matchup: SleeperMatchup): number {
  const value = matchup.custom_points ?? matchup.points ?? 0;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function emptyStats(pair: RivalryPair): RivalryStats {
  return {
    pair,
    games: [],
    upcoming: [],
    teamAWins: 0,
    teamBWins: 0,
    ties: 0,
    teamAPoints: 0,
    teamBPoints: 0,
    rivalryWeekAWins: 0,
    rivalryWeekBWins: 0,
    rivalryWeekTies: 0,
    averageMargin: 0,
    largestWin: null,
    closestGame: null,
    highestCombined: null,
    latestMeeting: null,
    streakTeam: null,
    streakLength: 0,
  };
}

function calculateStats(pair: RivalryPair, allGames: RivalryGame[]): RivalryStats {
  const completed = allGames
    .filter((game) => game.completed)
    .sort((a, b) => Number(a.season) - Number(b.season) || a.week - b.week);
  const upcoming = allGames
    .filter((game) => !game.completed)
    .sort((a, b) => Number(a.season) - Number(b.season) || a.week - b.week);

  const stats = emptyStats(pair);
  stats.games = [...completed].reverse();
  stats.upcoming = upcoming;

  for (const game of completed) {
    stats.teamAPoints += game.teamAPoints;
    stats.teamBPoints += game.teamBPoints;
    if (game.winner === pair.teamAId) stats.teamAWins += 1;
    else if (game.winner === pair.teamBId) stats.teamBWins += 1;
    else stats.ties += 1;

    if (game.rivalryWeek) {
      if (game.winner === pair.teamAId) stats.rivalryWeekAWins += 1;
      else if (game.winner === pair.teamBId) stats.rivalryWeekBWins += 1;
      else stats.rivalryWeekTies += 1;
    }

    if (!stats.largestWin || game.margin > stats.largestWin.margin) stats.largestWin = game;
    if (!stats.closestGame || game.margin < stats.closestGame.margin) stats.closestGame = game;
    if (!stats.highestCombined || game.combined > stats.highestCombined.combined) stats.highestCombined = game;
  }

  stats.latestMeeting = completed.length ? completed[completed.length - 1] : null;
  stats.averageMargin = completed.length
    ? completed.reduce((sum, game) => sum + game.margin, 0) / completed.length
    : 0;

  const newest = [...completed].reverse();
  const firstWinner = newest[0]?.winner ?? null;
  if (firstWinner) {
    stats.streakTeam = firstWinner;
    for (const game of newest) {
      if (game.winner !== firstWinner) break;
      stats.streakLength += 1;
    }
  }

  return stats;
}

async function loadRivalryHub(): Promise<RivalryHubData> {
  const pairs = await getPermanentPairs();
  const pairMap = new Map(pairs.map((pair) => [pairKey(pair.teamAId, pair.teamBId), pair]));
  const gamesByPair = new Map(pairs.map((pair) => [pairKey(pair.teamAId, pair.teamBId), [] as RivalryGame[]]));
  let partial = false;

  let nflSeason = CURRENT_SEASON;
  let nflWeek = 0;
  try {
    const state = await sleeperJson<{ season?: string; week?: number; display_week?: number }>('/state/nfl', 300);
    nflSeason = String(state.season || CURRENT_SEASON);
    nflWeek = Number(state.week ?? state.display_week ?? 0);
  } catch {
    partial = true;
  }

  const configured: Array<[string, string]> = [
    ...Object.entries(LEAGUE_IDS.PREVIOUS),
    [CURRENT_SEASON, LEAGUE_IDS.CURRENT],
  ];
  const seenLeagueIds = new Set<string>();
  const seasons = configured
    .filter(([, leagueId]) => {
      if (!leagueId || seenLeagueIds.has(leagueId)) return false;
      seenLeagueIds.add(leagueId);
      return true;
    })
    .sort((a, b) => Number(a[0]) - Number(b[0]));

  for (const [season, leagueId] of seasons) {
    try {
      const weekRequests = Array.from({ length: 17 }, (_, index) =>
        sleeperJson<SleeperMatchup[]>(`/league/${leagueId}/matchups/${index + 1}`),
      );
      const [rosters, users, ...weeks] = await Promise.all([
        sleeperJson<SleeperRoster[]>(`/league/${leagueId}/rosters`, 3600),
        sleeperJson<SleeperUser[]>(`/league/${leagueId}/users`, 3600),
        ...weekRequests,
      ]);

      const usersById = new Map(users.map((user) => [user.user_id, user]));
      const teamByRoster = new Map<number, string>();
      for (const roster of rosters) {
        const user = usersById.get(roster.owner_id);
        teamByRoster.set(roster.roster_id, resolveCanonicalTeamName({
          ownerId: roster.owner_id,
          rosterTeamName: roster.metadata?.team_name ?? roster.metadata?.team_name_update,
          userDisplayName: user?.display_name,
          username: user?.username,
        }));
      }

      weeks.forEach((matchups, weekIndex) => {
        const week = weekIndex + 1;
        const grouped = new Map<number, SleeperMatchup[]>();
        for (const matchup of matchups) {
          if (typeof matchup.matchup_id !== 'number') continue;
          const rows = grouped.get(matchup.matchup_id) ?? [];
          rows.push(matchup);
          grouped.set(matchup.matchup_id, rows);
        }

        for (const rows of grouped.values()) {
          if (rows.length < 2) continue;
          const [left, right] = rows;
          const leftTeam = teamByRoster.get(left.roster_id);
          const rightTeam = teamByRoster.get(right.roster_id);
          if (!leftTeam || !rightTeam || leftTeam === 'Unknown Team' || rightTeam === 'Unknown Team') continue;

          const key = pairKey(leftTeam, rightTeam);
          const pair = pairMap.get(key);
          if (!pair) continue;

          const leftPoints = pointsFor(left);
          const rightPoints = pointsFor(right);
          const aOnLeft = leftTeam === pair.teamAId;
          const teamAPoints = aOnLeft ? leftPoints : rightPoints;
          const teamBPoints = aOnLeft ? rightPoints : leftPoints;
          const hasScoring = teamAPoints !== 0 || teamBPoints !== 0;
          const seasonIsPast = Number(season) < Number(nflSeason);
          const weekIsPast = Number(season) === Number(nflSeason) && nflWeek > 0 && week < nflWeek;
          const completed = hasScoring && (seasonIsPast || weekIsPast);
          const winner = completed
            ? teamAPoints > teamBPoints
              ? pair.teamAId
              : teamBPoints > teamAPoints
                ? pair.teamBId
                : null
            : null;

          gamesByPair.get(key)?.push({
            season,
            week,
            teamAPoints,
            teamBPoints,
            completed,
            rivalryWeek: RIVALRY_WEEKS.has(week),
            winner,
            margin: Math.abs(teamAPoints - teamBPoints),
            combined: teamAPoints + teamBPoints,
          });
        }
      });
    } catch (error) {
      partial = true;
      console.error(`[rivalries] Unable to load ${season} matchup history`, error);
    }
  }

  return {
    rivalries: pairs.map((pair) => calculateStats(pair, gamesByPair.get(pairKey(pair.teamAId, pair.teamBId)) ?? [])),
    generatedAt: new Date().toISOString(),
    partial,
  };
}

const getRivalryHub = unstable_cache(loadRivalryHub, ['permanent-rivalry-hub-v1'], { revalidate: 900 });

function formatPoints(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function recordLabel(aWins: number, bWins: number, ties: number): string {
  return ties > 0 ? `${aWins}-${bWins}-${ties}` : `${aWins}-${bWins}`;
}

function gameLabel(game: RivalryGame | null, pair: RivalryPair): string {
  if (!game) return 'No completed meetings';
  const winner = game.winner ?? 'Tie';
  return `${winner} · ${formatPoints(game.teamAPoints)}–${formatPoints(game.teamBPoints)} · ${game.season} W${game.week}`;
}

function TeamSide({ team, wins, points, align }: { team: string; wins: number; points: number; align: 'left' | 'right' }) {
  const colors = getTeamColors(team);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-3 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <div
        className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-lg sm:h-20 sm:w-20"
        style={{ background: colors.primary, boxShadow: `0 10px 24px ${colors.primary}35, inset 0 0 0 1px rgba(255,255,255,.12)` }}
      >
        <Image src={getTeamLogoPath(team)} alt={`${team} logo`} width={72} height={72} className="h-[86%] w-[86%] object-contain" />
      </div>
      <div className="min-w-0">
        <h2 className="text-base font-black leading-tight text-[var(--text)] sm:text-xl">{team}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          <span><strong className="text-[var(--text)]">{wins}</strong> series wins</span>
          <span>{formatPoints(points)} points</span>
        </div>
        <div className="mt-2 h-1 w-16 rounded-full" style={{ background: colors.secondary || colors.primary, marginLeft: align === 'right' ? 'auto' : undefined }} />
      </div>
    </div>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">{label}</div>
      <div className="mt-1 text-lg font-black text-[var(--text)]">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-[var(--muted)]">{detail}</div> : null}
    </div>
  );
}

function RivalryCard({ rivalry, index }: { rivalry: RivalryStats; index: number }) {
  const { pair } = rivalry;
  const aColors = getTeamColors(pair.teamAId);
  const bColors = getTeamColors(pair.teamBId);
  const meetings = rivalry.teamAWins + rivalry.teamBWins + rivalry.ties;
  const seriesLeader = rivalry.teamAWins === rivalry.teamBWins
    ? 'Series tied'
    : rivalry.teamAWins > rivalry.teamBWins
      ? `${pair.teamAId} leads`
      : `${pair.teamBId} leads`;
  const rivalryMeetings = rivalry.rivalryWeekAWins + rivalry.rivalryWeekBWins + rivalry.rivalryWeekTies;
  const streak = rivalry.streakTeam
    ? `${rivalry.streakTeam} ${rivalry.streakLength}`
    : meetings > 0
      ? 'No active streak'
      : 'Series begins in 2026';

  return (
    <article
      id={`rivalry-${index + 1}`}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-[var(--border)] shadow-xl"
      style={{ background: `linear-gradient(108deg, ${aColors.primary}20 0%, ${aColors.primary}0d 42%, #101827 42%, #101827 58%, ${bColors.primary}0d 58%, ${bColors.primary}20 100%)` }}
    >
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${aColors.primary}, ${aColors.secondary || aColors.primary} 43%, ${bColors.secondary || bColors.primary} 57%, ${bColors.primary})` }} />
      <div className="px-4 pb-4 pt-3 sm:px-6 sm:pb-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-[var(--muted)]">Matchup {index + 1}</div>
          <div className="flex items-center gap-2">
            {pair.isBloodFeud ? (
              <span className="rounded-full border border-amber-400/50 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-amber-300">Blood Feud</span>
            ) : null}
            <span className="rounded-full border border-[var(--border)] bg-black/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Permanent</span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-6">
          <TeamSide team={pair.teamAId} wins={rivalry.teamAWins} points={rivalry.teamAPoints} align="left" />
          <div className="shrink-0 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/70 bg-black/35 text-sm font-black text-white shadow-lg sm:h-14 sm:w-14">VS</div>
            <div className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">{meetings} meetings</div>
          </div>
          <TeamSide team={pair.teamBId} wins={rivalry.teamBWins} points={rivalry.teamBPoints} align="right" />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatTile label="All-time series" value={recordLabel(rivalry.teamAWins, rivalry.teamBWins, rivalry.ties)} detail={seriesLeader} />
          <StatTile label="Weeks 3 & 14" value={rivalryMeetings ? recordLabel(rivalry.rivalryWeekAWins, rivalry.rivalryWeekBWins, rivalry.rivalryWeekTies) : '—'} detail={rivalryMeetings ? `${rivalryMeetings} games in rivalry-week slots` : 'No completed games yet'} />
          <StatTile label="Current streak" value={streak} detail={rivalry.latestMeeting ? `Last met ${rivalry.latestMeeting.season} W${rivalry.latestMeeting.week}` : undefined} />
          <StatTile label="Average margin" value={meetings ? formatPoints(rivalry.averageMargin) : '—'} detail="Points per completed meeting" />
        </div>

        <details className="group mt-4 rounded-xl border border-[var(--border)] bg-black/15">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-bold text-[var(--text)]">
            <span>View full rivalry dossier</span>
            <span className="text-xs text-[var(--muted)] transition-transform group-open:rotate-180">▼</span>
          </summary>
          <div className="border-t border-[var(--border)] px-4 py-4 sm:px-5">
            <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <section>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">How the rivalry was formed</div>
                <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 p-4">
                  {pair.combinedScore > 0 ? (
                    <>
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--muted)]">{pair.teamAId} assigned</span>
                        <strong className="text-[var(--text)]">{pair.teamAScoreForB}</strong>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                        <span className="text-[var(--muted)]">{pair.teamBId} assigned</span>
                        <strong className="text-[var(--text)]">{pair.teamBScoreForA}</strong>
                      </div>
                      <div className="mt-3 border-t border-[var(--border)] pt-3 text-center">
                        <div className="text-3xl font-black text-[var(--text)]">{pair.combinedScore}</div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Combined rivalry strength</div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm leading-relaxed text-[var(--muted)]">This permanent pairing was established through the league’s Rivalry Strength process.</p>
                  )}
                </div>
              </section>

              <section>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Series benchmarks</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <StatTile label="Closest finish" value={rivalry.closestGame ? formatPoints(rivalry.closestGame.margin) : '—'} detail={gameLabel(rivalry.closestGame, pair)} />
                  <StatTile label="Largest win" value={rivalry.largestWin ? formatPoints(rivalry.largestWin.margin) : '—'} detail={gameLabel(rivalry.largestWin, pair)} />
                  <StatTile label="Highest combined" value={rivalry.highestCombined ? formatPoints(rivalry.highestCombined.combined) : '—'} detail={gameLabel(rivalry.highestCombined, pair)} />
                </div>
              </section>
            </div>

            {rivalry.upcoming.length > 0 ? (
              <section className="mt-5">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Next chapters</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {rivalry.upcoming.map((game) => (
                    <div key={`${game.season}-${game.week}`} className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/70 px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <strong className="text-sm text-[var(--text)]">{game.season} · Week {game.week}</strong>
                        {game.rivalryWeek ? <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">Rivalry Week</span> : null}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">Scheduled matchup</div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="mt-5">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">Complete matchup history</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">All recorded Sleeper meetings, newest first.</div>
                </div>
                <div className="text-xs font-semibold text-[var(--text)]">{meetings} games</div>
              </div>
              {rivalry.games.length > 0 ? (
                <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--border)]">
                  <table className="w-full min-w-[650px] text-left text-sm">
                    <thead className="bg-black/20 text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
                      <tr>
                        <th className="px-3 py-2.5">Season</th>
                        <th className="px-3 py-2.5">Week</th>
                        <th className="px-3 py-2.5">{pair.teamAId}</th>
                        <th className="px-3 py-2.5">{pair.teamBId}</th>
                        <th className="px-3 py-2.5">Result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rivalry.games.map((game) => (
                        <tr key={`${game.season}-${game.week}`} className="border-t border-[var(--border)] bg-[var(--surface)]/50">
                          <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{game.season}</td>
                          <td className="px-3 py-2.5 text-[var(--muted)]">
                            <span>Week {game.week}</span>
                            {game.rivalryWeek ? <span className="ml-2 rounded bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">Rivalry</span> : null}
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{formatPoints(game.teamAPoints)}</td>
                          <td className="px-3 py-2.5 font-semibold text-[var(--text)]">{formatPoints(game.teamBPoints)}</td>
                          <td className="px-3 py-2.5 text-[var(--muted)]">{game.winner ? `${game.winner} by ${formatPoints(game.margin)}` : 'Tie'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--muted)]">No completed meetings are available yet.</div>
              )}
            </section>
          </div>
        </details>
      </div>
    </article>
  );
}

export default async function RivalriesPage() {
  const hub = await getRivalryHub();
  const allGames = hub.rivalries.flatMap((rivalry) => rivalry.games);
  const closestSeries = [...hub.rivalries]
    .filter((rivalry) => rivalry.games.length > 0)
    .sort((a, b) => Math.abs(a.teamAWins - a.teamBWins) - Math.abs(b.teamAWins - b.teamBWins) || b.games.length - a.games.length)[0];
  const mostMeetings = [...hub.rivalries].sort((a, b) => b.games.length - a.games.length)[0];
  const highestScoring = [...allGames].sort((a, b) => b.combined - a.combined)[0];
  const largestMargin = [...allGames].sort((a, b) => b.margin - a.margin)[0];

  const pairForGame = (game: RivalryGame | undefined) => hub.rivalries.find((rivalry) => rivalry.games.includes(game as RivalryGame));
  const highestPair = pairForGame(highestScoring);
  const marginPair = pairForGame(largestMargin);

  return (
    <main className="container mx-auto px-4 py-8" data-rivalry-hub="permanent">
      <SectionHeader
        title="Rivalries"
        subtitle="Permanent matchups, all-time series history, and the next chapter of Rivalry Week."
      />

      <section className="mb-8 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
        <div className="h-1 bg-gradient-to-r from-sky-500 via-amber-400 to-rose-500" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
          <StatTile label="Permanent rivalries" value="6" detail="Every team has one locked rival" />
          <StatTile label="Rivalry weeks" value="3 & 14" detail="Two regular-season meetings" />
          <StatTile label="League teams" value="12" detail="Six head-to-head pairings" />
          <StatTile label="Rivalries established" value="2026" detail="Set by the Rivalry Strength process" />
        </div>
      </section>

      {hub.partial ? (
        <div className="mb-6 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Some historical Sleeper data could not be loaded. The permanent pairings remain available, and the page will retry automatically after the cache refreshes.
        </div>
      ) : null}

      <section className="mb-8">
        <div className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">League rivalry snapshot</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Closest series"
            value={closestSeries ? recordLabel(closestSeries.teamAWins, closestSeries.teamBWins, closestSeries.ties) : '—'}
            detail={closestSeries ? `${closestSeries.pair.teamAId} vs. ${closestSeries.pair.teamBId}` : 'No completed meetings'}
          />
          <StatTile
            label="Most meetings"
            value={mostMeetings?.games.length ? String(mostMeetings.games.length) : '—'}
            detail={mostMeetings?.games.length ? `${mostMeetings.pair.teamAId} vs. ${mostMeetings.pair.teamBId}` : 'No completed meetings'}
          />
          <StatTile
            label="Highest-scoring meeting"
            value={highestScoring ? formatPoints(highestScoring.combined) : '—'}
            detail={highestScoring && highestPair ? `${highestPair.pair.teamAId} vs. ${highestPair.pair.teamBId} · ${highestScoring.season} W${highestScoring.week}` : 'No completed meetings'}
          />
          <StatTile
            label="Largest margin"
            value={largestMargin ? formatPoints(largestMargin.margin) : '—'}
            detail={largestMargin && marginPair ? `${marginPair.pair.teamAId} vs. ${marginPair.pair.teamBId} · ${largestMargin.season} W${largestMargin.week}` : 'No completed meetings'}
          />
        </div>
      </section>

      <nav className="mb-6 flex gap-2 overflow-x-auto pb-2" aria-label="Jump to a rivalry">
        {hub.rivalries.map((rivalry, index) => (
          <a
            key={pairKey(rivalry.pair.teamAId, rivalry.pair.teamBId)}
            href={`#rivalry-${index + 1}`}
            className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--text)]"
          >
            Matchup {index + 1}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        {hub.rivalries.map((rivalry, index) => (
          <RivalryCard key={pairKey(rivalry.pair.teamAId, rivalry.pair.teamBId)} rivalry={rivalry} index={index} />
        ))}
      </div>

      <section className="mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--muted)]">How Rivalry Week works</div>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[var(--muted)]">
          These pairings are permanent. Each team plays its assigned rival in Weeks 3 and 14 of the regular season. The pairings were established through the league’s Rivalry Strength system, including mutual scores and automatic Blood Feuds where applicable. Historical records above include every completed Sleeper matchup between the paired franchises; the Weeks 3 and 14 split isolates games played in the league’s rivalry-week slots.
        </p>
      </section>
    </main>
  );
}
