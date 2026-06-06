// July 1 2026 at midnight Eastern (EDT = UTC-4)
export const RIVALRY_SUBMISSION_DEADLINE = new Date('2026-07-01T04:00:00Z');

export function isBeforeDeadline(now = new Date()): boolean {
  return now < RIVALRY_SUBMISSION_DEADLINE;
}

export function deadlineLabel(): string {
  return RIVALRY_SUBMISSION_DEADLINE.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
