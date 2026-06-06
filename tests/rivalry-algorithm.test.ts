import { describe, it, expect } from 'vitest';
import { calculatePairings, validateSubmission, RIVALRY_BUDGET, RIVALRY_TEAM_COUNT } from '../src/lib/rivalry/algorithm';
import type { RivalryScore } from '../src/lib/rivalry/types';

const TEAMS = [
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot',
  'Golf', 'Hotel', 'India', 'Juliet', 'Kilo', 'Lima',
];

/** Generate a valid ballot for `teamId` with deterministic unique scores totalling 550. */
function makeBallot(teamId: string, overrides: Record<string, number> = {}): RivalryScore[] {
  const others = TEAMS.filter((t) => t !== teamId);

  // Default: scores 40,41,42,...,50 = 11 values, sum = 495. Need 550 → add 55 more.
  // Use 40–50 spread: 40+41+42+43+44+45+46+47+48+49+50 = 495. Need 55 more, give the last slot +55 = 105... too high.
  // Use a valid unique set summing to 550:
  // 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 55 = 500 — still short.
  // Let's just compute: need 11 unique integers 1-100 summing to 550.
  // Mean = 50. Symmetric around 50: 45,46,47,48,49,50,51,52,53,54,55 = 11 items, sum = 550. ✓
  const defaultScores = [45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55];
  const scores = others.map((t, i) => ({
    targetTeamId: t,
    score: overrides[t] ?? defaultScores[i],
  }));
  return scores;
}

/** Build a full set of 12 submissions where all use the default ballot. */
function makeAllBallots(overrides: Record<string, Record<string, number>> = {}): Array<{ teamId: string; scores: RivalryScore[] }> {
  return TEAMS.map((team) => ({
    teamId: team,
    scores: makeBallot(team, overrides[team] ?? {}),
  }));
}

describe('validateSubmission', () => {
  it('passes a valid ballot', () => {
    const errors = validateSubmission({ teamId: 'Alpha', scores: makeBallot('Alpha') }, TEAMS);
    expect(errors).toHaveLength(0);
  });

  it('rejects self-scoring', () => {
    const scores = makeBallot('Alpha');
    scores[0] = { targetTeamId: 'Alpha', score: 45 };
    const errors = validateSubmission({ teamId: 'Alpha', scores }, TEAMS);
    expect(errors.some((e) => e.type === 'self_score')).toBe(true);
  });

  it('rejects duplicate scores', () => {
    const scores = makeBallot('Alpha');
    scores[0] = { ...scores[0], score: scores[1].score }; // duplicate
    const errors = validateSubmission({ teamId: 'Alpha', scores }, TEAMS);
    expect(errors.some((e) => e.type === 'duplicate_scores')).toBe(true);
  });

  it('rejects scores out of 1-100 range', () => {
    const scores = makeBallot('Alpha');
    scores[0] = { ...scores[0], score: 0 };
    const errors = validateSubmission({ teamId: 'Alpha', scores }, TEAMS);
    expect(errors.some((e) => e.type === 'out_of_range')).toBe(true);
  });

  it('rejects wrong total', () => {
    const scores = makeBallot('Alpha');
    scores[0] = { ...scores[0], score: scores[0].score + 1 }; // breaks total
    const errors = validateSubmission({ teamId: 'Alpha', scores }, TEAMS);
    expect(errors.some((e) => e.type === 'wrong_total')).toBe(true);
  });

  it('rejects wrong number of targets', () => {
    const scores = makeBallot('Alpha').slice(0, 10); // only 10
    const errors = validateSubmission({ teamId: 'Alpha', scores }, TEAMS);
    expect(errors.some((e) => e.type === 'wrong_team_count')).toBe(true);
  });
});

