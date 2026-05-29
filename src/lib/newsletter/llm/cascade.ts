/**
 * Cascade LLM Orchestrator
 * Tries providers in order: Gemini 2.5 Flash → Gemini 2.0 Flash → Groq → Cerebras → OpenRouter
 * Falls through on rate-limit/quota errors; throws on auth errors.
 *
 * Provider cooldown: once a provider hits an RPM/TPM rate limit it is skipped
 * for 2 minutes; daily quota errors trigger a 25-hour cooldown. This prevents
 * wasting time hammering an exhausted provider on every cascade call.
 */

import { generateWithGeminiProvider }     from './providers/gemini-provider';
import { generateWithGemini20Provider }   from './providers/gemini20-provider';
import { generateWithGroqProvider }        from './providers/groq-provider';
import { generateWithCerebrasProvider }    from './providers/cerebras-provider';
import { generateWithOpenRouterProvider }  from './providers/openrouter-provider';
import { generateWithAnthropicProvider }   from './providers/anthropic-provider';

// ============ Shared Types ============

export interface ProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  /** Gemini-only: thinking token budget. 0 = disabled, undefined = let provider decide. */
  thinkingBudget?: number;
  /** Caller-supplied section label used in logs (e.g. "Mock Draft - Round 1"). */
  sectionName?: string;
}

export interface CascadeRequest extends ProviderRequest {
  validate?: (content: string) => boolean;
  cacheKey?: string;
}

export interface CascadeResponse {
  content: string;
  provider: string;
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

// ============ Serial call queue ============
// All LLM calls share one promise chain so they execute one at a time,
// regardless of how many concurrent Promise.all() calls exist in compose.ts.

let _lastCallTime = 0;
// Gap between calls: 8s for Gemini free tier (15 RPM limit); 2s for Claude paid tier.
// Reduced when LLM_PROVIDER=anthropic since Claude's rate limits are much more generous.
function getMinGapMs(): number {
  return process.env.LLM_PROVIDER === 'anthropic' ? 2_000 : 8_000;
}
let _callQueue: Promise<void> = Promise.resolve();

async function enforceMinGap(): Promise<void> {
  const minGap = getMinGapMs();
  const mySlot = _callQueue.then(async () => {
    const since = Date.now() - _lastCallTime;
    if (_lastCallTime > 0 && since < minGap) {
      const wait = minGap - since;
      console.log(`[LLM] Queue: waiting ${Math.round(wait / 1000)}s before next call...`);
      await sleep(wait);
    }
    _lastCallTime = Date.now();
  });
  _callQueue = mySlot.catch(() => {});
  await mySlot;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Provider-level cooldown ============
// When a provider rate-limits, mark it cooling down for COOLDOWN_MS.
// All subsequent cascade calls will skip it until the cooldown expires.

const COOLDOWN_MS = 2 * 60 * 1000;       // 2 min — enough for RPM/TPM window reset
const DAILY_COOLDOWN_MS = 25 * 60 * 60 * 1000; // 25 hours — daily quota exhaustion
const providerCooldownUntil: Record<string, number> = {};

function isProviderCoolingDown(name: string): boolean {
  const until = providerCooldownUntil[name];
  if (!until) return false;
  if (Date.now() >= until) {
    delete providerCooldownUntil[name];
    return false;
  }
  return true;
}

function setCooldown(name: string, daily = false): void {
  const ms = daily ? DAILY_COOLDOWN_MS : COOLDOWN_MS;
  providerCooldownUntil[name] = Date.now() + ms;
  console.log(`[LLM] ${name} rate-limited — skipping for ${Math.round(ms / 60_000)} min${daily ? ' (daily quota)' : ''}`);
}

function isDailyQuotaError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('daily') ||
    m.includes('resource_exhausted') ||
    m.includes('resource has been exhausted') ||
    m.includes('per day') ||
    m.includes('rpd soft limit')
  );
}

export function clearAllCooldowns(): void {
  for (const key of Object.keys(providerCooldownUntil)) {
    delete providerCooldownUntil[key];
  }
}

// ============ Error classification ============

function isFallThroughError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('429') ||
    m.includes('413') ||
    m.includes('503') ||
    m.includes('service unavailable') ||
    m.includes('rate limit') ||
    m.includes('quota') ||
    m.includes('exhausted') ||
    m.includes('too many') ||
    m.includes('tokens per minute') ||
    m.includes('requests per minute') ||
    m.includes('daily limit')
  );
}

function isHardError(msg: string): boolean {
  const m = msg.toLowerCase();
  return m.includes('401') || m.includes('unauthorized');
}

// ============ Provider Registry ============

type ProviderFn = (req: ProviderRequest) => Promise<string>;

