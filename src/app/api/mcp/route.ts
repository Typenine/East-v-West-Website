/**
 * MCP HTTP Transport Endpoint
 * POST /api/mcp
 *
 * This is the single endpoint that ChatGPT (or any MCP client) connects to.
 * It implements the Model Context Protocol HTTP transport spec:
 *   https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/transports/
 *
 * Supported methods:
 *   initialize       — capability handshake
 *   tools/list       — returns all available tool definitions with input schemas
 *   tools/call       — executes a named tool and returns the result
 *
 * Authentication: Bearer token via Authorization header (MCP_API_KEY env var).
 *
 * All business logic lives in src/lib/mcp/handlers.ts — this file is pure
 * dispatch. The individual REST routes under /api/mcp/* remain unchanged for
 * direct REST access.
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth } from '@/lib/mcp/auth';
import { withMcpLogging } from '@/lib/mcp/call-logger';
import { TEAM_CARD_WIDGET_URI, TEAM_CARD_HTML, TEAM_CARD_RESOURCE } from '@/lib/mcp/widgets/team-card';
import {
  handleGetLeagueInfo,
  handleGetStandings,
  handleGetTeam,
  handleGetRosters,
  handleGetPlayer,
  handleGetMatchups,
  handleGetTransactions,
  handleGetTrades,
  handleGetDrafts,
  handleGetFranchise,
  handleGetRules,
  handleGetWeeklyContext,
  handleGetCommissionerOps,
  handleGetLeagueOverview,
  handleGetPositionRooms,
  handleCompareTeams,
  handleGetFuturePickBoard,
  handleAnalyzeTrade,
  handleGetPlayerValues,
  handleGetTradeBlock,
  handleGetPowerRankings,
  handleAnalyzeRoster,
  McpError,
} from '@/lib/mcp/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── MCP Tool Definitions (JSON Schema input schemas for tools/list) ───────────

const MCP_TOOLS = [
  {
    name: 'get_league_info',
    description:
      'Returns static East v. West league information: rules (full plain text), scoring settings (0.5 PPR SuperFlex), payout structure, roster configuration, important calendar dates, and all-time champions. No live Sleeper API call. ' +
      'Use for: league-format questions, rules lookups, payout questions, season structure, historical champions. Do not use for live standings or rosters. ' +
      'Examples: "What is the scoring format?", "When is the trade deadline?", "How do playoffs work?", "What are the league payouts?", "When is the next draft?"',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_current_standings',
    description:
      'Returns current-season W/L standings (live from Sleeper) and all-time career standings across all seasons. Includes rank, record, PF/PA, average PPG, and championship counts per team. ' +
      'Use for: who is leading the league, playoff race questions, career record comparisons. ' +
      'Examples: "Who is in first place?", "What are the current standings?", "Who has the best all-time record?", "Is Double Trouble in a playoff spot?"',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_team_dashboard',
    description:
      'Returns structured JSON data for one East v. West team: current-season record (W/L, PF, PA), full roster grouped by slot (active/IR/taxi) with player names, positions, NFL teams, and injury status, all-time stats, and championship history. Data-only — no visual UI card. ' +
      'Use for data questions about a specific team when no visual rendering is needed. Use show_team_card when the user says "show", "display", "pull up", or "render" a team card. ' +
      'Accepts partial names and aliases (e.g. "double", "dt", "cake eaters", "beer", "belltown", "badgers", "bop", "pandas"). ' +
      'Examples: "What is Double Trouble\'s record?", "Who is on Belltown\'s roster?", "Show Detroit Dawgs franchise history."',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Team name or alias (partial, case-insensitive). E.g. "Double Trouble", "double", "dt", "Belltown", "cake eaters".',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'show_team_card',
    description:
      'Renders a visual Team Card UI for one East v. West team. Shows the team logo, current-season record, points for/against, active roster grouped by position, IR and taxi slots, and championship history in a styled visual component. ' +
      'Use this when the user says "show", "display", "view", "pull up", "render", or "open" a team card, team dashboard, or team profile. ' +
      'Do not use for data-only answers — use get_team_dashboard instead. ' +
      'Accepts partial names and aliases (e.g. "double", "dt", "cake eaters", "beer", "belltown", "badgers"). ' +
      'Examples: "Show Double Trouble\'s team card.", "Display the Belltown Raptors.", "Pull up Belleview Badgers.", "Show me the team card for bop pop.", "Open the Double Trouble dashboard."',
    _meta: {
      'openai/outputTemplate': { uri: TEAM_CARD_WIDGET_URI },
      ui: { resourceUri: TEAM_CARD_WIDGET_URI },
    },
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Team name or alias (partial, case-insensitive). E.g. "Double Trouble", "double", "dt", "Belltown", "cake eaters".',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_current_roster',
    description:
      'Returns current-season rosters for all teams or one team. Each player includes Sleeper player ID, name, position, NFL team, injury status, and slot (active/ir/taxi). Lighter than get_team_dashboard — best for league-wide roster scans. ' +
      'Use for: injury surveys across teams, who is on IR league-wide, light single-team roster lookups, taxi squad surveys. ' +
      'Examples: "Show all rostered RBs.", "Who is on IR right now?", "List all taxi squad players.", "Who is on Belltown\'s roster?"',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Optional team name filter (partial, case-insensitive).' },
      },
      required: [],
    },
  },
  {
    name: 'search_players',
    description:
      'Searches the full Sleeper player database (~100K players) by name. Returns best matches with league-owned players ranked first. Use when you need to find a player but do not know their Sleeper ID. ' +
      'Examples: "Search for Patrick Mahomes.", "Find Justin Jefferson.", "Is CeeDee Lamb in this league?", "Who owns Ja\'Marr Chase?"',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Partial or full player name. E.g. "Mahomes" or "Patrick Mahomes".' },
        limit: { type: 'number', description: 'Max results (default 5, max 20).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_player_info',
    description:
      'Returns a single player\'s profile by Sleeper player ID: position, NFL team, injury status, years of experience, and which East v. West team owns them (if any). Use search_players first if you do not know the ID. ' +
      'Examples: "Look up player ID 4034.", "What team owns Davante Adams?", "What is Josh Allen\'s status?"',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Sleeper player ID (numeric string, e.g. "4034").' },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_current_matchups',
    description:
      'Returns this week\'s fantasy matchups with team names and current/final scores. Defaults to the current NFL week. ' +
      'Examples: "What are the matchups this week?", "What is Double Trouble\'s score?", "Show Week 8 matchups.", "Who is playing who?"',
    inputSchema: {
      type: 'object',
      properties: {
        week: { type: 'number', description: 'Optional NFL week override (1–17). Defaults to current week.' },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_transactions',
    description:
      'Returns recent waiver and free-agent transactions: players added/dropped, FAAB spent, and acquiring team. Filterable by team and season. ' +
      'Use for: waiver wire news, FAAB spend tracking, who added or dropped a specific player. ' +
      'Examples: "Who has been added off waivers?", "What did Double Trouble spend on FAAB?", "Show recent transactions for Belltown."',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max rows (default 25, max 100).' },
        team: { type: 'string', description: 'Filter by team name (partial, case-insensitive).' },
        season: { type: 'string', description: 'Filter by season year, e.g. "2025".' },
      },
      required: [],
    },
  },
  {
    name: 'get_trade_history',
    description:
      'Returns slim trade history with player names, positions, and pick descriptions per trade side. Filterable by team and season. ' +
      'Use for: trade history for a team, historical trade analysis, checking what was traded. ' +
      'Examples: "Show all trades involving Double Trouble.", "What trades happened in 2025?", "Did Belltown trade any picks?"',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Filter to trades involving a team (partial, case-insensitive).' },
        season: { type: 'string', description: 'Filter by season year, e.g. "2025".' },
        limit: { type: 'number', description: 'Max trades (default 20, max 50).' },
      },
      required: [],
    },
  },
  {
    name: 'get_draft_history',
    description:
      'Returns historical draft picks by season (completed picks with player names, positions, round) and current future-pick ownership (traded picks for upcoming drafts). Filterable by season, team, and type. ' +
      'Use for: draft recap questions, who was taken in a round, historical pick tracking. Use get_future_pick_board for a visual pick board. ' +
      'Examples: "Show the 2025 draft.", "Who did Belltown draft?", "What picks were traded for 2026?"',
    inputSchema: {
      type: 'object',
      properties: {
        season: { type: 'string', description: 'Season year, e.g. "2025".' },
        team: { type: 'string', description: 'Filter by team (partial, case-insensitive).' },
        type: { type: 'string', enum: ['history', 'future'], description: '"history" = completed picks, "future" = pick ownership. Omit for both.' },
      },
      required: [],
    },
  },
  {
    name: 'get_draft_picks',
    description:
      'Returns current future draft pick ownership for all teams or one team. Use get_future_pick_board for a team-by-team pick board with totals and rankings. ' +
      'Examples: "What picks does Belleview own?", "Show Double Trouble\'s future picks.", "Who owns Belltown\'s 2027 first-rounder?"',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Filter by team (partial, case-insensitive).' },
      },
      required: [],
    },
  },
  {
    name: 'get_franchise_summary',
    description:
      'Returns all-time franchise stats per team: regular-season and playoff W/L records, win percentage, PF/PA, championship and runner-up counts. Sorted by championships then win%. ' +
      'Use for: all-time records, most successful teams historically, playoff history. ' +
      'Examples: "Who has the best all-time win percentage?", "Show franchise records.", "Who has won the most championships?"',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Optional team filter (partial, case-insensitive).' },
      },
      required: [],
    },
  },
  {
    name: 'answer_rule_question',
    description:
      'Returns East v. West league rules as clean plain text. Supports keyword search and direct section lookup. Source: Rulebook v3, ratified 2026-02-12. ' +
      'Use for: specific rule questions, "is this allowed?", commissioner rulings, disputes. ' +
      'Examples: "What are the waiver wire rules?", "Can I trade draft picks?", "What is the taxi squad rule?", "How are tiebreakers handled?"',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Keyword to search (case-insensitive). E.g. "waiver", "trade deadline", "taxi".' },
        section: { type: 'string', description: 'Section ID for direct lookup, e.g. "waivers-free-agents". Omit to list all sections.' },
      },
      required: [],
    },
  },
  {
    name: 'get_weekly_content_context',
    description:
      'Content Studio briefing: current matchups with story hooks, full standings with PF/PA and averages, playoff race snapshot, recent trades, recent waiver moves, injury flags, suggested storylines, and suggested headlines. Use as the source of truth before writing any league content, recaps, newsletters, or social posts. ' +
      'Examples: "Write a Week 8 preview.", "Draft a league newsletter.", "Give me storylines for this week.", "Write a power rankings post."',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_commissioner_ops_context',
    description:
      'Advisory-only commissioner ops briefing. Returns: date-based reminders, weekly checklist, lineup watch (injured starters), IR slot review, taxi eligibility review, and draft owner message drafts. Makes no rulings, sends nothing, modifies nothing. All items require commissioner judgment. ' +
      'Examples: "What does the commissioner need to do this week?", "Are there roster compliance issues?", "Draft a trade deadline reminder."',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_league_overview',
    description:
      'Returns a comprehensive snapshot of the entire East v. West league: every team with current-season record, PF/PA, all-time stats, championship history, full active/IR/taxi roster, and future draft pick ownership. ' +
      'This is the primary tool for league-wide analysis and multi-team comparison questions. Call this before any question spanning more than two teams. ' +
      'Do not use for single-team deep dives — use get_team_dashboard or show_team_card. ' +
      'Examples: "Show the league overview.", "Who has the best roster?", "Who has the most draft capital?", "Show every team\'s QB room.", "Which team has the most depth?", "Give me a full league asset summary."',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_position_rooms',
    description:
      'Returns a position-group breakdown across all teams (or one team). Groups active rostered players by position (QB, RB, WR, TE) per team, with injury flags and NFL team info. Includes depth counts per position. ' +
      'Use for: positional comparisons, identifying best depth at a position, surveying a position league-wide. ' +
      'Examples: "Show each team\'s QBs.", "Who has the best WR room?", "What does Belltown\'s RB room look like?", "Which teams are QB-heavy?", "Show all league QBs."',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Optional team filter (partial, case-insensitive). Omit for league-wide view.' },
        position: { type: 'string', description: 'Optional position filter, e.g. "QB", "WR", "RB", "TE". Omit for all.' },
      },
      required: [],
    },
  },
  {
    name: 'compare_teams',
    description:
      'Returns a structured side-by-side comparison of exactly two East v. West teams. Includes current-season record, PF/PA, all-time stats, championship history, position-grouped roster breakdown, and future draft picks for each team. ' +
      'Use when the user asks to compare two specific teams. Accepts partial names and aliases. ' +
      'Examples: "Compare Double Trouble and Belltown Raptors.", "Who has a better roster, Belleview or Detroit?", "Double Trouble vs bop pop.", "Which team is better positioned to contend?"',
    inputSchema: {
      type: 'object',
      properties: {
        team1: { type: 'string', description: 'First team name or alias (partial, case-insensitive).' },
        team2: { type: 'string', description: 'Second team name or alias (partial, case-insensitive).' },
      },
      required: ['team1', 'team2'],
    },
  },
  {
    name: 'get_future_pick_board',
    description:
      'Returns all future draft pick ownership organized by team, sorted by total picks held. Shows traded picks with human-readable display strings like "2027 1st from Belleview Badgers". Includes total pick count and first-round pick count per team. ' +
      'Use for: draft capital questions, pick board overviews, finding teams with the most first-rounders. ' +
      'Examples: "Show the future pick board.", "Who has the most first-round picks?", "Which teams are draft-capital rich?", "Who has the most picks in 2027?"',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_trade_block',
    description:
      'Returns the current league-wide trade block: which players and picks each team is offering, and what they want in return. ' +
      'Use when asked "who is on the trade block?", "what is [team] offering?", or before analyzing a trade to see if the right assets exist.',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Optional team name filter (partial, case-insensitive).' },
      },
      required: [],
    },
  },
  {
    name: 'get_power_rankings',
    description:
      'Returns calculated power rankings for all 12 teams, scored by record(40%) + PF-percentile(30%) + last-3-weeks(30%). ' +
      'Returns rank, score, tier (Elite/Contender/Fringe/Rebuilding), record, PF, and recent form per team.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'analyze_roster',
    description:
      'Evaluates a team\'s dynasty roster using real-time FantasyCalc + KTC trade values. Returns total dynasty value, per-position breakdown, strengths and weaknesses. ' +
      'Use when asked "how good is [team]\'s roster?", "what position does [team] need?", or "rate [team]\'s dynasty value".',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Team name or alias (partial, case-insensitive).' },
      },
      required: ['name'],
    },
  },
  {
    name: 'analyze_trade',
    description:
      'Evaluates a dynasty trade using real-time FantasyCalc + KeepTradeCut values (12-team SuperFlex, PPR). ' +
      'Given two lists of players and/or picks, returns a verdict (Fair Trade / Slight Edge / Uneven / One-Sided), ' +
      'letter grade per side (A+ to F), effective values with stud premium and depth discount, age delta notes, ' +
      'and a counter-offer hint when a side is short. ' +
      'Use whenever someone asks "is this trade fair?", "who wins this trade?", or "should I accept this?". ' +
      'Examples: "Analyze: I give CeeDee Lamb for Justin Jefferson + 2026 early 1st.", "Is Ja\'Marr Chase for Davante Adams + 2027 2nd fair?"',
    inputSchema: {
      type: 'object',
      properties: {
        side_a: {
          type: 'array',
          items: { type: 'string' },
          description: 'Players and/or picks Side A gives up. Full or partial names accepted.',
        },
        side_b: {
          type: 'array',
          items: { type: 'string' },
          description: 'Players and/or picks Side B gives up (what Side A receives).',
        },
        source: {
          type: 'string',
          enum: ['avg', 'fc', 'ktc'],
          description: 'Value source: "avg" (default), "fc" (FantasyCalc only), "ktc" (KeepTradeCut only).',
        },
      },
      required: ['side_a', 'side_b'],
    },
  },
  {
    name: 'get_player_values',
    description:
      'Returns dynasty trade values for up to 12 players or picks from FantasyCalc + KTC (12-team SF PPR, 0–10k scale). ' +
      'Includes 30-day trend, overall rank, position, age. ' +
      'Use when asked "what is [player] worth?", "rank these players by value", or "what\'s a 2027 first worth?".',
    inputSchema: {
      type: 'object',
      properties: {
        players: {
          type: 'array',
          items: { type: 'string' },
          description: 'Player names or pick descriptions to look up (max 12).',
        },
      },
      required: ['players'],
    },
  },
] as const;

// ─── tool name → handler dispatch ─────────────────────────────────────────────

type ToolInput = Record<string, unknown>;

async function dispatchTool(name: string, input: ToolInput): Promise<unknown> {
  switch (name) {
    case 'get_league_info':
      return handleGetLeagueInfo();

    case 'get_current_standings':
      return handleGetStandings();

    case 'get_team_dashboard':
      return handleGetTeam({ name: input.name as string | undefined });

    case 'get_current_roster':
      return handleGetRosters({ team: input.team as string | undefined });

    case 'search_players':
      return handleGetPlayer({
        name: input.name as string | undefined,
        limit: input.limit as number | undefined,
      });

    case 'get_player_info':
      return handleGetPlayer({ id: input.id as string | undefined });

    case 'get_current_matchups':
      return handleGetMatchups({ week: input.week as number | undefined });

    case 'get_recent_transactions':
      return handleGetTransactions({
        limit: input.limit as number | undefined,
        team: input.team as string | undefined,
        season: input.season as string | undefined,
      });

    case 'get_trade_history':
      return handleGetTrades({
        team: input.team as string | undefined,
        season: input.season as string | undefined,
        limit: input.limit as number | undefined,
      });

    case 'get_draft_history':
      return handleGetDrafts({
        season: input.season as string | undefined,
        team: input.team as string | undefined,
        type: input.type as string | undefined,
      });

    case 'get_draft_picks':
      // Reuse get_draft_history with type=future
      return handleGetDrafts({
        team: input.team as string | undefined,
        type: 'future',
      });

    case 'get_franchise_summary':
      return handleGetFranchise({ team: input.team as string | undefined });

    case 'answer_rule_question':
      return handleGetRules({
        search: input.search as string | undefined,
        section: input.section as string | undefined,
      });

    case 'get_weekly_content_context':
      return handleGetWeeklyContext();

    case 'get_commissioner_ops_context':
      return handleGetCommissionerOps();

    case 'show_team_card':
      return handleGetTeam({ name: input.name as string | undefined });

    case 'get_league_overview':
      return handleGetLeagueOverview();

    case 'get_position_rooms':
      return handleGetPositionRooms({
        team: input.team as string | undefined,
        position: input.position as string | undefined,
      });

    case 'compare_teams':
      return handleCompareTeams({
        team1: input.team1 as string | undefined,
        team2: input.team2 as string | undefined,
      });

    case 'get_future_pick_board':
      return handleGetFuturePickBoard();

    case 'get_trade_block':
      return handleGetTradeBlock({ team: input.team as string | undefined });

    case 'get_power_rankings':
      return handleGetPowerRankings();

    case 'analyze_roster':
      return handleAnalyzeRoster({ name: input.name as string | undefined });

    case 'analyze_trade':
      return handleAnalyzeTrade({
        side_a: input.side_a as string[],
        side_b: input.side_b as string[],
        source: input.source as 'avg' | 'fc' | 'ktc' | undefined,
      });

    case 'get_player_values':
      return handleGetPlayerValues({ players: input.players as string[] });

    default:
      throw new McpError('method_not_found', `Unknown tool: ${name}`);
  }
}

// ─── MCP JSON-RPC response helpers ────────────────────────────────────────────

function jsonrpcResult(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { status: 200 });
}

function jsonrpcError(id: string | number | null, code: number, message: string, data?: unknown) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } },
    { status: 200 }, // MCP errors return 200 with error in body per spec
  );
}

// ─── main handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  // Auth check — same guard used by all /api/mcp/* routes
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonrpcError(null, -32700, 'Parse error: invalid JSON');
  }

  const { id = null, method, params } = body;

  if (!method || typeof method !== 'string') {
    return jsonrpcError(id, -32600, 'Invalid Request: missing method');
  }

  // ── initialize ─────────────────────────────────────────────────────────────
  if (method === 'initialize') {
    return jsonrpcResult(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {}, resources: {} },
      serverInfo: {
        name: 'east-v-west-mcp',
        version: '3.0.0',
        description: 'Read-only MCP server for East v. West dynasty fantasy league. Tools: standings, rosters, matchups, transactions, trades, draft picks, league rules, team cards, league overview, position rooms, team comparisons, future pick board, weekly content briefing, and commissioner ops.',
      },
    });
  }

  // ── notifications/initialized (client ACK — no response needed per spec) ───
  if (method === 'notifications/initialized') {
    return new NextResponse(null, { status: 204 });
  }

  // ── tools/list ─────────────────────────────────────────────────────────────
  if (method === 'tools/list') {
    return jsonrpcResult(id, { tools: MCP_TOOLS });
  }

  // ── resources/list ────────────────────────────────────────────────────────
  if (method === 'resources/list') {
    return jsonrpcResult(id, { resources: [TEAM_CARD_RESOURCE] });
  }

  // ── resources/read ────────────────────────────────────────────────────────
  if (method === 'resources/read') {
    const p = (params ?? {}) as { uri?: string };
    if (p.uri === TEAM_CARD_WIDGET_URI) {
      return jsonrpcResult(id, {
        contents: [{
          uri: TEAM_CARD_WIDGET_URI,
          mimeType: TEAM_CARD_RESOURCE.mimeType,
          text: TEAM_CARD_HTML,
        }],
      });
    }
    return jsonrpcError(id, -32602, `Unknown resource URI: ${p.uri ?? '(none)'}`);
  }

  // ── tools/call ─────────────────────────────────────────────────────────────
  if (method === 'tools/call') {
    const p = (params ?? {}) as { name?: string; arguments?: ToolInput };
    const toolName = p.name;
    const toolInput = p.arguments ?? {};

    if (!toolName) {
      return jsonrpcError(id, -32602, 'Invalid params: missing tool name');
    }

    try {
      const result = await withMcpLogging(toolName, toolInput, () => dispatchTool(toolName, toolInput));
      // show_team_card: structuredContent + _meta triggers the Team Card widget.
      if (toolName === 'show_team_card') {
        return jsonrpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
          _meta: {
            'openai/outputTemplate': { uri: TEAM_CARD_WIDGET_URI },
          },
          isError: false,
        });
      }
      // get_team_dashboard: also include structuredContent so the widget renders
      // correctly if triggered by a cached manifest that still has the annotation.
      // No _meta here — we deliberately do not ask for the widget on a plain data call.
      if (toolName === 'get_team_dashboard') {
        return jsonrpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
          isError: false,
        });
      }
      return jsonrpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        isError: false,
      });
    } catch (err) {
      if (err instanceof McpError) {
        // Domain errors (not_found, missing_param, etc.) — return as tool error
        return jsonrpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: err.code, message: err.message }) }],
          isError: true,
        });
      }
      console.error(`[mcp/dispatch] tool=${toolName}`, err);
      return jsonrpcError(id, -32603, 'Internal error', { tool: toolName });
    }
  }

  // ── unknown method ─────────────────────────────────────────────────────────
  return jsonrpcError(id, -32601, `Method not found: ${method}`);
}

// ── GET — discovery / health check ────────────────────────────────────────────
// ChatGPT's connector UI may GET the endpoint to verify it's reachable.
// Returns server info without requiring auth so the URL can be validated.
export async function GET() {
  return NextResponse.json({
    name: 'east-v-west-mcp',
    version: '3.0.0',
    protocol: 'MCP HTTP Transport 2025-03-26',
    description: 'Read-only MCP server for East v. West dynasty fantasy league.',
    endpoint: 'POST /api/mcp',
    authScheme: 'Authorization: Bearer <MCP_API_KEY>',
    toolCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map((t) => t.name),
    status: process.env.MCP_API_KEY ? 'ready' : 'not_configured',
  });
}
