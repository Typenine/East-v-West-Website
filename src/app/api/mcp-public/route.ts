/**
 * Public MCP HTTP Transport Endpoint
 * POST /api/mcp-public  (no authentication required)
 * GET  /api/mcp-public  (health / discovery)
 *
 * This is a read-only, no-auth variant of /api/mcp intended for ChatGPT
 * connector setup using "Authentication: No Auth".
 *
 * Safety:
 *   - All data comes from Sleeper's public API and static league constants.
 *   - No database access, no user_docs, no session tokens, no admin data.
 *   - No write, delete, or mutation operations.
 *   - Payloads are capped (same limits as the authenticated endpoint).
 *   - The full Sleeper player database is never returned.
 *
 * The original /api/mcp endpoint is untouched and remains Bearer-protected.
 * All tool logic is shared via src/lib/mcp/handlers.ts.
 */

import { NextResponse } from 'next/server';
import { mcpMeta } from '@/lib/mcp/auth';
import { TEAM_CARD_HTML, TEAM_CARD_WIDGET_URI, TEAM_CARD_RESOURCE } from '@/lib/mcp/widgets/team-card';
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
  formatStandingsMarkdown,
  formatTeamMarkdown,
  formatMatchupsMarkdown,
  formatFranchiseMarkdown,
  formatWeeklyContextMarkdown,
  formatDraftPicksMarkdown,
  formatTradeHistoryMarkdown,
  formatRuleAnswerMarkdown,
  formatRosterMarkdown,
  handleGetCommissionerOps,
  formatCommissionerOpsMarkdown,
  McpError,
} from '@/lib/mcp/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── Tool definitions (identical to /api/mcp, copied for self-containment) ────

