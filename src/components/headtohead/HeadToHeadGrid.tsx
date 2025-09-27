import TeamBadge from "@/components/teams/TeamBadge";
import type { H2HCell } from "@/lib/utils/headtohead";

export default function HeadToHeadGrid({
  teams,
  matrix,
  highlightKeys,
}: {
  teams: string[];
  matrix: Record<string, Record<string, H2HCell>>;
  highlightKeys?: string[]; // keys of form "row||col"
}) {
  const hk = (a: string, b: string) => `${a}||${b}`;
  const highlights = new Set(highlightKeys ?? []);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs md:text-sm">
        <thead>
          <tr>
            <th className="p-2" />
            {teams.map((t) => (
              <th key={t} className="p-2 text-center">
                <div className="flex items-center justify-center">
                  <TeamBadge team={t} size="lg" showName={false} />
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
                  <TeamBadge team={rowTeam} size="lg" showName={false} />
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
                const hasBeaten = cell.wins.total > 0;
                const neverBeaten = cell.meetings > 0 && cell.wins.total === 0;
                const green = '#1e8e5a';
                const red = '#d64545';
                const bg = hasBeaten
                  ? `color-mix(in srgb, ${green} 30%, white 70%)`
                  : (neverBeaten ? `color-mix(in srgb, ${red} 28%, white 72%)` : 'transparent');
                const border = hasBeaten ? green : neverBeaten ? red : 'var(--border)';
                // Asterisk rule: has wins but none in REGULAR season
                const asterisk = hasBeaten && cell.wins.regular === 0 ? '*' : '';
                const isHighlight = neverBeaten && highlights.has(hk(rowTeam, colTeam));
                const blue = '#2563eb';
                const bgFinal = isHighlight
                  ? `color-mix(in srgb, ${blue} 26%, white 74%)`
                  : bg;
                const borderFinal = isHighlight ? blue : border;
                const title = `${rowTeam} vs ${colTeam}: ${hasBeaten ? 'BEATEN' : (neverBeaten ? 'NOT YET' : '—')}`;
                return (
                  <td
                    key={`${rowTeam}-${colTeam}`}
                    className="p-2 text-center align-middle border-l"
                    style={{ backgroundColor: bgFinal, borderColor: borderFinal }}
                    title={title}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {hasBeaten ? (
                        <span className="text-[12px] leading-none" aria-label="has beaten">✓</span>
                      ) : null}
                      {hasBeaten && asterisk && (
                        <span className="text-[10px]" title="No regular-season wins yet">*</span>
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
