"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getTeamLogoPath, getTeamColorStyle } from "@/lib/utils/team-utils";
import { normalizeTeamCode } from "@/lib/constants/nfl-teams";

export type PlayerRow = {
  id: string;
  name: string;
  pos?: string;
  team?: string; // NFL team code (Sleeper style)
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
};

type ScoreboardPayload = {
  week: number;
  generatedAt: string;
  teamStatuses: Record<string, TeamStatus>;
  games: Array<{
    id: string;
    startDate: string;
    state: "pre" | "in" | "post";
    period?: number;
    displayClock?: string;
    home: { code?: string };
    away: { code?: string };
    possessionTeam?: string;
  }>;
};

function formatKickoff(dateIso?: string) {
  if (!dateIso) return "";
  try {
    const dt = new Date(dateIso);
    const day = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "America/New_York" }).format(dt);
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(dt);
    return `${day} ${time} ET`;
  } catch {
    return "";
  }
}

function statusLabelFor(team: string | undefined, statuses: Record<string, TeamStatus | undefined>): {
  label: string;
  bucket: "YTP" | "IP" | "FIN" | "NA";
  possession: boolean;
} {
  if (!team) return { label: "—", bucket: "NA", possession: false };
  const code = normalizeTeamCode(team);
  const s = code ? statuses[code] : undefined;
  if (!s) return { label: "—", bucket: "NA", possession: false };
  if (s.state === "pre") {
    return { label: `Pregame • ${formatKickoff(s.startDate)}`, bucket: "YTP", possession: false };
  }
  if (s.state === "post") {
    return { label: "Final", bucket: "FIN", possession: false };
  }
  const q = s.period ? `Q${s.period}` : "";
  const clk = s.displayClock ? `${s.displayClock}` : "";
  const parts = [q, clk].filter(Boolean).join(" ");
  const possess = s.possessionTeam && code && s.possessionTeam.toUpperCase() === code.toUpperCase();
  return { label: `In Progress • ${parts || ""}`.trim(), bucket: "IP", possession: !!possess };
}

function sumByPosition(players: PlayerRow[]) {
  const map = new Map<string, number>();
  for (const p of players) {
    const key = (p.pos || "").toUpperCase();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + (p.pts || 0));
  }
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
}

