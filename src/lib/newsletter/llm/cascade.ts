/**
 * Cascade LLM Orchestrator
 * Tries providers in order: Gemini → Groq → Cerebras → OpenRouter
 * Falls through on rate-limit/quota errors; throws on auth errors.
 *
 * Provider cooldown: once a provider rate-limits it is skipped for 10 minutes
 * across ALL subsequent calls in this server session. This prevents wasting
 * time hammering an exhausted provider on every cascade call.
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
const MIN_GAP_MS = 120_000; // 2 min — well under every provider's RPM limit
let _callQueue: Promise<void> = Promise.resolve();

async function enforceMinGap(): Promise<void> {
  const mySlot = _callQueue.then(async () => {
    const since = Date.now() - _lastCallTime;
    if (_lastCallTime > 0 && since < MIN_GAP_MS) {
      const wait = MIN_GAP_MS - since;
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

const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
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

function setCooldown(name: string): void {
  providerCooldownUntil[name] = Date.now() + COOLDOWN_MS;
  console.log(`[LLM] ${name} rate-limited — skipping for ${COOLDOWN_MS / 60_000} min`);
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

const PROVIDERS: ProviderEntry[] = [
  { name: 'gemini',     fn: generateWithGeminiProvider,    envKey: 'GEMINI_API_KEY' },
  { name: 'groq',       fn: generateWithGroqProvider,      envKey: 'GROQ_API_KEY' },
  { name: 'cerebras',   fn: generateWithCerebrasProvider,  envKey: 'CEREBRAS_API_KEY' },
  { name: 'openrouter', fn: generateWithOpenRouterProvider, envKey: 'OPENROUTER_API_KEY' },
];

// ============ Main Cascade ============

export async function generateWithCascade(req: CascadeRequest): Promise<CascadeResponse> {
  await enforceMinGap();

  const activeProviders = PROVIDERS.filter(p => !!process.env[p.envKey]);

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
        setCooldown(name);
        continue; // immediately try next provider — no point retrying a rate-limited one
      }

      // Unknown error — log and try next provider
      console.warn(`[LLM] ${name} error (trying next): ${msg}`);
    }
  }

  throw new Error('All LLM providers exhausted or cooling down — try again later');
}
