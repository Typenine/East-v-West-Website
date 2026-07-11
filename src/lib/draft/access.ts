import { TEAM_NAMES } from '@/lib/constants/league';

/**
 * The three teams helping test the room keep access before the league-wide opening.
 * The remaining teams unlock at 5:00 PM Eastern on July 17, 2026 (21:00 UTC).
 */
export const DRAFT_ROOM_LEAGUE_OPEN_AT_MS = Date.parse('2026-07-17T21:00:00.000Z');

export const DRAFT_ROOM_EARLY_ACCESS_TEAMS = new Set([
  'Belleview Badgers',
  'Mt. Lebanon Cake Eaters',
  'Bimg Bamg Boomg',
]);

export function canAccessDraftRoom(team: string | null | undefined, nowMs = Date.now()): boolean {
  if (!team || !TEAM_NAMES.includes(team)) return false;
  return DRAFT_ROOM_EARLY_ACCESS_TEAMS.has(team) || nowMs >= DRAFT_ROOM_LEAGUE_OPEN_AT_MS;
}
