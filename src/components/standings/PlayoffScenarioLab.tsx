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
  const mathHighlights = mathScenarios.filter(
    (scenario) =>
      scenario.status !== 'alive' ||
      scenario.clinchPaths.length > 0 ||
      scenario.eliminationPaths.length > 0,
  );

  const selectedCount = Object.values(picks).filter(
    (value) => value !== null && value !== undefined,
  ).length;
  const activeGames = games.filter((game) => game.week === activeWeek);
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

  const remainingWeeks = Math.max(0, regularSeasonEnd - completedWeeks);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Season progress</div>
          <div className="mt-1 text-2xl font-black">{completedWeeks} / {regularSeasonEnd}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">regular-season weeks complete</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Playoff field</div>
          <div className="mt-1 text-2xl font-black">{playoffTeams} / {teams.length}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">teams qualify</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Schedule left</div>
          <div className="mt-1 text-2xl font-black">{remainingWeeks}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">weeks still to simulate</div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--muted)]">Model runs</div>
          <div className="mt-1 text-2xl font-black">{PLAYOFF_SIM_ITERATIONS.toLocaleString()}</div>
          <div className="mt-1 text-xs text-[var(--muted)]">season simulations per scenario</div>
        </div>
      </div>

      {scheduleCoverage ? (
        <div className="rounded-xl border border-amber-400/35 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100/90">
          {scheduleCoverage}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle>Playoff Outlook</CardTitle>
              <div className="mt-1 text-xs text-[var(--muted)]">
                Forecast odds, not clinching percentages. Current locked scenarios are reflected immediately.
              </div>
            </div>
            {selectedCount > 0 ? (
              <div className="text-xs font-bold text-[var(--accent)]">
                {selectedCount} result{selectedCount === 1 ? '' : 's'} locked
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
                  ? String(activeLocked) + ' Week ' + String(activeWeek) + ' result' + (activeLocked === 1 ? '' : 's') + ' locked.'
                  : 'No Week ' + String(activeWeek) + ' results are locked.'}
                {' '}The playoff outlook above updates automatically.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clinching &amp; Elimination</CardTitle>
          <div className="mt-1 text-xs text-[var(--muted)]">
            This section is mathematical, not predictive. Ties on possible final wins remain alive because points for can still decide the seed.
          </div>
        </CardHeader>
        <CardContent>
          {scenarioStartWeek > regularSeasonEnd ? (
            <p className="text-sm text-[var(--muted)]">The regular season is complete. Final playoff qualification is locked.</p>
          ) : mathHighlights.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              No team can mathematically clinch a berth or be eliminated in Week {scenarioStartWeek} yet.
            </p>
          ) : (
            <div className="space-y-3">
              {mathHighlights.map((scenario) => {
                const team = teamByRoster.get(scenario.rosterId);
                if (!team) return null;
                return (
                  <div key={scenario.rosterId} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-black">{team.teamName}</div>
                      <div className={
                        scenario.status === 'clinched'
                          ? 'text-[10px] font-black uppercase tracking-wider text-emerald-300'
                          : scenario.status === 'eliminated'
                            ? 'text-[10px] font-black uppercase tracking-wider text-rose-300'
                            : 'text-[10px] font-black uppercase tracking-wider text-[var(--muted)]'
                      }>
                        {scenario.status}
                      </div>
                    </div>

                    {scenario.clinchPaths.length > 0 ? (
                      <div className="mt-2 text-xs text-[var(--muted)]">
                        <span className="font-bold text-emerald-300">Can clinch:</span>{' '}
                        {scenario.clinchPaths.join(' OR ')}
                      </div>
                    ) : null}
                    {scenario.eliminationPaths.length > 0 ? (
                      <div className="mt-2 text-xs text-[var(--muted)]">
                        <span className="font-bold text-rose-300">Can be eliminated:</span>{' '}
                        {scenario.eliminationPaths.join(' OR ')}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
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
    </div>
  );
}
