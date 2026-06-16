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

    const durationMs = Date.now() - t0;
    const latencyTier = durationMs < 500 ? 'fast' : durationMs < 2000 ? 'normal' : 'slow';

    const logMeta: Record<string, unknown> = { tool, status: 'ok', durationMs, latencyTier, responseBytes };
    if (result && typeof result === 'object') {
      const r = result as Record<string, unknown>;
      const mr = r.matchResolution as Record<string, unknown> | undefined;
      if (mr?.matchedTeam) { logMeta.resolvedTeam = mr.matchedTeam; logMeta.matchConfidence = mr.confidence; }
      const d = r.data as Record<string, unknown> | undefined;
      const cacheStatus = d?.cacheStatus ?? (r.meta as Record<string, unknown> | undefined)?.cacheStatus;
      if (cacheStatus) logMeta.cacheStatus = cacheStatus;
      if (Array.isArray(r.warnings) && r.warnings.length > 0) logMeta.warningCount = r.warnings.length;
    }
    console.log('[mcp]', JSON.stringify(logMeta));

    await recordMcpCall({
      tool,
      args,
      status: 'ok',
      durationMs,
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
