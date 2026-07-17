import { TEAM_NAMES } from '@/lib/constants/league';

/**
 * The live draft room is available to every authenticated league team.
 * Authentication and team ownership are still enforced by middleware and the draft API.
 */
export function canAccessDraftRoom(team: string | null | undefined, _nowMs = Date.now()): boolean {
  return Boolean(team && TEAM_NAMES.includes(team));
}
