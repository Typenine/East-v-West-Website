import type { LeagueTransaction } from "@/lib/utils/transactions";
import TeamBadge from "@/components/teams/TeamBadge";
import { getTeamColors } from "@/lib/utils/team-utils";

function formatDate(timestamp: number) {
  if (!timestamp) return "—";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function GroupedByTeam({ data }: { data: LeagueTransaction[] }) {
  // Group by team
  const byTeam = new Map<string, LeagueTransaction[]>();
  for (const txn of data) {
    const key = txn.team || `Roster ${txn.rosterId}`;
    const arr = byTeam.get(key) || [];
    arr.push(txn);
    byTeam.set(key, arr);
  }
  const teams = Array.from(byTeam.keys()).sort((a, b) => a.localeCompare(b));

  if (teams.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-[var(--muted)]">No transactions.</div>
    );
  }

  return (
    <div className="divide-y divide-[var(--border)]">
      {teams.map((team) => {
        const items = (byTeam.get(team) || []).slice().sort((a, b) => b.created - a.created);
        const totalFaab = items.reduce((sum, t) => sum + (t.faab || 0), 0);
        const colors = getTeamColors(team);
        return (
          <section key={team} className="py-3">
            <div
              className="flex items-center justify-between px-4 py-2 border-b"
              style={{
                backgroundColor: colors.secondary + '11',
                borderColor: colors.secondary,
              }}
            >
              <div className="flex items-center gap-2">
                <TeamBadge team={team} size="lg" />
              </div>
              <div className="text-xs text-[var(--muted)]">FAAB: ${totalFaab}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Season</th>
                    <th className="px-4 py-3">Week</th>
                    <th className="px-4 py-3">Added</th>
                    <th className="px-4 py-3">Dropped</th>
                    <th className="px-4 py-3 text-right">FAAB</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((txn) => (
                    <tr
                      key={`${txn.id}-${txn.rosterId}`}
                      className="border-t border-[var(--border)] border-l-4"
                      style={{ borderLeftColor: colors.primary }}
                    >
                      <td className="px-4 py-3 whitespace-nowrap">{formatDate(txn.created)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{txn.season}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{txn.week > 0 ? `W${txn.week}` : "—"}</td>
                      <td className="px-4 py-3">
                        <ul className="space-y-1">
                          {txn.added.map((player) => (
                            <li key={`${txn.id}-add-${player.playerId}`}>
                              <span className="font-medium">{player.name ?? player.playerId}</span>
                              {player.position ? ` • ${player.position}` : ""}
                              {player.nflTeam ? ` (${player.nflTeam})` : ""}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-4 py-3">
                        {txn.dropped.length ? (
                          <ul className="space-y-1 text-[var(--muted)]">
                            {txn.dropped.map((player) => (
                              <li key={`${txn.id}-drop-${player.playerId}`}>
                                <span>{player.name ?? player.playerId}</span>
                                {player.position ? ` • ${player.position}` : ""}
                                {player.nflTeam ? ` (${player.nflTeam})` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-[var(--muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{txn.faab > 0 ? `$${txn.faab}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
