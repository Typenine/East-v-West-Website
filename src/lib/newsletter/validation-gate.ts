/**
 * Pre-Generation Data Validation Gate
 *
 * Runs before a staged newsletter job is created. Checks that the ingested
 * league data looks complete enough to generate from. If critical data is
 * missing or obviously partial (e.g. Sleeper mid-update), the job fails early
 * with a clear admin-facing message instead of producing a confident but
 * flawed newsletter.
 *
 * Errors block generation (unless force=true). Warnings are recorded but
 * never block.
 */

export interface ValidationGateInput {
  season: number;
  week: number;
  episodeType: string;
  users: Array<unknown>;
  rosters: Array<{ players?: string[] | null }>;
  matchups: Array<{ matchup_id?: number | null; points?: number | null }>;
  /** Derived matchup pairs (post-buildDerived) */
  matchupPairs: Array<unknown>;
  /** Optional expected team count (league constant). Checked when provided. */
  expectedTeamCount?: number;
}

export interface ValidationGateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  checkedAt: string;
}

/** Episode types that recap completed games and therefore need final scores. */
const RECAP_EPISODES = new Set(['regular', 'playoffs', 'playoffs_final', 'championship']);

/** Episode types that don't need weekly matchup data at all. */
const NO_MATCHUP_EPISODES = new Set(['preseason', 'pre_draft', 'post_draft', 'offseason']);

export function validateGenerationInputs(input: ValidationGateInput): ValidationGateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { season, week, episodeType, users, rosters, matchups, matchupPairs, expectedTeamCount } = input;

  // ── Season/week sanity ──
  const currentYear = new Date().getFullYear();
  if (season < 2020 || season > currentYear + 1) {
    errors.push(`Season ${season} is outside the plausible range (2020–${currentYear + 1}).`);
  }
  if (week < 0 || week > 23) {
    errors.push(`Week ${week} is outside the valid NFL range (0–23).`);
  }

  // ── Team count ──
  if (users.length === 0) {
    errors.push('No league users returned from Sleeper — API may be down or league ID wrong.');
  }
  if (rosters.length === 0) {
    errors.push('No rosters returned from Sleeper.');
  }
  if (expectedTeamCount && users.length > 0 && users.length !== expectedTeamCount) {
    warnings.push(`Expected ${expectedTeamCount} teams but Sleeper returned ${users.length} users.`);
  }
  if (users.length > 0 && rosters.length > 0 && users.length !== rosters.length) {
    warnings.push(`User count (${users.length}) does not match roster count (${rosters.length}).`);
  }

  // ── Roster completeness ──
  const emptyRosters = rosters.filter(r => !r.players || r.players.length === 0).length;
  if (rosters.length > 0 && emptyRosters === rosters.length) {
    errors.push('All rosters are empty — Sleeper data is incomplete or the league has reset.');
  } else if (emptyRosters > 0) {
    warnings.push(`${emptyRosters} roster(s) are empty.`);
  }

  // ── Matchup data (only for episodes that need it) ──
  if (!NO_MATCHUP_EPISODES.has(episodeType)) {
    if (matchupPairs.length === 0) {
      errors.push(`Episode type "${episodeType}" requires matchup data, but no matchup pairs were derived for week ${week}.`);
    }

    // Recap episodes need completed games (non-zero scores)
    if (RECAP_EPISODES.has(episodeType) && matchups.length > 0) {
      const scored = matchups.filter(m => (m.points ?? 0) > 0).length;
      if (scored === 0) {
        errors.push(`Recap episode requested for week ${week} but no matchups have any points — games may not have been played yet, or Sleeper stats haven't settled.`);
      } else if (scored < matchups.length / 2) {
        warnings.push(`Only ${scored}/${matchups.length} matchup entries have points — Sleeper data may still be settling.`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    checkedAt: new Date().toISOString(),
  };
}
