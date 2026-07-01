import { NextResponse } from 'next/server';
import { requireMcpAuth } from '@/lib/mcp/auth';
import { withMcpLogging } from '@/lib/mcp/call-logger';
import { dispatchTool } from '@/lib/mcp/public-dispatch';
import { handleMcpPost, MCP_TOOLS } from '@/lib/mcp/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const identity = {
  name: 'east-v-west-mcp',
  version: '3.1.0',
  description: 'Authenticated read-only MCP server for East v. West dynasty fantasy league.',
};

export async function POST(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;
  return handleMcpPost(request, identity, async (name, input) =>
    await withMcpLogging(name, input, () => dispatchTool(name, input)) as Awaited<ReturnType<typeof dispatchTool>>,
  );
}

export async function GET() {
  return NextResponse.json({
    ...identity,
    protocol: 'MCP HTTP Transport 2025-03-26',
    endpoint: 'POST /api/mcp',
    authScheme: 'Authorization: Bearer <MCP_API_KEY>',
    toolCount: MCP_TOOLS.length,
    tools: MCP_TOOLS.map((tool) => tool.name),
    status: process.env.MCP_API_KEY ? 'ready' : 'not_configured',
  });
}
