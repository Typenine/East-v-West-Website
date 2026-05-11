/**
 * Shared draft UI + animation helpers so draft room and presentation overlay stay aligned.
 */

/** Safety if GSAP onComplete never runs — must exceed full DraftPickAnimation sequence. */
export const DRAFT_ANIM_PICK_PHASE_MAX_MS = 27_000;

/** Safety if GSAP onComplete never runs — must exceed full NowOnClockAnimation sequence (~10s). */
export const DRAFT_ANIM_CLOCK_PHASE_MAX_MS = 20_000;

type DraftLike = {
  allSlots?: readonly unknown[] | null;
  rounds?: number | null;
} | null | undefined;

/** Matches draft room: slots ÷ configured rounds, default 12-team league shape when unknown. */
export function draftPicksPerRound(draft: DraftLike): number {
  const n = draft?.allSlots?.length ?? 0;
  const r = Math.max(draft?.rounds ?? 4, 1);
  return Math.ceil(n / r) || 12;
}
