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

export default function TransactionsTable({
  data,
  sortKey,
  direction,
}: {
  data: LeagueTransaction[];
  sortKey: string;
  direction: "asc" | "desc";
}) {
  if (!data.length) {
    return (
      <div className="p-6 text-center text-sm text-[var(--muted)]">
        No transactions match the selected filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            <HeaderCell label="Date" active={sortKey === "created"} direction={direction} />
            <HeaderCell label="Season" active={sortKey === "season"} direction={direction} />
            <HeaderCell label="Week" active={sortKey === "week"} direction={direction} />
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Team</th>
            <th className="px-4 py-3">Added</th>
            <th className="px-4 py-3">Dropped</th>
            <HeaderCell label="FAAB" active={sortKey === "faab"} direction={direction} align="right" />
          </tr>
        </thead>
        <tbody>
          {data.map((txn) => {
            const accentTeam = txn.teamsInvolved[0] || txn.team;
            const colors = getTeamColors(accentTeam);
            const typeLabel = txn.type === "trade" ? "Trade" : txn.type === "waiver" ? "Waiver" : "FA";
            return (
            <tr
              key={`${txn.id}-${txn.type}-${txn.rosterId}`}
              className="border-t border-[var(--border)] border-l-4"
              style={{ borderLeftColor: colors.primary }}
            >
              <td className="px-4 py-3 whitespace-nowrap">{formatDate(txn.created)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{txn.season}</td>
              <td className="px-4 py-3 whitespace-nowrap">{txn.week > 0 ? `W${txn.week}` : "—"}</td>
              <td className="px-4 py-3">
                <span className="inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-[var(--surface-2)] border border-[var(--border)]">
                  {typeLabel}
                </span>
              </td>
              <td className="px-4 py-3 font-medium">
                {txn.type === "trade" ? (
                  <span className="text-sm leading-snug break-words max-w-[min(280px,40vw)] inline-block">{txn.team}</span>
                ) : (
                  <TeamBadge team={txn.team} size="lg" />
                )}
              </td>
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
          );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HeaderCell({
  label,
  active,
  direction,
  align = "left",
}: {
  label: string;
  active: boolean;
  direction: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-3 ${align === "right" ? "text-right" : "text-left"}`}>
      {label}
      {active ? ` (${direction === "desc" ? "↓" : "↑"})` : ""}
    </th>
  );
}
