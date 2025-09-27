"use client";

import TeamBadge from "@/components/teams/TeamBadge";
import { getTeamColors } from "@/lib/utils/team-utils";

export interface NeverBeatenEntry {
  team: string;
  vs: string;
  meetings: number;
  lastMeeting?: { year: string; week: number };
}

export default function NeverBeatenTracker({ list }: { list: NeverBeatenEntry[] }) {
  // Group by team
  const grouped = new Map<string, NeverBeatenEntry[]>();
  for (const item of list) {
    const arr = grouped.get(item.team) || [];
    arr.push(item);
    grouped.set(item.team, arr);
  }

  const teams = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  if (teams.length === 0) {
    return (
      <div className="p-4 text-sm text-[var(--muted)]">Every team has beaten every opponent at least once 🎉</div>
    );
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {teams.map((team) => {
        const entries = (grouped.get(team) || []).sort((x, y) => y.meetings - x.meetings || x.vs.localeCompare(y.vs));
        return (
          <div key={team} className="py-3">
            <div className="flex items-center gap-3 mb-2">
              <TeamBadge team={team} size="lg" />
              <span className="text-sm text-[var(--muted)]">Never beaten</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {entries.map((e) => {
                const colors = getTeamColors(e.vs);
                const bg = colors.secondary + '22';
                const border = colors.secondary;
                return (
                  <span
                    key={`${team}-${e.vs}`}
                    className="inline-flex items-center gap-2 px-2.5 py-1 rounded border text-sm"
                    style={{ backgroundColor: bg, borderColor: border }}
                    title={`Last met: ${e.lastMeeting ? `${e.lastMeeting.year} W${e.lastMeeting.week}` : '—'}`}
                  >
                    <TeamBadge team={e.vs} size="sm" />
                    <span className="font-medium">{e.vs}</span>
                    <span className="text-[var(--muted)]">0–{e.meetings}</span>
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
