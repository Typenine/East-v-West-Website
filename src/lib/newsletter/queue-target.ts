/**
 * Editorial-queue → generation-target mapping.
 *
 * Extracted from scripts/run-newsletter.mjs so the mapping is unit-testable and
 * the week-resolution bugs it replaces stay fixed:
 *  - weekless episode types (preseason/pre_draft/post_draft/offseason) each get a
 *    distinct storage week — previously `offseason` fell through to week 0 and
 *    collided with other items, so the second item was marked "generated" without
 *    generating anything;
 *  - weekly items saved with a blank week resolve to the CURRENT NFL week instead
 *    of silently generating a bogus week-0 newsletter.
 */

/** Storage weeks for weekless episode types (mirrors the runner's convention). */
export const EPISODE_WEEK_STORAGE: Record<string, number> = {
  preseason: 900,
  pre_draft: 901,
  post_draft: 902,
  offseason: 903,
};

export interface QueueTargetInput {
  season: number;
  week: number | null;
  episodeType: string | null;
}

export interface QueueTarget {
  season: number;
  week: number;
  episodeType: string;
  storageWeek: number;
  reason: string;
}

/**
 * Resolve a queue item to a generation target.
 * `currentNflWeek` fills in weekly items whose week was left blank in the admin form.
 */
export function resolveQueueTarget(
  item: QueueTargetInput & { id?: string },
  currentNflWeek: number,
): QueueTarget {
  const episodeType = item.episodeType || 'regular';
  const weeklessStorage = EPISODE_WEEK_STORAGE[episodeType];

  if (weeklessStorage !== undefined) {
    return {
      season: item.season,
      week: item.week ?? 0,
      episodeType,
      storageWeek: weeklessStorage,
      reason: `queue:${item.id ?? 'unknown'}`,
    };
  }

  const week = item.week ?? (Number.isFinite(currentNflWeek) && currentNflWeek > 0 ? currentNflWeek : 1);
  return {
    season: item.season,
    week,
    episodeType,
    storageWeek: week,
    reason: `queue:${item.id ?? 'unknown'}`,
  };
}
