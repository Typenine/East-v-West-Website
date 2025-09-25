"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import PlayerDrawer from "@/components/matchups/PlayerDrawer";
import { getTeamLogoPath, getTeamColorStyle } from "@/lib/utils/team-utils";
import { normalizeTeamCode } from "@/lib/constants/nfl-teams";
import type { PlayerAvailabilityEntry } from "@/lib/utils/player-availability";

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
  isRedZone?: boolean;
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

type BaselinesPayload = {
  season: string;
  players: number;
  baselines: Record<string, { mean: number; stddev: number; games: number; last3Avg: number; decayedMean: number }>;
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
} // Added closing brace here

// Helpers for projections
function parseClockToMinutes(clock?: string): number {
  if (!clock) return 0;
  const m = /^(\d{1,2}):(\d{2})/.exec(clock);
  if (!m) return 0;
  const min = Number(m[1]);
  const sec = Number(m[2]);
  if (!isFinite(min) || !isFinite(sec)) return 0;
  return Math.max(0, Math.min(15, min + sec / 60));
}

function fractionRemainingForTeam(teamCode: string | undefined, statuses: Record<string, TeamStatus | undefined>, isPastWeek: boolean): number {
  const code = normalizeTeamCode(teamCode);
  if (!code) return 0.5;
  const s = statuses[code];
  if (!s) return isPastWeek ? 0 : 1;
  if (s.state === 'pre') return 1;
  if (s.state === 'post') return 0;
  const period = Number(s.period || 1);
  const clockMin = parseClockToMinutes(s.displayClock);
  const quartersRemaining = Math.max(0, 4 - Math.min(4, period));
  const fractionThisQuarter = Math.max(0, Math.min(1, clockMin / 15));
  const frac = (quartersRemaining + fractionThisQuarter) / 4;
  return Math.max(0, Math.min(1, period > 4 ? 0.08 : frac));
}

