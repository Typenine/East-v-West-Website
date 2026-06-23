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
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';
import type { StandingsTeam } from './PlayoffRacePanel';

// Position labels for display
const POS_LABELS: Record<string, string> = {
  QB: 'QBs', RB: 'RBs', WR: 'WRs', TE: 'TEs',
  '1st': '1st-round picks', '2nd': '2nd-round picks', '3rd': '3rd-round picks',
};

// ── Trade Market ─────────────────────────────────────────────────────────────

type TradeMarketSummaryProps = {
  rows: TeamRow[];
  /** playerId → position (e.g. "WR", "RB") — used for player-position matching */
  playerPositions: Record<string, string>;
};

function TradeMarketSummary({ rows, playerPositions }: TradeMarketSummaryProps) {
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

  // Rule-based market matches: team A wants position P, team B has a player/pick at P listed.
  // Players on the trade block are matched to their position via playerPositions.
  const matches: Array<{ buyer: string; seller: string; position: string }> = [];
  for (const buyer of rows) {
    const wants = buyer.tradeWants?.positions ?? [];
    if (wants.length === 0) continue;
    for (const seller of rows) {
      if (seller.team === buyer.team) continue;
      for (const want of wants) {
        if (matches.length >= 4) break;
        const wantLower = want.toLowerCase();

        // Check if seller has a pick matching the wanted round
        const isPickWant = wantLower === '1st' || wantLower === '2nd' || wantLower === '3rd';
        if (isPickWant) {
          const wantedRound = parseInt(want[0], 10);
          const hasPick = seller.tradeBlock.some(
            (a) => a.type === 'pick' && (a as { round: number }).round === wantedRound
          );
          if (hasPick && !matches.some((m) => m.buyer === buyer.team && m.seller === seller.team)) {
            matches.push({ buyer: buyer.team, seller: seller.team, position: `${want}-round pick` });
          }
          continue;
        }

        // Check if seller has a player at the wanted position
        const wantUpper = want.toUpperCase();
        const hasPlayer = seller.tradeBlock.some((a) => {
          if (a.type !== 'player') return false;
          const pos = playerPositions[(a as { playerId: string }).playerId];
          return pos?.toUpperCase() === wantUpper;
        });
        if (hasPlayer && !matches.some((m) => m.buyer === buyer.team && m.seller === seller.team && m.position === wantUpper)) {
          matches.push({ buyer: buyer.team, seller: seller.team, position: wantUpper });
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
                  {' '}wants {POS_LABELS[m.position] ?? m.position} ·{' '}
                  <span className="font-semibold" style={broadcastBodyTextStyle}>{m.seller}</span>
                  {' '}has one listed
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

// ── Roster Construction ──────────────────────────────────────────────────────

type RosterConstructionProps = {
  positionCounts: Record<string, Record<string, number>>;
};

function RosterConstructionSummary({ positionCounts }: RosterConstructionProps) {
  const teams = Object.keys(positionCounts);
  if (teams.length === 0) return null;

  const positions = ['QB', 'RB', 'WR', 'TE'];
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

  return (
    <BroadcastPanel accent="#6366f1" title="Roster construction" meta="Position counts">
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

// ── Playoff Race (post-deadline phase) ───────────────────────────────────────

function PlayoffRaceSummary({ standings }: { standings: StandingsTeam[] }) {
  const cutline = 6;
  const inField = standings.filter((t) => t.seed <= cutline);
  const justOut = standings.filter((t) => t.seed === cutline + 1);
  const lastIn = standings.find((t) => t.seed === cutline);
  const firstOut = justOut[0];

  return (
    <BroadcastPanel accent="#10b981" title="Playoff race" meta={`Top ${cutline} seeds advance`}>
      <div className="space-y-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1.5" style={broadcastFaintTextStyle}>
            In the field ({inField.length}/{cutline})
          </div>
          <ul className="space-y-1">
            {inField.map((t) => (
              <li key={t.rosterId} className="flex items-center justify-between text-xs">
                <span style={broadcastBodyTextStyle}>{t.teamName}</span>
                <span className="tabular-nums" style={broadcastMutedTextStyle}>{t.wins}–{t.losses}</span>
              </li>
            ))}
          </ul>
        </div>
        {firstOut && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] mb-1" style={broadcastFaintTextStyle}>
              First out
            </div>
            <div className="text-xs" style={broadcastMutedTextStyle}>
              <span className="font-semibold" style={broadcastBodyTextStyle}>{firstOut.teamName}</span>
              {' '}{firstOut.wins}–{firstOut.losses}
              {lastIn && lastIn.wins !== firstOut.wins && (
                <span className="ml-1">
                  ({lastIn.wins - firstOut.wins}W back)
                </span>
              )}
            </div>
          </div>
        )}
        <Link href="/standings" className="block text-xs underline hover:text-white" style={broadcastFaintTextStyle}>
          Full standings →
        </Link>
      </div>
    </BroadcastPanel>
  );
}

// ── Postseason Summary ────────────────────────────────────────────────────────

function PostseasonSummary({ standings }: { standings: StandingsTeam[] }) {
  const cutline = 6;
  const playoff = standings.filter((t) => t.seed <= cutline);
  const consolation = standings.filter((t) => t.seed > cutline);
  return (
    <BroadcastPanel accent="#f59e0b" title="Playoff field" meta="Active playoff teams">
      <div className="space-y-2">
        <ul className="space-y-1">
          {playoff.map((t) => (
            <li key={t.rosterId} className="flex items-center justify-between text-xs">
              <span style={broadcastBodyTextStyle}>{t.teamName}</span>
              <span className="tabular-nums" style={broadcastMutedTextStyle}>{t.wins}–{t.losses}</span>
            </li>
          ))}
        </ul>
        {consolation.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-widest font-bold mt-2" style={broadcastFaintTextStyle}>
              Consolation bracket
            </div>
            <ul className="space-y-1">
              {consolation.slice(0, 3).map((t) => (
                <li key={t.rosterId} className="flex items-center justify-between text-xs" style={broadcastMutedTextStyle}>
                  <span>{t.teamName}</span>
                  <span className="tabular-nums">{t.wins}–{t.losses}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link href="/brackets" className="block text-xs underline hover:text-white mt-2" style={broadcastFaintTextStyle}>
          Playoff brackets →
        </Link>
      </div>
    </BroadcastPanel>
  );
}

// ── LeaguePulse ──────────────────────────────────────────────────────────────

export type LeaguePulseProps = {
  tradeRows: TeamRow[];
  positionCounts: Record<string, Record<string, number>>;
  playerPositions?: Record<string, string>;
  phase?: HomepagePhase;
  standings?: StandingsTeam[];
  h2hSpotlight?: ReactNode;
};

export default function LeaguePulse({
  tradeRows,
  positionCounts,
  playerPositions = {},
  phase,
  standings = [],
  h2hSpotlight,
}: LeaguePulseProps) {
  const isPostDeadline = phase === 'post_deadline_pre_postseason';
  const isPostseason = phase === 'postseason';
  const showTradeMarket = !isPostDeadline && !isPostseason;

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader title="League pulse" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showTradeMarket ? (
          <TradeMarketSummary rows={tradeRows} playerPositions={playerPositions} />
        ) : isPostDeadline && standings.length > 0 ? (
          <PlayoffRaceSummary standings={standings} />
        ) : isPostseason && standings.length > 0 ? (
          <PostseasonSummary standings={standings} />
        ) : (
          <TradeMarketSummary rows={tradeRows} playerPositions={playerPositions} />
        )}
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
