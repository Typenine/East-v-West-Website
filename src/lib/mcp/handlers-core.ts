/**
 * MCP Tool Handlers
 *
 * Pure async functions — no HTTP, no NextResponse. Each handler accepts a
 * plain input object and returns a plain JSON-serialisable object. This lets
 * them be called from both:
 *   - The MCP HTTP transport endpoint (src/app/api/mcp/route.ts)
 *   - The individual REST routes (src/app/api/mcp/<tool>/route.ts) unchanged
 *
 * All data sourced from existing utilities; no new Sleeper API logic lives here.
 */

import { mcpMeta } from '@/lib/mcp/auth';
import { resolveTeam } from '@/lib/mcp/team-resolver';
import {
  LEAGUE_IDS,
  TEAM_NAMES,
  CHAMPIONS,
  IMPORTANT_DATES,
  CURRENT_SEASON,
} from '@/lib/constants/league';
import {
  getTeamsData,
  getLeagueRosters,
  getAllPlayersCached,
  getSplitRecordsAllTime,
  getNFLState,
  getLeagueMatchups,
  buildYearToLeagueMapUnique,
  getLeagueDrafts,
  getDraftPicks,
  type SleeperPlayer,
  type SleeperRoster,
  type SleeperMatchup,
  type SleeperDraftPick,
} from '@/lib/utils/sleeper-api';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { buildTransactionLedger } from '@/lib/utils/transactions';
import { fetchTradesAllTime, type Trade } from '@/lib/utils/trades';
import { senderOfAsset } from '@/lib/trades/asset-routing';
import { rulesHtmlSections } from '@/data/rules';
import { getTradeValues, resolveAssets, fuzzyFindValue } from '@/lib/trade-analyzer/values';
import {
  analyzeTrade,
  buildPosSummary,
  getDisplayValue,
  type ValueSource,
} from '@/lib/trade-analyzer/analysis';

// ─── shared helpers ────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|li|ul|ol|h[1-6]|div|br)[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join('\n');
}

const PARSED_RULES = rulesHtmlSections.map((s) => ({
  id: s.id,
  title: s.title,
  text: stripHtml(s.html),
}));

function champCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of Object.values(CHAMPIONS)) {
    if (c.champion && c.champion !== 'TBD') {
      counts[c.champion] = (counts[c.champion] ?? 0) + 1;
    }
  }
  return counts;
}

// ─── tool: get_league_info ─────────────────────────────────────────────────────

export async function handleGetLeagueInfo() {
  const seasons = [...Object.keys(LEAGUE_IDS.PREVIOUS), CURRENT_SEASON].sort();
  return {
    meta: mcpMeta('get_league_info', { dataSource: 'static-constants', seasons }),
    league: {
      name: 'East v. West Fantasy Football',
      format: 'Dynasty',
      scoring: '0.5 PPR SuperFlex',
      teamCount: TEAM_NAMES.length,
      teams: TEAM_NAMES,
      currentSeason: CURRENT_SEASON,
      seasons,
      champions: CHAMPIONS,
    },
    importantDates: {
      NFL_WEEK_1_START: IMPORTANT_DATES.NFL_WEEK_1_START.toISOString(),
      TRADE_DEADLINE: IMPORTANT_DATES.TRADE_DEADLINE.toISOString(),
      PLAYOFFS_START: IMPORTANT_DATES.PLAYOFFS_START.toISOString(),
      NEW_LEAGUE_YEAR: IMPORTANT_DATES.NEW_LEAGUE_YEAR.toISOString(),
      NEXT_DRAFT: IMPORTANT_DATES.NEXT_DRAFT.toISOString(),
    },
    structure: {
      regularSeasonWeeks: 14,
      playoffTeams: 7,
      toiletBowlTeams: 5,
      playoffStartWeek: 15,
      tradeDeadlineWeek: 12,
      rosterSize: 17,
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 1, K: 1, DST: 1 },
      benchSlots: 7,
      irSlots: 3,
      taxiSlots: 3,
    },
    payouts: {
      champion: 365,
      secondPlace: 180,
      thirdPlace: 105,
      regularSeasonWinner: 150,
      weeklyHighScore: 20,
      toiletBowlWinner: 20,
      mvp: 50,
      roy: 50,
      totalPrizePool: 1200,
    },
    scoringHighlights: {
      passingTD: 5, rushingTD: 6, receivingTD: 6,
      reception: 0.5, interception: -2, fumbleLost: -2,
    },
    rules: PARSED_RULES.map((s) => ({ id: s.id, title: s.title, text: s.text })),
  };
}

// ─── tool: get_current_standings ──────────────────────────────────────────────

export async function handleGetStandings() {
  const opts = { timeoutMs: 20000 };
  const [splits, rosters, teams] = await Promise.all([
    getSplitRecordsAllTime(opts),
    getLeagueRosters(LEAGUE_IDS.CURRENT, opts).catch(() => []),
    getTeamsData(LEAGUE_IDS.CURRENT, opts).catch(() => []),
  ]);

  const champs = champCounts();
  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));

  type CurrentRecord = { wins: number; losses: number; ties: number; pf: number; pa: number };
  const currentSeason: Record<string, CurrentRecord> = {};
  for (const r of rosters) {
    const name = rosterIdToName.get(r.roster_id) ?? `Roster ${r.roster_id}`;
    const s = r.settings as {
      wins?: number; losses?: number; ties?: number;
      fpts?: number; fpts_decimal?: number;
      fpts_against?: number; fpts_against_decimal?: number;
    } | undefined;
    if (!s) continue;
    const pf = (s.fpts ?? 0) + (s.fpts_decimal ?? 0) / 100;
    const pa = (s.fpts_against ?? 0) + (s.fpts_against_decimal ?? 0) / 100;
    currentSeason[name] = {
      wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0,
      pf: Math.round(pf * 100) / 100, pa: Math.round(pa * 100) / 100,
    };
  }

  const currentRows = Object.entries(currentSeason)
    .map(([team, rec]) => {
      const games = rec.wins + rec.losses + rec.ties;
      return {
        rank: 0, team,
        wins: rec.wins, losses: rec.losses, ties: rec.ties,
        pf: rec.pf, pa: rec.pa,
        avgPf: games > 0 ? Math.round((rec.pf / games) * 100) / 100 : 0,
        championships: champs[team] ?? 0,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.pf - a.pf);
  currentRows.forEach((r, i) => { r.rank = i + 1; });

  const allTimeRows = Object.entries(splits)
    .map(([, s]) => {
      const reg = s.regular;
      const games = reg.wins + reg.losses + reg.ties;
      return {
        rank: 0, team: s.teamName,
        wins: reg.wins, losses: reg.losses, ties: reg.ties,
        pf: Math.round(reg.pf * 100) / 100, pa: Math.round(reg.pa * 100) / 100,
        avgPf: games > 0 ? Math.round((reg.pf / games) * 100) / 100 : 0,
        championships: champs[s.teamName] ?? 0,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.pf - a.pf);
  allTimeRows.forEach((r, i) => { r.rank = i + 1; });

  return {
    meta: mcpMeta('get_standings', {
      currentSeason: CURRENT_SEASON,
      note: 'currentSeasonStandings = live Sleeper W/L. allTimeStandings = career record.',
      fetchedAt: new Date().toISOString(),
      cacheStatus: 'live',
    }),
    currentSeasonStandings: currentRows,
    allTimeStandings: allTimeRows,
    champions: CHAMPIONS,
  };
}

// ─── tool: get_team_dashboard ──────────────────────────────────────────────────

export async function handleGetTeam(input: { name?: string }) {
  const nameParam = (input.name ?? '').trim();
  if (!nameParam) throw new McpError('missing_param', 'Provide a team name');

  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 18000 };

  const [teams, rosters, allPlayers, splits] = await Promise.all([
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getSplitRecordsAllTime(opts).catch(() => ({} as Record<string, {
      teamName: string;
      regular: { wins: number; losses: number; ties: number; pf: number; pa: number };
      playoffs: { wins: number; losses: number; ties: number; pf: number; pa: number };
      toilet: { wins: number; losses: number; ties: number; pf: number; pa: number };
    }>)),
  ]);

  const resolution = resolveTeam(nameParam, teams.map((t) => t.teamName));
  if (!resolution.matchedTeam) {
    const hint = resolution.candidates.length > 1
      ? `Multiple partial matches: ${resolution.candidates.join(', ')}. Be more specific.`
      : `Available teams: ${teams.map((t) => t.teamName).sort().join(', ')}`;
    throw new McpError('not_found', `No team matching "${input.name}". ${hint}`);
  }
  const team = teams.find((t) => t.teamName === resolution.matchedTeam)!;

  const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));
  const r = rosterById.get(team.rosterId);
  const irSet = new Set<string>(r?.reserve ?? []);
  const taxiSet = new Set<string>(r?.taxi ?? []);
  const allPlayerIds: string[] = r?.players ?? team.players ?? [];

  const players = allPlayerIds.filter(Boolean).map((pid) => {
    const p = allPlayers[pid] as SleeperPlayer | undefined;
    return {
      id: pid,
      name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() : pid,
      position: p?.position ?? null,
      nflTeam: p?.team ?? null,
      status: p?.injury_status ?? p?.status ?? null,
      slot: irSet.has(pid) ? 'ir' : taxiSet.has(pid) ? 'taxi' : 'active',
    };
  });

  const rs = r?.settings as {
    wins?: number; losses?: number; ties?: number;
    fpts?: number; fpts_decimal?: number;
    fpts_against?: number; fpts_against_decimal?: number;
  } | undefined;
  const pf = rs ? (rs.fpts ?? 0) + (rs.fpts_decimal ?? 0) / 100 : 0;
  const pa = rs ? (rs.fpts_against ?? 0) + (rs.fpts_against_decimal ?? 0) / 100 : 0;

  const splitEntry = Object.values(splits).find(
    (s) => s.teamName.toLowerCase() === team.teamName.toLowerCase(),
  );

  const champHistory = Object.entries(CHAMPIONS)
    .filter(([, c]) =>
      c.champion === team.teamName ||
      c.runnerUp === team.teamName ||
      (c as { thirdPlace?: string }).thirdPlace === team.teamName,
    )
    .map(([year, c]) => ({
      year: Number(year),
      finish: c.champion === team.teamName ? '1st (Champion)'
        : c.runnerUp === team.teamName ? '2nd (Runner-up)' : '3rd Place',
    }))
    .sort((a, b) => a.year - b.year);

  return {
    meta: mcpMeta('get_team', { team: team.teamName, dataSource: 'sleeper-live + static', cacheStatus: 'live', fetchedAt: new Date().toISOString() }),
    matchResolution: { requestedTeam: nameParam, matchedTeam: resolution.matchedTeam, confidence: resolution.confidence },
    team: {
      name: team.teamName,
      logoUrl: getTeamLogoPath(team.teamName),
      rosterId: team.rosterId,
      currentRecord: {
        season: CURRENT_SEASON,
        wins: rs?.wins ?? 0, losses: rs?.losses ?? 0, ties: rs?.ties ?? 0,
        pf: Math.round(pf * 100) / 100, pa: Math.round(pa * 100) / 100,
      },
      allTimeStats: splitEntry ? {
        regularSeason: {
          wins: splitEntry.regular.wins, losses: splitEntry.regular.losses,
          pf: Math.round(splitEntry.regular.pf * 100) / 100,
          pa: Math.round(splitEntry.regular.pa * 100) / 100,
        },
        playoffs: { wins: splitEntry.playoffs.wins, losses: splitEntry.playoffs.losses },
      } : null,
      championships: champHistory.filter((c) => c.finish.startsWith('1st')).length,
      championshipHistory: champHistory,
    },
    roster: {
      active: players.filter((p) => p.slot === 'active'),
      ir: players.filter((p) => p.slot === 'ir'),
      taxi: players.filter((p) => p.slot === 'taxi'),
    },
  };
}

// ─── tool: get_current_roster ─────────────────────────────────────────────────

export async function handleGetRosters(input: { team?: string }) {
  const teamFilter = (input.team ?? '').trim();
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };

  const [teams, rosters, allPlayers] = await Promise.all([
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
  ]);

  const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));

  let resolvedRosterTeam: string | null = null;
  if (teamFilter) {
    const res = resolveTeam(teamFilter, teams.map((t) => t.teamName));
    resolvedRosterTeam = res.matchedTeam;
  }

  const result = [];
  for (const team of teams) {
    if (resolvedRosterTeam !== null) {
      if (team.teamName !== resolvedRosterTeam) continue;
    } else if (teamFilter && !team.teamName.toLowerCase().includes(teamFilter)) continue;
    const r = rosterById.get(team.rosterId);
    const irSet = new Set<string>(r?.reserve ?? []);
    const taxiSet = new Set<string>(r?.taxi ?? []);
    const allIds: string[] = r?.players ?? team.players ?? [];

    const players = allIds.filter(Boolean).map((pid) => {
      const p = allPlayers[pid] as SleeperPlayer | undefined;
      return {
        id: pid,
        name: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || pid : pid,
        position: p?.position ?? null,
        nflTeam: p?.team ?? null,
        status: p?.injury_status ?? p?.status ?? null,
        slot: irSet.has(pid) ? 'ir' : taxiSet.has(pid) ? 'taxi' : 'active',
      };
    });

    const s = r?.settings as { wins?: number; losses?: number; ties?: number } | undefined;
    result.push({
      team: team.teamName,
      logoUrl: getTeamLogoPath(team.teamName),
      rosterId: team.rosterId,
      record: s ? { wins: s.wins ?? 0, losses: s.losses ?? 0, ties: s.ties ?? 0 } : null,
      players,
    });
  }
  result.sort((a, b) => a.team.localeCompare(b.team));

  return {
    meta: mcpMeta('get_rosters', { leagueId, teamCount: result.length, teamFilter: resolvedRosterTeam ?? (teamFilter || null), fetchedAt: new Date().toISOString(), cacheStatus: 'live' }),
    rosters: result,
  };
}

// ─── tool: search_players / get_player_info ────────────────────────────────────

