'use client';

import { useMemo, useState } from 'react';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { BroadcastTeamLogo, teamAccent } from '@/components/ui/BroadcastPanel';
import {
  buildMathScenarios,
  formatPlayoffProbability,
  PLAYOFF_SIM_ITERATIONS,
  PRIOR_PSEUDO_GAMES,
  simulatePlayoffs,
  type PlayoffLabGame,
  type PlayoffLabTeam,
} from '@/lib/fantasy/playoff-model';

type Props = {
  teams: PlayoffLabTeam[];
  games: PlayoffLabGame[];
  playoffTeams: number;
  scenarioStartWeek: number;
  regularSeasonEnd: number;
  completedWeeks: number;
  projectionSource: string;
  scheduleCoverage: string | null;
};

const CLINCHING_SCENARIO_START_WEEK = 11;

type OutcomeCondition = {
  week: number;
  winnerId: number;
  loserId: number;
  description: string;
};

type DisplayMathScenario = {
  rosterId: number;
  status: 'clinched' | 'eliminated' | 'alive';
  clinchPaths: OutcomeCondition[][];
  eliminationPaths: OutcomeCondition[][];
};

function readableCondition(description: string) {
  return description
    .replace(/^Mt\. Lebanon Cake Eaters (?=wins|loses)/, 'Cake Eaters ')
    .replace(/ wins$/, ' win')
    .replace(/ loses$/, ' lose');
}

function findFutureOutcomePaths(
  teams: PlayoffLabTeam[],
  allGames: PlayoffLabGame[],
  playoffTeams: number,
  startWeek: number,
  throughWeek: number,
  targetId: number,
  outcome: 'clinch' | 'elimination',
): OutcomeCondition[][] {
  const teamIndex = new Map(teams.map((team, index) => [team.rosterId, index] as const));
  const targetIndex = teamIndex.get(targetId);
  if (targetIndex === undefined) return [];

  const baseWins = teams.map((team) => team.wins);
  const ceilingWins = teams.map((team) =>
    team.wins + allGames.filter((game) =>
      game.aRosterId === team.rosterId || game.bRosterId === team.rosterId
    ).length
  );
  const eligible = allGames
    .filter((game) => game.week >= startWeek && game.week <= throughWeek)
    .sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  const options: [OutcomeCondition, OutcomeCondition][] = eligible.map((game) => {
    const format = (winnerId: number, loserId: number, winner: string, loser: string) => ({
      week: game.week,
      winnerId,
      loserId,
      description: winnerId === targetId
        ? winner + ' wins'
        : loserId === targetId
          ? loser + ' loses'
          : winner + ' beats ' + loser,
    });
    return [
      format(game.aRosterId, game.bRosterId, game.aTeam, game.bTeam),
      format(game.bRosterId, game.aRosterId, game.bTeam, game.aTeam),
    ];
  });

  // A path is displayed only if its results guarantee qualification even
  // under the worst remaining results and unknown points-for tiebreakers.
  // Counting incompatible rivals as if they could all win is deliberately
  // conservative: it can omit a valid path but cannot invent a clinch.
  const guarantees = (conditions: OutcomeCondition[]) => {
    const floor = baseWins.slice();
    const ceiling = ceilingWins.slice();
    for (const condition of conditions) {
      const winnerIndex = teamIndex.get(condition.winnerId);
      const loserIndex = teamIndex.get(condition.loserId);
      if (winnerIndex === undefined || loserIndex === undefined) return false;
      floor[winnerIndex] += 1;
      ceiling[loserIndex] -= 1;
    }

    let rivals = 0;
    for (let index = 0; index < teams.length; index += 1) {
      if (index === targetIndex) continue;
      if (outcome === 'clinch'
        ? ceiling[index] >= floor[targetIndex]
        : floor[index] > ceiling[targetIndex]) {
        rivals += 1;
      }
    }
    return rivals < playoffTeams ? outcome === 'clinch' : outcome === 'elimination';
  };

  const allPaths: OutcomeCondition[][] = [];
  const maxConditions = Math.min(4, options.length);
  for (let conditionCount = 1; conditionCount <= maxConditions; conditionCount += 1) {
    const selected: number[] = [];
    const search = (next: number) => {
      if (selected.length === conditionCount) {
        if (!selected.some((index) => eligible[index].week === throughWeek)) return;
        for (let mask = 0; mask < (1 << conditionCount); mask += 1) {
          const conditions = selected.map((index, offset) =>
            options[index][(mask >> offset) & 1]
          );
          if (!guarantees(conditions)) continue;
          if (conditions.some((_, removeIndex) =>
            guarantees(conditions.filter((__, index) => index !== removeIndex))
          )) continue;
          allPaths.push(conditions);
        }
        return;
      }

      for (let index = next; index <= options.length - (conditionCount - selected.length); index += 1) {
        selected.push(index);
        search(index + 1);
        selected.pop();
      }
    };
    search(0);
    if (allPaths.length > 0) break;
  }

  // Prefer conditions a team controls over paths made entirely of other results.
  return allPaths
    .sort((a, b) => {
      const ownWins = (path: OutcomeCondition[]) =>
        path.filter((condition) => condition.winnerId === targetId).length;
      const ownLosses = (path: OutcomeCondition[]) =>
        path.filter((condition) => condition.loserId === targetId).length;
      return ownWins(b) - ownWins(a) || ownLosses(a) - ownLosses(b)
        || a.map((condition) => condition.description).join('|')
          .localeCompare(b.map((condition) => condition.description).join('|'));
    })
    .slice(0, 3);
}

