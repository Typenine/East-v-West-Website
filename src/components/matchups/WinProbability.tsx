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
    // Baseline expected remaining points by position (very rough heuristic)
    const BASE: Record<string, number> = { QB: 6, RB: 5, WR: 5, TE: 3, K: 3, DEF: 3 };
    function expectedFor(players: PlayerRow[]) {
      let exp = 0;
      for (const p of players) {
        const pos = (p.pos || "").toUpperCase();
        const base = BASE[pos] ?? 4;
        const b = bucketFor(p.team, statuses, isPastWeek);
        const weight = b === "YTP" ? 1 : b === "IP" ? 0.5 : 0; // FIN=0
        exp += base * weight;
      }
      return exp;
    }
    const leftExp = expectedFor(leftStarters);
    const rightExp = expectedFor(rightStarters);
    const leftProj = leftTotal + leftExp;
    const rightProj = rightTotal + rightExp;
    const diff = leftProj - rightProj;
    const k = 12; // scale factor for logistic smoothness
    const probLeft = 1 / (1 + Math.exp(-(diff / k)));
    return { left: probLeft, right: 1 - probLeft, leftProj, rightProj };
  }, [leftStarters, rightStarters, leftTotal, rightTotal, statuses, isPastWeek]);

  const leftPct = Math.round(wp.left * 100);
  const rightPct = 100 - leftPct;

  return (
    <div className="mb-6 evw-surface border border-[var(--border)] rounded-md p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Win Probability (experimental)</h3>
        <div className="text-xs text-[var(--muted)]">Auto-updates every 30s</div>
      </div>
      <div className="text-xs text-[var(--muted)] mb-3">
        Based on current score and a simple expected points model for remaining starters (YTP=100%, IP=50%, FIN=0%).
      </div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{leftTeamName}</span>
        <span>{leftPct}%</span>
      </div>
      <div className="h-3 w-full rounded-full overflow-hidden evw-muted" aria-hidden>
        <div className="h-full bg-[var(--accent)]" style={{ width: `${leftPct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm font-medium">
        <span>{rightTeamName}</span>
        <span>{rightPct}%</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-4 text-xs text-[var(--muted)]">
        <div>
          <div>Proj: {wp.leftProj.toFixed(1)} pts</div>
          <div>Remaining: IP {counts.left.ip}, YTP {counts.left.ytp}</div>
        </div>
        <div className="text-right">
          <div>Proj: {wp.rightProj.toFixed(1)} pts</div>
          <div>Remaining: IP {counts.right.ip}, YTP {counts.right.ytp}</div>
        </div>
      </div>
    </div>
  );
}
