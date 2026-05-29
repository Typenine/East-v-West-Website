/**
 * LLM Provider Test Route — Admin only
 *
 * GET /api/newsletter/test-llm
 *   Returns: provider config, env var presence, and a short live call result.
 *
 * GET /api/newsletter/test-llm?provider=anthropic
 *   Forces the test call through Anthropic regardless of LLM_PROVIDER.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue, getConfiguredAdminSecret } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function isAdmin(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin');
  const secret = getConfiguredAdminSecret();
  if (!secret) return false;
  const headerSecret = req.headers.get('x-admin-secret');
  const urlSecret = new URL(req.url).searchParams.get('secret');
  return (
    isAdminCookieValue(adminCookie?.value) ||
    headerSecret === secret ||
    urlSecret === secret
  );
}

export async function GET(request: NextRequest) {
  if (!(await isAdmin(request))) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const forceProvider = searchParams.get('provider'); // e.g. ?provider=anthropic

  const config = {
    LLM_PROVIDER:       process.env.LLM_PROVIDER ?? '(not set — uses cascade order)',
    ANTHROPIC_MODEL:    process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6 (default)',
    LLM_MAX_RETRIES:    process.env.LLM_MAX_RETRIES ?? '2 (default)',
    LLM_TIMEOUT_MS:     process.env.LLM_TIMEOUT_MS ?? '120000 (default)',
    LLM_CONCURRENCY:    process.env.LLM_CONCURRENCY ?? '(not set — cascade is serial)',
    ANTHROPIC_API_KEY:  process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ MISSING',
    GEMINI_API_KEY:     process.env.GEMINI_API_KEY    ? '✓ set' : '✗ not set',
    GROQ_API_KEY:       process.env.GROQ_API_KEY      ? '✓ set' : '✗ not set',
  };

  // If ?provider=anthropic, run a direct Anthropic test (bypass cascade)
  if (forceProvider === 'anthropic') {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        status: 'error',
        error: 'ANTHROPIC_API_KEY is not set',
        config,
      }, { status: 400 });
    }

    const t0 = Date.now();
    try {
      const { generateWithAnthropicProvider } = await import('@/lib/newsletter/llm/providers/anthropic-provider');
      const text = await generateWithAnthropicProvider({
        systemPrompt: 'You are a helpful assistant. Respond in one sentence only.',
        userPrompt: 'Say "Claude is connected." and nothing else.',
        temperature: 0.1,
        maxTokens: 50,
        sectionName: 'test-llm',
      });
      return NextResponse.json({
        status: 'ok',
        provider: 'anthropic',
        model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
        response: text,
        durationMs: Date.now() - t0,
        config,
      });
    } catch (err) {
      return NextResponse.json({
        status: 'error',
        provider: 'anthropic',
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
        config,
      }, { status: 500 });
    }
  }

  // Default: run through the full cascade (respects LLM_PROVIDER env var)
  const t0 = Date.now();
  try {
    const { generateWithCascade } = await import('@/lib/newsletter/llm/cascade');
    const result = await generateWithCascade({
      systemPrompt: 'You are a helpful assistant. Respond in one sentence only.',
      userPrompt: 'Say "LLM cascade is connected." and nothing else.',
      temperature: 0.1,
      maxTokens: 50,
      sectionName: 'test-llm',
    });
    return NextResponse.json({
      status: 'ok',
      provider: result.provider,
      response: result.content,
      durationMs: Date.now() - t0,
      config,
    });
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - t0,
      config,
    }, { status: 500 });
  }
}
