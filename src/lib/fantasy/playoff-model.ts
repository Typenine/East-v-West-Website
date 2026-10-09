export type PlayoffLabTeam = {
  rosterId: number;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  gamesPlayed: number;
  actualPpg: number | null;
  priorPpg: number;
  modelPpg: number;
  weeklyStdDev: number;
  strengthStdDev: number;
};

export type PlayoffLabGame = {
  id: string;
  week: number;
  aRosterId: number;
  aTeam: string;
  bRosterId: number;
  bTeam: string;
};

export type SimulationRow = PlayoffLabTeam & {
  playoffPct: number;
  avgSeed: number | null;
};

export type MathStatus = 'clinched' | 'eliminated' | 'alive';

export type TeamMathScenario = {
  rosterId: number;
  status: MathStatus;
  clinchPaths: string[];
  eliminationPaths: string[];
};

export const PLAYOFF_SIM_ITERATIONS = 6000;
export const PRIOR_PSEUDO_GAMES = 5;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hashString(value: string) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleNormal(random: () => number) {
  const u = Math.max(1e-9, random());
  const v = Math.max(1e-9, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function simulatePlayoffs(
  teams: PlayoffLabTeam[],
  games: PlayoffLabGame[],
  picks: Record<string, number | null>,
  playoffTeams: number,
): SimulationRow[] {
  const madePlayoffs = new Map<number, number>();
  const seedTotal = new Map<number, number>();
  const seedCount = new Map<number, number>();
  const pickKey = Object.entries(picks)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => key + ':' + (value ?? 'auto'))
    .join('|');
  const profileKey = teams
    .map((team) => team.rosterId + ':' + team.modelPpg.toFixed(1) + ':' + team.strengthStdDev.toFixed(1))
    .join('|');
  const random = mulberry32(hashString(profileKey + '|' + pickKey));
  const firstFutureWeek = games.length ? Math.min(...games.map((game) => game.week)) : 1;

  for (let iteration = 0; iteration < PLAYOFF_SIM_ITERATIONS; iteration += 1) {
    const state = new Map(teams.map((team) => [team.rosterId, {
      wins: team.wins,
      losses: team.losses,
      ties: team.ties,
      pointsFor: team.pointsFor,
    }]));

    const profile = new Map(teams.map((team) => [team.rosterId, team]));
    const latentStrength = new Map(
      teams.map((team) => [
        team.rosterId,
        clamp(team.modelPpg + sampleNormal(random) * team.strengthStdDev, 75, 195),
      ]),
    );

    for (const game of games) {
      const a = state.get(game.aRosterId);
      const b = state.get(game.bRosterId);
      const aProfile = profile.get(game.aRosterId);
      const bProfile = profile.get(game.bRosterId);
      if (!a || !b || !aProfile || !bProfile) continue;

      const weeksAhead = Math.max(0, game.week - firstFutureWeek);
      const futureShock = Math.min(9, Math.sqrt(weeksAhead) * 2.2);
      const aScoreSd = Math.sqrt(aProfile.weeklyStdDev ** 2 + futureShock ** 2);
      const bScoreSd = Math.sqrt(bProfile.weeklyStdDev ** 2 + futureShock ** 2);

      let aScore = Math.max(0, (latentStrength.get(game.aRosterId) || aProfile.modelPpg) + sampleNormal(random) * aScoreSd);
      let bScore = Math.max(0, (latentStrength.get(game.bRosterId) || bProfile.modelPpg) + sampleNormal(random) * bScoreSd);

      const forced = picks[game.id] ?? null;
      if (forced === game.aRosterId && aScore <= bScore) aScore = bScore + 0.1;
      if (forced === game.bRosterId && bScore <= aScore) bScore = aScore + 0.1;

      a.pointsFor += aScore;
      b.pointsFor += bScore;

      if (Math.abs(aScore - bScore) < 0.001) {
        a.ties += 1;
        b.ties += 1;
      } else if (aScore > bScore) {
        a.wins += 1;
        b.losses += 1;
      } else {
        b.wins += 1;
        a.losses += 1;
      }
    }

    const ranked = [...teams].sort((left, right) => {
      const a = state.get(left.rosterId)!;
      const b = state.get(right.rosterId)!;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.ties !== a.ties) return b.ties - a.ties;
      return b.pointsFor - a.pointsFor;
    });

    ranked.forEach((team, index) => {
      const seed = index + 1;
      if (seed <= playoffTeams) {
        madePlayoffs.set(team.rosterId, (madePlayoffs.get(team.rosterId) || 0) + 1);
      }
      seedTotal.set(team.rosterId, (seedTotal.get(team.rosterId) || 0) + seed);
      seedCount.set(team.rosterId, (seedCount.get(team.rosterId) || 0) + 1);
    });
  }

  return teams
    .map((team) => ({
      ...team,
      playoffPct: ((madePlayoffs.get(team.rosterId) || 0) / PLAYOFF_SIM_ITERATIONS) * 100,
      avgSeed: seedCount.get(team.rosterId)
        ? (seedTotal.get(team.rosterId) || 0) / (seedCount.get(team.rosterId) || 1)
        : null,
    }))
    .sort((a, b) => b.playoffPct - a.playoffPct || (a.avgSeed ?? 99) - (b.avgSeed ?? 99));
}

