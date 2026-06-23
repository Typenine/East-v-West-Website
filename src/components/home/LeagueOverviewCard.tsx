import Link from 'next/link';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  teamAccent,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import { CHAMPIONS, TEAM_NAMES } from '@/lib/constants/league';
import type { HomepagePhase } from '@/lib/utils/countdown-resolver';

const PHASE_LABELS: Record<HomepagePhase, string> = {
  post_championship_pre_draft: 'Offseason — pre-draft',
  post_draft_pre_fa: 'Post-draft — pre-FA bidding',
  fa_open_pre_season: 'Free agency open',
  regular_season: 'Regular season',
  post_deadline_pre_postseason: 'Playoff race',
  postseason: 'Postseason',
};

type Props = {
  phase: HomepagePhase;
  recapYear: string;
  defendingChampion?: string;
};

export default function LeagueOverviewCard({ phase, recapYear, defendingChampion }: Props) {
  const champ = defendingChampion
    || CHAMPIONS[recapYear as keyof typeof CHAMPIONS]?.champion
    || null;
  const accent = champ && champ !== 'TBD' ? teamAccent(champ) : '#6366f1';

  const QUICK_LINKS = [
    { label: 'Teams', href: '/teams' },
    { label: 'Standings', href: '/standings' },
    { label: 'Draft Central', href: '/draft' },
    { label: 'Trade block', href: '/trade-block' },
    { label: 'History', href: '/history' },
  ];

  return (
    <BroadcastPanel accent={accent} title="East v. West" meta={`${TEAM_NAMES.length} teams`}>
      <div className="space-y-3">
        {/* Current phase */}
        <div className="flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
            style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}44` }}
          >
            {PHASE_LABELS[phase]}
          </span>
        </div>

        {/* Defending champion */}
        {champ && champ !== 'TBD' && (
          <div className="flex items-center gap-3 pt-1">
            <BroadcastTeamLogo team={champ} accent={accent} size="sm" />
            <div>
              <div className="text-[10px] uppercase tracking-widest font-bold" style={broadcastFaintTextStyle}>
                {recapYear} Champion
              </div>
              <div className="text-sm font-semibold" style={broadcastBodyTextStyle}>{champ}</div>
            </div>
          </div>
        )}

        {/* Quick links */}
        <div
          className="border-t pt-3 mt-1"
          style={{ borderColor: PANEL.hairline }}
        >
          <div className="text-[10px] uppercase tracking-widest font-bold mb-2" style={broadcastFaintTextStyle}>
            Explore
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_LINKS.map(({ label, href }) => (
              <Link
                key={href}
                href={href}
                className="rounded px-2.5 py-1 text-xs font-medium transition-colors hover:text-white"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  color: PANEL.text,
                  border: `1px solid ${PANEL.hairline}`,
                }}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        {/* Login CTA */}
        <div className="text-xs pt-1" style={broadcastMutedTextStyle}>
          <Link href="/login" className="underline hover:text-white">Sign in</Link>
          {' '}to view your personalized team dashboard.
        </div>
      </div>
    </BroadcastPanel>
  );
}
