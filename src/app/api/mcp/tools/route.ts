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
  {
    name: 'get_league_info',
    description:
      'Returns league identity, rules (plain text), scoring settings, payout structure, roster configuration, important dates, and all-time champions. No Sleeper API call required — data is fully static.',
    endpoint: '/api/mcp/league',
    method: 'GET',
    parameters: [],
    responseFields: [
      'meta', 'league', 'importantDates', 'structure', 'payouts',
      'scoringHighlights', 'rules',
    ],
  },
  {
    name: 'get_standings',
    description:
      'Returns BOTH current-season standings (live W/L from Sleeper roster settings) and all-time standings across all seasons. currentSeasonStandings is the live view; allTimeStandings is the career record.',
    endpoint: '/api/mcp/standings',
    method: 'GET',
    parameters: [],
    responseFields: ['meta', 'currentSeasonStandings', 'allTimeStandings', 'champions'],
  },
  {
    name: 'get_rosters',
    description:
      'Returns current-season rosters for all or one team. Each player entry includes name, position, NFL team, injury status, and roster slot (active/ir/taxi). Never returns the full Sleeper player database.',
    endpoint: '/api/mcp/rosters',
    method: 'GET',
    parameters: [
      { name: 'team', type: 'string', required: false, description: 'Case-insensitive team name filter (e.g. "Belltown Raptors").' },
    ],
    responseFields: ['meta', 'rosters'],
  },
  {
    name: 'get_matchups',
    description:
      'Returns this week\'s matchups with team names and current/final scores. Defaults to the current NFL week from Sleeper state.',
    endpoint: '/api/mcp/matchups',
    method: 'GET',
    parameters: [
      { name: 'week', type: 'number', required: false, description: 'Override the NFL week (1–17). Defaults to current week.' },
    ],
    responseFields: ['meta', 'week', 'matchups'],
  },
  {
    name: 'get_transactions',
    description:
      'Returns recent waiver and free-agent transactions. Filtered and limited to avoid large payloads. Includes FAAB spent, players added/dropped, and the acquiring team.',
    endpoint: '/api/mcp/transactions',
    method: 'GET',
    parameters: [
      { name: 'limit', type: 'number', required: false, description: 'Max rows to return (default 25, max 100).' },
      { name: 'team', type: 'string', required: false, description: 'Filter by team name (partial, case-insensitive).' },
      { name: 'season', type: 'string', required: false, description: 'Filter by season year, e.g. "2025".' },
    ],
    responseFields: ['meta', 'transactions'],
  },
  {
    name: 'get_player',
    description:
      'Returns a single player\'s profile (position, NFL team, injury status, experience) and which fantasy team currently owns them, if any. Look up by Sleeper player ID or search by name. Name search scans all ~100K players and returns best matches first (league-owned players ranked higher).',
    endpoint: '/api/mcp/player',
    method: 'GET',
    parameters: [
      { name: 'id', type: 'string', required: false, description: 'Sleeper player ID (e.g. "4034"). Preferred over name search.' },
      { name: 'name', type: 'string', required: false, description: 'Partial player name for search. Use when ID is unknown.' },
      { name: 'limit', type: 'number', required: false, description: 'Max name-search results (default 5, max 20).' },
    ],
    responseFields: ['meta', 'player (single)', 'players (name search)'],
  },
  {
    name: 'get_rules',
    description:
      'Returns league rules as clean plain text. Supports keyword search (?search=waiver) and single-section lookup (?section=waivers-free-agents). Returns matching lines within each section when searching.',
    endpoint: '/api/mcp/rules',
    method: 'GET',
    parameters: [
      { name: 'search', type: 'string', required: false, description: 'Keyword to search across rule titles and text (case-insensitive).' },
      { name: 'section', type: 'string', required: false, description: 'Section id for direct lookup (e.g. "waivers-free-agents"). Lists available ids when not found.' },
    ],
    responseFields: ['meta', 'sections'],
  },
  {
    name: 'get_team',
    description:
      'Returns a single team\'s dashboard: current-season record, full roster (active/IR/taxi), all-time regular-season and playoff stats, and championship history. Requires ?name= query param.',
    endpoint: '/api/mcp/team',
    method: 'GET',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Team name (partial, case-insensitive). e.g. "Belltown".' },
    ],
    responseFields: ['meta', 'team', 'roster'],
  },
  {
    name: 'get_trades',
    description:
      'Returns slim trade history. Includes player names, positions, and draft pick descriptions for each side of every trade. Filterable by team and season.',
    endpoint: '/api/mcp/trades',
    method: 'GET',
    parameters: [
      { name: 'team', type: 'string', required: false, description: 'Filter to trades involving a team (partial, case-insensitive).' },
      { name: 'season', type: 'string', required: false, description: 'Filter to a specific season year, e.g. "2025".' },
      { name: 'limit', type: 'number', required: false, description: 'Max trades to return (default 20, max 50).' },
    ],
    responseFields: ['meta', 'trades'],
  },
  {
    name: 'get_drafts',
    description:
      'Returns slim draft history by season and current future-pick ownership. Filterable by season, team, and type (history/future). Never returns the full export/drafts payload.',
    endpoint: '/api/mcp/drafts',
    method: 'GET',
    parameters: [
      { name: 'season', type: 'string', required: false, description: 'Filter to a specific season year, e.g. "2025".' },
      { name: 'team', type: 'string', required: false, description: 'Filter picks owned by or from a team (partial, case-insensitive).' },
      { name: 'type', type: 'string', required: false, description: '"future" for pick ownership only, "history" for completed picks only, omit for both.' },
    ],
    responseFields: ['meta', 'historicalPicks', 'futurePickOwnership'],
  },
  {
    name: 'get_franchise',
    description:
      'Returns all-time franchise stats per team: regular-season and playoff W/L records, win percentage, points for/against, and championship counts. Filterable by team.',
    endpoint: '/api/mcp/franchise',
    method: 'GET',
    parameters: [
      { name: 'team', type: 'string', required: false, description: 'Filter to a single team (partial, case-insensitive).' },
    ],
    responseFields: ['meta', 'franchises'],
  },
] as const;

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  return NextResponse.json({
    meta: mcpMeta('tools_manifest', {
      version: 2,
      baseUrl: '/api/mcp',
      authScheme: 'Bearer token (Authorization: Bearer <MCP_API_KEY>) or X-MCP-Key header',
      note: 'All tools are read-only. Write operations are not supported.',
    }),
    tools: TOOLS,
  });
}
