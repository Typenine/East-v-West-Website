import { normalizeName } from '@/lib/constants/team-mapping';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import type { LeagueStatsDataset, StatsGameRow, StatsGameType } from '@/lib/stats/types';
import { buildTransactionLedger, type LeagueTransaction } from '@/lib/utils/transactions';
import {
  inputBool,
  inputText,
  researchLimit,
  researchProvenance,
  resolveFranchiseName,
  type JsonRecord,
  type ResearchInput,
} from '@/lib/mcp/research-core';

let transactionCache: { ts: number; data: LeagueTransaction[] } | null = null;
const TRANSACTION_CACHE_MS = 10 * 60 * 1000;

function parseTradeDestination(name: string | null): string | null {
  if (!name) return null;
  const match = /\(to (.+)\)$/.exec(name);
  return match?.[1]?.trim() || null;
}

async function transactionLedgerCached(): Promise<LeagueTransaction[]> {
  if (transactionCache && Date.now() - transactionCache.ts < TRANSACTION_CACHE_MS) return transactionCache.data;
  const data = await buildTransactionLedger();
  transactionCache = { ts: Date.now(), data };
  return data;
}

function postAcquisitionStats(dataset: LeagueStatsDataset, tx: LeagueTransaction, playerId: string, team: string) {
  const rows = dataset.playerGames.filter((row) => row.playerId === playerId && row.season === tx.season && row.franchiseName === team && row.week >= Math.max(1, tx.week));
  return {
    points: rows.reduce((sum, row) => sum + row.points, 0),
    starts: rows.filter((row) => row.started).length,
    observedScoringWeeks: rows.length,
    bestGame: rows.length ? Math.max(...rows.map((row) => row.points)) : 0,
  };
}

export async function handleGetTransactionIntelligence(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  const season = inputText(input.season);
  const teamFilterRaw = inputText(input.team) || inputText(input.franchise);
  const teamFilter = teamFilterRaw ? resolveFranchiseName(dataset, teamFilterRaw) || teamFilterRaw : undefined;
  const type = inputText(input.type) || 'all';
  const max = researchLimit(input.limit, 25);
  const allLedger = await transactionLedgerCached();
  const ledger = season ? allLedger.filter((row) => row.season === season) : allLedger;
  const acquisitions: JsonRecord[] = [];
  const drops: JsonRecord[] = [];

  for (const tx of ledger) {
    if (type !== 'all' && tx.type !== type) continue;
    if (teamFilter && !tx.teamsInvolved.some((name) => normalizeName(name) === normalizeName(teamFilter)) && normalizeName(tx.team) !== normalizeName(teamFilter)) continue;
    for (const player of tx.added) {
      if (player.playerId.startsWith('pick-')) continue;
      const destinationRaw = tx.type === 'trade' ? parseTradeDestination(player.name) : tx.team;
      if (!destinationRaw) continue;
      const destination = resolveFranchiseName(dataset, destinationRaw) || destinationRaw;
      if (teamFilter && normalizeName(destination) !== normalizeName(teamFilter)) continue;
      acquisitions.push({
        transactionId: tx.id,
        type: tx.type,
        season: tx.season,
        week: tx.week,
        team: destination,
        playerId: player.playerId,
        player: player.name?.replace(/ \(to .+\)$/, '') || player.playerId,
        faab: tx.faab,
        productionAfterAcquisition: postAcquisitionStats(dataset, tx, player.playerId, destination),
      });
    }
    for (const player of tx.dropped) {
      const sourceNames = new Set(tx.teamsInvolved.map((name) => normalizeName(resolveFranchiseName(dataset, name) || name)));
      const later = dataset.playerGames.filter((row) => row.playerId === player.playerId && row.season === tx.season && row.week >= Math.max(1, tx.week) && !sourceNames.has(normalizeName(row.franchiseName)));
      drops.push({
        transactionId: tx.id,
        type: tx.type,
        season: tx.season,
        week: tx.week,
        teams: tx.teamsInvolved,
        playerId: player.playerId,
        player: player.name?.replace(/ \(from .+\)$/, '') || player.playerId,
        pointsForOtherFranchisesAfter: later.reduce((sum, row) => sum + row.points, 0),
      });
    }
  }
  acquisitions.sort((a, b) => Number((b.productionAfterAcquisition as JsonRecord).points || 0) - Number((a.productionAfterAcquisition as JsonRecord).points || 0));
  drops.sort((a, b) => Number(b.pointsForOtherFranchisesAfter || 0) - Number(a.pointsForOtherFranchisesAfter || 0));
  return {
    filters: { season: season || null, team: teamFilter || null, type },
    bestAcquisitions: acquisitions.slice(0, max),
    mostCostlyDrops: drops.slice(0, max),
    transactionCountConsidered: ledger.length,
    metric: 'Production is ownership-attributed EVW scoring after the transaction within that season.',
    provenance: researchProvenance(dataset, 'transaction-ledger+stats'),
  };
}