function contextMultiplier(pos?: string, teamCode?: string, statuses?: Record<string, TeamStatus | undefined>): number {
  const code = normalizeTeamCode(teamCode);
  const s = code && statuses ? statuses[code] : undefined;
  if (!s) return 1;
  let meanMul = 1;
  const p = (pos || '').toUpperCase();
  if (s.state === 'in' && s.isRedZone && (p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE')) meanMul *= 1.08;
  if (s.state === 'in' && s.possessionTeam && code && s.possessionTeam.toUpperCase() === code.toUpperCase()) {
    if (p === 'QB' || p === 'RB' || p === 'WR' || p === 'TE') meanMul *= 1.05;
  }
  const diff = (s.scoreFor ?? 0) - (s.scoreAgainst ?? 0);
  if (s.state !== 'pre') {
    if (diff <= -8) {
      if (p === 'WR' || p === 'TE') meanMul *= 1.05;
      if (p === 'QB') meanMul *= 1.03;
      if (p === 'RB') meanMul *= 0.97;
    } else if (diff >= 8) {
      if (p === 'RB') meanMul *= 1.03;
      if (p === 'WR' || p === 'TE') meanMul *= 0.98;
    }
  }
  return meanMul;
}

const POS_DEFAULT_MEAN: Record<string, number> = { QB: 18, RB: 13, WR: 13, TE: 8, K: 8, DEF: 8 };


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
  const score = (Number.isFinite(s.scoreFor as number) && Number.isFinite(s.scoreAgainst as number))
    ? `${String(s.scoreFor)}–${String(s.scoreAgainst)}`
    : undefined;
  const matchup = score ? `${code} ${score} ${vsat} ${opp}` : `${vsat} ${opp}`;
  return { label: `${matchup} • ${parts || "In Progress"}`.trim(), bucket: "IP", possession: !!possess };
}

function sumByPositionOrdered(players: PlayerRow[]) {
  const ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"] as const;
  const totals: Record<string, number> = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  for (const p of players) {
    const key = (p.pos || "").toUpperCase();
    if (!key || totals[key] === undefined) continue;
    totals[key] += p.pts || 0;
  }
  return (ORDER as readonly string[]).map((pos) => [pos, totals[pos] || 0] as [string, number]);
}

type StatMap = Record<string, number | undefined>;

function num(st: StatMap, key: string): number | undefined {
  const v = st?.[key];
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

function formatStatLine(pos?: string, stInput?: Partial<Record<string, number>>): string {
  if (!stInput) return "";
  const st = stInput as StatMap;
  const p = (pos || "").toUpperCase();
  const parts: string[] = [];
  if (p === 'QB') {
    const cmp = num(st, 'pass_cmp') ?? num(st, 'cmp');
    const att = num(st, 'pass_att') ?? num(st, 'att');
    const pyd = num(st, 'pass_yd') ?? num(st, 'pass_yds');
    const ptd = num(st, 'pass_td');
    const ratt = num(st, 'rush_att');
    const ryd = num(st, 'rush_yd');
    const rtd = num(st, 'rush_td');
    if (cmp !== undefined && att !== undefined) parts.push(`${cmp}/${att} CMP`);
    if (pyd) parts.push(`${pyd} YD`);
    if (ptd) parts.push(`${ptd} TD`);
    if (ratt) parts.push(`${ratt} CAR`);
    if (ryd) parts.push(`${ryd} YD`);
    if (rtd) parts.push(`${rtd} TD`);
  } else if (p === 'RB') {
    const ratt = num(st, 'rush_att');
    const ryd = num(st, 'rush_yd');
    const rtd = num(st, 'rush_td');
    const rec = num(st, 'rec') ?? num(st, 'receptions');
    const tgt = num(st, 'targets');
    const ryds = num(st, 'rec_yd');
    const fuml = num(st, 'fum_lost') ?? num(st, 'fumbles_lost');
    if (ratt) parts.push(`${ratt} CAR`);
    if (ryd) parts.push(`${ryd} YD`);
    if (rtd) parts.push(`${rtd} TD`);
    if (rec || tgt) parts.push(`${rec ?? 0}/${tgt ?? 0} REC`);
    if (ryds) parts.push(`${ryds} YD`);
    if (fuml) parts.push(`${fuml} FUM LOST`);
  } else if (p === 'WR') {
    const rec = num(st, 'rec') ?? num(st, 'receptions');
    const ryds = num(st, 'rec_yd');
    const rtd = num(st, 'rec_td');
    if (rec) parts.push(`${rec} REC`);
    if (ryds) parts.push(`${ryds} YD`);
    if (rtd) parts.push(`${rtd} TD`);
  } else if (p === 'TE') {
    const rec = num(st, 'rec') ?? num(st, 'receptions');
    const tgt = num(st, 'targets');
    const ryds = num(st, 'rec_yd');
    if (rec || tgt) parts.push(`${rec ?? 0}/${tgt ?? 0} REC`);
    if (ryds) parts.push(`${ryds} YD`);
  } else if (p === 'K') {
    const fgm = num(st, 'fgm');
    const fga = num(st, 'fga');
    const xpm = num(st, 'xpm');
    const xpa = num(st, 'xpa');
    const m40 = num(st, 'fgm_40_49') ?? num(st, 'fgm_40');
    const m50 = num(st, 'fgm_50_59');
    const m50p = num(st, 'fgm_50+') ?? num(st, 'fgm_60+');
    if (fgm !== undefined && fga !== undefined) parts.push(`${fgm}/${fga} FG`);
    if (m40) parts.push(`${m40} FG (40-49)`);
    if (m50) parts.push(`${m50} FG (50-59)`);
    if (m50p) parts.push(`${m50p} FG (50+)`);
    if (xpm !== undefined && xpa !== undefined) parts.push(`${xpm}/${xpa} XP`);
  } else if (p === 'DEF') {
    const itc = num(st, 'def_int') ?? num(st, 'int');
    const pa = num(st, 'pts_allow') ?? num(st, 'def_pts_allow');
    const ya = num(st, 'yds_allow') ?? num(st, 'def_yds_allow');
    const sk = num(st, 'sack') ?? num(st, 'def_sack');
    const ff = num(st, 'ff') ?? num(st, 'def_ff');
    const fr = num(st, 'fr') ?? num(st, 'def_fr');
    if (itc) parts.push(`${itc} INT`);
    if (pa !== undefined) parts.push(`${pa} PTS ALLOW`);
    if (ya !== undefined) parts.push(`${ya} YDS ALLOW`);
    if (sk) parts.push(`${sk} SACK`);
    if (ff) parts.push(`${ff} FF`);
    if (fr) parts.push(`${fr} FUM REC`);
  }
  return parts.join(', ');
}

export default function RosterColumn({
  title,
  colorTeam,
  week,
  season,
  currentWeek,
  totalPts,
  starters,
  bench,
  stats,
  headerExtras,
  availability,
}: {
  title: string;
  colorTeam: string; // team name for color styling
  week: number;
  season: string;
  currentWeek: number;
  totalPts: number;
  starters: PlayerRow[];
  bench: PlayerRow[];
  stats?: Record<string, Partial<Record<string, number>>>;
  headerExtras?: ReactNode;
  availability?: Record<string, PlayerAvailabilityEntry>;
}) {
  const [board, setBoard] = useState<ScoreboardPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const statsTimer = useRef<number | null>(null);
  const [statsLive, setStatsLive] = useState<Record<string, Partial<Record<string, number>>>>(stats || {});
  const [showDelta, setShowDelta] = useState(false);
  const prevPtsRef = useRef<Record<string, number>>({});
  const [deltaMap, setDeltaMap] = useState<Record<string, number>>({});
  const [pointsMap, setPointsMap] = useState<Record<string, number>>({});
  const pointsTimer = useRef<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerPlayer, setDrawerPlayer] = useState<PlayerRow | null>(null);
  const [filter, setFilter] = useState<'ALL' | 'IP' | 'YTP' | 'FIN'>('ALL');
  const [flashOn, setFlashOn] = useState<Record<string, boolean>>({});
  const flashTimersRef = useRef<Record<string, number>>({});
  const [baselinesMap, setBaselinesMap] = useState<Record<string, { mean: number; stddev: number; games: number; last3Avg: number; decayedMean: number }>>({});
  const [defFactors, setDefFactors] = useState<Record<string, number>>({});

  useEffect(() => {
    const ids = [...starters, ...bench].map(p => p.id);
    const next: Record<string, number> = {};
    for (const id of ids) {
      const cur = Number(pointsMap[id] ?? 0);
      const prev = prevPtsRef.current[id];
      next[id] = prev === undefined ? 0 : Number((cur - prev).toFixed(2));
      prevPtsRef.current[id] = cur;
    }
    setDeltaMap(next);
  }, [pointsMap, starters, bench]);

  // Trigger a brief flash when a player's points change
  useEffect(() => {
    const ids = [...starters, ...bench].map(p => p.id);
    for (const id of ids) {
      const d = deltaMap[id] || 0;
      if (d !== 0) {
        // Clear any existing timer
        if (flashTimersRef.current[id]) {
          window.clearTimeout(flashTimersRef.current[id]);
        }
        setFlashOn((prev) => ({ ...prev, [id]: true }));
        flashTimersRef.current[id] = window.setTimeout(() => {
          setFlashOn((prev) => ({ ...prev, [id]: false }));
        }, 1200);
      }
    }
    return () => {
      // nothing to clean here; timers are cleared on re-trigger and unmount
    };
  }, [deltaMap, starters, bench]);

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

  // Poll Sleeper matchup points for live deltas (and optional live points display)
  useEffect(() => {
    let cancelled = false;
    async function loadPoints() {
      try {
        const r = await fetch(`/api/matchup-points?week=${week}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        const pm = (j?.playerPoints || {}) as Record<string, number>;
        if (!cancelled) setPointsMap(pm);
      } catch {
        // ignore
      }
    }
    loadPoints();
    pointsTimer.current = window.setInterval(loadPoints, 30000);
    return () => {
      cancelled = true;
      if (pointsTimer.current) window.clearInterval(pointsTimer.current);
    };
  }, [week]);

  // Fetch baselines for starters + bench to support per-player projections
  useEffect(() => {
    let cancelled = false;
    const ids = Array.from(new Set([...starters, ...bench].map((p) => p.id)));
    if (ids.length === 0) return;
    async function load() {
      try {
        const url = `/api/player-baselines?season=${encodeURIComponent(season)}&players=${ids.join(',')}`;
        const r = await fetch(url, { cache: 'force-cache' });
        if (!r.ok) return;
        const j = (await r.json()) as BaselinesPayload;
        if (!cancelled) setBaselinesMap(j.baselines || {});
      } catch {
        // ignore
      }
    }
    load();
    return () => { cancelled = true; };
  }, [season, starters, bench]);

  // Fetch defensive strength factors (opponent adjustment)
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

  const statuses = useMemo(() => board?.teamStatuses ?? {}, [board?.teamStatuses]);
  const isPastWeek = useMemo(() => Number.isFinite(currentWeek) && week < currentWeek, [week, currentWeek]);

  // Roster chips
  const chips = useMemo(() => {
    let ytp = 0, ip = 0, fin = 0;
    const hasStatuses = statuses && Object.keys(statuses).length > 0;
    for (const p of starters) {
      const code = normalizeTeamCode(p.team);
      const s = code ? statuses[code] : undefined;
      if (hasStatuses && s) {
        if (s.state === "pre") ytp++;
        else if (s.state === "in") ip++;
        else if (s.state === "post") fin++;
        else ytp++;
      } else {
        // No live board entry: assume scheduled for current/future weeks, final for past weeks
        if (isPastWeek) fin++; else ytp++;
      }
    }
    const playersRemaining = ytp + ip;
    return { ytp, ip, fin, playersRemaining };
  }, [starters, statuses, isPastWeek]);

  const posTotals = useMemo(() => sumByPositionOrdered(starters), [starters]);
  const benchTotal = useMemo(() => bench.reduce((sum, b) => sum + (b.pts || 0), 0), [bench]);
  const teamDelta = useMemo(() => starters.reduce((acc, p) => acc + (deltaMap[p.id] || 0), 0), [deltaMap, starters]);

  const teamStyle = getTeamColorStyle(colorTeam);

  // Starter status counts for quick filter buttons
  const starterCounts = useMemo(() => {
    let ytp = 0, ip = 0, fin = 0;
    for (const s of starters) {
      const res = statusLabelFor(s.team, statuses);
      const bucket = res.bucket === 'NA' ? (isPastWeek ? 'FIN' : 'YTP') : res.bucket;
      if (bucket === 'YTP') ytp++;
      else if (bucket === 'IP') ip++;
      else if (bucket === 'FIN') fin++;
    }
    return { all: starters.length, ytp, ip, fin };
  }, [starters, statuses, isPastWeek]);

  const startersFiltered = useMemo(() => {
    if (filter === 'ALL') return starters;
    return starters.filter((s) => {
      const res = statusLabelFor(s.team, statuses);
      const bucket = res.bucket === 'NA' ? (isPastWeek ? 'FIN' : 'YTP') : res.bucket;
      return bucket === filter;
    });
  }, [filter, starters, statuses, isPastWeek]);

  // Projected totals per player (final = current points + expected remaining)
  const projTotals = useMemo(() => {
    const map: Record<string, number> = {};
    const starterSet = new Set(starters.map((p) => p.id));
    const all = [...starters, ...bench];
    for (const s of all) {
      const pos = (s.pos || '').toUpperCase();
      const basePos = POS_DEFAULT_MEAN[pos] ?? 10;
      const b = baselinesMap[s.id];
      const games = b?.games ?? 0;
      const curPts = Number(pointsMap[s.id] ?? s.pts);
      const st = (statsLive?.[s.id] || {}) as Record<string, number | undefined>;
      const hasLiveActivity = Object.values(st).some((v) => (v ?? 0) > 0);
      const isStarter = starterSet.has(s.id);
      const hasHistory = games > 0;
      let shouldProject = isStarter || hasHistory || hasLiveActivity || curPts > 0;
      // Depth chart guard: suppress projections for backup QBs with no history/snaps
      if (!isStarter && pos === 'QB' && !hasLiveActivity && curPts === 0 && !hasHistory) {
        shouldProject = false;
      }

      const availabilityWeightRaw = availability?.[s.id]?.weight;
      const availabilityWeight = Number.isFinite(availabilityWeightRaw) ? Math.max(0, Math.min(1, availabilityWeightRaw as number)) : 1;
      if (availabilityWeight === 0) shouldProject = false;

      const recent = (b?.decayedMean ?? 0) > 0 ? b!.decayedMean : ((b?.last3Avg ?? 0) > 0 ? b!.last3Avg : (b?.mean ?? basePos));
      const recencyWeight = (b?.decayedMean ?? 0) > 0 ? 0.7 : ((b?.last3Avg ?? 0) > 0 ? 0.6 : 0);
      const recencyMean = (recencyWeight * recent) + ((1 - recencyWeight) * (b?.mean ?? basePos));
      const alpha = Math.max(0, Math.min(1, games / 6));
      const fullMean = (alpha * recencyMean) + ((1 - alpha) * basePos);

      const frac = shouldProject ? fractionRemainingForTeam(s.team, statuses, isPastWeek) : 0;
      const teamCode = normalizeTeamCode(s.team);
      const oppCode = teamCode ? (statuses[teamCode]?.opponent || '') : '';
      const defMul = oppCode ? (defFactors[oppCode.toUpperCase()] ?? 1) : 1;
      const ctx = shouldProject ? contextMultiplier(pos, s.team, statuses) : 1;

      let touches = 0; let expectedTouches = 0;
      if (shouldProject && teamCode && statuses[teamCode]?.state === 'in') {
        const fracElapsed = 1 - frac;
        if (pos === 'QB') {
          touches = (st['pass_att'] ?? 0) + (st['rush_att'] ?? 0);
          expectedTouches = 40 * fracElapsed;
        } else if (pos === 'RB') {
          touches = (st['rush_att'] ?? 0) + (st['targets'] ?? 0);
          expectedTouches = 18 * fracElapsed;
        } else if (pos === 'WR') {
          touches = (st['targets'] ?? 0);
          expectedTouches = 8 * fracElapsed;
        } else if (pos === 'TE') {
          touches = (st['targets'] ?? 0);
          expectedTouches = 6 * fracElapsed;
        }
      }
      const usageRatio = expectedTouches > 0 ? (touches / expectedTouches) : 1;
      const usageMul = Math.max(0.85, Math.min(1.15, usageRatio));

      const expectedRem = shouldProject ? (fullMean * frac * ctx * defMul * usageMul * availabilityWeight) : 0;
      const total = curPts + expectedRem;
      map[s.id] = Number.isFinite(total) ? total : curPts;
    }
    return map;
  }, [starters, bench, baselinesMap, statuses, isPastWeek, pointsMap, defFactors, statsLive, availability]);

  // Team total projected (final) using starters only (sum of per-player projections)
  const projTeamTotal = useMemo(() => {
    let sum = 0;
    for (const s of starters) {
      const curPts = Number(pointsMap[s.id] ?? s.pts);
      const proj = projTotals[s.id] ?? curPts;
      sum += proj;
    }
    return sum;
  }, [starters, projTotals, pointsMap]);

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
          <div className="ml-auto flex items-center gap-4">
            <div className="text-right leading-tight">
              <div className="text-lg font-extrabold">{totalPts.toFixed(2)}</div>
              <div className="text-sm font-semibold">Proj {projTeamTotal.toFixed(1)}</div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowDelta(v => !v)} className="text-xs px-2 py-0.5 rounded-md border border-[var(--border)] hover:bg-black/10">Δ {showDelta ? 'ON' : 'OFF'}</button>
              {showDelta && (
                <div className={`text-sm font-semibold ${teamDelta > 0 ? 'text-green-200' : teamDelta < 0 ? 'text-red-200' : 'text-white/80'}`}>{teamDelta > 0 ? `+${teamDelta.toFixed(2)}` : teamDelta.toFixed(2)}</div>
              )}
            </div>
          </div>
        </div>
        {/* Roster chips */}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {posTotals.map(([pos, val]) => (
            <span key={pos} className="px-2 py-0.5 rounded-full bg-black/10 text-white/90">{pos} {val.toFixed(1)}</span>
          ))}
          <span className="px-2 py-0.5 rounded-full bg-black/10 text-white/90">Bench {benchTotal.toFixed(1)}</span>
          <span className="px-2 py-0.5 rounded-full bg-black/20 text-white">Players remaining: {chips.playersRemaining}</span>
          <span className="px-2 py-0.5 rounded-full bg-black/15 text-white/90">FIN {chips.fin}</span>
        </div>
        {headerExtras ? (
          <div className="mt-2">
            {headerExtras}
          </div>
        ) : null}
        {error ? <div className="mt-1 text-xs">{error}</div> : null}
      </CardHeader>

      <CardContent>
        <h3 className="text-sm font-semibold mb-2">Starters</h3>
        {/* Quick filters */}
        <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Filter starters by status">
          <button type="button" className={`px-2 py-1 rounded-md text-xs border ${filter === 'ALL' ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'evw-surface text-[var(--text)] border-[var(--border)]'}`} aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')}>All ({starterCounts.all})</button>
          <button type="button" className={`px-2 py-1 rounded-md text-xs border ${filter === 'IP' ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'evw-surface text-[var(--text)] border-[var(--border)]'}`} aria-pressed={filter === 'IP'} onClick={() => setFilter('IP')}>IP ({starterCounts.ip})</button>
          <button type="button" className={`px-2 py-1 rounded-md text-xs border ${filter === 'YTP' ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'evw-surface text-[var(--text)] border-[var(--border)]'}`} aria-pressed={filter === 'YTP'} onClick={() => setFilter('YTP')}>YTP ({starterCounts.ytp})</button>
          <button type="button" className={`px-2 py-1 rounded-md text-xs border ${filter === 'FIN' ? 'bg-[var(--accent)] text-white border-[var(--accent)]' : 'evw-surface text-[var(--text)] border-[var(--border)]'}`} aria-pressed={filter === 'FIN'} onClick={() => setFilter('FIN')}>FIN ({starterCounts.fin})</button>
        </div>
        <ul className="space-y-2">
          {(startersFiltered.length > 0 ? startersFiltered : starters).map((s) => {
            const { label, bucket, possession } = (() => {
              const res = statusLabelFor(s.team, statuses);
              if (res.bucket === 'NA') {
                return isPastWeek ? { label: 'Final', bucket: 'FIN' as const, possession: false } : { label: 'Scheduled', bucket: 'YTP' as const, possession: false };
              }
              return res;
            })();
            const dotCls = possession ? "bg-[var(--accent)]" : "bg-[var(--muted)]";
            const bucketColor = bucket === "IP" ? "text-green-600" : bucket === "FIN" ? "text-[var(--muted)]" : "text-amber-600";
            const st = statsLive?.[s.id] || {};
            const formatted = formatStatLine(s.pos, st);
            const curPts = Number(pointsMap[s.id] ?? s.pts);
            const d = deltaMap[s.id] || 0;
            const code = normalizeTeamCode(s.team);
            const tstat = code ? statuses[code] : undefined;
            const isRZ = !!tstat?.isRedZone && bucket === 'IP';
            return (
              <li key={s.id} className={`flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2 transition-colors ${flashOn[s.id] ? (d > 0 ? 'bg-green-500/10' : 'bg-red-500/10') : ''}`}>
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)] w-8 inline-block">{s.pos || "—"}</span>
                    <button
                      type="button"
                      className="truncate text-left hover:underline"
                      onClick={() => { setDrawerPlayer(s); setDrawerOpen(true); }}
                    >
                      {s.name}
                    </button>
                  </div>
                  {formatted && (
                    <div className="text-xs text-[var(--muted)]">{formatted}</div>
                  )}
                  <div className={`text-xs ${bucketColor} flex items-center gap-2`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${dotCls}`} aria-hidden />
                    <span>{label}</span>
                    {possession && <span className="ml-1 px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text)]">POS</span>}
                    {isRZ && <span className="ml-1 px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">RZ</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums text-base">{curPts.toFixed(2)}</div>
                  {showDelta && (
                    <div className={`text-xs tabular-nums ${d > 0 ? 'text-green-600' : d < 0 ? 'text-red-600' : 'text-[var(--muted)]'}`}>{d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2)}</div>
                  )}
                  <div className="text-[0.75rem] text-[var(--text)] font-medium">(Proj {((projTotals[s.id] ?? curPts)).toFixed(1)})</div>
                </div>
              </li>
            );
          })}
        </ul>

        <h3 className="text-sm font-semibold mt-6 mb-2">Bench</h3>
        <ul className="space-y-2">
          {bench.length > 0 ? bench.map((s) => {
            const { label, bucket, possession } = statusLabelFor(s.team, statuses);
            const dotCls = possession ? "bg-[var(--accent)]" : "bg-[var(--muted)]";
            const bucketColor = bucket === "IP" ? "text-green-600" : bucket === "FIN" ? "text-[var(--muted)]" : "text-amber-600";
            const st = statsLive?.[s.id] || {};
            const formatted = formatStatLine(s.pos, st);
            const curPts = Number(pointsMap[s.id] ?? s.pts);
            const d = deltaMap[s.id] || 0;
            const code = normalizeTeamCode(s.team);
            const tstat = code ? statuses[code] : undefined;
            const isRZ = !!tstat?.isRedZone && bucket === 'IP';
            return (
              <li key={s.id} className={`flex items-center justify-between evw-surface border border-[var(--border)] rounded-md px-3 py-2 transition-colors ${flashOn[s.id] ? (d > 0 ? 'bg-green-500/10' : 'bg-red-500/10') : ''}`}>
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    <span className="text-xs text-[var(--muted)] w-8 inline-block">{s.pos || "—"}</span>
                    <button
                      type="button"
                      className="truncate text-left hover:underline"
                      onClick={() => { setDrawerPlayer(s); setDrawerOpen(true); }}
                    >
                      {s.name}
                    </button>
                  </div>
                  {formatted && (
                    <div className="text-xs text-[var(--muted)]">{formatted}</div>
                  )}
                  <div className={`text-xs ${bucketColor} flex items-center gap-2`}>
                    <span className={`inline-block w-2 h-2 rounded-full ${dotCls}`} aria-hidden />
                    <span>{label}</span>
                    {possession && <span className="ml-1 px-1.5 py-0.5 rounded border border-[var(--border)] text-[var(--text)]">POS</span>}
                    {isRZ && <span className="ml-1 px-1.5 py-0.5 rounded bg-red-600 text-white font-bold">RZ</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold tabular-nums text-base">{curPts.toFixed(2)}</div>
                  {showDelta && (
                    <div className={`text-xs tabular-nums ${d > 0 ? 'text-green-600' : d < 0 ? 'text-red-600' : 'text-[var(--muted)]'}`}>{d > 0 ? `+${d.toFixed(2)}` : d.toFixed(2)}</div>
                  )}
                  <div className="text-[0.75rem] text-[var(--text)] font-medium">(Proj {((projTotals[s.id] ?? curPts)).toFixed(1)})</div>
                </div>
              </li>
            );
          }) : <li className="text-sm text-[var(--muted)]">No bench players listed.</li>}
        </ul>
      </CardContent>
      {/* Player Drawer for details */}
      <PlayerDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        player={drawerPlayer}
        season={season}
        week={week}
        currentWeek={currentWeek}
        statsLive={statsLive as Record<string, Record<string, number | undefined>>}
        pointsMap={pointsMap}
        statuses={statuses}
      />
    </Card>
  );
}
