"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getTeamColors } from "@/lib/utils/team-utils";
import { normalizeTeamCode } from "@/lib/constants/nfl-teams";
import type { PlayerAvailabilityEntry } from "@/lib/utils/player-availability";

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

type PlayerBaseline = {
  mean: number;
  stddev: number;
  games: number;
  last3Avg: number;
  decayedMean: number;
};

type BaselinesPayload = {
  season: string;
  players: number;
  modelVersion?: string;
  baselines: Record<string, PlayerBaseline>;
};

type WPModel = {
  trainedAt: string;
  buckets: { range: [number, number]; a: number; b: number; n: number }[];
};

type ProjectionParam = {
  mean: number;
  sd: number;
};

const POS_DEFAULT_MEAN: Record<string, number> = { QB: 18, RB: 13, WR: 13, TE: 8, K: 8, DEF: 8 };
const POS_DEFAULT_SD: Record<string, number> = { QB: 8, RB: 7, WR: 7, TE: 5, K: 4, DEF: 6 };

function clamp01(x: number) {
  return Math.max(0.000001, Math.min(0.999999, x));
}

function sigmoid(z: number) {
  return 1 / (1 + Math.exp(-z));
}

function logit(p: number) {
  const pp = clamp01(p);
  return Math.log(pp / (1 - pp));
}

function applyCalibration(rawP: number, fracRemaining: number, model: WPModel): number {
  const z = logit(clamp01(rawP));
  const bucket = model.buckets.find((item) => fracRemaining >= item.range[0] && fracRemaining < item.range[1]) || model.buckets[0];
  return bucket ? clamp01(sigmoid(bucket.a * z + bucket.b)) : rawP;
}

function bucketFor(
  team: string | undefined,
  statuses: Record<string, TeamStatus | undefined>,
  isPastWeek: boolean,
): "YTP" | "IP" | "FIN" | "NA" {
  if (!team) return isPastWeek ? "FIN" : "YTP";
  const code = normalizeTeamCode(team);
  const status = code ? statuses[code] : undefined;
  if (!status) return isPastWeek ? "FIN" : "YTP";
  if (status.state === "pre") return "YTP";
  if (status.state === "in") return "IP";
  if (status.state === "post") return "FIN";
  return "NA";
}

function parseClockToMinutes(clock?: string): number {
  if (!clock) return 0;
  const match = /^(\d{1,2}):(\d{2})/.exec(clock);
  if (!match) return 0;
  const min = Number(match[1]);
  const sec = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(sec)) return 0;
  return Math.max(0, Math.min(15, min + sec / 60));
}

function fractionRemainingForTeam(
  teamCode: string | undefined,
  statuses: Record<string, TeamStatus | undefined>,
  isPastWeek: boolean,
): number {
  const code = normalizeTeamCode(teamCode);
  if (!code) return isPastWeek ? 0 : 1;
  const status = statuses[code];
  if (!status) return isPastWeek ? 0 : 1;
  if (status.state === "pre") return 1;
  if (status.state === "post") return 0;
  const period = Number(status.period || 1);
  const clockMin = parseClockToMinutes(status.displayClock);
  const quartersRemaining = Math.max(0, 4 - Math.min(4, period));
  const fractionThisQuarter = Math.max(0, Math.min(1, clockMin / 15));
  const fraction = (quartersRemaining + fractionThisQuarter) / 4;
  return Math.max(0, Math.min(1, period > 4 ? 0.08 : fraction));
}

