import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { BroadcastPanel, BroadcastTeamLogo } from '@/components/ui/BroadcastPanel';
import {
  broadcastBodyTextStyle,
  broadcastMutedTextStyle,
  broadcastFaintTextStyle,
  teamAccent,
  PANEL,
} from '@/lib/ui/broadcast-styles';
import type { SleeperBracketGameWithScore } from '@/lib/utils/sleeper-api';

type Props = {
  winnersBracket: SleeperBracketGameWithScore[];
  losersBracket: SleeperBracketGameWithScore[];
  nameMap: Map<number, string>;
  seedMap: Map<number, number>;
  season?: number | string;
};

/**
 * Find the current active round in a bracket.
 *
 * A round is active when it contains at least one game where both participants
 * are assigned and no winner has been recorded yet (i.e., the game is live or
 * pending). Future rounds that have no participants are not considered active.
 *
 * If every populated round is complete, return the last populated round.
 * Returns null when the bracket is empty.
 */
function getCurrentRound(games: SleeperBracketGameWithScore[]): number | null {
  if (games.length === 0) return null;

  const rounds = [...new Set(games.map((g) => g.r).filter((r): r is number => r != null))].sort(
    (a, b) => a - b,
  );

  // Find the lowest round that has at least one game with both participants but no winner
  for (const round of rounds) {
    const roundGames = games.filter((g) => g.r === round);
    const hasActiveGame = roundGames.some((g) => g.t1 != null && g.t2 != null && g.w == null);
    if (hasActiveGame) return round;
  }

  // All populated rounds are complete — return the last round that had participants
  for (let i = rounds.length - 1; i >= 0; i--) {
    const round = rounds[i];
    const hasParticipant = games.some((g) => g.r === round && (g.t1 != null || g.t2 != null));
    if (hasParticipant) return round;
  }

  return null;
}

/**
 * Determine if the final round is complete and return the champion's roster ID.
 * Requires both participants assigned AND a winner recorded in the highest round.
 */
function resolveChampion(
  games: SleeperBracketGameWithScore[],
): number | null {
  if (games.length === 0) return null;

  const rounds = [...new Set(games.map((g) => g.r).filter((r): r is number => r != null))].sort(
    (a, b) => a - b,
  );
  if (rounds.length === 0) return null;

  const finalRound = rounds[rounds.length - 1];
  const finalGames = games.filter((g) => g.r === finalRound);

  // All final-round games must have both participants and a winner
  const allComplete = finalGames.every((g) => g.t1 != null && g.t2 != null && g.w != null);
  if (!allComplete || finalGames.length === 0) return null;

  // Return the winner of the championship game
  return finalGames[0].w ?? null;
}

function getTeamName(rosterId: number | null | undefined, nameMap: Map<number, string>) {
  if (rosterId == null) return null;
  return nameMap.get(rosterId) ?? `Roster ${rosterId}`;
}

function ActiveMatchup({
  game,
  nameMap,
}: {
  game: SleeperBracketGameWithScore;
  nameMap: Map<number, string>;
}) {
  const t1Name = getTeamName(game.t1, nameMap);
  const t2Name = getTeamName(game.t2, nameMap);
  if (!t1Name || !t2Name) return null;

  const t1Acc = teamAccent(t1Name);
  const t2Acc = teamAccent(t2Name);
  const hasScores = game.t1_points != null && game.t2_points != null;

  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: PANEL.tint, border: `1px solid ${PANEL.hairline}` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <BroadcastTeamLogo team={t1Name} accent={t1Acc} size="sm" />
          <span className="text-xs font-semibold truncate" style={broadcastBodyTextStyle}>{t1Name}</span>
        </div>
        {hasScores && (
          <span className="text-sm font-extrabold tabular-nums shrink-0" style={broadcastBodyTextStyle}>
            {(game.t1_points ?? 0).toFixed(1)} – {(game.t2_points ?? 0).toFixed(1)}
          </span>
        )}
        <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
          <BroadcastTeamLogo team={t2Name} accent={t2Acc} size="sm" />
          <span className="text-xs font-semibold truncate text-right" style={broadcastBodyTextStyle}>{t2Name}</span>
        </div>
      </div>
    </div>
  );
}

export default function PlayoffCenter({ winnersBracket, losersBracket, nameMap, seedMap, season }: Props) {
  const currentRound      = getCurrentRound(winnersBracket);
  const currentLoserRound = getCurrentRound(losersBracket);

  const activeWinnerGames = winnersBracket.filter(
    (g) => g.r === currentRound && g.t1 != null && g.t2 != null,
  );
  const activeLoserGames = losersBracket.filter(
    (g) => g.r === currentLoserRound && g.t1 != null && g.t2 != null,
  );

  const championRosterId = resolveChampion(winnersBracket);
  const championName     = championRosterId != null ? getTeamName(championRosterId, nameMap) : null;

  const roundLabels: Record<number, string> = {
    1: 'Quarterfinals',
    2: 'Semifinals',
    3: 'Championship',
  };
  const roundLabel = currentRound != null
    ? (roundLabels[currentRound] ?? `Round ${currentRound}`)
    : 'Playoffs';

  const seasonLabel = season != null ? String(season) : '';

  void seedMap; // available for future seed display

  return (
    <section className="mb-10 sm:mb-12">
      <SectionHeader
        title="Playoff center"
        actions={
          <Link href="/brackets" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            Full brackets →
          </Link>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Winners bracket status */}
        <BroadcastPanel
          accent="#f59e0b"
          title={championName ? 'Champion' : roundLabel}
          meta={
            championName
              ? [seasonLabel, 'East v. West Champion'].filter(Boolean).join(' ')
              : 'Official playoffs'
          }
        >
          {championName ? (
            <div className="flex items-center gap-3">
              <BroadcastTeamLogo team={championName} accent={teamAccent(championName)} size="md" />
              <div>
                <div className="text-base font-bold" style={broadcastBodyTextStyle}>{championName}</div>
                <div className="text-xs" style={broadcastMutedTextStyle}>
                  {[seasonLabel, 'East v. West Champion'].filter(Boolean).join(' ')}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {activeWinnerGames.length > 0 ? (
                activeWinnerGames.map((g, i) => (
                  <ActiveMatchup key={i} game={g} nameMap={nameMap} />
                ))
              ) : (
                <p className="text-sm" style={broadcastFaintTextStyle}>
                  Bracket matchups not yet set.
                </p>
              )}
              <div className="pt-1 text-xs" style={broadcastFaintTextStyle}>
                <Link href="/brackets" className="underline hover:text-[var(--panel-text)]">View full bracket →</Link>
              </div>
            </div>
          )}
        </BroadcastPanel>

        {/* Toilet bowl status */}
        {(activeLoserGames.length > 0 || currentLoserRound != null) && (
          <BroadcastPanel accent="#6b7280" title="Toilet bowl" meta="Consolation bracket">
            <div className="space-y-2">
              {activeLoserGames.length > 0 ? (
                activeLoserGames.map((g, i) => (
                  <ActiveMatchup key={i} game={g} nameMap={nameMap} />
                ))
              ) : (
                <p className="text-sm" style={broadcastFaintTextStyle}>
                  Consolation matchups not yet set.
                </p>
              )}
              <div className="pt-1 text-xs" style={broadcastFaintTextStyle}>
                <Link href="/brackets" className="underline hover:text-[var(--panel-text)]">View toilet bowl bracket →</Link>
              </div>
            </div>
          </BroadcastPanel>
        )}
      </div>
    </section>
  );
}