describe('calculatePairings', () => {
  it('returns an error if fewer than 12 submissions', () => {
    const result = calculatePairings(makeAllBallots().slice(0, 11));
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toBe('missing_submissions');
  });

  it('produces exactly 6 pairs for 12 valid submissions', () => {
    const result = calculatePairings(makeAllBallots());
    expect(result.errors).toHaveLength(0);
    expect(result.pairs).toHaveLength(RIVALRY_TEAM_COUNT / 2);
  });

  it('every team appears in exactly one pair', () => {
    const result = calculatePairings(makeAllBallots());
    const seen = new Set<string>();
    for (const p of result.pairs) {
      expect(seen.has(p.teamAId)).toBe(false);
      expect(seen.has(p.teamBId)).toBe(false);
      seen.add(p.teamAId);
      seen.add(p.teamBId);
    }
    expect(seen.size).toBe(RIVALRY_TEAM_COUNT);
  });

  it('detects a Blood Feud when both teams assign 100', () => {
    // Alpha gives Bravo 100, Bravo gives Alpha 100 → Blood Feud
    // Adjust ballots: both teams give each other 100 and redistribute 10 points from another slot.
    // Valid ballot for Alpha: {Bravo:100, Charlie:40, Delta:41, ...} summing to 550
    // Base without Bravo: 11 slots minus 100 = 450 needed in 10 slots of unique 1-100 integers
    // 40+41+42+43+44+45+46+47+48+54 = 450 ✓
    const alphaOverride: Record<string, number> = { Bravo: 100, Charlie: 40, Delta: 41, Echo: 42, Foxtrot: 43, Golf: 44, Hotel: 45, India: 46, Juliet: 47, Kilo: 48, Lima: 54 };
    const bravoOverride: Record<string, number> = { Alpha: 100, Charlie: 40, Delta: 41, Echo: 42, Foxtrot: 43, Golf: 44, Hotel: 45, India: 46, Juliet: 47, Kilo: 48, Lima: 54 };
    const subs = makeAllBallots({ Alpha: alphaOverride, Bravo: bravoOverride });
    const result = calculatePairings(subs);
    expect(result.errors).toHaveLength(0);
    const bloodFeud = result.pairs.find((p) => p.isBloodFeud);
    expect(bloodFeud).toBeDefined();
    const bf = bloodFeud!;
    const teamsInBF = [bf.teamAId, bf.teamBId].sort();
    expect(teamsInBF).toEqual(['Alpha', 'Bravo']);
  });

  it('pairs by highest combined score', () => {
    // Charlie and Delta: Charlie gives Delta 99, Delta gives Charlie 99 → combined 198
    // All others use default 45-55 range → max combined for any other pair ≤ 110
    const charlieOverride: Record<string, number> = { Delta: 99, Alpha: 40, Bravo: 41, Echo: 42, Foxtrot: 43, Golf: 44, Hotel: 45, India: 46, Juliet: 47, Kilo: 48, Lima: 55 };
    const deltaOverride: Record<string, number> = { Charlie: 99, Alpha: 40, Bravo: 41, Echo: 42, Foxtrot: 43, Golf: 44, Hotel: 45, India: 46, Juliet: 47, Kilo: 48, Lima: 55 };
    const subs = makeAllBallots({ Charlie: charlieOverride, Delta: deltaOverride });
    const result = calculatePairings(subs);
    expect(result.errors).toHaveLength(0);
    const charlieDeltaPair = result.pairs.find(
      (p) => (p.teamAId === 'Charlie' && p.teamBId === 'Delta') || (p.teamAId === 'Delta' && p.teamBId === 'Charlie'),
    );
    expect(charlieDeltaPair).toBeDefined();
    expect(charlieDeltaPair!.combinedScore).toBe(198);
  });

  it('Blood Feud teams are removed before greedy pairing', () => {
    const alphaOverride: Record<string, number> = { Bravo: 100, Charlie: 40, Delta: 41, Echo: 42, Foxtrot: 43, Golf: 44, Hotel: 45, India: 46, Juliet: 47, Kilo: 48, Lima: 54 };
    const bravoOverride: Record<string, number> = { Alpha: 100, Charlie: 40, Delta: 41, Echo: 42, Foxtrot: 43, Golf: 44, Hotel: 45, India: 46, Juliet: 47, Kilo: 48, Lima: 54 };
    const subs = makeAllBallots({ Alpha: alphaOverride, Bravo: bravoOverride });
    const result = calculatePairings(subs);
    // Alpha and Bravo must be in their own pair; no other pair should include them
    const nonBFPairs = result.pairs.filter((p) => !p.isBloodFeud);
    for (const p of nonBFPairs) {
      expect(p.teamAId).not.toBe('Alpha');
      expect(p.teamAId).not.toBe('Bravo');
      expect(p.teamBId).not.toBe('Alpha');
      expect(p.teamBId).not.toBe('Bravo');
    }
  });

  it('output is deterministic (same input → same output)', () => {
    const subs = makeAllBallots();
    const r1 = calculatePairings(subs);
    const r2 = calculatePairings(subs);
    expect(r1.pairs).toEqual(r2.pairs);
  });

  it('combined score equals sum of mutual scores', () => {
    const result = calculatePairings(makeAllBallots());
    for (const p of result.pairs) {
      expect(p.combinedScore).toBe(p.teamAScoreForB + p.teamBScoreForA);
    }
  });
});

describe('ballot validation — impossible budget detection', () => {
  it('RIVALRY_BUDGET is 550', () => {
    expect(RIVALRY_BUDGET).toBe(550);
  });
});
