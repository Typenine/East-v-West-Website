/**
 * LLM provider cascade with cooldowns, serialized calls, and fallback quality control.
 * Provider order: Anthropic → Gemini 2.5 → Gemini 2.0 → Groq → Cerebras → OpenRouter.
 */

import { generateWithGeminiProvider } from './providers/gemini-provider';
import { generateWithGemini20Provider } from './providers/gemini20-provider';
import { generateWithGroqProvider } from './providers/groq-provider';
import { generateWithCerebrasProvider } from './providers/cerebras-provider';
import { generateWithOpenRouterProvider } from './providers/openrouter-provider';
import { generateWithAnthropicProvider } from './providers/anthropic-provider';

export interface ProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
  topP?: number;
  thinkingBudget?: number;
  claudeThinkingBudget?: number;
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

export const cascadeMetrics: Record<string, number> = {};

export function resetCascadeMetrics(): void {
  for (const key of Object.keys(cascadeMetrics)) delete cascadeMetrics[key];
}

export function getCascadeMetricsSummary(): string {
  return Object.entries(cascadeMetrics).map(([key, value]) => `${key}:${value}`).join(' ');
}

type ProviderFn = (request: ProviderRequest) => Promise<string>;
type ProviderEntry = { name: string; fn: ProviderFn; envKey: string };

export const PROVIDER_ORDER: Array<{ name: string; envKey: string }> = [
  { name: 'anthropic', envKey: 'ANTHROPIC_API_KEY' },
  { name: 'gemini-2.5-flash', envKey: 'GEMINI_API_KEY' },
  { name: 'gemini-2.0-flash', envKey: 'GEMINI_20_API_KEY' },
  { name: 'groq', envKey: 'GROQ_API_KEY' },
  { name: 'cerebras', envKey: 'CEREBRAS_API_KEY' },
  { name: 'openrouter', envKey: 'OPENROUTER_API_KEY' },
];

const PROVIDERS: ProviderEntry[] = [
  { name: 'anthropic', fn: generateWithAnthropicProvider, envKey: 'ANTHROPIC_API_KEY' },
  { name: 'gemini-2.5-flash', fn: generateWithGeminiProvider, envKey: 'GEMINI_API_KEY' },
  { name: 'gemini-2.0-flash', fn: generateWithGemini20Provider, envKey: 'GEMINI_20_API_KEY' },
  { name: 'groq', fn: generateWithGroqProvider, envKey: 'GROQ_API_KEY' },
  { name: 'cerebras', fn: generateWithCerebrasProvider, envKey: 'CEREBRAS_API_KEY' },
  { name: 'openrouter', fn: generateWithOpenRouterProvider, envKey: 'OPENROUTER_API_KEY' },
];

const PROVIDER_MIN_GAP_MS: Record<string, number> = {
  anthropic: 500,
  'gemini-2.5-flash': 4_000,
  'gemini-2.0-flash': 4_000,
  groq: 16_000,
  cerebras: 8_000,
  openrouter: 4_000,
};

const COOLDOWN_MS = 2 * 60 * 1_000;
const DAILY_COOLDOWN_MS = 25 * 60 * 60 * 1_000;
const RATE_LIMIT_COOLDOWN_MS_BY_PROVIDER: Record<string, number> = { anthropic: 45_000 };
const providerCooldownUntil: Record<string, number> = {};
const lastCallAt: Record<string, number> = {};
let callQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enforceProviderGap(provider: string): Promise<void> {
  const slot = callQueue.then(async () => {
    const gap = PROVIDER_MIN_GAP_MS[provider] ?? 4_000;
    const elapsed = Date.now() - (lastCallAt[provider] ?? 0);
    if (lastCallAt[provider] && elapsed < gap) await sleep(gap - elapsed);
    lastCallAt[provider] = Date.now();
  });
  callQueue = slot.catch(() => undefined);
  await slot;
}

function isCooling(provider: string): boolean {
  const until = providerCooldownUntil[provider] ?? 0;
  if (!until) return false;
  if (Date.now() >= until) {
    delete providerCooldownUntil[provider];
    return false;
  }
  return true;
}

function setCooldown(provider: string, daily: boolean): void {
  const duration = daily
    ? DAILY_COOLDOWN_MS
    : (RATE_LIMIT_COOLDOWN_MS_BY_PROVIDER[provider] ?? COOLDOWN_MS);
  providerCooldownUntil[provider] = Date.now() + duration;
  console.log(`[LLM] ${provider} cooling for ${Math.round(duration / 1000)}s${daily ? ' (daily quota)' : ''}`);
}

export function clearAllCooldowns(): void {
  for (const key of Object.keys(providerCooldownUntil)) delete providerCooldownUntil[key];
}

function isDailyQuotaError(message: string): boolean {
  const value = message.toLowerCase();
  return value.includes('daily')
    || value.includes('per day')
    || value.includes('resource_exhausted')
    || value.includes('resource has been exhausted')
    || value.includes('rpd soft limit');
}

function isFallThroughError(message: string): boolean {
  const value = message.toLowerCase();
  return ['429', '413', '503', 'service unavailable', 'rate limit', 'quota', 'exhausted', 'too many', 'tokens per minute', 'requests per minute', 'daily limit']
    .some(token => value.includes(token));
}