export async function handleGetPlayer(input: { id?: string; name?: string; limit?: number }) {
  if (!input.id && !input.name) {
    throw new McpError('missing_param', 'Provide id or name');
  }
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 12000 };

  const [allPlayers, rosters, teams] = await Promise.all([
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getLeagueRosters(leagueId, opts).catch(() => []),
    getTeamsData(leagueId, opts).catch(() => []),
  ]);

  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));
  const playerToTeam = new Map<string, string>();
  for (const r of rosters) {
    const teamName = rosterIdToName.get(r.roster_id) ?? `Roster ${r.roster_id}`;
    for (const pid of [...(r.players ?? []), ...(r.reserve ?? []), ...(r.taxi ?? [])]) {
      if (pid) playerToTeam.set(pid, teamName);
    }
  }

  function fmt(id: string, p: SleeperPlayer) {
    return {
      id,
      name: `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      position: p.position ?? null,
      nflTeam: p.team ?? null,
      status: p.injury_status ?? p.status ?? null,
      yearsExp: typeof p.years_exp === 'number' ? p.years_exp : null,
      fantasyOwner: playerToTeam.get(id) ?? null,
    };
  }

  if (input.id) {
    const p = allPlayers[input.id] as SleeperPlayer | undefined;
    if (!p) throw new McpError('not_found', `Player ID ${input.id} not found`);
    return { meta: mcpMeta('get_player', { lookupType: 'id' }), player: fmt(input.id, p) };
  }

  const nameParam = input.name!.toLowerCase();
  const limit = Math.min(input.limit ?? 5, 20);
  const matches: ReturnType<typeof fmt>[] = [];

  for (const [id, p] of Object.entries(allPlayers as Record<string, SleeperPlayer>)) {
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim().toLowerCase();
    if (fullName.includes(nameParam)) matches.push(fmt(id, p as SleeperPlayer));
  }

  matches.sort((a, b) => {
    const aS = a.name.toLowerCase().startsWith(nameParam) ? 0 : 1;
    const bS = b.name.toLowerCase().startsWith(nameParam) ? 0 : 1;
    if (aS !== bS) return aS - bS;
    return (a.fantasyOwner ? 0 : 1) - (b.fantasyOwner ? 0 : 1) || a.name.localeCompare(b.name);
  });

  return {
    meta: mcpMeta('get_player', { lookupType: 'name_search', query: nameParam, totalMatches: matches.length }),
    players: matches.slice(0, limit),
  };
}

// ─── tool: get_current_matchups ────────────────────────────────────────────────

export async function handleGetMatchups(input: { week?: number }) {
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 10000 };

  let week = input.week && input.week >= 1 ? input.week : 0;
  let seasonType = 'unknown';
  let nflSeason = '';

  if (!week) {
    try {
      const state = await getNFLState(undefined, opts);
      week = Number(state?.week ?? 1);
      seasonType = (state as { season_type?: string }).season_type ?? 'unknown';
      nflSeason = String((state as { season?: string | number }).season ?? '');
    } catch { week = 1; }
  }

  const [matchups, teams] = await Promise.all([
    getLeagueMatchups(leagueId, week, opts).catch(() => [] as SleeperMatchup[]),
    getTeamsData(leagueId, opts).catch(() => []),
  ]);

  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    const arr = byId.get(m.matchup_id) ?? [];
    arr.push(m);
    byId.set(m.matchup_id, arr);
  }

  const result = [];
  for (const [matchupId, pair] of byId.entries()) {
    if (pair.length < 2) continue;
    const [a, b] = pair;
    const aPts = Number(a.custom_points ?? a.points ?? 0);
    const bPts = Number(b.custom_points ?? b.points ?? 0);
    result.push({
      matchupId,
      home: { team: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`, points: Math.round(bPts * 100) / 100 },
      away: { team: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`, points: Math.round(aPts * 100) / 100 },
      played: aPts > 0 || bPts > 0,
    });
  }
  result.sort((a, b) => a.matchupId - b.matchupId);

  return {
    meta: mcpMeta('get_matchups', { leagueId, week, nflSeason, seasonType, fetchedAt: new Date().toISOString(), cacheStatus: 'live' }),
    week,
    matchups: result,
  };
}

// ─── tool: get_recent_transactions ────────────────────────────────────────────

export async function handleGetTransactions(input: { limit?: number; team?: string; season?: string }) {
  const MAX = 100;
  const limit = Math.min(Math.max(1, input.limit ?? 25), MAX);
  const teamFilter = (input.team ?? '').trim();
  const seasonFilter = (input.season ?? '').trim();

  const ledger = await buildTransactionLedger();
  let filtered = ledger;
  if (seasonFilter) filtered = filtered.filter((t) => t.season === seasonFilter);
  if (teamFilter) {
    const allTeamNames = [...new Set(ledger.map((t) => t.team))];
    const res = resolveTeam(teamFilter, allTeamNames.length > 0 ? allTeamNames : [...TEAM_NAMES]);
    const matchedTeam = res.matchedTeam;
    filtered = filtered.filter((t) =>
      matchedTeam ? t.team === matchedTeam : t.team.toLowerCase().includes(teamFilter.toLowerCase())
    );
  }

  const page = [...filtered].sort((a, b) => b.created - a.created).slice(0, limit);
  const slim = page.map((t) => ({
    id: t.id, season: t.season, week: t.week, team: t.team, type: t.type, faab: t.faab,
    added: t.added.map((p) => ({ name: p.name ?? p.playerId })),
    dropped: t.dropped.map((p) => ({ name: p.name ?? p.playerId })),
    createdAt: new Date(t.created).toISOString(),
  }));

  return {
    meta: mcpMeta('get_transactions', { totalMatched: filtered.length, returned: slim.length, limit, teamFilter: teamFilter || null, fetchedAt: new Date().toISOString() }),
    transactions: slim,
  };
}

// ─── tool: get_trade_history ───────────────────────────────────────────────────

/**
 * Slim a trade's teams for LLM consumption. On multi-team trades each asset
 * carries explicit sender attribution (players get `from`, pick names get a
 * "(from X)" suffix) — without it a bot can't tell which team sent which piece.
 */
export function slimTradeTeams(t: Trade) {
  const multiTeam = t.teams.length > 2;
  return t.teams.map((side) => ({
    name: side.name,
    received: side.assets
      .filter((a) => a.type === 'player')
      .map((a) => {
        const from = multiTeam ? senderOfAsset(t, side.name, a) : null;
        return { name: a.name, position: a.position ?? null, ...(from ? { from } : {}) };
      }),
    picks: side.assets
      .filter((a) => a.type === 'pick')
      .map((a) => {
        const from = multiTeam ? senderOfAsset(t, side.name, a) : null;
        return from ? `${a.name} (from ${from})` : a.name;
      }),
  }));
}

export async function handleGetTrades(input: { team?: string; season?: string; limit?: number }) {
  const limit = Math.min(Math.max(1, input.limit ?? 20), 50);
  const teamFilter = (input.team ?? '').trim();
  const seasonFilter = (input.season ?? '').trim();

  const allTrades = await fetchTradesAllTime();
  let filtered = allTrades;
  if (seasonFilter) filtered = filtered.filter((t) => String(t.season) === seasonFilter);
  if (teamFilter) {
    const allTeamNames = [...new Set(allTrades.flatMap((t) => t.teams.map((s) => s.name)))];
    const res = resolveTeam(teamFilter, allTeamNames.length > 0 ? allTeamNames : [...TEAM_NAMES]);
    const matchedTeam = res.matchedTeam;
    filtered = filtered.filter((t) =>
      matchedTeam
        ? t.teams.some((s) => s.name === matchedTeam)
        : t.teams.some((s) => s.name.toLowerCase().includes(teamFilter.toLowerCase()))
    );
  }

  const sorted = [...filtered].sort((a, b) => {
    const ta = typeof a.created === 'number' ? a.created : Date.parse(a.date ?? '0');
    const tb = typeof b.created === 'number' ? b.created : Date.parse(b.date ?? '0');
    return tb - ta;
  });

  const page = sorted.slice(0, limit).map((t) => ({
    id: t.id, season: t.season ?? null, week: t.week ?? null, date: t.date,
    teams: slimTradeTeams(t),
  }));

  return {
    meta: mcpMeta('get_trades', { totalMatched: filtered.length, returned: page.length, limit, teamFilter: teamFilter || null, fetchedAt: new Date().toISOString() }),
    trades: page,
  };
}

// ─── tool: get_draft_history / get_draft_picks ────────────────────────────────

export async function handleGetDrafts(input: { season?: string; team?: string; type?: string }) {
  const seasonFilter = (input.season ?? '').trim();
  const teamRaw = (input.team ?? '').trim();
  const typeFilter = (input.type ?? '').toLowerCase().trim();
  const opts = { timeoutMs: 20000 };

  let resolvedDraftTeam: string | null = null;
  let teamFilter = teamRaw.toLowerCase();
  if (teamRaw) {
    const res = resolveTeam(teamRaw, [...TEAM_NAMES]);
    if (res.matchedTeam) {
      resolvedDraftTeam = res.matchedTeam;
      teamFilter = res.matchedTeam.toLowerCase();
    }
  }

  const yearToLeague = await buildYearToLeagueMapUnique(opts);
  const seasons = Object.keys(yearToLeague).filter((y) => !seasonFilter || y === seasonFilter).sort();
  const players = await getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>));

  type PickRow = { season: string; round: number; pick: number; team: string; player: string | null; position: string | null };
  const historyBySeason: Record<string, PickRow[]> = {};

  if (typeFilter !== 'future') {
    for (const season of seasons) {
      const leagueId = yearToLeague[season];
      if (!leagueId) continue;
      const [drafts, teams] = await Promise.all([
        getLeagueDrafts(leagueId, opts).catch(() => []),
        getTeamsData(leagueId, opts).catch(() => []),
      ]);
      const draft = drafts.find((d) => d.season === season) ?? drafts[0];
      if (!draft) continue;
      const picks = await getDraftPicks(draft.draft_id, opts).catch(() => [] as SleeperDraftPick[]);
      const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));

      const rows: PickRow[] = picks.reduce<PickRow[]>((acc, p) => {
        const pl = p.player_id ? (players[p.player_id] as SleeperPlayer | undefined) : undefined;
        const teamName = rosterIdToName.get(p.roster_id as number) ?? `Roster ${p.roster_id}`;
        if (teamFilter && !teamName.toLowerCase().includes(teamFilter)) return acc;
        acc.push({
          season, round: Number(p.round), pick: Number(p.draft_slot ?? p.pick_no ?? 0),
          team: teamName,
          player: pl ? `${pl.first_name || ''} ${pl.last_name || ''}`.trim() || null : null,
          position: pl?.position ?? null,
        });
        return acc;
      }, []).sort((a, b) => a.round - b.round || a.pick - b.pick);

      if (rows.length) historyBySeason[season] = rows;
    }
  }

  type FuturePickRow = { season: string; round: number; originalTeam: string; currentOwner: string; traded: boolean };
  const futurePicks: FuturePickRow[] = [];

  if (typeFilter !== 'history') {
    try {
      const resp = await fetch(
        `https://api.sleeper.app/v1/league/${LEAGUE_IDS.CURRENT}/traded_picks`,
        { cache: 'no-store', signal: AbortSignal.timeout(8000) },
      );
      const currentTeams = await getTeamsData(LEAGUE_IDS.CURRENT, opts).catch(() => []);
      const rosterIdToName = new Map<number, string>(currentTeams.map((t) => [t.rosterId, t.teamName]));
      type TP = { season?: string | number; round?: number; roster_id?: number; owner_id?: number };
      const tradedPicks: TP[] = resp.ok ? ((await resp.json()) as TP[]) : [];
      for (const tp of tradedPicks) {
        const season = String(tp.season ?? '');
        if (seasonFilter && season !== seasonFilter) continue;
        const origTeam = rosterIdToName.get(Number(tp.roster_id)) ?? `Roster ${tp.roster_id}`;
        const ownerTeam = rosterIdToName.get(Number(tp.owner_id)) ?? `Roster ${tp.owner_id}`;
        if (teamFilter && !origTeam.toLowerCase().includes(teamFilter) && !ownerTeam.toLowerCase().includes(teamFilter)) continue;
        futurePicks.push({ season, round: Number(tp.round ?? 0), originalTeam: origTeam, currentOwner: ownerTeam, traded: origTeam !== ownerTeam });
      }
      futurePicks.sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round);
    } catch { /* best effort */ }
  }

  return {
    meta: mcpMeta('get_drafts', { seasonsQueried: seasons, filters: { season: seasonFilter || null, team: resolvedDraftTeam ?? (teamRaw || null) }, fetchedAt: new Date().toISOString() }),
    historicalPicks: historyBySeason,
    futurePickOwnership: futurePicks,
  };
}

// ─── tool: get_franchise_summary ──────────────────────────────────────────────

export async function handleGetFranchise(input: { team?: string }) {
  const teamRaw = (input.team ?? '').trim();
  const splits = await getSplitRecordsAllTime({ timeoutMs: 20000 });
  const champs = champCounts();
  const runnerUps: Record<string, number> = {};
  for (const c of Object.values(CHAMPIONS)) {
    if (c.runnerUp && c.runnerUp !== 'TBD') runnerUps[c.runnerUp] = (runnerUps[c.runnerUp] ?? 0) + 1;
  }

  let teamFilter = teamRaw.toLowerCase();
  if (teamRaw) {
    const splitTeamNames = Object.values(splits).map((s) => s.teamName);
    const res = resolveTeam(teamRaw, splitTeamNames);
    if (res.matchedTeam) teamFilter = res.matchedTeam.toLowerCase();
  }

  const franchises = Object.entries(splits)
    .filter(([, s]) => !teamFilter || s.teamName.toLowerCase().includes(teamFilter))
    .map(([, s]) => {
      const reg = s.regular;
      const plo = s.playoffs;
      const regG = reg.wins + reg.losses + reg.ties;
      const ploG = plo.wins + plo.losses + plo.ties;
      return {
        team: s.teamName,
        regularSeason: {
          wins: reg.wins, losses: reg.losses, ties: reg.ties,
          winPct: regG > 0 ? Math.round((reg.wins / regG) * 1000) / 10 : 0,
          pf: Math.round(reg.pf * 100) / 100, pa: Math.round(reg.pa * 100) / 100,
          avgPf: regG > 0 ? Math.round((reg.pf / regG) * 100) / 100 : 0,
        },
        playoffs: {
          wins: plo.wins, losses: plo.losses,
          winPct: ploG > 0 ? Math.round((plo.wins / ploG) * 1000) / 10 : 0,
        },
        championships: champs[s.teamName] ?? 0,
        runnerUps: runnerUps[s.teamName] ?? 0,
      };
    })
    .sort((a, b) => b.championships - a.championships || b.regularSeason.winPct - a.regularSeason.winPct);

  return {
    meta: mcpMeta('get_franchise', { teamCount: franchises.length, teamFilter: teamRaw || null, fetchedAt: new Date().toISOString() }),
    franchises,
  };
}

// ─── tool: answer_rule_question ────────────────────────────────────────────────

export async function handleGetRules(input: { search?: string; section?: string }) {
  const searchRaw = (input.search ?? '').trim().toLowerCase();
  const sectionId = (input.section ?? '').trim().toLowerCase();

  if (sectionId) {
    const found = PARSED_RULES.find((s) => s.id.toLowerCase() === sectionId);
    if (!found) {
      return {
        error: 'section_not_found',
        availableSections: PARSED_RULES.map((s) => ({ id: s.id, title: s.title })),
      };
    }
    return { meta: mcpMeta('get_rules', { lookup: 'section', sectionId, fetchedAt: new Date().toISOString(), cacheStatus: 'static' }), section: found };
  }

  const results = searchRaw
    ? PARSED_RULES.filter((s) => s.title.toLowerCase().includes(searchRaw) || s.text.toLowerCase().includes(searchRaw))
    : PARSED_RULES;

  const sections = results.map((s) => {
    if (!searchRaw) return s;
    return { ...s, matchingLines: s.text.split('\n').filter((l) => l.toLowerCase().includes(searchRaw)) };
  });

  return {
    meta: mcpMeta('get_rules', { search: searchRaw || null, matchedSections: sections.length, totalSections: PARSED_RULES.length, fetchedAt: new Date().toISOString(), cacheStatus: 'static' }),
    sections,
  };
}

// ─── tool: get_weekly_content_context ─────────────────────────────────────────
// Returns everything a content writer or bot needs to write weekly content:
// matchups, standings with PF/PA/avg, recent trades, recent waiver moves,
// injury flags, playoff race snapshot, suggested storylines and headlines,
// franchise championship hooks, and missing-data notes.
// All data is live from Sleeper — no new API calls beyond existing utilities.