interface ProviderEntry {
  name: string;
  fn: ProviderFn;
  envKey: string;
}

const BASE_PROVIDERS: ProviderEntry[] = [
  { name: 'gemini-2.5-flash', fn: generateWithGeminiProvider,    envKey: 'GEMINI_API_KEY' },
  { name: 'gemini-2.0-flash', fn: generateWithGemini20Provider,  envKey: 'GEMINI_20_API_KEY' },
  { name: 'groq',             fn: generateWithGroqProvider,       envKey: 'GROQ_API_KEY' },
  { name: 'cerebras',         fn: generateWithCerebrasProvider,   envKey: 'CEREBRAS_API_KEY' },
  { name: 'openrouter',       fn: generateWithOpenRouterProvider, envKey: 'OPENROUTER_API_KEY' },
];

const ANTHROPIC_ENTRY: ProviderEntry = {
  name: 'anthropic',
  fn: generateWithAnthropicProvider,
  envKey: 'ANTHROPIC_API_KEY',
};

/**
 * Build the ordered provider list for this call.
 * - LLM_PROVIDER=anthropic → Claude first, existing cascade as fallback
 * - LLM_PROVIDER unset/other → existing cascade first, Claude as final fallback
 */
function buildProviderList(): ProviderEntry[] {
  if (process.env.LLM_PROVIDER === 'anthropic') {
    return [ANTHROPIC_ENTRY, ...BASE_PROVIDERS];
  }
  return [...BASE_PROVIDERS, ANTHROPIC_ENTRY];
}

// ============ Main Cascade ============

export async function generateWithCascade(req: CascadeRequest): Promise<CascadeResponse> {
  await enforceMinGap();

  const activeProviders = buildProviderList().filter(p => !!process.env[p.envKey]);

  if (activeProviders.length === 0) {
    throw new Error('No LLM providers configured — check API keys in .env.local');
  }

  for (const { name, fn } of activeProviders) {
    // Skip providers that are cooling down from a recent rate limit
    if (isProviderCoolingDown(name)) {
      const remainingMin = Math.ceil((providerCooldownUntil[name] - Date.now()) / 60_000);
      console.log(`[LLM] ${name} cooling down (${remainingMin}min left), skipping`);
      continue;
    }

    try {
      const content = await fn(req);

      if (req.validate && !req.validate(content)) {
        console.warn(`[LLM] ${name} failed validation, trying next provider`);
        continue;
      }

      cascadeMetrics[name] = (cascadeMetrics[name] ?? 0) + 1;
      console.log(`[LLM] ${name} ✓`);
      return { content, provider: name };

    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const msg = error.message;

      if (isHardError(msg)) {
        console.error(`[LLM] ${name} hard error (not retrying): ${msg}`);
        throw error;
      }

      if (isFallThroughError(msg)) {
        console.warn(`[LLM] ${name} rate-limited/quota: ${error.message}`);
        setCooldown(name, isDailyQuotaError(msg));
        continue; // immediately try next provider — no point retrying a rate-limited one
      }

      // Unknown error — log full message and try next provider
      console.warn(`[LLM] ${name} unknown error (trying next): ${error.message}`);
    }
  }

  // All providers skipped (all cooling). If any has a short-term cooldown (≤3 min),
  // wait for the earliest one and retry — this recovers from RPM/TPM limits automatically.
  const shortTermExpiry = activeProviders
    .filter(p => {
      const until = providerCooldownUntil[p.name];
      return until && (until - Date.now()) <= 3 * 60_000;
    })
    .map(p => providerCooldownUntil[p.name])
    .sort((a, b) => a - b)[0];

  if (shortTermExpiry) {
    const waitMs = Math.max(shortTermExpiry - Date.now() + 500, 1);
    console.log(`[LLM] All providers cooling — waiting ${Math.round(waitMs / 1000)}s for earliest recovery`);
    await sleep(waitMs);

    // One retry pass after waiting
    for (const { name, fn } of activeProviders) {
      if (isProviderCoolingDown(name)) continue;
      try {
        const content = await fn(req);
        if (req.validate && !req.validate(content)) {
          console.warn(`[LLM] ${name} failed validation after wait, trying next`);
          continue;
        }
        cascadeMetrics[name] = (cascadeMetrics[name] ?? 0) + 1;
        console.log(`[LLM] ${name} ✓ (after cooldown wait)`);
        return { content, provider: name };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (isHardError(error.message)) throw error;
        if (isFallThroughError(error.message)) {
          setCooldown(name, isDailyQuotaError(error.message));
          continue;
        }
        console.warn(`[LLM] ${name} unknown error after wait: ${error.message}`);
      }
    }
  }

  throw new Error('All LLM providers exhausted or cooling down — try again later');
}
