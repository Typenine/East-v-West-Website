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
  McpError,
} from '@/lib/mcp/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── MCP Tool Definitions (JSON Schema input schemas for tools/list) ───────────

const MCP_TOOLS = [
  {
    name: 'get_league_info',
    description: 'Returns league identity, format, scoring settings, payout structure, roster configuration, important dates, and all-time champions. Fully static — no Sleeper API call required.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_current_standings',
    description: 'Returns current-season W/L standings (live from Sleeper) and all-time career standings. currentSeasonStandings is the live view; allTimeStandings is the career record. Includes championship counts.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_team_dashboard',
    description: 'Returns a single team\'s full dashboard: current-season record, active/IR/taxi roster with player names and positions, all-time stats, and championship history.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Team name or partial name (case-insensitive). E.g. "Belltown" or "Belltown Raptors".',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_current_roster',
    description: 'Returns current-season rosters for all teams or a single team. Each player includes name, position, NFL team, injury status, and slot (active/ir/taxi). Never returns the full player database.',
    inputSchema: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Optional team name filter (partial, case-insensitive).',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_players',
    description: 'Searches for players by name across the full Sleeper player database. Returns best matches first — league-owned players are ranked higher. Use this when you don\'t know the player\'s Sleeper ID.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Partial or full player name to search for. E.g. "Mahomes" or "Patrick Mahomes".',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default 5, max 20).',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_player_info',
    description: 'Returns a single player\'s profile by Sleeper player ID: position, NFL team, injury status, experience, and which fantasy team currently owns them (if any).',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Sleeper player ID (numeric string, e.g. "4034"). Use search_players first if you don\'t know the ID.',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'get_current_matchups',
    description: 'Returns this week\'s fantasy matchups with team names and current/final scores. Defaults to the current NFL week from Sleeper state.',
    inputSchema: {
      type: 'object',
      properties: {
        week: {
          type: 'number',
          description: 'Optional NFL week override (1–17). Defaults to current week.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_recent_transactions',
    description: 'Returns recent waiver and free-agent transactions: players added/dropped, FAAB spent, and acquiring team. Focused and limited to avoid large payloads.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max transactions to return (default 25, max 100).',
        },
        team: {
          type: 'string',
          description: 'Filter to a specific team (partial, case-insensitive).',
        },
        season: {
          type: 'string',
          description: 'Filter to a specific season year, e.g. "2025".',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_trade_history',
    description: 'Returns slim trade history with player names, positions, and pick descriptions for each side of every trade. Filterable by team and season.',
    inputSchema: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Filter to trades involving a team (partial, case-insensitive).',
        },
        season: {
          type: 'string',
          description: 'Filter to a specific season year, e.g. "2025".',
        },
        limit: {
          type: 'number',
          description: 'Max trades to return (default 20, max 50).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_draft_history',
    description: 'Returns draft history by season (completed picks with player names and positions) and current future-pick ownership (traded picks for upcoming drafts). Filterable by season, team, and type.',
    inputSchema: {
      type: 'object',
      properties: {
        season: {
          type: 'string',
          description: 'Filter to a specific season year, e.g. "2025".',
        },
        team: {
          type: 'string',
          description: 'Filter picks owned by or from a team (partial, case-insensitive).',
        },
        type: {
          type: 'string',
          enum: ['history', 'future'],
          description: '"history" = completed picks only, "future" = future pick ownership only. Omit for both.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_draft_picks',
    description: 'Returns current future draft pick ownership for a team or all teams. Use this to answer "what picks does [team] have?" Use get_draft_history with type=future for the same data.',
    inputSchema: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Filter to picks owned by or from a specific team (partial, case-insensitive).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_franchise_summary',
    description: 'Returns all-time franchise stats per team: regular-season and playoff W/L records, win percentage, points for/against, and championship/runner-up counts. Filterable by team.',
    inputSchema: {
      type: 'object',
      properties: {
        team: {
          type: 'string',
          description: 'Optional team name filter (partial, case-insensitive).',
        },
      },
      required: [],
    },
  },
  {
    name: 'answer_rule_question',
    description: 'Returns league rules as clean plain text. Supports keyword search (e.g. search="waiver") and direct section lookup (e.g. section="waivers-free-agents"). Returns matching line excerpts when searching. Source: East v. West Rulebook v3, ratified 2026-02-12.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Keyword to search across rule titles and text (case-insensitive). E.g. "waiver", "trade deadline", "taxi".',
        },
        section: {
          type: 'string',
          description: 'Exact section id for direct lookup. E.g. "waivers-free-agents". Call with no args first to see available section ids.',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_weekly_content_context',
    description: 'Content Studio briefing: current matchups (with story hooks), full standings (PF/PA/avg), playoff race snapshot, recent trades, recent waiver/FA moves, injury flags, suggested storylines, and suggested headlines. Use this as the context source before asking ChatGPT to write any league content draft.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_commissioner_ops_context',
    description: 'Advisory-only commissioner ops briefing. Returns: date-based reminders (draft, trade deadline, playoffs), weekly checklist, lineup watch (injured starters), IR slot review, taxi eligibility review, injury/status flags, relevant rulebook snippets, and draft owner messages ready for human review. Makes no rulings, sends nothing, modifies nothing.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
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
      capabilities: { tools: {} },
      serverInfo: {
        name: 'east-v-west-mcp',
        version: '2.0.0',
        description: 'Read-only MCP server for East v. West dynasty fantasy league. Provides live standings, rosters, matchups, transactions, trades, draft picks, and league rules.',
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
    version: '2.0.0',
    protocol: 'MCP HTTP Transport 2025-03-26',
    description: 'Read-only MCP server for East v. West dynasty fantasy league.',
    endpoint: 'POST /api/mcp',
    authScheme: 'Authorization: Bearer <MCP_API_KEY>',
    toolCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map((t) => t.name),
    status: process.env.MCP_API_KEY ? 'ready' : 'not_configured',
  });
}
