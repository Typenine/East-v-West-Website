import type { Poll } from '@/lib/votes/types';

/** Whether aggregate survey (form) results may be shown to league members (not admins). */
export function surveyResultsVisibleToMembers(
  poll: Pick<Poll, 'status' | 'resultVisibility' | 'anonymous' | 'resultsPublishedAt'>,
  responseCount: number,
  totalEligible: number,
): boolean {
  if (poll.resultVisibility === 'immediate') {
    // Anonymous surveys: no live tallies while the poll is still open.
    if (poll.anonymous && poll.status === 'open') return false;
    return true;
  }
  if (poll.resultVisibility === 'all_voted') {
    return responseCount >= totalEligible;
  }
  // admin_publish — commissioner must publish survey results explicitly.
  return poll.resultsPublishedAt != null;
}
