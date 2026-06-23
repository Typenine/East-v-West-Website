import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';

type TeamDraftSummary = {
  teamName: string;
  picks: number;
};

type Props = {
  rookieClassByTeam?: TeamDraftSummary[];
  positionCounts: Record<string, Record<string, number>>;
};

export default function PostDraftCenter({ rookieClassByTeam, positionCounts }: Props) {
  // Derive which teams have the most rookie additions from positionCounts changes
  // Since we don't track pre/post-draft deltas here, show roster overview instead
  const teams = Object.keys(positionCounts);
  const POSITIONS = ['QB', 'RB', 'WR', 'TE'];

  // Find the team with most WR and most RB (common draft target positions)
  const positionLeaders: Array<{ pos: string; team: string; count: number }> = [];
  for (const pos of POSITIONS) {
    let bestTeam = '';
    let bestCount = 0;
    for (const team of teams) {
      const c = positionCounts[team]?.[pos] ?? 0;
      if (c > bestCount) { bestCount = c; bestTeam = team; }
    }
    if (bestTeam) positionLeaders.push({ pos, team: bestTeam, count: bestCount });
  }

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="Post-draft center"
        actions={
          <Link href="/draft" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Draft results →
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Draft results link */}
        <BroadcastPanel accent="#06b6d4" title="Draft results" meta="2026 rookie draft complete">
          <div className="space-y-3">
            <p className="text-sm" style={broadcastBodyTextStyle}>
              The 2026 rookie draft is complete. Review each team's rookie class,
              prospect evaluations, and pick history.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/draft"
                className="rounded px-3 py-1.5 text-sm font-semibold transition-colors hover:opacity-90"
                style={{ background: '#06b6d4', color: '#fff' }}
              >
                View draft results →
              </Link>
              <Link
                href="/teams"
                className="rounded px-3 py-1.5 text-sm font-medium transition-colors hover:text-white"
                style={{ background: 'rgba(255,255,255,0.06)', color: PANEL.text, border: `1px solid ${PANEL.hairline}` }}
              >
                Team rosters →
              </Link>
            </div>
          </div>
        </BroadcastPanel>

        {/* Roster position overview */}
        {positionLeaders.length > 0 && (
          <BroadcastPanel accent="#8b5cf6" title="Position depth" meta="Post-draft roster construction">
            <ul className="space-y-2">
              {positionLeaders.map(({ pos, team, count }) => (
                <li key={pos} className="flex items-center gap-2">
                  <span
                    className="rounded text-[10px] font-bold px-1.5 py-0.5 text-center w-8"
                    style={{ background: 'rgba(255,255,255,0.08)', color: PANEL.text }}
                  >
                    {pos}
                  </span>
                  <span className="text-xs flex-1" style={broadcastMutedTextStyle}>
                    Most:{' '}
                    <span className="font-semibold" style={broadcastBodyTextStyle}>{team}</span>
                    {' '}({count})
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-xs" style={broadcastFaintTextStyle}>
              <Link href="/teams" className="underline hover:text-white">Full roster comparison →</Link>
            </div>
          </BroadcastPanel>
        )}

        {/* Rookie class by team */}
        {rookieClassByTeam && rookieClassByTeam.length > 0 && (
          <BroadcastPanel accent="#f59e0b" title="Rookie classes" meta="2026 draft picks by team">
            <ul className="space-y-1.5">
              {rookieClassByTeam.slice(0, 6).map(({ teamName, picks }) => (
                <li key={teamName} className="flex items-center justify-between text-xs">
                  <span style={broadcastMutedTextStyle}>{teamName}</span>
                  <span className="font-semibold tabular-nums" style={broadcastBodyTextStyle}>
                    {picks} pick{picks !== 1 ? 's' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </BroadcastPanel>
        )}
      </div>
    </section>
  );
}
