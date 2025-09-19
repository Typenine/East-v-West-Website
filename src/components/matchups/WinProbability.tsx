"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { normalizeTeamCode } from "@/lib/constants/nfl-teams";

// Minimal PlayerRow type (mirror of RosterColumn)
type PlayerRow = {
  id: string;
  name: string;
  pos?: string;
  team?: string;
  pts: number;
};

type TeamStatus = {
  gameId: string;
  opponent?: string;
  isHome: boolean;
  startDate: string;
  state: "pre" | "in" | "post";
  period?: number;
  displayClock?: string;
  possessionTeam?: string;
  scoreFor?: number;
  scoreAgainst?: number;
  isRedZone?: boolean;
};

type ScoreboardPayload = {
  week: number;
  generatedAt: string;
  teamStatuses: Record<string, TeamStatus>;
};

type BaselinesPayload = {
  season: string;
  players: number;
  baselines: Record<string, { mean: number; stddev: number; games: number }>;
};

function bucketFor(team: string | undefined, statuses: Record<string, TeamStatus | undefined>, isPastWeek: boolean): "YTP" | "IP" | "FIN" | "NA" {
  if (!team) return isPastWeek ? "FIN" : "YTP";
  const code = normalizeTeamCode(team);
  const s = code ? statuses[code] : undefined;
  if (!s) return isPastWeek ? "FIN" : "YTP";
  if (s.state === "pre") return "YTP";
  if (s.state === "in") return "IP";
  if (s.state === "post") return "FIN";
  return "NA";
}

