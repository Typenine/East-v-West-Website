/**
 * MCP Tool Manifest — GET /api/mcp/tools
 *
 * Describes all available MCP tools in a format compatible with the
 * ChatGPT Apps SDK / Model Context Protocol spec. This endpoint is also
 * protected by the MCP API key so callers must authenticate before
 * discovering available tools.
 *
 * Each tool entry maps directly to a route under /api/mcp/*.
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';

export const runtime = 'nodejs';
// Static-ish content — allow short-term edge caching for the manifest itself.
// The auth check still runs on every request; only the JSON body can be cached.
export const dynamic = 'force-dynamic';

const TOOLS = [
  // ── REST endpoints (/api/mcp/*) ─────────────────────────────────────────────
  {
    name: 'get_league_info',
    description: 'Returns league identity, rules, scoring settings, payout structure, roster config, important dates, and all-time champions. Fully static — no Sleeper API call.',
    endpoint: '/api/mcp/league',
    method: 'GET',
    parameters: [],
    responseFields: ['meta', 'league', 'importantDates', 'structure', 'payouts', 'scoringHighlights', 'rules'],
  },
  {
    name: 'get_standings',
    description: 'Returns BOTH current-season standings (live W/L from Sleeper) and all-time career standings. currentSeasonStandings is live; allTimeStandings is career record across all seasons.',
    endpoint: '/api/mcp/standings',
    method: 'GET',
    parameters: [],
    responseFields: ['meta', 'currentSeasonStandings', 'allTimeStandings', 'champions'],
  },
  {
    name: 'get_rosters',
    description: 'Current-season rosters for all teams or one team. Each player entry includes name, position, NFL team, injury status, and slot (active/ir/taxi). Accepts alias/fuzzy team names.',
    endpoint: '/api/mcp/rosters',
    method: 'GET',
    parameters: [
      { name: 'team', type: 'string', required: false, description: 'Team name — supports aliases and partial matches (e.g. "badgers", "dt", "beer").' },
    ],
    responseFields: ['meta', 'rosters'],
  },
  {
    name: 'get_matchups',
    description: "This week's matchups with team names and current/final scores. Defaults to the current NFL week.",
    endpoint: '/api/mcp/matchups',
    method: 'GET',
    parameters: [
      { name: 'week', type: 'number', required: false, description: 'Override NFL week (1–17). Defaults to current week.' },
    ],
    responseFields: ['meta', 'week', 'matchups'],
  },
  {
    name: 'get_transactions',
    description: 'Recent waiver/FA transactions with FAAB spent, players added/dropped, and acquiring team. Accepts alias/fuzzy team names.',
    endpoint: '/api/mcp/transactions',
    method: 'GET',
    parameters: [
      { name: 'limit', type: 'number', required: false, description: 'Max rows (default 25, max 100).' },
      { name: 'team', type: 'string', required: false, description: 'Team filter — supports aliases and partial matches.' },
      { name: 'season', type: 'string', required: false, description: 'Season year, e.g. "2025".' },
    ],
    responseFields: ['meta', 'transactions'],
  },
  {
    name: 'get_player',
    description: 'Single player profile (position, NFL team, injury status, experience) and current fantasy owner. Look up by Sleeper player ID or search by name.',
    endpoint: '/api/mcp/player',
    method: 'GET',
    parameters: [
      { name: 'id', type: 'string', required: false, description: 'Sleeper player ID (e.g. "4034"). Preferred.' },
      { name: 'name', type: 'string', required: false, description: 'Partial player name for search.' },
      { name: 'limit', type: 'number', required: false, description: 'Max search results (default 5, max 20).' },
    ],
    responseFields: ['meta', 'player (single)', 'players (name search)'],
  },
  {
    name: 'get_rules',
    description: 'League rules as clean plain text. Supports keyword search and single-section lookup.',
    endpoint: '/api/mcp/rules',
    method: 'GET',
    parameters: [
      { name: 'search', type: 'string', required: false, description: 'Keyword to search rule text (case-insensitive).' },
      { name: 'section', type: 'string', required: false, description: 'Section id for direct lookup (e.g. "waivers-free-agents").' },
    ],
    responseFields: ['meta', 'sections'],
  },
  {
    name: 'get_team',
    description: "Single team dashboard: current-season record, full roster (active/IR/taxi), all-time stats, and championship history. Accepts alias/fuzzy team names.",
    endpoint: '/api/mcp/team',
    method: 'GET',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Team name — supports aliases (e.g. "badgers", "dt", "raptors").' },
    ],
    responseFields: ['meta', 'team', 'roster'],
  },
  {
    name: 'get_trades',
    description: 'Slim trade history with player names, positions, and pick descriptions per trade side. Accepts alias/fuzzy team names.',
    endpoint: '/api/mcp/trades',
    method: 'GET',
    parameters: [
      { name: 'team', type: 'string', required: false, description: 'Team filter — supports aliases.' },
      { name: 'season', type: 'string', required: false, description: 'Season year, e.g. "2025".' },
      { name: 'limit', type: 'number', required: false, description: 'Max trades (default 20, max 50).' },
    ],
    responseFields: ['meta', 'trades'],
  },
  {
    name: 'get_drafts',
    description: 'Slim draft history by season and future-pick ownership. Accepts alias/fuzzy team names.',
    endpoint: '/api/mcp/drafts',
    method: 'GET',
    parameters: [
      { name: 'season', type: 'string', required: false, description: 'Season year, e.g. "2025".' },
      { name: 'team', type: 'string', required: false, description: 'Team filter — supports aliases.' },
      { name: 'type', type: 'string', required: false, description: '"future" | "history" | omit for both.' },
    ],
    responseFields: ['meta', 'historicalPicks', 'futurePickOwnership'],
  },
  {
    name: 'get_franchise',
    description: 'All-time franchise stats: regular-season and playoff W/L, win%, PF/PA, championships. Accepts alias/fuzzy team names.',
    endpoint: '/api/mcp/franchise',
    method: 'GET',
    parameters: [
      { name: 'team', type: 'string', required: false, description: 'Team filter — supports aliases.' },
    ],
    responseFields: ['meta', 'franchises'],
  },
  // ── MCP transport only (POST /api/mcp — JSON-RPC) ──────────────────────────
  {
    name: 'show_team_card',
    description: 'Same data as get_team but also triggers the Team Card UI widget in ChatGPT. Use when user says "show", "display", "pull up", or "render" a team card.',
    endpoint: '/api/mcp',
    method: 'POST (MCP JSON-RPC)',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Team name — supports aliases.' },
    ],
    responseFields: ['meta', 'team', 'roster', 'matchResolution'],
    mcpOnly: true,
  },
  {
    name: 'get_league_overview',
    description: 'Full league snapshot: all 12 teams with record, all-time stats, full roster, championship history, and future pick holdings. Primary tool for league-wide analysis. 5-min in-memory cache.',
    endpoint: '/api/mcp',
    method: 'POST (MCP JSON-RPC)',
    parameters: [],
    responseFields: ['ok', 'data.teams', 'data.season', 'data.fetchedAt', 'warnings'],
    mcpOnly: true,
  },
  {
    name: 'get_position_rooms',
    description: 'Active roster players grouped by position for all teams or one team. Accepts optional team and/or position filter.',
    endpoint: '/api/mcp',
    method: 'POST (MCP JSON-RPC)',
    parameters: [
      { name: 'team', type: 'string', required: false, description: 'Team filter — supports aliases.' },
      { name: 'position', type: 'string', required: false, description: 'Position filter (e.g. "QB", "WR").' },
    ],
    responseFields: ['ok', 'data.teams', 'data.positionFilter', 'data.teamFilter', 'warnings'],
    mcpOnly: true,
  },
  {
    name: 'compare_teams',
    description: 'Side-by-side comparison of exactly two teams: record, all-time stats, position rooms, and future picks. Both team inputs support aliases.',
    endpoint: '/api/mcp',
    method: 'POST (MCP JSON-RPC)',
    parameters: [
      { name: 'team1', type: 'string', required: true, description: 'First team — supports aliases.' },
      { name: 'team2', type: 'string', required: true, description: 'Second team — supports aliases.' },
    ],
    responseFields: ['ok', 'data.team1', 'data.team2', 'warnings'],
    mcpOnly: true,
  },
  {
    name: 'get_future_pick_board',
    description: 'All traded pick ownership organized by current owner with human-readable display strings (e.g. "2027 1st from Belltown Raptors"). Sorted by total picks held.',
    endpoint: '/api/mcp',
    method: 'POST (MCP JSON-RPC)',
    parameters: [],
    responseFields: ['ok', 'data.board', 'data.leagueNote', 'warnings'],
    mcpOnly: true,
  },
] as const;

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  return NextResponse.json({
    meta: mcpMeta('tools_manifest', {
      version: 3,
      baseUrl: '/api/mcp',
      authScheme: 'Bearer token (Authorization: Bearer <MCP_API_KEY>) or X-MCP-Key header',
      note: 'All tools are read-only. Write operations are not supported.',
    }),
    tools: TOOLS,
  });
}
