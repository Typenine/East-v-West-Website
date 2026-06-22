'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type { TeamRow } from '@/types/trade-block';

// Position labels for display
const POS_LABELS: Record<string, string> = {
  QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs',
  '1st': '1st-round picks', '2nd': '2nd-round picks', '3rd': '3rd-round picks',
};

type TradeMarketSummaryProps = {
  rows: TeamRow[];
};

/** Derive trade-market signals from trade-block rows without any value judgements. */
function TradeMarketSummary({ rows }: TradeMarketSummaryProps) {
  const activeBlocks = rows.filter((r) => r.tradeBlock.length > 0);
  const totalPlayers = activeBlocks.reduce(
    (s, r) => s + r.tradeBlock.filter((a) => a.type === 'player').length, 0
  );
  const totalPicks = activeBlocks.reduce(
    (s, r) => s + r.tradeBlock.filter((a) => a.type === 'pick').length, 0
  );

  // Count wanted positions
  const wantedPos: Record<string, number> = {};
  for (const r of activeBlocks) {
    for (const p of r.tradeWants?.positions ?? []) {
      wantedPos[p] = (wantedPos[p] ?? 0) + 1;
    }
  }
  const topWants = Object.entries(wantedPos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // Rule-based market matches: team A wants position P, team B has a player at P listed
  const matches: Array<{ buyer: string; seller: string; position: string }> = [];
  for (const buyer of rows) {
    const wants = buyer.tradeWants?.positions ?? [];
    if (wants.length === 0) continue;
    for (const seller of rows) {
      if (seller.team === buyer.team) continue;
      for (const asset of seller.tradeBlock) {
        if (asset.type !== 'player') continue;
        // We don't have position data here; surface the pair for display
        // A real implementation would join against player roster data
        // For now we surface pairs where wants text overlap with pick/player listings
      }
      // Check if seller has picks that match want types
      for (const want of wants) {
        const wantLower = want.toLowerCase();
        if (wantLower === '1st' || wantLower === '2nd' || wantLower === '3rd') {
          const hasPick = seller.tradeBlock.some(
            (a) => a.type === 'pick' && (a as { round: number }).round === parseInt(want[0])
          );
          if (hasPick && matches.length < 3) {
            matches.push({ buyer: buyer.team, seller: seller.team, position: want });
          }
        }
      }
    }
  }

  // Recently updated blocks (last 7 days)
  const recent = [...activeBlocks]
    .filter((r) => r.updatedAt)
    .sort((a, b) => new Date(b.updatedAt!).getTime() - new Date(a.updatedAt!).getTime())
    .slice(0, 3);

  return (
    <BroadcastPanel accent="#10b981" title="Trade market" meta={`${activeBlocks.length} active blocks`}>
      <div className="space-y-4">
        <div className="flex gap-6 text-center">
          <div>
            <div className="text-2xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {activeBlocks.length}
            </div>
            <div className="text-xs uppercase tracking-wide" style={broadcastFaintTextStyle}>Teams listing</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {totalPlayers}
            </div>
            <div className="text-xs uppercase tracking-wide" style={broadcastFaintTextStyle}>Players listed</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold tabular-nums" style={broadcastBodyTextStyle}>
              {totalPicks}
            </div>
            <div className="text-xs uppercase tracking-wide" style={broadcastFaintTextStyle}>Picks listed</div>
          </div>
        </div>

        {topWants.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={broadcastFaintTextStyle}>
              Most wanted
            </div>
            <div className="flex flex-wrap gap-2">
              {topWants.map(([pos, count]) => (
                <span
                  key={pos}
                  className="rounded px-2 py-0.5 text-xs font-semibold"
                  style={{ background: 'rgba(255,255,255,0.08)', color: PANEL.text }}
                >
                  {POS_LABELS[pos] ?? pos} ({count})
                </span>
              ))}
            </div>
          </div>
        )}

        {matches.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={broadcastFaintTextStyle}>
              Potential matches
            </div>
            <ul className="space-y-1">
              {matches.map((m, i) => (
                <li key={i} className="text-xs" style={broadcastMutedTextStyle}>
                  <span className="font-semibold" style={broadcastBodyTextStyle}>{m.buyer}</span>
                  {' '}wants {m.position} ·{' '}
                  <span className="font-semibold" style={broadcastBodyTextStyle}>{m.seller}</span>
                  {' '}has {m.position} listed
                </li>
              ))}
            </ul>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={broadcastFaintTextStyle}>
              Recently updated
            </div>
            <ul className="space-y-0.5">
              {recent.map((r) => (
                <li key={r.team} className="text-xs" style={broadcastMutedTextStyle}>
                  <Link
                    href={`/trade-block?team=${encodeURIComponent(r.team)}`}
                    className="underline hover:text-white"
                  >
                    {r.team}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="pt-1">
          <Link
            href="/trade-block"
            className="text-xs underline hover:text-white"
            style={broadcastFaintTextStyle}
          >
            View all trade blocks →
          </Link>
        </div>
      </div>
    </BroadcastPanel>
  );
}

type RosterConstructionProps = {
  /** Map of teamName → positionCounts */
  positionCounts: Record<string, Record<string, number>>;
};

function RosterConstructionSummary({ positionCounts }: RosterConstructionProps) {
  const teams = Object.keys(positionCounts);
  if (teams.length === 0) return null;

  const positions = ['QB', 'RB', 'WR', 'TE'];
  // Find teams with most/fewest of each position
  const extremes: Array<{ pos: string; most: string; mostCount: number; fewest: string; fewestCount: number }> = [];
  for (const pos of positions) {
    let mostTeam = '', mostCount = 0, fewestTeam = '', fewestCount = Infinity;
    for (const team of teams) {
      const c = positionCounts[team]?.[pos] ?? 0;
      if (c > mostCount) { mostCount = c; mostTeam = team; }
      if (c < fewestCount) { fewestCount = c; fewestTeam = team; }
    }
    if (mostTeam) extremes.push({ pos, most: mostTeam, mostCount, fewest: fewestTeam, fewestCount: fewestCount === Infinity ? 0 : fewestCount });
  }

  const accent = '#6366f1';
  return (
    <BroadcastPanel accent={accent} title="Roster construction" meta="Position counts">
      <ul className="space-y-2">
        {extremes.map(({ pos, most, mostCount, fewest, fewestCount }) => (
          <li key={pos} className="grid grid-cols-[2rem_1fr] gap-2 items-start">
            <span
              className="rounded text-[10px] font-bold px-1 py-0.5 text-center"
              style={{ background: 'rgba(255,255,255,0.08)', color: PANEL.text }}
            >
              {pos}
            </span>
            <span className="text-xs" style={broadcastMutedTextStyle}>
              Most:{' '}
              <span className="font-semibold" style={broadcastBodyTextStyle}>{most}</span>
              {' '}({mostCount}) · Fewest:{' '}
              <span className="font-semibold" style={broadcastBodyTextStyle}>{fewest}</span>
              {' '}({fewestCount})
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 text-xs" style={broadcastFaintTextStyle}>
        <Link href="/teams" className="underline hover:text-white">View all rosters →</Link>
      </div>
    </BroadcastPanel>
  );
}

export type LeaguePulseProps = {
  tradeRows: TeamRow[];
  positionCounts: Record<string, Record<string, number>>;
  h2hSpotlight?: ReactNode;
};

export default function LeaguePulse({ tradeRows, positionCounts, h2hSpotlight }: LeaguePulseProps) {
  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader title="League pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TradeMarketSummary rows={tradeRows} />
        <RosterConstructionSummary positionCounts={positionCounts} />
        {h2hSpotlight && (
          <div className="lg:col-span-2">
            {h2hSpotlight}
          </div>
        )}
      </div>
    </section>
  );
}
