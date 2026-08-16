'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { LeagueMilestone, LeagueMilestoneType } from '@/lib/history/league-history';
import { franchiseHistoryId } from '@/lib/history/league-history';
import type { StatsFranchiseRow } from '@/lib/stats/types';
import { getReadableTextForColors, getTeamColors } from '@/lib/utils/team-utils';

type Filter = 'all' | LeagueMilestoneType;

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'player', label: 'Players' },
  { id: 'franchise', label: 'Franchises' },
  { id: 'record', label: 'Records' },
  { id: 'championship', label: 'Championships' },
];

function TeamBadge({ teamName, franchise }: { teamName: string; franchise?: StatsFranchiseRow }) {
  const colors = getTeamColors(teamName);
  const style = {
    background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary || colors.primary})`,
    color: getReadableTextForColors([colors.primary, colors.secondary]),
  };
  const className = 'inline-flex rounded-md px-2.5 py-1 text-xs font-black shadow-sm';
  return franchise ? <Link href={`/history/franchises/${franchiseHistoryId(franchise)}`} className={className} style={style}>{teamName}</Link> : <span className={className} style={style}>{teamName}</span>;
}

export default function MilestonesClient({ milestones, franchises }: { milestones: LeagueMilestone[]; franchises: StatsFranchiseRow[] }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [season, setSeason] = useState('ALL');
  const franchiseMap = useMemo(() => new Map(franchises.map((row) => [row.teamName, row] as const)), [franchises]);
  const seasons = useMemo(() => Array.from(new Set(milestones.map((item) => item.season))).sort((a, b) => b.localeCompare(a)), [milestones]);
  const rows = useMemo(() => milestones.filter((item) => (filter === 'all' || item.type === filter) && (season === 'ALL' || item.season === season)), [filter, milestones, season]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap gap-2">{FILTERS.map((item) => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`rounded-md border px-3 py-1.5 text-xs font-black ${filter === item.id ? 'border-[var(--accent)] bg-accent-soft text-accent' : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'}`}>{item.label}</button>)}</div>
        <label className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">Season<select value={season} onChange={(event) => setSeason(event.target.value)} className="ml-2 rounded-md border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-normal normal-case tracking-normal text-[var(--text)]"><option value="ALL">All Seasons</option>{seasons.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>

      <div className="text-sm text-[var(--muted)]">{rows.length.toLocaleString()} milestone{rows.length === 1 ? '' : 's'} match the current filters.</div>

      <div className="relative ml-3 border-l-2 border-[var(--border)] pl-6 sm:ml-6 sm:pl-8">
        <div className="space-y-4">
          {rows.map((item) => {
            const franchise = item.teamName ? franchiseMap.get(item.teamName) : undefined;
            return (
              <article key={item.id} className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
                <div className="absolute -left-[31px] top-5 h-3 w-3 rounded-full border-2 border-[var(--surface)] bg-[var(--accent)] sm:-left-[39px]" />
                <div className="flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-[var(--muted)]">
                  <span>{item.season}{item.week ? ` · Week ${item.week}` : ''}</span><span>·</span><span>{item.type}</span>
                  {item.teamName ? <TeamBadge teamName={item.teamName} franchise={franchise} /> : null}
                </div>
                <h2 className="mt-2 text-lg font-black">{item.playerId ? <Link href={`/players/${item.playerId}`} className="text-[var(--accent)] hover:underline">{item.title}</Link> : item.title}</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">{item.detail}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs font-bold">
                  {item.week ? <Link href={`/history/gamebook/${item.season}/${item.week}`} className="text-[var(--accent)] hover:underline">Open weekly gamebook →</Link> : null}
                  {franchise ? <Link href={`/history/franchises/${franchiseHistoryId(franchise)}`} className="text-[var(--accent)] hover:underline">Franchise history →</Link> : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {!rows.length ? <div className="rounded-lg border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">No milestones match those filters.</div> : null}
    </div>
  );
}