export async function handleGetWeeklyContext() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };

  let week = 1;
  let seasonType = 'unknown';
  let nflSeason = '';
  try {
    const state = await getNFLState(undefined, opts);
    week = Number(state?.week ?? 1);
    seasonType = (state as { season_type?: string }).season_type ?? 'unknown';
    nflSeason = String((state as { season?: string | number }).season ?? '');
  } catch { /* use defaults */ }

  const season = nflSeason || CURRENT_SEASON;

  // Parallel fetches — all best-effort
  const [matchupSlots, teams, rosters, allPlayers, ledger, allTrades] = await Promise.all([
    getLeagueMatchups(leagueId, week, opts).catch(() => [] as SleeperMatchup[]),
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => []),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    buildTransactionLedger().catch(() => []),
    fetchTradesAllTime().catch(() => []),
  ]);

  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));
  const missingData: string[] = [];

  // ── Matchups ─────────────────────────────────────────────────────────────────
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchupSlots) {
    const arr = byId.get(m.matchup_id) ?? [];
    arr.push(m);
    byId.set(m.matchup_id, arr);
  }
  const weekMatchups: Array<{
    matchupId: number;
    away: { team: string; points: number };
    home: { team: string; points: number };
    status: 'upcoming' | 'live' | 'final';
    spread: number | null;
    storyHook: string | null;
  }> = [];

  for (const [matchupId, pair] of byId.entries()) {
    if (pair.length < 2) continue;
    const [a, b] = pair;
    const aPts = Math.round(Number(a.custom_points ?? a.points ?? 0) * 100) / 100;
    const bPts = Math.round(Number(b.custom_points ?? b.points ?? 0) * 100) / 100;
    const status: 'upcoming' | 'live' | 'final' =
      aPts === 0 && bPts === 0 ? 'upcoming' : 'live';
    const spread = aPts > 0 || bPts > 0 ? Math.abs(aPts - bPts) : null;
    weekMatchups.push({
      matchupId,
      away: { team: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`, points: aPts },
      home: { team: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`, points: bPts },
      status,
      spread,
      storyHook: null, // filled below
    });
  }
  weekMatchups.sort((a, b) => a.matchupId - b.matchupId);
  if (matchupSlots.length === 0) missingData.push('Current-week matchup data not available.');

  // ── Standings (with PA and avg PF) ───────────────────────────────────────────
  const champs = champCounts();
  type StandingRow = {
    rank: number; team: string; wins: number; losses: number; ties: number;
    pf: number; pa: number; avgPf: number; championships: number; isChampion: boolean;
  };
  const standings: StandingRow[] = rosters
    .map((r) => {
      const name = rosterIdToName.get(r.roster_id) ?? `Roster ${r.roster_id}`;
      const s = r.settings as {
        wins?: number; losses?: number; ties?: number;
        fpts?: number; fpts_decimal?: number;
        fpts_against?: number; fpts_against_decimal?: number;
      } | undefined;
      const pf = (s?.fpts ?? 0) + (s?.fpts_decimal ?? 0) / 100;
      const pa = (s?.fpts_against ?? 0) + (s?.fpts_against_decimal ?? 0) / 100;
      const gp = (s?.wins ?? 0) + (s?.losses ?? 0) + (s?.ties ?? 0);
      return {
        team: name,
        wins: s?.wins ?? 0, losses: s?.losses ?? 0, ties: s?.ties ?? 0,
        pf: Math.round(pf * 100) / 100,
        pa: Math.round(pa * 100) / 100,
        avgPf: gp > 0 ? Math.round((pf / gp) * 100) / 100 : 0,
        championships: champs[name] ?? 0,
        isChampion: (champs[name] ?? 0) > 0,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.pf - a.pf)
    .map((r, i) => ({ rank: i + 1, ...r }));

  if (rosters.length === 0) missingData.push('Standings data not available.');

  // ── Playoff race ─────────────────────────────────────────────────────────────
  const totalTeams = standings.length;
  const playoffSpots = totalTeams >= 10 ? 6 : 4; // standard league defaults
  const inPlayoffs = standings.filter((s) => s.rank <= playoffSpots);
  const onBubble = standings.filter((s) => s.rank > playoffSpots && s.rank <= playoffSpots + 2);
  const eliminated = standings.filter((s) => s.rank > playoffSpots + 2 && week >= 12);
  const lastInSpot = standings[playoffSpots - 1] ?? null;
  const firstOut = standings[playoffSpots] ?? null;
  const bubbleGap = lastInSpot && firstOut
    ? { wins: lastInSpot.wins - firstOut.wins, pf: Math.round((lastInSpot.pf - firstOut.pf) * 100) / 100 }
    : null;

  const playoffRace = {
    playoffSpots,
    inPlayoffs: inPlayoffs.map((s) => ({ team: s.team, rank: s.rank, wins: s.wins, losses: s.losses })),
    onBubble: onBubble.map((s) => ({ team: s.team, rank: s.rank, wins: s.wins, losses: s.losses })),
    eliminated: eliminated.map((s) => s.team),
    bubbleGap,
    clinchNote: week >= 13 ? 'Playoff seeding may be near-final.' : null,
  };

  // ── Recent trades (current season, last 5) ───────────────────────────────────
  const recentTrades = [...allTrades]
    .filter((t) => !season || String(t.season) === season)
    .sort((a, b) => {
      const ta = typeof a.created === 'number' ? a.created : Date.parse(a.date ?? '0');
      const tb = typeof b.created === 'number' ? b.created : Date.parse(b.date ?? '0');
      return tb - ta;
    })
    .slice(0, 5)
    .map((t) => ({
      week: t.week ?? null,
      teams: slimTradeTeams(t),
    }));

  // ── Recent waiver/FA moves (current season, last 8) ──────────────────────────
  const recentWaivers = [...ledger]
    .filter((t) => !season || t.season === season)
    .sort((a, b) => b.created - a.created)
    .slice(0, 8)
    .map((t) => ({
      team: t.team, type: t.type, week: t.week, faab: t.faab ?? null,
      added: t.added.map((p) => p.name ?? p.playerId),
      dropped: t.dropped.map((p) => p.name ?? p.playerId),
    }));

  if (ledger.length === 0) missingData.push('Transaction history not available.');

  // ── Injury/notable context (non-Active players on active rosters) ─────────────
  type InjuryNote = { team: string; player: string; position: string | null; status: string };
  const injuries: InjuryNote[] = [];
  for (const roster of rosters) {
    const teamName = rosterIdToName.get(roster.roster_id) ?? `Roster ${roster.roster_id}`;
    const playerIds: string[] = (roster as unknown as { players?: string[] }).players ?? [];
    for (const pid of playerIds.slice(0, 30)) { // cap scan per team
      const pl = allPlayers[pid];
      if (!pl) continue;
      const status = pl.injury_status ?? pl.status ?? '';
      if (status && status !== 'Active' && status !== 'ACT') {
        injuries.push({
          team: teamName,
          player: `${pl.first_name || ''} ${pl.last_name || ''}`.trim(),
          position: pl.position ?? null,
          status,
        });
      }
    }
  }
  if (allPlayers && Object.keys(allPlayers).length === 0) missingData.push('Player database not available for injury context.');

  // ── Suggested storylines (computed from data, not invented) ──────────────────
  const storylines: string[] = [];

  if (standings.length > 0) {
    const leader = standings[0];
    storylines.push(`${leader.team} leads the league at ${leader.wins}-${leader.losses} — are they pulling away or is the field closing?`);
  }
  if (bubbleGap) {
    const lastIn = lastInSpot!;
    const firstO = firstOut!;
    const gapDesc = bubbleGap.wins === 0
      ? `tied in wins but separated by ${bubbleGap.pf} PF`
      : `${bubbleGap.wins} win(s) apart`;
    storylines.push(`Playoff bubble: ${lastIn.team} (last in at #${lastIn.rank}) vs. ${firstO.team} (first out at #${firstO.rank}) — ${gapDesc}.`);
  }
  if (recentTrades.length > 0) {
    const t = recentTrades[0];
    const names = t.teams.map((side) => side.name);
    const partners = names.length > 2
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names.join(' and ');
    const label = names.length > 2 ? `pulled off a ${names.length}-team trade` : 'made a deal';
    storylines.push(`Trade alert: ${partners} ${label}${t.week ? ` in Week ${t.week}` : ''}. Who won?`);
  }
  const highScorer = weekMatchups.length > 0 && weekMatchups[0].status !== 'upcoming'
    ? [...weekMatchups].sort((a, b) => Math.max(b.away.points, b.home.points) - Math.max(a.away.points, a.home.points))[0]
    : null;
  if (highScorer) {
    const top = highScorer.away.points >= highScorer.home.points ? highScorer.away : highScorer.home;
    storylines.push(`High-score watch: ${top.team} is putting up ${top.points} points this week.`);
  }
  const closeGame = weekMatchups.find((m) => m.spread !== null && m.spread < 10 && m.status === 'live');
  if (closeGame) {
    storylines.push(`Nail-biter: ${closeGame.away.team} vs ${closeGame.home.team} — separated by just ${closeGame.spread?.toFixed(1)} points.`);
  }
  const champTeam = standings.find((s) => s.isChampion && s.rank > playoffSpots);
  if (champTeam) {
    storylines.push(`Defending/past champion ${champTeam.team} is currently outside the playoff line at #${champTeam.rank}.`);
  }
  for (const m of weekMatchups) {
    // Same record match
    const aStanding = standings.find((s) => s.team === m.away.team);
    const hStanding = standings.find((s) => s.team === m.home.team);
    if (aStanding && hStanding && aStanding.wins === hStanding.wins && aStanding.losses === hStanding.losses) {
      m.storyHook = `Mirror match: both teams are ${aStanding.wins}-${aStanding.losses}`;
    } else if (aStanding && hStanding) {
      const rankDiff = Math.abs(aStanding.rank - hStanding.rank);
      if (rankDiff >= 6) {
        const top = aStanding.rank < hStanding.rank ? aStanding : hStanding;
        const bot = aStanding.rank < hStanding.rank ? hStanding : aStanding;
        m.storyHook = `Top vs. bottom: #${top.rank} ${top.team} faces #${bot.rank} ${bot.team}`;
      }
    }
  }

  // ── Suggested headlines ───────────────────────────────────────────────────────
  const season2 = season;
  const suggestedHeadlines = [
    `Week ${week} Preview: Who Controls Their Own Destiny?`,
    `Week ${week} Recap: Scores, Highlights & Playoff Implications`,
    `Game of the Week: ${weekMatchups[0] ? `${weekMatchups[0].away.team} vs ${weekMatchups[0].home.team}` : 'TBD'}`,
    `Trade Breakdown: ${recentTrades[0]?.teams.map((t) => t.name).join(' and ') ?? 'Recent Activity'} — Picks and Winners`,
    `Power Rankings: Week ${week} — ${season2} Edition`,
    `Playoff Race Update: Who's In, Who's Out After Week ${week}?`,
    `Waiver Wire Winners & Losers — Week ${week}`,
  ];

  return {
    meta: mcpMeta('get_weekly_context', {
      week,
      season,
      seasonType,
      dataSource: 'sleeper-live',
      contentDraftNote: 'DRAFT ONLY — do not auto-publish. All content should be reviewed before sharing.',
    }),
    week,
    season,
    leagueName: 'East v. West Fantasy Football',
    matchups: weekMatchups,
    standings,
    playoffRace,
    recentTrades,
    recentWaivers,
    injuries: injuries.slice(0, 20), // cap at 20 to keep response manageable
    champions: CHAMPIONS,
    suggestedStorylines: storylines,
    suggestedHeadlines,
    missingData: missingData.length > 0 ? missingData : null,
    contentUsageNote: 'This data is a draft briefing for content creation only. Review all facts before publishing.',
  };
}

// ─── Markdown card formatters (for ChatGPT chat rendering) ────────────────────
// These take the same structured data the handlers return and produce a compact
// Markdown string suitable for the MCP `content[].text` field. ChatGPT renders
// this as a visual card in the chat thread alongside the structured JSON.

const FRESHNESS = () =>
  new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const POS_ORDER = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'K', 'DEF', 'DL', 'LB', 'DB'];

export function formatStandingsMarkdown(
  currentRows: Array<{ rank: number; team: string; wins: number; losses: number; ties: number; pf: number; pa?: number; avgPf?: number; championships: number }>,
  season: string,
): string {
  if (currentRows.length === 0) {
    return `## 📊 East v. West Standings — ${season} Season\n\n*No standings data available yet.*\n\n*Live from Sleeper · ${FRESHNESS()}*`;
  }

  const rows = currentRows
    .slice(0, 12)
    .map((r, i) => {
      const leader = i === 0 ? ' ◀' : '';
      const champ = r.championships > 0 ? ` 🏆${r.championships > 1 ? `×${r.championships}` : ''}` : '';
      const tieStr = r.ties > 0 ? `-${r.ties}` : '';
      const pfStr = r.pf.toFixed(1);
      const avgStr = r.avgPf != null ? r.avgPf.toFixed(1) : '—';
      return `| ${r.rank} | ${r.team}${champ}${leader} | ${r.wins}-${r.losses}${tieStr} | ${pfStr} | ${avgStr} |`;
    })
    .join('\n');

  return [
    `## 📊 East v. West — ${season} Standings`,
    '',
    '| # | Team | W-L | PF | Avg |',
    '|---|---|---|---:|---:|',
    rows,
    '',
    `*◀ = current leader · 🏆 = championship(s) · Live from Sleeper · ${FRESHNESS()}*`,
  ].join('\n');
}

