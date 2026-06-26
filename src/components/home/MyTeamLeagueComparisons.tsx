'use client';

import { useState } from 'react';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type {
  TeamDashboardAgePosition,
  TeamDashboardComparisonRow,
  TeamDashboardResponse,
} from '@/lib/home/team-dashboard-types';
import {
  formatTeamRecord,
  ordinalPlacement,
  TeamRankBox,
} from '@/components/home/MyTeamCardParts';

function formatAverage(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(1);
}

function placementDetail(rank: number | null | undefined, leagueSize: number): string {
  return rank ? `${ordinalPlacement(rank)} of ${leagueSize}` : 'Not ranked';
}

function agePlacementDetail(rank: number | null | undefined, leagueSize: number): string {
  return rank ? `${ordinalPlacement(rank)}-youngest of ${leagueSize}` : 'Age rank unavailable';
}

function ComparisonButton({
  label,
  value,
  detail,
  active,
  onClick,
  title,
}: {
  label: string;
  value: string;
  detail: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      title={title}
      className="rounded-md px-2.5 py-2 text-left w-full transition-colors"
      style={{
        background: active ? PANEL.tintMedium : PANEL.tint,
        border: `1px solid ${active ? PANEL.border : PANEL.hairline}`,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>
          {label}
        </span>
        <span className="text-[9px]" style={broadcastFaintTextStyle} aria-hidden>
          {active ? '▲' : '▼'}
        </span>
      </div>
      <div className="text-sm font-bold mt-0.5 tabular-nums" style={broadcastBodyTextStyle}>
        {value}
      </div>
      <div className="text-[10px] mt-0.5 leading-snug" style={broadcastMutedTextStyle}>
        {detail}
      </div>
    </button>
  );
}

function CompactComparisonTable({
  title,
  note,
  rows,
  teamName,
  accent,
  formatValue,
}: {
  title: string;
  note: string;
  rows: TeamDashboardComparisonRow[];
  teamName: string;
  accent: string;
  formatValue: (row: TeamDashboardComparisonRow) => string;
}) {
  const midpoint = Math.ceil(rows.length / 2);
  const columns = [rows.slice(0, midpoint), rows.slice(midpoint)];

  return (
    <div
      className="mt-2 rounded-lg p-2.5"
      style={{ background: PANEL.tintSoft, border: `1px solid ${PANEL.hairline}` }}
    >
      <div className="mb-2">
        <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastBodyTextStyle}>
          {title}
        </div>
        <div className="text-[9px] mt-0.5" style={broadcastFaintTextStyle}>
          {note}
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-3 gap-y-0.5">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="space-y-0.5">
            {column.map((row) => {
              const isCurrent = row.team === teamName;
              return (
                <div
                  key={row.team}
                  className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-1.5 rounded px-1.5 py-1 text-[10px]"
                  style={{
                    background: isCurrent ? `${accent}16` : 'transparent',
                    color: isCurrent ? accent : PANEL.text,
                  }}
                >
                  <span className="font-black tabular-nums text-right">
                    {row.rank ?? '—'}
                  </span>
                  <span className="truncate font-semibold" title={row.team}>
                    {row.team}
                  </span>
                  <span className="tabular-nums" style={isCurrent ? undefined : broadcastMutedTextStyle}>
                    {formatValue(row)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MyTeamLeaguePosition({
  dashboard,
  displayWins,
  displayLosses,
  displayPoints,
  teamName,
  accent,
}: {
  dashboard: TeamDashboardResponse;
  displayWins: number;
  displayLosses: number;
  displayPoints: number;
  teamName: string;
  accent: string;
}) {
  const [active, setActive] = useState<'age' | 'draft' | null>(null);
  const ranks = dashboard.standings.ranks;
  const leagueSize = ranks.leagueSize || 12;

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
        League position
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-1.5">
        <TeamRankBox
          label={`${dashboard.standings.season} record`}
          value={formatTeamRecord(displayWins, displayLosses)}
          detail={placementDetail(ranks.record, leagueSize)}
        />
        <TeamRankBox
          label={`${dashboard.standings.season} points scored`}
          value={displayPoints.toFixed(1)}
          detail={`${placementDetail(ranks.points, leagueSize)} · league avg ${formatAverage(dashboard.standings.leagueAverages.pointsFor)}`}
        />
        <TeamRankBox
          label={`${dashboard.standings.season} potential points`}
          value={dashboard.standings.maxPoints == null ? '—' : dashboard.standings.maxPoints.toFixed(1)}
          detail={dashboard.standings.maxPoints == null
            ? 'Season total unavailable'
            : `Season total · ${placementDetail(ranks.maxPoints, leagueSize)} · league avg ${formatAverage(dashboard.standings.leagueAverages.maxPoints)}`}
          title="Season-to-date total from the highest-scoring legal lineup available from the full roster each week. This is not a projection."
        />
        <ComparisonButton
          label="Average age"
          value={dashboard.standings.averageAge == null
            ? '—'
            : `${dashboard.standings.averageAge.toFixed(1)} years`}
          detail={dashboard.standings.averageAge == null
            ? 'QB, RB, WR and TE age unavailable'
            : `${agePlacementDetail(ranks.youth, leagueSize)} · league avg ${formatAverage(dashboard.standings.leagueAverages.averageAge)}`}
          active={active === 'age'}
          onClick={() => setActive(active === 'age' ? null : 'age')}
          title="Average age of rostered QBs, RBs, WRs and TEs. Click for the full league."
        />
        <ComparisonButton
          label="Draft capital"
          value={`${dashboard.draft.picks.length} owned pick${dashboard.draft.picks.length === 1 ? '' : 's'}`}
          detail={placementDetail(ranks.draftCapital, leagueSize)}
          active={active === 'draft'}
          onClick={() => setActive(active === 'draft' ? null : 'draft')}
          title="League rank weights pick year, round and exact slot when available. Click for the full league."
        />
      </div>

      {active === 'age' && (
        <CompactComparisonTable
          title="Average age across the league"
          note="QB, RB, WR and TE only. Youngest roster ranks first."
          rows={dashboard.standings.leagueComparisons.averageAge}
          teamName={teamName}
          accent={accent}
          formatValue={(row) => row.value == null ? '—' : `${row.value.toFixed(1)} yrs`}
        />
      )}
      {active === 'draft' && (
        <CompactComparisonTable
          title="Draft capital across the league"
          note="Rank weights pick year, round and exact slot when known."
          rows={dashboard.standings.leagueComparisons.draftCapital}
          teamName={teamName}
          accent={accent}
          formatValue={(row) => `${row.count ?? 0} pick${row.count === 1 ? '' : 's'}`}
        />
      )}
    </div>
  );
}

export function MyTeamPositionAgeComparisons({
  dashboard,
  teamName,
  accent,
}: {
  dashboard: TeamDashboardResponse;
  teamName: string;
  accent: string;
}) {
  const [activePosition, setActivePosition] = useState<TeamDashboardAgePosition | null>(null);
  const positions: TeamDashboardAgePosition[] = ['QB', 'RB', 'WR', 'TE'];

  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
        Average age by position
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {positions.map((position) => {
          const rows = dashboard.standings.leagueComparisons.positionAges[position];
          const currentRow = rows.find((row) => row.team === teamName);
          const isActive = activePosition === position;
          const positionAge = dashboard.standings.positionAges[position];
          return (
            <button
              key={position}
              type="button"
              onClick={() => setActivePosition(isActive ? null : position)}
              aria-expanded={isActive}
              className="rounded-md px-2.5 py-2 text-left transition-colors"
              style={{
                background: PANEL.tintMedium,
                border: `1px solid ${isActive ? PANEL.border : PANEL.hairline}`,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>
                  {position}
                </span>
                <span className="text-[9px]" style={broadcastFaintTextStyle} aria-hidden>
                  {isActive ? '▲' : '▼'}
                </span>
              </div>
              <div className="text-xs font-bold mt-0.5" style={broadcastBodyTextStyle}>
                {positionAge == null ? '—' : `${positionAge.toFixed(1)} yrs`}
              </div>
              <div className="text-[9px] mt-0.5" style={broadcastMutedTextStyle}>
                {currentRow?.rank
                  ? `${ordinalPlacement(currentRow.rank)}-youngest · `
                  : ''}
                avg {formatAverage(dashboard.standings.leagueAverages.positionAges[position])}
              </div>
            </button>
          );
        })}
      </div>

      {activePosition && (
        <CompactComparisonTable
          title={`${activePosition} average age across the league`}
          note={`Youngest ${activePosition} room ranks first.`}
          rows={dashboard.standings.leagueComparisons.positionAges[activePosition]}
          teamName={teamName}
          accent={accent}
          formatValue={(row) => row.value == null ? '—' : `${row.value.toFixed(1)} yrs`}
        />
      )}
    </div>
  );
}
