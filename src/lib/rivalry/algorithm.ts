import type { RivalryScore, CalculatedPair, PairingResult, PairingError } from './types';

export const RIVALRY_BUDGET = 550;
export const RIVALRY_TEAM_COUNT = 12;
export const RIVALRY_OTHERS = 11;
export const RIVALRY_MIN_SCORE = 1;
export const RIVALRY_MAX_SCORE = 100;
export const BLOOD_FEUD_SCORE = 100;

type RawSubmission = { teamId: string; scores: RivalryScore[] };

export function validateSubmission(
  submission: RawSubmission,
  allTeamIds: string[],
): PairingError[] {
  const errors: PairingError[] = [];
  const { teamId, scores } = submission;
  const otherTeams = allTeamIds.filter((t) => t !== teamId);

  if (scores.some((s) => s.targetTeamId === teamId)) {
    errors.push({ type: 'self_score', teamId, message: `${teamId} scored itself` });
  }

  if (scores.length !== RIVALRY_OTHERS) {
    errors.push({
      type: 'wrong_team_count',
      teamId,
      message: `Expected 11 scores, got ${scores.length}`,
    });
  }

  const scoredSet = new Set(scores.map((s) => s.targetTeamId));
  for (const t of otherTeams) {
    if (!scoredSet.has(t)) {
      errors.push({
        type: 'wrong_team_count',
        teamId,
        message: `Missing score for ${t}`,
      });
    }
  }

  const outOfRange = scores.filter(
    (s) => !Number.isInteger(s.score) || s.score < RIVALRY_MIN_SCORE || s.score > RIVALRY_MAX_SCORE,
  );
  if (outOfRange.length > 0) {
    errors.push({
      type: 'out_of_range',
      teamId,
      message: `Scores out of 1–100 range: ${outOfRange.map((s) => s.targetTeamId).join(', ')}`,
    });
  }

  const values = scores.map((s) => s.score);
  if (new Set(values).size !== values.length) {
    errors.push({ type: 'duplicate_scores', teamId, message: `Duplicate scores detected` });
  }

  const total = values.reduce((a, b) => a + b, 0);
  if (total !== RIVALRY_BUDGET) {
    errors.push({
      type: 'wrong_total',
      teamId,
      message: `Total is ${total}, must be ${RIVALRY_BUDGET}`,
    });
  }

  return errors;
}

export function calculatePairings(submissions: RawSubmission[]): PairingResult {
  if (submissions.length !== RIVALRY_TEAM_COUNT) {
    return {
      pairs: [],
      errors: [
        {
          type: 'missing_submissions',
          message: `Expected ${RIVALRY_TEAM_COUNT} submissions, got ${submissions.length}`,
        },
      ],
    };
  }

  const allTeamIds = submissions.map((s) => s.teamId);
  const allErrors: PairingError[] = [];
  for (const sub of submissions) {
    allErrors.push(...validateSubmission(sub, allTeamIds));
  }
  if (allErrors.length > 0) return { pairs: [], errors: allErrors };

  // Build score lookup: from -> to -> score
  const lookup = new Map<string, Map<string, number>>();
  for (const sub of submissions) {
    const m = new Map<string, number>();
    for (const s of sub.scores) m.set(s.targetTeamId, s.score);
    lookup.set(sub.teamId, m);
  }
  const getScore = (from: string, to: string) => lookup.get(from)?.get(to) ?? 0;

  const pairs: CalculatedPair[] = [];
  const unpaired = new Set<string>(allTeamIds);

  // Step 1: lock Blood Feuds (mutual 100)
  for (let i = 0; i < allTeamIds.length; i++) {
    for (let j = i + 1; j < allTeamIds.length; j++) {
      const a = allTeamIds[i];
      const b = allTeamIds[j];
      if (!unpaired.has(a) || !unpaired.has(b)) continue;
      if (getScore(a, b) === BLOOD_FEUD_SCORE && getScore(b, a) === BLOOD_FEUD_SCORE) {
        pairs.push({
          teamAId: a, teamBId: b,
          teamAScoreForB: BLOOD_FEUD_SCORE, teamBScoreForA: BLOOD_FEUD_SCORE,
          combinedScore: BLOOD_FEUD_SCORE * 2,
          isBloodFeud: true,
        });
        unpaired.delete(a);
        unpaired.delete(b);
      }
    }
  }

  // Step 2: build all possible remaining pairs
  const remaining = [...unpaired];
  const possible: Array<{
    teamA: string; teamB: string;
    aToB: number; bToA: number; combined: number;
  }> = [];

  for (let i = 0; i < remaining.length; i++) {
    for (let j = i + 1; j < remaining.length; j++) {
      const a = remaining[i];
      const b = remaining[j];
      const aToB = getScore(a, b);
      const bToA = getScore(b, a);
      possible.push({ teamA: a, teamB: b, aToB, bToA, combined: aToB + bToA });
    }
  }

  // Step 3: sort by combined desc, then by higher single score, then alphabetical
  // TODO: League may want a commissioner random draw to resolve true ties instead
  possible.sort((x, y) => {
    if (y.combined !== x.combined) return y.combined - x.combined;
    const xMax = Math.max(x.aToB, x.bToA);
    const yMax = Math.max(y.aToB, y.bToA);
    if (yMax !== xMax) return yMax - xMax;
    const xKey = [x.teamA, x.teamB].sort().join('|');
    const yKey = [y.teamA, y.teamB].sort().join('|');
    return xKey.localeCompare(yKey);
  });

  // Step 4: greedy pairing
  const stillUnpaired = new Set(remaining);
  for (const p of possible) {
    if (!stillUnpaired.has(p.teamA) || !stillUnpaired.has(p.teamB)) continue;
    pairs.push({
      teamAId: p.teamA, teamBId: p.teamB,
      teamAScoreForB: p.aToB, teamBScoreForA: p.bToA,
      combinedScore: p.combined,
      isBloodFeud: false,
    });
    stillUnpaired.delete(p.teamA);
    stillUnpaired.delete(p.teamB);
    if (stillUnpaired.size === 0) break;
  }

  return { pairs, errors: [] };
}