export function formatTeamMarkdown(data: {
  team: {
    name: string;
    currentRecord: { season: string; wins: number; losses: number; ties: number; pf: number; pa: number };
    allTimeStats: { regularSeason: { wins: number; losses: number; pf: number; pa?: number }; playoffs: { wins: number; losses: number } } | null;
    championships: number;
    championshipHistory: Array<{ year: number; finish: string }>;
  };
  roster: {
    active: Array<{ name: string; position: string | null; nflTeam: string | null; status: string | null }>;
    ir: Array<{ name: string; position: string | null; nflTeam?: string | null }>;
    taxi: Array<{ name: string; position: string | null; nflTeam?: string | null }>;
  };
}): string {
  const { team, roster } = data;
  const rec = team.currentRecord;
  const tieStr = rec.ties > 0 ? `-${rec.ties}` : '';

  const champYears = team.championshipHistory
    .filter((c) => c.finish.startsWith('1st'))
    .map((c) => c.year)
    .join(', ');
  const champStr = team.championships > 0
    ? `🏆 ${team.championships}× Champion (${champYears})`
    : 'No championships yet';

  const byPos: Record<string, string[]> = {};
  for (const p of roster.active) {
    const pos = p.position ?? 'UNKN';
    if (!byPos[pos]) byPos[pos] = [];
    const nfl = p.nflTeam ? ` (${p.nflTeam})` : '';
    const inj = p.status && p.status !== 'Active' ? ` — ⚠️ ${p.status}` : '';
    byPos[pos].push(`${p.name}${nfl}${inj}`);
  }
  const rosterLines = Object.entries(byPos)
    .sort(([a], [b]) => {
      const ai = POS_ORDER.indexOf(a);
      const bi = POS_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map(([pos, names]) => `**${pos}:** ${names.join(', ')}`)
    .join('\n');

  const lines: string[] = [
    `## 🏈 ${team.name}`,
    '',
    `**${rec.season} Record:** ${rec.wins}-${rec.losses}${tieStr} | PF ${rec.pf.toFixed(1)} | PA ${rec.pa.toFixed(1)}`,
  ];

  if (team.allTimeStats) {
    const rs = team.allTimeStats.regularSeason;
    const pl = team.allTimeStats.playoffs;
    lines.push(`**Career:** ${rs.wins}-${rs.losses} reg season | ${pl.wins}-${pl.losses} playoffs`);
  }

  lines.push(`**${champStr}**`, '', '### Active Roster', rosterLines);

  if (roster.ir.length > 0) {
    lines.push('', `**IR (${roster.ir.length}):** ${roster.ir.map((p) => `${p.name}${p.nflTeam ? ` (${p.nflTeam})` : ''}`).join(', ')}`);
  }
  if (roster.taxi.length > 0) {
    lines.push(`**Taxi (${roster.taxi.length}):** ${roster.taxi.map((p) => `${p.name}${p.position ? ` · ${p.position}` : ''}`).join(', ')}`);
  }

  lines.push('', `*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

export function formatMatchupsMarkdown(
  matchups: Array<{ matchupId: number; home: { team: string; points: number }; away: { team: string; points: number }; played: boolean }>,
  week: number,
  season: string,
): string {
  if (matchups.length === 0) {
    return `## 🏈 Week ${week} Matchups — ${season}\n\n*No matchups scheduled for this week.*\n\n*Live from Sleeper · ${FRESHNESS()}*`;
  }

  const rows = matchups.map((m) => {
    const bothZero = m.away.points === 0 && m.home.points === 0;
    const statusLabel = bothZero ? 'Upcoming' : 'Live';

    const awayPts = m.away.points.toFixed(1);
    const homePts = m.home.points.toFixed(1);

    let awayName = m.away.team;
    let homeName = m.home.team;
    let scoreStr: string;

    if (bothZero) {
      scoreStr = 'vs';
    } else {
      const awayWinning = m.away.points > m.home.points;
      const homeWinning = m.home.points > m.away.points;
      awayName = awayWinning ? `**${m.away.team}**` : m.away.team;
      homeName = homeWinning ? `**${m.home.team}**` : m.home.team;
      scoreStr = `${awayPts}–${homePts}`;
    }

    return `| ${awayName} | ${scoreStr} | ${homeName} | ${bothZero ? statusLabel : statusLabel} |`;
  });

  const allZero = matchups.every((m) => m.away.points === 0 && m.home.points === 0);
  const weekLabel = allZero ? `Week ${week} — Upcoming` : `Week ${week} — In Progress / Final`;

  return [
    `## 🏈 ${season} ${weekLabel}`,
    '',
    '| Away | Score | Home | Status |',
    '|---|:---:|---|---|',
    ...rows,
    '',
    `*Bold = current leader · Live from Sleeper · ${FRESHNESS()}*`,
  ].join('\n');
}

export function formatFranchiseMarkdown(
  franchises: Array<{
    team: string;
    regularSeason: { wins: number; losses: number; ties: number; winPct: number; pf: number; avgPf: number };
    playoffs: { wins: number; losses: number; winPct: number };
    championships: number;
    runnerUps: number;
  }>,
): string {
  if (franchises.length === 0) {
    return `## 🏆 East v. West All-Time Franchise Records\n\n*No data available.*`;
  }

  const rows = franchises.map((f, i) => {
    const champ = f.championships > 0 ? ` 🏆×${f.championships}` : '';
    const ru = f.runnerUps > 0 ? ` 🥈×${f.runnerUps}` : '';
    const tieStr = f.regularSeason.ties > 0 ? `-${f.regularSeason.ties}` : '';
    return `| ${i + 1} | ${f.team}${champ}${ru} | ${f.regularSeason.wins}-${f.regularSeason.losses}${tieStr} | ${f.regularSeason.winPct}% | ${f.regularSeason.avgPf.toFixed(1)} | ${f.playoffs.wins}-${f.playoffs.losses} |`;
  });

  return [
    '## 🏆 East v. West — All-Time Franchise Records',
    '',
    '| # | Team | W-L | Win% | Avg PF | Playoff W-L |',
    '|---|---|---|---:|---:|---|',
    ...rows,
    '',
    `*Sorted by championships then win%. All regular seasons included. · ${FRESHNESS()}*`,
  ].join('\n');
}

export function formatWeeklyContextMarkdown(data: {
  week: number;
  season: string;
  matchups: Array<{
    matchupId: number;
    away: { team: string; points: number };
    home: { team: string; points: number };
    status?: string;
    spread?: number | null;
    storyHook?: string | null;
  }>;
  standings: Array<{ rank: number; team: string; wins: number; losses: number; pf: number; pa?: number; avgPf?: number; championships: number }>;
  playoffRace?: {
    playoffSpots: number;
    inPlayoffs: Array<{ team: string; rank: number; wins: number; losses: number }>;
    onBubble: Array<{ team: string; rank: number; wins: number; losses: number }>;
    bubbleGap?: { wins: number; pf: number } | null;
  } | null;
  recentTrades?: Array<{ week?: number | null; teams: Array<{ name: string; received: Array<{ name: string; position: string | null; from?: string | null }>; picks: string[] }> }>;
  recentWaivers?: Array<{ team: string; type: string; week?: number | null; faab?: number | null; added: string[]; dropped: string[] }>;
  injuries?: Array<{ team: string; player: string; position: string | null; status: string }>;
  suggestedStorylines?: string[];
  suggestedHeadlines?: string[];
  missingData?: string[] | null;
  // legacy compat
  recentTransactions?: Array<{ team: string; type: string; added: string[]; dropped: string[]; faab?: number | null }>;
}): string {
  const {
    week, season, matchups, standings, playoffRace,
    recentTrades, recentWaivers, injuries,
    suggestedStorylines, suggestedHeadlines, missingData,
    recentTransactions,
  } = data;

  const lines: string[] = [
    `## 📋 East v. West — Week ${week} Content Briefing (${season})`,
    '*DRAFT ONLY — review all facts before publishing.*',
    '',
  ];

  // ── Matchups ────────────────────────────────────────────────────────────────
  lines.push('### Matchups');
  if (matchups.length === 0) {
    lines.push('*No matchups scheduled.*');
  } else {
    for (const m of matchups) {
      const bothZero = m.away.points === 0 && m.home.points === 0;
      const awayWin = m.away.points > m.home.points;
      const homeWin = m.home.points > m.away.points;
      const awayStr = awayWin ? `**${m.away.team} ${m.away.points.toFixed(1)}**` : `${m.away.team}${bothZero ? '' : ` ${m.away.points.toFixed(1)}`}`;
      const homeStr = homeWin ? `**${m.home.team} ${m.home.points.toFixed(1)}**` : `${m.home.team}${bothZero ? '' : ` ${m.home.points.toFixed(1)}`}`;
      const vs = bothZero ? 'vs' : '—';
      const hook = m.storyHook ? ` *(${m.storyHook})*` : '';
      lines.push(`- ${awayStr} ${vs} ${homeStr}${hook}`);
    }
  }
  lines.push('');

  // ── Standings (top 8 with PF/PA/avg) ────────────────────────────────────────
  lines.push('### Standings (Top 8)');
  const standingLines = standings.slice(0, 8).map((s) => {
    const champ = s.championships > 0 ? ' 🏆' : '';
    const avg = s.avgPf != null ? `, avg ${s.avgPf.toFixed(1)}` : '';
    return `${s.rank}. **${s.team}**${champ} ${s.wins}-${s.losses} | PF ${s.pf.toFixed(0)}${avg}`;
  });
  lines.push(...standingLines, '');

  // ── Playoff race ─────────────────────────────────────────────────────────────
  if (playoffRace && (playoffRace.onBubble.length > 0 || playoffRace.inPlayoffs.length > 0)) {
    lines.push('### Playoff Race');
    const lastIn = playoffRace.inPlayoffs[playoffRace.inPlayoffs.length - 1];
    const firstOut = playoffRace.onBubble[0];
    if (lastIn) lines.push(`**Last in (${playoffRace.playoffSpots} spots):** ${lastIn.team} (${lastIn.wins}-${lastIn.losses})`);
    if (firstOut) lines.push(`**First out:** ${firstOut.team} (${firstOut.wins}-${firstOut.losses})`);
    if (playoffRace.bubbleGap) {
      const g = playoffRace.bubbleGap;
      const gDesc = g.wins === 0 ? `tied on wins, ${g.pf > 0 ? '+' : ''}${g.pf} PF` : `${g.wins}W / ${g.pf > 0 ? '+' : ''}${g.pf} PF`;
      lines.push(`**Bubble gap:** ${gDesc}`);
    }
    if (playoffRace.onBubble.length > 1) {
      lines.push(`**Also on bubble:** ${playoffRace.onBubble.slice(1).map((t) => `${t.team} (${t.wins}-${t.losses})`).join(', ')}`);
    }
    lines.push('');
  }

  // ── Recent trades ─────────────────────────────────────────────────────────────
  const trades = recentTrades ?? [];
  if (trades.length > 0) {
    lines.push('### Recent Trades');
    for (const t of trades.slice(0, 4)) {
      const when = t.week ? ` (Wk ${t.week})` : '';
      if (t.teams.length === 2) {
        const [a, b] = t.teams;
        const aGot = [...a.received.map((p) => p.name), ...a.picks].join(', ') || '—';
        const bGot = [...b.received.map((p) => p.name), ...b.picks].join(', ') || '—';
        lines.push(`- **${a.name}** got: ${aGot}${when}`);
        lines.push(`  **${b.name}** got: ${bGot}`);
      } else {
        // Multi-team trade — name the sender of every asset.
        lines.push(`- **${t.teams.length}-team trade**${when}:`);
        for (const side of t.teams) {
          const got = [
            ...side.received.map((p) => (p.from ? `${p.name} (from ${p.from})` : p.name)),
            ...side.picks,
          ].join(', ') || '—';
          lines.push(`  **${side.name}** got: ${got}`);
        }
      }
    }
    lines.push('');
  }

  // ── Recent waiver/FA moves ────────────────────────────────────────────────────
  const waivers = recentWaivers ?? recentTransactions?.map((t) => ({
    team: t.team, type: t.type, week: null, faab: t.faab ?? null,
    added: t.added, dropped: t.dropped,
  })) ?? [];
  if (waivers.length > 0) {
    lines.push('### Recent Waiver / FA Moves');
    for (const t of waivers.slice(0, 6)) {
      const faab = t.faab ? ` ($${t.faab})` : '';
      const adds = t.added.length > 0 ? `+${t.added.join(', ')}` : '';
      const drops = t.dropped.length > 0 ? `−${t.dropped.join(', ')}` : '';
      const moves = [adds, drops].filter(Boolean).join(' / ') || '—';
      lines.push(`- **${t.team}:** ${moves}${faab}`);
    }
    lines.push('');
  }

  // ── Injury notes ──────────────────────────────────────────────────────────────
  const inj = injuries ?? [];
  if (inj.length > 0) {
    lines.push('### Notable Injuries / Status');
    for (const i of inj.slice(0, 8)) {
      const pos = i.position ? ` (${i.position})` : '';
      lines.push(`- **${i.player}**${pos} — ${i.status} *(${i.team})*`);
    }
    if (inj.length > 8) lines.push(`*…${inj.length - 8} more flagged players in structuredContent.*`);
    lines.push('');
  }

  // ── Storylines ────────────────────────────────────────────────────────────────
  if (suggestedStorylines && suggestedStorylines.length > 0) {
    lines.push('### Suggested Storylines');
    for (const s of suggestedStorylines.slice(0, 5)) {
      lines.push(`- ${s}`);
    }
    lines.push('');
  }

  // ── Headlines ─────────────────────────────────────────────────────────────────
  if (suggestedHeadlines && suggestedHeadlines.length > 0) {
    lines.push('### Suggested Headlines');
    for (const h of suggestedHeadlines.slice(0, 4)) {
      lines.push(`- "${h}"`);
    }
    lines.push('');
  }

  // ── Missing data notes ────────────────────────────────────────────────────────
  if (missingData && missingData.length > 0) {
    lines.push('### ⚠️ Missing Data');
    for (const note of missingData) lines.push(`- ${note}`);
    lines.push('');
  }

  lines.push(`*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

export function formatDraftPicksMarkdown(
  futurePicks: Array<{ season: string; round: number; originalTeam: string; currentOwner: string; traded: boolean }>,
  teamFilter?: string,
): string {
  if (futurePicks.length === 0) {
    const ctx = teamFilter ? ` involving **${teamFilter}**` : '';
    return `## 🏈 Future Draft Pick Ownership${ctx}\n\n*No traded picks on record. Each team currently holds all of their own picks.*\n\n*Live from Sleeper · ${FRESHNESS()}*`;
  }

  // Group by season
  const bySeason: Record<string, typeof futurePicks> = {};
  for (const p of futurePicks) {
    if (!bySeason[p.season]) bySeason[p.season] = [];
    bySeason[p.season].push(p);
  }

  const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
  const ord = (n: number) => ORDINAL[n] ?? `${n}th`;

  const sections: string[] = [];
  for (const season of Object.keys(bySeason).sort()) {
    const picks = bySeason[season];
    // Only show traded picks (different owner from original)
    const traded = picks.filter((p) => p.traded);
    const own = picks.filter((p) => !p.traded);

    sections.push(`### ${season} Draft Picks`);

    if (traded.length > 0) {
      sections.push('**Traded picks (current owner ≠ original team):**');
      sections.push('| Round | Original Team | Current Owner |');
      sections.push('|---|---|---|');
      for (const p of traded.sort((a, b) => a.round - b.round)) {
        sections.push(`| ${ord(p.round)} | ${p.originalTeam} | **${p.currentOwner}** |`);
      }
    }

    if (own.length > 0 && traded.length > 0) {
      sections.push(`*${own.length} pick(s) still held by original owner.*`);
    } else if (own.length > 0 && traded.length === 0) {
      sections.push(`*All ${own.length} pick(s) held by original owners — no trades recorded for this year.*`);
    }
  }

  const title = teamFilter ? `## 🏈 Draft Picks — ${teamFilter}` : '## 🏈 Future Draft Pick Ownership';

  return [
    title,
    '',
    ...sections,
    '',
    `*Live from Sleeper · ${FRESHNESS()}*`,
  ].join('\n');
}

export function formatTradeHistoryMarkdown(
  trades: Array<{
    id: string;
    season: string | null;
    week: number | null;
    date?: string;
    teams: Array<{
      name: string;
      received: Array<{ name: string; position: string | null; from?: string | null }>;
      picks: string[];
    }>;
  }>,
  teamFilter?: string,
  limit = 10,
): string {
  if (trades.length === 0) {
    const ctx = teamFilter ? ` involving **${teamFilter}**` : '';
    return `## 🔄 Trade History${ctx}\n\n*No trades found.*\n\n*Source: Sleeper · ${FRESHNESS()}*`;
  }

  const shown = trades.slice(0, limit);
  const title = teamFilter
    ? `## 🔄 Trade History — ${teamFilter} (${shown.length} of ${trades.length})`
    : `## 🔄 Recent Trades (${shown.length} of ${trades.length})`;

  const ORDINAL_ROUND: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
  const fmtAsset = (p: { name: string; position: string | null }) =>
    p.position ? `${p.name} *(${p.position})*` : p.name;

  const lines: string[] = [title, ''];

  for (const trade of shown) {
    const when = trade.season
      ? trade.week ? `${trade.season} Wk ${trade.week}` : trade.season
      : trade.date ?? 'Unknown date';

    lines.push(`**${when}**`);

    if (trade.teams.length === 2) {
      const [a, b] = trade.teams;
      const aAssets = [
        ...a.received.map(fmtAsset),
        ...a.picks.map((pk) => {
          // Make pick names more readable: "2026 Mid 1st Round Pick" → "2026 1st (from ...)"
          const roundMatch = pk.match(/\b([1-5])(?:st|nd|rd|th)?\s*round/i);
          const round = roundMatch ? ORDINAL_ROUND[Number(roundMatch[1])] ?? roundMatch[1] : null;
          const yearMatch = pk.match(/\b(20\d{2})\b/);
          const year = yearMatch?.[1] ?? null;
          return round && year ? `${year} ${round}-round pick` : pk;
        }),
      ];
      const bAssets = [
        ...b.received.map(fmtAsset),
        ...b.picks.map((pk) => {
          const roundMatch = pk.match(/\b([1-5])(?:st|nd|rd|th)?\s*round/i);
          const round = roundMatch ? ORDINAL_ROUND[Number(roundMatch[1])] ?? roundMatch[1] : null;
          const yearMatch = pk.match(/\b(20\d{2})\b/);
          const year = yearMatch?.[1] ?? null;
          return round && year ? `${year} ${round}-round pick` : pk;
        }),
      ];

      lines.push(`| ${a.name} receives | ${b.name} receives |`);
      lines.push('|---|---|');
      const maxLen = Math.max(aAssets.length, bAssets.length, 1);
      for (let i = 0; i < maxLen; i++) {
        lines.push(`| ${aAssets[i] ?? '—'} | ${bAssets[i] ?? '—'} |`);
      }
    } else {
      // Multi-team trade: every asset names its sender so the bot can tell
      // which team gave up which piece (picks carry a baked "(from X)" suffix).
      lines.push(`*${trade.teams.length}-team trade — "from" marks the team that sent each asset:*`);
      for (const side of trade.teams) {
        const assets = [
          ...side.received.map((p) => (p.from ? `${fmtAsset(p)} (from ${p.from})` : fmtAsset(p))),
          ...side.picks,
        ].join(', ') || '—';
        lines.push(`- **${side.name} receives:** ${assets}`);
      }
    }
    lines.push('');
  }

  if (trades.length > limit) {
    lines.push(`*Showing ${limit} most recent. Use \`limit\` or \`season\` params to filter.*`);
  }
  lines.push(`*Source: Sleeper · ${FRESHNESS()}*`);

  return lines.join('\n');
}

export function formatRuleAnswerMarkdown(data: {
  section?: { id: string; title: string; text: string };
  sections?: Array<{ id: string; title: string; text: string; matchingLines?: string[] }>;
  error?: string;
  availableSections?: Array<{ id: string; title: string }>;
}): string {
  // Error state: section not found
  if (data.error === 'section_not_found') {
    const list = (data.availableSections ?? [])
      .map((s) => `- \`${s.id}\` — ${s.title}`)
      .join('\n');
    return `## 📋 East v. West Rulebook\n\n*Section not found. Available sections:*\n\n${list}`;
  }

  // Single section direct lookup
  if (data.section) {
    const { title, text } = data.section;
    // Show first 800 chars of text, trimmed at a sentence boundary
    const trimmed = text.length > 800
      ? text.slice(0, 800).replace(/\s+\S*$/, '') + '…'
      : text;
    return [
      `## 📋 ${title}`,
      '',
      trimmed,
      '',
      `*East v. West Rulebook v3, ratified 2026-02-12 · ${FRESHNESS()}*`,
    ].join('\n');
  }

  // Search results
  const sections = data.sections ?? [];
  if (sections.length === 0) {
    return `## 📋 East v. West Rulebook\n\n*No matching rules found. Try a different keyword.*\n\n*${FRESHNESS()}*`;
  }

  const MAX_SECTIONS = 3;
  const MAX_LINES_PER = 6;
  const shown = sections.slice(0, MAX_SECTIONS);
  const lines: string[] = ['## 📋 East v. West Rulebook — Matching Rules', ''];

  for (const s of shown) {
    lines.push(`### ${s.title}`);
    if (s.matchingLines && s.matchingLines.length > 0) {
      const excerpts = s.matchingLines.slice(0, MAX_LINES_PER);
      for (const l of excerpts) {
        lines.push(`> ${l.trim()}`);
      }
      if (s.matchingLines.length > MAX_LINES_PER) {
        lines.push(`> *…${s.matchingLines.length - MAX_LINES_PER} more matching lines*`);
      }
    } else {
      // No matchingLines (unfiltered full section) — show first 300 chars
      const preview = s.text.length > 300
        ? s.text.slice(0, 300).replace(/\s+\S*$/, '') + '…'
        : s.text;
      lines.push(preview);
    }
    lines.push('');
  }

  if (sections.length > MAX_SECTIONS) {
    lines.push(`*${sections.length - MAX_SECTIONS} more section(s) matched — use \`section\` param for a direct lookup.*`);
    lines.push('');
  }

  lines.push('*If interpretation is unclear, commissioner review may be needed.*');
  lines.push(`*East v. West Rulebook v3, ratified 2026-02-12 · ${FRESHNESS()}*`);
  return lines.join('\n');
}

export function formatRosterMarkdown(data: {
  rosters: Array<{
    team: string;
    record: { wins: number; losses: number; ties: number } | null;
    players: Array<{ name: string; position: string | null; nflTeam: string | null; status: string | null; slot: string }>;
  }>;
}): string | null {
  // Only produce a card for single-team requests — all-teams is too large
  if (data.rosters.length !== 1) return null;

  const r = data.rosters[0];
  const recStr = r.record
    ? ` · ${r.record.wins}-${r.record.losses}${r.record.ties > 0 ? `-${r.record.ties}` : ''}`
    : '';

  const active = r.players.filter((p) => p.slot === 'active');
  const ir = r.players.filter((p) => p.slot === 'ir');
  const taxi = r.players.filter((p) => p.slot === 'taxi');

  const byPos: Record<string, string[]> = {};
  for (const p of active) {
    const pos = p.position ?? 'UNKN';
    if (!byPos[pos]) byPos[pos] = [];
    const nfl = p.nflTeam ? ` (${p.nflTeam})` : '';
    const inj = p.status && p.status !== 'Active' ? ` ⚠️ ${p.status}` : '';
    byPos[pos].push(`${p.name}${nfl}${inj}`);
  }

  const rosterLines = Object.entries(byPos)
    .sort(([a], [b]) => {
      const ai = POS_ORDER.indexOf(a);
      const bi = POS_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    })
    .map(([pos, names]) => `**${pos}:** ${names.join(', ')}`)
    .join('\n');

  const lines: string[] = [
    `## 🏈 ${r.team} — Current Roster${recStr}`,
    '',
    rosterLines,
  ];

  if (ir.length > 0) {
    lines.push('', `**IR (${ir.length}):** ${ir.map((p) => `${p.name}${p.nflTeam ? ` (${p.nflTeam})` : ''}${p.status && p.status !== 'Active' ? ` ⚠️ ${p.status}` : ''}`).join(', ')}`);
  }
  if (taxi.length > 0) {
    lines.push(`**Taxi (${taxi.length}):** ${taxi.map((p) => `${p.name}${p.position ? ` · ${p.position}` : ''}`).join(', ')}`);
  }

  lines.push('', `*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

// ─── tool: get_commissioner_ops_context ───────────────────────────────────────
// Advisory-only context for commissioner review. Returns possible issues,
// reminders, and draft owner messages. Makes no rulings, sends no messages,
// and modifies nothing. All items use cautious language: "possible", "needs
// review", "check before kickoff".

export async function handleGetCommissionerOps() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };

  let week = 1;
  let seasonType = 'unknown';
  let nflSeason = '';
  try {
    const state = await getNFLState(undefined, opts);
    week = Number(state?.week ?? 1);
    seasonType = (state as { season_type?: string }).season_type ?? 'unknown';
    nflSeason = String((state as { season?: string | number }).season ?? '');
  } catch { /* use defaults */ }

  const season = nflSeason || CURRENT_SEASON;
  const now = new Date();
  const missingData: string[] = [];

  // ── Parallel fetches ─────────────────────────────────────────────────────────
  const [teams, rosters, allPlayers, matchupSlots] = await Promise.all([
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => []),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getLeagueMatchups(leagueId, week, opts).catch(() => [] as SleeperMatchup[]),
  ]);

  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));
  if (rosters.length === 0) missingData.push('Roster data unavailable — IR/taxi/lineup checks skipped.');
  if (Object.keys(allPlayers).length === 0) missingData.push('Player database unavailable — injury status checks skipped.');

  // ── Date-based reminders ─────────────────────────────────────────────────────
  type DateReminder = { event: string; date: string; daysAway: number; urgency: 'immediate' | 'soon' | 'upcoming' };
  const dateReminders: DateReminder[] = [];

  const importantDateEntries: Array<{ key: string; label: string; date: Date }> = [
    { key: 'NEXT_DRAFT',      label: 'Annual Draft',           date: IMPORTANT_DATES.NEXT_DRAFT },
    { key: 'NFL_WEEK_1',      label: 'NFL Week 1 Kickoff',     date: IMPORTANT_DATES.NFL_WEEK_1_START },
    { key: 'TRADE_DEADLINE',  label: 'Trade Deadline (Wk 12)', date: IMPORTANT_DATES.TRADE_DEADLINE },
    { key: 'PLAYOFFS_START',  label: 'Playoffs Start (Wk 15)', date: IMPORTANT_DATES.PLAYOFFS_START },
    { key: 'NEW_LEAGUE_YEAR', label: 'New League Year',        date: IMPORTANT_DATES.NEW_LEAGUE_YEAR },
  ];

  for (const { label, date } of importantDateEntries) {
    const msAway = date.getTime() - now.getTime();
    const daysAway = Math.round(msAway / (1000 * 60 * 60 * 24));
    if (daysAway > -7 && daysAway <= 60) { // show past 7 days through next 60 days
      dateReminders.push({
        event: label,
        date: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
        daysAway,
        urgency: daysAway <= 2 ? 'immediate' : daysAway <= 7 ? 'soon' : 'upcoming',
      });
    }
  }
  dateReminders.sort((a, b) => a.daysAway - b.daysAway);

  // ── Injury / status watch ─────────────────────────────────────────────────────
  type InjuryFlag = { team: string; player: string; position: string | null; status: string; severity: 'high' | 'medium' | 'low' };
  const HIGH_SEVERITY = new Set(['Out', 'IR', 'PUP-P', 'NFI-R', 'Sus', 'Doubtful']);
  const MED_SEVERITY = new Set(['Questionable', 'DNP', 'Limited']);

  const injuryFlags: InjuryFlag[] = [];
  for (const roster of rosters) {
    const teamName = rosterIdToName.get(roster.roster_id) ?? `Roster ${roster.roster_id}`;
    const allPids: string[] = [
      ...((roster as unknown as { players?: string[] }).players ?? []),
    ];
    for (const pid of allPids.slice(0, 40)) {
      const pl = allPlayers[pid];
      if (!pl) continue;
      const status = (pl.injury_status ?? pl.status ?? '').trim();
      if (!status || status === 'Active' || status === 'ACT') continue;
      const severity: InjuryFlag['severity'] = HIGH_SEVERITY.has(status) ? 'high'
        : MED_SEVERITY.has(status) ? 'medium' : 'low';
      injuryFlags.push({
        team: teamName,
        player: `${pl.first_name || ''} ${pl.last_name || ''}`.trim(),
        position: pl.position ?? null,
        status,
        severity,
      });
    }
  }
  injuryFlags.sort((a, b) => {
    const sevOrder = { high: 0, medium: 1, low: 2 };
    return sevOrder[a.severity] - sevOrder[b.severity];
  });

  // ── IR slot review (reserve[] contains players flagged for IR) ────────────────
  type IrReviewItem = { team: string; player: string; position: string | null; status: string; note: string };
  const irReview: IrReviewItem[] = [];
  // Players on IR (reserve slot) who may have been activated but not moved
  for (const roster of rosters) {
    const teamName = rosterIdToName.get(roster.roster_id) ?? `Roster ${roster.roster_id}`;
    const reserveIds: string[] = (roster as unknown as { reserve?: string[] }).reserve ?? [];
    for (const pid of reserveIds) {
      const pl = allPlayers[pid];
      if (!pl) continue;
      const status = (pl.injury_status ?? pl.status ?? '').trim();
      const playerName = `${pl.first_name || ''} ${pl.last_name || ''}`.trim();
      // Flag if IR player appears to be Active (possible needs to come off IR)
      if (!status || status === 'Active' || status === 'ACT') {
        irReview.push({
          team: teamName,
          player: playerName,
          position: pl.position ?? null,
          status: status || 'Active',
          note: 'Possible issue: player is on IR slot but shows Active status. Needs review — may need to be moved to active roster.',
        });
      }
    }
  }

  // ── Taxi squad review ─────────────────────────────────────────────────────────
  // Sleeper stores taxi players in roster.taxi[]
  // Flag if a taxi player has 2+ years of NFL experience (possible eligibility issue)
  type TaxiReviewItem = { team: string; player: string; position: string | null; yearsExp: number | null; note: string };
  const taxiReview: TaxiReviewItem[] = [];
  for (const roster of rosters) {
    const teamName = rosterIdToName.get(roster.roster_id) ?? `Roster ${roster.roster_id}`;
    const taxiIds: string[] = (roster as unknown as { taxi?: string[] }).taxi ?? [];
    for (const pid of taxiIds) {
      const pl = allPlayers[pid];
      if (!pl) continue;
      const yearsExp = typeof pl.years_exp === 'number' ? pl.years_exp : null;
      const playerName = `${pl.first_name || ''} ${pl.last_name || ''}`.trim();
      // Dynasty standard: taxi eligibility typically requires 0–1 years experience
      if (yearsExp !== null && yearsExp >= 2) {
        taxiReview.push({
          team: teamName,
          player: playerName,
          position: pl.position ?? null,
          yearsExp,
          note: `Possible issue: ${playerName} has ${yearsExp} years NFL experience on taxi squad. Check before kickoff — taxi eligibility may need commissioner review.`,
        });
      }
    }
  }

  // ── Lineup watch (starters with injury flags) ─────────────────────────────────
  // Cross-reference this week's matchup starters against injury flags
  type LineupFlag = { team: string; player: string; position: string | null; status: string; slot: string };
  const lineupFlags: LineupFlag[] = [];

  const injuryStatusByPid = new Map<string, string>();
  for (const roster of rosters) {
    const allPids: string[] = (roster as unknown as { players?: string[] }).players ?? [];
    for (const pid of allPids) {
      const pl = allPlayers[pid];
      if (!pl) continue;
      const s = (pl.injury_status ?? pl.status ?? '').trim();
      if (s && s !== 'Active' && s !== 'ACT') injuryStatusByPid.set(pid, s);
    }
  }

  for (const slot of matchupSlots) {
    const teamName = rosterIdToName.get(slot.roster_id) ?? `Roster ${slot.roster_id}`;
    const starterIds: string[] = (slot as unknown as { starters?: string[] }).starters ?? [];
    for (const pid of starterIds) {
      if (!pid || pid === '0') continue;
      const status = injuryStatusByPid.get(pid);
      if (!status) continue;
      const pl = allPlayers[pid];
      if (!pl) continue;
      lineupFlags.push({
        team: teamName,
        player: `${pl.first_name || ''} ${pl.last_name || ''}`.trim(),
        position: pl.position ?? null,
        status,
        slot: 'starter',
      });
    }
  }

  // ── Relevant rulebook snippets ────────────────────────────────────────────────
  const OPS_RULE_SECTIONS = ['rosters-lineups', 'competitive-integrity', 'trades', 'season-calendar', 'enforcement-penalties'];
  const ruleSnippets = PARSED_RULES
    .filter((s) => OPS_RULE_SECTIONS.includes(s.id))
    .map((s) => {
      const preview = s.text.length > 400
        ? s.text.slice(0, 400).replace(/\s+\S*$/, '') + '…'
        : s.text;
      return { id: s.id, title: s.title, preview };
    });

  // ── Checklist ─────────────────────────────────────────────────────────────────
  const checklist: string[] = [];

  // Date-based
  const tradeDeadlineSoon = dateReminders.find((d) => d.event.includes('Trade Deadline') && d.daysAway <= 14);
  const draftSoon = dateReminders.find((d) => d.event.includes('Draft') && d.daysAway <= 30);
  const playoffsSoon = dateReminders.find((d) => d.event.includes('Playoffs') && d.daysAway <= 14);
  if (tradeDeadlineSoon) checklist.push(`Remind managers: Trade Deadline is ${tradeDeadlineSoon.daysAway <= 0 ? 'TODAY / PAST' : `in ${tradeDeadlineSoon.daysAway} days`} (${tradeDeadlineSoon.date})`);
  if (draftSoon) checklist.push(`Draft approaching in ${draftSoon.daysAway} days — confirm host city, payment status, travel details`);
  if (playoffsSoon) checklist.push(`Playoffs start in ${playoffsSoon.daysAway} days — review seeding and bracket`);

  // Roster review
  if (irReview.length > 0) checklist.push(`Review ${irReview.length} possible IR slot issue(s) — players showing Active while on IR`);
  if (taxiReview.length > 0) checklist.push(`Review ${taxiReview.length} possible taxi eligibility issue(s) — players with 2+ years experience`);
  if (lineupFlags.length > 0) checklist.push(`Check before kickoff: ${lineupFlags.length} injured/questionable player(s) listed as starters this week`);

  // Always-present items
  checklist.push(`Verify all ${teams.length} teams have submitted lineups before Week ${week} kickoff`);
  checklist.push('Confirm any pending trades are reviewed before the deadline');
  checklist.push('Check Sleeper for any unresolved disputes or messages');
  if (seasonType === 'post') checklist.push('Post-season: confirm playoff bracket is correct and tiebreakers applied');

  // ── Draft owner messages ──────────────────────────────────────────────────────
  const ownerMessages: Array<{ subject: string; body: string }> = [];

  if (tradeDeadlineSoon) {
    ownerMessages.push({
      subject: `Trade Deadline Reminder — ${tradeDeadlineSoon.date}`,
      body: `Hey everyone! Just a reminder that the East v. West trade deadline is ${tradeDeadlineSoon.date}. All trades must be proposed and accepted on Sleeper before this time. No trades will be processed after the deadline. Make your moves now! — Commissioner`,
    });
  }

  if (draftSoon) {
    ownerMessages.push({
      subject: `Draft Day is Coming — ${draftSoon.date}`,
      body: `Managers! The East v. West Annual Draft is ${draftSoon.daysAway} days away. Please confirm your travel arrangements, settle any outstanding dues, and prepare your draft boards. Details to follow. — Commissioner`,
    });
  }

  if (lineupFlags.length > 0) {
    const flaggedTeams = [...new Set(lineupFlags.map((f) => f.team))];
    ownerMessages.push({
      subject: 'Lineup Check — Injured Starters This Week',
      body: `Heads up to the following teams: ${flaggedTeams.join(', ')}. You may have injured or questionable players in your starting lineup this week. Please review and update before kickoff. Advisory only — this is not an official ruling. — Commissioner`,
    });
  }

  if (irReview.length > 0) {
    const irTeams = [...new Set(irReview.map((r) => r.team))];
    ownerMessages.push({
      subject: 'Possible IR Slot Issue — Needs Review',
      body: `Advisory notice for: ${irTeams.join(', ')}. You may have a player on your IR slot who is showing as Active. This may need to be resolved. Commissioner review recommended before this week's games. — Commissioner`,
    });
  }

  return {
    meta: mcpMeta('get_commissioner_ops', {
      week,
      season,
      seasonType,
      currentDate: now.toISOString(),
      dataSource: 'sleeper-live',
      advisoryNote: 'ADVISORY ONLY — no rulings, no actions. All items require commissioner review.',
    }),
    week,
    season,
    currentDate: now.toISOString(),
    leagueName: 'East v. West Fantasy Football',
    dateReminders,
    injuryFlags: injuryFlags.slice(0, 25),
    irReview,
    taxiReview,
    lineupFlags,
    checklist,
    ownerMessages,
    ruleSnippets,
    missingData: missingData.length > 0 ? missingData : null,
    advisoryNote: 'ADVISORY ONLY — no official rulings. All items marked "possible issue" or "needs review" require commissioner judgment.',
  };
}

