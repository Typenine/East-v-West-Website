import { BroadcastTeamLogo, BroadcastAccentBadge } from '@/components/ui/BroadcastPanel';
import {
  PANEL,
  broadcastFaintTextStyle,
  teamAccent,
} from '@/lib/ui/broadcast-styles';
import type { H2HCell } from '@/lib/utils/headtohead';
import { IMPORTANT_DATES } from '@/lib/constants/league';

const GOLD = '#eab308';
const WIN = { bg: 'rgba(34,197,94,0.14)', accent: '#4ade80' };
const LOSS = { bg: 'rgba(239,68,68,0.12)', accent: '#f87171' };
const HIGHLIGHT = { bg: 'rgba(56,189,248,0.16)', accent: '#38bdf8' };

export default function HeadToHeadGrid({
  teams,
  matrix,
  highlightKeys,
}: {
  teams: string[];
  matrix: Record<string, Record<string, H2HCell>>;
  highlightKeys?: string[];
}) {
  const hk = (a: string, b: string) => `${a}||${b}`;
  const highlights = new Set(highlightKeys ?? []);
  const totalOpponents = Math.max(0, teams.length - 1);
  const cmp = (a: { year: string; week: number } | undefined, b: { year: string; week: number } | undefined) => {
    if (!a) return -1;
    if (!b) return 1;
    if (a.year === b.year) return a.week - b.week;
    return Number(a.year) - Number(b.year);
  };
  const complete = new Set<string>();
  const progress = new Map<string, { done: number; completedOn?: { year: string; week: number } }>();
  for (const rowTeam of teams) {
    let done = 0;
    let latest: { year: string; week: number } | undefined;
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

  const ringStyle = (enabled: boolean): React.CSSProperties | undefined =>
    enabled
      ? {
          boxShadow: `0 0 0 2px ${GOLD}, 0 0 0 4px rgba(234,179,8,0.15)`,
          borderRadius: 9999,
        }
      : undefined;

  const fmtCompletedOn = (rowTeam: string): string | undefined => {
    const info = progress.get(rowTeam);
    if (!info?.completedOn) return undefined;
    const y = info.completedOn.year;
    const w = info.completedOn.week;
    if (y === '2025') {
      const base = new Date(IMPORTANT_DATES.NFL_WEEK_1_START as unknown as string);
      if (!Number.isNaN(base.getTime())) {
        const d = new Date(base.getTime() + (w - 1) * 7 * 24 * 60 * 60 * 1000);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${mm}/${dd}`;
      }
    }
    return `W${w} ${y}`;
  };

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: PANEL.card,
        boxShadow: `inset 0 0 0 1px ${PANEL.border}`,
      }}
    >
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs md:text-sm">
          <thead>
            <tr style={{ background: PANEL.headerBg, borderBottom: `1px solid ${PANEL.hairline}` }}>
              <th className="p-2.5 w-36 sm:w-44" style={{ borderRight: `1px solid ${PANEL.hairline}` }} />
              {teams.map((t) => (
                <th key={t} className="p-2 text-center min-w-[52px]">
                  <div
                    className="flex flex-col items-center justify-center gap-1"
                    title={complete.has(t) ? `Completed on: ${fmtCompletedOn(t)}` : t}
                  >
                    <span style={ringStyle(complete.has(t))} className="inline-flex">
                      <BroadcastTeamLogo team={t} accent={teamAccent(t)} size="sm" />
                    </span>
                    {complete.has(t) ? (
                      <span className="text-[10px] leading-none" aria-label="completed">
                        🏆
                      </span>
                    ) : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {teams.map((rowTeam, rowIdx) => {
              const rowComplete = complete.has(rowTeam);
              const rowProgress = progress.get(rowTeam);
              return (
                <tr
                  key={rowTeam}
                  style={{
                    background: rowComplete ? 'rgba(234,179,8,0.06)' : rowIdx % 2 === 1 ? PANEL.tintSoft : undefined,
                    borderBottom: `1px solid ${PANEL.hairline}`,
                  }}
                >
                  <th
                    className="p-2.5 text-left whitespace-nowrap sticky left-0 z-10"
                    style={{
                      background: rowComplete ? 'rgba(234,179,8,0.08)' : PANEL.card,
                      borderRight: `1px solid ${PANEL.hairline}`,
                    }}
                    title={rowComplete ? `Completed on: ${fmtCompletedOn(rowTeam)}` : rowTeam}
                  >
                    <div className="flex items-center gap-2">
                      <span style={ringStyle(rowComplete)} className="inline-flex shrink-0">
                        <BroadcastTeamLogo team={rowTeam} accent={teamAccent(rowTeam)} size="sm" />
                      </span>
                      {rowComplete ? <span className="text-[10px] shrink-0">🏆</span> : null}
                      <BroadcastAccentBadge accent={rowComplete ? GOLD : teamAccent(rowTeam)}>
                        {rowProgress?.done}/{totalOpponents}
                        {rowComplete ? ' ✓' : ''}
                      </BroadcastAccentBadge>
                    </div>
                  </th>
                  {teams.map((colTeam) => {
                    if (rowTeam === colTeam) {
                      return (
                        <td
                          key={`${rowTeam}-${colTeam}`}
                          className="p-2 text-center align-middle"
                          style={{
                            background: PANEL.tintSoft,
                            color: PANEL.faint,
                          }}
                        >
                          —
                        </td>
                      );
                    }
                    const cell = matrix[rowTeam]?.[colTeam];
                    if (!cell) {
                      return (
                        <td
                          key={`${rowTeam}-${colTeam}`}
                          className="p-2 text-center align-middle"
                          style={{ color: PANEL.faint }}
                        >
                          —
                        </td>
                      );
                    }
                    const hasBeaten = cell.wins.total > 0;
                    const neverBeaten = cell.meetings > 0 && cell.wins.total === 0;
                    const asterisk = hasBeaten && cell.wins.regular === 0 ? '*' : '';
                    const isHighlight = neverBeaten && highlights.has(hk(rowTeam, colTeam));

                    let cellBg = 'transparent';
                    let cellAccent: string = PANEL.hairline;
                    if (isHighlight) {
                      cellBg = HIGHLIGHT.bg;
                      cellAccent = HIGHLIGHT.accent;
                    } else if (hasBeaten) {
                      cellBg = WIN.bg;
                      cellAccent = WIN.accent;
                    } else if (neverBeaten) {
                      cellBg = LOSS.bg;
                      cellAccent = LOSS.accent;
                    }

                    const title = `${rowTeam} vs ${colTeam}: ${hasBeaten ? 'BEATEN' : neverBeaten ? 'NOT YET' : '—'}`;

                    return (
                      <td
                        key={`${rowTeam}-${colTeam}`}
                        className="p-1.5 text-center align-middle"
                        title={title}
                      >
                        <div
                          className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg"
                          style={{
                            background: cellBg,
                            boxShadow: `inset 0 0 0 1px ${cellAccent}44`,
                            ...(isHighlight ? { boxShadow: `inset 0 0 0 1px ${cellAccent}, 0 0 0 1px ${cellAccent}55` } : {}),
                          }}
                        >
                          {hasBeaten ? (
                            <span
                              className="text-sm font-bold leading-none"
                              style={{ color: WIN.accent }}
                              aria-label="has beaten"
                            >
                              ✓
                            </span>
                          ) : null}
                          {hasBeaten && asterisk ? (
                            <span
                              className="ml-0.5 text-[10px] font-bold"
                              style={broadcastFaintTextStyle}
                              title="No regular-season wins yet"
                            >
                              *
                            </span>
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-wrap items-center gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider"
        style={{ borderTop: `1px solid ${PANEL.hairline}`, background: PANEL.headerBg }}
      >
        <span className="inline-flex items-center gap-1.5" style={broadcastFaintTextStyle}>
          <span className="inline-block h-3 w-3 rounded" style={{ background: WIN.bg, boxShadow: `inset 0 0 0 1px ${WIN.accent}66` }} />
          Beaten
        </span>
        <span className="inline-flex items-center gap-1.5" style={broadcastFaintTextStyle}>
          <span className="inline-block h-3 w-3 rounded" style={{ background: LOSS.bg, boxShadow: `inset 0 0 0 1px ${LOSS.accent}66` }} />
          Not yet
        </span>
        <span className="inline-flex items-center gap-1.5" style={broadcastFaintTextStyle}>
          <span className="inline-block h-3 w-3 rounded" style={{ background: HIGHLIGHT.bg, boxShadow: `inset 0 0 0 1px ${HIGHLIGHT.accent}66` }} />
          This week
        </span>
        <span style={broadcastFaintTextStyle}>* No reg-season win</span>
      </div>
    </div>
  );
}