function rivalryPerspective(game: StatsGameRow, team: string): { points: number; opponentPoints: number; result: 'W' | 'L' | 'T' } {
  const isA = game.teamA === team;
  const points = isA ? game.scoreA : game.scoreB;
  const opponentPoints = isA ? game.scoreB : game.scoreA;
  return { points, opponentPoints, result: game.tie ? 'T' : game.winner === team ? 'W' : 'L' };
}

function rivalryRecord(games: StatsGameRow[], team: string) {
  let wins = 0; let losses = 0; let ties = 0; let pointsFor = 0; let pointsAgainst = 0;
  for (const game of games) {
    const row = rivalryPerspective(game, team);
    pointsFor += row.points; pointsAgainst += row.opponentPoints;
    if (row.result === 'W') wins += 1; else if (row.result === 'L') losses += 1; else ties += 1;
  }
  return { wins, losses, ties, pointsFor, pointsAgainst, games: games.length };
}

function streak(games: StatsGameRow[], team: string) {
  let bestWins = 0; let bestLosses = 0; let currentType: 'W' | 'L' | 'T' | null = null; let current = 0;
  for (const game of games) {
    const result = rivalryPerspective(game, team).result;
    if (result === currentType) current += 1; else { currentType = result; current = 1; }
    if (result === 'W') bestWins = Math.max(bestWins, current);
    if (result === 'L') bestLosses = Math.max(bestLosses, current);
  }
  return { longestWinStreak: bestWins, longestLossStreak: bestLosses, current: { type: currentType, length: currentType ? current : 0 } };
}

export async function handleGetRivalry(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  const rawA = inputText(input.team1) || inputText(input.team_a);
  const rawB = inputText(input.team2) || inputText(input.team_b);
  if (!rawA || !rawB) throw new Error('team1 and team2 are required');
  const teamA = resolveFranchiseName(dataset, rawA);
  const teamB = resolveFranchiseName(dataset, rawB);
  if (!teamA || !teamB) throw new Error(`Could not resolve rivalry: ${rawA} vs ${rawB}`);
  const games = dataset.games.filter((game) => (game.teamA === teamA && game.teamB === teamB) || (game.teamA === teamB && game.teamB === teamA)).sort((a, b) => a.season.localeCompare(b.season) || a.week - b.week);
  const category = (kind: StatsGameType) => rivalryRecord(games.filter((game) => game.gameType === kind), teamA);
  const scored = games.map((game) => ({ game, ...rivalryPerspective(game, teamA) }));
  const closest = [...scored].sort((a, b) => Math.abs(a.points - a.opponentPoints) - Math.abs(b.points - b.opponentPoints))[0] || null;
  const biggest = [...scored].sort((a, b) => Math.abs(b.points - b.opponentPoints) - Math.abs(a.points - a.opponentPoints))[0] || null;
  const highest = [...scored].sort((a, b) => (b.points + b.opponentPoints) - (a.points + a.opponentPoints))[0] || null;
  const keys = new Set(games.flatMap((game) => [`${game.season}:${game.week}:${teamA}`, `${game.season}:${game.week}:${teamB}`]));
  const playerMap = new Map<string, { playerId: string; player: string; position: string; team: string; points: number; games: number }>();
  for (const row of dataset.playerGames) {
    if (!keys.has(`${row.season}:${row.week}:${row.franchiseName}`)) continue;
    const key = `${row.playerId}:${row.franchiseName}`;
    const item = playerMap.get(key) || { playerId: row.playerId, player: row.name, position: row.position, team: row.franchiseName, points: 0, games: 0 };
    item.points += row.points; item.games += 1; playerMap.set(key, item);
  }
  const topPlayers = Array.from(playerMap.values()).sort((a, b) => b.points - a.points).slice(0, researchLimit(input.limit, 15));
  const seasonSeries = Array.from(new Set(games.map((game) => game.season))).map((season) => ({ season, recordForTeam1: rivalryRecord(games.filter((game) => game.season === season), teamA) }));
  return {
    team1: teamA,
    team2: teamB,
    overallForTeam1: rivalryRecord(games, teamA),
    categoriesForTeam1: { regular: category('regular'), playoffs: category('playoffs'), toiletBowl: category('toilet'), otherPostseason: category('postseason') },
    streaksForTeam1: streak(games, teamA),
    closestGame: closest,
    biggestBlowout: biggest,
    highestScoringGame: highest,
    seasonSeries,
    games: inputBool(input.include_games) ? games : undefined,
    topPlayers,
    provenance: researchProvenance(dataset, 'rivalry-engine'),
  };
}
