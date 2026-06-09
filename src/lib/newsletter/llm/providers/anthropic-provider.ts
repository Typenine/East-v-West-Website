/**
 * Anthropic Claude Provider
 * Implements the ProviderRequest → Promise<string> interface used by the cascade.
 *
 * Configuration (env vars):
 *   ANTHROPIC_API_KEY       — required
 *   ANTHROPIC_MODEL         — default: claude-sonnet-4-6
 *   LLM_TIMEOUT_MS          — per-call timeout, default: 150000 (extended thinking needs more time)
 *   LLM_MAX_RETRIES         — retry attempts on 429/529, default: 5
 *   CLAUDE_THINKING_ENABLED — set to "false" to globally disable extended thinking
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
// Extended thinking calls can take 30-60s on top of regular latency
const DEFAULT_TIMEOUT_MS = 150_000;
const DEFAULT_MAX_RETRIES = 5;

// Claude Sonnet supports up to 64K output tokens on the paid tier.
// 16K is our practical ceiling — mock drafts with extended thinking rarely exceed 8K.
const CLAUDE_MAX_OUTPUT_TOKENS = 16_000;

// Extended thinking: budget_tokens must be at least 1024 and less than max_tokens.
// Claude 3.7+ supports interleaved thinking. We require >=1024 before enabling.
const CLAUDE_MIN_THINKING_BUDGET = 1_024;
// When thinking is enabled, output tokens are in addition to thinking tokens.
// So max_tokens must cover BOTH thinking + text output.
function buildThinkingMaxTokens(thinkingBudget: number, textBudget: number): number {
  // max_tokens = thinking_budget + text budget with a small safety margin
  return Math.min(thinkingBudget + textBudget + 512, CLAUDE_MAX_OUTPUT_TOKENS);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

export async function generateWithAnthropicProvider(req: ProviderRequest): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const timeoutMs = parseInt(process.env.LLM_TIMEOUT_MS ?? '', 10) || DEFAULT_TIMEOUT_MS;
  const maxRetries = parseInt(process.env.LLM_MAX_RETRIES ?? '', 10) || DEFAULT_MAX_RETRIES;

  // Determine if extended thinking should be used for this call
  const thinkingEnabled = process.env.CLAUDE_THINKING_ENABLED !== 'false';
  const rawThinkingBudget = req.claudeThinkingBudget ?? 0;
  const useThinking = thinkingEnabled && rawThinkingBudget >= CLAUDE_MIN_THINKING_BUDGET;
  const thinkingBudget = useThinking ? rawThinkingBudget : 0;

  const client = new Anthropic({
    apiKey,
    timeout: timeoutMs,
    maxRetries: 0,
    defaultHeaders: useThinking
      ? { 'anthropic-beta': 'interleaved-thinking-2025-05-14' }
      : undefined,
  });

  const section = req.sectionName ?? 'unknown';
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const t0 = Date.now();
    try {
      // When thinking is on, temperature must be 1 (API requirement) and
      // max_tokens must accommodate both thinking blocks + text output.
      const maxTokens = useThinking
        ? buildThinkingMaxTokens(thinkingBudget, Math.min(req.maxTokens, CLAUDE_MAX_OUTPUT_TOKENS))
        : Math.min(req.maxTokens, CLAUDE_MAX_OUTPUT_TOKENS);

      const createParams: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: maxTokens,
        temperature: useThinking ? 1 : req.temperature,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
        ...(useThinking ? { thinking: { type: 'enabled' as const, budget_tokens: thinkingBudget } } : {}),
      };

      const message: Anthropic.Message = await client.messages.create({ ...createParams, stream: false });

      const durationMs = Date.now() - t0;
      const inputTokens = message.usage.input_tokens;
      const outputTokens = message.usage.output_tokens;
      const stopReason = message.stop_reason ?? 'unknown';
      // cache_read_input_tokens is on the usage object when prompt caching is active
      const cacheReadTokens = (message.usage as unknown as Record<string, unknown>).cache_read_input_tokens as number | undefined;

      // Count thinking tokens separately for logging
      const thinkingTokensUsed = useThinking
        ? message.content
            .filter((b): b is Anthropic.ThinkingBlock => b.type === 'thinking')
            .reduce((sum: number, b: Anthropic.ThinkingBlock) => {
              const bt = (b as unknown as { thinking_tokens?: number }).thinking_tokens;
              return sum + (bt ?? 0);
            }, 0)
        : 0;

      // Accumulate session tokens for this process lifetime (per-step on Vercel)
      anthropicSessionTokens.inputTokens += inputTokens;
      anthropicSessionTokens.outputTokens += outputTokens;
      anthropicSessionTokens.calls += 1;

      console.log(
        `[Anthropic/${model}] section="${section}" stop=${stopReason}` +
        ` in=${inputTokens} out=${outputTokens}` +
        (thinkingTokensUsed ? ` thinking≈${thinkingTokensUsed}` : '') +
        (cacheReadTokens ? ` cache_read=${cacheReadTokens}` : '') +
        ` total_in=${anthropicSessionTokens.inputTokens} total_out=${anthropicSessionTokens.outputTokens}` +
        ` attempt=${attempt + 1}/${maxRetries + 1} ${durationMs}ms` +
        (useThinking ? ` [extended-thinking budget=${thinkingBudget}]` : ''),
      );

      if (stopReason === 'max_tokens') {
        throw new Error(
          `LLM_TRUNCATED_OUTPUT: Claude hit max_tokens for "${section}"` +
          ` (model=${model}, outputTokens=${outputTokens}, maxTokens=${maxTokens}` +
          (useThinking ? `, thinkingBudget=${thinkingBudget}` : '') + ')' +
          ' — consider raising claudeThinkingBudget or maxTokens',
        );
      }

      // Extract text blocks only — skip thinking blocks from the output
      const text = (message.content as Anthropic.ContentBlock[])
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block: Anthropic.TextBlock) => block.text)
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
