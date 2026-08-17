import { CURRENT_SEASON } from '@/lib/constants/league';
import { normalizeName } from '@/lib/constants/team-mapping';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import type { LeagueStatsDataset } from '@/lib/stats/types';
import {
  handleGetLeagueAwardsV2,
  handleGetLeagueRecordsV2,
  handleGetSeasonArchiveV2,
  handleQueryStatsV2,
} from '@/lib/mcp/v2-handlers';
import {
  inputBool,
  inputNumber,
  inputText,
  researchLimit,
  researchProvenance,
  resolveFranchiseName,
  type JsonRecord,
  type ResearchInput,
} from '@/lib/mcp/research-core';
import {
  AWARD_RULES_VERSION,
  RECORD_RULES_VERSION,
  RESEARCH_VERSION,
  completedSeasons,
  readCompletedRecordBook,
  readFrozenAwards,
  readWarehouseSeason,
  storedWarehouseSeasons,
  warmResearchWarehouse,
} from '@/lib/mcp/research-store';

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function groupKey(row: JsonRecord, groupBy: string): string {
  if (groupBy === 'franchise') return String(row.franchiseName || row.teamName || row.team || 'Unknown');
  if (groupBy === 'season') return String(row.season || 'Unknown');
  if (groupBy === 'position') return String(row.position || 'Unknown');
  if (groupBy === 'player') return String(row.name || row.player || row.playerId || 'Unknown');
  if (groupBy === 'game_type') return String(row.gameType || 'Unknown');
  return 'All';
}

function metricValue(row: JsonRecord, metric: string): number {
  if (metric === 'starts') return Number(row.starts ?? (row.started ? 1 : 0)) || 0;
  if (metric === 'weeks') return Number(row.rosteredWeeks ?? 1) || 0;
  if (metric === 'ppg') return Number(row.ppg ?? row.pointsPerRosteredWeek ?? 0) || 0;
  if (metric === 'margin') return Number(row.margin ?? 0) || 0;
  if (metric === 'combined') return Number(row.combined ?? 0) || 0;
  return Number(row.points ?? row.score ?? 0) || 0;
}

function aggregateRows(rows: JsonRecord[], groupBy: string, metric: string) {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = groupKey(row, groupBy);
    const values = groups.get(key) || [];
    values.push(metricValue(row, metric));
    groups.set(key, values);
  }
  const leagueValues = rows.map((row) => metricValue(row, metric));
  const leagueAverage = leagueValues.length ? leagueValues.reduce((a, b) => a + b, 0) / leagueValues.length : 0;
  return Array.from(groups.entries()).map(([group, values]) => {
    const sum = values.reduce((a, b) => a + b, 0);
    const average = values.length ? sum / values.length : 0;
    return {
      group,
      count: values.length,
      sum,
      average,
      min: Math.min(...values),
      max: Math.max(...values),
      median: median(values),
      vsLeagueAverage: leagueAverage ? average / leagueAverage - 1 : 0,
    };
  });
}