function isHardError(message: string): boolean {
  const value = message.toLowerCase();
  return value.includes('401') || value.includes('unauthorized') || value.includes('invalid api key');
}

function minimumCharacters(sectionName: string | undefined): number {
  const name = sectionName ?? '';
  if (/Blurt|Hot Take|Award|Prediction Callback|Bold Player|Championship Pick/i.test(name)) return 25;
  if (/Trade Grade Retry|2-Team Trade Grade|3-Team Trade Grade/i.test(name)) return 70;
  if (/Social Summary/i.test(name)) return 80;
  if (/Recap|Waiver|Final Word|Spotlight|Intro/i.test(name)) return 90;
  if (/Trade|Power Rankings|Forecast|Season Preview|Draft Grade/i.test(name)) return 130;
  if (/Mock Draft/i.test(name)) return 220;
  return 45;
}

function outputQuality(content: string, request: CascadeRequest, fallback: boolean): { passed: boolean; reason?: string } {
  const text = content.trim();
  const sectionMinimum = minimumCharacters(request.sectionName);
  const minimum = fallback ? sectionMinimum : Math.min(sectionMinimum, 20);
  if (text.length < minimum) return { passed: false, reason: `too short (${text.length}/${minimum} chars)` };
  if (/^(?:sorry|i cannot|i can't|unable to|technical difficulties|newsletter generation error)/i.test(text)) {
    return { passed: false, reason: 'error/apology output' };
  }
  if (/\b(?:TBD|unknown team|unknown player|insert analysis|no data available)\b/i.test(text)) {
    return { passed: false, reason: 'placeholder output' };
  }

  const words = text.toLowerCase().match(/[a-z0-9']+/g) ?? [];
  if (fallback && words.length >= 30) {
    const uniqueRatio = new Set(words).size / words.length;
    if (uniqueRatio < 0.38) return { passed: false, reason: 'repetitive output' };
  }

  const genericHits = [
    'time will tell',
    'something to watch',
    'could be interesting',
    'monitor usage',
    'the story writes itself',
  ].filter(phrase => text.toLowerCase().includes(phrase)).length;
  if (fallback && genericHits >= 2) return { passed: false, reason: 'fallback output is generic' };

  if (request.validate && !request.validate(text)) return { passed: false, reason: 'section validator failed' };
  return { passed: true };
}

export async function generateWithCascade(request: CascadeRequest): Promise<CascadeResponse> {
  const active = PROVIDERS.filter(provider => Boolean(process.env[provider.envKey]));
  if (active.length === 0) throw new Error('No LLM providers configured — check API keys in the production environment');

  const primary = active[0].name;
  const lastFailure: Record<string, string> = {};

  const attemptPass = async (label: string): Promise<CascadeResponse | null> => {
    for (const provider of active) {
      if (isCooling(provider.name)) {
        lastFailure[provider.name] = `cooling ${Math.ceil((providerCooldownUntil[provider.name] - Date.now()) / 1000)}s`;
        continue;
      }

      await enforceProviderGap(provider.name);
      try {
        const content = await provider.fn(request);
        const fallback = provider.name !== primary;
        const quality = outputQuality(content, request, fallback);
        if (!quality.passed) {
          lastFailure[provider.name] = `quality gate: ${quality.reason ?? 'failed'}`;
          console.warn(`[LLM] ${provider.name} output rejected${label}: ${quality.reason}`);
          continue;
        }

        cascadeMetrics[provider.name] = (cascadeMetrics[provider.name] ?? 0) + 1;
        console.log(`[LLM] ${provider.name} ✓${fallback ? ' [fallback quality passed]' : ''}${label}`);
        return { content, provider: provider.name };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastFailure[provider.name] = message;
        if (isHardError(message)) {
          console.error(`[LLM] ${provider.name} hard authentication error: ${message}`);
          throw error;
        }
        if (isFallThroughError(message)) {
          setCooldown(provider.name, isDailyQuotaError(message));
          continue;
        }
        console.warn(`[LLM] ${provider.name} transient failure${label}: ${message}`);
      }
    }
    return null;
  };

  const first = await attemptPass('');
  if (first) return first;

  const soonestCooldown = active
    .map(provider => providerCooldownUntil[provider.name])
    .filter((until): until is number => Boolean(until) && until > Date.now() && until - Date.now() <= 45_000)
    .sort((a, b) => a - b)[0];

  if (soonestCooldown) {
    await sleep(Math.max(1, soonestCooldown - Date.now() + 500));
    const recovered = await attemptPass(' (after cooldown)');
    if (recovered) return recovered;
  } else if (active.some(provider => !isCooling(provider.name))) {
    await sleep(10_000);
    const retry = await attemptPass(' (final retry)');
    if (retry) return retry;
  }

  const detail = active.map(provider => `${provider.name}: ${lastFailure[provider.name] ?? 'unavailable'}`).join(' | ');
  throw new Error(`All LLM providers exhausted, failed validation, or produced low-quality output — ${detail}`);
}
