import TeamBadge from "@/components/teams/TeamBadge";
import type { H2HCell } from "@/lib/utils/headtohead";
import { IMPORTANT_DATES } from "@/lib/constants/league";

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
  const totalOpponents = Math.max(0, teams.length - 1);
  const cmp = (a: { year: string; week: number } | undefined, b: { year: string; week: number } | undefined) => {
    if (!a) return -1; if (!b) return 1; if (a.year === b.year) return a.week - b.week; return Number(a.year) - Number(b.year);
  };
  const complete = new Set<string>();
  const progress = new Map<string, { done: number; completedOn?: { year: string; week: number } }>();
  for (const rowTeam of teams) {
    let done = 0; let latest: { year: string; week: number } | undefined;
    for (const colTeam of teams) {
      if (rowTeam === colTeam) continue;
      const cell = matrix[rowTeam]?.[colTeam];
      if (cell && cell.wins.total > 0) {
        done += 1;
        if (cell.firstWinAt) {
          if (!latest || cmp(latest, cell.firstWinAt) < 0) latest = cell.firstWinAt;
        }
      }
    }
    progress.set(rowTeam, { done, completedOn: done === totalOpponents ? latest : undefined });
    if (done === totalOpponents) complete.add(rowTeam);
  }
  const gold = "#d4af37";
  const ringStyle = (enabled: boolean): React.CSSProperties | undefined => enabled ? { boxShadow: `0 0 0 2px ${gold}, 0 0 0 4px var(--surface)`, borderRadius: 9999 } : undefined;
  const fmtCompletedOn = (rowTeam: string): string | undefined => {
    const info = progress.get(rowTeam);
    if (!info?.completedOn) return undefined;
    const y = info.completedOn.year;
    const w = info.completedOn.week;
    if (y === "2025") {
      const base = new Date(IMPORTANT_DATES.NFL_WEEK_1_START as unknown as string);
      if (!Number.isNaN(base.getTime())) {
        const d = new Date(base.getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${mm}/${dd}`;
      }
    }
    return `W${w} ${y}`;
  };
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs md:text-sm">
        <thead>
          <tr>
            <th className="p-2" />
            {teams.map((t) => (
              <th key={t} className="p-2 text-center">
                <div className="flex items-center justify-center" title={complete.has(t) ? `Completed on: ${fmtCompletedOn(t)}` : undefined}>
                  <span style={ringStyle(complete.has(t))} className="inline-flex">
                    <TeamBadge team={t} size="lg" showName={false} />
                  </span>
                  {complete.has(t) && (
                    <span aria-label="completed" className="ml-1 text-[12px]">🏆</span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((rowTeam) => (
            <tr key={rowTeam} style={complete.has(rowTeam) ? { backgroundColor: `color-mix(in srgb, ${gold} 18%, white 82%)` } : undefined}>
              <th className="p-2 text-left whitespace-nowrap" title={complete.has(rowTeam) ? `Completed on: ${fmtCompletedOn(rowTeam)}` : undefined}>
                <div className="flex items-center gap-2">
                  <span style={ringStyle(complete.has(rowTeam))} className="inline-flex">
                    <TeamBadge team={rowTeam} size="lg" showName={false} />
                  </span>
                  {complete.has(rowTeam) && <span className="text-[12px]">🏆</span>}
                  <span className={`px-2 py-0.5 rounded border text-[10px] ${complete.has(rowTeam) ? 'font-semibold' : ''}`} style={{ borderColor: gold }}>
                    {progress.get(rowTeam)?.done}/{totalOpponents}{complete.has(rowTeam) ? ' ✓' : ''}
                  </span>
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
