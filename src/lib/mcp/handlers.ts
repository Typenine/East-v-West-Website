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
      teams: t.teams.map((side) => ({
        name: side.name,
        received: side.assets.filter((a) => a.type === 'player').map((a) => ({ name: a.name, position: a.position ?? null })),
        picks: side.assets.filter((a) => a.type === 'pick').map((a) => a.name),
      })),
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
    if (t.teams.length === 2) {
      storylines.push(`Trade alert: ${t.teams[0].name} and ${t.teams[1].name} made a deal${t.week ? ` in Week ${t.week}` : ''}. Who won?`);
    }
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
  recentTrades?: Array<{ week?: number | null; teams: Array<{ name: string; received: Array<{ name: string; position: string | null }>; picks: string[] }> }>;
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
      if (t.teams.length === 2) {
        const [a, b] = t.teams;
        const aGot = [...a.received.map((p) => p.name), ...a.picks].join(', ') || '—';
        const bGot = [...b.received.map((p) => p.name), ...b.picks].join(', ') || '—';
        const when = t.week ? ` (Wk ${t.week})` : '';
        lines.push(`- **${a.name}** got: ${aGot}${when}`);
        lines.push(`  **${b.name}** got: ${bGot}`);
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
      received: Array<{ name: string; position: string | null }>;
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
      // 3-team trade fallback
      for (const side of trade.teams) {
        const assets = [
          ...side.received.map(fmtAsset),
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

// ─── error class ──────────────────────────────────────────────────────────────

export class McpError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'McpError';
  }
}
