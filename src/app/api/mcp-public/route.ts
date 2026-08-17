import { NextResponse } from 'next/server';
import { mcpMeta } from '@/lib/mcp/auth';
import { handleMcpPost, MCP_TOOLS } from '@/lib/mcp/server';
import { WIDGET_ENTRIES } from '@/lib/mcp/widgets/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const identity = {
  name: 'east-v-west-mcp-public',
  version: '2.0.0',
  description: 'Public read-only MCP server for East v. West dynasty fantasy league, including canonical league history, statistics, awards, records, and current Sleeper data. No authentication required.',
};

export async function POST(request: Request) {
  return handleMcpPost(request, identity);
}

export async function GET() {
  return NextResponse.json({
    ...identity,
    protocol: 'MCP HTTP Transport 2025-03-26',
    endpoint: 'POST /api/mcp-public',
    authScheme: 'none',
    note: 'All tools are read-only. Current-league tools use Sleeper/public league data; statistical-history tools reuse the site canonical V3 Stats, player-profile, awards, and history services.',
    toolCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map((tool) => tool.name),
    widgetResources: WIDGET_ENTRIES.map((w) => w.resource.uri),
    meta: mcpMeta('health', { dataSource: 'canonical_stats_and_sleeper' }),
  });
}
