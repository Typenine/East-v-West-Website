import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type {
  TeamDashboardAlert,
  TeamDashboardPlayer,
  TeamDashboardSeverity,
} from '@/lib/home/team-dashboard-types';

export const TEAM_STATUS_META: Record<
  TeamDashboardSeverity,
  { label: string; color: string; bg: string }
> = {
  critical: { label: 'Action required', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
  warning: { label: 'Needs review', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  info: { label: 'Opportunity', color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  good: { label: 'Ready', color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
};

export const TEAM_NEWS_CATEGORY_LABELS: Record<string, string> = {
  injury: 'Injury',
  practice_availability: 'Practice',
  nfl_transaction: 'Transaction',
  contract: 'Contract',
  trade: 'Trade',
  trade_rumor: 'Rumor',
  suspension: 'Suspension',
  depth_chart_role: 'Depth chart',
  retirement: 'Retirement',
  rookie_development: 'Rookie',
  performance: 'Performance',
  general_analysis: 'News',
};

export function formatTeamRecord(wins: number, losses: number) {
  return `${wins}–${losses}`;
}

export function ordinalPlacement(value: number | null | undefined): string {
  if (!value) return 'Not ranked';
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (mod10 === 1) return `${value}st`;
  if (mod10 === 2) return `${value}nd`;
  if (mod10 === 3) return `${value}rd`;
  return `${value}th`;
}

export function teamTimeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function compactTeamName(team: string): string {
  const words = team.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0];
  return words.map((word) => word[0]?.toUpperCase()).join('').slice(0, 4);
}

export function isTeamDataStale(date: string | null, days: number): boolean {
  if (!date) return false;
  const timestamp = new Date(date).getTime();
  return Number.isFinite(timestamp)
    && Date.now() - timestamp > days * 24 * 60 * 60 * 1000;
}

export function TeamStatBox({
  value,
  label,
  warning,
}: {
  value: string;
  label: string;
  warning?: boolean;
}) {
  return (
    <div
      className="rounded-lg px-2 py-2 text-center"
      style={{
        background: warning ? 'rgba(239,68,68,0.08)' : PANEL.tint,
        border: `1px solid ${warning ? 'rgba(239,68,68,0.25)' : PANEL.hairline}`,
      }}
    >
      <div
        className="text-base sm:text-lg font-extrabold tabular-nums leading-none"
        style={warning ? { color: '#ef4444' } : broadcastBodyTextStyle}
      >
        {value}
      </div>
      <div className="mt-1 text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>
        {label}
      </div>
    </div>
  );
}

export function TeamRankBox({
  label,
  value,
  detail,
  title,
}: {
  label: string;
  value: string;
  detail: string;
  title?: string;
}) {
  return (
    <div
      className="rounded-md px-2.5 py-2"
      title={title}
      style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}
    >
      <div className="text-[9px] uppercase tracking-wide" style={broadcastFaintTextStyle}>
        {label}
      </div>
      <div className="text-sm font-bold mt-0.5 tabular-nums" style={broadcastBodyTextStyle}>
        {value}
      </div>
      <div className="text-[10px] mt-0.5 leading-snug" style={broadcastMutedTextStyle}>
        {detail}
      </div>
    </div>
  );
}

export function TeamAlertRow({ alert }: { alert: TeamDashboardAlert }) {
  const meta = TEAM_STATUS_META[alert.severity];
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: meta.bg, border: `1px solid ${meta.color}33` }}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1 h-2 w-2 shrink-0 rounded-full"
          style={{ background: meta.color }}
        />
        <div className="min-w-0">
          <div className="text-xs font-bold" style={{ color: meta.color }}>
            {alert.title}
          </div>
          <div className="text-[11px] mt-0.5 leading-relaxed" style={broadcastMutedTextStyle}>
            {alert.detail}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamPlayerTile({
  player,
  accent,
}: {
  player: TeamDashboardPlayer;
  accent: string;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg p-2"
      style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}
    >
      <div
        className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-[11px] font-black"
        style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}
      >
        {initials(player.name)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-bold truncate" style={broadcastBodyTextStyle}>
          {player.name}
        </div>
        <div className="text-[10px] truncate" style={broadcastFaintTextStyle}>
          {player.position}
          {player.nflTeam ? ` · ${player.nflTeam}` : ''}
          {player.age ? ` · age ${player.age}` : ''}
        </div>
      </div>
      {player.injuryStatus && (
        <span
          className="text-[9px] font-bold rounded px-1.5 py-0.5"
          style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)' }}
        >
          {player.injuryStatus}
        </span>
      )}
    </div>
  );
}
