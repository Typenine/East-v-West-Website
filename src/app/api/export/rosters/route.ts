import { NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getTeamsData,
  getLeagueRosters,
  getAllPlayersCached,
  getPlayersPPRAndPPG,
  getSleeperInjuriesCached,
  resolveAvailabilityFromSleeper,
  getNFLState,
  type TeamData,
  type SleeperFetchOptions,
  type SleeperRoster,
  type SleeperPlayer,
  type SleeperInjury,
} from '@/lib/utils/sleeper-api';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function buildYearToLeagueMap(): Promise<Record<string, string | undefined>> {
  let seasonNum = new Date().getFullYear();
  try {
    const st = await getNFLState();
    const s = Number((st as { season?: string | number }).season ?? seasonNum);
    if (Number.isFinite(s)) seasonNum = s;
  } catch {}

  const map: Record<string, string | undefined> = {};
  // Current season
  map[String(seasonNum)] = LEAGUE_IDS.CURRENT;

  // Previous season (season - 1)
  const prevYear = String(seasonNum - 1);
  const prevId = (LEAGUE_IDS.PREVIOUS as Record<string, string | undefined>)[prevYear];
  if (prevId) map[prevYear] = prevId;

  // Optionally include older seasons from PREVIOUS without duplicating keys
  for (const [y, lid] of Object.entries(LEAGUE_IDS.PREVIOUS || {})) {
    if (map[y] === undefined) map[y] = lid;
  }

  return map;
}

