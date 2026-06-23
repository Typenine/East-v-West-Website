'use client';

import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  teamAccent,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type { H2HCell } from '@/lib/utils/headtohead';

type H2HData = {
  teams: string[];
  matrix: Record<string, Record<string, H2HCell>>;
  neverBeaten: Array<{ team: string; vs: string; meetings: number; lastMeeting?: { year: string; week: number } }>;
};

function getDayOfYear(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Pick which spotlight to show based on the current day-of-year (rotates weekly). */
function pickSpotlightType(h2h: H2HData, now: Date): 'rivalry' | 'never_beaten' | 'all_time_leader' | 'closest_rivalry' {
  const week = Math.floor(getDayOfYear(now) / 7) % 4;
  if (week === 0 && h2h.neverBeaten.length > 0) return 'never_beaten';
  if (week === 1) return 'rivalry';
  if (week === 2) return 'all_time_leader';
  return 'closest_rivalry';
}

function RivalrySpotlight({ h2h }: { h2h: H2HData }) {
  // Find the pair with the most total meetings
  let bestPair: { team: string; vs: string; cell: H2HCell } | null = null;
  let mostMeetings = 0;
  for (const team of h2h.teams) {
    for (const vs of h2h.teams) {
      if (team >= vs) continue; // avoid duplicates
      const cell = h2h.matrix[team]?.[vs];
      if (!cell) continue;
      if (cell.meetings > mostMeetings) {
        mostMeetings = cell.meetings;
        bestPair = { team, vs, cell };
      }
    }
  }
  if (!bestPair) return null;
  const { team, vs, cell } = bestPair;
  const accentA = teamAccent(team);
  const accentB = teamAccent(vs);
  return (
    <BroadcastPanel accent="#f59e0b" title="Top rivalry" meta={`${cell.meetings} all-time meetings`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BroadcastTeamLogo team={team} accent={accentA} size="sm" />
          <div>
            <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>{team}</div>
            <div className="text-xs" style={broadcastMutedTextStyle}>{cell.wins.total}W–{cell.losses.total}L</div>
          </div>
        </div>
        <div className="text-lg font-extrabold" style={{ color: PANEL.faint }}>vs</div>
        <div className="flex items-center gap-3 flex-row-reverse">
          <BroadcastTeamLogo team={vs} accent={accentB} size="sm" />
          <div className="text-right">
            <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>{vs}</div>
            <div className="text-xs" style={broadcastMutedTextStyle}>{cell.losses.total}W–{cell.wins.total}L</div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-xs" style={broadcastFaintTextStyle}>
        Full history on the{' '}
        <Link href="/history" className="underline hover:text-white">History page</Link>
      </div>
    </BroadcastPanel>
  );
}

function NeverBeatenSpotlight({ h2h }: { h2h: H2HData }) {
  const sorted = [...h2h.neverBeaten].sort((a, b) => b.meetings - a.meetings);
  const top = sorted[0];
  if (!top) return null;
  const accent = teamAccent(top.team);
  return (
    <BroadcastPanel accent={accent} title="Never beaten" meta="All-time matchup oddity">
      <div className="flex items-center gap-3 mb-3">
        <BroadcastTeamLogo team={top.team} accent={accent} size="sm" />
        <div>
          <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>{top.team}</div>
          <div className="text-xs" style={broadcastMutedTextStyle}>
            0 wins in {top.meetings} meeting{top.meetings === 1 ? '' : 's'} vs {top.vs}
          </div>
        </div>
      </div>
      {sorted.length > 1 && (
        <ul className="space-y-1">
          {sorted.slice(1, 3).map((nb) => (
            <li key={`${nb.team}-${nb.vs}`} className="text-xs" style={broadcastMutedTextStyle}>
              {nb.team} — 0 wins in {nb.meetings} vs {nb.vs}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 text-xs" style={broadcastFaintTextStyle}>
        <Link href="/history" className="underline hover:text-white">See full history →</Link>
      </div>
    </BroadcastPanel>
  );
}

function AllTimeLeaderSpotlight({ h2h }: { h2h: H2HData }) {
  const winTotals: Record<string, number> = {};
  for (const team of h2h.teams) {
    let total = 0;
    for (const vs of h2h.teams) {
      total += h2h.matrix[team]?.[vs]?.wins.total ?? 0;
    }
    winTotals[team] = total;
  }
  const sorted = Object.entries(winTotals).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  const [topTeam, topWins] = sorted[0];
  const accent = teamAccent(topTeam);
  return (
    <BroadcastPanel accent={accent} title="All-time wins leader" meta="Head-to-head record">
      <div className="flex items-center gap-3 mb-3">
        <BroadcastTeamLogo team={topTeam} accent={accent} size="md" />
        <div>
          <div className="text-base font-bold" style={broadcastBodyTextStyle}>{topTeam}</div>
          <div className="text-sm" style={broadcastMutedTextStyle}>{topWins} all-time wins</div>
        </div>
      </div>
      <ul className="space-y-1">
        {sorted.slice(1, 4).map(([team, wins]) => (
          <li key={team} className="flex justify-between text-xs" style={broadcastMutedTextStyle}>
            <span>{team}</span>
            <span className="tabular-nums font-semibold">{wins}W</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-xs" style={broadcastFaintTextStyle}>
        <Link href="/history" className="underline hover:text-white">Full head-to-head grid →</Link>
      </div>
    </BroadcastPanel>
  );
}

/**
 * Closest Rivalry: the pair whose all-time record is most evenly matched
 * (smallest absolute win difference relative to total games played).
 */
function ClosestRivalrySpotlight({ h2h }: { h2h: H2HData }) {
  let bestPair: { team: string; vs: string; cell: H2HCell } | null = null;
  let smallestDiff = Infinity;

  for (const team of h2h.teams) {
    for (const vs of h2h.teams) {
      if (team >= vs) continue;
      const cell = h2h.matrix[team]?.[vs];
      if (!cell || cell.meetings < 2) continue; // need at least 2 meetings
      const diff = Math.abs(cell.wins.total - cell.losses.total);
      if (diff < smallestDiff) {
        smallestDiff = diff;
        bestPair = { team, vs, cell };
      }
    }
  }

  if (!bestPair) return <RivalrySpotlight h2h={h2h} />;

  const { team, vs, cell } = bestPair;
  const accentA = teamAccent(team);
  const accentB = teamAccent(vs);
  return (
    <BroadcastPanel
      accent="#a78bfa"
      title="Closest rivalry"
      meta={`${cell.meetings} meetings · ${Math.abs(cell.wins.total - cell.losses.total)}-game difference`}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BroadcastTeamLogo team={team} accent={accentA} size="sm" />
          <div>
            <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>{team}</div>
            <div className="text-xs" style={broadcastMutedTextStyle}>{cell.wins.total}W–{cell.losses.total}L</div>
          </div>
        </div>
        <div className="text-lg font-extrabold" style={{ color: PANEL.faint }}>vs</div>
        <div className="flex items-center gap-3 flex-row-reverse">
          <BroadcastTeamLogo team={vs} accent={accentB} size="sm" />
          <div className="text-right">
            <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>{vs}</div>
            <div className="text-xs" style={broadcastMutedTextStyle}>{cell.losses.total}W–{cell.wins.total}L</div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-center text-xs" style={broadcastFaintTextStyle}>
        The most evenly matched head-to-head in league history ·{' '}
        <Link href="/history" className="underline hover:text-white">Full history</Link>
      </div>
    </BroadcastPanel>
  );
}

export default function HistoricalSpotlight({ h2h }: { h2h: H2HData }) {
  const now = new Date();
  const type = pickSpotlightType(h2h, now);

  let content: React.ReactNode = null;
  if (type === 'never_beaten' && h2h.neverBeaten.length > 0) {
    content = <NeverBeatenSpotlight h2h={h2h} />;
  } else if (type === 'rivalry') {
    content = <RivalrySpotlight h2h={h2h} />;
  } else if (type === 'all_time_leader') {
    content = <AllTimeLeaderSpotlight h2h={h2h} />;
  } else {
    content = <ClosestRivalrySpotlight h2h={h2h} />;
  }

  if (!content) return null;

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="Historical spotlight"
        actions={
          <Link href="/history" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Full history →
          </Link>
        }
      />
      {content}
    </section>
  );
}
