import { getLeagueIdForSeason } from '@/lib/constants/league';
import {
  getLeague,
  getLeaguePlayoffBrackets,
  type SleeperBracketGame,
} from '@/lib/utils/sleeper-api';
import type { LeagueStatsDataset, StatsGameRow, StatsGameType } from './types';
import { getLeagueStatsDatasetV2 } from './league-stats-v2';

/**
 * Final postseason classification layer for the reference center.
 *
 * Sleeper's winners_bracket includes championship-path games as well as placement
 * games after a team has already been eliminated. Those placement games are not
 * East v. West playoff games. Likewise, the losers_bracket is the Toilet Bowl and
 * must never contribute to championship-playoff statistics.
 */
const NORMALIZER_TTL_MS = 5 * 60 * 1000;

type BracketGame = SleeperBracketGame & {
  m?: number;
  r?: number;
  p?: number | null;
  t1?: number | null;
  t2?: number | null;
  t1_from?: { w?: number; l?: number } | null;
  t2_from?: { w?: number; l?: number } | null;
};

type SeasonBracketIndex = {
  playoffWeekStart: number;
  playoffGames: Set<string>;
  toiletGames: Set<string>;
};

let normalizedCache: { ts: number; data: LeagueStatsDataset } | null = null;

function pairKey(a: number, b: number): string {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function bracketGameKey(playoffWeekStart: number, game: BracketGame): string | null {
  const t1 = Number(game.t1);
  const t2 = Number(game.t2);
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t1 <= 0 || t2 <= 0) return null;
  const round = Math.max(1, Number(game.r) || 1);
  const week = playoffWeekStart + round - 1;
  return `${week}|${pairKey(t1, t2)}`;
}

function isChampionshipPathGame(game: BracketGame): boolean {
  const round = Number(game.r) || 0;
  const placement = game.p == null ? null : Number(game.p);
  const fromLoser =
    typeof game.t1_from?.l === 'number' ||
    typeof game.t2_from?.l === 'number';
  const placementGame = placement != null && Number.isFinite(placement) && placement > 1;
  const championship = placement === 1;

  if (fromLoser || placementGame) return false;
  if (championship || round === 1) return true;
  return round > 1;
}

async function buildSeasonBracketIndex(season: string): Promise<SeasonBracketIndex | null> {
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) return null;

  const [league, brackets] = await Promise.all([
    getLeague(leagueId).catch(() => null),
    getLeaguePlayoffBrackets(leagueId).catch(() => ({ winners: [], losers: [] })),
  ]);

  const settings = (league?.settings || {}) as {
    playoff_week_start?: number;
    playoff_start_week?: number;
  };
  const playoffWeekStart = Number(settings.playoff_week_start ?? settings.playoff_start_week ?? 15) || 15;
  const playoffGames = new Set<string>();
  const toiletGames = new Set<string>();

  for (const raw of brackets.winners || []) {
    const game = raw as BracketGame;
    const key = bracketGameKey(playoffWeekStart, game);
    if (key && isChampionshipPathGame(game)) playoffGames.add(key);
  }

  for (const raw of brackets.losers || []) {
    const key = bracketGameKey(playoffWeekStart, raw as BracketGame);
    if (key) toiletGames.add(key);
  }

  return { playoffWeekStart, playoffGames, toiletGames };
}

function classifyGame(game: StatsGameRow, index: SeasonBracketIndex | null): StatsGameType {
  if (!index) return game.gameType;
  if (game.week < index.playoffWeekStart) return 'regular';

  const key = `${game.week}|${pairKey(game.rosterA, game.rosterB)}`;
  if (index.playoffGames.has(key)) return 'playoffs';
  if (index.toiletGames.has(key)) return 'toilet';
  return 'postseason';
}

function recomputePlayoffFranchises(dataset: LeagueStatsDataset, games: StatsGameRow[]): LeagueStatsDataset['franchises'] {
  const franchises = dataset.franchises.map((row) => ({
    ...row,
    playoffWins: 0,
    playoffLosses: 0,
    playoffTies: 0,
  }));
  const byName = new Map(franchises.map((row) => [row.teamName, row] as const));

  for (const game of games) {
    if (game.gameType !== 'playoffs') continue;
    const a = byName.get(game.teamA);
    const b = byName.get(game.teamB);
    if (!a || !b) continue;

    if (game.tie) {
      a.playoffTies += 1;
      b.playoffTies += 1;
    } else if (game.winner === game.teamA) {
      a.playoffWins += 1;
      b.playoffLosses += 1;
    } else if (game.winner === game.teamB) {
      b.playoffWins += 1;
      a.playoffLosses += 1;
    }
  }

  return franchises;
}

function fixPlayoffRecordEntry(dataset: LeagueStatsDataset): LeagueStatsDataset['records'] {
  const records = {
    ...dataset.records,
    franchise: dataset.records.franchise.map((record) => ({ ...record })),
  };
  const playoffRecord = records.franchise.find((record) => record.id === 'franchise-playoff-wins');
  if (!playoffRecord || dataset.franchises.length === 0) return records;

  const maxWins = Math.max(...dataset.franchises.map((row) => row.playoffWins));
  const holders = dataset.franchises
    .filter((row) => row.playoffWins === maxWins)
    .sort((a, b) => a.teamName.localeCompare(b.teamName));
  if (!holders.length) return records;

  playoffRecord.holder = holders.map((row) => row.teamName).join(' · ');
  playoffRecord.teamName = holders.length === 1 ? holders[0].teamName : null;
  playoffRecord.value = maxWins;
  playoffRecord.valueDisplay = `${maxWins} win${maxWins === 1 ? '' : 's'}`;
  return records;
}

export async function getLeagueStatsDatasetV3(): Promise<LeagueStatsDataset> {
  if (normalizedCache && Date.now() - normalizedCache.ts < NORMALIZER_TTL_MS) {
    return normalizedCache.data;
  }

  const base = await getLeagueStatsDatasetV2();
  const indexes = new Map<string, SeasonBracketIndex | null>();
  await Promise.all(base.seasons.map(async (season) => {
    indexes.set(season, await buildSeasonBracketIndex(season));
  }));

  const games = base.games.map((game) => ({
    ...game,
    gameType: classifyGame(game, indexes.get(game.season) ?? null),
  }));
  const franchises = recomputePlayoffFranchises(base, games);

  const withCorrectedFranchises: LeagueStatsDataset = {
    ...base,
    games,
    franchises,
    coverageNotes: [
      ...base.coverageNotes.filter((note) => !note.startsWith('Postseason classification:')),
      'Postseason classification: championship-path winners-bracket games count as Playoffs; losers-bracket games count as Toilet Bowl; placement games after elimination count only as Postseason.',
    ],
  };
  const data: LeagueStatsDataset = {
    ...withCorrectedFranchises,
    records: fixPlayoffRecordEntry(withCorrectedFranchises),
  };

  normalizedCache = { ts: Date.now(), data };
  return data;
}
