'use client';

import { useMemo, useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

export type PlayoffLabTeam = {
  rosterId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  gamesPlayed: number;
  ppg: number;
  scoreStdDev: number;
};

export type PlayoffLabGame = {
  id: string;
  week: number;
  aRosterId: number;
  aTeam: string;
  bRosterId: number;
  bTeam: string;
};

type Props = {
  teams: PlayoffLabTeam[];
  games: PlayoffLabGame[];
  playoffTeams: number;
  scenarioStartWeek: number;
  regularSeasonEnd: number;
  completedWeeks: number;
};

type SimulationRow = PlayoffLabTeam & {
  playoffPct: number;
  avgSeed: number | null;
};

type MathStatus = 'clinched' | 'eliminated' | 'alive';

type TeamMathScenario = {
  rosterId: number;
  status: MathStatus;
  clinchPaths: string[];
  eliminationPaths: string[];
};

function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(random: () => number) {
  const u = Math.max(1e-9, random());
  const v = Math.max(1e-9, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function simulate(
  teams: PlayoffLabTeam[],
  games: PlayoffLabGame[],
  picks: Record<string, number | null>,
  playoffTeams: number,
): SimulationRow[] {
  const iterations = 3000;
  const madePlayoffs = new Map<number, number>();
  const seedTotal = new Map<number, number>();
  const seedCount = new Map<number, number>();
  const pickKey = Object.entries(picks).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v ?? 'auto'}`).join('|');
  const random = mulberry32(hashString(pickKey || 'baseline'));

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const state = new Map(teams.map((team) => [team.rosterId, {
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: team.pointsFor,
    }]));
    const profile = new Map(teams.map((team) => [team.rosterId, team]));

    for (const game of games) {
      const a = state.get(game.aRosterId);
      const b = state.get(game.bRosterId);
      const aProfile = profile.get(game.aRosterId);
      const bProfile = profile.get(game.bRosterId);
      if (!a || !b || !aProfile || !bProfile) continue;

      let aScore = Math.max(0, aProfile.ppg + sampleNormal(random) * aProfile.scoreStdDev);
      let bScore = Math.max(0, bProfile.ppg + sampleNormal(random) * bProfile.scoreStdDev);
      const forced = picks[game.id] ?? null;

      if (forced === game.aRosterId && aScore <= bScore) aScore = bScore + 0.1;
      if (forced === game.bRosterId && bScore <= aScore) bScore = aScore + 0.1;

      a.pointsFor += aScore;
      b.pointsFor += bScore;
      if (Math.abs(aScore - bScore) < 0.001) {
        a.ties += 1;
        b.ties += 1;
      } else if (aScore > bScore) {
        a.wins += 1;
        b.losses += 1;
      } else {
        b.wins += 1;
        a.losses += 1;
      }
    }

    const ranked = [...teams].sort((left, right) => {
      const a = state.get(left.rosterId)!;
      const b = state.get(right.rosterId)!;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.ties !== a.ties) return b.ties - a.ties;
      return b.pointsFor - a.pointsFor;
    });

    ranked.forEach((team, index) => {
      const seed = index + 1;
      if (seed <= playoffTeams) madePlayoffs.set(team.rosterId, (madePlayoffs.get(team.rosterId) || 0) + 1);
      seedTotal.set(team.rosterId, (seedTotal.get(team.rosterId) || 0) + seed);
      seedCount.set(team.rosterId, (seedCount.get(team.rosterId) || 0) + 1);
    });
  }

  return teams
    .map((team) => ({
      ...team,
      playoffPct: ((madePlayoffs.get(team.rosterId) || 0) / iterations) * 100,
      avgSeed: seedCount.get(team.rosterId)
        ? (seedTotal.get(team.rosterId) || 0) / (seedCount.get(team.rosterId) || 1)
        : null,
    }))
    .sort((a, b) => b.playoffPct - a.playoffPct || (a.avgSeed ?? 99) - (b.avgSeed ?? 99));
}

function remainingGameCounts(games: PlayoffLabGame[]) {
  const counts = new Map<number, number>();
  for (const game of games) {
    counts.set(game.aRosterId, (counts.get(game.aRosterId) || 0) + 1);
    counts.set(game.bRosterId, (counts.get(game.bRosterId) || 0) + 1);
  }
  return counts;
}

function mathematicalStatus(
  teamId: number,
  teams: PlayoffLabTeam[],
  wins: Map<number, number>,
  futureGames: PlayoffLabGame[],
  playoffTeams: number,
): MathStatus {
  const remaining = remainingGameCounts(futureGames);
  const teamWins = wins.get(teamId) || 0;
  const teamMaxWins = teamWins + (remaining.get(teamId) || 0);

  const opponentsWhoCanMatchOrPass = teams.filter((team) =>
    team.rosterId !== teamId &&
    (wins.get(team.rosterId) || 0) + (remaining.get(team.rosterId) || 0) >= teamWins
  ).length;

  if (opponentsWhoCanMatchOrPass < playoffTeams) return 'clinched';

  const opponentsAlreadyBeyondReach = teams.filter((team) =>
    team.rosterId !== teamId &&
    (wins.get(team.rosterId) || 0) > teamMaxWins
  ).length;

  if (opponentsAlreadyBeyondReach >= playoffTeams) return 'eliminated';
  return 'alive';
}

function weekOutcomeWins(
  teams: PlayoffLabTeam[],
  weekGames: PlayoffLabGame[],
  mask: number,
) {
  const wins = new Map(teams.map((team) => [team.rosterId, team.wins]));
  weekGames.forEach((game, index) => {
    const bWins = Boolean(mask & (1 << index));
    const winnerId = bWins ? game.bRosterId : game.aRosterId;
    wins.set(winnerId, (wins.get(winnerId) || 0) + 1);
  });
  return wins;
}

function indexCombinations(size: number, choose: number) {
  const result: number[][] = [];
  const walk = (start: number, current: number[]) => {
    if (current.length === choose) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < size; index += 1) {
      current.push(index);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return result;
}

function formatCondition(game: PlayoffLabGame, bWins: boolean, targetTeamId: number) {
  const winnerId = bWins ? game.bRosterId : game.aRosterId;
  const loserId = bWins ? game.aRosterId : game.bRosterId;
  const winnerName = bWins ? game.bTeam : game.aTeam;
  const loserName = bWins ? game.aTeam : game.bTeam;

  if (game.aRosterId === targetTeamId || game.bRosterId === targetTeamId) {
    const targetName = game.aRosterId === targetTeamId ? game.aTeam : game.bTeam;
    return winnerId === targetTeamId ? `${targetName} wins` : `${targetName} loses`;
  }

  return `${winnerName} beats ${loserName}`;
}

function findGuaranteedPaths(
  targetFlags: boolean[],
  weekGames: PlayoffLabGame[],
  targetTeamId: number,
) {
  if (!targetFlags.some(Boolean) || weekGames.length === 0) return [];
  if (targetFlags.every(Boolean)) return ['regardless of the other results this week'];

  const maxConditions = Math.min(4, weekGames.length);
  for (let conditionCount = 1; conditionCount <= maxConditions; conditionCount += 1) {
    const paths: string[] = [];
    const combinations = indexCombinations(weekGames.length, conditionCount);

    for (const indices of combinations) {
      const assignmentCount = 1 << conditionCount;
      for (let assignment = 0; assignment < assignmentCount; assignment += 1) {
        let guaranteed = true;
        let compatible = false;

        for (let fullMask = 0; fullMask < targetFlags.length; fullMask += 1) {
          const matches = indices.every((gameIndex, conditionIndex) => {
            const expectedBWins = Boolean(assignment & (1 << conditionIndex));
            const actualBWins = Boolean(fullMask & (1 << gameIndex));
            return expectedBWins === actualBWins;
          });
          if (!matches) continue;
          compatible = true;
          if (!targetFlags[fullMask]) {
            guaranteed = false;
            break;
          }
        }

        if (!compatible || !guaranteed) continue;

        const phrase = indices
          .map((gameIndex, conditionIndex) =>
            formatCondition(
              weekGames[gameIndex],
              Boolean(assignment & (1 << conditionIndex)),
              targetTeamId,
            )
          )
          .join(' + ');

        if (!paths.includes(phrase)) paths.push(phrase);
        if (paths.length >= 3) return paths;
      }
    }

    if (paths.length > 0) return paths;
  }

  return [];
}

function buildMathScenarios(
  teams: PlayoffLabTeam[],
  games: PlayoffLabGame[],
  playoffTeams: number,
  scenarioStartWeek: number,
): TeamMathScenario[] {
  const currentWins = new Map(teams.map((team) => [team.rosterId, team.wins]));
  const weekGames = games.filter((game) => game.week === scenarioStartWeek);
  const laterGames = games.filter((game) => game.week > scenarioStartWeek);
  const outcomeCount = weekGames.length > 0 ? 1 << weekGames.length : 0;

  return teams.map((team) => {
    const status = mathematicalStatus(team.rosterId, teams, currentWins, games, playoffTeams);
    if (status !== 'alive' || outcomeCount === 0) {
      return { rosterId: team.rosterId, status, clinchPaths: [], eliminationPaths: [] };
    }

    const clinchFlags: boolean[] = [];
    const eliminationFlags: boolean[] = [];

    for (let mask = 0; mask < outcomeCount; mask += 1) {
      const wins = weekOutcomeWins(teams, weekGames, mask);
      const afterWeekStatus = mathematicalStatus(team.rosterId, teams, wins, laterGames, playoffTeams);
      clinchFlags.push(afterWeekStatus === 'clinched');
      eliminationFlags.push(afterWeekStatus === 'eliminated');
    }

    return {
      rosterId: team.rosterId,
      status,
      clinchPaths: findGuaranteedPaths(clinchFlags, weekGames, team.rosterId),
      eliminationPaths: findGuaranteedPaths(eliminationFlags, weekGames, team.rosterId),
    };
  });
}

export default function PlayoffScenarioLab({ teams, games, playoffTeams, scenarioStartWeek, regularSeasonEnd, completedWeeks }: Props) {
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const results = useMemo(() => simulate(teams, games, picks, playoffTeams), [teams, games, picks, playoffTeams]);
  const mathScenarios = useMemo(
    () => buildMathScenarios(teams, games, playoffTeams, scenarioStartWeek),
    [teams, games, playoffTeams, scenarioStartWeek],
  );
  const teamByRoster = useMemo(() => new Map(teams.map((team) => [team.rosterId, team])), [teams]);
  const mathHighlights = mathScenarios.filter(
    (scenario) =>
      scenario.status !== 'alive' ||
      scenario.clinchPaths.length > 0 ||
      scenario.eliminationPaths.length > 0,
  );

  const selectedCount = Object.values(picks).filter((value) => value !== null && value !== undefined).length;
  const weeks = useMemo(() => Array.from(new Set(games.map((game) => game.week))).sort((a, b) => a - b), [games]);
  const firstWeek = weeks[0] ?? scenarioStartWeek;
  const [openWeeks, setOpenWeeks] = useState<Record<number, boolean>>(() => ({ [firstWeek]: true }));

  const choose = (gameId: string, rosterId: number | null) => {
    setPicks((current) => ({ ...current, [gameId]: rosterId }));
  };

  const toggleWeek = (week: number) => {
    setOpenWeeks((current) => ({ ...current, [week]: !current[week] }));
  };

  const setAllWeeks = (open: boolean) => {
    setOpenWeeks(Object.fromEntries(weeks.map((week) => [week, open])));
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Playoff Picture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((team) => {
              const math = mathScenarios.find((scenario) => scenario.rosterId === team.rosterId);
              return (
                <div key={team.rosterId} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-bold">{team.teamName}</div>
                        {math?.status === 'clinched' ? (
                          <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Clinched</span>
                        ) : null}
                        {math?.status === 'eliminated' ? (
                          <span className="rounded-full border border-rose-400/35 bg-rose-400/10 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-300">Eliminated</span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-[var(--muted)]">{team.wins}-{team.losses}{team.ties ? `-${team.ties}` : ''} · {team.ppg.toFixed(1)} PPG</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black tabular-nums">{team.playoffPct.toFixed(0)}%</div>
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)]">playoffs</div>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/20">
                    <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(1, team.playoffPct)}%` }} />
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--muted)]">Average projected seed: {team.avgSeed?.toFixed(1) ?? '—'}</div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clinching &amp; Elimination</CardTitle>
          <div className="mt-1 text-xs text-[var(--muted)]">
            Mathematical status and Week {scenarioStartWeek} paths. Win ties remain alive until the points-for tiebreak can no longer matter.
          </div>
        </CardHeader>
        <CardContent>
          {scenarioStartWeek > regularSeasonEnd ? (
            <p className="text-sm text-[var(--muted)]">The regular season is complete. Final playoff qualification is locked.</p>
          ) : mathHighlights.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No team can mathematically clinch a playoff berth or be eliminated in Week {scenarioStartWeek} yet.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {mathHighlights.map((scenario) => {
                const team = teamByRoster.get(scenario.rosterId);
                if (!team) return null;

                return (
                  <div key={scenario.rosterId} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-black">{team.teamName}</div>
                      {scenario.status === 'clinched' ? (
                        <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-emerald-300">Clinched</span>
                      ) : scenario.status === 'eliminated' ? (
                        <span className="rounded-full border border-rose-400/35 bg-rose-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-rose-300">Eliminated</span>
                      ) : (
                        <span className="rounded-full border border-[var(--border)] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--muted)]">Still live</span>
                      )}
                    </div>

                    {scenario.status === 'clinched' ? (
                      <p className="mt-2 text-xs text-emerald-200/90">Playoff berth mathematically secured.</p>
                    ) : null}
                    {scenario.status === 'eliminated' ? (
                      <p className="mt-2 text-xs text-rose-200/90">Mathematically eliminated from the top {playoffTeams}.</p>
                    ) : null}

                    {scenario.clinchPaths.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300">Can clinch this week</div>
                        <ul className="mt-1 space-y-1 text-xs text-[var(--muted)]">
                          {scenario.clinchPaths.map((path) => <li key={path}>• {path}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    {scenario.eliminationPaths.length > 0 ? (
                      <div className="mt-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-300">Can be eliminated this week</div>
                        <ul className="mt-1 space-y-1 text-xs text-[var(--muted)]">
                          {scenario.eliminationPaths.map((path) => <li key={path}>• {path}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Scenario Lab</CardTitle>
              <div className="mt-1 text-xs text-[var(--muted)]">
                {completedWeeks > 0 ? `${completedWeeks} completed week${completedWeeks === 1 ? '' : 's'} already baked into the odds.` : 'Preseason baseline. Week 1 is the first scenario week.'}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {weeks.length > 1 && (
                <>
                  <button type="button" onClick={() => setAllWeeks(true)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-white/5">
                    Expand all
                  </button>
                  <button type="button" onClick={() => setAllWeeks(false)} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-white/5">
                    Collapse all
                  </button>
                </>
              )}
              <button type="button" onClick={() => setPicks({})} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-white/5">
                Reset scenarios
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Pick winners for any remaining games. Unselected games are simulated from each team&apos;s current scoring profile. {selectedCount} result{selectedCount === 1 ? '' : 's'} locked.
          </p>
          {weeks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No remaining regular-season matchups are available.</p>
          ) : (
            <div className="space-y-3">
              {weeks.map((week) => {
                const weekGames = games.filter((game) => game.week === week);
                const lockedInWeek = weekGames.filter((game) => picks[game.id] !== null && picks[game.id] !== undefined).length;
                const open = Boolean(openWeeks[week]);
                return (
                  <section key={week} className="overflow-hidden rounded-xl border border-[var(--border)]">
                    <button
                      type="button"
                      onClick={() => toggleWeek(week)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-3 bg-[var(--surface-strong)] px-4 py-3 text-left transition hover:bg-white/[0.04]"
                    >
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.16em]">Week {week}</div>
                        <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                          {weekGames.length} matchup{weekGames.length === 1 ? '' : 's'}{lockedInWeek ? ` · ${lockedInWeek} locked` : ''}
                        </div>
                      </div>
                      <span className="text-lg font-bold text-[var(--muted)]" aria-hidden="true">{open ? '−' : '+'}</span>
                    </button>
                    {open && (
                      <div className="grid gap-2 border-t border-[var(--border)] p-3 lg:grid-cols-2">
                        {weekGames.map((game) => {
                          const selected = picks[game.id] ?? null;
                          return (
                            <div key={game.id} className="rounded-xl border border-[var(--border)] p-3">
                              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => choose(game.id, game.aRosterId)}
                                  className="rounded-lg px-3 py-2 text-left text-xs font-bold transition"
                                  style={selected === game.aRosterId ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-strong)' }}
                                >
                                  {game.aTeam}
                                </button>
                                <span className="text-[10px] font-black text-[var(--muted)]">VS</span>
                                <button
                                  type="button"
                                  onClick={() => choose(game.id, game.bRosterId)}
                                  className="rounded-lg px-3 py-2 text-right text-xs font-bold transition"
                                  style={selected === game.bRosterId ? { background: 'var(--accent)', color: '#fff' } : { background: 'var(--surface-strong)' }}
                                >
                                  {game.bTeam}
                                </button>
                              </div>
                              {selected !== null && (
                                <button type="button" onClick={() => choose(game.id, null)} className="mt-2 text-[11px] text-[var(--muted)] hover:text-[var(--text)]">
                                  Return to simulation
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-[var(--muted)]">
        Current data: Sleeper. Completed East v. West results are baked into each team&apos;s live record, points for, and scoring profile, so odds update as results are recorded. Only Weeks {scenarioStartWeek <= regularSeasonEnd ? `${scenarioStartWeek}-${regularSeasonEnd}` : 'complete'} are simulated; {playoffTeams} playoff spots.
      </div>
    </div>
  );
}
