import { IMPORTANT_DATES, TEAM_NAMES } from '@/lib/constants/league';

export const DRAFT_ROOM_TEST_TEAM = 'Belleview Badgers';
export const NEXT_DRAFT_ROOM_DATE = IMPORTANT_DATES.NEXT_LEAGUE_YEAR_DRAFT;

/**
 * The live draft room is closed to normal league users during the offseason.
 * Admins and the Belleview Badgers retain access for testing and maintenance.
 * Flip DRAFT_ROOM_PUBLIC_OPEN when the next live draft room should open to everyone.
 */
export const DRAFT_ROOM_PUBLIC_OPEN = false;

export function canAccessDraftRoom(
  team: string | null | undefined,
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  if (!team || !TEAM_NAMES.includes(team)) return false;
  return DRAFT_ROOM_PUBLIC_OPEN || team === DRAFT_ROOM_TEST_TEAM;
}
