import { describe, expect, it } from 'vitest';
import { TEAM_NAMES } from '@/lib/constants/league';
import {
  canAccessDraftRoom,
  DRAFT_ROOM_EARLY_ACCESS_TEAMS,
  DRAFT_ROOM_LEAGUE_OPEN_AT_MS,
} from '@/lib/draft/access';

describe('draft room scheduled access', () => {
  const beforeOpen = DRAFT_ROOM_LEAGUE_OPEN_AT_MS - 1;

  it('keeps the three testing teams open before the league-wide time', () => {
    expect([...DRAFT_ROOM_EARLY_ACCESS_TEAMS]).toHaveLength(3);
    for (const team of DRAFT_ROOM_EARLY_ACCESS_TEAMS) {
      expect(canAccessDraftRoom(team, beforeOpen)).toBe(true);
    }
  });

  it('keeps the other nine teams closed before 5 PM ET on July 17', () => {
    const remainingTeams = TEAM_NAMES.filter((team) => !DRAFT_ROOM_EARLY_ACCESS_TEAMS.has(team));
    expect(remainingTeams).toHaveLength(9);
    for (const team of remainingTeams) {
      expect(canAccessDraftRoom(team, beforeOpen)).toBe(false);
    }
  });

  it('opens all twelve teams exactly at the scheduled time', () => {
    for (const team of TEAM_NAMES) {
      expect(canAccessDraftRoom(team, DRAFT_ROOM_LEAGUE_OPEN_AT_MS)).toBe(true);
    }
  });

  it('never admits a non-league team', () => {
    expect(canAccessDraftRoom('Unknown Team', DRAFT_ROOM_LEAGUE_OPEN_AT_MS + 1)).toBe(false);
  });
});
