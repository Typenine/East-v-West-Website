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
import { fetchTradesAllTime } from '@/lib/utils/trades';
import { rulesHtmlSections } from '@/data/rules';

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
    }),
    currentSeasonStandings: currentRows,
    allTimeStandings: allTimeRows,
    champions: CHAMPIONS,
  };
}

// ─── tool: get_team_dashboard ──────────────────────────────────────────────────

export async function handleGetTeam(input: { name?: string }) {
  const nameParam = (input.name ?? '').trim().toLowerCase();
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

  const team = teams.find((t) => t.teamName.toLowerCase().includes(nameParam));
  if (!team) {
    throw new McpError('not_found', `No team matching "${input.name}". Available: ${teams.map((t) => t.teamName).sort().join(', ')}`);
  }

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
    meta: mcpMeta('get_team', { team: team.teamName, dataSource: 'sleeper-live + static' }),
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
  const teamFilter = (input.team ?? '').toLowerCase().trim();
  const leagueId = LEAGUE_IDS.CURRENT;
  const opts = { timeoutMs: 15000 };

  const [teams, rosters, allPlayers] = await Promise.all([
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
  ]);

  const rosterById = new Map<number, SleeperRoster>(rosters.map((r) => [r.roster_id, r]));

  const result = [];
  for (const team of teams) {
    if (teamFilter && !team.teamName.toLowerCase().includes(teamFilter)) continue;
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
    meta: mcpMeta('get_rosters', { leagueId, teamCount: result.length }),
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
    meta: mcpMeta('get_matchups', { leagueId, week, nflSeason, seasonType }),
    week,
    matchups: result,
  };
}

// ─── tool: get_recent_transactions ────────────────────────────────────────────

export async function handleGetTransactions(input: { limit?: number; team?: string; season?: string }) {
  const MAX = 100;
  const limit = Math.min(Math.max(1, input.limit ?? 25), MAX);
  const teamFilter = (input.team ?? '').toLowerCase().trim();
  const seasonFilter = (input.season ?? '').trim();

  const ledger = await buildTransactionLedger();
  let filtered = ledger;
  if (seasonFilter) filtered = filtered.filter((t) => t.season === seasonFilter);
  if (teamFilter) filtered = filtered.filter((t) => t.team.toLowerCase().includes(teamFilter));

  const page = [...filtered].sort((a, b) => b.created - a.created).slice(0, limit);
  const slim = page.map((t) => ({
    id: t.id, season: t.season, week: t.week, team: t.team, type: t.type, faab: t.faab,
    added: t.added.map((p) => ({ name: p.name ?? p.playerId })),
    dropped: t.dropped.map((p) => ({ name: p.name ?? p.playerId })),
    createdAt: new Date(t.created).toISOString(),
  }));

  return {
    meta: mcpMeta('get_transactions', { totalMatched: filtered.length, returned: slim.length, limit }),
    transactions: slim,
  };
}

// ─── tool: get_trade_history ───────────────────────────────────────────────────

export async function handleGetTrades(input: { team?: string; season?: string; limit?: number }) {
  const limit = Math.min(Math.max(1, input.limit ?? 20), 50);
  const teamFilter = (input.team ?? '').toLowerCase().trim();
  const seasonFilter = (input.season ?? '').trim();

  const allTrades = await fetchTradesAllTime();
  let filtered = allTrades;
  if (seasonFilter) filtered = filtered.filter((t) => String(t.season) === seasonFilter);
  if (teamFilter) filtered = filtered.filter((t) => t.teams.some((s) => s.name.toLowerCase().includes(teamFilter)));

  const sorted = [...filtered].sort((a, b) => {
    const ta = typeof a.created === 'number' ? a.created : Date.parse(a.date ?? '0');
    const tb = typeof b.created === 'number' ? b.created : Date.parse(b.date ?? '0');
    return tb - ta;
  });

  const page = sorted.slice(0, limit).map((t) => ({
    id: t.id, season: t.season ?? null, week: t.week ?? null, date: t.date,
    teams: t.teams.map((side) => ({
      name: side.name,
      received: side.assets.filter((a) => a.type === 'player').map((a) => ({ name: a.name, position: a.position ?? null })),
      picks: side.assets.filter((a) => a.type === 'pick').map((a) => a.name),
    })),
  }));

  return {
    meta: mcpMeta('get_trades', { totalMatched: filtered.length, returned: page.length, limit }),
    trades: page,
  };
}

// ─── tool: get_draft_history / get_draft_picks ────────────────────────────────

export async function handleGetDrafts(input: { season?: string; team?: string; type?: string }) {
  const seasonFilter = (input.season ?? '').trim();
  const teamFilter = (input.team ?? '').toLowerCase().trim();
  const typeFilter = (input.type ?? '').toLowerCase().trim();
  const opts = { timeoutMs: 20000 };

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
    meta: mcpMeta('get_drafts', { seasonsQueried: seasons, filters: { season: seasonFilter || null, team: teamFilter || null } }),
    historicalPicks: historyBySeason,
    futurePickOwnership: futurePicks,
  };
}

