'use client';

import { BroadcastTeamLogo, BroadcastAccentBadge, BroadcastSectionLabel } from '@/components/ui/BroadcastPanel';
import { PANEL, broadcastBodyTextStyle, broadcastFaintTextStyle, broadcastMutedTextStyle, teamAccent } from '@/lib/ui/broadcast-styles';

export interface NeverBeatenEntry {
  team: string;
  vs: string;
  meetings: number;
  lastMeeting?: { year: string; week: number };
}

export default function NeverBeatenTracker({ list }: { list: NeverBeatenEntry[] }) {
  const grouped = new Map<string, NeverBeatenEntry[]>();
  for (const item of list) {
    const arr = grouped.get(item.team) || [];
    arr.push(item);
    grouped.set(item.team, arr);
  }

  const teams = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  if (teams.length === 0) {
    return (
      <div
        className="rounded-xl px-4 py-8 text-center text-sm"
        style={{
          background: PANEL.tintSoft,
          boxShadow: `inset 0 0 0 1px ${PANEL.hairline}`,
          ...broadcastMutedTextStyle,
        }}
      >
        Every team has beaten every opponent at least once 🎉
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {teams.map((team) => {
        const entries = (grouped.get(team) || []).sort(
          (x, y) => y.meetings - x.meetings || x.vs.localeCompare(y.vs),
        );
        const accent = teamAccent(team);
        return (
          <div
            key={team}
            className="rounded-xl px-4 py-3.5"
            style={{
              background: PANEL.tintSoft,
              boxShadow: `inset 0 0 0 1px ${PANEL.hairline}`,
              borderLeft: `3px solid ${accent}`,
            }}
          >
            <div className="mb-3 flex items-center gap-3">
              <BroadcastTeamLogo team={team} accent={accent} size="sm" />
              <div className="min-w-0">
                <BroadcastSectionLabel accent={accent}>Never beaten</BroadcastSectionLabel>
                <div className="truncate text-sm font-semibold" style={broadcastBodyTextStyle}>
                  {team}
                </div>
              </div>
              <BroadcastAccentBadge accent={accent} className="ml-auto">
                {entries.length} opp{entries.length === 1 ? '' : 's'}
              </BroadcastAccentBadge>
            </div>
            <div className="flex flex-wrap gap-2">
              {entries.map((e) => {
                const vsAccent = teamAccent(e.vs);
                return (
                  <span
                    key={`${team}-${e.vs}`}
                    className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm"
                    style={{
                      background: `${vsAccent}14`,
                      boxShadow: `inset 0 0 0 1px ${vsAccent}44`,
                    }}
                    title={`Last met: ${e.lastMeeting ? `${e.lastMeeting.year} W${e.lastMeeting.week}` : '—'}`}
                  >
                    <BroadcastTeamLogo team={e.vs} accent={vsAccent} size="sm" />
                    <span className="font-medium" style={broadcastBodyTextStyle}>
                      {e.vs}
                    </span>
                    <span className="text-xs tabular-nums" style={broadcastFaintTextStyle}>
                      0–{e.meetings}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
