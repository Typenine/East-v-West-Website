import TeamBadge from "@/components/teams/TeamBadge";
import { getTeamColors } from "@/lib/utils/team-utils";
import type { H2HCell } from "@/lib/utils/headtohead";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}

function isNeutralOrVeryLight(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const { r, g, b } = rgb;
  // Neutral grey heuristic: channels are close together
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const diff = max - min;
  // Very light heuristic: near white
  const light = max > 230 && min > 200;
  return diff < 12 || light;
}

function pickVibrantColor(team: string): string {
  const colors = getTeamColors(team) as { primary: string; secondary: string; tertiary?: string; quaternary?: string };
  const candidates = [colors.secondary, colors.primary, colors.tertiary, colors.quaternary].filter(Boolean) as string[];
  for (const c of candidates) {
    if (!isNeutralOrVeryLight(c)) return c;
  }
  return colors.primary;
}

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
                <div className="flex items-center justify-center">
                  <TeamBadge team={t} size="md" showName={false} />
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
                  <TeamBadge team={rowTeam} size="md" showName={false} />
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
                const base = pickVibrantColor(colTeam);
                const hasBeaten = cell.wins.total > 0;
                const neverBeaten = cell.meetings > 0 && cell.wins.total === 0;
                const bg = hasBeaten
                  ? `color-mix(in srgb, ${base} 28%, white 72%)`
                  : 'transparent';
                const border = base;
                const asterisk = hasBeaten && cell.wins.playoffs === 0 ? '*' : '';
                const title = `${rowTeam} vs ${colTeam}: ${hasBeaten ? 'BEATEN' : (neverBeaten ? 'NOT YET' : '—')}`;
                return (
                  <td
                    key={`${rowTeam}-${colTeam}`}
                    className="p-2 text-center align-middle border-l"
                    style={{ backgroundColor: bg, borderColor: border }}
                    title={title}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {hasBeaten ? (
                        <span className="text-[12px] leading-none" aria-label="has beaten">✓</span>
                      ) : null}
                      {hasBeaten && asterisk && (
                        <span className="text-[10px]" title="No winners-bracket playoff wins yet">*</span>
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
