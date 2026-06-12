/**
 * Cascade LLM Orchestrator
 * Provider order: Anthropic Claude (primary) → Gemini 2.5 Flash → Gemini 2.0 Flash → Groq → Cerebras → OpenRouter
 * Falls through on rate-limit/quota errors; throws on auth errors.
 *
 * Provider cooldown: once a provider hits an RPM/TPM rate limit it is skipped
 * for 2 minutes; daily quota errors trigger a 25-hour cooldown. This prevents
 * wasting time hammering an exhausted provider on every cascade call.
 *
 * Per-provider min-gap: each provider has its own inter-call gap tuned to its tier.
 * Claude values below are reasonable defaults — confirm against your actual API tier.
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
  /**
   * Claude extended-thinking token budget (budget_tokens).
   * Requires claude-3-7-sonnet or newer and the interleaved-thinking beta.
   * 0 or undefined = disabled. 1024–16000 recommended for most sections.
   * Deep analysis (MockDraft, Trades, PowerRankings) can go up to 10000.
   */
  claudeThinkingBudget?: number;
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

// ============ Per-provider rate limit config ============
// Tune these independently per provider/tier.
// NOTE: Claude values below are reasonable starting defaults for a paid Sonnet tier.
// Confirm against your actual Anthropic account limits at:
//   https://console.anthropic.com/settings/limits
// Gemini values are tuned for the free-tier (15 RPM / ~1M TPM).
// Groq/Cerebras/OpenRouter values are conservative free-tier defaults.

interface ProviderRateConfig {
  /** Minimum ms between consecutive calls to this provider. */
  minGapMs: number;
}

const PROVIDER_RATE_CONFIG: Record<string, ProviderRateConfig> = {
  // Claude paid tier — Sonnet supports 50 RPM / 40K TPM on the base paid tier.
  // 500ms gap = up to 120 RPM theoretical; in practice sections are queued serially
  // so we'll never hit that ceiling during a normal newsletter run.
  'anthropic':       { minGapMs: 500 },

  // Gemini free tier — 15 RPM → one call every 4s to leave headroom.
  'gemini-2.5-flash': { minGapMs: 4_000 },
  'gemini-2.0-flash': { minGapMs: 4_000 },

  // Groq/Llama free tier — conservative to avoid 429s.
  'groq':            { minGapMs: 16_000 },

  // Cerebras and OpenRouter — conservative defaults; tune per your tier.
  'cerebras':        { minGapMs: 8_000 },
  'openrouter':      { minGapMs: 4_000 },
};

const DEFAULT_MIN_GAP_MS = 4_000;

function getProviderMinGapMs(providerName: string): number {
  return PROVIDER_RATE_CONFIG[providerName]?.minGapMs ?? DEFAULT_MIN_GAP_MS;
}

// ============ Serial call queue ============
// All LLM calls share one promise chain so they execute one at a time,
// regardless of how many concurrent Promise.all() calls exist in compose.ts.
// The gap used is based on whichever provider is actually called next.

let _lastCallTime = 0;
let _callQueue: Promise<void> = Promise.resolve();

