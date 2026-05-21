/**
 * Cerebras Provider
 * OpenAI-compatible endpoint backed by Cerebras inference hardware.
 * Tries 70B first for quality, falls back to 8B if unavailable.
 */

import type { ProviderRequest } from '../cascade';

const CEREBRAS_API_URL = 'https://api.cerebras.ai/v1/chat/completions';
const MODELS = ['llama3.3-70b', 'llama3.1-8b'];

export async function generateWithCerebrasProvider(req: ProviderRequest): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('CEREBRAS_API_KEY not set');

  let lastErr: Error | null = null;

  for (const model of MODELS) {
    const abort = new AbortController();
    const abortTimer = setTimeout(() => abort.abort(), 30_000);

    try {
      let response: Response;
      try {
        response = await fetch(CEREBRAS_API_URL, {
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
            max_tokens: req.maxTokens,
            top_p: req.topP ?? 0.9,
          }),
          signal: abort.signal,
        });
      } finally {
        clearTimeout(abortTimer);
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 401) throw new Error(`Cerebras 401 Unauthorized: ${errorText}`);
        if (response.status === 404) {
          // Model not found — try the next model
          lastErr = new Error(`Cerebras 404 model not found (${model}): ${errorText}`);
          continue;
        }
        throw new Error(`Cerebras HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        error?: { message?: string } | string;
      };

      if (data.error) {
        const msg = typeof data.error === 'string' ? data.error : (data.error.message ?? 'unknown');
        throw new Error(`Cerebras API error: ${msg}`);
      }

      const text = data.choices?.[0]?.message?.content ?? '';
      const finishReason = data.choices?.[0]?.finish_reason ?? 'unknown';
      const completionTokens = data.usage?.completion_tokens ?? 0;
      if (finishReason === 'length' || completionTokens < 50) {
        console.warn(`[Cerebras] Short output: ${completionTokens} tokens, finish_reason=${finishReason}, text_len=${text.length}`);
      }
      return text.trim();

    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

      if (msg.includes('aborted') || msg.includes('timed out')) {
        throw new Error('Cerebras call timed out after 30s');
      }
      if (msg.includes('401') || msg.includes('unauthorized')) {
        throw err instanceof Error ? err : new Error(String(err));
      }
      if (msg.includes('404') || msg.includes('model not found')) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        continue; // try next model
      }

      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr ?? new Error('Cerebras: all models failed');
}