function remainingGameCounts(games: PlayoffLabGame[]) {
  const counts = new Map<number, number>();
  for (const game of games) {
    counts.set(game.aRosterId, (counts.get(game.aRosterId) || 0) + 1);
    counts.set(game.bRosterId, (counts.get(game.bRosterId) || 0) + 1);
  }
  return counts;
}

function mathematicalStatus(
  teamId: number,
  teams: PlayoffLabTeam[],
  wins: Map<number, number>,
  futureGames: PlayoffLabGame[],
  playoffTeams: number,
): MathStatus {
  const remaining = remainingGameCounts(futureGames);
  const teamWins = wins.get(teamId) || 0;
  const teamMaxWins = teamWins + (remaining.get(teamId) || 0);

  const opponentsWhoCanMatchOrPass = teams.filter((team) =>
    team.rosterId !== teamId &&
    (wins.get(team.rosterId) || 0) + (remaining.get(team.rosterId) || 0) >= teamWins
  ).length;

  if (opponentsWhoCanMatchOrPass < playoffTeams) return 'clinched';

  const opponentsAlreadyBeyondReach = teams.filter((team) =>
    team.rosterId !== teamId &&
    (wins.get(team.rosterId) || 0) > teamMaxWins
  ).length;

  if (opponentsAlreadyBeyondReach >= playoffTeams) return 'eliminated';
  return 'alive';
}

function weekOutcomeWins(
  teams: PlayoffLabTeam[],
  weekGames: PlayoffLabGame[],
  mask: number,
) {
  const wins = new Map(teams.map((team) => [team.rosterId, team.wins]));
  weekGames.forEach((game, index) => {
    const bWins = Boolean(mask & (1 << index));
    const winnerId = bWins ? game.bRosterId : game.aRosterId;
    wins.set(winnerId, (wins.get(winnerId) || 0) + 1);
  });
  return wins;
}

function indexCombinations(size: number, choose: number) {
  const result: number[][] = [];
  const walk = (start: number, current: number[]) => {
    if (current.length === choose) {
      result.push([...current]);
      return;
    }
    for (let index = start; index < size; index += 1) {
      current.push(index);
      walk(index + 1, current);
      current.pop();
    }
  };
  walk(0, []);
  return result;
}

function formatCondition(game: PlayoffLabGame, bWins: boolean, targetTeamId: number) {
  const winnerId = bWins ? game.bRosterId : game.aRosterId;
  const winnerName = bWins ? game.bTeam : game.aTeam;
  const loserName = bWins ? game.aTeam : game.bTeam;

  if (game.aRosterId === targetTeamId || game.bRosterId === targetTeamId) {
    const targetName = game.aRosterId === targetTeamId ? game.aTeam : game.bTeam;
    return targetName + (winnerId === targetTeamId ? ' wins' : ' loses');
  }

  return winnerName + ' beats ' + loserName;
}

