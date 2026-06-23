import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
type TaxiAlert = { team: string; type: string; message: string };

type Props = {
  taxiAlerts: TaxiAlert[];
  positionCounts: Record<string, Record<string, number>>;
};

export default function PreseasonCenter({ taxiAlerts, positionCounts }: Props) {
  const teams = Object.keys(positionCounts);
  const rosterSizes = teams
    .map((t) => ({
      team: t,
      total: Object.values(positionCounts[t] ?? {}).reduce((s, n) => s + n, 0),
    }))
    .sort((a, b) => b.total - a.total);

  const actualAlerts = taxiAlerts.filter((a) => a.type === 'actual' || a.type === 'violation');

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader title="Preseason center" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Season preview */}
        <BroadcastPanel accent="#f59e0b" title="2026 season incoming" meta="Free agency open">
          <div className="space-y-3">
            <p className="text-sm" style={broadcastBodyTextStyle}>
              FA bidding is open. The 2026 NFL season is approaching.
              Finalize your roster and make your moves before Week 1.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/trade-block"
                className="rounded px-3 py-1.5 text-sm font-medium hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: PANEL.text, border: `1px solid ${PANEL.hairline}` }}
              >
                Trade block →
              </Link>
              <Link
                href="/teams"
                className="rounded px-3 py-1.5 text-sm font-medium hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)', color: PANEL.text, border: `1px solid ${PANEL.hairline}` }}
              >
                Team rosters →
              </Link>
            </div>
          </div>
        </BroadcastPanel>

        {/* Roster count summary */}
        {rosterSizes.length > 0 && (
          <BroadcastPanel accent="#6366f1" title="Roster sizes" meta="Current active rosters">
            <ul className="space-y-1">
              {rosterSizes.slice(0, 6).map(({ team, total }) => (
                <li key={team} className="flex items-center justify-between text-xs">
                  <span style={broadcastMutedTextStyle}>{team}</span>
                  <span className="tabular-nums font-semibold" style={broadcastBodyTextStyle}>
                    {total}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-xs" style={broadcastFaintTextStyle}>
              <Link href="/teams" className="underline hover:text-white">Full rosters →</Link>
            </div>
          </BroadcastPanel>
        )}

        {/* Taxi compliance alerts */}
        {actualAlerts.length > 0 && (
          <BroadcastPanel accent="#ef4444" title="Taxi alerts" meta={`${actualAlerts.length} compliance issue${actualAlerts.length !== 1 ? 's' : ''}`}>
            <ul className="space-y-1.5">
              {actualAlerts.slice(0, 4).map((alert, i) => (
                <li key={i} className="text-xs" style={broadcastMutedTextStyle}>
                  <span className="font-semibold" style={broadcastBodyTextStyle}>{alert.team}:</span>{' '}
                  {alert.message}
                </li>
              ))}
            </ul>
          </BroadcastPanel>
        )}
      </div>
    </section>
  );
}
