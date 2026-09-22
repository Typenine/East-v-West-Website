"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import MatchupCard from "@/components/ui/matchup-card";
import EmptyState from "@/components/ui/empty-state";
import SectionHeader from "@/components/ui/SectionHeader";
import { normalizeTeamCode } from "@/lib/constants/nfl-teams";
import { isRivalryWeek } from "@/lib/constants/league";

export type SeasonProjectionStarter = {
  id: string;
  position: string;
  nflTeam?: string | null;
  projection: number;
  stddev: number;
};

export type SeasonHomeMatchup = {
  homeTeam: string;
  awayTeam: string;
  homeRosterId: number;
  awayRosterId: number;
  homeScore?: number;
  awayScore?: number;
  homeProjectedScore?: number;
  awayProjectedScore?: number;
  homeStarters?: SeasonProjectionStarter[];
  awayStarters?: SeasonProjectionStarter[];
  week: number;
  matchupId: number;
  kickoffTime?: string;
};

type TeamStatus = {
  state: "pre" | "in" | "post";
  period?: number;
  displayClock?: string;
  possessionTeam?: string;
  scoreFor?: number;
  scoreAgainst?: number;
  isRedZone?: boolean;
};

type ScoreboardPayload = {
  teamStatuses?: Record<string, TeamStatus>;
};

type MatchupPointsPayload = {
  rosterPoints?: Record<number, number>;
};

function parseClockToMinutes(clock?: string): number {
  if (!clock) return 0;
  const match = /^(\d{1,2}):(\d{2})/.exec(clock);
  if (!match) return 0;
  return Math.max(0, Math.min(15, Number(match[1]) + Number(match[2]) / 60));
}

function fractionRemaining(team: string | null | undefined, statuses: Record<string, TeamStatus>): number {
  const code = normalizeTeamCode(team || undefined);
  if (!code) return 1;
  const status = statuses[code];
  if (!status || status.state === "pre") return 1;
  if (status.state === "post") return 0;
  const period = Number(status.period || 1);
  if (period > 4) return 0.08;
  const quartersRemaining = Math.max(0, 4 - Math.min(4, period));
  const currentQuarter = Math.max(0, Math.min(1, parseClockToMinutes(status.displayClock) / 15));
  return Math.max(0, Math.min(1, (quartersRemaining + currentQuarter) / 4));
}

function contextMultiplier(starter: SeasonProjectionStarter, statuses: Record<string, TeamStatus>) {
  const code = normalizeTeamCode(starter.nflTeam || undefined);
  const status = code ? statuses[code] : undefined;
  if (!status || status.state !== "in") return { mean: 1, sd: 1 };

  let mean = 1;
  let sd = 1;
  const position = starter.position.toUpperCase();
  if (status.isRedZone && ["QB", "RB", "WR", "TE"].includes(position)) {
    mean *= 1.08;
    sd *= 1.10;
  }
  if (status.possessionTeam && code && status.possessionTeam.toUpperCase() === code.toUpperCase() && ["QB", "RB", "WR", "TE"].includes(position)) {
    mean *= 1.05;
  }
  const diff = (status.scoreFor ?? 0) - (status.scoreAgainst ?? 0);
  if (diff <= -8) {
    if (position === "WR" || position === "TE") mean *= 1.05;
    if (position === "QB") mean *= 1.03;
    if (position === "RB") mean *= 0.97;
  } else if (diff >= 8) {
    if (position === "RB") mean *= 1.03;
    if (position === "WR" || position === "TE") mean *= 0.98;
  }
  return { mean, sd };
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) * Math.exp(-a * a);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function liveRosterScore(
  rosterId: number,
  initialScore: number | undefined,
  rosterPoints: Record<number, number>,
): number {
  const live = Number(rosterPoints[rosterId]);
  if (Number.isFinite(live)) return live;
  return Number(initialScore ?? 0);
}

