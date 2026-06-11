/**
 * MCP Call Logger
 *
 * Wraps an MCP tool invocation with timing + persistence into mcp_call_log.
 * Arg sanitization (token/key/secret redaction, value truncation) happens
 * inside recordMcpCall — nothing secret-looking is ever written to the DB.
 *
 * Logging is best-effort: recordMcpCall swallows its own errors, so a DB
 * outage can never fail a tool call.
 */

import { recordMcpCall } from '@/server/db/observability-queries';

export async function withMcpLogging<T>(
  tool: string,
  args: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();

    let responseBytes: number | undefined;
    try {
      responseBytes = JSON.stringify(result).length;
    } catch {
      responseBytes = undefined;
    }

    await recordMcpCall({
      tool,
      args,
      status: 'ok',
      durationMs: Date.now() - t0,
      responseBytes,
    });

    return result;
  } catch (err) {
    await recordMcpCall({
      tool,
      args,
      status: 'error',
      durationMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
