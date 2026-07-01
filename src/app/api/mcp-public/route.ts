import { NextResponse } from 'next/server';
import { mcpMeta } from '@/lib/mcp/auth';
import { handleMcpPost, MCP_TOOLS } from '@/lib/mcp/server';
import { TEAM_CARD_RESOURCE } from '@/lib/mcp/widgets/team-card';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const identity = {
  name: 'east-v-west-mcp-public',
  version: '1.1.0',
  description: 'Public read-only MCP server for East v. West dynasty fantasy league. No authentication required.',
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
    note: 'All tools are read-only. No database access. Source: Sleeper public API + static league constants.',
    toolCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map((tool) => tool.name),
    widgetResources: [TEAM_CARD_RESOURCE.uri],
    meta: mcpMeta('health', { dataSource: 'static' }),
  });
}
