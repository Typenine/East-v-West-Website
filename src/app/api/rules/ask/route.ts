/**
 * Ask Clancy — rulebook Q&A via Groq 8B → Cerebras 8B fallback.
 * Hard daily cap of 30 questions to stay within free tier limits.
 */

import { rulesHtmlSections } from '@/data/rules';
import { getKV } from '@/lib/server/kv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DAILY_LIMIT = 20; // 70B model uses ~8k tokens/request — tighter daily budget than 8B
const WARN_THRESHOLD = 4; // show warning when remaining <= this

const SECTION_ID_MAP: Record<number, string> = {
  1: 'league-overview',
  2: 'definitions-terms',
  3: 'governance-authority',
  4: 'season-calendar',
  5: 'rosters-lineups',
  6: 'free-agency-waivers',
  7: 'trades',
  8: 'draft',
  9: 'standings-playoffs',
  10: 'money-dues-prizes',
  11: 'competitive-integrity',
  12: 'enforcement-penalties',
  13: 'amendments-rule-changes',
  14: 'draft-trip',
  15: 'scoring',
};

// Build plain-text rulebook once at module load — stays in memory
const RULEBOOK_CONTEXT = rulesHtmlSections.map((s) => {
  const text = s.html
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return `## ${s.title}\n${text}`;
}).join('\n\n---\n\n');

const SYSTEM_PROMPT = `You are Clancy, the official rulebook assistant for the East v. West SuperFlex Dynasty Fantasy Football League. You are knowledgeable, precise, and speak plainly.

Your rules:
- Answer ONLY from the rulebook text below. Never use outside knowledge.
- Be concise — 2 to 4 sentences unless the question genuinely requires more.
- Always cite the specific section number (e.g. "per Section 5.3(b)").
- If the answer is not clearly in the rulebook, say exactly: "The rulebook doesn't explicitly address this."
- Do not speculate, give opinions, or recommend actions beyond what the rules state.
- End every response with a new line: "📖 Source: Section X" (use the most relevant section number).

RULEBOOK:
${RULEBOOK_CONTEXT}`;

// In-memory fallback counter (resets on server restart — KV is authoritative when available)
let _memCount = 0;
let _memDate = '';

function todayKey(): string {
  return `rules:ask:${new Date().toISOString().slice(0, 10)}`;
}

async function getRemaining(): Promise<number> {
  try {
    const kv = await getKV();
    if (kv) {
      const val = (await kv.get(todayKey())) as string | null;
      return Math.max(0, DAILY_LIMIT - parseInt(val || '0', 10));
    }
  } catch {}
  const today = new Date().toISOString().slice(0, 10);
  if (_memDate !== today) { _memCount = 0; _memDate = today; }
  return Math.max(0, DAILY_LIMIT - _memCount);
}

async function consume(): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const kv = await getKV();
    if (kv) {
      const key = todayKey();
      const used = parseInt((await kv.get(key) as string | null) || '0', 10);
      if (used >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
      const next = used + 1;
      await kv.set(key, String(next));
      if (kv.expire) await kv.expire(key, 90_000); // 25h TTL auto-cleanup
      return { allowed: true, remaining: DAILY_LIMIT - next };
    }
  } catch {}
  // In-memory fallback
  if (_memDate !== today) { _memCount = 0; _memDate = today; }
  if (_memCount >= DAILY_LIMIT) return { allowed: false, remaining: 0 };
  _memCount++;
  return { allowed: true, remaining: DAILY_LIMIT - _memCount };
}

async function callGroq(question: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
  if (data.error) throw new Error(`Groq error: ${JSON.stringify(data.error)}`);
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

async function callCerebras(question: string): Promise<string> {
  const apiKey = process.env.CEREBRAS_API_KEY;
  if (!apiKey) throw new Error('CEREBRAS_API_KEY not set');
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.3-70b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: question },
      ],
      temperature: 0.1,
      max_tokens: 400,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Cerebras ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }>; error?: unknown };
  if (data.error) throw new Error(`Cerebras error: ${JSON.stringify(data.error)}`);
  return (data.choices?.[0]?.message?.content ?? '').trim();
}

function extractSectionId(answer: string): string | null {
  const m = answer.match(/Section\s+(\d{1,2})/i);
  if (!m) return null;
  return SECTION_ID_MAP[parseInt(m[1])] ?? null;
}

// GET — return current remaining count (for UI to load on mount)
export async function GET() {
  const remaining = await getRemaining();
  return Response.json({ remaining, limit: DAILY_LIMIT, warn: remaining <= WARN_THRESHOLD });
}

// POST — answer a question
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({})) as { question?: string };
  const question = (typeof body.question === 'string' ? body.question : '').trim();

  if (!question || question.length < 3) {
    return Response.json({ error: 'Question is too short.' }, { status: 400 });
  }
  if (question.length > 500) {
    return Response.json({ error: 'Question too long (max 500 characters).' }, { status: 400 });
  }

  const { allowed, remaining } = await consume();

  if (!allowed) {
    return Response.json({
      error: "Clancy's hit the daily question limit. Check back tomorrow.",
      remaining: 0,
      limit: DAILY_LIMIT,
      limitReached: true,
    }, { status: 429 });
  }

  let answer = '';
  let provider = '';

  try {
    answer = await callGroq(question);
    provider = 'groq';
  } catch (e) {
    console.warn('[rules/ask] Groq failed, trying Cerebras:', e);
    try {
      answer = await callCerebras(question);
      provider = 'cerebras';
    } catch (e2) {
      console.error('[rules/ask] Both providers failed:', e2);
      return Response.json({ error: 'Clancy is temporarily unavailable. Try again in a moment.' }, { status: 503 });
    }
  }

  return Response.json({
    answer,
    sectionId: extractSectionId(answer),
    provider,
    remaining,
    limit: DAILY_LIMIT,
    warn: remaining <= WARN_THRESHOLD,
  });
}