function findGuaranteedPaths(
  targetFlags: boolean[],
  weekGames: PlayoffLabGame[],
  targetTeamId: number,
) {
  if (!targetFlags.some(Boolean) || weekGames.length === 0) return [];
  if (targetFlags.every(Boolean)) return ['regardless of the other results this week'];

  const maxConditions = Math.min(4, weekGames.length);
  for (let conditionCount = 1; conditionCount <= maxConditions; conditionCount += 1) {
    const paths: string[] = [];
    const combinations = indexCombinations(weekGames.length, conditionCount);

    for (const indices of combinations) {
      const assignmentCount = 1 << conditionCount;
      for (let assignment = 0; assignment < assignmentCount; assignment += 1) {
        let guaranteed = true;
        let compatible = false;

        for (let fullMask = 0; fullMask < targetFlags.length; fullMask += 1) {
          const matches = indices.every((gameIndex, conditionIndex) => {
            const expectedBWins = Boolean(assignment & (1 << conditionIndex));
            const actualBWins = Boolean(fullMask & (1 << gameIndex));
            return expectedBWins === actualBWins;
          });
          if (!matches) continue;
          compatible = true;
          if (!targetFlags[fullMask]) {
            guaranteed = false;
            break;
          }
        }

        if (!compatible || !guaranteed) continue;

        const phrase = indices
          .map((gameIndex, conditionIndex) =>
            formatCondition(
              weekGames[gameIndex],
              Boolean(assignment & (1 << conditionIndex)),
              targetTeamId,
            )
          )
          .join(' + ');

        if (!paths.includes(phrase)) paths.push(phrase);
        if (paths.length >= 3) return paths;
      }
    }

    if (paths.length > 0) return paths;
  }

  return [];
}

export function buildMathScenarios(
  teams: PlayoffLabTeam[],
  games: PlayoffLabGame[],
  playoffTeams: number,
  scenarioStartWeek: number,
): TeamMathScenario[] {
  const currentWins = new Map(teams.map((team) => [team.rosterId, team.wins]));
  const weekGames = games.filter((game) => game.week === scenarioStartWeek);
  const laterGames = games.filter((game) => game.week > scenarioStartWeek);
  const outcomeCount = weekGames.length > 0 ? 1 << weekGames.length : 0;

  return teams.map((team) => {
    const status = mathematicalStatus(team.rosterId, teams, currentWins, games, playoffTeams);
    if (status !== 'alive' || outcomeCount === 0) {
      return { rosterId: team.rosterId, status, clinchPaths: [], eliminationPaths: [] };
    }

    const clinchFlags: boolean[] = [];
    const eliminationFlags: boolean[] = [];

    for (let mask = 0; mask < outcomeCount; mask += 1) {
      const wins = weekOutcomeWins(teams, weekGames, mask);
      const afterWeekStatus = mathematicalStatus(team.rosterId, teams, wins, laterGames, playoffTeams);
      clinchFlags.push(afterWeekStatus === 'clinched');
      eliminationFlags.push(afterWeekStatus === 'eliminated');
    }

    return {
      rosterId: team.rosterId,
      status,
      clinchPaths: findGuaranteedPaths(clinchFlags, weekGames, team.rosterId),
      eliminationPaths: findGuaranteedPaths(eliminationFlags, weekGames, team.rosterId),
    };
  });
}

export function formatPlayoffProbability(pct: number, status: MathStatus) {
  if (status === 'clinched') return '100%';
  if (status === 'eliminated') return '0%';
  if (pct >= 99.5) return '>99%';
  if (pct <= 0.5) return '<1%';
  if (pct < 10 || pct > 90) return pct.toFixed(1) + '%';
  return Math.round(pct) + '%';
}
