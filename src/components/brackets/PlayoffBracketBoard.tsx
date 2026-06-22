import Link from 'next/link';
import Image from 'next/image';
import { getTeamLogoPath, getTeamColors } from '@/lib/utils/team-utils';
import type { SleeperBracketGameWithScore } from '@/lib/utils/sleeper-api';
import {
  BRACKET_CONN_W,
  BRACKET_GAP,
  BRACKET_HEADER_H,
  BRACKET_MATCH_H,
  LOSERS_FINAL_LABELS,
  WINNERS_FINAL_LABELS,
  bracketCardTopY,
  bracketColHeight,
  losersRoundLabel,
  readableOn,
  winnersRoundLabel,
} from '@/components/brackets/playoff-bracket-utils';

type PlayoffBracketBoardProps = {
  games: SleeperBracketGameWithScore[];
  variant: 'winners' | 'losers';
  nameMap: Map<number, string>;
  seedMap: Map<number, number>;
  keyPrefix?: string;
  emptyMessage?: string;
};

function groupByRound(games: SleeperBracketGameWithScore[]) {
  const byRound: Record<number, SleeperBracketGameWithScore[]> = {};
  for (const g of games) {
    const r = g.r ?? 0;
    if (!byRound[r]) byRound[r] = [];
    byRound[r].push(g);
  }
  const roundNums = Object.keys(byRound)
    .map((n) => Number(n))
    .sort((a, b) => a - b);
  roundNums.forEach((r) => byRound[r].sort((a, b) => (a.m ?? 0) - (b.m ?? 0)));
  const totalRounds = roundNums.length > 0 ? Math.max(...roundNums) : 0;
  return { byRound, roundNums, totalRounds };
}

