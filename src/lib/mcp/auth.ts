/**
 * MCP API authentication guard.
 *
 * All /api/mcp/* routes call requireMcpAuth(request) first.
 * Returns null when the request is authorized, or a NextResponse 401/403 to
 * return immediately when it is not.
 *
 * Auth mechanism:
 *   Bearer token in the Authorization header:
 *     Authorization: Bearer <MCP_API_KEY>
 *   OR the key in the X-MCP-Key header (for clients that can't set Authorization).
 *
 * The secret is configured via the MCP_API_KEY environment variable.
 * If the variable is absent the MCP routes are disabled (503).
 */

import { NextResponse } from 'next/server';

export function requireMcpAuth(request: Request): NextResponse | null {
  const key = process.env.MCP_API_KEY?.trim();

  if (!key) {
    return NextResponse.json(
      { error: 'mcp_not_configured', message: 'MCP access is not enabled on this server.' },
      { status: 503 },
    );
  }

  // Try Authorization: Bearer <token>
  const authHeader = request.headers.get('authorization') ?? '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const bearerToken = bearerMatch?.[1]?.trim() ?? '';

  // Fallback: X-MCP-Key header
  const xKey = (request.headers.get('x-mcp-key') ?? '').trim();

  const provided = bearerToken || xKey;

  if (!provided) {
    return NextResponse.json(
      { error: 'unauthorized', message: 'Missing API key. Provide Authorization: Bearer <key> or X-MCP-Key header.' },
      { status: 401 },
    );
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(provided, key)) {
    return NextResponse.json(
      { error: 'forbidden', message: 'Invalid API key.' },
      { status: 403 },
    );
  }

  return null; // authorized
}

/** Naive constant-time string comparison (no native crypto needed for this use case). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Iterate anyway to avoid early-exit timing leak on length difference (result discarded)
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      void ((a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0));
    }
    return false; // lengths differ, always false
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Standard metadata block included in all MCP responses. */
export function mcpMeta(tool: string, extra?: Record<string, unknown>) {
  return {
    tool,
    source: 'east-v-west-api',
    fetchedAt: new Date().toISOString(),
    ...extra,
  };
}
