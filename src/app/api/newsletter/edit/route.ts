/**
 * Newsletter Edit Mode API
 *
 * POST /api/newsletter/edit
 * Body actions:
 *   { action: 'save_section', season, week, sectionIndex, bot, text }
 *     → Commits manual text edit to the newsletter JSON in DB. Does NOT re-render HTML.
 *
 *   { action: 'ai_rewrite', season, week, sectionIndex, bot, instruction }
 *     → Calls Claude directly with the current section text + instruction.
 *       Returns { preview } — caller must call save_section to commit.
 *
 *   { action: 'finalize', season, week }
 *     → Re-renders full HTML from the updated JSON and updates the html field.
 *       After this, Publish becomes active.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';
import { eq, and } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { buildSystemPrompt } from '@/lib/newsletter/llm/groq';
import { renderHtml } from '@/lib/newsletter/template';
import type { Newsletter } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bot authoring map: 'bot1_text' is entertainer (Mason), 'bot2_text' is analyst (Westy)
const BOT_FIELD_MAP: Record<string, 'bot1_text' | 'bot2_text'> = {
  entertainer: 'bot1_text',
  analyst: 'bot2_text',
};

const BOT_TEMPERATURE: Record<string, number> = {
  entertainer: 0.85,
  analyst: 0.6,
};

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminCookieValue(cookieStore.get('evw_admin')?.value);
}

async function loadNewsletterRow(season: number, week: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.season, season), eq(newsletters.week, week)))
    .limit(1);
  return rows[0] ?? null;
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action as string;
  const season = Number(body.season);
  const week = Number(body.week);

  if (!action || !season || week === undefined) {
    return NextResponse.json({ error: 'Missing required fields: action, season, week' }, { status: 400 });
  }

  // ── save_section ────────────────────────────────────────────────────────────
  if (action === 'save_section') {
    const sectionIndex = Number(body.sectionIndex);
    const bot = String(body.bot ?? 'entertainer');
    const text = String(body.text ?? '');
    const botField = BOT_FIELD_MAP[bot] ?? 'bot1_text';

    const row = await loadNewsletterRow(season, week);
    if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

    const content = row.content as Newsletter;
    if (!Array.isArray(content?.sections) || sectionIndex < 0 || sectionIndex >= content.sections.length) {
      return NextResponse.json({ error: 'Invalid sectionIndex' }, { status: 400 });
    }

    const section = content.sections[sectionIndex] as Record<string, unknown>;
    const sectionData = (section.data ?? section) as Record<string, unknown>;
    sectionData[botField] = text;
    // Ensure mutation is visible on the parent object when data is a sub-object
    if ('data' in section) section.data = sectionData;

    const db = getDb();
    await db
      .update(newsletters)
      .set({ content: content as Parameters<typeof db.update>[0]['set']['content'] })
      .where(and(eq(newsletters.season, season), eq(newsletters.week, week)));

    console.log(`[Edit] save_section s${season}w${week} idx=${sectionIndex} bot=${bot}`);
    return NextResponse.json({ success: true });
  }

  // ── ai_rewrite ──────────────────────────────────────────────────────────────
  if (action === 'ai_rewrite') {
    const sectionIndex = Number(body.sectionIndex);
    const bot = String(body.bot ?? 'entertainer');
    const instruction = String(body.instruction ?? '').trim();
    const botField = BOT_FIELD_MAP[bot] ?? 'bot1_text';
    const temperature = BOT_TEMPERATURE[bot] ?? 0.85;

    if (!instruction) {
      return NextResponse.json({ error: 'instruction is required for ai_rewrite' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
    }

    const row = await loadNewsletterRow(season, week);
    if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

    const content = row.content as Newsletter;
    if (!Array.isArray(content?.sections) || sectionIndex < 0 || sectionIndex >= content.sections.length) {
      return NextResponse.json({ error: 'Invalid sectionIndex' }, { status: 400 });
    }

    const section = content.sections[sectionIndex] as Record<string, unknown>;
    const sectionData = (section.data ?? section) as Record<string, unknown>;
    const currentText = String(sectionData[botField] ?? '');

    // ai_rewrite always calls Claude directly — use tier 1 persona prompt
    const personaKey = bot === 'entertainer' ? 'entertainer' : 'analyst';
    const fullPersona = buildSystemPrompt(personaKey, 1);
    const editInstruction = `The user wants you to make the following edit to this section: ${instruction}\nOnly change what the instruction specifies. Do not add headers or alter the format.`;

    const client = new Anthropic({ apiKey, timeout: 60_000 });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      temperature,
      system: `${fullPersona}\n\n${editInstruction}`,
      messages: [
        {
          role: 'user',
          content: currentText,
        },
      ],
    });

    const preview = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    console.log(`[Edit] ai_rewrite s${season}w${week} idx=${sectionIndex} bot=${bot} — ${preview.length} chars`);
    return NextResponse.json({ success: true, preview });
  }

  // ── finalize ────────────────────────────────────────────────────────────────
  if (action === 'finalize') {
    const row = await loadNewsletterRow(season, week);
    if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

    const content = row.content as Newsletter;
    let html: string;
    try {
      html = renderHtml(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Edit] finalize renderHtml failed:', msg);
      return NextResponse.json({ error: `Render failed: ${msg}` }, { status: 500 });
    }

    const db = getDb();
    await db
      .update(newsletters)
      .set({ html })
      .where(and(eq(newsletters.season, season), eq(newsletters.week, week)));

    console.log(`[Edit] finalize s${season}w${week} — HTML re-rendered (${html.length} chars)`);
    return NextResponse.json({ success: true, html });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