export default function PlayoffBracketBoard({
  games,
  variant,
  nameMap,
  seedMap,
  keyPrefix = variant,
  emptyMessage = 'No games yet.',
}: PlayoffBracketBoardProps) {
  if (games.length === 0) {
    return <p className="text-[var(--muted)]">{emptyMessage}</p>;
  }

  const { byRound, roundNums, totalRounds } = groupByRound(games);
  const finalLabels = variant === 'winners' ? WINNERS_FINAL_LABELS : LOSERS_FINAL_LABELS;

  const nameFor = (rid?: number | null) => {
    if (rid == null) return 'BYE';
    return nameMap.get(rid) || `Roster ${rid}`;
  };

  const TeamRow = ({
    rid,
    isWinner,
    score,
  }: {
    rid?: number | null;
    isWinner: boolean;
    score?: number | null;
  }) => {
    const nm = rid != null ? nameFor(rid) : 'BYE';
    const seed = rid != null ? (seedMap.get(rid) ?? null) : null;
    const colors = nm && nm !== 'BYE' ? getTeamColors(nm) : undefined;
    const bgColor = colors?.primary;
    const textColor = bgColor ? readableOn(bgColor) : undefined;

    return (
      <div
        className={`flex items-center justify-between gap-2 px-2 rounded h-[48px] ${isWinner ? 'font-semibold' : ''}`}
        style={bgColor ? { backgroundColor: bgColor, color: textColor } : undefined}
      >
        <div className="min-w-0 flex-1 flex items-center gap-2">
          {nm !== 'BYE' && rid != null ? (
            <Link
              href={`/teams/${rid}`}
              className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity"
              title={nm}
              style={{ color: textColor }}
            >
              <div
                className="w-[42px] h-[42px] rounded-full overflow-hidden border shrink-0 bg-white/10"
                style={{ borderColor: 'rgba(255,255,255,0.4)' }}
              >
                <Image
                  src={getTeamLogoPath(nm)}
                  alt={nm}
                  width={42}
                  height={42}
                  className="object-contain w-[42px] h-[42px]"
                  style={{ background: 'transparent' }}
                />
              </div>
              <span className="truncate text-xs font-medium">
                {seed ? `#${seed} ` : ''}
                {nm}
              </span>
            </Link>
          ) : (
            <span className="block truncate text-[var(--muted)]" title="BYE">
              BYE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {score != null ? (
            <span
              className="ml-2 text-xs px-1.5 py-0.5 rounded font-semibold"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: textColor }}
            >
              {score.toFixed(2)}
            </span>
          ) : null}
          {isWinner ? (
            <span className="ml-1 font-bold" style={{ color: textColor }}>
              &rsaquo;
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div className="overflow-x-auto">
      <div className="flex items-start">
        {roundNums.flatMap((r, rIdx) => {
          const mt1 = rIdx === 0 ? 0 : ((BRACKET_MATCH_H + BRACKET_GAP) * Math.pow(2, rIdx - 1)) / 2;
          const mtN = rIdx === 0 ? BRACKET_GAP : ((BRACKET_MATCH_H + BRACKET_GAP) * Math.pow(2, rIdx - 1));
          const roundGames = byRound[r];
          const numGames = roundGames.length;
          const isLastRound = r === totalRounds;
          const nextRIdx = rIdx + 1;
          const nextR = roundNums[nextRIdx];
          const nextGames = nextR != null ? byRound[nextR] : null;

          const gameByM = new Map<number, number>();
          roundGames.forEach((g, i) => {
            if (g.m != null) gameByM.set(g.m, i);
          });

          const connPaths =
            !isLastRound && nextGames
              ? nextGames.flatMap((ng, ngi) => {
                  const targetMidY = bracketCardTopY(nextRIdx, ngi) + BRACKET_MATCH_H / 2;
                  const sources: number[] = [];
                  for (const from of [ng.t1_from, ng.t2_from]) {
                    if (from == null) continue;
                    const srcM = from.w ?? from.l;
                    if (srcM == null) continue;
                    const srcIdx = gameByM.get(srcM);
                    if (srcIdx == null) continue;
                    sources.push(bracketCardTopY(rIdx, srcIdx) + BRACKET_MATCH_H / 2);
                  }
                  sources.sort((a, b) => a - b);
                  if (sources.length === 0) return [];
                  const jx = BRACKET_CONN_W / 2;
                  if (sources.length === 1) {
                    return [
                      <path
                        key={`${keyPrefix}-conn-${rIdx}-${ngi}-s`}
                        d={`M 0 ${sources[0]} H ${jx} V ${targetMidY} H ${BRACKET_CONN_W}`}
                        stroke="var(--accent)"
                        strokeWidth={3}
                        fill="none"
                      />,
                    ];
                  }
                  return [
                    <path
                      key={`${keyPrefix}-conn-${rIdx}-${ngi}-t`}
                      d={`M 0 ${sources[0]} H ${jx}`}
                      stroke="var(--accent)"
                      strokeWidth={3}
                      fill="none"
                    />,
                    <path
                      key={`${keyPrefix}-conn-${rIdx}-${ngi}-b`}
                      d={`M 0 ${sources[1]} H ${jx}`}
                      stroke="var(--accent)"
                      strokeWidth={3}
                      fill="none"
                    />,
                    <path
                      key={`${keyPrefix}-conn-${rIdx}-${ngi}-v`}
                      d={`M ${jx} ${sources[0]} V ${sources[1]}`}
                      stroke="var(--accent)"
                      strokeWidth={3}
                      fill="none"
                    />,
                    <path
                      key={`${keyPrefix}-conn-${rIdx}-${ngi}-e`}
                      d={`M ${jx} ${targetMidY} H ${BRACKET_CONN_W}`}
                      stroke="var(--accent)"
                      strokeWidth={3}
                      fill="none"
                    />,
                  ];
                })
              : [];

          const svgH = bracketColHeight(rIdx, numGames);
          const roundLabel =
            variant === 'winners'
              ? winnersRoundLabel(r, totalRounds)
              : losersRoundLabel(r, totalRounds, rIdx);

          const col = (
            <div key={`${keyPrefix}-col-${r}`} className="min-w-[260px]">
              <h4
                className="text-base font-bold text-[var(--text)]"
                style={{ height: BRACKET_HEADER_H, display: 'flex', alignItems: 'center' }}
              >
                {roundLabel}
              </h4>
              <div>
                {roundGames.map((g, idx) => (
                  <div
                    key={`${keyPrefix}-${r}-${g.m}`}
                    style={{ marginTop: idx === 0 ? mt1 : mtN }}
                    className={isLastRound ? 'relative pt-5' : ''}
                  >
                    {isLastRound ? (
                      <div className="absolute top-0 left-0 right-0 text-center text-xs font-semibold text-[var(--muted)] uppercase tracking-wide">
                        {finalLabels[idx] ?? ''}
                      </div>
                    ) : null}
                    <div className="border rounded p-2 h-[108px] flex flex-col justify-between">
                      <TeamRow
                        rid={g.t1 ?? null}
                        isWinner={g.w != null && g.t1 != null && g.w === g.t1}
                        score={g.t1_points ?? null}
                      />
                      <TeamRow
                        rid={g.t2 ?? null}
                        isWinner={g.w != null && g.t2 != null && g.w === g.t2}
                        score={g.t2_points ?? null}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );

          if (isLastRound) return [col];

          const conn = (
            <div key={`${keyPrefix}-conn-${r}`} style={{ width: BRACKET_CONN_W, flexShrink: 0 }}>
              <div style={{ height: BRACKET_HEADER_H }} />
              <svg width={BRACKET_CONN_W} height={svgH} style={{ display: 'block', overflow: 'visible' }}>
                {connPaths}
              </svg>
            </div>
          );
          return [col, conn];
        })}
      </div>
    </div>
  );
}
