/**
 * Anthropic Claude Provider
 * Implements the ProviderRequest → Promise<string> interface used by the cascade.
 *
 * Configuration (env vars):
 *   ANTHROPIC_API_KEY  — required
 *   ANTHROPIC_MODEL    — default: claude-sonnet-4-6
 *   LLM_TIMEOUT_MS     — per-call timeout, default: 120000
 *   LLM_MAX_RETRIES    — retry attempts on 429/529, default: 2
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ProviderRequest } from '../cascade';

// Session-level token accumulator — resets per process (each Vercel request is independent,
// but within a single newsletter step this counts all LLM calls for that step).
// Exported so finalizeNewsletter can log a summary if desired.
export const anthropicSessionTokens = { inputTokens: 0, outputTokens: 0, calls: 0 };
export function resetAnthropicSessionTokens(): void {
  anthropicSessionTokens.inputTokens = 0;
  anthropicSessionTokens.outputTokens = 0;
  anthropicSessionTokens.calls = 0;
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_TIMEOUT_MS = 120_000;
// 5 retries = backoffs of 5s, 10s, 20s, 40s, 60s = up to 135s of patience.
// genPreDraftTrades (and other sections) run 4+ parallel LLM calls. If Claude
// returns 529 on any one of them, the default 2-retry window (5+10=15s) was
// too short — the other calls already consumed credits and their output is lost.
const DEFAULT_MAX_RETRIES = 5;

// Claude paid tier output cap. Higher than Groq/Gemini free tiers.
// Mock draft sections need up to 3500 tokens; 4096 gives headroom.
const CLAUDE_MAX_OUTPUT_TOKENS = 4_096;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function generateWithAnthropicProvider(req: ProviderRequest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS ?? '', 10) || DEFAULT_TIMEOUT_MS;
  const maxRetries = parseInt(process.env.LLM_MAX_RETRIES ?? '', 10) || DEFAULT_MAX_RETRIES;

  const client = new Anthropic({
    apiKey,
    timeout: timeoutMs,
    maxRetries: 0, // retry loop handled below so we control backoff and logging
  });

  const section = req.sectionName ?? 'unknown';
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = Date.now();
    try {
      const message = await client.messages.create({
        model,
        max_tokens: Math.min(req.maxTokens, CLAUDE_MAX_OUTPUT_TOKENS),
        temperature: req.temperature,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
      });

      const durationMs = Date.now() - t0;
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      const stopReason = message.stop_reason ?? 'unknown';

      // Accumulate session tokens for this process lifetime (per-step on Vercel)
      anthropicSessionTokens.inputTokens += inputTokens;
      anthropicSessionTokens.outputTokens += outputTokens;
      anthropicSessionTokens.calls += 1;

      console.log(
        `[Anthropic/${model}] section="${section}" stop=${stopReason}` +
        ` in=${inputTokens} out=${outputTokens} total_in=${anthropicSessionTokens.inputTokens} total_out=${anthropicSessionTokens.outputTokens}` +
        ` attempt=${attempt + 1}/${maxRetries + 1} ${durationMs}ms`,
      );

      if (stopReason === 'max_tokens') {
        throw new Error(
          `LLM_TRUNCATED_OUTPUT: Claude hit max_tokens for "${section}"` +
          ` (model=${model}, outputTokens=${outputTokens}, maxTokens=${Math.min(req.maxTokens, CLAUDE_MAX_OUTPUT_TOKENS)})`,
        );
      }

      const text = message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim();

      return text;

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      lastErr = error;
      const durationMs = Date.now() - t0;

      // Truncated output — not a provider error, throw immediately without retry
      if (error.message.includes('LLM_TRUNCATED_OUTPUT')) throw error;

      // Timeout — SDK throws APIConnectionTimeoutError for SDK-level timeouts
      if (err instanceof Anthropic.APIConnectionTimeoutError || error.message.toLowerCase().includes('timeout')) {
        console.error(`[Anthropic/${model}] section="${section}" timeout after ${durationMs}ms`);
        throw new Error(`Anthropic call timed out after ${timeoutMs}ms`);
      }

      // Auth error — not retryable; throw immediately so cascade flags as hard error
      if (err instanceof Anthropic.AuthenticationError) {
        console.error(`[Anthropic/${model}] section="${section}" auth error (401) — check ANTHROPIC_API_KEY`);
        throw new Error(`Anthropic 401 Unauthorized — check ANTHROPIC_API_KEY`);
      }

      // Rate limit (429) — retry, honoring retry-after header if present
      if (err instanceof Anthropic.RateLimitError) {
        let backoffMs = Math.min(5_000 * Math.pow(2, attempt), 60_000);
        // Honor retry-after header when Anthropic provides it (cast to APIError to access headers)
        const retryAfterRaw = (err as unknown as { headers?: { get?: (k: string) => string | null } }).headers?.get?.('retry-after');
        if (retryAfterRaw) {
          const retryAfterSec = parseFloat(retryAfterRaw);
          if (!isNaN(retryAfterSec) && retryAfterSec > 0) {
            backoffMs = Math.ceil(retryAfterSec * 1000) + 500; // +500ms safety margin
          }
        }
        console.warn(
          `[Anthropic/${model}] section="${section}" rate-limited (429)` +
          ` attempt=${attempt + 1}/${maxRetries + 1} backoff=${Math.round(backoffMs / 1000)}s` +
          (retryAfterRaw ? ` (retry-after=${retryAfterRaw}s)` : ' (exponential)'),
        );
        if (attempt < maxRetries) { await sleep(backoffMs); continue; }
        throw new Error(`Anthropic 429 rate limited after ${maxRetries + 1} attempts`);
      }

      // Overloaded (529) or InternalServerError (5xx) — retry with exponential backoff
      const isOverloaded = (err instanceof Anthropic.APIError && (err.status === 529 || err.status === 503))
        || error.message.toLowerCase().includes('overloaded');
      if (isOverloaded) {
        const backoffMs = Math.min(5_000 * Math.pow(2, attempt), 60_000);
        console.warn(
          `[Anthropic/${model}] section="${section}" overloaded (${err instanceof Anthropic.APIError ? err.status : '529'})` +
          ` attempt=${attempt + 1}/${maxRetries + 1} backoff=${Math.round(backoffMs / 1000)}s`,
        );
        if (attempt < maxRetries) { await sleep(backoffMs); continue; }
        throw new Error(`Anthropic overloaded after ${maxRetries + 1} attempts: ${error.message}`);
      }

      // Other error — log and retry up to maxRetries
      console.error(
        `[Anthropic/${model}] section="${section}" attempt=${attempt + 1}/${maxRetries + 1} failed: ${error.message}`,
      );
      if (attempt < maxRetries) {
        await sleep(2_000 * (attempt + 1));
        continue;
      }
    }
  }

  throw lastErr ?? new Error('Anthropic: all retries exhausted');
}
