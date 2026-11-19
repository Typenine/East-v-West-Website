import type { SleeperMatchup } from '@/lib/utils/sleeper-api';

/** Week 12 factual matchup coverage + Week 13 preview fixtures for the combined ChatGPT issue. */
export type WeeklyTeamResult = {
  rosterId: number;
  team: string;
  pointsAtExport: number | null;
};

export type WeeklyMatchupPair = {
  matchupId: number;
  teams: [WeeklyTeamResult, WeeklyTeamResult];
};

export type WeeklyRecapManifest = {
  kind: 'full_weekly_recap_required';
  completedWeek: number;
  upcomingWeek: number;
  completedMatchups: WeeklyMatchupPair[];
  upcomingMatchups: WeeklyMatchupPair[];
  completedScoresAreFinal: false;
  validation: {
    status: 'complete_pairings' | 'incomplete_pairings';
    completedPairings: number;
    upcomingPairings: number;
    warnings: string[];
  };
  instructions: string[];
};

type Roster = { rosterId: number; team: string };
type CompletedLineup = {
  rosterId: number;
  team: string;
  matchupId: number | null;
  teamPoints: number | null;
};

function groupByMatchup(
  players: Array<{ rosterId: number; team: string; matchupId: number | null; points: number | null }>,
  label: string,
  expectedRosterIds: Set<number>,
  warnings: string[],
): WeeklyMatchupPair[] {
  const groups = new Map<number, WeeklyTeamResult[]>();
  const appeared = new Set<number>();
  for (const row of players) {
    if (!expectedRosterIds.has(row.rosterId)) {
      warnings.push(label + ': unknown roster ID ' + row.rosterId);
      continue;
    }
    if (appeared.has(row.rosterId)) {
      warnings.push(label + ': duplicate roster ID ' + row.rosterId);
      continue;
    }
    appeared.add(row.rosterId);
    if (row.matchupId == null || !Number.isFinite(row.matchupId) || row.matchupId < 1) {
      warnings.push(label + ': missing matchup ID for ' + row.team);
      continue;
    }
    const group = groups.get(row.matchupId) ?? [];
    group.push({ rosterId: row.rosterId, team: row.team, pointsAtExport: row.points });
    groups.set(row.matchupId, group);
  }

  for (const rosterId of expectedRosterIds) {
    if (!appeared.has(rosterId)) warnings.push(label + ': missing roster ID ' + rosterId);
  }

  const pairings: WeeklyMatchupPair[] = [];
  for (const [matchupId, group] of groups) {
    if (group.length !== 2 || group[0].rosterId === group[1].rosterId) {
      warnings.push(label + ': matchup ' + matchupId + ' has ' + group.length + ' valid distinct teams, expected 2');
      continue;
    }
    pairings.push({ matchupId, teams: [group[0], group[1]] });
  }
  return pairings.sort((a, b) => a.matchupId - b.matchupId);
}

export function buildWeeklyRecapManifest(input: {
  completedWeek: number;
  upcomingWeek: number;
  rosters: Roster[];
  completedLineups: CompletedLineup[];
  upcomingSleeperMatchups: SleeperMatchup[];
}): WeeklyRecapManifest {
  const warnings: string[] = [];
  const rosterNames = new Map(input.rosters.map(roster => [roster.rosterId, roster.team]));
  const expectedRosterIds = new Set(rosterNames.keys());
  if (expectedRosterIds.size !== 12) {
    warnings.push('Expected 12 franchises, found ' + expectedRosterIds.size + '.');
  }

  const completedMatchups = groupByMatchup(
    input.completedLineups.map(row => ({
      rosterId: row.rosterId,
      team: row.team,
      matchupId: row.matchupId,
      points: Number.isFinite(row.teamPoints) ? row.teamPoints : null,
    })),
    'Completed Week ' + input.completedWeek, expectedRosterIds, warnings,
  );
  const upcomingMatchups = groupByMatchup(
    input.upcomingSleeperMatchups.map(row => ({
      rosterId: row.roster_id,
      team: rosterNames.get(row.roster_id) ?? ('Roster ' + row.roster_id),
      matchupId: row.matchup_id,
      points: null,
    })),
    'Upcoming Week ' + input.upcomingWeek, expectedRosterIds, warnings,
  );

  if (completedMatchups.length !== 6) {
    warnings.push('Required six completed matchup pairings; recovered ' + completedMatchups.length + '.');
  }
  if (upcomingMatchups.length !== 6) {
    warnings.push('Required six next-week matchup pairings; recovered ' + upcomingMatchups.length + '.');
  }
  const status = warnings.length ? 'incomplete_pairings' : 'complete_pairings';
  return {
    kind: 'full_weekly_recap_required',
    completedWeek: input.completedWeek,
    upcomingWeek: input.upcomingWeek,
    completedMatchups,
    upcomingMatchups,
    completedScoresAreFinal: false,
    validation: {
      status,
      completedPairings: completedMatchups.length,
      upcomingPairings: upcomingMatchups.length,
      warnings,
    },
    instructions: [
      'The Trade Deadline issue IS the complete Week ' + input.completedWeek + ' Weekly Recap with expanded deadline reporting. It is one combined issue, not a separate newsletter or a replacement that drops weekly content.',
      'Review all six completed matchups. The exact lineup and bench breakdown is in lineupReview, while the matchup pairings and scores as of export are here.',
      'Do not assume scores are finalized merely because they were fetched after the scheduled deadline. Verify Week ' + input.completedWeek + ' results before calling winners, updating records, or grading picks.',
      'Give both hosts independent, complete power rankings 1-12, displayed Mason #1, Westy #1, Mason #2, Westy #2, through #12, with rank movement where supported.',
      'Produce League Pulse, Stock Watch and Clancy\'s Receipt Desk from verified material. Preserve an empty desk rather than inventing receipts.',
      'Preview all six Week ' + input.upcomingWeek + ' matchups, with a separate prediction and reasoning from each host. Do not invent missing pairings.',
      'If validation warns about missing matchups, recover and verify the actual Sleeper schedule before publication. Do not silently omit a review or preview.',
    ],
  };
}