const PUBLIC_TOOLS = [
  {
    name: 'get_league_info',
    description: 'Returns league identity, format, scoring settings, payout structure, roster configuration, important dates, and all-time champions. Fully static — no Sleeper API call required.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_current_standings',
    description: 'Returns current-season W/L standings (live from Sleeper) and all-time career standings. currentSeasonStandings is the live view; allTimeStandings is the career record. Includes championship counts.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_team_dashboard',
    description: 'Returns a single team\'s full dashboard: current-season record, active/IR/taxi roster with player names and positions, all-time stats, and championship history.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Team name or partial name (case-insensitive). E.g. "Belltown" or "Belltown Raptors".' },
      },
      required: ['name'],
    },
    _meta: {
      ui: { resourceUri: TEAM_CARD_WIDGET_URI },
    },
  },
  {
    name: 'get_current_roster',
    description: 'Returns current-season rosters for all teams or a single team. Each player includes name, position, NFL team, injury status, and slot (active/ir/taxi). Never returns the full player database.',
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
    description: 'Searches for players by name across the full Sleeper player database. Returns best matches first — league-owned players are ranked higher. Use this when you don\'t know the player\'s Sleeper ID.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Partial or full player name to search for. E.g. "Mahomes" or "Patrick Mahomes".' },
        limit: { type: 'number', description: 'Max results to return (default 5, max 20).' },
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
        id: { type: 'string', description: 'Sleeper player ID (numeric string, e.g. "4034"). Use search_players first if you don\'t know the ID.' },
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
        week: { type: 'number', description: 'Optional NFL week override (1–17). Defaults to current week.' },
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
        limit: { type: 'number', description: 'Max transactions to return (default 25, max 100).' },
        team: { type: 'string', description: 'Filter to a specific team (partial, case-insensitive).' },
        season: { type: 'string', description: 'Filter to a specific season year, e.g. "2025".' },
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
        team: { type: 'string', description: 'Filter to trades involving a team (partial, case-insensitive).' },
        season: { type: 'string', description: 'Filter to a specific season year, e.g. "2025".' },
        limit: { type: 'number', description: 'Max trades to return (default 20, max 50).' },
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
        season: { type: 'string', description: 'Filter to a specific season year, e.g. "2025".' },
        team: { type: 'string', description: 'Filter picks owned by or from a team (partial, case-insensitive).' },
        type: { type: 'string', enum: ['history', 'future'], description: '"history" = completed picks only, "future" = future pick ownership only. Omit for both.' },
      },
      required: [],
    },
  },
  {
    name: 'get_draft_picks',
    description: 'Returns current future draft pick ownership for a team or all teams. Use this to answer "what picks does [team] have?"',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', description: 'Filter to picks owned by or from a specific team (partial, case-insensitive).' },
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
        team: { type: 'string', description: 'Optional team name filter (partial, case-insensitive).' },
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
        search: { type: 'string', description: 'Keyword to search across rule titles and text (case-insensitive). E.g. "waiver", "trade deadline", "taxi".' },
        section: { type: 'string', description: 'Exact section id for direct lookup. E.g. "waivers-free-agents". Call with no args first to see available section ids.' },
      },
      required: [],
    },
  },
  {
    name: 'get_weekly_content_context',
    description: 'Content Studio briefing: current matchups (with story hooks), full standings (PF/PA/avg), playoff race snapshot, recent trades, recent waiver/FA moves, injury flags, suggested storylines, and suggested headlines. Use this as the context source before asking ChatGPT to write any league content draft.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_commissioner_ops_context',
    description: 'Advisory-only commissioner ops briefing. Returns: date-based reminders (draft, trade deadline, playoffs), weekly checklist, lineup watch (injured starters), IR slot review, taxi eligibility review, injury/status flags, relevant rulebook snippets, and draft owner messages ready for human review. Makes no rulings, sends nothing, modifies nothing.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// ─── Dispatch ──────────────────────────────────────────────────────────────────
// Returns { structuredContent, markdown } for tools with rich rendering support,
// or { structuredContent: data, markdown: null } for all other tools.

type ToolInput = Record<string, unknown>;
type DispatchResult = { structuredContent: unknown; markdown: string | null; _meta?: Record<string, unknown> };

async function dispatchTool(name: string, input: ToolInput): Promise<DispatchResult> {
  switch (name) {
    case 'get_current_standings': {
      const data = await handleGetStandings();
      const md = formatStandingsMarkdown(
        (data as { currentSeasonStandings: Parameters<typeof formatStandingsMarkdown>[0] }).currentSeasonStandings,
        (data as { meta: { currentSeason?: string } }).meta?.currentSeason ?? String(new Date().getFullYear()),
      );
      return { structuredContent: data, markdown: md };
    }
    case 'get_team_dashboard': {
      const data = await handleGetTeam({ name: input.name as string | undefined });
      const md = formatTeamMarkdown(data as Parameters<typeof formatTeamMarkdown>[0]);
      return {
        structuredContent: data,
        markdown: md,
        _meta: {
          ui: { resourceUri: TEAM_CARD_WIDGET_URI },
          'openai/outputTemplate': TEAM_CARD_WIDGET_URI,
        },
      };
    }
    case 'get_current_matchups': {
      const data = await handleGetMatchups({ week: input.week as number | undefined });
      const d = data as { week: number; matchups: Parameters<typeof formatMatchupsMarkdown>[0]; meta: { nflSeason?: string } };
      const md = formatMatchupsMarkdown(d.matchups, d.week, d.meta?.nflSeason ?? String(new Date().getFullYear()));
      return { structuredContent: data, markdown: md };
    }
    case 'get_league_info':
      return { structuredContent: await handleGetLeagueInfo(), markdown: null };
    case 'get_current_roster': {
      const data = await handleGetRosters({ team: input.team as string | undefined });
      const md = formatRosterMarkdown(data as Parameters<typeof formatRosterMarkdown>[0]);
      return {
        structuredContent: data,
        markdown: md ?? (
          (data as { rosters: unknown[] }).rosters.length > 1
            ? `*Showing all ${(data as { rosters: unknown[] }).rosters.length} team rosters as JSON. Use \`team\` param to get a formatted card for one team.*\n\n${JSON.stringify(data)}`
            : JSON.stringify(data)
        ),
      };
    }
    case 'search_players':
      return { structuredContent: await handleGetPlayer({ name: input.name as string | undefined, limit: input.limit as number | undefined }), markdown: null };
    case 'get_player_info':
      return { structuredContent: await handleGetPlayer({ id: input.id as string | undefined }), markdown: null };
    case 'get_recent_transactions':
      return { structuredContent: await handleGetTransactions({ limit: input.limit as number | undefined, team: input.team as string | undefined, season: input.season as string | undefined }), markdown: null };
    case 'get_trade_history': {
      const teamArg = input.team as string | undefined;
      const limitArg = input.limit as number | undefined;
      const data = await handleGetTrades({ team: teamArg, season: input.season as string | undefined, limit: limitArg });
      type TradeResult = { trades: Parameters<typeof formatTradeHistoryMarkdown>[0] };
      const d = data as TradeResult;
      return { structuredContent: data, markdown: formatTradeHistoryMarkdown(d.trades, teamArg, Math.min(limitArg ?? 8, 8)) };
    }
    case 'get_draft_history':
      return { structuredContent: await handleGetDrafts({ season: input.season as string | undefined, team: input.team as string | undefined, type: input.type as string | undefined }), markdown: null };
    case 'get_draft_picks': {
      const teamArg = input.team as string | undefined;
      const data = await handleGetDrafts({ team: teamArg, type: 'future' });
      const d = data as { futurePickOwnership: Parameters<typeof formatDraftPicksMarkdown>[0] };
      return { structuredContent: data, markdown: formatDraftPicksMarkdown(d.futurePickOwnership, teamArg) };
    }
    case 'get_franchise_summary': {
      const data = await handleGetFranchise({ team: input.team as string | undefined });
      const d = data as { franchises: Parameters<typeof formatFranchiseMarkdown>[0] };
      return { structuredContent: data, markdown: formatFranchiseMarkdown(d.franchises) };
    }
    case 'answer_rule_question': {
      const data = await handleGetRules({ search: input.search as string | undefined, section: input.section as string | undefined });
      return { structuredContent: data, markdown: formatRuleAnswerMarkdown(data as Parameters<typeof formatRuleAnswerMarkdown>[0]) };
    }
    case 'get_weekly_content_context': {
      const data = await handleGetWeeklyContext();
      const d = data as Parameters<typeof formatWeeklyContextMarkdown>[0];
      return { structuredContent: data, markdown: formatWeeklyContextMarkdown(d) };
    }
    case 'get_commissioner_ops_context': {
      const data = await handleGetCommissionerOps();
      return { structuredContent: data, markdown: formatCommissionerOpsMarkdown(data) };
    }
    default:
      throw new McpError('method_not_found', `Unknown tool: ${name}`);
  }
}

// ─── JSON-RPC helpers ──────────────────────────────────────────────────────────

function ok(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { status: 200 });
}

