import type { LeagueTransaction } from '@/lib/utils/transactions';
import {
  BroadcastAccentBadge,
  BroadcastSectionLabel,
  BroadcastTeamLogo,
} from '@/components/ui/BroadcastPanel';
import { PANEL, teamAccent } from '@/lib/ui/broadcast-styles';
import { formatTransactionDate, transactionTypeLabel } from '@/components/transactions/transaction-format';

export default function TransactionCard({ txn }: { txn: LeagueTransaction }) {
  const accentTeam = txn.type === 'trade' ? txn.teamsInvolved[0] || txn.team : txn.team;
  const accent = teamAccent(accentTeam);
  const typeLabel = transactionTypeLabel(txn.type);
  const dateLabel = formatTransactionDate(txn.created);
  const seasonMeta = [
    txn.season,
    txn.week > 0 ? `Week ${txn.week}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
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
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="text-[11px] font-extrabold uppercase tracking-[0.3em]"
            style={{ color: PANEL.text }}
          >
            {typeLabel}
          </span>
          {seasonMeta ? (
            <span className="truncate text-[11px] font-semibold uppercase tracking-wider" style={{ color: PANEL.faint }}>
              {seasonMeta}
            </span>
          ) : null}
        </div>
        <time
          className="shrink-0 text-xs font-semibold tabular-nums"
          style={{ color: PANEL.muted }}
          dateTime={txn.created ? new Date(txn.created).toISOString() : undefined}
        >
          {dateLabel}
        </time>
      </div>

      <div className="px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          {txn.type === 'trade' ? (
            <div className="min-w-0 flex-1">
              <BroadcastSectionLabel accent={accent}>Teams</BroadcastSectionLabel>
              <div className="text-sm font-semibold leading-5" style={{ color: PANEL.text }}>
                {txn.team}
              </div>
            </div>
          ) : (
            <>
              <BroadcastTeamLogo team={txn.team} accent={accent} />
              <div className="min-w-0">
                <BroadcastSectionLabel accent={accent}>Team</BroadcastSectionLabel>
                <div
                  className="truncate text-base font-extrabold tracking-tight sm:text-lg"
                  style={{ color: PANEL.text }}
                  title={txn.team}
                >
                  {txn.team}
                </div>
              </div>
            </>
          )}
        </div>

        <div
          className="mt-4 pt-4"
          style={{ borderTop: `1px solid ${PANEL.hairline}` }}
        >
          <BroadcastSectionLabel accent={accent}>Added</BroadcastSectionLabel>
          {txn.added.length === 0 ? (
            <p className="text-sm" style={{ color: PANEL.faint }}>
              Nothing added
            </p>
          ) : (
            <ul className="space-y-2.5">
              {txn.added.map((player) => (
                <li key={`${txn.id}-add-${player.playerId}`} className="flex items-start gap-3">
                  <BroadcastAccentBadge accent={accent}>
                    {player.position || 'PLR'}
                  </BroadcastAccentBadge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold leading-5" style={{ color: PANEL.text }}>
                      {player.name ?? player.playerId}
                      {player.nflTeam ? (
                        <span className="ml-1.5 text-xs font-medium" style={{ color: PANEL.faint }}>
                          {player.nflTeam}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {txn.dropped.length > 0 ? (
          <div
            className="mt-4 pt-4"
            style={{ borderTop: `1px solid ${PANEL.hairline}` }}
          >
            <BroadcastSectionLabel accent={accent}>Dropped</BroadcastSectionLabel>
            <ul className="space-y-2.5">
              {txn.dropped.map((player) => (
                <li key={`${txn.id}-drop-${player.playerId}`} className="flex items-start gap-3">
                  <BroadcastAccentBadge accent={accent} className="opacity-70">
                    {player.position || 'PLR'}
                  </BroadcastAccentBadge>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium leading-5" style={{ color: PANEL.muted }}>
                      {player.name ?? player.playerId}
                      {player.nflTeam ? (
                        <span className="ml-1.5 text-xs" style={{ color: PANEL.faint }}>
                          {player.nflTeam}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {txn.faab > 0 ? (
          <div
            className="mt-4 flex items-center justify-between pt-4"
            style={{ borderTop: `1px solid ${PANEL.hairline}` }}
          >
            <BroadcastSectionLabel accent={accent}>FAAB</BroadcastSectionLabel>
            <span className="text-sm font-extrabold tabular-nums" style={{ color: PANEL.text }}>
              ${txn.faab}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
