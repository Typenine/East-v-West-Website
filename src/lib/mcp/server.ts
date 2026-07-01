import { NextResponse } from 'next/server';
import { TEAM_CARD_HTML, TEAM_CARD_RESOURCE, TEAM_CARD_RESOURCE_META, TEAM_CARD_WIDGET_URI } from '@/lib/mcp/widgets/team-card';
import { MCP_TOOLS } from '@/lib/mcp/tool-definitions';
import { dispatchTool, type ToolInput } from '@/lib/mcp/public-dispatch';
import { McpError } from '@/lib/mcp/handlers';

export type ToolExecutor = (name: string, input: ToolInput) => ReturnType<typeof dispatchTool>;
export type ServerIdentity = { name: string; version: string; description: string };

function ok(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { status: 200 });
}
function err(id: string | number | null, code: number, message: string, data?: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } }, { status: 200 });
}

export async function handleMcpPost(request: Request, identity: ServerIdentity, execute: ToolExecutor = dispatchTool) {
  let body: { id?: string | number | null; method?: string; params?: unknown };
  try { body = await request.json(); } catch { return err(null, -32700, 'Parse error: invalid JSON'); }
  const { id = null, method, params } = body;
  if (!method || typeof method !== 'string') return err(id, -32600, 'Invalid Request: missing method');

  if (method === 'initialize') return ok(id, {
    protocolVersion: '2025-03-26', capabilities: { tools: {}, resources: {} }, serverInfo: identity,
  });
  if (method === 'notifications/initialized') return new NextResponse(null, { status: 204 });
  if (method === 'tools/list') return ok(id, { tools: MCP_TOOLS });
  if (method === 'resources/list') return ok(id, { resources: [TEAM_CARD_RESOURCE] });
  if (method === 'resources/read') {
    const uri = ((params ?? {}) as { uri?: string }).uri;
    if (uri !== TEAM_CARD_WIDGET_URI) return err(id, -32602, `Resource not found: ${uri}`);
    return ok(id, { contents: [{
      uri: TEAM_CARD_WIDGET_URI,
      mimeType: TEAM_CARD_RESOURCE.mimeType,
      text: TEAM_CARD_HTML,
      _meta: TEAM_CARD_RESOURCE_META,
    }] });
  }
  if (method === 'tools/call') {
    const call = (params ?? {}) as { name?: string; arguments?: ToolInput };
    if (!call.name) return err(id, -32602, 'Invalid params: missing tool name');
    try {
      const result = await execute(call.name, call.arguments ?? {});
      return ok(id, {
        structuredContent: result.structuredContent,
        content: result.markdown
          ? [{ type: 'text', text: result.markdown }]
          : [{ type: 'text', text: JSON.stringify(result.structuredContent) }],
        isError: false,
        ...(result._meta ? { _meta: result._meta } : {}),
      });
    } catch (error) {
      if (error instanceof McpError) return ok(id, { content: [{ type: 'text', text: `**Error:** ${error.message}` }], isError: true });
      console.error(`[mcp/dispatch] tool=${call.name}`, error);
      return err(id, -32603, 'Internal error', { tool: call.name });
    }
  }
  return err(id, -32601, `Method not found: ${method}`);
}

export { MCP_TOOLS };
