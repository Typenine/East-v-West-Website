/**
 * Groq Provider
 * Raw Groq API call — no rate limiter, no persona configs.
 * Rate limiting is handled upstream by the cascade + groq.ts's own semaphore.
 */

import type { ProviderRequest } from '../cascade';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const PRIMARY_MODEL = 'llama-3.3-70b-versatile';
const FALLBACK_MODEL = 'llama-3.1-8b-instant';

// Groq free tier: ~6,000 TPM. A newsletter prompt is 8,000-12,000 tokens (system+context+output).
// Capping output at 1,500 keeps total tokens manageable and prevents a single large call
// from 429-ing the provider and poisoning it for the cascade's 2-minute cooldown window.
const GROQ_MAX_OUTPUT_TOKENS = 1_500;

export async function generateWithGroqProvider(req: ProviderRequest): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const modelsToTry = [PRIMARY_MODEL, FALLBACK_MODEL];

  for (const model of modelsToTry) {
    const abort = new AbortController();
    const abortTimer = setTimeout(() => abort.abort(), 40_000);

    try {
      let response: Response;
      try {
        response = await fetch(GROQ_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: req.systemPrompt },
              { role: 'user',   content: req.userPrompt },
            ],
            temperature: req.temperature,
            max_tokens: Math.min(req.maxTokens, GROQ_MAX_OUTPUT_TOKENS),
            top_p: req.topP ?? 0.9,
          }),
          signal: abort.signal,
        });
      } finally {
        clearTimeout(abortTimer);
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) throw new Error(`Groq 401 Unauthorized: ${errorText}`);
        if (response.status === 404) throw new Error(`Groq 404 model not found: ${errorText}`);
        throw new Error(`Groq HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string } | string;
      };

      if (data.error) {
        const msg = typeof data.error === 'string' ? data.error : (data.error.message ?? 'unknown');
        throw new Error(`Groq API error: ${msg}`);
      }

      const text = data.choices?.[0]?.message?.content ?? '';
      return text.trim();

    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

      // Timeout — non-retryable, let cascade handle it
      if (msg.includes('aborted') || msg.includes('timed out')) {
        throw new Error('Groq call timed out after 40s');
      }

      // Auth/model errors — non-retryable
      if (msg.includes('401') || msg.includes('unauthorized')) throw err as Error;
      if (msg.includes('404') || msg.includes('model not found')) {
        // Try fallback model instead of throwing
        if (model === PRIMARY_MODEL) continue;
        throw err as Error;
      }

      // Rate-limit / quota — re-throw for cascade to catch
      if (
        msg.includes('429') ||
        msg.includes('rate limit') ||
        msg.includes('quota') ||
        msg.includes('exhausted') ||
        msg.includes('too many') ||
        msg.includes('tokens per minute') ||
        msg.includes('requests per minute')
      ) {
        throw err as Error;
      }

      // Other error — try fallback model if we haven't yet
      if (model === PRIMARY_MODEL) continue;
      throw err as Error;
    }
  }

  throw new Error('Groq: all models failed');
}
