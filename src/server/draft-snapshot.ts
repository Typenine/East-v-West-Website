import { LEAGUE_IDS } from '@/lib/constants/league';
import { getLeagueRosters, getRosterIdToTeamNameMap, getAllPlayersCached, getLeague } from '@/lib/utils/sleeper-api';
import { getCurrentPhase } from '@/lib/utils/phase-resolver';
import { loadDraftOwnershipForSeason, type NextDraftOwnership } from '@/lib/server/trade-assets';
import {
  bulkInsertRosterSnapshot,
  bulkInsertFuturePicks,
  hasRosterSnapshot,
  hasFuturePickSnapshot,
} from './db/queries.fixed';
import { canonicalizeTeamName } from '@/lib/server/user-identity';

export const runtime = 'nodejs';

/**
 * Snapshot all team rosters from Sleeper into draft_roster_snapshots.
 * Called at draft start. Skips if already snapshotted for this draft.
 */
export async function snapshotDraftRosters(draftId: string): Promise<void> {
  const alreadyDone = await hasRosterSnapshot(draftId);
  if (alreadyDone) return;

  const leagueId = LEAGUE_IDS.CURRENT;
  const [rosters, nameMap, allPlayers] = await Promise.all([
    getLeagueRosters(leagueId).catch(() => []),
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
    getAllPlayersCached().catch(() => ({} as Record<string, { first_name?: string; last_name?: string; position?: string; team?: string }>)),
  ]);

  for (const roster of rosters) {
    const teamName = nameMap.get(roster.roster_id);
    if (!teamName) continue;
    const playerIds: string[] = Array.isArray(roster.players) ? (roster.players as string[]).filter(Boolean) : [];
    const players = playerIds.map(id => {
      const p = allPlayers[id];
      const name = p ? [p.first_name, p.last_name].filter(Boolean).join(' ') || id : id;
      return { playerId: id, playerName: name, playerPos: p?.position || null, playerNfl: p?.team || null };
    });
    if (players.length > 0) {
      await bulkInsertRosterSnapshot(draftId, teamName, players, 'sleeper');
    }
  }
}

/**
 * Snapshot future pick ownership from Sleeper into draft_future_picks.
 * Called at draft start. Skips if already snapshotted for this draft.
 */
export async function snapshotDraftFuturePicks(draftId: string): Promise<void> {
  const alreadyDone = await hasFuturePickSnapshot(draftId);
  if (alreadyDone) return;

  const leagueId = LEAGUE_IDS.CURRENT;
  const [rosters, nameMap, league] = await Promise.all([
    getLeagueRosters(leagueId).catch(() => []),
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
    getLeague(leagueId).catch(() => null),
  ]);

  const phase = getCurrentPhase();
  const baseSeason = Number((league as unknown as { season?: string })?.season ?? new Date().getFullYear()) + 1;
  const seasons = phase === 'post_championship_pre_draft'
    ? [baseSeason, baseSeason + 1, baseSeason + 2]
    : [baseSeason + 1, baseSeason + 2];

  const picks: Array<{ ownerTeam: string; originalTeam: string; year: number; round: number }> = [];
  const seen = new Set<string>();

  const ownerships = await Promise.all(
    seasons.map(season => loadDraftOwnershipForSeason({ leagueId, league, rosters, nameMap, season }).catch(() => null))
  );

  for (const ownership of ownerships as (NextDraftOwnership | null)[]) {
    if (!ownership) continue;
    for (const [key, value] of Object.entries(ownership.ownership)) {
      const ownerRosterId = (value as { ownerRosterId: number }).ownerRosterId;
      const ownerTeam = nameMap.get(ownerRosterId) || ownership.rosterIdToTeam[String(ownerRosterId)];
      if (!ownerTeam) continue;
      const [origRosterIdStr, roundStr] = key.split('-');
      const round = Number(roundStr);
      if (!Number.isFinite(round)) continue;
      const originalTeam =
        ownership.rosterIdToTeam[origRosterIdStr] ||
        nameMap.get(Number(origRosterIdStr)) ||
        ownerTeam;
      const pickKey = `${ownership.season}-${round}-${originalTeam}-${ownerTeam}`;
      if (seen.has(pickKey)) continue;
      seen.add(pickKey);
      picks.push({ ownerTeam: canonicalizeTeamName(ownerTeam), originalTeam: canonicalizeTeamName(originalTeam), year: ownership.season, round });
    }
  }

  if (picks.length > 0) {
    await bulkInsertFuturePicks(draftId, picks);
  }
}
