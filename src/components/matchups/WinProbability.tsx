"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getTeamColors } from "@/lib/utils/team-utils";
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
  baselines: Record<string, { mean: number; stddev: number; games: number; last3Avg: number }>;
};

type WPModel = {
  trainedAt: string;
  buckets: { range: [number, number]; a: number; b: number; n: number }[];
};

function clamp01(x: number) { return Math.max(0.000001, Math.min(0.999999, x)); }
function sigmoid(z: number) { return 1 / (1 + Math.exp(-z)); }
function logit(p: number) { const pp = clamp01(p); return Math.log(pp / (1 - pp)); }
function applyCalibration(rawP: number, fracRemaining: number, model: WPModel): number {
  const z = logit(clamp01(rawP));
  const bkt = model.buckets.find((b) => fracRemaining >= b.range[0] && fracRemaining < b.range[1]) || model.buckets[0];
  return clamp01(sigmoid(bkt.a * z + bkt.b));
}

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
  variant = 'card',
  side,
  bordered = true,
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
  variant?: 'card' | 'inline';
  side?: 'left' | 'right';
  bordered?: boolean;
}) {
  const [board, setBoard] = useState<ScoreboardPayload | null>(null);
  const timer = useRef<number | null>(null);
  const [baselines, setBaselines] = useState<Record<string, { mean: number; stddev: number; games: number; last3Avg: number }>>({});
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [wpModel, setWpModel] = useState<WPModel | null>(null);
  const [defFactors, setDefFactors] = useState<Record<string, number>>({});
  const [statsLive, setStatsLive] = useState<Record<string, Record<string, number | undefined>>>({});

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

  // Fetch calibrated WP model (Tier 5)
  useEffect(() => {
    let cancelled = false;
    async function loadModel() {
      try {
        const r = await fetch('/api/wp-model', { cache: 'force-cache' });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setWpModel((j?.model ?? null) as WPModel | null);
      } catch {
        // ignore
      }
    }
    loadModel();
    return () => { cancelled = true; };
  }, []);

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

  // Fetch defensive strength factors for opponent adjustment
  useEffect(() => {
    let cancelled = false;
    async function loadDef() {
      try {
        const upto = Math.max(1, Math.min(17, week - 1));
        const r = await fetch(`/api/defense-strength?season=${encodeURIComponent(season)}&uptoWeek=${upto}`, { cache: 'force-cache' });
        if (!r.ok) return;
        const j = await r.json() as { factors?: Record<string, number> };
        if (!cancelled) setDefFactors(j.factors || {});
      } catch {
        // ignore
      }
    }
    loadDef();
    return () => { cancelled = true; };
  }, [season, week]);

  // Fetch week stats for usage signals
  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const r = await fetch(`/api/nfl-week-stats?season=${encodeURIComponent(season)}&week=${week}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const next = (j?.stats ?? {}) as Record<string, Record<string, number | undefined>>;
        if (!cancelled) setStatsLive(next);
      } catch {
        // ignore
      }
    }
    loadStats();
    const id = window.setInterval(loadStats, 30000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [season, week]);

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

  // Sum of per-player projections to align with row projections (recency + defense + usage)
  const sumProj = useMemo(() => {
    function projFor(players: PlayerRow[]): number {
      let total = 0;
      for (const p of players) {
        const pos = (p.pos || '').toUpperCase();
        const basePos = POS_DEFAULT_MEAN[pos] ?? 10;
        const b = baselines[p.id] || { mean: basePos, last3Avg: 0, games: 0, stddev: 0 };
        const games = b.games ?? 0;
        const recencyWeight = (b.last3Avg ?? 0) > 0 ? 0.6 : 0;
        const recencyMean = (recencyWeight * (b.last3Avg ?? 0)) + ((1 - recencyWeight) * (b.mean ?? basePos));
        const alpha = Math.max(0, Math.min(1, games / 6));
        const fullMean = (alpha * recencyMean) + ((1 - alpha) * basePos);
        const frac = fractionRemainingForTeam(p.team);
        const ctxM = contextMultiplier(pos, p.team).meanMul;
        const teamCode = normalizeTeamCode(p.team);
        const oppCode = teamCode ? (statuses[teamCode]?.opponent || '') : '';
        const defMul = oppCode ? (defFactors[oppCode.toUpperCase()] ?? 1) : 1;
        // Usage signal
        let touches = 0; let expectedTouches = 0;
        if (teamCode && statuses[teamCode]?.state === 'in') {
          const fracElapsed = 1 - frac;
          const st = (statsLive?.[p.id] || {}) as Record<string, number | undefined>;
          if (pos === 'QB') { touches = (st['pass_att'] ?? 0) + (st['rush_att'] ?? 0); expectedTouches = 40 * fracElapsed; }
          else if (pos === 'RB') { touches = (st['rush_att'] ?? 0) + (st['targets'] ?? 0); expectedTouches = 18 * fracElapsed; }
          else if (pos === 'WR') { touches = (st['targets'] ?? 0); expectedTouches = 8 * fracElapsed; }
          else if (pos === 'TE') { touches = (st['targets'] ?? 0); expectedTouches = 6 * fracElapsed; }
        }
        const usageRatio = expectedTouches > 0 ? (touches / expectedTouches) : 1;
        const usageMul = Math.max(0.85, Math.min(1.15, usageRatio));
        const expectedRem = fullMean * frac * ctxM * defMul * usageMul;
        const cur = Number(p.pts ?? 0);
        total += cur + expectedRem;
      }
      return total;
    }
    return { left: projFor(leftStarters), right: projFor(rightStarters) };
  }, [leftStarters, rightStarters, baselines, statuses, defFactors, statsLive, POS_DEFAULT_MEAN, contextMultiplier, fractionRemainingForTeam]);

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

  // Global fraction remaining across active teams for calibration bucket selection
  const fracGlobal = useMemo(() => {
    const teams = new Set<string>();
    for (const p of [...leftStarters, ...rightStarters]) {
      const code = normalizeTeamCode(p.team);
      if (code) teams.add(code);
    }
    const arr = Array.from(teams);
    if (arr.length === 0) return 1;
    const vals = arr.map((t) => fractionRemainingForTeam(t));
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.max(0, Math.min(1, avg));
  }, [leftStarters, rightStarters, statuses, fractionRemainingForTeam]);

  // Apply calibration if model available
  const wpCal = useMemo(() => {
    const p = wpModel ? applyCalibration(wp.left, fracGlobal, wpModel) : wp.left;
    const N = wp.N;
    const z = 1.96;
    const phat = p;
    const denom = 1 + (z * z) / N;
    const center = phat + (z * z) / (2 * N);
    const margin = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * N)) / N);
    const lower = Math.max(0, (center - margin) / denom);
    const upper = Math.min(1, (center + margin) / denom);
    return { p, ci: [lower, upper] as [number, number] };
  }, [wp.left, wp.N, wpModel, fracGlobal]);

  const leftPct = Math.round(wpCal.p * 100);
  const rightPct = 100 - leftPct;
  useEffect(() => { setLastUpdated(new Date().toLocaleTimeString()); }, [wpCal.p]);

  // Team-specific bar colors (secondary to pop against header)
  const leftBarColor = getTeamColors(leftTeamName).secondary || 'var(--accent)';
  const rightBarColor = getTeamColors(rightTeamName).secondary || 'var(--accent)';

  if (variant === 'inline') {
    return (
      <>
        {(!side || side === 'left') && (
          <div className={`${bordered ? 'evw-surface border border-[var(--border)] rounded-md p-3' : ''}`}>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{leftTeamName}</span>
              <span>{leftPct}%</span>
            </div>
            <div className={`mt-1 h-2 w-full rounded-full overflow-hidden ${bordered ? 'evw-muted' : 'bg-black/20'}`} aria-hidden>
              <div className="h-full" style={{ width: `${leftPct}%`, backgroundColor: leftBarColor }} />
            </div>
            <div className="mt-1 text-[0.7rem] text-[var(--muted)]">WP 95% CI: {(wpCal.ci[0] * 100).toFixed(0)}%–{(wpCal.ci[1] * 100).toFixed(0)}%</div>
          </div>
        )}
        {(!side || side === 'right') && (
          <div className={`${bordered ? 'evw-surface border border-[var(--border)] rounded-md p-3' : ''}`}>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{rightTeamName}</span>
              <span>{rightPct}%</span>
            </div>
            <div className={`mt-1 h-2 w-full rounded-full overflow-hidden ${bordered ? 'evw-muted' : 'bg-black/20'}`} aria-hidden>
              <div className="h-full" style={{ width: `${rightPct}%`, backgroundColor: rightBarColor }} />
            </div>
            <div className="mt-1 text-[0.7rem] text-[var(--muted)]">WP 95% CI: {(wpCal.ci[0] * 100).toFixed(0)}%–{(wpCal.ci[1] * 100).toFixed(0)}%</div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="mb-6 evw-surface border border-[var(--border)] rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Win Probability (calibrated)</h3>
        <div className="text-xs text-[var(--muted)]">Auto-updates every 30s</div>
      </div>
      <div className="text-xs text-[var(--muted)] mb-3">
        Monte Carlo over baselines with time-remaining & context. 95% CI shown for projected totals.
      </div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{leftTeamName}</span>
        <span>{leftPct}%</span>
      </div>
      <div className="text-[0.75rem] text-[var(--muted)] mb-1">WP 95% CI: {(wpCal.ci[0] * 100).toFixed(0)}%–{(wpCal.ci[1] * 100).toFixed(0)}%</div>
      <div className="h-3 w-full rounded-full overflow-hidden evw-muted" aria-hidden>
        <div className="h-full" style={{ width: `${leftPct}%`, backgroundColor: leftBarColor }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm font-medium">
        <span>{rightTeamName}</span>
        <span>{rightPct}%</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-[var(--muted)]">
        <div>
          <div><span className="text-[var(--text)] font-medium">{leftTeamName}</span> · Proj (sum): {sumProj.left.toFixed(1)} pts</div>
          <div>MC median: {wp.leftProj.toFixed(1)} pts (CI {wp.ci.left[0].toFixed(1)}–{wp.ci.left[1].toFixed(1)})</div>
          <div>Remaining: IP {counts.left.ip}, YTP {counts.left.ytp}</div>
        </div>
        <div className="text-right">
          <div>Proj (sum): {sumProj.right.toFixed(1)} pts · <span className="text-[var(--text)] font-medium">{rightTeamName}</span></div>
          <div>MC median: {wp.rightProj.toFixed(1)} pts (CI {wp.ci.right[0].toFixed(1)}–{wp.ci.right[1].toFixed(1)})</div>
          <div>Remaining: IP {counts.right.ip}, YTP {counts.right.ytp}</div>
        </div>
      </div>
      <div className="mt-2 text-[0.7rem] text-[var(--muted)]">N={wp.N} • Updated {lastUpdated}</div>
    </div>
  );
}