function researchRows(dataset: LeagueStatsDataset, entity: string, input: ResearchInput): JsonRecord[] {
  const from = inputText(input.season_from); const to = inputText(input.season_to); const season = inputText(input.season);
  const position = inputText(input.position)?.toUpperCase(); const query = normalizeName(inputText(input.query) || '');
  const rawFranchise = inputText(input.franchise); const franchise = rawFranchise ? resolveFranchiseName(dataset, rawFranchise) || rawFranchise : undefined;
  const gameType = inputText(input.game_type) || 'all';
  const minPoints = inputNumber(input.min_points) ?? Number.NEGATIVE_INFINITY; const maxPoints = inputNumber(input.max_points) ?? Number.POSITIVE_INFINITY;
  const minStarts = inputNumber(input.min_starts) ?? 0; const minWeeks = inputNumber(input.min_weeks) ?? 0; const minPpg = inputNumber(input.min_ppg) ?? Number.NEGATIVE_INFINITY;
  const opponent = inputText(input.opponent); const result = inputText(input.result)?.toUpperCase(); const maxMargin = inputNumber(input.max_margin) ?? Number.POSITIVE_INFINITY;
  const excludeDefenses = inputBool(input.exclude_defenses) ?? false;
  const def = (value: string) => ['DEF', 'DST', 'D/ST'].includes(value.toUpperCase());

  if (entity === 'player_career') {
    return dataset.players.filter((row) => (!query || normalizeName(row.name).includes(query)) && (!position || row.position.toUpperCase() === position) && (!franchise || row.franchises.some((split) => normalizeName(split.teamName) === normalizeName(franchise))) && (!from || row.lastSeason >= from) && (!to || row.firstSeason <= to) && row.points >= minPoints && row.points <= maxPoints && row.starts >= minStarts && row.rosteredWeeks >= minWeeks && row.ppg >= minPpg && (!excludeDefenses || !def(row.position))) as unknown as JsonRecord[];
  }
  if (entity === 'player_season') {
    return dataset.playerSeasons.filter((row) => (!query || normalizeName(row.name).includes(query)) && (!position || row.position.toUpperCase() === position) && (!franchise || row.franchises.some((split) => normalizeName(split.teamName) === normalizeName(franchise))) && (!from || row.season >= from) && (!to || row.season <= to) && (!season || row.season === season) && row.points >= minPoints && row.points <= maxPoints && row.starts >= minStarts && row.rosteredWeeks >= minWeeks && row.ppg >= minPpg && (!excludeDefenses || !def(row.position))) as unknown as JsonRecord[];
  }
  if (entity === 'player_games') {
    return dataset.playerGames.filter((row) => (!query || normalizeName(row.name).includes(query)) && (!position || row.position.toUpperCase() === position) && (!franchise || normalizeName(row.franchiseName) === normalizeName(franchise)) && (!from || row.season >= from) && (!to || row.season <= to) && (!season || row.season === season) && row.points >= minPoints && row.points <= maxPoints && (!excludeDefenses || !def(row.position)) && (gameType === 'all' || dataset.games.some((game) => game.season === row.season && game.week === row.week && game.gameType === gameType && (game.teamA === row.franchiseName || game.teamB === row.franchiseName)))) as unknown as JsonRecord[];
  }
  if (entity === 'games') {
    const rows: JsonRecord[] = [];
    for (const game of dataset.games) {
      if (season && game.season !== season) continue; if (from && game.season < from) continue; if (to && game.season > to) continue;
      if (gameType !== 'all' && game.gameType !== gameType) continue;
      for (const side of [
        { team: game.teamA, opponent: game.teamB, points: game.scoreA, opponentPoints: game.scoreB, result: game.tie ? 'T' : game.winner === game.teamA ? 'W' : 'L' },
        { team: game.teamB, opponent: game.teamA, points: game.scoreB, opponentPoints: game.scoreA, result: game.tie ? 'T' : game.winner === game.teamB ? 'W' : 'L' },
      ]) {
        if (franchise && normalizeName(side.team) !== normalizeName(franchise)) continue;
        if (opponent && normalizeName(side.opponent) !== normalizeName(opponent)) continue;
        if (result && side.result !== result) continue;
        const margin = Math.abs(side.points - side.opponentPoints);
        if (side.points < minPoints || side.points > maxPoints || margin > maxMargin) continue;
        rows.push({ season: game.season, week: game.week, gameType: game.gameType, team: side.team, franchiseName: side.team, opponent: side.opponent, result: side.result, points: side.points, score: side.points, opponentPoints: side.opponentPoints, margin, combined: side.points + side.opponentPoints });
      }
    }
    return rows;
  }
  return [];
}

export async function handleQueryStatsResearch(input: ResearchInput) {
  const groupBy = inputText(input.group_by);
  if (!groupBy) return handleQueryStatsV2(input);
  const dataset = await getLeagueStatsDatasetV3();
  const entity = inputText(input.entity);
  if (!entity) throw new Error('entity is required');
  const metric = inputText(input.metric) || 'points';
  const aggregate = inputText(input.aggregate) || 'sum';
  const rows = researchRows(dataset, entity, input);
  let groups = aggregateRows(rows, groupBy, metric);
  const value = (row: ReturnType<typeof aggregateRows>[number]) => Number((row as unknown as JsonRecord)[aggregate] ?? row.sum);
  groups.sort((a, b) => value(b) - value(a) || a.group.localeCompare(b.group));
  const totalGroups = groups.length;
  const bounded = groups.slice(0, researchLimit(input.limit, 25));
  return {
    entity,
    mode: 'aggregate',
    groupBy,
    metric,
    aggregate,
    sourceRows: rows.length,
    totalGroups,
    groups: bounded.map((row, index) => ({ ...row, rank: index + 1, percentile: totalGroups <= 1 ? 1 : 1 - index / (totalGroups - 1) })),
    provenance: researchProvenance(dataset, 'query-stats-2.0'),
  };
}

