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
  currentWeek: number;
  regularSeasonEnd: number;
};

type SimulationRow = PlayoffLabTeam & {
  playoffPct: number;
  avgSeed: number | null;
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

export default function PlayoffScenarioLab({ teams, games, playoffTeams, currentWeek, regularSeasonEnd }: Props) {
  const [picks, setPicks] = useState<Record<string, number | null>>({});
  const results = useMemo(() => simulate(teams, games, picks, playoffTeams), [teams, games, picks, playoffTeams]);
  const selectedCount = Object.values(picks).filter((value) => value !== null && value !== undefined).length;
  const weeks = useMemo(() => Array.from(new Set(games.map((game) => game.week))).sort((a, b) => a - b), [games]);

  const choose = (gameId: string, rosterId: number | null) => {
    setPicks((current) => ({ ...current, [gameId]: rosterId }));
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Playoff Picture</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((team) => (
              <div key={team.rosterId} className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">{team.teamName}</div>
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
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Scenario Lab</CardTitle>
            <button type="button" onClick={() => setPicks({})} className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:bg-white/5">
              Reset scenarios
            </button>
          </div>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Pick winners for any remaining games. Unselected games are simulated from each team&apos;s current scoring profile. {selectedCount} result{selectedCount === 1 ? '' : 's'} locked.
          </p>
          {weeks.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No remaining regular-season matchups are available yet.</p>
          ) : (
            <div className="space-y-5">
              {weeks.map((week) => (
                <section key={week}>
                  <h3 className="mb-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--muted)]">Week {week}</h3>
                  <div className="grid gap-2 lg:grid-cols-2">
                    {games.filter((game) => game.week === week).map((game) => {
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
                </section>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-[var(--muted)]">
        Current data: Sleeper. Scenario probabilities: East v. West simulation using current record and scoring distributions. Regular season Weeks {currentWeek}-{regularSeasonEnd}; {playoffTeams} playoff spots.
      </div>
    </div>
  );
}