export function formatCommissionerOpsMarkdown(data: ReturnType<typeof handleGetCommissionerOps> extends Promise<infer T> ? T : never): string {
  const {
    week, season, currentDate, dateReminders,
    injuryFlags, irReview, taxiReview, lineupFlags,
    checklist, ownerMessages, missingData,
  } = data;

  const dateFmt = new Date(currentDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const lines: string[] = [
    `## 🛡️ Commissioner Ops — Review Only`,
    `**Week ${week} · ${season} Season · ${dateFmt}**`,
    '*Advisory only — commissioner review required for all flagged items.*',
    '',
  ];

  // ── Upcoming dates ────────────────────────────────────────────────────────────
  if (dateReminders.length > 0) {
    lines.push('### 📅 Upcoming Dates');
    for (const d of dateReminders) {
      const icon = d.urgency === 'immediate' ? '🔴' : d.urgency === 'soon' ? '🟡' : '🟢';
      const label = d.daysAway < 0 ? `${Math.abs(d.daysAway)}d ago` : d.daysAway === 0 ? 'TODAY' : `in ${d.daysAway}d`;
      lines.push(`${icon} **${d.event}** — ${d.date} *(${label})*`);
    }
    lines.push('');
  }

  // ── Commissioner checklist ────────────────────────────────────────────────────
  lines.push('### ✅ Weekly Checklist');
  for (const item of checklist) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push('');

  // ── Lineup watch ──────────────────────────────────────────────────────────────
  if (lineupFlags.length > 0) {
    lines.push('### ⚠️ Lineup Watch — Check Before Kickoff');
    lines.push('*Possible issue: these players are listed as starters but have an injury/status flag.*');
    for (const f of lineupFlags.slice(0, 10)) {
      const pos = f.position ? ` (${f.position})` : '';
      lines.push(`- **${f.player}**${pos} — ${f.status} · *${f.team}*`);
    }
    if (lineupFlags.length > 10) lines.push(`*…${lineupFlags.length - 10} more in structuredContent.*`);
    lines.push('');
  }

  // ── IR slot review ────────────────────────────────────────────────────────────
  if (irReview.length > 0) {
    lines.push('### 🏥 IR Slot Review — Needs Review');
    for (const item of irReview) {
      lines.push(`- **${item.player}** *(${item.team})* — ${item.note}`);
    }
    lines.push('');
  }

  // ── Taxi squad review ─────────────────────────────────────────────────────────
  if (taxiReview.length > 0) {
    lines.push('### 🚕 Taxi Squad Review — Possible Eligibility Issues');
    for (const item of taxiReview) {
      lines.push(`- **${item.player}** *(${item.team})* — ${item.note}`);
    }
    lines.push('');
  }

  // ── Injury / status watch ─────────────────────────────────────────────────────
  const highInj = injuryFlags.filter((f) => f.severity === 'high');
  const medInj = injuryFlags.filter((f) => f.severity === 'medium');
  if (highInj.length > 0 || medInj.length > 0) {
    lines.push('### 🩺 Injury / Status Watch');
    if (highInj.length > 0) {
      lines.push('**High severity (Out / IR / PUP / Sus / Doubtful):**');
      for (const f of highInj.slice(0, 8)) {
        const pos = f.position ? ` (${f.position})` : '';
        lines.push(`- **${f.player}**${pos} — ${f.status} · *${f.team}*`);
      }
      if (highInj.length > 8) lines.push(`*…${highInj.length - 8} more.*`);
    }
    if (medInj.length > 0) {
      lines.push('**Medium severity (Questionable / Limited / DNP):**');
      for (const f of medInj.slice(0, 6)) {
        const pos = f.position ? ` (${f.position})` : '';
        lines.push(`- **${f.player}**${pos} — ${f.status} · *${f.team}*`);
      }
      if (medInj.length > 6) lines.push(`*…${medInj.length - 6} more.*`);
    }
    lines.push('');
  }

  // ── Draft owner messages ──────────────────────────────────────────────────────
  if (ownerMessages.length > 0) {
    lines.push('### 💬 Draft Owner Messages');
    lines.push('*Review before sending — these are drafts only, not sent automatically.*');
    for (const msg of ownerMessages) {
      lines.push('');
      lines.push(`**Subject:** ${msg.subject}`);
      lines.push(`> ${msg.body}`);
    }
    lines.push('');
  }

  // ── Missing data ──────────────────────────────────────────────────────────────
  if (missingData && missingData.length > 0) {
    lines.push('### ⚠️ Missing Data');
    for (const note of missingData) lines.push(`- ${note}`);
    lines.push('');
  }

  lines.push(`*Live from Sleeper · ${FRESHNESS()} · Advisory only — no official rulings*`);
  return lines.join('\n');
}

// ─── tool: get_league_overview ───────────────────────────────────────────────

const PICK_ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th'];
const OVERVIEW_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _overviewCache: { ts: number; data: any } | null = null;

export async function handleGetLeagueOverview() {
  const now = Date.now();
  if (_overviewCache && now - _overviewCache.ts < OVERVIEW_CACHE_TTL) {
    return _overviewCache.data;
  }
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 22000 };
  const warnings: string[] = [];

  const [teams, rosters, allPlayers, splits] = await Promise.all([
    getTeamsData(leagueId, opts).catch((e: Error) => { warnings.push(`Teams fetch failed: ${e.message}`); return []; }),
    getLeagueRosters(leagueId, opts).catch((e: Error) => { warnings.push(`Rosters fetch failed: ${e.message}`); return [] as SleeperRoster[]; }),
    getAllPlayersCached().catch((e: Error) => { warnings.push(`Player DB failed: ${e.message}`); return {} as Record<string, SleeperPlayer>; }),
    getSplitRecordsAllTime(opts).catch((e: Error) => { warnings.push(`All-time records failed: ${e.message}`); return {} as Record<string, { teamName: string; regular: { wins: number; losses: number; ties: number; pf: number; pa: number }; playoffs: { wins: number; losses: number; ties: number; pf: number; pa: number }; toilet: { wins: number; losses: number; ties: number; pf: number; pa: number } }>; }),
  ]);

  type TradedPickRaw = { season?: string | number; round?: number; roster_id?: number; owner_id?: number };
  let tradedPicks: TradedPickRaw[] = [];
  try {
    const resp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, {
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) tradedPicks = (await resp.json()) as TradedPickRaw[];
  } catch (e) {
    warnings.push(`Future picks fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));
  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));
  const champs = champCounts();
  const runnerUpCounts: Record<string, number> = {};
  for (const c of Object.values(CHAMPIONS)) {
    if (c.runnerUp && c.runnerUp !== 'TBD') runnerUpCounts[c.runnerUp] = (runnerUpCounts[c.runnerUp] ?? 0) + 1;
  }

  const picksByOwner: Record<string, Array<{ season: string; round: number; originalTeam: string; traded: boolean; display: string }>> = {};
  for (const tp of tradedPicks) {
    try {
      const season = String(tp.season ?? '');
      const origTeam = rosterIdToName.get(Number(tp.roster_id)) ?? `Roster ${tp.roster_id}`;
      const ownerTeam = rosterIdToName.get(Number(tp.owner_id)) ?? `Roster ${tp.owner_id}`;
      const round = Number(tp.round ?? 0);
      const ord = PICK_ORDINAL[round] ?? `${round}th`;
      const traded = origTeam !== ownerTeam;
      const display = traded ? `${season} ${ord} from ${origTeam}` : `${season} ${ord} (own)`;
      if (!picksByOwner[ownerTeam]) picksByOwner[ownerTeam] = [];
      picksByOwner[ownerTeam].push({ season, round, originalTeam: origTeam, traded, display });
    } catch (e) {
      warnings.push(`Skipped one pick entry: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const overview = teams.map((team) => {
    const r = rosterById.get(team.rosterId);
    const irSet = new Set<string>(r?.reserve ?? []);
    const taxiSet = new Set<string>(r?.taxi ?? []);
    const allIds: string[] = r?.players ?? team.players ?? [];

    const players = allIds.filter(Boolean).map((pid) => {
      const p = allPlayers[pid] as SleeperPlayer | undefined;
      const slot = irSet.has(pid) ? 'ir' : taxiSet.has(pid) ? 'taxi' : 'active';
      return {
        playerId: pid,
        playerName: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || pid : pid,
        position: p?.position ?? null,
        nflTeam: p?.team ?? null,
        injuryStatus: p?.injury_status ?? p?.status ?? null,
        slot,
      };
    });

    const rs = r?.settings as { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; fpts_against?: number; fpts_against_decimal?: number } | undefined;
    const pf = rs ? (rs.fpts ?? 0) + (rs.fpts_decimal ?? 0) / 100 : 0;
    const pa = rs ? (rs.fpts_against ?? 0) + (rs.fpts_against_decimal ?? 0) / 100 : 0;

    const splitKey = Object.keys(splits).find(
      (k) => splits[k].teamName.toLowerCase() === team.teamName.toLowerCase()
    );
    const split = splitKey ? splits[splitKey] : null;
    const regG = split ? split.regular.wins + split.regular.losses + split.regular.ties : 0;

    const champHistory = Object.entries(CHAMPIONS)
      .filter(([, c]) =>
        c.champion === team.teamName ||
        c.runnerUp === team.teamName ||
        (c as { thirdPlace?: string }).thirdPlace === team.teamName,
      )
      .map(([year, c]) => ({
        year: Number(year),
        finish: c.champion === team.teamName ? '1st (Champion)'
          : c.runnerUp === team.teamName ? '2nd (Runner-up)' : '3rd Place',
      }))
      .sort((a, b) => a.year - b.year);

    const futurePicks = (picksByOwner[team.teamName] ?? [])
      .sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round);

    return {
      teamId: team.rosterId,
      rosterId: team.rosterId,
      teamName: team.teamName,
      logoUrl: getTeamLogoPath(team.teamName),
      currentSeason: {
        season: CURRENT_SEASON,
        wins: rs?.wins ?? 0,
        losses: rs?.losses ?? 0,
        ties: rs?.ties ?? 0,
        pf: Math.round(pf * 100) / 100,
        pa: Math.round(pa * 100) / 100,
      },
      allTimeStats: split ? {
        regularSeason: {
          wins: split.regular.wins, losses: split.regular.losses, ties: split.regular.ties,
          winPct: regG > 0 ? Math.round((split.regular.wins / regG) * 1000) / 10 : 0,
          pf: Math.round(split.regular.pf * 100) / 100,
          pa: Math.round(split.regular.pa * 100) / 100,
        },
        playoffs: { wins: split.playoffs.wins, losses: split.playoffs.losses },
      } : null,
      championships: champs[team.teamName] ?? 0,
      runnerUps: runnerUpCounts[team.teamName] ?? 0,
      championshipHistory: champHistory,
      roster: {
        active: players.filter((p) => p.slot === 'active'),
        ir: players.filter((p) => p.slot === 'ir'),
        taxi: players.filter((p) => p.slot === 'taxi'),
      },
      futurePicks,
      pickCount: futurePicks.length,
      firstRoundPickCount: futurePicks.filter((p) => p.round === 1).length,
    };
  });

  overview.sort((a, b) => b.currentSeason.wins - a.currentSeason.wins || b.currentSeason.pf - a.currentSeason.pf);

  const overviewResult = {
    ok: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    data: {
      fetchedAt: new Date().toISOString(),
      source: 'sleeper-live + static-constants',
      cacheStatus: 'live' as const,
      season: CURRENT_SEASON,
      teamCount: overview.length,
      teams: overview,
    },
  };
  _overviewCache = { ts: Date.now(), data: overviewResult };
  return overviewResult;
}

// ─── tool: get_position_rooms ──────────────────────────────────────────────────

const POS_ORDER_ROOMS = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DL', 'LB', 'DB'];

export async function handleGetPositionRooms(input: { team?: string; position?: string }) {
  const posFilter = (input.position ?? '').toUpperCase().trim();
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };
  const warnings: string[] = [];

  const [teams, rosters, allPlayers] = await Promise.all([
    getTeamsData(leagueId, opts).catch((e: Error) => { warnings.push(`Teams failed: ${e.message}`); return []; }),
    getLeagueRosters(leagueId, opts).catch((e: Error) => { warnings.push(`Rosters failed: ${e.message}`); return [] as SleeperRoster[]; }),
    getAllPlayersCached().catch((e: Error) => { warnings.push(`Players failed: ${e.message}`); return {} as Record<string, SleeperPlayer>; }),
  ]);

  const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));

  let resolvedTeamName: string | null = null;
  if (input.team) {
    const resolution = resolveTeam(input.team, teams.map((t) => t.teamName));
    if (!resolution.matchedTeam) {
      warnings.push(resolution.candidates.length > 1
        ? `Ambiguous team "${input.team}" — matched: ${resolution.candidates.join(', ')}. Showing all teams.`
        : `No team matching "${input.team}". Showing all teams.`);
    } else {
      resolvedTeamName = resolution.matchedTeam;
    }
  }

  const result = teams
    .filter((t) => !resolvedTeamName || t.teamName === resolvedTeamName)
    .map((team) => {
      const r = rosterById.get(team.rosterId);
      const irSet = new Set<string>(r?.reserve ?? []);
      const taxiSet = new Set<string>(r?.taxi ?? []);
      const activeIds = (r?.players ?? team.players ?? []).filter(
        (pid) => pid && !irSet.has(pid) && !taxiSet.has(pid)
      );

      const byPos: Record<string, Array<{ playerId: string; playerName: string; position: string; nflTeam: string | null; injuryStatus: string | null }>> = {};

      for (const pid of activeIds) {
        const p = allPlayers[pid] as SleeperPlayer | undefined;
        const pos = p?.position ?? 'UNKN';
        if (posFilter && pos !== posFilter) continue;
        if (!byPos[pos]) byPos[pos] = [];
        byPos[pos].push({
          playerId: pid,
          playerName: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || pid : pid,
          position: pos,
          nflTeam: p?.team ?? null,
          injuryStatus: p?.injury_status ?? p?.status ?? null,
        });
      }

      const sortedRooms = Object.entries(byPos)
        .sort(([a], [b]) => {
          const ai = POS_ORDER_ROOMS.indexOf(a);
          const bi = POS_ORDER_ROOMS.indexOf(b);
          if (ai === -1 && bi === -1) return a.localeCompare(b);
          if (ai === -1) return 1; if (bi === -1) return -1;
          return ai - bi;
        })
        .reduce<Record<string, typeof byPos[string]>>((acc, [pos, ps]) => { acc[pos] = ps; return acc; }, {});

      const summary: Record<string, number> = {};
      for (const [pos, ps] of Object.entries(byPos)) summary[pos] = ps.length;

      return {
        teamName: team.teamName,
        rosterId: team.rosterId,
        positionRooms: sortedRooms,
        summary,
      };
    });

  return {
    ok: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    data: {
      fetchedAt: new Date().toISOString(),
      source: 'sleeper-live',
      season: CURRENT_SEASON,
      positionFilter: posFilter || null,
      teamFilter: resolvedTeamName,
      teams: result,
    },
  };
}

