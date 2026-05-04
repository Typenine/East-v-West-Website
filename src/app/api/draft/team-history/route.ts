import { NextRequest } from 'next/server';
import {
  getTeamsData,
  getLeaguePlayoffBracketsWithScores,
  getRegularSeasonRecords,
  type SleeperBracketGameWithScore,
} from '@/lib/utils/sleeper-api';
import { LEAGUE_IDS } from '@/lib/constants/league';
import { canonicalizeTeamName } from '@/lib/server/user-identity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SeasonResult {
  season: string;
  wins: number;
  losses: number;
  fpts: number;
  playoffResult: string;       // e.g. "Champion", "Runner-Up", "Lost in Semis", "Lost in Quarters", "Did not qualify"
  playoffOpponent?: string;    // opponent in the elimination game
  winScore?: number;           // team's score in that game
  oppScore?: number;           // opponent's score in that game
  madePlayoffs: boolean;
}

const SEASONS: Array<{ label: string; leagueId: string }> = [
  { label: '2025', leagueId: LEAGUE_IDS.CURRENT },
  { label: '2024', leagueId: LEAGUE_IDS.PREVIOUS['2024'] },
  { label: '2023', leagueId: LEAGUE_IDS.PREVIOUS['2023'] },
];

const ROUND_NAMES: Record<number, string> = {
  1: 'Quarterfinals',
  2: 'Semifinals',
  3: 'Finals',
};

async function getSeasonResult(
  ownerId: string,
  leagueId: string,
  season: string
): Promise<SeasonResult | null> {
  try {
    const [teams, { winners }, regMap] = await Promise.all([
      getTeamsData(leagueId, { forceFresh: true }).catch(() => []),
      getLeaguePlayoffBracketsWithScores(leagueId).catch(() => ({ winners: [] as SleeperBracketGameWithScore[], losers: [] as SleeperBracketGameWithScore[] })),
      getRegularSeasonRecords(leagueId, { forceFresh: true }).catch(() => null as Map<number, { wins: number; losses: number; ties: number; fpts: number }> | null),
    ]);

    // Match by owner ID to correctly track a team across seasons (team names can differ year to year)
    const teamData = teams.find(t => t.ownerId === ownerId);
    if (!teamData) return null;

    const myRosterId = teamData.rosterId;
    const reg = regMap?.get(myRosterId);
    const wins = reg?.wins ?? teamData.wins;
    const losses = reg?.losses ?? teamData.losses;
    const ties = reg?.ties ?? teamData.ties;
    const regFpts = reg?.fpts;

    // Build roster ID → team name map from this season's teams
    const rIdToName = new Map(teams.map(t => [t.rosterId, t.teamName]));

    // Check if team made playoffs
    const playoffRosterIds = new Set<number>();
    for (const g of winners) {
      if (g.t1 != null) playoffRosterIds.add(g.t1);
      if (g.t2 != null) playoffRosterIds.add(g.t2);
    }
    const madePlayoffs = playoffRosterIds.has(myRosterId);

    if (!madePlayoffs) {
      return {
        season,
        wins,
        losses,
        fpts: regFpts != null ? regFpts : teamData.fpts,
        playoffResult: 'Did not qualify',
        madePlayoffs: false,
      };
    }

    // Determine max round (championship round)
    const maxRound = winners.reduce((m, g) => Math.max(m, g.r ?? 0), 0);

    // Find all games this team played in
    const myGames = winners
      .filter(g => g.t1 === myRosterId || g.t2 === myRosterId)
      .sort((a, b) => (a.r ?? 0) - (b.r ?? 0));

    // Find the last game they played (highest round)
    const lastGame = myGames[myGames.length - 1];
    if (!lastGame) {
      return {
        season, wins, losses, fpts: regFpts != null ? regFpts : teamData.fpts,
        playoffResult: 'Made playoffs', madePlayoffs: true,
      };
    }

    const lastRound = lastGame.r ?? 0;
    const won = lastGame.w === myRosterId;
    const oppRosterId = lastGame.t1 === myRosterId ? lastGame.t2 : lastGame.t1;
    const oppName = oppRosterId != null ? (rIdToName.get(oppRosterId) ?? `Roster ${oppRosterId}`) : undefined;

    // Attach score if available
    let winScore: number | undefined;
    let oppScore: number | undefined;
    if (lastGame.t1_points != null && lastGame.t2_points != null) {
      if (lastGame.t1 === myRosterId) {
        winScore = lastGame.t1_points;
        oppScore = lastGame.t2_points;
      } else {
        winScore = lastGame.t2_points;
        oppScore = lastGame.t1_points;
      }
    }

    let playoffResult: string;
    if (lastRound === maxRound) {
      // Distinguish championship from consolation (3rd-place) game.
      // The championship game has both participants coming from winning their semi-final.
      // If there's only one game at maxRound it must be the championship.
      const finalRoundGames = winners.filter(g => (g.r ?? 0) === maxRound && g.t1 != null && g.t2 != null);
      let isChampionshipGame = true;
      if (finalRoundGames.length > 1) {
        const semiRound = maxRound - 1;
        const semiWinners = new Set<number>(
          winners
            .filter(g => (g.r ?? 0) === semiRound && g.w != null)
            .map(g => g.w as number)
        );
        isChampionshipGame = semiWinners.size === 0
          || (semiWinners.has(lastGame.t1 as number) && semiWinners.has(lastGame.t2 as number));
      }
      if (isChampionshipGame) {
        playoffResult = won ? 'Champion 🏆' : 'Runner-Up';
      } else {
        playoffResult = won ? '3rd Place 🥉' : '4th Place';
      }
    } else {
      const roundName = ROUND_NAMES[lastRound] ?? `Round ${lastRound}`;
      playoffResult = `Lost in ${roundName}`;
    }

    return {
      season,
      wins,
      losses,
      fpts: regFpts != null ? regFpts : teamData.fpts,
      playoffResult,
      playoffOpponent: oppName,
      winScore: winScore != null ? Math.round(winScore * 10) / 10 : undefined,
      oppScore: oppScore != null ? Math.round(oppScore * 10) / 10 : undefined,
      madePlayoffs: true,
    };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const team = url.searchParams.get('team') || '';
  if (!team) return Response.json({ error: 'team required' }, { status: 400 });

  try {
    // Resolve owner ID from the current season so we can match the same person across past seasons
    const currentTeams = await getTeamsData(LEAGUE_IDS.CURRENT).catch(() => []);
    const canon = canonicalizeTeamName(team);
    const currentEntry = currentTeams.find(t => canonicalizeTeamName(t.teamName) === canon);
    if (!currentEntry) return Response.json({ team, seasons: [] });
    const ownerId = currentEntry.ownerId;

    const results = await Promise.all(
      SEASONS.map(s => getSeasonResult(ownerId, s.leagueId, s.label))
    );

    const seasons = results.filter((r): r is SeasonResult => r !== null);

    return Response.json(
      { team, seasons },
      { headers: { 'Cache-Control': 'private, max-age=120, stale-while-revalidate=300' } }
    );
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
