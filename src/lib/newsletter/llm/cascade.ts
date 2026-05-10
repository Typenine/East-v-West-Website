/**
 * Cascade LLM Orchestrator
 * Tries providers in order: Gemini → Groq → Cerebras → OpenRouter
 * Falls through on rate-limit/quota errors; throws on auth/timeout/model errors.
 */

import { generateWithGeminiProvider }     from './providers/gemini-provider';
import { generateWithGroqProvider }        from './providers/groq-provider';
import { generateWithCerebrasProvider }    from './providers/cerebras-provider';
import { generateWithOpenRouterProvider }  from './providers/openrouter-provider';

// ============ Shared Types ============

export interface ProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
}

export interface CascadeRequest extends ProviderRequest {
  validate?: (content: string) => boolean;
  cacheKey?: string; // reserved for future Gemini context caching
}

export interface CascadeResponse {
  content: string;
  provider: string; // 'gemini' | 'groq' | 'cerebras' | 'openrouter'
}

// ============ Session Metrics ============

export const cascadeMetrics: Record<string, number> = {};

export function resetCascadeMetrics(): void {
  for (const key of Object.keys(cascadeMetrics)) {
    delete cascadeMetrics[key];
  }
}

export function getCascadeMetricsSummary(): string {
  return Object.entries(cascadeMetrics)
    .map(([k, v]) => `${k}:${v}`)
    .join(' ');
}

// ============ Minimum inter-call gap (serial queue) ============
// All LLM calls share a single promise chain so they execute one at a time,
// regardless of how many concurrent Promise.all() calls exist in compose.ts.
// Without this, parallel sections race through the gap check simultaneously.

let _lastCallTime = 0;
const MIN_GAP_MS = 120_000; // 2 minutes — well under Gemini's 15 RPM and Groq's 30 RPM

// The tail of the queue — each new caller chains off this
let _callQueue: Promise<void> = Promise.resolve();

async function enforceMinGap(): Promise<void> {
  // Grab a slot at the END of the current queue before any await
  const mySlot = _callQueue.then(async () => {
    const since = Date.now() - _lastCallTime;
    if (_lastCallTime > 0 && since < MIN_GAP_MS) {
      const wait = MIN_GAP_MS - since;
      console.log(`[LLM] Queue: waiting ${Math.round(wait / 1000)}s before next call...`);
      await sleep(wait);
    }
    _lastCallTime = Date.now();
  });
  // Extend the queue so the next caller waits for this slot
  _callQueue = mySlot.catch(() => {});
  await mySlot;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Fall-through detection ============

function isFallThroughError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('429') ||
    m.includes('413') ||
    m.includes('rate limit') ||
    m.includes('quota') ||
    m.includes('exhausted') ||
    m.includes('too many') ||
    m.includes('tokens per minute') ||
    m.includes('requests per minute')
  );
}

function isHardError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('401') ||
    m.includes('unauthorized')
  );
}

// ============ Provider Registry ============

type ProviderFn = (req: ProviderRequest) => Promise<string>;

interface ProviderEntry {
  name: string;
  fn: ProviderFn;
  envKey: string;
}

const PROVIDERS: ProviderEntry[] = [
  { name: 'gemini',      fn: generateWithGeminiProvider,    envKey: 'GEMINI_API_KEY' },
  { name: 'groq',        fn: generateWithGroqProvider,      envKey: 'GROQ_API_KEY' },
  { name: 'cerebras',    fn: generateWithCerebrasProvider,  envKey: 'CEREBRAS_API_KEY' },
  { name: 'openrouter',  fn: generateWithOpenRouterProvider, envKey: 'OPENROUTER_API_KEY' },
];

const MAX_RETRIES = 2;
const BACKOFF_DELAYS = [5_000, 10_000];

// ============ Main Cascade ============

export async function generateWithCascade(req: CascadeRequest): Promise<CascadeResponse> {
  await enforceMinGap();

  const activeProviders = PROVIDERS.filter(p => !!process.env[p.envKey]);

  if (activeProviders.length === 0) {
    throw new Error('All LLM providers exhausted — check API keys and rate limits');
  }

  for (let pi = 0; pi < activeProviders.length; pi++) {
    const { name, fn } = activeProviders[pi];
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BACKOFF_DELAYS[attempt - 1] ?? 10_000;
        console.log(`[LLM] ${name} rate-limited (attempt ${attempt}/${MAX_RETRIES - 1}), retrying in ${delay / 1000}s...`);
        await sleep(delay);
      }

      try {
        const content = await fn(req);

        // Validate if requested
        if (req.validate && !req.validate(content)) {
          console.warn(`[LLM] ${name} validation failed, retrying...`);
          lastErr = new Error('Validation failed');
          continue;
        }

        // Success — record metrics
        cascadeMetrics[name] = (cascadeMetrics[name] ?? 0) + 1;
        return { content, provider: name };

      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        const msg = lastErr.message;

        if (isHardError(msg)) {
          // Hard errors are not retried and do not fall through — they propagate immediately
          console.error(`[LLM] ${name} hard error: ${msg}`);
          throw lastErr;
        }

        if (isFallThroughError(msg)) {
          // Rate-limit — retry with backoff, then fall through
          if (attempt < MAX_RETRIES - 1) {
            // Will retry in next iteration of this loop
            continue;
          }
          // Exhausted retries for this provider
          break;
        }

        // Unknown error — fall through to next provider immediately
        console.warn(`[LLM] ${name} unknown error (falling through): ${msg}`);
        break;
      }
    }

    // This provider exhausted — log and try the next one
    const nextProvider = activeProviders[pi + 1];
    if (nextProvider) {
      console.log(`[LLM] ${name} exhausted → trying ${nextProvider.name}`);
    }
  }

  throw new Error('All LLM providers exhausted — check API keys and rate limits');
}
