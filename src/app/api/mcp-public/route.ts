import { NextResponse } from 'next/server';
import { mcpMeta } from '@/lib/mcp/auth';
import { handleMcpPost, MCP_TOOLS } from '@/lib/mcp/server';
import { WIDGET_ENTRIES } from '@/lib/mcp/widgets/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const identity = {
  name: 'east-v-west-mcp-public',
  version: '2.1.0',
  description: 'Public read-only MCP server for East v. West dynasty fantasy league, backed by canonical stats, a permanent completed-season research warehouse, entity resolution, asset lineage, transaction intelligence, rivalry history, and current Sleeper data. No authentication required.',
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
    note: 'All exposed tools are read-only. Completed historical seasons and official award/record objects are persisted internally in Neon/Postgres; current-league data remains live from Sleeper and canonical site services.',
    toolCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map((tool) => tool.name),
    widgetResources: WIDGET_ENTRIES.map((w) => w.resource.uri),
    meta: mcpMeta('health', { dataSource: 'evw_research_backend_v1' }),
  });
}
