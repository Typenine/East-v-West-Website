import TeamBadge from "@/components/teams/TeamBadge";
import { getTeamColors } from "@/lib/utils/team-utils";
import type { H2HCell } from "@/lib/utils/headtohead";

export default function HeadToHeadGrid({
  teams,
  matrix,
}: {
  teams: string[];
  matrix: Record<string, Record<string, H2HCell>>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs md:text-sm">
        <thead>
          <tr>
            <th className="p-2" />
            {teams.map((t) => (
              <th key={t} className="p-2 text-center">
                <div className="flex flex-col items-center gap-1">
                  <TeamBadge team={t} size="sm" showName={false} />
                  <span className="max-w-[6rem] truncate">{t}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((rowTeam) => (
            <tr key={rowTeam}>
              <th className="p-2 text-left whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <TeamBadge team={rowTeam} size="sm" />
                </div>
              </th>
              {teams.map((colTeam) => {
                if (rowTeam === colTeam) {
                  return (
                    <td key={`${rowTeam}-${colTeam}`} className="p-2 text-center text-[var(--muted)]">—</td>
                  );
                }
                const cell = matrix[rowTeam]?.[colTeam];
                if (!cell) return (
                  <td key={`${rowTeam}-${colTeam}`} className="p-2 text-center text-[var(--muted)]">—</td>
                );
                const colors = getTeamColors(colTeam);
                const bg = cell.wins.total > 0 ? (colors.secondary + '12') : (colors.primary + '10');
                const border = colors.secondary;
                const wins = cell.wins.total;
                const losses = cell.losses.total;
                const ties = cell.ties;
                const record = `${wins}-${losses}${ties > 0 ? `-${ties}` : ''}`;
                const asterisk = wins > 0 && cell.wins.playoffs === 0 ? '*' : '';
                const title = `${rowTeam} vs ${colTeam}: ${record}\nWins by split: R ${cell.wins.regular} • P ${cell.wins.playoffs} • T ${cell.wins.toilet}`;
                return (
                  <td
                    key={`${rowTeam}-${colTeam}`}
                    className="p-2 text-center align-middle border-l"
                    style={{ backgroundColor: bg, borderColor: border }}
                    title={title}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <span className={wins === 0 ? "font-semibold text-red-600" : "font-semibold"}>{record}</span>
                      {asterisk && (
                        <span className="text-[10px]" title="No playoff wins yet (regular/toilet only)">{asterisk}</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
