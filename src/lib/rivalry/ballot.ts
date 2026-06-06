import { RIVALRY_BUDGET, RIVALRY_MIN_SCORE, RIVALRY_MAX_SCORE, BLOOD_FEUD_SCORE } from './algorithm';

// raw string values from inputs; null/'' = not filled
export type BallotDraft = Record<string, string>;

export type BallotValidation = {
  isValid: boolean;
  total: number;
  teamsScored: number;
  teamsRemaining: number;
  uniqueCount: number;
  duplicateMap: Record<string, string[]>; // teamId -> [other teamIds with same score]
  invalidIds: string[]; // teamIds with out-of-range or non-integer scores
  budgetError: string | null;
  impossibleBudget: boolean;
  bloodFeuds: string[]; // teamIds where user gave 100
};

export function validateBallot(draft: BallotDraft, allOtherIds: string[]): BallotValidation {
  // Parse scores; keep null for unfilled
  const parsed: Record<string, number | null> = {};
  for (const id of allOtherIds) {
    const raw = draft[id] ?? '';
    if (raw === '' || raw === null) {
      parsed[id] = null;
    } else {
      const n = Number(raw);
      parsed[id] = isNaN(n) ? null : n;
    }
  }

  const filledEntries = Object.entries(parsed).filter((e): e is [string, number] => e[1] !== null);
  const total = filledEntries.reduce((s, [, v]) => s + v, 0);
  const teamsScored = filledEntries.length;
  const teamsRemaining = allOtherIds.length - teamsScored;

  // Duplicates
  const scoreToIds = new Map<number, string[]>();
  for (const [id, score] of filledEntries) {
    if (!scoreToIds.has(score)) scoreToIds.set(score, []);
    scoreToIds.get(score)!.push(id);
  }
  const duplicateMap: Record<string, string[]> = {};
  for (const [, ids] of scoreToIds) {
    if (ids.length > 1) {
      for (const id of ids) {
        duplicateMap[id] = ids.filter((x) => x !== id);
      }
    }
  }

  // Invalid scores (out of range or non-integer)
  const invalidIds: string[] = [];
  for (const [id, score] of filledEntries) {
    if (!Number.isInteger(score) || score < RIVALRY_MIN_SCORE || score > RIVALRY_MAX_SCORE) {
      invalidIds.push(id);
    }
  }

  // Budget error
  let budgetError: string | null = null;
  if (total > RIVALRY_BUDGET) {
    budgetError = `${total - RIVALRY_BUDGET} over budget`;
  } else if (teamsRemaining === 0 && total < RIVALRY_BUDGET) {
    budgetError = `${RIVALRY_BUDGET - total} short`;
  }

  // Impossible remaining budget: can the remaining slots reach exactly 550?
  let impossibleBudget = false;
  if (teamsRemaining > 0 && total < RIVALRY_BUDGET) {
    const remaining = RIVALRY_BUDGET - total;
    const usedValues = new Set(filledEntries.map(([, v]) => v));
    const available = Array.from({ length: RIVALRY_MAX_SCORE }, (_, i) => i + 1).filter(
      (v) => !usedValues.has(v),
    );
    if (available.length < teamsRemaining) {
      impossibleBudget = true;
    } else {
      const sortedAvail = [...available].sort((a, b) => a - b);
      const minPossible = sortedAvail.slice(0, teamsRemaining).reduce((s, v) => s + v, 0);
      const maxPossible = sortedAvail.slice(-teamsRemaining).reduce((s, v) => s + v, 0);
      if (remaining < minPossible || remaining > maxPossible) {
        impossibleBudget = true;
      }
    }
  }

  const bloodFeuds = filledEntries
    .filter(([, score]) => score === BLOOD_FEUD_SCORE)
    .map(([id]) => id);

  const uniqueCount = new Set(filledEntries.map(([, v]) => v)).size;

  const isValid =
    teamsScored === allOtherIds.length &&
    Object.keys(duplicateMap).length === 0 &&
    invalidIds.length === 0 &&
    total === RIVALRY_BUDGET;

  return {
    isValid,
    total,
    teamsScored,
    teamsRemaining,
    uniqueCount,
    duplicateMap,
    invalidIds,
    budgetError,
    impossibleBudget,
    bloodFeuds,
  };
}
