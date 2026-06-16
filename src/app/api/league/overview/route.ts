/**
 * GET /api/league/overview
 *
 * Returns a complete league snapshot with all 12 teams.
 * Intended to power league-wide UI widgets and dashboards.
 *
 * Query params:
 *   ?fresh=1   — bypass the in-memory cache and re-fetch from Sleeper
 *
 * Data sources (all via existing helpers to reuse caching logic):
 *   - getTeamsData          → current season record + canonical team names
 *   - getLeagueRosters      → active / taxi / IR player grouping
 *   - getAllPlayersCached    → player details (name, position, NFL team, status)
 *   - getSplitRecordsAllTime → all-time regular season + playoff records by owner
 *   - /league/{id}/traded_picks → future pick ownership state
 *   - CHAMPIONS constant    → championship / runner-up history
 */

import { NextResponse } from 'next/server';
import { CHAMPIONS, CURRENT_SEASON, LEAGUE_IDS } from '@/lib/constants/league';
import {
  getTeamsData,
  getLeagueRosters,
  getAllPlayersCached,
  getSplitRecordsAllTime,
  type TeamData,
  type SleeperRoster,
  type SleeperPlayer,
  type SplitRecord,
  type SleeperFetchOptions,
} from '@/lib/utils/sleeper-api';
import { getTeamLogoPath } from '@/lib/utils/team-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Response types ────────────────────────────────────────────────────────────

export interface OverviewPlayer {
  playerId: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
  injuryStatus: string | null;
  slot: 'active' | 'taxi' | 'ir';
}

export interface OverviewFuturePick {
  season: string;
  round: number;
  roundLabel: string;
  originalTeam: string;
  currentOwner: string;
  /** true when this pick originally belonged to a different team */
  traded: boolean;
  /** Human-readable label, e.g. "2027 1st from Belleview Badgers" */
  display: string;
}

export interface OverviewRecord {
  wins: number;
  losses: number;
  ties: number;
  pf: number;
  pa: number;
}

export interface OverviewPlayoffRecord {
  wins: number;
  losses: number;
  ties: number;
}

export interface OverviewChampEntry {
  year: number;
  finish: 'Champion' | 'Runner-up' | '3rd Place';
}

export interface OverviewTeam {
  rosterId: number;
  ownerId: string;
  teamName: string;
  logoUrl: string;
  /** Current-season record sourced from Sleeper roster settings */
  currentSeason: {
    season: string;
    record: OverviewRecord;
  };
  /**
   * All-time split records across all configured seasons.
   * null when the owner has no historical data yet.
   */
  allTime: {
    regularSeason: OverviewRecord;
    playoffs: OverviewPlayoffRecord;
  } | null;
  championships: number;
  champHistory: OverviewChampEntry[];
  roster: {
    active: OverviewPlayer[];
    taxi: OverviewPlayer[];
    ir: OverviewPlayer[];
  };
  /**
   * Future draft pick inventory.
   * owned  – picks currently held by this team (own + received via trade).
   * tradedAway – this team's original picks that were traded to another team.
   *
   * Note: only seasons/rounds where at least one pick has been traded are
   * included. Own picks for completely untouched (season × round) combos
   * are implicitly held and not enumerated.
   */
  futurePicks: {
    owned: OverviewFuturePick[];
    tradedAway: OverviewFuturePick[];
  };
}

export interface LeagueOverviewResponse {
  meta: {
    season: string;
    leagueId: string;
    teamCount: number;
    generatedAt: string;
  };
  teams: OverviewTeam[];
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

function toRoundLabel(round: number): string {
  const labels: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
  return labels[round] ?? `${round}th`;
}

function buildPlayer(
  pid: string,
  allPlayers: Record<string, SleeperPlayer>,
  slot: OverviewPlayer['slot'],
): OverviewPlayer {
  const p = allPlayers[pid] as SleeperPlayer | undefined;
  return {
    playerId: pid,
    name: p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || pid : pid,
    position: p?.position ?? null,
    nflTeam: p?.team ?? null,
    injuryStatus: p?.injury_status ?? p?.status ?? null,
    slot,
  };
}

function pickSortKey(a: OverviewFuturePick, b: OverviewFuturePick): number {
  return a.season.localeCompare(b.season) || a.round - b.round;
}

// ─── In-memory cache ───────────────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let overviewCache: { ts: number; data: LeagueOverviewResponse } | null = null;

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceFresh = url.searchParams.get('fresh') === '1';