// ─── tool: get_franchise_summary ──────────────────────────────────────────────

export async function handleGetFranchise(input: { team?: string }) {
  const teamFilter = (input.team ?? '').toLowerCase().trim();
  const splits = await getSplitRecordsAllTime({ timeoutMs: 20000 });
  const champs = champCounts();
  const runnerUps: Record<string, number> = {};
  for (const c of Object.values(CHAMPIONS)) {
    if (c.runnerUp && c.runnerUp !== 'TBD') runnerUps[c.runnerUp] = (runnerUps[c.runnerUp] ?? 0) + 1;
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
    meta: mcpMeta('get_franchise', { teamCount: franchises.length }),
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
    return { meta: mcpMeta('get_rules', { lookup: 'section', sectionId }), section: found };
  }

  const results = searchRaw
    ? PARSED_RULES.filter((s) => s.title.toLowerCase().includes(searchRaw) || s.text.toLowerCase().includes(searchRaw))
    : PARSED_RULES;

  const sections = results.map((s) => {
    if (!searchRaw) return s;
    return { ...s, matchingLines: s.text.split('\n').filter((l) => l.toLowerCase().includes(searchRaw)) };
  });

  return {
    meta: mcpMeta('get_rules', { search: searchRaw || null, matchedSections: sections.length, totalSections: PARSED_RULES.length }),
    sections,
  };
}

// ─── tool: get_weekly_content_context ─────────────────────────────────────────
// Returns everything a content writer or bot needs to write weekly recap or
// preview content: current matchups, recent transactions, standings snapshot,
// and league context. Designed to be fast — focuses on current-week live data.

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

  const [matchups, teams, rosters] = await Promise.all([
    getLeagueMatchups(leagueId, week, opts).catch(() => [] as SleeperMatchup[]),
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => []),
  ]);

  const rosterIdToName = new Map<number, string>(teams.map((t) => [t.rosterId, t.teamName]));

  // Current-week matchups with scores
  const byId = new Map<number, SleeperMatchup[]>();
  for (const m of matchups) {
    const arr = byId.get(m.matchup_id) ?? [];
    arr.push(m);
    byId.set(m.matchup_id, arr);
  }
  const weekMatchups = [];
  for (const [matchupId, pair] of byId.entries()) {
    if (pair.length < 2) continue;
    const [a, b] = pair;
    const aPts = Number(a.custom_points ?? a.points ?? 0);
    const bPts = Number(b.custom_points ?? b.points ?? 0);
    weekMatchups.push({
      matchupId,
      home: { team: rosterIdToName.get(b.roster_id) ?? `Roster ${b.roster_id}`, points: Math.round(bPts * 100) / 100 },
      away: { team: rosterIdToName.get(a.roster_id) ?? `Roster ${a.roster_id}`, points: Math.round(aPts * 100) / 100 },
    });
  }
  weekMatchups.sort((a, b) => a.matchupId - b.matchupId);

  // Current standings snapshot from roster settings
  const champs = champCounts();
  const standingsSnapshot = rosters
    .map((r) => {
      const name = rosterIdToName.get(r.roster_id) ?? `Roster ${r.roster_id}`;
      const s = r.settings as { wins?: number; losses?: number; fpts?: number; fpts_decimal?: number } | undefined;
      const pf = (s?.fpts ?? 0) + (s?.fpts_decimal ?? 0) / 100;
      return {
        team: name,
        wins: s?.wins ?? 0,
        losses: s?.losses ?? 0,
        pf: Math.round(pf * 100) / 100,
        championships: champs[name] ?? 0,
      };
    })
    .sort((a, b) => b.wins - a.wins || b.pf - a.pf)
    .map((r, i) => ({ rank: i + 1, ...r }));

  // Recent transactions (last 10)
  let recentTransactions: unknown[] = [];
  try {
    const ledger = await buildTransactionLedger();
    recentTransactions = [...ledger]
      .sort((a, b) => b.created - a.created)
      .slice(0, 10)
      .map((t) => ({
        team: t.team, type: t.type, faab: t.faab,
        added: t.added.map((p) => p.name ?? p.playerId),
        dropped: t.dropped.map((p) => p.name ?? p.playerId),
        createdAt: new Date(t.created).toISOString(),
      }));
  } catch { /* best effort */ }

  return {
    meta: mcpMeta('get_weekly_context', {
      week,
      season: nflSeason || CURRENT_SEASON,
      seasonType,
      dataSource: 'sleeper-live',
      note: 'Designed for content creation. Contains current matchups, standings, and recent roster moves.',
    }),
    week,
    season: nflSeason || CURRENT_SEASON,
    leagueName: 'East v. West Fantasy Football',
    matchups: weekMatchups,
    standings: standingsSnapshot,
    recentTransactions,
    champions: CHAMPIONS,
  };
}

// ─── error class ──────────────────────────────────────────────────────────────

export class McpError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'McpError';
  }
}