export async function GET() {
  try {
    const yearToLeague = await buildYearToLeagueMap();
    const seasons = Object.keys(yearToLeague)
      .filter((season) => Boolean(yearToLeague[season]))
      .sort();

    const opts: SleeperFetchOptions = { timeoutMs: 15000 };

    // Lightweight player info map keyed by Sleeper player_id
    const allPlayers = await getAllPlayersCached().catch(
      () => ({} as Record<string, SleeperPlayer>),
    );
    const playerInfo: Record<string, {
      name: string;
      position: string | null;
      nflTeam: string | null;
      isDefense: boolean;
      yearsExp: number | null;
      rookieYear: string | number | null;
      age: number | null;
      birthDate: string | null;
    }> = {};

    const teamsBySeason: Record<string, Array<TeamData & {
      roster?: {
        starters: string[];
        bench: string[];
        ir: string[];
        taxi: string[];
      };
      meta?: {
        logoUrl?: string;
      };
    }>> = {};

    // Snapshot of current injury/availability state by player
    const injuries = await getSleeperInjuriesCached(5 * 60 * 1000, opts).catch(
      () => [] as SleeperInjury[],
    );
    const injuryByPlayerId = new Map<string, SleeperInjury>();
    for (const inj of injuries) {
      if (inj && typeof inj.player_id === 'string') {
        injuryByPlayerId.set(inj.player_id, inj);
      }
    }
    const playerAvailability: Record<string, { tier: string; reasons: string[]; injuryStatus: string | null }> = {};

    const playerIdsBySeason: Record<string, Set<string>> = {};

    for (const season of seasons) {
      const leagueId = yearToLeague[season];
      if (!leagueId) {
        teamsBySeason[season] = [];
        continue;
      }

      const teams = await getTeamsData(leagueId, opts).catch(
        () => [] as TeamData[],
      );
      const rosters = await getLeagueRosters(leagueId, opts).catch(
        () => [] as SleeperRoster[],
      );

      const rosterById = new Map<number, SleeperRoster>(
        rosters.map((r) => [r.roster_id, r] as const),
      );

      const seasonTeams: Array<TeamData & {
        roster?: {
          starters: string[];
          bench: string[];
          ir: string[];
          taxi: string[];
        };
        meta?: {
          logoUrl?: string;
        };
      }> = [];

      for (const team of teams) {
        const r = rosterById.get(team.rosterId);

        const starters: string[] = [];
        let bench: string[] = [];
        let ir: string[] = [];
        let taxi: string[] = [];

        if (r) {
          const all = Array.isArray(r.players) ? r.players : [];
          const irSet = new Set<string>(Array.isArray(r.reserve) ? r.reserve : []);
          const taxiSet = new Set<string>(Array.isArray(r.taxi) ? r.taxi : []);
          ir = Array.from(irSet);
          taxi = Array.from(taxiSet);
          const active = all.filter((pid) => !irSet.has(pid) && !taxiSet.has(pid));
          // Sleeper does not expose persistent starters vs bench; treat all active players as bench for this export.
          bench = active;
        } else if (Array.isArray(team.players)) {
          bench = team.players;
        }

        const allIds = new Set<string>([...starters, ...bench, ...ir, ...taxi]);
        // Track which players appear in which season so we can attach season-level stats
        let seasonSet = playerIdsBySeason[season];
        if (!seasonSet) {
          seasonSet = new Set<string>();
          playerIdsBySeason[season] = seasonSet;
        }
        for (const pid of allIds) {
          if (!pid || playerInfo[pid]) continue;
          const pl = allPlayers[pid];
          const fullName = pl ? `${pl.first_name || ''} ${pl.last_name || ''}`.trim() : '';
          const pos = pl?.position ?? null;
          const teamCode = pl?.team ?? null;
          const upPos = (pl?.position || '').toUpperCase();
          const isDefense = upPos === 'DEF' || upPos === 'DST';
          const yearsExp = typeof pl?.years_exp === 'number' ? pl.years_exp : null;
          const rookieYear = (pl?.rookie_year ?? null) as string | number | null;
          const anyPl = pl as unknown as { age?: number; birth_date?: string } | undefined;
          const age = typeof anyPl?.age === 'number' ? anyPl.age : null;
          const birthDate = typeof anyPl?.birth_date === 'string' ? anyPl.birth_date : null;
          const inj = injuryByPlayerId.get(pid);
          const availability = resolveAvailabilityFromSleeper(pl, inj);
          playerInfo[pid] = {
            name: fullName || pid,
            position: pos,
            nflTeam: teamCode,
            isDefense,
            yearsExp,
            rookieYear,
            age,
            birthDate,
          };
          playerAvailability[pid] = {
            tier: availability.tier,
            reasons: availability.reasons,
            injuryStatus: inj?.status ?? (pl?.status ?? null) ?? null,
          };
        }
        for (const pid of allIds) {
          if (!pid) continue;
          seasonSet.add(pid);
        }

        const meta = {
          logoUrl: getTeamLogoPath(team.teamName),
        };

        seasonTeams.push({
          ...team,
          roster: { starters, bench, ir, taxi },
          meta,
        });
      }

      teamsBySeason[season] = seasonTeams;
    }

    // Season-level fantasy stats (PPR totals, games, PPG) for players that
    // appear in our rosters, keyed by season then playerId.
    const playerSeasonStats: Record<string, Record<string, { totalPPR: number; gp: number; ppg: number }>> = {};
    for (const season of seasons) {
      const ids = playerIdsBySeason[season];
      if (!ids || !ids.size) {
        playerSeasonStats[season] = {};
        continue;
      }
      try {
        const stats = await getPlayersPPRAndPPG(
          season,
          Array.from(ids),
          opts,
        ).catch(
          () => ({} as Record<string, { totalPPR: number; gp: number; ppg: number }>),
        );
        playerSeasonStats[season] = stats;
      } catch {
        playerSeasonStats[season] = {};
      }
    }

    const body = {
      meta: {
        type: 'rosters-and-teams',
        version: 1,
        generatedAt: new Date().toISOString(),
        seasons,
      },
      teamsBySeason,
      playerInfo,
      playerAvailability,
      playerSeasonStats,
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="evw-rosters-and-teams.json"',
      },
    });
  } catch (err) {
    console.error('export/rosters GET error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
