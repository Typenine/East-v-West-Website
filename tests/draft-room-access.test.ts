import { describe, expect, it } from 'vitest';
import { TEAM_NAMES } from '@/lib/constants/league';
import { canAccessDraftRoom } from '@/lib/draft/access';

describe('draft room league access', () => {
  it('admits every canonical league team immediately', () => {
    for (const team of TEAM_NAMES) {
      expect(canAccessDraftRoom(team, 0)).toBe(true);
      expect(canAccessDraftRoom(team, Date.now())).toBe(true);
    }
  });

  it('never admits a missing or non-league team', () => {
    expect(canAccessDraftRoom(null)).toBe(false);
    expect(canAccessDraftRoom(undefined)).toBe(false);
    expect(canAccessDraftRoom('Unknown Team')).toBe(false);
  });
});