  if (!forceFresh && overviewCache && Date.now() - overviewCache.ts < CACHE_TTL_MS) {
    return NextResponse.json(overviewCache.data, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'X-Cache': 'HIT',
      },
    });
  }

  try {
    const leagueId = LEAGUE_IDS.CURRENT;
    const opts: SleeperFetchOptions = { timeoutMs: 20000 };

    // ── Parallel fetch of all independent data sources ───────────────────────
    const [teams, rosters, allPlayers, splits] = await Promise.all([
      getTeamsData(leagueId, opts).catch((e) => {
        console.error('[league/overview] getTeamsData failed:', e);
        return [] as TeamData[];
      }),
      getLeagueRosters(leagueId, opts).catch((e) => {
        console.error('[league/overview] getLeagueRosters failed:', e);
        return [] as SleeperRoster[];
      }),
      getAllPlayersCached(undefined, opts).catch((e) => {
        console.error('[league/overview] getAllPlayersCached failed:', e);
        return {} as Record<string, SleeperPlayer>;
      }),
      getSplitRecordsAllTime(opts).catch((e) => {
        console.error('[league/overview] getSplitRecordsAllTime failed:', e);
        return {} as Record<
          string,
          { teamName: string; regular: SplitRecord; playoffs: SplitRecord; toilet: SplitRecord }
        >;
      }),
    ]);

    // ── Lookup maps ──────────────────────────────────────────────────────────
    const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));
    const rosterIdToTeam = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));

    // ── Future pick ownership via /league/{id}/traded_picks ──────────────────
    type TradedPickRaw = {
      season?: string | number;
      round?: number;
      roster_id?: number;
      owner_id?: number;
    };

    let tradedPicksRaw: TradedPickRaw[] = [];
    try {
      const resp = await fetch(
        `https://api.sleeper.app/v1/league/${leagueId}/traded_picks`,
        { cache: 'no-store', signal: AbortSignal.timeout(8000) },
      );
      if (resp.ok) tradedPicksRaw = (await resp.json()) as TradedPickRaw[];
    } catch (e) {
      console.warn('[league/overview] traded_picks fetch failed (non-fatal):', e);
    }

    const tradedPicks = tradedPicksRaw
      .map((tp) => ({
        season: String(tp.season ?? ''),
        round: Number(tp.round ?? 0),
        rosterId: Number(tp.roster_id ?? 0),  // original owner
        ownerId: Number(tp.owner_id ?? 0),    // current owner
      }))
      .filter((tp) => tp.season !== '' && tp.round > 0 && tp.rosterId > 0 && tp.ownerId > 0);

    // Index traded picks by (season-round-originalRosterId) → currentOwnerId
    const tradedPickMap = new Map<string, number>();
    const futureSeasonsSet = new Set<string>();
    const futureRoundsSet = new Set<number>();
    for (const tp of tradedPicks) {
      tradedPickMap.set(`${tp.season}-${tp.round}-${tp.rosterId}`, tp.ownerId);
      futureSeasonsSet.add(tp.season);
      futureRoundsSet.add(tp.round);
    }
    const futureSeasons = Array.from(futureSeasonsSet).sort();
    const futureRounds = Array.from(futureRoundsSet).sort((a, b) => a - b);

    // ── Pre-compute championship counts per team name ────────────────────────
    const champCountByTeam: Record<string, number> = {};
    for (const c of Object.values(CHAMPIONS)) {
      if (c.champion && c.champion !== 'TBD') {
        champCountByTeam[c.champion] = (champCountByTeam[c.champion] ?? 0) + 1;
      }
    }

    // ── Build one entry per team ─────────────────────────────────────────────
    const teamEntries: OverviewTeam[] = teams.map((team): OverviewTeam => {
      try {
        const r = rosterById.get(team.rosterId);

        // Current season record (already correctly computed in getTeamsData)
        const currentRecord: OverviewRecord = {
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          pf: Math.round(team.fpts * 100) / 100,
          pa: Math.round(team.fptsAgainst * 100) / 100,
        };

        // All-time splits keyed by ownerId
        const splitEntry = splits[team.ownerId];
        const allTime = splitEntry
          ? {
              regularSeason: {
                wins: splitEntry.regular.wins,
                losses: splitEntry.regular.losses,
                ties: splitEntry.regular.ties,
                pf: Math.round(splitEntry.regular.pf * 100) / 100,
                pa: Math.round(splitEntry.regular.pa * 100) / 100,
              },
              playoffs: {
                wins: splitEntry.playoffs.wins,
                losses: splitEntry.playoffs.losses,
                ties: splitEntry.playoffs.ties,
              },
            }
          : null;

        // Roster grouping: active / taxi / IR
        const irSet = new Set<string>(r?.reserve ?? []);
        const taxiSet = new Set<string>(r?.taxi ?? []);
        const allPids: string[] = r?.players ?? team.players ?? [];

        const active: OverviewPlayer[] = [];
        const taxi: OverviewPlayer[] = [];
        const ir: OverviewPlayer[] = [];

        for (const pid of allPids) {
          if (!pid) continue;
          if (irSet.has(pid)) {
            ir.push(buildPlayer(pid, allPlayers, 'ir'));
          } else if (taxiSet.has(pid)) {
            taxi.push(buildPlayer(pid, allPlayers, 'taxi'));
          } else {
            active.push(buildPlayer(pid, allPlayers, 'active'));
          }
        }

        // Championship history
        const champHistory: OverviewChampEntry[] = Object.entries(CHAMPIONS)
          .filter(([, c]) => {
            const e = c as { champion?: string; runnerUp?: string; thirdPlace?: string };
            return (
              e.champion === team.teamName ||
              e.runnerUp === team.teamName ||
              e.thirdPlace === team.teamName
            );
          })
          .map(([year, c]) => {
            const e = c as { champion?: string; runnerUp?: string; thirdPlace?: string };
            const finish: OverviewChampEntry['finish'] =
              e.champion === team.teamName
                ? 'Champion'
                : e.runnerUp === team.teamName
                ? 'Runner-up'
                : '3rd Place';
            return { year: Number(year), finish };
          })
          .sort((a, b) => a.year - b.year);

        // Future pick inventory
        const ownedPicks: OverviewFuturePick[] = [];
        const tradedAwayPicks: OverviewFuturePick[] = [];

        if (futureSeasons.length > 0) {
          // Pass 1: this team's original picks across all traded (season × round) combos
          for (const season of futureSeasons) {
            for (const round of futureRounds) {
              const key = `${season}-${round}-${team.rosterId}`;
              const currentOwnerId = tradedPickMap.get(key);
              const lbl = toRoundLabel(round);

              if (currentOwnerId === undefined || currentOwnerId === team.rosterId) {
                // Own pick — still held (never traded, or traded and returned)
                ownedPicks.push({
                  season,
                  round,
                  roundLabel: lbl,
                  originalTeam: team.teamName,
                  currentOwner: team.teamName,
                  traded: false,
                  display: `${season} ${lbl}`,
                });
              } else {
                // Traded away to another team
                const newOwner = rosterIdToTeam.get(currentOwnerId) ?? `Roster ${currentOwnerId}`;
                tradedAwayPicks.push({
                  season,
                  round,
                  roundLabel: lbl,
                  originalTeam: team.teamName,
                  currentOwner: newOwner,
                  traded: true,
                  display: `${season} ${lbl} → ${newOwner}`,
                });
              }
            }
          }

          // Pass 2: picks received from other teams (owner_id == this team, roster_id != this team)
          for (const tp of tradedPicks) {
            if (tp.ownerId === team.rosterId && tp.rosterId !== team.rosterId) {
              const origTeam = rosterIdToTeam.get(tp.rosterId) ?? `Roster ${tp.rosterId}`;
              const lbl = toRoundLabel(tp.round);
              ownedPicks.push({
                season: tp.season,
                round: tp.round,
                roundLabel: lbl,
                originalTeam: origTeam,
                currentOwner: team.teamName,
                traded: true,
                display: `${tp.season} ${lbl} from ${origTeam}`,
              });
            }
          }
        }

        ownedPicks.sort(pickSortKey);
        tradedAwayPicks.sort(pickSortKey);

        return {
          rosterId: team.rosterId,
          ownerId: team.ownerId,
          teamName: team.teamName,
          logoUrl: getTeamLogoPath(team.teamName),
          currentSeason: { season: CURRENT_SEASON, record: currentRecord },
          allTime,
          championships: champCountByTeam[team.teamName] ?? 0,
          champHistory,
          roster: { active, taxi, ir },
          futurePicks: { owned: ownedPicks, tradedAway: tradedAwayPicks },
        };
      } catch (teamErr) {
        // Isolate failures — return a minimal stub so one bad team does not
        // crash the entire response.
        console.error(`[league/overview] error building team "${team.teamName}":`, teamErr);
        return {
          rosterId: team.rosterId,
          ownerId: team.ownerId,
          teamName: team.teamName,
          logoUrl: getTeamLogoPath(team.teamName),
          currentSeason: {
            season: CURRENT_SEASON,
            record: {
              wins: team.wins,
              losses: team.losses,
              ties: team.ties,
              pf: Math.round(team.fpts * 100) / 100,
              pa: Math.round(team.fptsAgainst * 100) / 100,
            },
          },
          allTime: null,
          championships: 0,
          champHistory: [],
          roster: { active: [], taxi: [], ir: [] },
          futurePicks: { owned: [], tradedAway: [] },
        };
      }
    });

    // Sort by wins desc, then PF desc for a standings-style ordering
    teamEntries.sort((a, b) => {
      const wDiff = b.currentSeason.record.wins - a.currentSeason.record.wins;
      if (wDiff !== 0) return wDiff;
      return b.currentSeason.record.pf - a.currentSeason.record.pf;
    });

    const response: LeagueOverviewResponse = {
      meta: {
        season: CURRENT_SEASON,
        leagueId,
        teamCount: teamEntries.length,
        generatedAt: new Date().toISOString(),
      },
      teams: teamEntries,
    };

    overviewCache = { ts: Date.now(), data: response };

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    console.error('[league/overview] fatal error:', err);
    return NextResponse.json(
      { error: 'Failed to build league overview' },
      { status: 500 },
    );
  }
}