export async function handleGetSeasonArchiveResearch(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  const season = inputText(input.season);
  if (!season) throw new Error('season is required');
  const base = await handleGetSeasonArchiveV2(input) as JsonRecord;
  if (season >= CURRENT_SEASON) {
    return { ...base, warehouse: { stored: false, reason: 'current-season-remains-live' }, provenance: researchProvenance(dataset, 'live-season-archive') };
  }
  await warmResearchWarehouse(dataset);
  const snapshot = await readWarehouseSeason(season);
  if (!snapshot) {
    return { ...base, warehouse: { stored: false, reason: 'warehouse-unavailable' }, provenance: researchProvenance(dataset, 'canonical-v3-fallback') };
  }
  return {
    ...base,
    standings: [...snapshot.seasonTeams].sort((a, b) => b.wins - a.wins || b.winPct - a.winPct || b.pointsFor - a.pointsFor),
    playerLeaders: [...snapshot.playerSeasons].sort((a, b) => b.points - a.points).slice(0, researchLimit(input.leader_limit, 25)),
    allEvw: snapshot.allEvw,
    awards: snapshot.awards,
    gamesByType: {
      regular: snapshot.games.filter((game) => game.gameType === 'regular'),
      playoffs: snapshot.games.filter((game) => game.gameType === 'playoffs'),
      toiletBowl: snapshot.games.filter((game) => game.gameType === 'toilet'),
      otherPostseason: snapshot.games.filter((game) => game.gameType === 'postseason'),
    },
    warehouse: { stored: true, version: snapshot.version, frozenAt: snapshot.frozenAt, sourceGeneratedAt: snapshot.sourceGeneratedAt },
    provenance: researchProvenance(dataset, 'permanent-history-warehouse'),
  };
}

export async function handleGetLeagueAwardsResearch(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  await warmResearchWarehouse(dataset);
  const base = await handleGetLeagueAwardsV2(input) as JsonRecord;
  const seasonFilter = inputText(input.season);
  const seasons = (seasonFilter ? [seasonFilter] : completedSeasons()).filter((season) => season < CURRENT_SEASON);
  const frozen = await Promise.all(seasons.map(async (season) => ({ season, awards: await readFrozenAwards(season) })));
  return {
    ...base,
    officialAnnualAwards: frozen.filter((row) => row.awards),
    awardRulesVersion: AWARD_RULES_VERSION,
    provenance: researchProvenance(dataset, 'frozen-awards+canonical-stats'),
  };
}

export async function handleGetLeagueRecordsResearch(input: ResearchInput) {
  const dataset = await getLeagueStatsDatasetV3();
  await warmResearchWarehouse(dataset);
  const base = await handleGetLeagueRecordsV2(input) as JsonRecord;
  return {
    ...base,
    officialCompletedRecordBook: await readCompletedRecordBook(),
    recordRulesVersion: RECORD_RULES_VERSION,
    provenance: researchProvenance(dataset, 'frozen-record-book+canonical-stats'),
  };
}

export async function handleGetResearchBackendStatus() {
  const dataset = await getLeagueStatsDatasetV3();
  const warehouse = await warmResearchWarehouse(dataset);
  return {
    version: RESEARCH_VERSION,
    storage: 'Neon/Postgres JSONB canonical completed-season snapshots',
    completedSeasons: completedSeasons(),
    storedSeasons: await storedWarehouseSeasons(),
    warehouse,
    capabilities: ['permanent-history', 'entity-resolution', 'ownership-timeline', 'trade-lineage', 'analytics-2.0', 'roster-snapshots', 'transaction-intelligence', 'rivalries', 'frozen-awards-records'],
    provenance: researchProvenance(dataset, 'research-backend-status'),
  };
}
