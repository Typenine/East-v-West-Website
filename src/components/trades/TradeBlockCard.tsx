'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import { readableAccentOnDark } from '@/lib/trades/trade-card-model';
import { TRADE_CARD_PANEL as PANEL } from '@/lib/trades/trade-card-panel';
import type { TradeAsset, TradeWants, PlayersLookup } from '@/components/trades/TradeBlockTab';

function BlockTeamLogo({ team, accent }: { team: string; accent: string }) {
  const [failed, setFailed] = useState(false);
  const logo = getTeamLogoPath(team);
  return (
    <div
      className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{
        background: 'rgba(255,255,255,0.06)',
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.10), 0 0 0 2px ${accent}33`,
      }}
      aria-hidden="true"
    >
      {failed ? (
        <span className="text-lg font-extrabold" style={{ color: accent }}>
          {team.charAt(0).toUpperCase()}
        </span>
      ) : (
        <Image
          src={logo}
          alt=""
          width={48}
          height={48}
          sizes="48px"
          loading="lazy"
          className="h-10 w-10 object-contain"
          style={{ background: 'transparent' }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}

function AccentBadge({ accent, children }: { accent: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-bold uppercase tracking-wide"
      style={{
        color: accent,
        background: `${accent}1f`,
        boxShadow: `inset 0 0 0 1px ${accent}40`,
      }}
    >
      {children}
    </span>
  );
}

export type TradeBlockCardProps = {
  team: string;
  tradeBlock: TradeAsset[];
  tradeWants: TradeWants | null;
  updatedAt: string | null;
  playerNames: PlayersLookup;
  pickLabel: (asset: { year: number; round: number; originalTeam: string }) => string;
  isHighlighted?: boolean;
};

export function TradeBlockCard({
  team,
  tradeBlock,
  tradeWants,
  updatedAt,
  playerNames,
  pickLabel,
  isHighlighted,
}: TradeBlockCardProps) {
  const accent = readableAccentOnDark(getTeamColors(team));
  const updatedLabel = updatedAt ? new Date(updatedAt).toLocaleString() : '—';
  const hasWants =
    tradeWants &&
    (tradeWants.text ||
      (tradeWants.positions && tradeWants.positions.length > 0) ||
      tradeWants.contactMethod);

  return (
    <li
      id={`trade-block-team-${encodeURIComponent(team)}`}
      className={[
        'scroll-mt-24 list-none',
        isHighlighted ? 'ring-2 ring-white/60 ring-offset-2 ring-offset-[var(--background)] rounded-2xl' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <article
        className="overflow-hidden rounded-2xl transition-shadow duration-200 hover:shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
        style={{
          background: PANEL.card,
          boxShadow: `inset 0 0 0 1px ${PANEL.border}, 0 4px 18px rgba(0,0,0,0.30)`,
        }}
      >
        <div className="h-[3px] w-full" style={{ background: accent }} aria-hidden="true" />

        <div
          className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6"
          style={{ background: PANEL.headerBg, borderBottom: `1px solid ${PANEL.hairline}` }}
        >
          <span
            className="text-[11px] font-extrabold uppercase tracking-[0.3em]"
            style={{ color: PANEL.text }}
          >
            Trade Block
          </span>
          <time
            className="text-xs font-semibold tabular-nums"
            style={{ color: PANEL.muted }}
            dateTime={updatedAt || undefined}
            title={updatedAt || undefined}
          >
            {updatedLabel}
          </time>
        </div>

        <div className="px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BlockTeamLogo team={team} accent={accent} />
            <div className="min-w-0">
              <div
                className="text-[10px] font-bold uppercase tracking-[0.22em]"
                style={{ color: accent }}
              >
                Listed By
              </div>
              <div
                className="truncate text-base font-extrabold tracking-tight sm:text-lg"
                style={{ color: PANEL.text }}
                title={team}
              >
                {team}
              </div>
            </div>
          </div>

          {hasWants ? (
            <div
              className="mt-4 pt-4"
              style={{ borderTop: `1px solid ${PANEL.hairline}` }}
            >
              <div
                className="text-[10px] font-bold uppercase tracking-[0.22em] mb-2"
                style={{ color: accent }}
              >
                Looking For
              </div>
              {tradeWants!.text ? (
                <p className="text-sm leading-5 mb-2" style={{ color: PANEL.text }}>
                  {tradeWants!.text}
                </p>
              ) : null}
              {tradeWants!.positions && tradeWants!.positions.length > 0 ? (
                <div className="flex flex-wrap gap-2 mb-2">
                  {tradeWants!.positions.map((p) => (
                    <AccentBadge key={p} accent={accent}>
                      {p}
                    </AccentBadge>
                  ))}
                </div>
              ) : null}
              {tradeWants!.contactMethod ? (
                <div className="text-xs leading-4" style={{ color: PANEL.muted }}>
                  <span className="font-semibold uppercase tracking-wider" style={{ color: PANEL.faint }}>
                    Contact:{' '}
                  </span>
                  {tradeWants!.contactMethod === 'text' && (
                    <span>Text{tradeWants!.phone ? ` (${tradeWants!.phone})` : ''}</span>
                  )}
                  {tradeWants!.contactMethod === 'discord' && <span>Discord</span>}
                  {tradeWants!.contactMethod === 'snap' && (
                    <span>Snap{tradeWants!.snap ? ` (${tradeWants!.snap})` : ''}</span>
                  )}
                  {tradeWants!.contactMethod === 'sleeper' && <span>Sleeper</span>}
                </div>
              ) : null}
            </div>
          ) : null}

          <div
            className="mt-4 pt-4"
            style={{ borderTop: `1px solid ${PANEL.hairline}` }}
          >
            <div
              className="text-[10px] font-bold uppercase tracking-[0.22em] mb-3"
              style={{ color: accent }}
            >
              On the Block
            </div>
            {tradeBlock.length === 0 ? (
              <p className="text-sm" style={{ color: PANEL.faint }}>
                No assets listed.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {tradeBlock.map((asset, idx) => (
                  <li key={idx} className="flex items-start gap-3">
                    {asset.type === 'player' ? (
                      <>
                        <AccentBadge accent={accent}>
                          {playerNames[asset.playerId]?.position || 'PLR'}
                        </AccentBadge>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-5" style={{ color: PANEL.text }}>
                            {playerNames[asset.playerId]?.name || asset.playerId}
                            {playerNames[asset.playerId]?.team ? (
                              <span className="ml-1.5 text-xs font-medium" style={{ color: PANEL.faint }}>
                                {playerNames[asset.playerId].team}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </>
                    ) : asset.type === 'pick' ? (
                      <>
                        <AccentBadge accent={accent}>
                          {asset.round ? `R${asset.round}` : 'PICK'}
                        </AccentBadge>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-5" style={{ color: PANEL.text }}>
                            {pickLabel(asset)}
                          </div>
                          <div className="text-xs leading-4" style={{ color: PANEL.muted }}>
                            {asset.year}
                            {asset.originalTeam && asset.originalTeam !== team
                              ? ` · via ${asset.originalTeam}`
                              : ''}
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <AccentBadge accent={accent}>FAAB</AccentBadge>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-5" style={{ color: PANEL.text }}>
                            {typeof asset.amount === 'number' ? `$${asset.amount}` : 'FAAB'}
                          </div>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

export default TradeBlockCard;