function buildFutureMathScenarios(
  teams: PlayoffLabTeam[],
  games: PlayoffLabGame[],
  playoffTeams: number,
  startWeek: number,
  throughWeek: number,
  current: ReturnType<typeof buildMathScenarios>,
): DisplayMathScenario[] {
  return current.map((team) => ({
    rosterId: team.rosterId,
    status: team.status,
    clinchPaths: team.status === 'alive'
      ? findFutureOutcomePaths(teams, games, playoffTeams, startWeek, throughWeek, team.rosterId, 'clinch')
      : [],
    eliminationPaths: team.status === 'alive'
      ? findFutureOutcomePaths(teams, games, playoffTeams, startWeek, throughWeek, team.rosterId, 'elimination')
      : [],
  }));
}


type SeedBounds = { min: number; max: number };
type SeedPathView = {
  team: PlayoffLabTeam;
  guaranteed: boolean;
  alreadyLocked: boolean;
  needsTiebreak: boolean;
  conditions: OutcomeCondition[];
  label: string;
};

function getSeedPathViews(
  teams: PlayoffLabTeam[],
  games: PlayoffLabGame[],
  selectedSeed: number,
  scenarioStartWeek: number,
  horizonWeek: number,
  regularSeasonEnd: number,
): SeedPathView[] {
  const scheduled = games
    .filter((game) => game.week >= scenarioStartWeek && game.week <= regularSeasonEnd)
    .sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  // In Weeks 13–14 there are at most 12 games in a 12-team league.
  // Keep the enumeration bounded if league settings ever change.
  if (!teams.length || scheduled.length > 14) return [];

  const teamIndex = new Map(teams.map((team, index) => [team.rosterId, index] as const));
  const hCount = scheduled.filter((game) => game.week <= horizonWeek).length;
  const n = scheduled.length;
  const outcomeCount = 1 << n;
  const currentWins = teams.map((team) => team.wins);
  const currentTies = teams.map((team) => team.ties);
  const gameIndices = scheduled.map((game) =>
    [teamIndex.get(game.aRosterId) ?? -1, teamIndex.get(game.bRosterId) ?? -1] as const
  );

  const scenarios: SeedBounds[][] = Array.from({ length: outcomeCount }, (_, mask) => {
    const wins = currentWins.slice();
    for (let i = 0; i < n; i += 1) {
      const [a, b] = gameIndices[i];
      if (a < 0 || b < 0) continue;
      wins[mask & (1 << i) ? b : a] += 1;
    }
    return wins.map((winCount, index) => {
      let ahead = 0;
      let tied = 0;
      for (let other = 0; other < teams.length; other += 1) {
        if (other === index) continue;
        if (wins[other] > winCount || (wins[other] === winCount && currentTies[other] > currentTies[index])) {
          ahead += 1;
        } else if (wins[other] === winCount && currentTies[other] === currentTies[index]) {
          tied += 1;
        }
      }
      // Every ordering within a record tie remains potentially possible until
      // future Points For (then Points Against) is known. Never call that locked.
      return { min: ahead + 1, max: ahead + tied + 1 };
    });
  });

  const matches = (mask: number, indices: number[], expected: number) =>
    indices.every((index) => Boolean(mask & (1 << index)) === Boolean(expected & (1 << index)));

  const gameOutcome = (index: number, mask: number, teamId: number): OutcomeCondition => {
    const game = scheduled[index];
    const bWon = Boolean(mask & (1 << index));
    const winnerId = bWon ? game.bRosterId : game.aRosterId;
    const loserId = bWon ? game.aRosterId : game.bRosterId;
    const winner = bWon ? game.bTeam : game.aTeam;
    const loser = bWon ? game.aTeam : game.bTeam;
    return {
      week: game.week,
      winnerId,
      loserId,
      description: winnerId === teamId
        ? winner + ' wins'
        : loserId === teamId
          ? loser + ' loses'
          : winner + ' beats ' + loser,
    };
  };

  // A short result path is "guaranteed" only when ALL unresolved games and
  // ALL points-for tie orderings still leave the team at exactly that seed.
  const guarantees = (teamIdx: number, indices: number[], expected: number) => {
    for (let mask = 0; mask < outcomeCount; mask += 1) {
      if (!matches(mask, indices, expected)) continue;
      const { min, max } = scenarios[mask][teamIdx];
      if (min !== selectedSeed || max !== selectedSeed) return false;
    }
    return true;
  };

  const simplify = (teamIdx: number, fixedMask: number) => {
    const chosen = Array.from({ length: hCount }, (_, index) => index);
    // Keep a team's own results in the path whenever useful. Delete
    // unrelated result conditions first.
    const removalOrder = [...chosen].sort((a, b) => {
      const belongs = (index: number) => {
        const [left, right] = gameIndices[index];
        return left === teamIdx || right === teamIdx;
      };
      return Number(belongs(a)) - Number(belongs(b));
    });
    for (const index of removalOrder) {
      const candidate = chosen.filter((value) => value !== index);
      if (guarantees(teamIdx, candidate, fixedMask)) chosen.splice(chosen.indexOf(index), 1);
    }
    return chosen;
  };

  const strength = new Map(teams.map((team) => [team.rosterId, team.modelPpg] as const));
  const upsetCount = (mask: number) => scheduled.reduce((total, game, index) => {
    const aStrong = (strength.get(game.aRosterId) ?? 0) >= (strength.get(game.bRosterId) ?? 0);
    const bWon = Boolean(mask & (1 << index));
    return total + (aStrong === bWon ? 1 : 0);
  }, 0);

  return teams.flatMap((team, teamIdx): SeedPathView[] => {
    const feasible = scenarios
      .map((bounds, mask) => ({
        mask,
        bounds: bounds[teamIdx],
      }))
      .filter(({ bounds }) => bounds.min <= selectedSeed && bounds.max >= selectedSeed);
    if (!feasible.length) return [];

    const alreadyLocked = feasible.length === outcomeCount &&
      scenarios.every((bounds) =>
        bounds[teamIdx].min === selectedSeed && bounds[teamIdx].max === selectedSeed
      );
    // Look for an outcome of the selected week(s) that makes a seed
    // guaranteed even after any later results. A Week 13 guarantee is
    // therefore valid through the end of Week 14.
    const guaranteedMasks: number[] = [];
    const horizonCount = 1 << hCount;
    for (let prefix = 0; prefix < horizonCount; prefix += 1) {
      let works = true;
      for (let mask = prefix; mask < outcomeCount; mask += horizonCount) {
        const bounds = scenarios[mask][teamIdx];
        if (bounds.min !== selectedSeed || bounds.max !== selectedSeed) {
          works = false;
          break;
        }
      }
      if (works) guaranteedMasks.push(prefix);
    }

    if (alreadyLocked) {
      return [{ team, guaranteed: true, alreadyLocked: true, needsTiebreak: false, conditions: [], label: 'Seed already secured' }];
    }

    if (guaranteedMasks.length) {
      const candidates = guaranteedMasks.slice(0, 36).map((mask) => ({
        mask,
        indices: simplify(teamIdx, mask),
      })).sort((a, b) =>
        a.indices.length - b.indices.length || upsetCount(a.mask) - upsetCount(b.mask)
      );
      const chosen = candidates[0];
      return [{
        team, guaranteed: true, alreadyLocked: false, needsTiebreak: false,
        conditions: chosen.indices.map((index) => gameOutcome(index, chosen.mask, team.rosterId)),
        label: 'Can lock seed by Week ' + horizonWeek,
      }];
    }

    // For an unsettled seed, show a concrete feasible outcome, NOT a
    // mathematical guarantee. Prefer outcomes with no unresolved record tie,
    // then fewer upsets relative to the current scoring model.
    const bestExample = feasible.sort((a, b) => {
      const aTie = a.bounds.min !== a.bounds.max;
      const bTie = b.bounds.min !== b.bounds.max;
      if (aTie !== bTie) return Number(aTie) - Number(bTie);
      return upsetCount(a.mask) - upsetCount(b.mask) || a.mask - b.mask;
    })[0];
    const indices = Array.from({ length: hCount }, (_, index) => index);
    return [{
      team,
      guaranteed: false,
      alreadyLocked: false,
      needsTiebreak: bestExample.bounds.min !== bestExample.bounds.max,
      conditions: indices.map((index) => gameOutcome(index, bestExample.mask, team.rosterId)),
      label: horizonWeek < regularSeasonEnd
        ? 'Possible Week ' + horizonWeek + ' setup'
        : 'Illustrative route to Seed #' + selectedSeed,
    }];
  }).sort((a, b) =>
    b.team.wins - a.team.wins || b.team.ties - a.team.ties || b.team.pointsFor - a.team.pointsFor
  );
}

