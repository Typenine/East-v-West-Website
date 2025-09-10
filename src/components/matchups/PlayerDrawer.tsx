'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { normalizeTeamCode } from '@/lib/constants/nfl-teams';

export type PlayerBasic = {
  id: string;
  name: string;
  pos?: string;
  team?: string;
};

export type TeamStatus = {
  gameId: string;
  opponent?: string;
  isHome: boolean;
  startDate: string;
  state: 'pre' | 'in' | 'post';
  period?: number;
  displayClock?: string;
  possessionTeam?: string;
  scoreFor?: number;
  scoreAgainst?: number;
};

function formatKickoff(dateIso?: string) {
  if (!dateIso) return '';
  try {
    const dt = new Date(dateIso);
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/New_York' }).format(dt);
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }).format(dt);
    return `${day} ${time} ET`;
  } catch {
    return '';
  }
}

function statusLabelFor(team: string | undefined, statuses: Record<string, TeamStatus | undefined>): {
  label: string;
  bucket: 'YTP' | 'IP' | 'FIN' | 'NA';
} {
  if (!team) return { label: '—', bucket: 'NA' };
  const code = normalizeTeamCode(team);
  const s = code ? statuses[code] : undefined;
  if (!s) return { label: '—', bucket: 'NA' };
  const opp = s.opponent || '';
  const vsat = s.isHome ? 'vs' : '@';
  if (s.state === 'pre') return { label: `${vsat} ${opp} • ${formatKickoff(s.startDate)}`, bucket: 'YTP' };
  if (s.state === 'post') {
    const score = (Number.isFinite(s.scoreFor as number) && Number.isFinite(s.scoreAgainst as number)) ? ` ${String(s.scoreFor)}–${String(s.scoreAgainst)}` : '';
    return { label: `Final • ${code}${score} ${vsat} ${opp}`.trim(), bucket: 'FIN' };
  }
  const q = s.period ? `Q${s.period}` : '';
  const clk = s.displayClock ? `${s.displayClock}` : '';
  const parts = [q, clk].filter(Boolean).join(' ');
  return { label: `${vsat} ${opp} • ${parts || 'In Progress'}`.trim(), bucket: 'IP' };
}

type StatMap = Record<string, number | undefined>;

function num(st: StatMap, key: string): number | undefined {
  const v = st?.[key];
  return typeof v === 'number' && isFinite(v) ? v : undefined;
}

function formatStatLine(pos?: string, st?: StatMap): string {
  if (!st) return '';
  const p = (pos || '').toUpperCase();
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

interface PlayerDrawerProps {
  open: boolean;
  onClose: () => void;
  player: PlayerBasic | null;
  season: string;
  week: number;
  currentWeek: number;
  statsLive: Record<string, Record<string, number | undefined>>;
  pointsMap: Record<string, number>;
  statuses: Record<string, TeamStatus | undefined>;
}

type PlayerInfo = {
  injury_status?: string;
  injury_body_part?: string;
  injury_start_date?: string | number;
  status?: string;
  age?: number;
  height?: string;
  weight?: string;
};

export default function PlayerDrawer({ open, onClose, player, season, week, currentWeek, statsLive, pointsMap, statuses }: PlayerDrawerProps) {
  const [info, setInfo] = useState<PlayerInfo | null>(null);
  const [recent, setRecent] = useState<Array<{ week: number; pts: number }>>([]);

  useEffect(() => {
    if (!open || !player) return;
    const pid = player.id;
    let cancelled = false;
    async function loadInfo() {
      try {
        const r = await fetch(`/api/player-info?id=${pid}`, { cache: 'no-store' });
        if (!r.ok) return;
        const j = (await r.json()) as PlayerInfo;
        if (!cancelled) setInfo(j);
      } catch {}
    }
    loadInfo();
    return () => { cancelled = true; };
  }, [open, player]);

  useEffect(() => {
    if (!open || !player) return;
    const pid = player.id;
    let cancelled = false;
    async function loadRecent() {
      try {
        const weeks: number[] = [];
        const cw = Number.isFinite(currentWeek) ? currentWeek : week;
        for (let w = cw - 1; w >= cw - 2 && w >= 1; w--) weeks.push(w);
        const results: Array<{ week: number; pts: number }> = [];
        for (const w of weeks) {
          const r = await fetch(`/api/matchup-points?week=${w}`, { cache: 'no-store' });
          if (!r.ok) continue;
          const j = await r.json();
          const pts = Number(j?.playerPoints?.[pid] ?? 0);
          results.push({ week: w, pts });
        }
        if (!cancelled) setRecent(results);
      } catch {}
    }
    loadRecent();
    return () => { cancelled = true; };
  }, [open, player, currentWeek, week]);

  const st = player ? (statsLive[player.id] || {}) : {};
  const thisWeekPts = player ? Number(pointsMap[player.id] ?? 0) : 0;
  const status = useMemo(() => statusLabelFor(player?.team, statuses), [player?.team, statuses]);

  if (!open || !player) return null;

  return (
    <div className="fixed inset-0 z-50" data-season={season}>
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full sm:w-[420px] evw-surface border-l border-[var(--border)] p-4 overflow-y-auto">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center overflow-hidden">
            <Image src={getTeamLogoPath(player.team || '')} alt={player.team || ''} width={32} height={32} className="object-contain" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{player.name}</div>
            <div className="text-xs text-[var(--muted)]">{player.pos || '—'} • {player.team || 'FA'}</div>
          </div>
          <button className="ml-auto text-sm px-3 py-1 rounded-md border border-[var(--border)] hover:bg-black/10" onClick={onClose}>Close</button>
        </div>

        <div className="mb-4">
          <div className="text-xs text-[var(--muted)] mb-1">This week</div>
          <div className="flex items-center justify-between">
            <div className="text-sm">{status.label}</div>
            <div className="font-bold tabular-nums">{thisWeekPts.toFixed(2)}</div>
          </div>
          {Object.keys(st).length > 0 && (
            <div className="mt-1 text-xs text-[var(--muted)]">{formatStatLine(player.pos, st as Record<string, number | undefined>)}</div>
          )}
        </div>

        {!!info && (
          <div className="mb-4">
            <div className="text-xs text-[var(--muted)] mb-1">Injury / Status</div>
            <div className="text-sm">
              {info.injury_status ? (
                <div>
                  <div>{info.injury_status}{info.injury_body_part ? ` • ${info.injury_body_part}` : ''}</div>
                  {info.injury_start_date ? (
                    <div className="text-xs text-[var(--muted)]">Since {new Date(info.injury_start_date as string | number).toLocaleDateString()}</div>
                  ) : null}
                </div>
              ) : (
                <div>—</div>
              )}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div className="mb-4">
            <div className="text-xs text-[var(--muted)] mb-1">Recent weeks</div>
            <ul className="text-sm space-y-1">
              {recent.map(r => (
                <li key={r.week} className="flex items-center justify-between">
                  <span>Week {r.week}</span>
                  <span className="font-semibold tabular-nums">{r.pts.toFixed(2)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
