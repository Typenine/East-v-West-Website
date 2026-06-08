import type {
  BallotMap,
  BordaResult,
  EligibilityType,
  IRVElimRound,
  IRVResult,
  PluralityResult,
  PollOption,
  PollRound,
  RoundResult,
  YesNoResult,
} from './types';

export function resolveThreshold(round: PollRound, eligibilityType: EligibilityType): number {
  switch (round.thresholdType) {
    case 'majority':
      return eligibilityType === 'team' ? 7 : (round.thresholdValue ?? 8);
    case 'supermajority':
      return 9;
    case 'admin_defined':
      return round.thresholdValue ?? 7;
    case 'plurality':
    default:
      return Infinity;
  }
}

export function computeBorda(
  ballots: BallotMap,
  options: PollOption[],
  survivorCount: number,
): BordaResult {
  const N = options.length;
  const points: Record<string, number> = {};
  for (const opt of options) points[opt.id] = 0;

  for (const selections of Object.values(ballots)) {
    for (const sel of selections) {
      if (sel.rank != null && points[sel.optionId] !== undefined) {
        // rank 1 = N points, rank 2 = N-1 points, etc.
        points[sel.optionId] += N - (sel.rank - 1);
      }
    }
  }

  const optMap = Object.fromEntries(options.map((o) => [o.id, o]));
  const scores = Object.entries(points)
    .map(([optionId, pts]) => ({ optionId, text: optMap[optionId]?.text ?? '', points: pts, isSurvivor: false }))
    .sort((a, b) => b.points - a.points);

  const survivors = scores.slice(0, survivorCount).map((s) => s.optionId);
  const survivorSet = new Set(survivors);
  for (const s of scores) s.isSurvivor = survivorSet.has(s.optionId);

  return { type: 'borda', scores, survivors };
}

export function computeIRV(
  ballots: BallotMap,
  options: PollOption[],
  threshold: number,
): IRVResult {
  const optMap = Object.fromEntries(options.map((o) => [o.id, o]));
  const remaining = new Set(options.map((o) => o.id));
  const rounds: IRVElimRound[] = [];
  let winners: string[] = [];
  let roundIndex = 0;

  while (remaining.size > 1) {
    // Count first-choice votes among remaining options only
    const firstChoiceCounts: Record<string, number> = {};
    for (const id of remaining) firstChoiceCounts[id] = 0;

    for (const selections of Object.values(ballots)) {
      // Sort by rank ascending, find first selection that's still in remaining
      const ranked = [...selections]
        .filter((s) => s.rank != null && remaining.has(s.optionId))
        .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
      if (ranked.length > 0) {
        firstChoiceCounts[ranked[0].optionId] = (firstChoiceCounts[ranked[0].optionId] ?? 0) + 1;
      }
    }

    // Check if any option meets threshold
    const totalVotes = Object.values(firstChoiceCounts).reduce((a, b) => a + b, 0);
    for (const [optId, count] of Object.entries(firstChoiceCounts)) {
      if (count >= threshold || (threshold === Infinity && count > totalVotes / 2)) {
        winners = [optId];
        rounds.push({ roundIndex, firstChoiceCounts, eliminated: [] });
        return { type: 'irv', rounds, winners, threshold };
      }
    }

    // Eliminate the option(s) with fewest first-choice votes
    const minCount = Math.min(...Object.values(firstChoiceCounts));
    const eliminated = Object.entries(firstChoiceCounts)
      .filter(([, count]) => count === minCount)
      .map(([id]) => id);

    rounds.push({ roundIndex, firstChoiceCounts, eliminated });
    for (const id of eliminated) remaining.delete(id);
    roundIndex++;
  }

  // One option left
  winners = [...remaining];
  const lastCounts: Record<string, number> = {};
  for (const id of remaining) lastCounts[id] = 0;
  for (const selections of Object.values(ballots)) {
    const inRemaining = selections.filter((s) => remaining.has(s.optionId));
    if (inRemaining.length > 0) lastCounts[inRemaining[0].optionId] = (lastCounts[inRemaining[0].optionId] ?? 0) + 1;
  }
  rounds.push({ roundIndex, firstChoiceCounts: lastCounts, eliminated: [] });

  // Validate winner meets threshold (if not plurality)
  if (threshold !== Infinity) {
    const winnerCount = lastCounts[winners[0]] ?? 0;
    if (winnerCount < threshold) winners = [];
  }

  return { type: 'irv', rounds, winners, threshold };
}

export function computePlurality(
  ballots: BallotMap,
  options: PollOption[],
  winnerCount?: number,
): PluralityResult {
  const counts: Record<string, number> = {};
  for (const opt of options) counts[opt.id] = 0;

  for (const selections of Object.values(ballots)) {
    for (const sel of selections) {
      if (sel.selected && counts[sel.optionId] !== undefined) {
        counts[sel.optionId] += 1;
      }
    }
  }

  const optMap = Object.fromEntries(options.map((o) => [o.id, o]));
  const sorted = Object.entries(counts)
    .map(([optionId, count]) => ({ optionId, text: optMap[optionId]?.text ?? '', count, isWinner: false }))
    .sort((a, b) => b.count - a.count);

  const take = winnerCount ?? 1;
  const winners = sorted.slice(0, take).map((s) => s.optionId);
  const winnerSet = new Set(winners);
  for (const s of sorted) s.isWinner = winnerSet.has(s.optionId);

  return { type: 'plurality', counts: sorted, winners };
}

export function computeYesNo(
  ballots: BallotMap,
  yesOptionId: string,
  threshold: number,
): YesNoResult {
  let yes = 0;
  let no = 0;

  for (const selections of Object.values(ballots)) {
    for (const sel of selections) {
      if (!sel.selected) continue;
      if (sel.optionId === yesOptionId) yes++;
      else no++;
    }
  }

  return { type: 'yes_no', yes, no, passed: yes >= threshold, threshold };
}

export function computeRound(
  round: PollRound,
  ballots: BallotMap,
  options: PollOption[],
  eligibilityType: EligibilityType,
): RoundResult {
  const threshold = resolveThreshold(round, eligibilityType);

  switch (round.voteType) {
    case 'borda':
      return computeBorda(ballots, options, round.survivorCount ?? 1);

    case 'irv':
      return computeIRV(ballots, options, threshold);

    case 'select_one':
    case 'eliminate':
      return computePlurality(ballots, options, round.survivorCount ?? 1);

    case 'select_multi':
      return computePlurality(ballots, options, round.survivorCount ?? undefined);

    case 'yes_no': {
      // Yes option is always displayOrder 0
      const yesOpt = options.find((o) => o.displayOrder === 0) ?? options[0];
      return computeYesNo(ballots, yesOpt?.id ?? '', threshold);
    }

    default:
      return computePlurality(ballots, options, 1);
  }
}

export function buildBallotMap(
  votes: Array<{ vote: { voterId: string }; selections: Array<{ optionId: string; rank?: number | null; selected?: boolean | null }> }>,
): BallotMap {
  const map: BallotMap = {};
  for (const { vote, selections } of votes) {
    map[vote.voterId] = selections.map((s) => ({
      optionId: s.optionId,
      rank: s.rank ?? undefined,
      selected: s.selected ?? undefined,
    }));
  }
  return map;
}
