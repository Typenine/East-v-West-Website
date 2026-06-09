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
import { buildSystemPrompt, type PersonaType } from '@/lib/newsletter/llm/groq';
import { renderHtml } from '@/lib/newsletter/template';
import type { Newsletter } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bot authoring map: 'bot1_text' is entertainer (Mason), 'bot2_text' is analyst (Westy)
const BOT_FIELD_MAP: Record<string, 'bot1_text' | 'bot2_text'> = {
  entertainer: 'bot1_text',
  analyst: 'bot2_text',
};


/**
 * Walk a dot-notation path on an object and set the leaf value.
 * Supports numeric segments for array indices, e.g. "picks.0.mason.analysis".
 * Creates intermediate objects/arrays as needed.
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === undefined || cur[p] === null) {
      cur[p] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Walk a dot-notation path and return the leaf value (or undefined).
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

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

    const fieldPath = typeof body.fieldPath === 'string' ? body.fieldPath : null;
    const section = content.sections[sectionIndex] as Record<string, unknown>;
    const sectionData = (section.data ?? section) as Record<string, unknown>;

    if (fieldPath) {
      // Deep path write — supports nested structures like Trades, MockDraft, MatchupRecaps
      setNestedValue(sectionData, fieldPath, text);
    } else {
      sectionData[botField] = text;
    }
    // Ensure mutation is visible on the parent object when data is a sub-object
    if ('data' in section) section.data = sectionData;

    const db = getDb();
    await db
      .update(newsletters)
      .set({ content: content as typeof newsletters.$inferInsert['content'] })
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

    const fieldPath = typeof body.fieldPath === 'string' ? body.fieldPath : null;
    const selectedText = typeof body.selectedText === 'string' && body.selectedText.trim() ? body.selectedText.trim() : null;
    const section = content.sections[sectionIndex] as Record<string, unknown>;
    const sectionData = (section.data ?? section) as Record<string, unknown>;
    // When selectedText is provided, rewrite only that snippet; otherwise rewrite the full field
    const currentText = selectedText ?? (fieldPath
      ? String(getNestedValue(sectionData, fieldPath) ?? '')
      : String(sectionData[botField] ?? ''));

    // ai_rewrite always calls Claude directly — use tier 1 (Claude-native XML) persona prompt
    const personaKey: PersonaType = bot === 'entertainer' ? 'entertainer' : 'analyst';
    const fullPersona = buildSystemPrompt(personaKey, 1);

    // Build a structured section context block.
    // This is the raw structured data (trade parties, scores, picks etc.) from the DB.
    // It is supplementary reference — the user's instruction is authoritative.
    const sectionContextBlock = body.sectionContext != null
      ? `\n\n<section_data_reference>\nThe following is the structured data stored for this section. Use it as supplementary reference ONLY. If the user's rewrite instruction contradicts this data, the instruction takes precedence — it is the authoritative correction.\n${JSON.stringify(body.sectionContext, null, 2).slice(0, 4000)}\n</section_data_reference>`
      : '';

    // System prompt: persona + editing rules + reference data
    const systemPrompt = `${fullPersona}${sectionContextBlock}

<edit_rules>
- You are rewriting a specific piece of newsletter text per an explicit editor instruction.
- The editor's instruction is GROUND TRUTH. If it corrects factual details (trade parties, who sent what, player names, scores), apply those corrections exactly — do not second-guess them using the section data.
- Preserve the bot's voice, tone, and sentence rhythm. The rewrite should feel like the same person wrote it.
- Do NOT add section headers, labels, or preambles. Output ONLY the rewritten text.
- Do NOT change content outside what the instruction specifies.
- Match the approximate length of the original unless the instruction asks for expansion or trimming.
</edit_rules>`;

    // User message: existing text + explicit instruction — clearly separated with XML
    const userMessage = selectedText
      ? `<existing_text>\n${currentText}\n</existing_text>\n\n<rewrite_instruction>\n${instruction}\n</rewrite_instruction>\n\nRewrite the text above following the instruction exactly. Output only the rewritten text.`
      : `<existing_text>\n${currentText}\n</existing_text>\n\n<rewrite_instruction>\n${instruction}\n</rewrite_instruction>\n\nRewrite the full text above following the instruction exactly. Preserve voice and length unless told otherwise. Output only the rewritten text.`;

    const client = new Anthropic({
      apiKey,
      timeout: 90_000,
      defaultHeaders: { 'anthropic-beta': 'interleaved-thinking-2025-05-14' },
    });
    const createParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: 'claude-sonnet-4-6',
      max_tokens: 3072,  // thinking budget (1024) + text output (2048)
      temperature: 1,    // required when thinking is enabled
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      // Light thinking budget — enough to reason through complex trade flows
      thinking: { type: 'enabled' as const, budget_tokens: 1024 },
    };
    const message: Anthropic.Message = await client.messages.create({ ...createParams, stream: false }) as unknown as Anthropic.Message;

    const preview = (message.content as Anthropic.ContentBlock[])
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    const inTokens  = message.usage.input_tokens;
    const outTokens = message.usage.output_tokens;
    console.log(`[Edit] ai_rewrite s${season}w${week} idx=${sectionIndex} bot=${bot} — ${preview.length} chars in=${inTokens} out=${outTokens}`);
    return NextResponse.json({ success: true, preview });
  }

  // ── finalize ────────────────────────────────────────────────────────────────
  if (action === 'finalize') {
    const row = await loadNewsletterRow(season, week);
    if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

    const content = row.content as Newsletter & { _publishHistory?: Array<{ at: string; htmlLength: number }> };
    let html: string;
    try {
      html = renderHtml(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Edit] finalize renderHtml failed:', msg);
      return NextResponse.json({ error: `Render failed: ${msg}` }, { status: 500 });
    }

    // Append a publish history entry (keep last 10)
    const history = content._publishHistory ?? [];
    history.push({ at: new Date().toISOString(), htmlLength: html.length });
    content._publishHistory = history.slice(-10);

    const db = getDb();
    await db
      .update(newsletters)
      .set({ html, content: content as typeof newsletters.$inferInsert['content'] })
      .where(and(eq(newsletters.season, season), eq(newsletters.week, week)));

    console.log(`[Edit] finalize s${season}w${week} — HTML re-rendered (${html.length} chars)`);
    return NextResponse.json({ success: true, html, publishHistory: content._publishHistory });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
