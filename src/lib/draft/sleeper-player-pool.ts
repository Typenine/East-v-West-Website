import {
  getAllPlayersCached,
  getNFLState,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE', 'K']);

export type SleeperPoolPlayer = {
  id: string;
  name: string;
  pos: string;
  nfl: string | null;
  rank: number | null;
  meta?: {
    college?: string | null;
    rookieYear?: string;
    source: 'sleeper';
    yearsExp?: number | null;
  };
};

function playerName(player: SleeperPlayer): string {
  const full = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  return full || player.player_id;
}

function isInactive(player: SleeperPlayer): boolean {
  const status = (player.status || '').toLowerCase();
  return status === 'inactive' || status === 'retired' || status === 'na';
}

/**
 * Decide whether a Sleeper player belongs in the rookie pool for `draftYear`.
 *
 * Sleeper's public players feed no longer reliably includes `rookie_year`, so we
 * map draft years onto `years_exp` relative to the live NFL season:
 * - draftYear === current season  → years_exp === 0
 * - draftYear === previous season → years_exp === 1
 * - draftYear === next season during off/pre/post → years_exp === 0 (post-NFL-draft)
 * - otherwise fall back to explicit `rookie_year` when present
 */
export function isSleeperRookieForDraftYear(
  player: SleeperPlayer,
  draftYear: number,
  nflSeason: number,
  previousSeason: number,
  seasonType: string,
): boolean {
  if (player.rookie_year !== undefined && String(player.rookie_year) === String(draftYear)) {
    return true;
  }

  const yearsExp = Number(player.years_exp);
  if (!Number.isFinite(yearsExp)) return false;

  if (draftYear === nflSeason) return yearsExp === 0;
  if (draftYear === previousSeason) return yearsExp === 1;

  const type = (seasonType || '').toLowerCase();
  const offseasonish = type === 'off' || type === 'pre' || type === 'post';
  if (draftYear === nflSeason + 1 && offseasonish) return yearsExp === 0;

  return false;
}

/**
 * Build a year-specific rookie + DEF pool from Sleeper.
 * Works for successive draft years (2026, 2027, 2028, …) without hardcoding.
 */
export async function buildSleeperRookieDefPool(year: number): Promise<SleeperPoolPlayer[]> {
  const seasonYear = Math.trunc(year);
  const [all, nflState] = await Promise.all([
    getAllPlayersCached(),
    getNFLState().catch(() => null),
  ]);

  const nflSeason = Number(nflState?.season) || seasonYear;
  const previousSeason = Number(nflState?.previous_season) || nflSeason - 1;
  const seasonType = String(nflState?.season_type || '');

  const rookies: SleeperPoolPlayer[] = [];
  const defenses: SleeperPoolPlayer[] = [];

  for (const player of Object.values(all) as SleeperPlayer[]) {
    if (!player?.player_id) continue;
    if (isInactive(player)) continue;

    const pos = (player.position || '').toUpperCase();
    if (pos === 'DEF') {
      defenses.push({
        id: player.player_id,
        name: playerName(player),
        pos: 'DEF',
        nfl: player.team || null,
        rank: null,
        meta: { college: player.college ?? null, rookieYear: String(seasonYear), source: 'sleeper' },
      });
      continue;
    }

    if (!SKILL_POSITIONS.has(pos)) continue;
    if (!isSleeperRookieForDraftYear(player, seasonYear, nflSeason, previousSeason, seasonType)) {
      continue;
    }
    // Keep the pool draftable: Active skill players currently on an NFL roster.
    // (Sleeper's feed includes many Inactive / unassigned historical stubs.)
    if ((player.status || '') !== 'Active') continue;
    if (!player.team) continue;

    rookies.push({      id: player.player_id,
      name: playerName(player),
      pos,
      nfl: player.team || null,
      rank: null,
      meta: {
        college: player.college ?? null,
        rookieYear: String(seasonYear),
        source: 'sleeper',
        yearsExp: Number.isFinite(Number(player.years_exp)) ? Number(player.years_exp) : null,
      },
    });
  }

  rookies.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos.localeCompare(b.pos);
    return a.name.localeCompare(b.name);
  });
  defenses.sort((a, b) => a.name.localeCompare(b.name));

  return [...rookies, ...defenses];
}

export function sleeperPoolLabel(year: number): string {
  return `${Math.trunc(year)} Rookies + DEF`;
}