function contextMultiplier(
  pos: string | undefined,
  teamCode: string | undefined,
  statuses: Record<string, TeamStatus | undefined>,
): { meanMul: number; sdMul: number } {
  const code = normalizeTeamCode(teamCode);
  const status = code ? statuses[code] : undefined;
  if (!status) return { meanMul: 1, sdMul: 1 };

  let meanMul = 1;
  let sdMul = 1;
  const position = (pos || "").toUpperCase();

  if (status.state === "in" && status.isRedZone && ["QB", "RB", "WR", "TE"].includes(position)) {
    meanMul *= 1.08;
    sdMul *= 1.10;
  }
  if (
    status.state === "in"
    && status.possessionTeam
    && code
    && status.possessionTeam.toUpperCase() === code.toUpperCase()
    && ["QB", "RB", "WR", "TE"].includes(position)
  ) {
    meanMul *= 1.05;
  }

  const diff = (status.scoreFor ?? 0) - (status.scoreAgainst ?? 0);
  if (status.state !== "pre") {
    if (diff <= -8) {
      if (position === "WR" || position === "TE") meanMul *= 1.05;
      if (position === "QB") meanMul *= 1.03;
      if (position === "RB") meanMul *= 0.97;
    } else if (diff >= 8) {
      if (position === "RB") meanMul *= 1.03;
      if (position === "WR" || position === "TE") meanMul *= 0.98;
    }
  }

  return { meanMul, sdMul };
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
  variant = "card",
  side,
  bordered = true,
  availability,
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
  variant?: "card" | "inline";
  side?: "left" | "right";
  bordered?: boolean;
  availability?: Record<string, PlayerAvailabilityEntry>;
}) {
  const [board, setBoard] = useState<ScoreboardPayload | null>(null);
  const [baselines, setBaselines] = useState<Record<string, PlayerBaseline>>({});
  const [wpModel, setWpModel] = useState<WPModel | null>(null);
  const [statsLive, setStatsLive] = useState<Record<string, Record<string, number | undefined>>>({});
  const [pointsMap, setPointsMap] = useState<Record<string, number>>({});
  const [lastUpdated, setLastUpdated] = useState("");
  const scoreboardTimer = useRef<number | null>(null);
  const pointsTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/nfl-scoreboard?week=${week}&season=${encodeURIComponent(season)}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as ScoreboardPayload;
        if (!cancelled) setBoard(payload);
      } catch {}
    }
    load();
    scoreboardTimer.current = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      if (scoreboardTimer.current) window.clearInterval(scoreboardTimer.current);
    };
  }, [week, season]);

  useEffect(() => {
    let cancelled = false;
    async function loadModel() {
      try {
        const response = await fetch("/api/wp-model", { cache: "force-cache" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setWpModel((payload?.model ?? null) as WPModel | null);
      } catch {}
    }
    loadModel();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set([...leftStarters, ...rightStarters].map((player) => player.id)));
    if (!ids.length) return;

    async function load() {
      try {
        const url = `/api/player-baselines?season=${encodeURIComponent(season)}&players=${ids.join(",")}&v=statline-v3.4-free-context`;
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) return;
        const payload = (await response.json()) as BaselinesPayload;
        if (!cancelled) setBaselines(payload.baselines || {});
      } catch {}
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [leftStarters, rightStarters, season]);

  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const response = await fetch(`/api/nfl-week-stats?season=${encodeURIComponent(season)}&week=${week}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) {
          setStatsLive((payload?.stats ?? {}) as Record<string, Record<string, number | undefined>>);
        }
      } catch {}
    }
    loadStats();
    const id = window.setInterval(loadStats, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [season, week]);

  useEffect(() => {
    let cancelled = false;
    async function loadPoints() {
      try {
        const response = await fetch(`/api/matchup-points?week=${week}`, { cache: "no-store" });
        if (!response.ok) return;
        const payload = await response.json();
        if (!cancelled) setPointsMap((payload?.playerPoints || {}) as Record<string, number>);
      } catch {}
    }
    loadPoints();
    pointsTimer.current = window.setInterval(loadPoints, 30000);
    return () => {
      cancelled = true;
      if (pointsTimer.current) window.clearInterval(pointsTimer.current);
    };
  }, [week]);

  const statuses = useMemo(() => board?.teamStatuses ?? {}, [board?.teamStatuses]);
  const isPastWeek = useMemo(
    () => Number.isFinite(currentWeek) && week < currentWeek,
    [week, currentWeek],
  );

  const liveTotals = useMemo(() => {
    const hasPointFeed = Object.keys(pointsMap).length > 0;
    const sum = (players: PlayerRow[], fallback: number) => {
      if (!hasPointFeed) return fallback;
      return players.reduce((total, player) => total + Number(pointsMap[player.id] ?? player.pts ?? 0), 0);
    };
    return {
      left: sum(leftStarters, leftTotal),
      right: sum(rightStarters, rightTotal),
    };
  }, [pointsMap, leftStarters, rightStarters, leftTotal, rightTotal]);

  const counts = useMemo(() => {
    const countFor = (players: PlayerRow[]) => {
      let ytp = 0;
      let ip = 0;
      let fin = 0;
      for (const player of players) {
        const bucket = bucketFor(player.team, statuses, isPastWeek);
        if (bucket === "YTP") ytp += 1;
        else if (bucket === "IP") ip += 1;
        else if (bucket === "FIN") fin += 1;
      }
      return { ytp, ip, fin };
    };
    return {
      left: countFor(leftStarters),
      right: countFor(rightStarters),
    };
  }, [leftStarters, rightStarters, statuses, isPastWeek]);

  const projectionState = useMemo(() => {
    function paramsFor(players: PlayerRow[]): ProjectionParam[] {
      return players.map((player) => {
        const position = (player.pos || "").toUpperCase();
        const baseline = baselines[player.id];
        const posMean = POS_DEFAULT_MEAN[position] ?? 10;
        const posSd = POS_DEFAULT_SD[position] ?? 6;
        const fullMean = baseline && Number.isFinite(baseline.mean) && baseline.mean > 0 ? baseline.mean : posMean;
        const fullSd = baseline && Number.isFinite(baseline.stddev) && baseline.stddev > 0 ? baseline.stddev : posSd;
        const availabilityRaw = availability?.[player.id]?.weight;
        const availabilityWeight = Number.isFinite(availabilityRaw)
          ? Math.max(0, Math.min(1, availabilityRaw as number))
          : 1;
        const fraction = fractionRemainingForTeam(player.team, statuses, isPastWeek);
        const context = contextMultiplier(position, player.team, statuses);

        let touches = 0;
        let expectedTouches = 0;
        const teamCode = normalizeTeamCode(player.team);
        if (teamCode && statuses[teamCode]?.state === "in") {
          const elapsed = 1 - fraction;
          const stats = statsLive[player.id] || {};
          if (position === "QB") {
            touches = (stats.pass_att ?? 0) + (stats.rush_att ?? 0);
            expectedTouches = 40 * elapsed;
          } else if (position === "RB") {
            touches = (stats.rush_att ?? 0) + (stats.targets ?? 0);
            expectedTouches = 18 * elapsed;
          } else if (position === "WR") {
            touches = stats.targets ?? 0;
            expectedTouches = 8 * elapsed;
          } else if (position === "TE") {
            touches = stats.targets ?? 0;
            expectedTouches = 6 * elapsed;
          }
        }
        const usageRatio = expectedTouches > 0 ? touches / expectedTouches : 1;
        const usageMul = Math.max(0.85, Math.min(1.15, usageRatio));

        return {
          mean: fullMean * fraction * context.meanMul * usageMul * availabilityWeight,
          sd: Math.max(
            0.05,
            fullSd
              * Math.sqrt(Math.max(0, Math.min(1, fraction)))
              * context.sdMul
              * Math.sqrt(availabilityWeight),
          ),
        };
      });
    }

    const leftParams = paramsFor(leftStarters);
    const rightParams = paramsFor(rightStarters);
    const leftProjected = liveTotals.left + leftParams.reduce((sum, item) => sum + item.mean, 0);
    const rightProjected = liveTotals.right + rightParams.reduce((sum, item) => sum + item.mean, 0);

    const N = 1500;
    let leftWins = 0;
    const leftTotals: number[] = [];
    const rightTotals: number[] = [];

    function sampleNormal(mean: number, sd: number): number {
      const u = 1 - Math.random();
      const v = 1 - Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      return mean + sd * z;
    }

    for (let i = 0; i < N; i += 1) {
      let left = liveTotals.left;
      let right = liveTotals.right;
      for (const param of leftParams) left += Math.max(0, sampleNormal(param.mean, param.sd));
      for (const param of rightParams) right += Math.max(0, sampleNormal(param.mean, param.sd));
      leftTotals.push(left);
      rightTotals.push(right);
      if (left > right) leftWins += 1;
      else if (left === right) leftWins += 0.5;
    }

    const probabilityLeft = leftWins / N;
    const z = 1.96;
    const denominator = 1 + (z * z) / N;
    const center = probabilityLeft + (z * z) / (2 * N);
    const margin = z * Math.sqrt((probabilityLeft * (1 - probabilityLeft) + (z * z) / (4 * N)) / N);
    const lower = Math.max(0, (center - margin) / denominator);
    const upper = Math.min(1, (center + margin) / denominator);

    function quantile(values: number[], q: number) {
      const ordered = [...values].sort((a, b) => a - b);
      const index = Math.max(0, Math.min(ordered.length - 1, Math.floor(q * (ordered.length - 1))));
      return ordered[index];
    }

    return {
      probabilityLeft,
      leftProjected,
      rightProjected,
      leftMedian: quantile(leftTotals, 0.5),
      rightMedian: quantile(rightTotals, 0.5),
      leftCi: [quantile(leftTotals, 0.1), quantile(leftTotals, 0.9)] as [number, number],
      rightCi: [quantile(rightTotals, 0.1), quantile(rightTotals, 0.9)] as [number, number],
      wpCi: [lower, upper] as [number, number],
      N,
    };
  }, [leftStarters, rightStarters, liveTotals, baselines, availability, statuses, statsLive, isPastWeek]);

  const globalFraction = useMemo(() => {
    const teams = new Set<string>();
    for (const player of [...leftStarters, ...rightStarters]) {
      const code = normalizeTeamCode(player.team);
      if (code) teams.add(code);
    }
    if (!teams.size) return 1;
    const values = Array.from(teams).map((team) => fractionRemainingForTeam(team, statuses, isPastWeek));
    return Math.max(0, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length));
  }, [leftStarters, rightStarters, statuses, isPastWeek]);

  const calibrated = useMemo(() => {
    const probability = wpModel
      ? applyCalibration(projectionState.probabilityLeft, globalFraction, wpModel)
      : projectionState.probabilityLeft;
    const N = projectionState.N;
    const z = 1.96;
    const denominator = 1 + (z * z) / N;
    const center = probability + (z * z) / (2 * N);
    const margin = z * Math.sqrt((probability * (1 - probability) + (z * z) / (4 * N)) / N);
    return {
      probability,
      ci: [
        Math.max(0, (center - margin) / denominator),
        Math.min(1, (center + margin) / denominator),
      ] as [number, number],
    };
  }, [projectionState.probabilityLeft, projectionState.N, wpModel, globalFraction]);

  const leftPct = Math.round(calibrated.probability * 100);
  const rightPct = 100 - leftPct;

  useEffect(() => {
    setLastUpdated(new Date().toLocaleTimeString());
  }, [calibrated.probability, liveTotals.left, liveTotals.right]);

  const leftBarColor = getTeamColors(leftTeamName).secondary || "var(--accent)";
  const rightBarColor = getTeamColors(rightTeamName).secondary || "var(--accent)";

  if (variant === "inline") {
    return (
      <>
        {(!side || side === "left") && (
          <div className={`${bordered ? "evw-surface border border-[var(--border)] rounded-md p-3" : ""}`}>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{leftTeamName}</span>
              <span>{leftPct}%</span>
            </div>
            <div className={`mt-1 h-2 w-full rounded-full overflow-hidden ${bordered ? "evw-muted" : "bg-black/20"}`} aria-hidden>
              <div className="h-full" style={{ width: `${leftPct}%`, backgroundColor: leftBarColor }} />
            </div>
            <div className="mt-1 text-[0.7rem] text-[var(--muted)]">
              Proj {projectionState.leftProjected.toFixed(1)} · WP 95% CI: {(calibrated.ci[0] * 100).toFixed(0)}%–{(calibrated.ci[1] * 100).toFixed(0)}%
            </div>
          </div>
        )}
        {(!side || side === "right") && (
          <div className={`${bordered ? "evw-surface border border-[var(--border)] rounded-md p-3" : ""}`}>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>{rightTeamName}</span>
              <span>{rightPct}%</span>
            </div>
            <div className={`mt-1 h-2 w-full rounded-full overflow-hidden ${bordered ? "evw-muted" : "bg-black/20"}`} aria-hidden>
              <div className="h-full" style={{ width: `${rightPct}%`, backgroundColor: rightBarColor }} />
            </div>
            <div className="mt-1 text-[0.7rem] text-[var(--muted)]">
              Proj {projectionState.rightProjected.toFixed(1)} · WP 95% CI: {(calibrated.ci[0] * 100).toFixed(0)}%–{(calibrated.ci[1] * 100).toFixed(0)}%
            </div>
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
        Monte Carlo over V3 projections with live fantasy scoring, time remaining, and game context.
      </div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{leftTeamName}</span>
        <span>{leftPct}%</span>
      </div>
      <div className="text-[0.75rem] text-[var(--muted)] mb-1">
        WP 95% CI: {(calibrated.ci[0] * 100).toFixed(0)}%–{(calibrated.ci[1] * 100).toFixed(0)}%
      </div>
      <div className="h-3 w-full rounded-full overflow-hidden evw-muted" aria-hidden>
        <div className="h-full" style={{ width: `${leftPct}%`, backgroundColor: leftBarColor }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm font-medium">
        <span>{rightTeamName}</span>
        <span>{rightPct}%</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-[var(--muted)]">
        <div>
          <div>
            <span className="text-[var(--text)] font-medium">{leftTeamName}</span> · Live {liveTotals.left.toFixed(2)} · Proj {projectionState.leftProjected.toFixed(1)}
          </div>
          <div>
            MC median: {projectionState.leftMedian.toFixed(1)} pts (CI {projectionState.leftCi[0].toFixed(1)}–{projectionState.leftCi[1].toFixed(1)})
          </div>
          <div>Remaining: IP {counts.left.ip}, YTP {counts.left.ytp}</div>
        </div>
        <div className="text-right">
          <div>
            Live {liveTotals.right.toFixed(2)} · Proj {projectionState.rightProjected.toFixed(1)} · <span className="text-[var(--text)] font-medium">{rightTeamName}</span>
          </div>
          <div>
            MC median: {projectionState.rightMedian.toFixed(1)} pts (CI {projectionState.rightCi[0].toFixed(1)}–{projectionState.rightCi[1].toFixed(1)})
          </div>
          <div>Remaining: IP {counts.right.ip}, YTP {counts.right.ytp}</div>
        </div>
      </div>
      <div className="mt-2 text-[0.7rem] text-[var(--muted)]">N={projectionState.N} · Updated {lastUpdated}</div>
    </div>
  );
}
