import { getPlayerProfile } from '@/lib/players/player-profile-service';
import { getLeagueStatsDatasetV3 } from '@/lib/stats/league-stats-v3';
import { buildAllEvwTeams } from '@/lib/history/league-history';
import type { PlayerHonor, PlayerProfileWithHonors } from '@/lib/types/player-honors';

export interface RecordedAnnualPlayerAward {
  season: string;
  playerId: string;
  kind: 'mvp' | 'rookie_of_year';
}

/**
 * Official annual player awards belong here. Keep this explicit rather than inferring
 * historical MVP or Rookie of the Year winners from scoring totals.
 */
export const RECORDED_ANNUAL_PLAYER_AWARDS: readonly RecordedAnnualPlayerAward[] = [];

const HONORS_CACHE_TTL_MS = 5 * 60 * 1000;
let honorsIndexCache: { ts: number; data: Map<string, PlayerHonor[]> } | null = null;

function addHonor(index: Map<string, PlayerHonor[]>, playerId: string, honor: PlayerHonor) {
  const rows = index.get(playerId) || [];
  rows.push(honor);
  index.set(playerId, rows);
}

function honorSort(a: PlayerHonor, b: PlayerHonor): number {
  if (a.season !== b.season) return b.season.localeCompare(a.season);
  const rank: Record<PlayerHonor['kind'], number> = {
    mvp: 0,
    rookie_of_year: 1,
    all_evw_first: 2,
    all_evw_second: 3,
  };
  return rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label);
}

async function buildHonorsIndex(): Promise<Map<string, PlayerHonor[]>> {
  const cached = honorsIndexCache;
  if (cached && Date.now() - cached.ts < HONORS_CACHE_TTL_MS) return cached.data;

  const index = new Map<string, PlayerHonor[]>();
  const dataset = await getLeagueStatsDatasetV3();

  for (const season of buildAllEvwTeams(dataset)) {
    for (const row of season.firstTeam) {
      addHonor(index, row.playerId, {
        id: `${season.season}:all-evw-first:${row.playerId}`,
        season: season.season,
        kind: 'all_evw_first',
        label: 'First Team All-EVW',
        position: row.position,
        slot: row.slot,
        source: 'statistical',
      });
    }
    for (const row of season.secondTeam) {
      addHonor(index, row.playerId, {
        id: `${season.season}:all-evw-second:${row.playerId}`,
        season: season.season,
        kind: 'all_evw_second',
        label: 'Second Team All-EVW',
        position: row.position,
        slot: row.slot,
        source: 'statistical',
      });
    }
  }

  for (const award of RECORDED_ANNUAL_PLAYER_AWARDS) {
    addHonor(index, award.playerId, {
      id: `${award.season}:${award.kind}:${award.playerId}`,
      season: award.season,
      kind: award.kind,
      label: award.kind === 'mvp' ? 'East v. West MVP' : 'East v. West Rookie of the Year',
      source: 'official',
    });
  }

  for (const rows of index.values()) rows.sort(honorSort);
  honorsIndexCache = { ts: Date.now(), data: index };
  return index;
}

export async function getPlayerHonors(playerId: string): Promise<PlayerHonor[]> {
  const index = await buildHonorsIndex();
  return [...(index.get(playerId) || [])];
}

export async function getPlayerProfileWithHonors(playerId: string): Promise<PlayerProfileWithHonors | null> {
  const [profile, honors] = await Promise.all([
    getPlayerProfile(playerId),
    getPlayerHonors(playerId).catch(() => [] as PlayerHonor[]),
  ]);
  if (!profile) return null;
  return { ...profile, honors };
}
