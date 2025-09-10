"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
  scoreFor?: number;
  scoreAgainst?: number;
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
    home: { code?: string; score?: number };
    away: { code?: string; score?: number };
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
  const opp = s.opponent || "";
  const vsat = s.isHome ? "vs" : "@";
  if (s.state === "pre") {
    return { label: `${vsat} ${opp} • ${formatKickoff(s.startDate)}`, bucket: "YTP", possession: false };
  }
  if (s.state === "post") {
    const score = (Number.isFinite(s.scoreFor as number) && Number.isFinite(s.scoreAgainst as number))
      ? ` ${String(s.scoreFor)}–${String(s.scoreAgainst)}`
      : "";
    return { label: `Final • ${code} ${score} ${vsat} ${opp}`.trim(), bucket: "FIN", possession: false };
  }
  const q = s.period ? `Q${s.period}` : "";
  const clk = s.displayClock ? `${s.displayClock}` : "";
  const parts = [q, clk].filter(Boolean).join(" ");
  const possess = s.possessionTeam && code && s.possessionTeam.toUpperCase() === code.toUpperCase();
  return { label: `${vsat} ${opp} • ${parts || "In Progress"}`.trim(), bucket: "IP", possession: !!possess };
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
  season,
  totalPts,
  starters,
  bench,
  stats,
}: {
  title: string;
  colorTeam: string; // team name for color styling
  week: number;
  season: string;
  totalPts: number;
  starters: PlayerRow[];
  bench: PlayerRow[];
  stats?: Record<string, Partial<Record<string, number>>>;
}) {
  const [board, setBoard] = useState<ScoreboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const statsTimer = useRef<number | null>(null);
  const [statsLive, setStatsLive] = useState<Record<string, Partial<Record<string, number>>>>(stats || {});

  const allPlayers = useMemo(() => [...starters, ...bench], [starters, bench]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setError(null);
        const res = await fetch(`/api/nfl-scoreboard?week=${week}&season=${encodeURIComponent(season)}` , { cache: "no-store" });
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
  }, [week, season]);

  // Poll week stats so totals update during games
  useEffect(() => {
    let cancelled = false;
    async function loadStats() {
      try {
        const res = await fetch(`/api/nfl-week-stats?season=${encodeURIComponent(season)}&week=${week}`, { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        const next = (j?.stats ?? {}) as Record<string, Partial<Record<string, number>>>;
        if (!cancelled) setStatsLive(next);
      } catch {
        // ignore
      }
    }
    // seed from initial
    setStatsLive(stats || {});
    loadStats();
    statsTimer.current = window.setInterval(loadStats, 30000);
    return () => {
      cancelled = true;
      if (statsTimer.current) window.clearInterval(statsTimer.current);
    };
  }, [season, week, stats]);

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
    let gamesRemaining = gameIds.size;
    // Fallback: if roster empty or no mapped teams, show total NFL games remaining this week
    if ((ytp + ip + fin) === 0 && board?.games) {
      gamesRemaining = board.games.filter(g => g.state !== 'post').length;
    }
    return { ytp, ip, fin, gamesRemaining };
  }, [allPlayers, statuses, board?.games]);

  const posTotals = useMemo(() => sumByPosition(starters), [starters]);
  const benchTotal = useMemo(() => bench.reduce((sum, b) => sum + (b.pts || 0), 0), [bench]);

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
          <span className="px-2 py-0.5 rounded-full bg-black/10 text-white/90">Bench {benchTotal.toFixed(1)}</span>
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
            // Build a compact stat line from optional stats map
            const st = statsLive?.[s.id] || {};
            const statBits: string[] = [];
            if (s.pos === 'QB') {
              const py = st['pass_yd'] || st['pass_yds'];
              const ptd = st['pass_td'];
              const pint = st['pass_int'];
              const ry = st['rush_yd'];
              const rtd = st['rush_td'];
              if (py) statBits.push(`${py} PYD`);
              if (ptd) statBits.push(`${ptd} PTD`);
              if (pint) statBits.push(`${pint} INT`);
              if (ry) statBits.push(`${ry} RYD`);
              if (rtd) statBits.push(`${rtd} RTD`);
            } else if (s.pos === 'RB' || s.pos === 'WR' || s.pos === 'TE') {
              const rec = st['rec'] || st['receptions'];
              const tgt = st['targets'];
              const ryd = st['rush_yd'];
              const rtd = st['rush_td'];
              const ryds = ryd ? `${ryd} RYD` : '';
              const recyd = st['rec_yd'] ? `${st['rec_yd']} REY` : '';
              const rctd = st['rec_td'];
              if (tgt || rec) statBits.push(`${rec ?? 0}/${tgt ?? 0} REC`);
              if (recyd) statBits.push(recyd);
              if (ryds) statBits.push(ryds);
              if (rtd) statBits.push(`${rtd} RTD`);
              if (rctd) statBits.push(`${rctd} RETD`);
            }
            return (
              <li key={s.id} className="flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)] w-8 inline-block">{s.pos || "—"}</span>
                    <span className="truncate">{s.name}</span>
                    <a
                      href={`https://sleeper.com/players/nfl/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] text-xs hover:underline"
                      aria-label={`Open ${s.name} on Sleeper in a new tab`}
                    >↗</a>
                  </div>
                  {statBits.length > 0 && (
                    <div className="text-xs text-[var(--muted)]">{statBits.join(' • ')}</div>
                  )}
                  <div className={`text-xs ${bucketColor} flex items-center gap-2`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${dotCls}`} aria-hidden />
                    <span>{label}</span>
                  </div>
                </div>
                <div className="font-bold tabular-nums text-base">{s.pts.toFixed(2)}</div>
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
            const st = statsLive?.[s.id] || {};
            const statBits: string[] = [];
            if (s.pos === 'QB') {
              const py = st['pass_yd'] || st['pass_yds'];
              const ptd = st['pass_td'];
              const pint = st['pass_int'];
              const ry = st['rush_yd'];
              const rtd = st['rush_td'];
              if (py) statBits.push(`${py} PYD`);
              if (ptd) statBits.push(`${ptd} PTD`);
              if (pint) statBits.push(`${pint} INT`);
              if (ry) statBits.push(`${ry} RYD`);
              if (rtd) statBits.push(`${rtd} RTD`);
            } else if (s.pos === 'RB' || s.pos === 'WR' || s.pos === 'TE') {
              const rec = st['rec'] || st['receptions'];
              const tgt = st['targets'];
              const ryd = st['rush_yd'];
              const rtd = st['rush_td'];
              const ryds = ryd ? `${ryd} RYD` : '';
              const recyd = st['rec_yd'] ? `${st['rec_yd']} REY` : '';
              const rctd = st['rec_td'];
              if (tgt || rec) statBits.push(`${rec ?? 0}/${tgt ?? 0} REC`);
              if (recyd) statBits.push(recyd);
              if (ryds) statBits.push(ryds);
              if (rtd) statBits.push(`${rtd} RTD`);
              if (rctd) statBits.push(`${rctd} RETD`);
            }
            return (
              <li key={s.id} className="flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)] w-8 inline-block">{s.pos || "—"}</span>
                    <span className="truncate">{s.name}</span>
                    <a
                      href={`https://sleeper.com/players/nfl/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--accent)] text-xs hover:underline"
                      aria-label={`Open ${s.name} on Sleeper in a new tab`}
                    >↗</a>
                  </div>
                  {statBits.length > 0 && (
                    <div className="text-xs text-[var(--muted)]">{statBits.join(' • ')}</div>
                  )}
                  <div className={`text-xs ${bucketColor} flex items-center gap-2`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${dotCls}`} aria-hidden />
                    <span>{label}</span>
                  </div>
                </div>
                <div className="font-bold tabular-nums text-base">{s.pts.toFixed(2)}</div>
              </li>
            );
          }) : <li className="text-sm text-[var(--muted)]">No bench players listed.</li>}
        </ul>
      </CardContent>
    </Card>
  );
}
