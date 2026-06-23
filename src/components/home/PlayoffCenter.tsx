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
};

function getRound(games: SleeperBracketGameWithScore[]) {
  if (games.length === 0) return null;
  return Math.max(...games.map((g) => g.r ?? 0));
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
      style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${PANEL.hairline}` }}
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

export default function PlayoffCenter({ winnersBracket, losersBracket, nameMap, seedMap }: Props) {
  const currentRound = getRound(winnersBracket);
  const currentLoserRound = getRound(losersBracket);

  const activeWinnerGames = winnersBracket.filter((g) => g.r === currentRound && g.t1 != null && g.t2 != null);
  const activeLoserGames = losersBracket.filter((g) => g.r === currentLoserRound && g.t1 != null && g.t2 != null);

  // Determine champion if any game in round 3+ has a winner
  const finalGame = winnersBracket
    .filter((g) => (g.r ?? 0) >= 3)
    .sort((a, b) => (b.r ?? 0) - (a.r ?? 0))[0];
  const championRosterId = finalGame?.w ?? null;
  const championName = championRosterId != null ? getTeamName(championRosterId, nameMap) : null;

  const roundLabels: Record<number, string> = { 1: 'Quarterfinals', 2: 'Semifinals', 3: 'Championship' };
  const roundLabel = currentRound != null ? (roundLabels[currentRound] ?? `Round ${currentRound}`) : 'Playoffs';

  void seedMap; // available for future use (seeding display)

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
          title={championName ? '🏆 Champion' : roundLabel}
          meta={championName ? '2026 East v. West Champion' : 'Official playoffs'}
        >
          {championName ? (
            <div className="flex items-center gap-3">
              <BroadcastTeamLogo team={championName} accent={teamAccent(championName)} size="md" />
              <div>
                <div className="text-base font-bold" style={broadcastBodyTextStyle}>{championName}</div>
                <div className="text-xs" style={broadcastMutedTextStyle}>2026 East v. West Champion</div>
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
                <Link href="/brackets" className="underline hover:text-white">View full bracket →</Link>
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
                <Link href="/brackets" className="underline hover:text-white">View toilet bowl bracket →</Link>
              </div>
            </div>
          </BroadcastPanel>
        )}
      </div>
    </section>
  );
}