// ─── tool: compare_teams ──────────────────────────────────────────────────────

export async function handleCompareTeams(input: { team1?: string; team2?: string }) {
  if (!input.team1) throw new McpError('missing_param', 'Provide team1');
  if (!input.team2) throw new McpError('missing_param', 'Provide team2');

  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 18000 };
  const warnings: string[] = [];

  const [teams, rosters, allPlayers, splits] = await Promise.all([
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getSplitRecordsAllTime(opts).catch(() => ({} as Record<string, { teamName: string; regular: { wins: number; losses: number; ties: number; pf: number; pa: number }; playoffs: { wins: number; losses: number; ties: number; pf: number; pa: number }; toilet: { wins: number; losses: number; ties: number; pf: number; pa: number } }>)),
  ]);

  const teamNames = teams.map((t) => t.teamName);
  const res1 = resolveTeam(input.team1, teamNames);
  const res2 = resolveTeam(input.team2, teamNames);

  if (!res1.matchedTeam) {
    throw new McpError('not_found', `No team matching "${input.team1}". ${res1.candidates.length > 1 ? `Multiple matches: ${res1.candidates.join(', ')}` : `Available: ${teamNames.join(', ')}` }`);
  }
  if (!res2.matchedTeam) {
    throw new McpError('not_found', `No team matching "${input.team2}". ${res2.candidates.length > 1 ? `Multiple matches: ${res2.candidates.join(', ')}` : `Available: ${teamNames.join(', ')}` }`);
  }
  if (res1.matchedTeam === res2.matchedTeam) {
    throw new McpError('invalid_input', `Both names resolved to the same team: "${res1.matchedTeam}". Provide two different teams.`);
  }

  if (res1.confidence !== 'exact') warnings.push(`"${input.team1}" resolved to "${res1.matchedTeam}" (${res1.confidence}).`);
  if (res2.confidence !== 'exact') warnings.push(`"${input.team2}" resolved to "${res2.matchedTeam}" (${res2.confidence}).`);

  const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));
  const champs = champCounts();

  function buildSnapshot(teamName: string) {
    const team = teams.find((t) => t.teamName === teamName)!;
    const r = rosterById.get(team.rosterId);
    const irSet = new Set<string>(r?.reserve ?? []);
    const taxiSet = new Set<string>(r?.taxi ?? []);
    const allIds: string[] = r?.players ?? team.players ?? [];

    const players = allIds.filter(Boolean).map((pid) => {
      const p = allPlayers[pid] as SleeperPlayer | undefined;
      return {
        playerId: pid,
        playerName: p ? `${p.first_name || ''} ${p.last_name || ''}`.trim() || pid : pid,
        position: p?.position ?? null,
        nflTeam: p?.team ?? null,
        injuryStatus: p?.injury_status ?? p?.status ?? null,
        slot: irSet.has(pid) ? 'ir' : taxiSet.has(pid) ? 'taxi' : 'active',
      };
    });

    const rs = r?.settings as { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number; fpts_against?: number; fpts_against_decimal?: number } | undefined;
    const pf = rs ? (rs.fpts ?? 0) + (rs.fpts_decimal ?? 0) / 100 : 0;
    const pa = rs ? (rs.fpts_against ?? 0) + (rs.fpts_against_decimal ?? 0) / 100 : 0;

    const splitKey = Object.keys(splits).find((k) => splits[k].teamName.toLowerCase() === teamName.toLowerCase());
    const split = splitKey ? splits[splitKey] : null;

    const champHistory = Object.entries(CHAMPIONS)
      .filter(([, c]) => c.champion === teamName || c.runnerUp === teamName || (c as { thirdPlace?: string }).thirdPlace === teamName)
      .map(([year, c]) => ({ year: Number(year), finish: c.champion === teamName ? '1st (Champion)' : c.runnerUp === teamName ? '2nd (Runner-up)' : '3rd Place' }))
      .sort((a, b) => a.year - b.year);

    const active = players.filter((p) => p.slot === 'active');
    const byPos: Record<string, string[]> = {};
    for (const p of active) {
      const pos = p.position ?? 'UNKN';
      if (!byPos[pos]) byPos[pos] = [];
      byPos[pos].push(p.playerName);
    }

    return {
      teamName, rosterId: team.rosterId, logoUrl: getTeamLogoPath(teamName),
      currentSeason: { season: CURRENT_SEASON, wins: rs?.wins ?? 0, losses: rs?.losses ?? 0, ties: rs?.ties ?? 0, pf: Math.round(pf * 100) / 100, pa: Math.round(pa * 100) / 100 },
      allTimeStats: split ? { regularSeason: { wins: split.regular.wins, losses: split.regular.losses }, playoffs: { wins: split.playoffs.wins, losses: split.playoffs.losses } } : null,
      championships: champs[teamName] ?? 0,
      championshipHistory: champHistory,
      positionRooms: byPos,
      roster: { active, ir: players.filter((p) => p.slot === 'ir'), taxi: players.filter((p) => p.slot === 'taxi') },
    };
  }

  return {
    ok: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    data: {
      fetchedAt: new Date().toISOString(),
      source: 'sleeper-live + static-constants',
      team1: buildSnapshot(res1.matchedTeam),
      team2: buildSnapshot(res2.matchedTeam),
    },
  };
}

