/**
 * Gemini 2.0 Flash Provider
 * Uses GEMINI_20_API_KEY. Independent RPD counter from the 2.5 Flash provider.
 * Acts as a high-quality fallback when 2.5 Flash exhausts its soft limit.
 */

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { ProviderRequest } from '../cascade';

// ============ Rate Limiting ============

// Gemini 2.0 Flash free tier: 15 RPM, 1000 RPD
// Cascade enforces 8s gap → 7.5 RPM effective, safely under the 15 RPM limit.
// RPD_SOFT_LIMIT: independent from the 2.5 Flash counter, so both keys get their own 1000 RPD.
const RPM_LIMIT = 12;
const RPD_SOFT_LIMIT = 800;

let _rpdCount = 0;
let _callsThisMinute = 0;
let _minuteStart = Date.now();
let _lastCallTime = 0;

export function resetGemini20RpdCount(): void {
  _rpdCount = 0;
}

function resetMinuteIfNeeded(): void {
  if (Date.now() - _minuteStart > 60_000) {
    _callsThisMinute = 0;
    _minuteStart = Date.now();
  }
}

async function waitForRateLimit(): Promise<void> {
  resetMinuteIfNeeded();

  if (_callsThisMinute >= RPM_LIMIT) {
    const wait = 61_000 - (Date.now() - _minuteStart);
    await sleep(Math.max(wait, 1000));
    resetMinuteIfNeeded();
  }

  const sinceLastCall = Date.now() - _lastCallTime;
  const minGap = 5_000;
  if (sinceLastCall < minGap) {
    await sleep(minGap - sinceLastCall);
  }
}

function recordCall(): void {
  _callsThisMinute++;
  _lastCallTime = Date.now();
  _rpdCount++;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ Safety Settings ============

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const CALL_TIMEOUT_MS = 90_000; // 90s — accommodates large mock-draft outputs (2500 tokens)

// ============ Main Export ============

export async function generateWithGemini20Provider(req: ProviderRequest): Promise<string> {
  const apiKey = process.env.GEMINI_20_API_KEY;
  if (!apiKey) throw new Error('GEMINI_20_API_KEY not set');

  if (_rpdCount > RPD_SOFT_LIMIT) {
    throw new Error('Gemini 2.0 Flash daily quota exhausted (RPD soft limit reached)');
  }

  await waitForRateLimit();

  const client = new GoogleGenerativeAI(apiKey);
  const model = client.getGenerativeModel({
    model: 'gemini-2.0-flash',
    safetySettings: SAFETY_SETTINGS,
    systemInstruction: req.systemPrompt,
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Gemini 2.0 call timed out after 40s')), CALL_TIMEOUT_MS)
  );

  const result = await Promise.race([
    model.generateContent({
      contents: [{ role: 'user', parts: [{ text: req.userPrompt }] }],
      generationConfig: {
        temperature: req.temperature,
        maxOutputTokens: req.maxTokens,
        topP: req.topP ?? 0.9,
      },
    }),
    timeoutPromise,
  ]);

  recordCall();
  return result.response.text().trim();
}
