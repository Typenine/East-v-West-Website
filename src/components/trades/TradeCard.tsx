'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { TradeCardModel, TradeCardTeam } from '@/lib/trades/trade-card-model';
import { TRADE_CARD_PANEL as PANEL } from '@/lib/trades/trade-card-panel';

/**
 * Broadcast-style trade card — a premium editorial layer with its own paneling
 * (theme-aware via the shared --panel-* tokens: dark in dark mode, light in
 * light mode), team colors as accents only, fixed-size logo containers.
 */

function TeamLogo({ team, priority }: { team: TradeCardTeam; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        background: PANEL.tintMedium,
        boxShadow: `inset 0 0 0 1px ${PANEL.tintStronger}, 0 0 0 2px ${team.accent}33`,
      }}
      aria-hidden="true"
    >
      {failed ? (
        <span className="text-lg font-extrabold" style={{ color: team.accent }}>
          {team.name.charAt(0).toUpperCase()}
        </span>
      ) : (
        <Image
          src={team.logo}
          alt=""
          width={48}
          height={48}
          sizes="48px"
          priority={priority}
          loading={priority ? undefined : 'lazy'}
          className="h-10 w-10 object-contain"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function TeamPanel({
  team,
  priority,
  onTrack,
}: {
  team: TradeCardTeam;
  priority?: boolean;
  onTrack?: (href: string) => void;
}) {
  return (
    <div className="min-w-0 px-5 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <TeamLogo team={team} priority={priority} />
        <div className="min-w-0">
          <div
            className="text-[10px] font-bold uppercase tracking-[0.22em]"
            style={{ color: team.accent }}
          >
            Receives
          </div>
          <div
            className="truncate text-base font-extrabold tracking-tight sm:text-lg"
            style={{ color: PANEL.text }}
            title={team.name}
          >
            {team.name}
          </div>
        </div>
      </div>

      <ul className="mt-4 space-y-2.5">
        {team.assets.length === 0 ? (
          <li className="text-sm" style={{ color: PANEL.faint }}>
            Nothing received
          </li>
        ) : (
          team.assets.map((asset, i) => (
            <li key={i} className="flex items-start gap-3">
              <span
                className="mt-0.5 inline-flex h-5 w-11 shrink-0 items-center justify-center rounded text-[10px] font-bold uppercase tracking-wide"
                style={{
                  color: team.accent,
                  background: `${team.accent}1f`,
                  boxShadow: `inset 0 0 0 1px ${team.accent}40`,
                }}
              >
                {asset.badge}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-5" style={{ color: PANEL.text }}>
                  {asset.label}
                  {asset.sub && asset.kind === 'player' ? (
                    <span className="ml-1.5 text-xs font-medium" style={{ color: PANEL.faint }}>
                      {asset.sub}
                    </span>
                  ) : null}
                </div>
                {asset.kind !== 'player' && asset.sub ? (
                  <div className="text-xs leading-4" style={{ color: PANEL.muted }}>
                    {asset.sub}
                  </div>
                ) : null}
                {asset.fromTeam ? (
                  <div className="text-xs font-semibold leading-4" style={{ color: PANEL.muted }}>
                    ← from {asset.fromTeam}
                  </div>
                ) : null}
                {asset.originalOwner ? (
                  <div className="text-xs leading-4" style={{ color: PANEL.faint }}>
                    via {asset.originalOwner}
                  </div>
                ) : null}
              </div>
              {asset.trackHref && onTrack ? (
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors"
                  style={{ color: PANEL.faint, boxShadow: `inset 0 0 0 1px ${PANEL.hairline}` }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = PANEL.text; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = PANEL.faint; }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onTrack(asset.trackHref!);
                  }}
                  aria-label={`Track lineage for ${asset.label}`}
                >
                  Track
                </button>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export type TradeCardProps = {
  trade: TradeCardModel;
  /** Prioritize logo loading — only for above-the-fold cards */
  priority?: boolean;
  /** Skip offscreen rendering work for below-the-fold cards */
  deferRender?: boolean;
  /** Admin-only: link to the edit form for this trade */
  editHref?: string;
};

export function TradeCard({ trade, priority, deferRender, editHref }: TradeCardProps) {
  const router = useRouter();
  const teamCount = Math.min(Math.max(trade.teams.length, 1), 3);
  const gridCols = teamCount === 1 ? '' : teamCount === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3';
  const accentStops = trade.teams.length
    ? trade.teams
        .map((t, i) => {
          const from = (i / trade.teams.length) * 100;
          const to = ((i + 1) / trade.teams.length) * 100;
          return `${t.accent} ${from}%, ${t.accent} ${to}%`;
        })
        .join(', ')
    : `${PANEL.border} 0%, ${PANEL.border} 100%`;

  return (
    <Link
      href={`/trades/${trade.id}`}
      className="group block focus-visible:outline-none"
      aria-label={`View details of trade between ${trade.teams.map((t) => t.name).join(' and ')} from ${trade.dateLabel}`}
      style={deferRender ? ({ contentVisibility: 'auto', containIntrinsicSize: '0 360px' } as React.CSSProperties) : undefined}
    >
      <article
        className="overflow-hidden rounded-2xl transition-shadow duration-200 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.45)] group-focus-visible:ring-2 group-focus-visible:ring-white/60"
        style={{
          background: PANEL.card,
          boxShadow: `inset 0 0 0 1px ${PANEL.border}, 0 4px 18px rgba(0,0,0,0.30)`,
        }}
      >
        {/* Team-color accent strip */}
        <div
          className="h-[3px] w-full"
          style={{ background: `linear-gradient(90deg, ${accentStops})` }}
          aria-hidden="true"
        />

        {/* Header bar */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
          style={{ background: PANEL.headerBg, borderBottom: `1px solid ${PANEL.hairline}` }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="text-[11px] font-extrabold uppercase tracking-[0.3em]"
              style={{ color: PANEL.text }}
            >
              Trade
            </span>
            {trade.season ? (
              <span className="truncate text-[11px] font-semibold uppercase tracking-wider" style={{ color: PANEL.faint }}>
                {trade.season}
                {trade.week ? ` · Week ${trade.week}` : ''}
              </span>
            ) : null}
            {trade.status !== 'completed' ? (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={
                  trade.status === 'vetoed'
                    ? { color: '#FCA5A5', background: 'rgba(239,68,68,0.14)', boxShadow: 'inset 0 0 0 1px rgba(239,68,68,0.35)' }
                    : { color: '#FDE68A', background: 'rgba(234,179,8,0.12)', boxShadow: 'inset 0 0 0 1px rgba(234,179,8,0.35)' }
                }
              >
                {trade.status}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <time className="text-xs font-semibold tabular-nums" style={{ color: PANEL.muted }} dateTime={trade.date}>
              {trade.dateLabel}
            </time>
            {editHref ? (
              <button
                type="button"
                className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: PANEL.faint, boxShadow: `inset 0 0 0 1px ${PANEL.hairline}` }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  router.push(editHref);
                }}
                aria-label="Edit this trade"
                title="Edit this trade"
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>

        {/* Team panels */}
        <div className={`grid grid-cols-1 ${gridCols} divide-y md:divide-x md:divide-y-0`}>
          {trade.teams.map((team, i) => (
            <div key={`${team.name}-${i}`} style={{ borderColor: PANEL.hairline }}>
              <TeamPanel
                team={team}
                priority={priority}
                onTrack={(href) => router.push(href)}
              />
            </div>
          ))}
        </div>

        {/* Footer CTA */}
        <div
          className="flex items-center justify-end px-5 py-2.5 sm:px-6"
          style={{ borderTop: `1px solid ${PANEL.hairline}` }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wider transition-colors group-hover:text-[var(--panel-text)]"
            style={{ color: PANEL.muted }}
          >
            View trade details →
          </span>
        </div>
      </article>
    </Link>
  );
}

export function TradeCardSkeleton() {
  const bar = { background: PANEL.tintStrong } as const;
  return (
    <div
      className="animate-pulse overflow-hidden rounded-2xl"
      style={{ background: PANEL.card, boxShadow: `inset 0 0 0 1px ${PANEL.border}` }}
      aria-hidden="true"
    >
      <div className="h-[3px] w-full" style={bar} />
      <div
        className="flex items-center justify-between px-5 py-3 sm:px-6"
        style={{ background: PANEL.headerBg, borderBottom: `1px solid ${PANEL.hairline}` }}
      >
        <div className="h-3 w-28 rounded" style={bar} />
        <div className="h-3 w-20 rounded" style={bar} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full" style={bar} />
              <div className="space-y-1.5">
                <div className="h-2 w-14 rounded" style={bar} />
                <div className="h-4 w-36 rounded" style={bar} />
              </div>
            </div>
            <div className="mt-4 space-y-2.5">
              <div className="h-3.5 w-3/4 rounded" style={bar} />
              <div className="h-3.5 w-2/3 rounded" style={bar} />
              <div className="h-3.5 w-1/2 rounded" style={bar} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end px-5 py-2.5 sm:px-6" style={{ borderTop: `1px solid ${PANEL.hairline}` }}>
        <div className="h-3 w-28 rounded" style={bar} />
      </div>
    </div>
  );
}

export default TradeCard;