function recordLabel(team: PlayoffLabTeam) {
  return team.wins + '-' + team.losses + (team.ties ? '-' + team.ties : '');
}

export default function PlayoffScenarioLab({
  teams,
  games,
  playoffTeams,
  scenarioStartWeek,
  regularSeasonEnd,
  completedWeeks,
  projectionSource,
  scheduleCoverage,
}: Props) {
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const weeks = useMemo(
    () => Array.from(new Set(games.map((game) => game.week))).sort((a, b) => a - b),
    [games],
  );
  const firstWeek = weeks[0] ?? scenarioStartWeek;
  const [activeWeek, setActiveWeek] = useState(firstWeek);
  const [activeTab, setActiveTab] = useState<'forecast' | 'clinching' | 'seeding'>('forecast');
  const [selectedSeed, setSelectedSeed] = useState(1);
  const [seedingWeek, setSeedingWeek] = useState(13);
  const [horizonWeek, setHorizonWeek] = useState(scenarioStartWeek);

  const results = useMemo(
    () => simulatePlayoffs(teams, games, picks, playoffTeams),
    [teams, games, picks, playoffTeams],
  );
  const mathScenarios = useMemo(
    () => buildMathScenarios(teams, games, playoffTeams, scenarioStartWeek),
    [teams, games, playoffTeams, scenarioStartWeek],
  );
  const mathByRoster = useMemo(
    () => new Map(mathScenarios.map((scenario) => [scenario.rosterId, scenario] as const)),
    [mathScenarios],
  );
  const teamByRoster = useMemo(
    () => new Map(teams.map((team) => [team.rosterId, team] as const)),
    [teams],
  );
  const horizonWeeks = weeks.filter((week) =>
    week >= scenarioStartWeek && week <= Math.min(regularSeasonEnd, scenarioStartWeek + 2)
  );
  const selectedHorizon = horizonWeeks.includes(horizonWeek)
    ? horizonWeek
    : scenarioStartWeek;
  const clinchingRows = useMemo(() => {
    const rows: DisplayMathScenario[] = selectedHorizon === scenarioStartWeek
      ? mathScenarios.map((scenario) => ({
          rosterId: scenario.rosterId,
          status: scenario.status,
          clinchPaths: scenario.clinchPaths.map((path) =>
            path.split(' + ').map((description) => ({
              week: scenarioStartWeek, winnerId: -1, loserId: -1, description,
            }))
          ),
          eliminationPaths: scenario.eliminationPaths.map((path) =>
            path.split(' + ').map((description) => ({
              week: scenarioStartWeek, winnerId: -1, loserId: -1, description,
            }))
          ),
        }))
      : buildFutureMathScenarios(teams, games, playoffTeams, scenarioStartWeek, selectedHorizon, mathScenarios);
    return rows.sort((left, right) => {
      const a = teamByRoster.get(left.rosterId);
      const b = teamByRoster.get(right.rosterId);
      if (!a || !b) return 0;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.ties !== a.ties) return b.ties - a.ties;
      return b.pointsFor - a.pointsFor;
    });
  }, [selectedHorizon, scenarioStartWeek, mathScenarios, teams, games, playoffTeams, teamByRoster]);

  const selectedCount = Object.values(picks).filter(
    (value) => value !== null && value !== undefined,
  ).length;
  const activeGames = games.filter((game) => game.week === activeWeek);
  const showClinchingScenarios = scenarioStartWeek >= CLINCHING_SCENARIO_START_WEEK;
  const showSeedingScenarios = scenarioStartWeek >= 13 && scenarioStartWeek <= regularSeasonEnd;
  const seedingWeeks = weeks.filter((week) => week >= scenarioStartWeek && week <= regularSeasonEnd);
  const selectedSeedingWeek = seedingWeeks.includes(seedingWeek) ? seedingWeek : scenarioStartWeek;
  const seedingScheduleComplete = seedingWeeks.every((week) =>
    games.filter((game) => game.week === week).length === teams.length / 2
  );
  const seedPaths = useMemo(() =>
    activeTab === 'seeding' && showSeedingScenarios && seedingScheduleComplete && !scheduleCoverage
      ? getSeedPathViews(teams, games, selectedSeed, scenarioStartWeek, selectedSeedingWeek, regularSeasonEnd)
      : [],
    [activeTab, showSeedingScenarios, seedingScheduleComplete, scheduleCoverage, teams, games, selectedSeed, scenarioStartWeek, selectedSeedingWeek, regularSeasonEnd]
  );
  const activeLocked = activeGames.filter(
    (game) => picks[game.id] !== null && picks[game.id] !== undefined,
  ).length;

  const choose = (gameId: string, rosterId: number | null) => {
    setPicks((current) => ({ ...current, [gameId]: rosterId }));
  };

  const clearActiveWeek = () => {
    const ids = new Set(activeGames.map((game) => game.id));
    setPicks((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([gameId]) => !ids.has(gameId)),
      ),
    );
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-4 sm:px-5">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">How the forecast works</div>
        <p className="mt-1.5 max-w-4xl text-sm leading-6 text-[var(--muted)]">
          The model blends each team&apos;s actual scoring with its current roster projection, giving the projection more weight early in the season and actual results more weight as the sample grows. It then simulates the remaining schedule {PLAYOFF_SIM_ITERATIONS.toLocaleString()} times, with more uncertainty early in the year and less as we learn more about each team.
        </p>
      </div>

      {scheduleCoverage ? (
        <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100/90">
          {scheduleCoverage}
        </div>
      ) : null}

      <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-1">
        <button
          type="button"
          onClick={() => setActiveTab('forecast')}
          className={
            activeTab === 'forecast'
              ? 'rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-black text-white'
              : 'rounded-lg px-4 py-2 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'
          }
        >
          Forecast
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('clinching')}
          className={
            activeTab === 'clinching'
              ? 'rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-black text-white'
              : 'rounded-lg px-4 py-2 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'
          }
        >
          Clinching
        </button>
        {showSeedingScenarios ? (
          <button
            type="button"
            onClick={() => setActiveTab('seeding')}
            className={activeTab === 'seeding'
              ? 'rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-black text-white'
              : 'rounded-lg px-4 py-2 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'}
          >
            Seeding
          </button>
        ) : null}
      </div>

      {activeTab === 'forecast' ? (
        <>
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Playoff Outlook</CardTitle>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Estimated chance to make the playoffs based on {PLAYOFF_SIM_ITERATIONS.toLocaleString()} simulations. Clinching status is tracked separately in the Clinching tab.
              </div>
            </div>
            {selectedCount > 0 ? (
              <div className="text-xs font-bold text-[var(--accent)]">
                {selectedCount} scenario override{selectedCount === 1 ? '' : 's'} selected
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {results.map((team, index) => {
              const scenario = mathByRoster.get(team.rosterId);
              const status = scenario?.status ?? 'alive';
              const probability = formatPlayoffProbability(team.playoffPct, status);
              const accent = teamAccent(team.teamName);
              const barWidth = status === 'clinched'
                ? 100
                : status === 'eliminated'
                  ? 0
                  : Math.max(1, Math.min(100, team.playoffPct));

              return (
                <div
                  key={team.rosterId}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 sm:p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1 text-xs font-black tabular-nums text-[var(--muted)]">
                      {index + 1}
                    </div>
                    <BroadcastTeamLogo team={team.teamName} accent={accent} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-black">{team.teamName}</div>
                        {status === 'clinched' ? (
                          <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Clinched</span>
                        ) : null}
                        {status === 'eliminated' ? (
                          <span className="rounded-full border border-rose-400/35 bg-rose-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-300">Eliminated</span>
                        ) : null}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted)]">
                        <span>{recordLabel(team)}</span>
                        <span>PF/G {team.actualPpg !== null ? team.actualPpg.toFixed(1) : '—'}</span>
                        <span>Model {team.modelPpg.toFixed(1)}</span>
                        <span>Avg seed {team.avgSeed?.toFixed(1) ?? '—'}</span>
                      </div>

                      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-black/20">
                        <div
                          className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                          style={{ width: String(barWidth) + '%' }}
                        />
                      </div>
                    </div>

                    <div className="w-16 shrink-0 text-right">
                      <div className="text-xl font-black tabular-nums">{probability}</div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">playoffs</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle>Scenario Simulator</CardTitle>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Choose winners only where you want to override the model. Everything else stays simulated.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearActiveWeek}
                disabled={activeLocked === 0}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear Week {activeWeek}
              </button>
              <button
                type="button"
                onClick={() => setPicks({})}
                disabled={selectedCount === 0}
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reset all
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {weeks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No remaining regular-season matchups are available.</p>
          ) : (
            <>
              <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
                {weeks.map((week) => {
                  const locked = games.filter(
                    (game) =>
                      game.week === week &&
                      picks[game.id] !== null &&
                      picks[game.id] !== undefined,
                  ).length;
                  const active = week === activeWeek;
                  return (
                    <button
                      key={week}
                      type="button"
                      onClick={() => setActiveWeek(week)}
                      className={
                        active
                          ? 'shrink-0 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-white'
                          : 'shrink-0 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'
                      }
                    >
                      Week {week}{locked ? ' · ' + locked : ''}
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                {activeGames.map((game) => {
                  const selected = picks[game.id] ?? null;
                  return (
                    <div key={game.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                      <div className="mb-2 text-[9px] font-black uppercase tracking-[0.14em] text-[var(--muted)]">
                        Week {game.week}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <button
                          type="button"
                          onClick={() => choose(game.id, game.aRosterId)}
                          className={
                            selected === game.aRosterId
                              ? 'rounded-lg bg-[var(--accent)] px-3 py-2.5 text-left text-xs font-black text-white'
                              : 'rounded-lg border border-[var(--border)] px-3 py-2.5 text-left text-xs font-bold transition hover:border-[var(--accent)]'
                          }
                        >
                          {game.aTeam}
                        </button>
                        <button
                          type="button"
                          onClick={() => choose(game.id, null)}
                          className={
                            selected === null
                              ? 'rounded-full border border-[var(--border)] bg-black/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--muted)]'
                              : 'rounded-full border border-[var(--border)] px-2 py-1 text-[9px] font-black uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)]'
                          }
                        >
                          Auto
                        </button>
                        <button
                          type="button"
                          onClick={() => choose(game.id, game.bRosterId)}
                          className={
                            selected === game.bRosterId
                              ? 'rounded-lg bg-[var(--accent)] px-3 py-2.5 text-right text-xs font-black text-white'
                              : 'rounded-lg border border-[var(--border)] px-3 py-2.5 text-right text-xs font-bold transition hover:border-[var(--accent)]'
                          }
                        >
                          {game.bTeam}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-3 text-xs text-[var(--muted)]">
                {activeLocked > 0
                  ? String(activeLocked) + ' Week ' + String(activeWeek) + ' scenario override' + (activeLocked === 1 ? '' : 's') + ' selected.'
                  : 'No Week ' + String(activeWeek) + ' scenario overrides selected.'}
                {' '}The playoff outlook above updates automatically.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <details className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-black">How the model works</summary>
        <div className="border-t border-[var(--border)] px-4 py-4 text-sm leading-6 text-[var(--muted)]">
          <p>
            Early results are deliberately shrunk toward the current roster projection. The projection carries the weight of {PRIOR_PSEUDO_GAMES} prior games, so three real games no longer dominate the forecast.
          </p>
          <p className="mt-2">
            Each simulated season also samples uncertainty in every team&apos;s underlying strength before simulating weekly scoring. That uncertainty is widest early in the year and narrows as more real games are played.
          </p>
          <p className="mt-2">
            Future weeks add additional volatility to account for the fact that injuries, roles, byes, waivers, and roster changes become harder to predict farther out. The projection baseline comes from {projectionSource}.
          </p>
          <p className="mt-2">
            Forecast odds never display 100% unless the mathematical engine says the team has clinched. Likewise, a team is not shown at 0% unless it is mathematically eliminated.
          </p>
        </div>
      </details>
        </>
      ) : activeTab === 'clinching' ? (
        <Card>
          <CardHeader>
            <CardTitle>Clinching Status</CardTitle>
            <div className="mt-1 text-xs text-[var(--muted)]">
              Mathematical playoff status and guaranteed result combinations. Select a week to see conditions that could secure a berth or cause elimination by that week. Future-week paths are sufficient, not necessarily exhaustive.
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--muted)]">
              {scenarioStartWeek > regularSeasonEnd
                ? 'The regular season is complete, so playoff qualification is final.'
                : showClinchingScenarios
                  ? selectedHorizon === scenarioStartWeek
                    ? 'Week ' + String(scenarioStartWeek) + ' scenarios check every possible combination of this week\'s results. Potential points-for tiebreaks are not treated as clinches.'
                    : 'By Week ' + String(selectedHorizon) + ': these are short, sufficient paths involving at least one Week ' + String(selectedHorizon) + ' result. Earlier results in each path are hypothetical. Other paths may exist.'
                  : 'Clinching and elimination scenarios will activate in Week ' + String(CLINCHING_SCENARIO_START_WEEK) + '. Until then, this tab tracks only whether a team is mathematically alive, clinched, or eliminated.'}
            </div>

            {showClinchingScenarios && horizonWeeks.length > 1 ? (
              <div className="mb-4 flex flex-wrap gap-2" aria-label="Clinching scenario horizon">
                {horizonWeeks.map((week) => (
                  <button
                    key={week}
                    type="button"
                    onClick={() => setHorizonWeek(week)}
                    aria-pressed={selectedHorizon === week}
                    className={selectedHorizon === week
                      ? 'rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-white'
                      : 'rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'}
                  >
                    {week === scenarioStartWeek ? 'Week ' + week : 'By Week ' + week}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="space-y-2">
              {clinchingRows.map((scenario) => {
                const team = teamByRoster.get(scenario.rosterId);
                if (!team) return null;
                const accent = teamAccent(team.teamName);

                return (
                  <div
                    key={scenario.rosterId}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 sm:p-4"
                  >
                    <div className="flex items-start gap-3">
                      <BroadcastTeamLogo team={team.teamName} accent={accent} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-black">{team.teamName}</div>
                          <span
                            className={
                              scenario.status === 'clinched'
                                ? 'rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300'
                                : scenario.status === 'eliminated'
                                  ? 'rounded-full border border-rose-400/35 bg-rose-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-300'
                                  : 'rounded-full border border-[var(--border)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[var(--muted)]'
                            }
                          >
                            {scenario.status === 'alive' ? 'Alive' : scenario.status}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-[var(--muted)]">
                          {recordLabel(team)} · PF/G {team.actualPpg !== null ? team.actualPpg.toFixed(1) : '—'}
                        </div>

                        {scenario.status === 'clinched' ? (
                          <div className="mt-2 text-xs font-semibold text-emerald-300">
                            Playoff berth mathematically secured.
                          </div>
                        ) : null}

                        {scenario.status === 'eliminated' ? (
                          <div className="mt-2 text-xs font-semibold text-rose-300">
                            Mathematically eliminated from the top {playoffTeams}.
                          </div>
                        ) : null}

                        {showClinchingScenarios && !scheduleCoverage && scenario.status === 'alive' && scenario.clinchPaths.length === 0 && scenario.eliminationPaths.length === 0 ? (
                          <div className="mt-2 text-xs text-[var(--muted)]">
                            No short guaranteed clinching or elimination path found {selectedHorizon === scenarioStartWeek ? 'this week' : 'by Week ' + selectedHorizon}. Other combinations may still matter.
                          </div>
                        ) : null}

                        {showClinchingScenarios && !scheduleCoverage && ([
                          { title: 'Can clinch', paths: scenario.clinchPaths, color: 'text-emerald-300' },
                          { title: 'Can be eliminated', paths: scenario.eliminationPaths, color: 'text-rose-300' },
                        ] as const).map((group) => group.paths.length > 0 ? (
                          <div key={group.title} className="mt-3 text-xs text-[var(--muted)]">
                            <div className={'font-bold ' + group.color}>
                              {group.title} {selectedHorizon === scenarioStartWeek ? 'in' : 'by'} Week {selectedHorizon} if:
                            </div>
                            <div className="mt-1.5 space-y-2">
                              {group.paths.map((path, pathIndex) => (
                                <div key={pathIndex} className="rounded-lg border border-[var(--border)] bg-black/10 px-3 py-2">
                                  {group.paths.length > 1 ? (
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                                      Option {pathIndex + 1}
                                    </div>
                                  ) : null}
                                  <ul className="ml-4 mt-1 list-disc space-y-1">
                                    {path.map((condition, index) => (
                                      <li key={index}>
                                        {selectedHorizon !== scenarioStartWeek ? 'Week ' + condition.week + ': ' : ''}
                                        {readableCondition(condition.description)}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null)}
                        {showClinchingScenarios && scheduleCoverage && scenario.status === 'alive' ? (
                          <div className="mt-2 text-xs text-amber-200">
                            Exact paths are hidden until all remaining matchups load.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Playoff Seeding Scenarios</CardTitle>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Explore result paths for each individual playoff seed, starting in Week 13. Scenarios can look ahead to Week 14 before those games are played. The #1 seed receives the first-round bye.
            </div>
          </CardHeader>
          <CardContent>
            {scheduleCoverage || !seedingScheduleComplete ? (
              <div className="rounded-lg border border-amber-400/35 bg-amber-400/[0.07] p-3 text-sm text-amber-100/90">
                Seeding paths require all remaining matchups to load. Some games are missing, so no partial scenarios are being shown.
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  {seedingWeeks.map((week) => (
                    <button
                      key={week}
                      type="button"
                      aria-pressed={selectedSeedingWeek === week}
                      onClick={() => setSeedingWeek(week)}
                      className={selectedSeedingWeek === week
                        ? 'rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 py-1.5 text-xs font-black text-white'
                        : 'rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] transition hover:text-[var(--text)]'}
                    >
                      {week === scenarioStartWeek ? 'Week ' + week : 'By Week ' + week}
                    </button>
                  ))}
                </div>
                <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-3 text-xs leading-5 text-[var(--muted)]">
                  {selectedSeedingWeek < regularSeasonEnd
                    ? 'Week ' + selectedSeedingWeek + ' paths show how those results could set up each final seed. A “Can lock” path guarantees the seed regardless of Week ' + regularSeasonEnd + ' or points-for tiebreaks. All other examples still depend on later results.'
                    : 'These are concrete possible routes to final seeds, using remaining Week 13–14 matchups. “Can lock” paths guarantee a seed even if other games differ. Illustrative paths show one possible set of outcomes, not a prediction.'}
                  {' '}Tied records are not treated as settled: the league uses overall record, Points For, then higher Points Against. A remaining tie can require commissioner resolution.
                </div>
                <div className="mb-4 flex flex-wrap gap-2" aria-label="Choose an individual playoff seed">
                  {Array.from({ length: playoffTeams }, (_, index) => index + 1).map((seed) => (
                    <button
                      key={seed}
                      type="button"
                      aria-pressed={selectedSeed === seed}
                      onClick={() => setSelectedSeed(seed)}
                      className={selectedSeed === seed
                        ? 'rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-3 py-2 text-xs font-black text-white'
                        : 'rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-xs font-bold text-[var(--muted)] transition hover:border-[var(--accent)] hover:text-[var(--text)]'}
                    >
                      Seed #{seed}{seed === 1 ? ' · Bye' : ''}
                    </button>
                  ))}
                </div>
                <div className="mb-3 text-xs text-[var(--muted)]">
                  {seedPaths.length} team{seedPaths.length === 1 ? '' : 's'} can still finish as Seed #{selectedSeed}.
                </div>
                <div className="space-y-3">
                  {seedPaths.map((entry) => (
                    <div key={entry.team.rosterId} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3 sm:p-4">
                      <div className="flex flex-wrap items-center gap-3">
                        <BroadcastTeamLogo team={entry.team.teamName} accent={teamAccent(entry.team.teamName)} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="font-black text-sm">{entry.team.teamName}</div>
                          <div className="text-[11px] text-[var(--muted)]">{recordLabel(entry.team)} · PF/G {entry.team.actualPpg?.toFixed(1) ?? '—'}</div>
                        </div>
                        <span className={entry.guaranteed
                          ? 'rounded-full border border-emerald-400/35 bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300'
                          : 'rounded-full border border-[var(--border)] px-2 py-1 text-[10px] font-bold text-[var(--muted)]'}>
                          {entry.alreadyLocked ? 'Seed secured' : entry.guaranteed ? 'Can lock seed' : 'Seed possible'}
                        </span>
                      </div>
                      <div className="mt-3 text-xs font-semibold text-[var(--text)]">{entry.label}</div>
                      {entry.needsTiebreak ? (
                        <div className="mt-1 text-xs text-amber-200">
                          This example requires a record tiebreak. Points For may determine the seed.
                        </div>
                      ) : !entry.guaranteed ? (
                        <div className="mt-1 text-xs text-[var(--muted)]">
                          Illustrative, not sufficient on its own. Other outcomes can change the final seed.
                        </div>
                      ) : null}
                      {entry.conditions.length ? (
                        <details className="mt-2 rounded-lg border border-[var(--border)] bg-black/10" open={seedPaths.length <= 3}>
                          <summary className="cursor-pointer px-3 py-2 text-xs font-bold">
                            {entry.guaranteed ? 'Results needed to lock Seed #' : 'View example result path to Seed #'}{selectedSeed}
                          </summary>
                          <ul className="ml-7 mr-3 mb-3 list-disc space-y-1.5 text-xs text-[var(--muted)]">
                            {entry.conditions.map((condition, index) => (
                              <li key={index}>
                                Week {condition.week}: {readableCondition(condition.description)}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </div>
                  ))}
                  {!seedPaths.length ? (
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm text-[var(--muted)]">
                      No team can finish at this seed under the remaining scheduled outcomes.
                    </div>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