function err(id: string | number | null, code: number, message: string, data?: unknown) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } },
    { status: 200 },
  );
}

// ─── POST — MCP JSON-RPC transport ────────────────────────────────────────────

export async function POST(request: Request) {
  let body: { jsonrpc?: string; id?: string | number | null; method?: string; params?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return err(null, -32700, 'Parse error: invalid JSON');
  }

  const { id = null, method, params } = body;

  if (!method || typeof method !== 'string') {
    return err(id, -32600, 'Invalid Request: missing method');
  }

  // ── initialize ───────────────────────────────────────────────────────────────
  if (method === 'initialize') {
    return ok(id, {
      protocolVersion: '2025-03-26',
      capabilities: { tools: {}, resources: {} },
      serverInfo: {
        name: 'east-v-west-mcp-public',
        version: '1.0.0',
        description: 'Public read-only MCP server for East v. West dynasty fantasy league. No authentication required.',
      },
    });
  }

  // ── notifications/initialized (client ACK) ───────────────────────────────────
  if (method === 'notifications/initialized') {
    return new NextResponse(null, { status: 204 });
  }

  // ── resources/list ───────────────────────────────────────────────────────────
  if (method === 'resources/list') {
    return ok(id, { resources: [TEAM_CARD_RESOURCE] });
  }

  // ── resources/read ───────────────────────────────────────────────────────────
  if (method === 'resources/read') {
    const rp = (params ?? {}) as { uri?: string };
    if (rp.uri === TEAM_CARD_WIDGET_URI) {
      return ok(id, {
        contents: [{
          uri: TEAM_CARD_WIDGET_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: TEAM_CARD_HTML,
          _meta: {
            ui: {
              prefersBorder: true,
              domain: 'https://east-v-west-website.vercel.app',
              csp: {
                resourceDomains: ['https://east-v-west-website.vercel.app'],
              },
            },
            'openai/widgetDescription': 'East v. West Team Card — record, roster, championships, and injury flags.',
          },
        }],
      });
    }
    return err(id, -32602, `Resource not found: ${rp.uri}`);
  }

  // ── tools/list ───────────────────────────────────────────────────────────────
  if (method === 'tools/list') {
    return ok(id, { tools: PUBLIC_TOOLS });
  }

  // ── tools/call ───────────────────────────────────────────────────────────────
  if (method === 'tools/call') {
    const p = (params ?? {}) as { name?: string; arguments?: ToolInput };
    const toolName = p.name;
    const toolInput = p.arguments ?? {};

    if (!toolName) {
      return err(id, -32602, 'Invalid params: missing tool name');
    }

    try {
      const { structuredContent, markdown, _meta } = await dispatchTool(toolName, toolInput);
      return ok(id, {
        structuredContent,
        content: markdown
          ? [{ type: 'text', text: markdown }]
          : [{ type: 'text', text: JSON.stringify(structuredContent) }],
        isError: false,
        ...(_meta ? { _meta } : {}),
      });
    } catch (e) {
      if (e instanceof McpError) {
        return ok(id, {
          content: [{ type: 'text', text: `**Error:** ${e.message}` }],
          isError: true,
        });
      }
      console.error(`[mcp-public/dispatch] tool=${toolName}`, e);
      return err(id, -32603, 'Internal error', { tool: toolName });
    }
  }

  return err(id, -32601, `Method not found: ${method}`);
}

// ─── GET — health / discovery (no auth) ──────────────────────────────────────

export async function GET() {
  return NextResponse.json({
    name: 'east-v-west-mcp-public',
    version: '1.0.0',
    protocol: 'MCP HTTP Transport 2025-03-26',
    description: 'Public read-only MCP server for East v. West dynasty fantasy league.',
    endpoint: 'POST /api/mcp-public',
    authScheme: 'none',
    note: 'All tools are read-only. No database access. Source: Sleeper public API + static league constants.',
    toolCount: PUBLIC_TOOLS.length,
    tools: PUBLIC_TOOLS.map((t) => t.name),
    widgetResources: [TEAM_CARD_RESOURCE.uri],
    meta: mcpMeta('health', { dataSource: 'static' }),
  });
}