function enforceMinGapForProvider(providerName: string): Promise<void> {
  const minGap = getProviderMinGapMs(providerName);
  const mySlot = _callQueue.then(async () => {
    const since = Date.now() - _lastCallTime;
    if (_lastCallTime > 0 && since < minGap) {
      const wait = minGap - since;
      console.log(`[LLM] Queue (${providerName}): waiting ${Math.round(wait / 1000)}s before next call...`);
      await sleep(wait);
    }
    _lastCallTime = Date.now();
  });
  _callQueue = mySlot.catch(() => {});
  return mySlot;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Provider-level cooldown ============
// When a provider rate-limits, mark it cooling down for COOLDOWN_MS.
// All subsequent cascade calls will skip it until the cooldown expires.

const COOLDOWN_MS = 2 * 60 * 1000;       // 2 min — enough for RPM/TPM window reset
const DAILY_COOLDOWN_MS = 25 * 60 * 60 * 1000; // 25 hours — daily quota exhaustion
// Anthropic rate limits are rolling per-minute windows (RPM/ITPM/OTPM) — by the
// time the provider has burned its in-call backoff and thrown, the window is
// nearly reset. A short cooldown keeps Claude inside the end-of-cascade
// recovery wait (45s) so the step retries it instead of failing outright.
const RATE_LIMIT_COOLDOWN_MS_BY_PROVIDER: Record<string, number> = {
  'anthropic': 45 * 1000,
};
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
  const ms = daily ? DAILY_COOLDOWN_MS : (RATE_LIMIT_COOLDOWN_MS_BY_PROVIDER[name] ?? COOLDOWN_MS);
  providerCooldownUntil[name] = Date.now() + ms;
  console.log(`[LLM] ${name} rate-limited — skipping for ${Math.round(ms / 1000)}s${daily ? ' (daily quota)' : ''}`);
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

/**
 * Canonical provider order shared with groq.ts for tier selection.
 * Export only name+envKey — groq.ts does not need the provider fn.
 */
export const PROVIDER_ORDER: Array<{ name: string; envKey: string }> = [
  { name: 'anthropic',        envKey: 'ANTHROPIC_API_KEY' },
  { name: 'gemini-2.5-flash', envKey: 'GEMINI_API_KEY' },
  { name: 'gemini-2.0-flash', envKey: 'GEMINI_20_API_KEY' },
  { name: 'groq',             envKey: 'GROQ_API_KEY' },
  { name: 'cerebras',         envKey: 'CEREBRAS_API_KEY' },
  { name: 'openrouter',       envKey: 'OPENROUTER_API_KEY' },
];

/**
 * Ordered cascade: Claude primary → Gemini 2.5 → Gemini 2.0 → Groq → Cerebras → OpenRouter.
 * Claude is always first. The LLM_PROVIDER env var is no longer used to switch order.
 */
const ORDERED_PROVIDERS: ProviderEntry[] = [
  { name: 'anthropic',        fn: generateWithAnthropicProvider,  envKey: 'ANTHROPIC_API_KEY' },
  { name: 'gemini-2.5-flash', fn: generateWithGeminiProvider,     envKey: 'GEMINI_API_KEY' },
  { name: 'gemini-2.0-flash', fn: generateWithGemini20Provider,   envKey: 'GEMINI_20_API_KEY' },
  { name: 'groq',             fn: generateWithGroqProvider,        envKey: 'GROQ_API_KEY' },
  { name: 'cerebras',         fn: generateWithCerebrasProvider,    envKey: 'CEREBRAS_API_KEY' },
  { name: 'openrouter',       fn: generateWithOpenRouterProvider,  envKey: 'OPENROUTER_API_KEY' },
];

function buildProviderList(): ProviderEntry[] {
  return ORDERED_PROVIDERS;
}

// ============ Main Cascade ============

export async function generateWithCascade(req: CascadeRequest): Promise<CascadeResponse> {
  const activeProviders = buildProviderList().filter(p => !!process.env[p.envKey]);

  if (activeProviders.length === 0) {
    throw new Error('No LLM providers configured — check API keys in .env.local');
  }

  // Last failure per provider in THIS cascade call — surfaced in the final
  // error so "exhausted" failures say what actually went wrong per provider.
  const lastFailure: Record<string, string> = {};

  /** One pass over the given providers. Returns a response or null if all failed. */
  const tryProvidersOnce = async (label: string): Promise<CascadeResponse | null> => {
    for (const { name, fn } of activeProviders) {
      // Skip providers that are cooling down from a recent rate limit
      if (isProviderCoolingDown(name)) {
        const remainingSec = Math.ceil((providerCooldownUntil[name] - Date.now()) / 1000);
        console.log(`[LLM] ${name} cooling down (${remainingSec}s left), skipping`);
        continue;
      }

      await enforceMinGapForProvider(name);

      try {
        const content = await fn(req);

        if (req.validate && !req.validate(content)) {
          console.warn(`[LLM] ${name} failed validation${label}, trying next provider`);
          lastFailure[name] = 'output failed validation';
          continue;
        }

        cascadeMetrics[name] = (cascadeMetrics[name] ?? 0) + 1;
        const thinkingNote = (name === 'anthropic' && req.claudeThinkingBudget && req.claudeThinkingBudget >= 1024)
          ? ` [thinking=${req.claudeThinkingBudget}]` : '';
        console.log(`[LLM] ${name} ✓${thinkingNote}${label}`);
        return { content, provider: name };

      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const msg = error.message;
        lastFailure[name] = msg;

        if (isHardError(msg)) {
          console.error(`[LLM] ${name} hard error (not retrying): ${msg}`);
          throw error;
        }

        if (isFallThroughError(msg)) {
          console.warn(`[LLM] ${name} rate-limited/quota${label}: ${msg}`);
          setCooldown(name, isDailyQuotaError(msg));
          continue; // immediately try next provider — no point retrying a rate-limited one
        }

        // Unknown error (timeout, 5xx, network) — log and try next provider
        console.warn(`[LLM] ${name} unknown error (trying next)${label}: ${msg}`);
      }
    }
    return null;
  };

  const firstPass = await tryProvidersOnce('');
  if (firstPass) return firstPass;

  // All providers failed or are cooling. If any cooldown expires soon, wait for
  // the earliest one and retry — this recovers from RPM/TPM limits automatically.
  // The wait is capped at 45s: generate-step runs under a 270s function limit,
  // and a longer sleep here (it used to allow up to 3 min) can 504 the whole
  // step. Past the cap we throw instead — the step fails as a controlled,
  // retryable 'step_failed' response rather than a gateway timeout.
  const shortTermExpiry = activeProviders
    .filter(p => {
      const until = providerCooldownUntil[p.name];
      return until && (until - Date.now()) <= 45_000;
    })
    .map(p => providerCooldownUntil[p.name])
    .sort((a, b) => a - b)[0];

  if (shortTermExpiry) {
    const waitMs = Math.max(shortTermExpiry - Date.now() + 500, 1);
    console.log(`[LLM] All providers cooling — waiting ${Math.round(waitMs / 1000)}s for earliest recovery`);
    await sleep(waitMs);
    const retryPass = await tryProvidersOnce(' (after cooldown wait)');
    if (retryPass) return retryPass;
  } else if (activeProviders.some(p => !isProviderCoolingDown(p.name))) {
    // No cooldown about to expire, but at least one provider failed with a
    // transient non-rate-limit error (timeout, 529, network blip) and is NOT
    // locked out. Give those one final attempt after a short pause instead of
    // failing the step on a single hiccup.
    console.log('[LLM] No provider cooling — retrying non-rate-limited providers once after 10s');
    await sleep(10_000);
    const lastResort = await tryProvidersOnce(' (final retry)');
    if (lastResort) return lastResort;
  }

  const detail = activeProviders.map(p => {
    const until = providerCooldownUntil[p.name];
    const cooling = until && until > Date.now() ? ` [cooling ${Math.ceil((until - Date.now()) / 1000)}s]` : '';
    const why = lastFailure[p.name] ? `: ${lastFailure[p.name].slice(0, 160)}` : '';
    return `${p.name}${cooling}${why}`;
  }).join(' | ');
  throw new Error(`All LLM providers exhausted or cooling down — ${detail}`);
}