// ─── tool: get_future_pick_board ──────────────────────────────────────────────

export async function handleGetFuturePickBoard() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };
  const warnings: string[] = [];

  const teams = await getTeamsData(leagueId, opts).catch((e: Error) => {
    warnings.push(`Teams fetch failed: ${e.message}`);
    return [];
  });

  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));
  type TradedPickRaw = { season?: string | number; round?: number; roster_id?: number; owner_id?: number };
  let tradedPicks: TradedPickRaw[] = [];
  try {
    const resp = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, {
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    });
    if (resp.ok) tradedPicks = (await resp.json()) as TradedPickRaw[];
  } catch (e) {
    warnings.push(`Future picks fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  const byOwner: Record<string, Array<{ season: string; round: number; originalTeam: string; currentOwner: string; traded: boolean; display: string }>> = {};
  for (const t of teams) byOwner[t.teamName] = [];

  for (const tp of tradedPicks) {
    try {
      const season = String(tp.season ?? '');
      const origTeam = rosterIdToName.get(Number(tp.roster_id)) ?? `Roster ${tp.roster_id}`;
      const ownerTeam = rosterIdToName.get(Number(tp.owner_id)) ?? `Roster ${tp.owner_id}`;
      const round = Number(tp.round ?? 0);
      const ord = PICK_ORDINAL[round] ?? `${round}th`;
      const traded = origTeam !== ownerTeam;
      const display = traded ? `${season} ${ord} from ${origTeam}` : `${season} ${ord} (own)`;
      if (!byOwner[ownerTeam]) byOwner[ownerTeam] = [];
      byOwner[ownerTeam].push({ season, round, originalTeam: origTeam, currentOwner: ownerTeam, traded, display });
    } catch (e) {
      warnings.push(`Skipped one pick: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const board = Object.entries(byOwner)
    .map(([teamName, picks]) => {
      const sorted = picks.sort((a, b) => a.season.localeCompare(b.season) || a.round - b.round);
      return {
        teamName,
        rosterId: teams.find((t) => t.teamName === teamName)?.rosterId ?? null,
        picks: sorted,
        totalPicks: sorted.length,
        firstRoundPicks: sorted.filter((p) => p.round === 1).length,
        tradedPicksOwned: sorted.filter((p) => p.traded).length,
      };
    })
    .sort((a, b) => b.totalPicks - a.totalPicks || b.firstRoundPicks - a.firstRoundPicks);

  return {
    ok: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    data: {
      fetchedAt: new Date().toISOString(),
      source: 'sleeper-live',
      cacheStatus: 'live',
      leagueNote: 'Includes only traded picks tracked by Sleeper. Each team also retains all of their own un-traded picks.',
      board,
    },
  };
}

// ─── markdown formatters for new tools ───────────────────────────────────────

export function formatLeagueOverviewMarkdown(data: unknown): string {
  const r = data as { data?: { season: string; fetchedAt: string; teams: Array<{ teamName: string; currentSeason: { wins: number; losses: number; pf: number; pa: number }; championships: number; pickCount: number; firstRoundPickCount: number; roster: { active: unknown[]; ir: unknown[]; taxi: unknown[] } }> } };
  if (!r?.data) return '⚠️ League overview data unavailable.';
  const { season, teams, fetchedAt } = r.data;
  const lines: string[] = [
    `## 🏆 East v. West League Overview — ${season}`,
    `*${teams.length} teams · Live from Sleeper · ${new Date(fetchedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET*`,
    '',
    '### 📊 Current Standings',
    '| # | Team | W-L | PF | PA | 🏆 |',
    '|---|------|-----|-----|-----|-----|',
  ];
  teams.forEach((t, i) => {
    const champ = t.championships > 0 ? `${t.championships}x` : '—';
    lines.push(`| ${i + 1} | **${t.teamName}** | ${t.currentSeason.wins}-${t.currentSeason.losses} | ${t.currentSeason.pf} | ${t.currentSeason.pa} | ${champ} |`);
  });
  lines.push('');
  const draftRich = [...teams].sort((a, b) => b.pickCount - a.pickCount).slice(0, 6).filter((t) => t.pickCount > 0);
  if (draftRich.length > 0) {
    lines.push('### 🎯 Draft Capital Leaders');
    for (const t of draftRich) lines.push(`- **${t.teamName}** — ${t.pickCount} picks (${t.firstRoundPickCount} 1sts)`);
    lines.push('');
  }
  lines.push('### 📋 Roster Sizes (active / IR / taxi)');
  for (const t of teams) lines.push(`- **${t.teamName}**: ${t.roster.active.length} active, ${t.roster.ir.length} IR, ${t.roster.taxi.length} taxi`);
  lines.push('');
  lines.push(`*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

export function formatPositionRoomsMarkdown(data: unknown): string {
  const r = data as { data?: { positionFilter: string | null; teamFilter: string | null; fetchedAt: string; teams: Array<{ teamName: string; positionRooms: Record<string, Array<{ playerName: string; injuryStatus?: string | null }>> }> } };
  if (!r?.data) return '⚠️ Position room data unavailable.';
  const { positionFilter, teamFilter, teams, fetchedAt } = r.data;
  const title = positionFilter ? `${positionFilter} Rooms` : 'All Position Rooms';
  const lines: string[] = [
    `## 🏈 ${title} — ${teamFilter ?? 'League-wide'}`,
    `*Active rosters only · ${new Date(fetchedAt).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET*`,
    '',
  ];
  for (const t of teams) {
    lines.push(`### ${t.teamName}`);
    const rooms = Object.entries(t.positionRooms);
    if (rooms.length === 0) {
      lines.push('*No players.*');
    } else {
      for (const [pos, players] of rooms) {
        const names = players.map((p) => `${p.playerName}${p.injuryStatus ? ` *(${p.injuryStatus})*` : ''}`).join(', ');
        lines.push(`- **${pos}** (${players.length}): ${names}`);
      }
    }
    lines.push('');
  }
  lines.push(`*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

export function formatCompareTeamsMarkdown(data: unknown): string {
  type Snap = { teamName: string; currentSeason: { wins: number; losses: number; pf: number; pa: number }; allTimeStats: { regularSeason: { wins: number; losses: number }; playoffs: { wins: number; losses: number } } | null; championships: number; positionRooms: Record<string, string[]>; roster: { ir: unknown[]; taxi: unknown[] } };
  const r = data as { warnings?: string[]; data?: { team1: Snap; team2: Snap } };
  if (!r?.data) return '⚠️ Comparison data unavailable.';
  const { team1: t1, team2: t2 } = r.data;
  const lines: string[] = [
    `## ⚔️ ${t1.teamName}  vs.  ${t2.teamName}`,
    '',
    '### 📊 Current Season',
    `| Stat | ${t1.teamName} | ${t2.teamName} |`,
    '|------|---|---|',
    `| Record | ${t1.currentSeason.wins}-${t1.currentSeason.losses} | ${t2.currentSeason.wins}-${t2.currentSeason.losses} |`,
    `| PF | ${t1.currentSeason.pf} | ${t2.currentSeason.pf} |`,
    `| PA | ${t1.currentSeason.pa} | ${t2.currentSeason.pa} |`,
    `| Championships | ${t1.championships} | ${t2.championships} |`,
    '',
  ];
  if (t1.allTimeStats && t2.allTimeStats) {
    lines.push('### 📈 All-Time');
    lines.push(`| Stat | ${t1.teamName} | ${t2.teamName} |`);
    lines.push('|------|---|---|');
    lines.push(`| Reg W-L | ${t1.allTimeStats.regularSeason.wins}-${t1.allTimeStats.regularSeason.losses} | ${t2.allTimeStats.regularSeason.wins}-${t2.allTimeStats.regularSeason.losses} |`);
    lines.push(`| Playoff W-L | ${t1.allTimeStats.playoffs.wins}-${t1.allTimeStats.playoffs.losses} | ${t2.allTimeStats.playoffs.wins}-${t2.allTimeStats.playoffs.losses} |`);
    lines.push('');
  }
  function fmtRooms(rooms: Record<string, string[]>): string[] {
    return Object.entries(rooms).map(([pos, names]) => `- **${pos}**: ${names.join(', ')}`);
  }
  lines.push(`### 🏈 ${t1.teamName} Active Roster`);
  const r1 = fmtRooms(t1.positionRooms);
  lines.push(...(r1.length ? r1 : ['*No active players.*']));
  if (t1.roster.ir.length) lines.push(`- *IR: ${t1.roster.ir.length} player(s)*`);
  if (t1.roster.taxi.length) lines.push(`- *Taxi: ${t1.roster.taxi.length} player(s)*`);
  lines.push('');
  lines.push(`### 🏈 ${t2.teamName} Active Roster`);
  const r2 = fmtRooms(t2.positionRooms);
  lines.push(...(r2.length ? r2 : ['*No active players.*']));
  if (t2.roster.ir.length) lines.push(`- *IR: ${t2.roster.ir.length} player(s)*`);
  if (t2.roster.taxi.length) lines.push(`- *Taxi: ${t2.roster.taxi.length} player(s)*`);
  lines.push('');
  if (r.warnings?.length) lines.push(`*⚠️ ${r.warnings.join(' ')}*`);
  lines.push(`*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

export function formatFuturePickBoardMarkdown(data: unknown): string {
  const r = data as { data?: { leagueNote: string; board: Array<{ teamName: string; totalPicks: number; firstRoundPicks: number; picks: Array<{ display: string }> }> } };
  if (!r?.data) return '⚠️ Pick board data unavailable.';
  const { board, leagueNote } = r.data;
  const lines: string[] = [
    '## 🎯 Future Pick Board',
    '*Sorted by total picks held · Traded picks only (each team also retains all un-traded own picks)*',
    '',
  ];
  for (const entry of board) {
    if (entry.totalPicks === 0) {
      lines.push(`**${entry.teamName}** — no traded picks tracked`);
    } else {
      lines.push(`**${entry.teamName}** — ${entry.totalPicks} picks (${entry.firstRoundPicks} 1st-round)`);
      for (const pick of entry.picks) lines.push(`  - ${pick.display}`);
    }
    lines.push('');
  }
  lines.push(`*${leagueNote}*`);
  lines.push(`*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

// ─── trade analyzer ───────────────────────────────────────────────────────────

export async function handleAnalyzeTrade(input: {
  side_a: string[];
  side_b: string[];
  source?: ValueSource;
}) {
  const { side_a, side_b, source = 'avg' } = input;
  if (!side_a?.length || !side_b?.length)
    throw new McpError('missing_param', 'Both side_a and side_b must be non-empty arrays of player/pick names.');

  const values = await getTradeValues();
  const { assets: assetsA, unmatched: unmatchedA } = resolveAssets(side_a, values);
  const { assets: assetsB, unmatched: unmatchedB } = resolveAssets(side_b, values);

  const result = analyzeTrade(assetsA, assetsB, source);

  const perPlayerA = assetsA.map((a) => ({
    name: a.name,
    position: a.position,
    nflTeam: a.nflTeam,
    value: getDisplayValue(a, source),
    fcValue: a.fcValue,
    ktcValue: a.ktcValue,
    isPick: a.isPick,
    trend: a.trend,
  }));

  const perPlayerB = assetsB.map((a) => ({
    name: a.name,
    position: a.position,
    nflTeam: a.nflTeam,
    value: getDisplayValue(a, source),
    fcValue: a.fcValue,
    ktcValue: a.ktcValue,
    isPick: a.isPick,
    trend: a.trend,
  }));

  return {
    analysis: result,
    sideA: {
      assets: perPlayerA,
      posSummary: buildPosSummary(assetsA),
      rawTotal: result.rawA,
      effectiveTotal: result.effA,
      grade: result.sideAGrade,
    },
    sideB: {
      assets: perPlayerB,
      posSummary: buildPosSummary(assetsB),
      rawTotal: result.rawB,
      effectiveTotal: result.effB,
      grade: result.sideBGrade,
    },
    unmatched: { sideA: unmatchedA, sideB: unmatchedB },
    source,
    meta: {
      tool: 'analyze_trade',
      source: 'east-v-west-api',
      valueSources: 'FantasyCalc + KeepTradeCut (avg)',
      fetchedAt: new Date().toISOString(),
    },
  };
}

export async function handleGetPlayerValues(input: { players: string[] }) {
  const { players } = input;
  if (!players?.length)
    throw new McpError('missing_param', 'players must be a non-empty array of player or pick names.');
  if (players.length > 12)
    throw new McpError('invalid_param', 'Maximum 12 players per request. Split into multiple calls if needed.');

  const values = await getTradeValues();
  const results: Array<{
    query: string;
    found: boolean;
    name?: string;
    position?: string;
    nflTeam?: string;
    value?: number;
    fcValue?: number | null;
    ktcValue?: number | null;
    rank?: number;
    trend?: number;
    age?: number;
    isPick?: boolean;
  }> = [];

  for (const query of players) {
    const { assets, unmatched } = resolveAssets([query], values);
    if (assets.length > 0) {
      const a = assets[0];
      const raw = Object.values(values).find((v) => v.sleeperId === a.key);
      results.push({
        query,
        found: true,
        name: a.name,
        position: a.position,
        nflTeam: a.nflTeam,
        value: a.value,
        fcValue: a.fcValue,
        ktcValue: a.ktcValue,
        rank: raw?.rank,
        trend: a.trend,
        age: a.age,
        isPick: a.isPick,
      });
    } else {
      results.push({ query: unmatched[0] ?? query, found: false });
    }
  }

  return {
    players: results,
    meta: {
      tool: 'get_player_values',
      source: 'east-v-west-api',
      valueSources: 'FantasyCalc + KeepTradeCut (avg)',
      scale: '0–10,000 (higher = more valuable)',
      fetchedAt: new Date().toISOString(),
    },
  };
}

// ─── trade analyzer markdown formatters ───────────────────────────────────────

export function formatAnalyzeTradeMarkdown(data: ReturnType<typeof handleAnalyzeTrade> extends Promise<infer T> ? T : never): string {
  const { analysis: r, sideA, sideB, unmatched, source } = data;

  const gradeEmoji = (g: string) =>
    g.startsWith('A') ? '🟢' : g.startsWith('B') ? '🟡' : g === '—' ? '⚪' : '🔴';

  const assetLine = (a: { name: string; position: string; nflTeam: string; value: number; trend: number; isPick: boolean }) => {
    const trend = a.trend > 100 ? ' ↑' : a.trend < -100 ? ' ↓' : '';
    const pos = a.isPick ? 'PICK' : a.position;
    return `  - **${a.name}** (${pos}${a.nflTeam ? ` · ${a.nflTeam}` : ''}) — ${a.value.toLocaleString()}${trend}`;
  };

  const lines: string[] = [
    `## ⚖️ Trade Analysis — ${r.verdict}`,
    '',
    `| | Side A | Side B |`,
    `|---|---|---|`,
    `| **Grade** | ${gradeEmoji(sideA.grade)} **${sideA.grade}** | ${gradeEmoji(sideB.grade)} **${sideB.grade}** |`,
    `| **Effective Value** | ${r.effA.toLocaleString()} | ${r.effB.toLocaleString()} |`,
    `| **Raw Market Total** | ${r.rawA.toLocaleString()} | ${r.rawB.toLocaleString()} |`,
    `| **Assets** | ${sideA.posSummary || '—'} | ${sideB.posSummary || '—'} |`,
    '',
  ];

  if (r.winner) {
    lines.push(`**Winner: Side ${r.winner}** by ~${r.diff.toLocaleString()} effective pts (ratio ${(r.ratio * 100).toFixed(0)}%)`);
  } else {
    lines.push(`**Fair trade** — both sides within 92% of each other.`);
  }

  if (r.notes.length) {
    lines.push('');
    for (const n of r.notes) lines.push(`> ${n}`);
  }

  if (r.counterHint) {
    lines.push('');
    lines.push(`💡 *${r.counterHint}*`);
  }

  lines.push('', '### Side A');
  for (const a of sideA.assets) lines.push(assetLine(a));

  lines.push('', '### Side B');
  for (const a of sideB.assets) lines.push(assetLine(a));

  const allUnmatched = [...(unmatched.sideA ?? []), ...(unmatched.sideB ?? [])];
  if (allUnmatched.length) {
    lines.push('', `⚠️ *Could not find values for: ${allUnmatched.join(', ')}. Try a more specific name.*`);
  }

  lines.push('', `*Values: ${source === 'fc' ? 'FantasyCalc' : source === 'ktc' ? 'KeepTradeCut' : 'FC + KTC average'} · Dynasty SF · ${FRESHNESS()}*`);
  return lines.join('\n');
}

export function formatPlayerValuesMarkdown(data: ReturnType<typeof handleGetPlayerValues> extends Promise<infer T> ? T : never): string {
  const { players } = data;
  const found = players.filter((p) => p.found);
  const notFound = players.filter((p) => !p.found);

  const trendStr = (t?: number) => (t ?? 0) > 100 ? ' ↑' : (t ?? 0) < -100 ? ' ↓' : '';

  const lines: string[] = ['## 📊 Dynasty Trade Values'];

  if (found.length) {
    lines.push('', '| Player | Pos | NFL Team | Value | FC | KTC | Rank | Trend |');
    lines.push('|---|---|---|---|---|---|---|---|');
    for (const p of found) {
      const fc = p.fcValue != null ? p.fcValue.toLocaleString() : '—';
      const ktc = p.ktcValue != null ? p.ktcValue.toLocaleString() : '—';
      const rank = p.rank != null ? `#${p.rank}` : '—';
      const trend = trendStr(p.trend);
      const pos = p.isPick ? 'PICK' : (p.position ?? '—');
      lines.push(`| **${p.name}** | ${pos} | ${p.nflTeam || '—'} | **${(p.value ?? 0).toLocaleString()}** | ${fc} | ${ktc} | ${rank} | ${trend || '—'} |`);
    }
  }

  if (notFound.length) {
    lines.push('', `⚠️ *No value found for: ${notFound.map((p) => p.query).join(', ')}. Try a more specific name or check spelling.*`);
  }

  lines.push('', `*Source: FantasyCalc + KTC average · Dynasty SF · ${FRESHNESS()}*`);
  return lines.join('\n');
}

// ─── tool: get_trade_block ────────────────────────────────────────────────────

const TRADE_BLOCKS_BASE = 'https://east-v-west-website.vercel.app';
const PICK_ORD_TB = ['', '1st', '2nd', '3rd', '4th', '5th'];

export async function handleGetTradeBlock(input: { team?: string }) {
  const teamFilter = (input.team ?? '').trim().toLowerCase();

  const [tbRes, allPlayers] = await Promise.all([
    fetch(`${TRADE_BLOCKS_BASE}/api/teams/trade-blocks`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    }),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
  ]);
  if (!tbRes.ok) throw new McpError('upstream_error', `Trade block API returned ${tbRes.status}`);

  type RawAsset =
    | { type: 'player'; playerId: string }
    | { type: 'pick'; year: number; round: number; originalTeam?: string }
    | { type: 'faab'; amount?: number };
  const json = (await tbRes.json()) as {
    teams: Array<{
      team: string;
      tradeBlock: RawAsset[];
      tradeWants: { text?: string; positions?: string[] } | null;
      updatedAt: string | null;
    }>;
  };

  const teams = json.teams
    .filter((t) => !teamFilter || t.team.toLowerCase().includes(teamFilter))
    .map((t) => {
      const assets = (t.tradeBlock ?? []).map((a) => {
        if (a.type === 'player') {
          const p = allPlayers[a.playerId] as SleeperPlayer | undefined;
          const name = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || a.playerId : a.playerId;
          return { type: 'player' as const, playerId: a.playerId, name, position: p?.position ?? null, nflTeam: p?.team ?? null, injuryStatus: p?.injury_status ?? p?.status ?? null };
        }
        if (a.type === 'pick') {
          const ord = PICK_ORD_TB[a.round] ?? `${a.round}th`;
          const suffix = a.originalTeam && a.originalTeam !== t.team ? ` (from ${a.originalTeam})` : '';
          return { type: 'pick' as const, display: `${a.year} ${ord}${suffix}`, year: a.year, round: a.round, originalTeam: a.originalTeam ?? null };
        }
        return { type: 'faab' as const, display: `$${(a as { amount?: number }).amount ?? '?'} FAAB` };
      });
      return {
        team: t.team,
        assets,
        assetCount: assets.length,
        wants: t.tradeWants?.text ?? null,
        wantedPositions: t.tradeWants?.positions ?? [],
        updatedAt: t.updatedAt,
      };
    });

  const active = teams.filter((t) => t.assetCount > 0);
  return {
    ok: true,
    data: {
      fetchedAt: new Date().toISOString(),
      source: 'east-v-west-trade-blocks',
      teamFilter: teamFilter || null,
      teamsWithAssets: active.length,
      teams: active.length > 0 ? active : teams,
    },
  };
}

export function formatTradeBlockMarkdown(data: ReturnType<typeof handleGetTradeBlock> extends Promise<infer T> ? T : never): string {
  if (!data?.data) return '⚠️ Trade block data unavailable.';
  const { teams, teamsWithAssets } = data.data;

  const lines: string[] = [
    `## 📋 League Trade Block`,
    `*${teamsWithAssets} team${teamsWithAssets !== 1 ? 's' : ''} with assets listed · ${FRESHNESS()}*`,
    '',
  ];

  if (teams.length === 0) {
    lines.push('*No teams currently have assets on the trade block.*');
    return lines.join('\n');
  }

  for (const t of teams) {
    lines.push(`### ${t.team}`);
    if (t.assets.length === 0) {
      lines.push('*No assets listed.*');
    } else {
      for (const a of t.assets) {
        if (a.type === 'player') {
          const inj = a.injuryStatus ? ` *(${a.injuryStatus})*` : '';
          lines.push(`- **${a.name}** (${a.position ?? '?'}${a.nflTeam ? ` · ${a.nflTeam}` : ''})${inj}`);
        } else if (a.type === 'pick') {
          lines.push(`- 🎯 ${a.display}`);
        } else {
          lines.push(`- 💰 ${(a as { display: string }).display}`);
        }
      }
    }
    if (t.wants) lines.push(`*Wants: ${t.wants}*`);
    if (t.wantedPositions.length) lines.push(`*Looking for: ${t.wantedPositions.join(', ')}*`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── tool: get_power_rankings ─────────────────────────────────────────────────

export async function handleGetPowerRankings() {
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };

  const [teams, rosters, state] = await Promise.all([
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
    getNFLState().catch(() => null),
  ]);

  const currentWeek = (state as { week?: number } | null)?.week ?? 1;
  const recentWeeks = Array.from(
    new Set([Math.max(1, currentWeek - 2), Math.max(1, currentWeek - 1), currentWeek])
  );

  const weekMatchups = await Promise.all(
    recentWeeks.map((w) => getLeagueMatchups(leagueId, w, opts).catch(() => [] as SleeperMatchup[]))
  );

  const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));

  // Count recent wins per roster_id
  const recentWinsMap = new Map<number, number>();
  for (const wk of weekMatchups) {
    const byMatchup = new Map<number, SleeperMatchup[]>();
    for (const m of wk) {
      if (!byMatchup.has(m.matchup_id)) byMatchup.set(m.matchup_id, []);
      byMatchup.get(m.matchup_id)!.push(m);
    }
    for (const pair of byMatchup.values()) {
      if (pair.length !== 2) continue;
      const [a, b] = pair;
      const winner = (a.points ?? 0) >= (b.points ?? 0) ? a : b;
      recentWinsMap.set(winner.roster_id, (recentWinsMap.get(winner.roster_id) ?? 0) + 1);
    }
  }

  const stats = teams.map((team) => {
    const r = rosterById.get(team.rosterId);
    const rs = r?.settings as { wins?: number; losses?: number; ties?: number; fpts?: number; fpts_decimal?: number } | undefined;
    const wins = rs?.wins ?? 0;
    const losses = rs?.losses ?? 0;
    const ties = rs?.ties ?? 0;
    const games = wins + losses + ties;
    const pf = (rs?.fpts ?? 0) + (rs?.fpts_decimal ?? 0) / 100;
    const winPct = games > 0 ? wins / games : 0.5;
    const rw = recentWinsMap.get(team.rosterId) ?? 0;
    const recentWPct = recentWeeks.length > 0 ? rw / recentWeeks.length : 0.5;
    return { teamName: team.teamName, wins, losses, ties, pf, winPct, recentWins: rw, recentWPct };
  });

  const sortedByPF = [...stats].sort((a, b) => b.pf - a.pf);
  const pfRank = new Map(sortedByPF.map((t, i) => [t.teamName, i]));
  const maxRank = Math.max(stats.length - 1, 1);

  const scored = stats.map((t) => {
    const pfPct = (maxRank - (pfRank.get(t.teamName) ?? 0)) / maxRank;
    const score = Math.round(t.winPct * 40 + pfPct * 30 + t.recentWPct * 30);
    const tier = score >= 75 ? 'Elite' : score >= 55 ? 'Contender' : score >= 40 ? 'Fringe' : 'Rebuilding';
    return { ...t, pfPercentile: Math.round(pfPct * 100), score, tier };
  }).sort((a, b) => b.score - a.score || b.pf - a.pf);

  return {
    ok: true,
    data: {
      fetchedAt: new Date().toISOString(),
      source: 'sleeper-live',
      season: CURRENT_SEASON,
      week: currentWeek,
      method: 'record(40%) + PF-percentile(30%) + last-3-weeks(30%)',
      rankings: scored.map((t, i) => ({
        rank: i + 1,
        teamName: t.teamName,
        score: t.score,
        tier: t.tier,
        record: `${t.wins}-${t.losses}${t.ties > 0 ? `-${t.ties}` : ''}`,
        pf: Math.round(t.pf * 10) / 10,
        pfPercentile: t.pfPercentile,
        recentForm: `${t.recentWins}-${recentWeeks.length - t.recentWins} (last ${recentWeeks.length} wks)`,
      })),
    },
  };
}

export function formatPowerRankingsMarkdown(data: ReturnType<typeof handleGetPowerRankings> extends Promise<infer T> ? T : never): string {
  if (!data?.data) return '⚠️ Power rankings data unavailable.';
  const { rankings, week, season, method } = data.data;

  const tierEmoji = (tier: string) =>
    tier === 'Elite' ? '🟢' : tier === 'Contender' ? '🟡' : tier === 'Fringe' ? '🟠' : '🔴';

  const lines: string[] = [
    `## ⚡ Power Rankings — ${season} Week ${week}`,
    `*Formula: ${method}*`,
    '',
    '| Rank | Team | Score | Tier | Record | PF | Recent |',
    '|------|------|-------|------|--------|----|--------|',
  ];

  for (const r of rankings) {
    lines.push(`| **${r.rank}** | ${r.teamName} | **${r.score}** | ${tierEmoji(r.tier)} ${r.tier} | ${r.record} | ${r.pf} | ${r.recentForm} |`);
  }

  lines.push('', `*Live from Sleeper · ${FRESHNESS()}*`);
  return lines.join('\n');
}

// ─── tool: analyze_roster ─────────────────────────────────────────────────────

const SKILL_POS = ['QB', 'RB', 'WR', 'TE'];

export async function handleAnalyzeRoster(input: { name?: string }) {
  if (!input.name?.trim()) throw new McpError('missing_param', 'Provide a team name.');
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };

  const [teams, rosters, allPlayers, values] = await Promise.all([
    getTeamsData(leagueId, opts),
    getLeagueRosters(leagueId, opts),
    getAllPlayersCached(),
    getTradeValues().catch(() => null),
  ]);

  const teamNames = teams.map((t) => t.teamName);
  const { matchedTeam } = resolveTeam(input.name.trim(), teamNames);
  if (!matchedTeam) throw new McpError('not_found', `No team matching "${input.name}". Available: ${teamNames.join(', ')}`);

  const team = teams.find((t) => t.teamName === matchedTeam)!;
  const r = rosters.find((ros) => ros.roster_id === team.rosterId);
  const irSet = new Set<string>(r?.reserve ?? []);
  const taxiSet = new Set<string>(r?.taxi ?? []);
  const activeIds = (r?.players ?? team.players ?? []).filter((pid) => pid && !irSet.has(pid) && !taxiSet.has(pid));

  const byPos: Record<string, Array<{ name: string; value: number | null; rank: number | null; trend: number | null; nflTeam: string | null }>> = {};
  let totalValue = 0;

  for (const pid of activeIds) {
    const p = allPlayers[pid] as SleeperPlayer | undefined;
    const pos = p?.position ?? 'UNKN';
    if (!SKILL_POS.includes(pos)) continue;
    const name = p ? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || pid : pid;

    let val: import('@/lib/types/trade-analyzer').TradeValue | undefined;
    if (values) {
      val = Object.values(values).find((v) => v.sleeperId === pid)
        ?? (fuzzyFindValue(name, values) ?? undefined);
    }

    if (!byPos[pos]) byPos[pos] = [];
    byPos[pos].push({ name, value: val?.value ?? null, rank: val?.rank ?? null, trend: val?.trend ?? null, nflTeam: p?.team ?? null });
    totalValue += val?.value ?? 0;
  }

  for (const pos of Object.keys(byPos)) byPos[pos].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const posSum: Record<string, { count: number; totalValue: number; topPlayer: string | null }> = {};
  for (const pos of SKILL_POS) {
    const players = byPos[pos] ?? [];
    const posTotal = players.reduce((s, p) => s + (p.value ?? 0), 0);
    posSum[pos] = { count: players.length, totalValue: Math.round(posTotal), topPlayer: players[0]?.name ?? null };
  }

  const byStrength = SKILL_POS.filter((pos) => posSum[pos].count > 0).sort((a, b) => posSum[b].totalValue - posSum[a].totalValue);

  return {
    ok: true,
    data: {
      fetchedAt: new Date().toISOString(),
      source: 'sleeper-live + trade-values',
      teamName: matchedTeam,
      totalDynastyValue: Math.round(totalValue),
      positionSummary: posSum,
      positions: byPos,
      strengths: byStrength.slice(0, 2),
      weaknesses: byStrength.slice(-2).reverse(),
      valuesAvailable: values !== null,
    },
  };
}

export function formatAnalyzeRosterMarkdown(data: ReturnType<typeof handleAnalyzeRoster> extends Promise<infer T> ? T : never): string {
  if (!data?.data) return '⚠️ Roster analysis data unavailable.';
  const { teamName, totalDynastyValue, positionSummary, positions, strengths, weaknesses, valuesAvailable } = data.data;

  const trendStr = (t: number | null) => (t ?? 0) > 100 ? ' ↑' : (t ?? 0) < -100 ? ' ↓' : '';

  const lines: string[] = [
    `## 🏈 Roster Analysis — ${teamName}`,
    `*Total dynasty value: **${totalDynastyValue.toLocaleString()}** pts · ${valuesAvailable ? 'FC + KTC avg' : 'values unavailable'} · ${FRESHNESS()}*`,
    '',
    '### Position Breakdown',
    '| Position | # Players | Total Value | Top Player |',
    '|----------|-----------|-------------|------------|',
  ];

  for (const pos of SKILL_POS) {
    const s = positionSummary[pos];
    if (!s || s.count === 0) {
      lines.push(`| ${pos} | 0 | — | — |`);
    } else {
      lines.push(`| **${pos}** | ${s.count} | **${s.totalValue.toLocaleString()}** | ${s.topPlayer ?? '—'} |`);
    }
  }

  lines.push('', `**Strengths:** ${strengths.join(', ') || '—'}`, `**Needs:** ${weaknesses.join(', ') || '—'}`, '');

  for (const pos of SKILL_POS) {
    const players = positions[pos];
    if (!players?.length) continue;
    lines.push(`### ${pos} Room`);
    for (const p of players) {
      const valStr = p.value != null ? ` — ${p.value.toLocaleString()}${trendStr(p.trend)}` : '';
      const rankStr = p.rank != null ? ` (#${p.rank} overall)` : '';
      lines.push(`- **${p.name}**${p.nflTeam ? ` (${p.nflTeam})` : ''}${valStr}${rankStr}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ─── error class ──────────────────────────────────────────────────────────────

export class McpError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'McpError';
  }
}
