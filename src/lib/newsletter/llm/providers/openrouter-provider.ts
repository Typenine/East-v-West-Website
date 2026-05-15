/**
 * OpenRouter Provider
 * OpenAI-compatible endpoint that routes to free open-source models.
 */

import type { ProviderRequest } from '../cascade';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
// Models tried in order — mix of free and small paid to maximise availability
const MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemini-2.0-flash-exp:free',
  'qwen/qwen-2.5-7b-instruct:free',
];

export async function generateWithOpenRouterProvider(req: ProviderRequest): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const modelsToTry = MODELS;

  for (const model of modelsToTry) {
    const abort = new AbortController();
    const abortTimer = setTimeout(() => abort.abort(), 45_000);

    try {
      let response: Response;
      try {
        response = await fetch(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://east-v-west.football',
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
        if (response.status === 401) throw new Error(`OpenRouter 401 Unauthorized: ${errorText}`);
        if (response.status === 404) {
          continue; // try next model in the list
        }
        throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string } | string;
      };

      if (data.error) {
        const msg = typeof data.error === 'string' ? data.error : (data.error.message ?? 'unknown');
        throw new Error(`OpenRouter API error: ${msg}`);
      }

      const text = data.choices?.[0]?.message?.content ?? '';
      return text.trim();

    } catch (err) {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();

      if (msg.includes('aborted') || msg.includes('timed out')) {
        throw new Error('OpenRouter call timed out after 45s');
      }

      if (msg.includes('401') || msg.includes('unauthorized')) throw err as Error;
      if (msg.includes('404') || msg.includes('model not found') || msg.includes('no endpoints')) {
        continue; // try next model
      }

      // Rate-limit / quota — re-throw for cascade
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

      continue; // unknown error — try next model
    }
  }

  throw new Error('OpenRouter: all models failed');
}