export default function RosterColumn({
  title,
  colorTeam,
  week,
  totalPts,
  starters,
  bench,
}: {
  title: string;
  colorTeam: string; // team name for color styling
  week: number;
  totalPts: number;
  starters: PlayerRow[];
  bench: PlayerRow[];
}) {
  const [board, setBoard] = useState<ScoreboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const allPlayers = useMemo(() => [...starters, ...bench], [starters, bench]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError(null);
        const res = await fetch(`/api/nfl-scoreboard?week=${week}`, { cache: "no-store" });
        if (!res.ok) throw new Error("scoreboard fetch failed");
        const data = (await res.json()) as ScoreboardPayload;
        if (!cancelled) setBoard(data);
      } catch {
        if (!cancelled) setError("Live status unavailable");
      }
    }
    load();
    timer.current = window.setInterval(load, 30000);
    return () => {
      cancelled = true;
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [week]);

  const statuses = useMemo(() => board?.teamStatuses ?? {}, [board?.teamStatuses]);

  // Roster chips
  const chips = useMemo(() => {
    let ytp = 0, ip = 0, fin = 0;
    const gameIds = new Set<string>();
    for (const p of allPlayers) {
      const code = normalizeTeamCode(p.team);
      if (!code) continue;
      const s = statuses[code];
      if (!s) continue;
      if (s.state !== "post" && s.gameId) gameIds.add(s.gameId);
      if (s.state === "pre") ytp++;
      else if (s.state === "in") ip++;
      else if (s.state === "post") fin++;
    }
    return { ytp, ip, fin, gamesRemaining: gameIds.size };
  }, [allPlayers, statuses]);

  const posTotals = useMemo(() => sumByPosition(starters), [starters]);

  const teamStyle = getTeamColorStyle(colorTeam);

  return (
    <Card>
      <CardHeader className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-[color-mix(in_srgb,var(--surface)_85%,transparent)]"
        style={teamStyle}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
            <Image src={getTeamLogoPath(colorTeam)} alt={colorTeam} width={28} height={28} className="object-contain" />
          </div>
          <CardTitle className="text-current">{title}</CardTitle>
          <div className="ml-auto text-lg font-extrabold">{totalPts.toFixed(2)}</div>
        </div>
        {/* Roster chips */}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="px-2 py-0.5 rounded-full bg-black/20 text-white">Games remaining: {chips.gamesRemaining}</span>
          <span className="px-2 py-0.5 rounded-full bg-black/15 text-white/90">YTP {chips.ytp}</span>
          <span className="px-2 py-0.5 rounded-full bg-black/15 text-white/90">IP {chips.ip}</span>
          <span className="px-2 py-0.5 rounded-full bg-black/15 text-white/90">FIN {chips.fin}</span>
          {/* Position totals for starters */}
          {posTotals.map(([pos, val]) => (
            <span key={pos} className="px-2 py-0.5 rounded-full bg-black/10 text-white/90">{pos} {val.toFixed(1)}</span>
          ))}
        </div>
        {error ? <div className="mt-1 text-xs">{error}</div> : null}
      </CardHeader>

      <CardContent>
        <h3 className="text-sm font-semibold mb-2">Starters</h3>
        <ul className="space-y-2">
          {starters.length > 0 ? starters.map((s) => {
            const { label, bucket, possession } = statusLabelFor(s.team, statuses);
            const dotCls = possession ? "bg-[var(--accent)]" : "bg-[var(--muted)]";
            const bucketColor = bucket === "IP" ? "text-green-600" : bucket === "FIN" ? "text-[var(--muted)]" : "text-amber-600";
            return (
              <li key={s.id} className="flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)] w-8 inline-block">{s.pos || "—"}</span>
                    <span className="truncate">{s.name}</span>
                    <Link
                      href={`https://sleeper.com/players/nfl/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] text-xs hover:underline"
                      aria-label={`Open ${s.name} on Sleeper in a new tab`}
                    >↗</Link>
                  </div>
                  <div className={`text-xs ${bucketColor} flex items-center gap-2`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${dotCls}`} aria-hidden />
                    <span>{label}</span>
                  </div>
                </div>
                <div className="font-semibold tabular-nums">{s.pts.toFixed(2)}</div>
              </li>
            );
          }) : <li className="text-sm text-[var(--muted)]">No starters listed.</li>}
        </ul>

        <h3 className="text-sm font-semibold mt-6 mb-2">Bench</h3>
        <ul className="space-y-2">
          {bench.length > 0 ? bench.map((s) => {
            const { label, bucket, possession } = statusLabelFor(s.team, statuses);
            const dotCls = possession ? "bg-[var(--accent)]" : "bg-[var(--muted)]";
            const bucketColor = bucket === "IP" ? "text-green-600" : bucket === "FIN" ? "text-[var(--muted)]" : "text-amber-600";
            return (
              <li key={s.id} className="flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)] w-8 inline-block">{s.pos || "—"}</span>
                    <span className="truncate">{s.name}</span>
                    <Link
                      href={`https://sleeper.com/players/nfl/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] text-xs hover:underline"
                      aria-label={`Open ${s.name} on Sleeper in a new tab`}
                    >↗</Link>
                  </div>
                  <div className={`text-xs ${bucketColor} flex items-center gap-2`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${dotCls}`} aria-hidden />
                    <span>{label}</span>
                  </div>
                </div>
                <div className="font-semibold tabular-nums">{s.pts.toFixed(2)}</div>
              </li>
            );
          }) : <li className="text-sm text-[var(--muted)]">No bench players listed.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
