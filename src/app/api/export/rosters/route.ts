import { NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getTeamsData,
  getLeagueRosters,
  getAllPlayersCached,
  type TeamData,
  type SleeperFetchOptions,
  type SleeperRoster,
  type SleeperPlayer,
} from '@/lib/utils/sleeper-api';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function buildYearToLeagueMap(): Record<string, string | undefined> {
  return {
    '2025': LEAGUE_IDS.CURRENT,
    ...LEAGUE_IDS.PREVIOUS,
  } as Record<string, string | undefined>;
}

export async function GET() {
  try {
    const yearToLeague = buildYearToLeagueMap();
    const seasons = Object.keys(yearToLeague)
      .filter((season) => Boolean(yearToLeague[season]))
      .sort();

    const opts: SleeperFetchOptions = { timeoutMs: 15000 };

    // Lightweight player info map keyed by Sleeper player_id
    const allPlayers = await getAllPlayersCached().catch(
      () => ({} as Record<string, SleeperPlayer>),
    );
    const playerInfo: Record<string, { name: string; position: string | null; nflTeam: string | null; isDefense: boolean }> = {};

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
        for (const pid of allIds) {
          if (!pid || playerInfo[pid]) continue;
          const pl = allPlayers[pid];
          const fullName = pl ? `${pl.first_name || ''} ${pl.last_name || ''}`.trim() : '';
          const pos = pl?.position ?? null;
          const teamCode = pl?.team ?? null;
          const upPos = (pl?.position || '').toUpperCase();
          const isDefense = upPos === 'DEF' || upPos === 'DST';
          playerInfo[pid] = {
            name: fullName || pid,
            position: pos,
            nflTeam: teamCode,
            isDefense,
          };
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

    const body = {
      meta: {
        type: 'rosters-and-teams',
        version: 1,
        generatedAt: new Date().toISOString(),
        seasons,
      },
      teamsBySeason,
      playerInfo,
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