export default function WinProbability({
  week,
  season,
  leftTeamName,
  rightTeamName,
  leftTotal,
  rightTotal,
  leftStarters,
  rightStarters,
  currentWeek,
}: {
  week: number;
  season: string;
  leftTeamName: string;
  rightTeamName: string;
  leftTotal: number;
  rightTotal: number;
  leftStarters: PlayerRow[];
  rightStarters: PlayerRow[];
  currentWeek: number;
}) {
  const [board, setBoard] = useState<ScoreboardPayload | null>(null);
  const timer = useRef<number | null>(null);
  const [baselines, setBaselines] = useState<Record<string, { mean: number; stddev: number; games: number }>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/nfl-scoreboard?week=${week}&season=${encodeURIComponent(season)}`, { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as ScoreboardPayload;
        if (!cancelled) setBoard(j);
      } catch {
        // ignore
      }
    }
    load();
    timer.current = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [week, season]);

  const statuses = useMemo(() => board?.teamStatuses ?? {}, [board?.teamStatuses]);
  const isPastWeek = useMemo(() => Number.isFinite(currentWeek) && week < currentWeek, [week, currentWeek]);

  // Fetch player baselines in one batch
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set([...leftStarters, ...rightStarters].map((p) => p.id)));
    if (ids.length === 0) return;
    async function load() {
      try {
        const url = `/api/player-baselines?season=${encodeURIComponent(season)}&players=${ids.join(',')}`;
        const res = await fetch(url, { cache: 'force-cache' });
        if (!res.ok) return;
        const j = (await res.json()) as BaselinesPayload;
        if (!cancelled) setBaselines(j.baselines || {});
      } catch {
        // ignore
      }
    }
    load();
    return () => { cancelled = true; };
  }, [leftStarters, rightStarters, season]);

  // Helpers
  function parseClockToMinutes(clock?: string): number {
    if (!clock) return 0;
    const m = /^(\d{1,2}):(\d{2})/.exec(clock);
    if (!m) return 0;
    const min = Number(m[1]);
    const sec = Number(m[2]);
    if (!isFinite(min) || !isFinite(sec)) return 0;
    return Math.max(0, Math.min(15, min + sec / 60));
  }

  function fractionRemainingForTeam(teamCode?: string): number {
    const code = normalizeTeamCode(teamCode);
    if (!code) return 0.5;
    const s = statuses[code];
    if (!s) return isPastWeek ? 0 : 1;
    if (s.state === 'pre') return 1;
    if (s.state === 'post') return 0;
    // in-progress
    const period = Number(s.period || 1);
    const clockMin = parseClockToMinutes(s.displayClock);
    const quartersRemaining = Math.max(0, 4 - Math.min(4, period));
    const fractionThisQuarter = Math.max(0, Math.min(1, clockMin / 15));
    const frac = (quartersRemaining + fractionThisQuarter) / 4;
    // overtime: if period>4, give small remaining weight
    return Math.max(0, Math.min(1, period > 4 ? 0.08 : frac));
  }

  const POS_DEFAULT_MEAN: Record<string, number> = { QB: 18, RB: 13, WR: 13, TE: 8, K: 8, DEF: 8 };
  const POS_DEFAULT_SD: Record<string, number> = { QB: 8, RB: 7, WR: 7, TE: 5, K: 4, DEF: 6 };

  function contextMultiplier(pos?: string, teamCode?: string): { meanMul: number; sdMul: number } {
    const code = normalizeTeamCode(teamCode);
    const s = code ? statuses[code] : undefined;
    if (!s) return { meanMul: 1, sdMul: 1 };
    let meanMul = 1;
    let sdMul = 1;
    const p = (pos || '').toUpperCase();
    // Red zone bump for offensive positions
    if (s.state === 'in' && s.isRedZone && (p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE')) {
      meanMul *= 1.08;
      sdMul *= 1.10;
    }
    // Possession slight bump for offensive positions
    if (s.state === 'in' && s.possessionTeam && code && s.possessionTeam.toUpperCase() === code.toUpperCase()) {
      if (p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE') meanMul *= 1.05;
    }
    // Trailing/leading heuristics
    const diff = (s.scoreFor ?? 0) - (s.scoreAgainst ?? 0);
    if (s.state !== 'pre') {
      if (diff <= -8) {
        // trailing by > 1 score
        if (p === 'WR' || p === 'TE') meanMul *= 1.05;
        if (p === 'QB') meanMul *= 1.03;
        if (p === 'RB') meanMul *= 0.97;
      } else if (diff >= 8) {
        if (p === 'RB') meanMul *= 1.03;
        if (p === 'WR' || p === 'TE') meanMul *= 0.98;
      }
    }
    return { meanMul, sdMul };
  }

  const counts = useMemo(() => {
    function countFor(players: PlayerRow[]): { ytp: number; ip: number; fin: number } {
      let ytp = 0, ip = 0, fin = 0;
      for (const p of players) {
        const b = bucketFor(p.team, statuses, isPastWeek);
        if (b === "YTP") ytp++; else if (b === "IP") ip++; else if (b === "FIN") fin++;
      }
      return { ytp, ip, fin };
    }
    return {
      left: countFor(leftStarters),
      right: countFor(rightStarters),
    };
  }, [leftStarters, rightStarters, statuses, isPastWeek]);

  const wp = useMemo(() => {
    // Build param list for Monte Carlo from baselines and context
    type Param = { mean: number; sd: number };
    function paramsFor(players: PlayerRow[]): Param[] {
      const out: Param[] = [];
      for (const p of players) {
        const b = baselines[p.id];
        const pos = (p.pos || '').toUpperCase();
        const posMean = POS_DEFAULT_MEAN[pos] ?? 10;
        const posSd = POS_DEFAULT_SD[pos] ?? 6;
        const games = b?.games ?? 0;
        // Shrinkage toward pos default
        const alpha = Math.max(0, Math.min(1, games / 6)); // 0..1 by 6 games
        const fullMean = (alpha * (b?.mean ?? posMean)) + ((1 - alpha) * posMean);
        const fullSd = Math.max(0.1, (alpha * (b?.stddev ?? posSd)) + ((1 - alpha) * posSd));
        const frac = fractionRemainingForTeam(p.team);
        const ctx = contextMultiplier(pos, p.team);
        const meanRem = fullMean * frac * ctx.meanMul;
        const sdRem = Math.max(0.05, fullSd * Math.sqrt(Math.max(0, Math.min(1, frac))) * ctx.sdMul);
        out.push({ mean: meanRem, sd: sdRem });
      }
      return out;
    }

    const leftParams = paramsFor(leftStarters);
    const rightParams = paramsFor(rightStarters);

    // Monte Carlo
    const N = 1500;
    let leftWins = 0;
    const leftTotals: number[] = [];
    const rightTotals: number[] = [];
    function sampleNormal(mean: number, sd: number): number {
      // Box-Muller
      const u = 1 - Math.random();
      const v = 1 - Math.random();
      const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
      return mean + sd * z;
    }
    for (let i = 0; i < N; i++) {
      let l = leftTotal;
      let r = rightTotal;
      for (const prm of leftParams) {
        const v = Math.max(0, sampleNormal(prm.mean, prm.sd));
        l += v;
      }
      for (const prm of rightParams) {
        const v = Math.max(0, sampleNormal(prm.mean, prm.sd));
        r += v;
      }
      leftTotals.push(l);
      rightTotals.push(r);
      if (l > r) leftWins += 1; else if (l === r) leftWins += 0.5; // split ties
    }

    const probLeft = leftWins / N;
    // Confidence interval for probability (Wilson score 95%)
    const z = 1.96;
    const phat = probLeft;
    const denom = 1 + (z * z) / N;
    const center = phat + (z * z) / (2 * N);
    const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * N)) / N);
    const lower = Math.max(0, (center - margin) / denom);
    const upper = Math.min(1, (center + margin) / denom);

    // Quantiles for projected totals
    function quantile(arr: number[], q: number) {
      const a = [...arr].sort((a, b) => a - b);
      const idx = Math.max(0, Math.min(a.length - 1, Math.floor(q * (a.length - 1))));
      return a[idx];
    }
    const leftProj = quantile(leftTotals, 0.5);
    const rightProj = quantile(rightTotals, 0.5);
    const ci = { left: [quantile(leftTotals, 0.1), quantile(leftTotals, 0.9)] as [number, number], right: [quantile(rightTotals, 0.1), quantile(rightTotals, 0.9)] as [number, number] };

    return { left: probLeft, right: 1 - probLeft, leftProj, rightProj, ci, ciWP: [lower, upper] as [number, number], N };
  }, [leftStarters, rightStarters, leftTotal, rightTotal, statuses, isPastWeek, baselines, POS_DEFAULT_MEAN, POS_DEFAULT_SD, contextMultiplier, fractionRemainingForTeam]);

  const leftPct = Math.round(wp.left * 100);
  const rightPct = 100 - leftPct;
  useEffect(() => { setLastUpdated(new Date().toLocaleTimeString()); }, [wp.left]);

  return (
    <div className="mb-6 evw-surface border border-[var(--border)] rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Win Probability (experimental)</h3>
        <div className="text-xs text-[var(--muted)]">Auto-updates every 30s</div>
      </div>
      <div className="text-xs text-[var(--muted)] mb-3">
        Monte Carlo over baselines with time-remaining & context. 95% CI shown for projected totals.
      </div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{leftTeamName}</span>
        <span>{leftPct}%</span>
      </div>
      <div className="text-[0.75rem] text-[var(--muted)] mb-1">WP 95% CI: {(wp.ciWP[0] * 100).toFixed(0)}%–{(wp.ciWP[1] * 100).toFixed(0)}%</div>
      <div className="h-3 w-full rounded-full overflow-hidden evw-muted" aria-hidden>
        <div className="h-full bg-[var(--accent)]" style={{ width: `${leftPct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm font-medium">
        <span>{rightTeamName}</span>
        <span>{rightPct}%</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-[var(--muted)]">
        <div>
          <div><span className="text-[var(--text)] font-medium">{leftTeamName}</span> · Proj: {wp.leftProj.toFixed(1)} pts (CI {wp.ci.left[0].toFixed(1)}–{wp.ci.left[1].toFixed(1)})</div>
          <div>Remaining: IP {counts.left.ip}, YTP {counts.left.ytp}</div>
        </div>
        <div className="text-right">
          <div>Proj: {wp.rightProj.toFixed(1)} pts (CI {wp.ci.right[0].toFixed(1)}–{wp.ci.right[1].toFixed(1)}) · <span className="text-[var(--text)] font-medium">{rightTeamName}</span></div>
          <div>Remaining: IP {counts.right.ip}, YTP {counts.right.ytp}</div>
        </div>
      </div>
      <div className="mt-2 text-[0.7rem] text-[var(--muted)]">N={wp.N} • Updated {lastUpdated}</div>
    </div>
  );
}