function deriveTeam(
  starters: SeasonProjectionStarter[],
  rosterId: number,
  initialScore: number | undefined,
  initialProjection: number | undefined,
  rosterPoints: Record<number, number>,
  statuses: Record<string, TeamStatus>,
) {
  // Sleeper's roster total is authoritative. Never rebuild a fantasy team's
  // actual score from a projection snapshot or a subset of player scores.
  const current = liveRosterScore(rosterId, initialScore, rosterPoints);

  if (!starters.length) {
    return {
      current,
      projected: initialProjection,
      variance: undefined as number | undefined,
      finished: false,
    };
  }

  let remainingMean = 0;
  let remainingVariance = 0;
  let allFinished = true;
  for (const starter of starters) {
    const fraction = fractionRemaining(starter.nflTeam, statuses);
    const context = contextMultiplier(starter, statuses);
    if (fraction > 0) allFinished = false;
    remainingMean += starter.projection * fraction * context.mean;
    const remainingSd = starter.stddev * Math.sqrt(fraction) * context.sd;
    remainingVariance += remainingSd * remainingSd;
  }

  return {
    current,
    projected: current + remainingMean,
    variance: remainingVariance,
    finished: allFinished,
  };
}

export default function SeasonMatchups({
  selectedWeek,
  maxWeeks,
  season,
  matchups,
}: {
  selectedWeek: number;
  maxWeeks: number;
  season: string;
  matchups: SeasonHomeMatchup[];
}) {
  const [rosterPoints, setRosterPoints] = useState<Record<number, number>>({});
  const [statuses, setStatuses] = useState<Record<string, TeamStatus>>({});

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const [pointsResult, scoreboardResult] = await Promise.allSettled([
        fetch(`/api/matchup-points?week=${selectedWeek}`, { cache: "no-store" }),
        fetch(`/api/nfl-scoreboard?week=${selectedWeek}&season=${encodeURIComponent(season)}`, { cache: "no-store" }),
      ]);
      if (cancelled) return;

      if (pointsResult.status === "fulfilled" && pointsResult.value.ok) {
        const payload = (await pointsResult.value.json().catch(() => ({}))) as MatchupPointsPayload;
        if (!cancelled) setRosterPoints(payload.rosterPoints || {});
      }
      if (scoreboardResult.status === "fulfilled" && scoreboardResult.value.ok) {
        const payload = (await scoreboardResult.value.json().catch(() => ({}))) as ScoreboardPayload;
        if (!cancelled) setStatuses(payload.teamStatuses || {});
      }
    }

    refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selectedWeek, season]);

  const displayMatchups = useMemo(() => {
    return matchups.map((matchup) => {
      const away = deriveTeam(
        matchup.awayStarters || [],
        matchup.awayRosterId,
        matchup.awayScore,
        matchup.awayProjectedScore,
        rosterPoints,
        statuses,
      );
      const home = deriveTeam(
        matchup.homeStarters || [],
        matchup.homeRosterId,
        matchup.homeScore,
        matchup.homeProjectedScore,
        rosterPoints,
        statuses,
      );

      let homeWinPct: number | undefined;
      let awayWinPct: number | undefined;
      if (home.finished && away.finished) {
        homeWinPct = home.current === away.current ? 50 : home.current > away.current ? 100 : 0;
        awayWinPct = 100 - homeWinPct;
      } else if (
        home.projected !== undefined
        && away.projected !== undefined
        && home.variance !== undefined
        && away.variance !== undefined
        && Number.isFinite(home.projected)
        && Number.isFinite(away.projected)
        && Number.isFinite(home.variance)
        && Number.isFinite(away.variance)
      ) {
        const combinedSd = Math.sqrt(Math.max(0.01, Number(home.variance) + Number(away.variance)));
        const probability = normalCdf((Number(home.projected) - Number(away.projected)) / combinedSd);
        homeWinPct = Math.round(Math.max(0.01, Math.min(0.99, probability)) * 100);
        awayWinPct = 100 - homeWinPct;
      }

      return {
        ...matchup,
        awayScore: away.current,
        homeScore: home.current,
        awayProjectedScore: away.projected,
        homeProjectedScore: home.projected,
        awayWinPct,
        homeWinPct,
      };
    });
  }, [matchups, rosterPoints, statuses]);

  const prevWeek = Math.max(1, selectedWeek - 1);
  const nextWeek = Math.min(maxWeeks, selectedWeek + 1);
  const rivalryWeek = isRivalryWeek(selectedWeek);

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="This week in East v. West"
        subtitle={rivalryWeek ? `Week ${selectedWeek} · Rivalry Week` : `Week ${selectedWeek}`}
        actions={
          <Link href="/matchups" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Full schedule →
          </Link>
        }
      />

      {rivalryWeek ? (
        <Link
          href="/rivalries"
          className="group mb-5 block overflow-hidden rounded-2xl border border-amber-400/55 bg-gradient-to-r from-amber-400/15 via-yellow-300/[0.07] to-amber-400/15 px-5 py-4 shadow-[0_0_32px_rgba(251,191,36,0.08)] transition hover:border-amber-300/75 hover:bg-amber-400/[0.12] sm:px-6 sm:py-5"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-300">
                East v. West Event Week
              </div>
              <div className="mt-1 text-xl font-black uppercase tracking-[0.08em] text-amber-100 sm:text-2xl">
                Rivalry Week
              </div>
              <p className="mt-1 max-w-2xl text-sm font-medium text-amber-100/75">
                Six rivalry matchups. Bragging rights, history, and a little extra hate on every result.
              </p>
            </div>
            <div className="w-fit rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-amber-200 transition group-hover:bg-amber-300/20">
              View rivalries →
            </div>
          </div>
        </Link>
      ) : null}

      <div className="mb-5 flex items-center gap-2" aria-label="Select week">
        <Link
          href={`/?week=${prevWeek}`}
          prefetch={false}
          aria-disabled={selectedWeek === 1}
          className={`rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold ${
            selectedWeek === 1 ? "pointer-events-none opacity-40" : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          ‹ Week {prevWeek}
        </Link>
        <div className="rounded-md border border-[var(--accent)] bg-[var(--accent)] px-4 py-1.5 text-sm font-black text-white">
          Week {selectedWeek}
        </div>
        <Link
          href={`/?week=${nextWeek}`}
          prefetch={false}
          aria-disabled={selectedWeek === maxWeeks}
          className={`rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-semibold ${
            selectedWeek === maxWeeks ? "pointer-events-none opacity-40" : "text-[var(--muted)] hover:text-[var(--text)]"
          }`}
        >
          Week {nextWeek} ›
        </Link>
      </div>

      {displayMatchups.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {displayMatchups.map((matchup) => (
            <div
              key={`${matchup.week}-${matchup.matchupId}`}
              className={
                rivalryWeek
                  ? "rounded-2xl border border-amber-400/55 bg-amber-400/[0.035] p-1 shadow-[0_0_24px_rgba(251,191,36,0.07)]"
                  : undefined
              }
            >
              <MatchupCard
                homeTeam={matchup.homeTeam}
                awayTeam={matchup.awayTeam}
                homeRosterId={matchup.homeRosterId}
                awayRosterId={matchup.awayRosterId}
                homeScore={matchup.homeScore}
                awayScore={matchup.awayScore}
                homeProjectedScore={matchup.homeProjectedScore}
                awayProjectedScore={matchup.awayProjectedScore}
                homeWinPct={matchup.homeWinPct}
                awayWinPct={matchup.awayWinPct}
                kickoffTime={matchup.kickoffTime}
                week={matchup.week}
                matchupId={matchup.matchupId}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={`Week ${selectedWeek} matchups are not populated yet`}
          message="The in-season home is live. Sleeper matchup cards will appear here automatically when the schedule is available."
        />
      )}
    </section>
  );
}
