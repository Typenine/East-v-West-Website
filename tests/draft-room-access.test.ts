import { describe, expect, it } from 'vitest';
import { TEAM_NAMES } from '@/lib/constants/league';
import { canAccessDraftRoom, DRAFT_ROOM_TEST_TEAM } from '@/lib/draft/access';

describe('draft room offseason access', () => {
  it('keeps the Belleview Badgers test team in the room', () => {
    expect(DRAFT_ROOM_TEST_TEAM).toBe('Belleview Badgers');
    expect(canAccessDraftRoom('Belleview Badgers')).toBe(true);
  });

  it('admits admins even without a team session', () => {
    expect(canAccessDraftRoom(null, true)).toBe(true);
    expect(canAccessDraftRoom(undefined, true)).toBe(true);
  });

  it('blocks every other league team while the public room is closed', () => {
    for (const team of TEAM_NAMES) {
      if (team === DRAFT_ROOM_TEST_TEAM) continue;
      expect(canAccessDraftRoom(team)).toBe(false);
    }
  });

  it('never admits a missing or non-league team without admin access', () => {
    expect(canAccessDraftRoom(null)).toBe(false);
    expect(canAccessDraftRoom(undefined)).toBe(false);
    expect(canAccessDraftRoom('Unknown Team')).toBe(false);
  });
});
