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
import { saveNewsletterSnapshot, listSnapshots, loadSnapshot } from '@/server/db/observability-queries';
import { renderHtml } from '@/lib/newsletter/template';
import { getValueAtPath, setValueAtPath } from '@/lib/newsletter/field-path';
import { getEditableFields, getTradeGradeFields } from '@/lib/newsletter/editable-fields';
import type { Newsletter } from '@/lib/newsletter/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Bot authoring map: 'bot1_text' is entertainer (Mason), 'bot2_text' is analyst (Westy)
const BOT_FIELD_MAP: Record<string, 'bot1_text' | 'bot2_text'> = {
  entertainer: 'bot1_text',
  analyst: 'bot2_text',
};

/**
 * Heal Trades sections damaged by the pre-fix dot-path bug: saving a field
 * whose team-name segment contained a dot ("Mt. Lebanon Cake Eaters") created
 * garbage nested keys ("Mt" → { " Lebanon Cake Eaters" → … }) inside the
 * analysis map, which made sectionTrades throw and the whole section render
 * as "[Section unavailable]". Drop analysis entries that don't look like real
 * per-team analysis objects.
 */
function sanitizeTradesSections(content: Newsletter): string[] {
  const removed: string[] = [];
  for (const section of content.sections ?? []) {
    if ((section as { type?: string }).type !== 'Trades') continue;
    const data = (section as { data?: unknown }).data;
    if (!Array.isArray(data)) continue;
    for (const trade of data as Array<Record<string, unknown>>) {
      const analysis = trade.analysis as Record<string, unknown> | undefined;
      if (!analysis || typeof analysis !== 'object') continue;
      for (const [key, value] of Object.entries(analysis)) {
        const v = value as Record<string, unknown> | null;
        const looksValid = v && typeof v === 'object' &&
          (typeof v.entertainer_paragraph === 'string' || typeof v.analyst_paragraph === 'string');
        if (!looksValid) {
          delete analysis[key];
          removed.push(key);
        }
      }
    }
  }
  return removed;
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

    // Capture before-state for the edit history entry
    const beforeText = fieldPath
      ? String(getValueAtPath(sectionData, fieldPath) ?? '')
      : String(sectionData[botField] ?? '');

    if (fieldPath) {
      // Deep path write — supports nested structures like Trades, MockDraft, MatchupRecaps
      setValueAtPath(sectionData, fieldPath, text);
    } else {
      sectionData[botField] = text;
    }
    // Ensure mutation is visible on the parent object when data is a sub-object
    if ('data' in section) section.data = sectionData;

    // ── Edit history: append a structured entry, keep last 50 ──
    const contentWithHistory = content as Newsletter & {
      _editHistory?: Array<{
        at: string; sectionIndex: number; sectionType: string; bot: string;
        fieldPath: string | null; editType: 'manual' | 'ai_rewrite_applied';
        beforeChars: number; afterChars: number;
      }>;
    };
    const history = contentWithHistory._editHistory ?? [];
    history.push({
      at: new Date().toISOString(),
      sectionIndex,
      sectionType: String((section as { type?: string }).type ?? 'unknown'),
      bot,
      fieldPath,
      // The UI applies AI rewrites through save_section — callers pass viaAiRewrite to distinguish
      editType: body.viaAiRewrite === true ? 'ai_rewrite_applied' : 'manual',
      beforeChars: beforeText.length,
      afterChars: text.length,
    });
    contentWithHistory._editHistory = history.slice(-50);

    const db = getDb();
    await db
      .update(newsletters)
      .set({ content: contentWithHistory as typeof newsletters.$inferInsert['content'] })
      .where(and(eq(newsletters.season, season), eq(newsletters.week, week)));

    console.log(`[Edit] save_section s${season}w${week} idx=${sectionIndex} bot=${bot}${body.viaAiRewrite ? ' (ai rewrite)' : ''}`);
    return NextResponse.json({ success: true });
  }

  // ── list_snapshots ─────────────────────────────────────────────────────────────────
  if (action === 'list_snapshots') {
    const snapshots = await listSnapshots(season, week);
    return NextResponse.json({ success: true, snapshots });
  }

  // ── restore_snapshot ───────────────────────────────────────────────────────────
  if (action === 'restore_snapshot') {
    const snapshotId = String(body.snapshotId ?? '');
    if (!snapshotId) return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });

    const snapshot = await loadSnapshot(snapshotId);
    if (!snapshot || snapshot.season !== season || snapshot.week !== week) {
      return NextResponse.json({ error: 'Snapshot not found for this newsletter' }, { status: 404 });
    }

    const row = await loadNewsletterRow(season, week);
    if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

    // Snapshot the CURRENT state first so a restore is itself reversible
    await saveNewsletterSnapshot({
      season, week,
      actionType: 'pre_restore',
      note: `Auto-snapshot before restoring ${snapshotId}`,
      content: row.content,
      html: row.html,
    });

    const db = getDb();
    await db
      .update(newsletters)
      .set({
        content: snapshot.content as typeof newsletters.$inferInsert['content'],
        ...(snapshot.html ? { html: snapshot.html } : {}),
      })
      .where(and(eq(newsletters.season, season), eq(newsletters.week, week)));

    console.log(`[Edit] restore_snapshot s${season}w${week} ← ${snapshotId}`);
    return NextResponse.json({ success: true, restoredFrom: snapshotId, message: 'Newsletter restored. Current state was snapshotted first.' });
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
      ? String(getValueAtPath(sectionData, fieldPath) ?? '')
      : String(sectionData[botField] ?? ''));
    const isEmptyField = !currentText.trim();

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

    // User message: existing text + explicit instruction — clearly separated with XML.
    // Empty fields get "write fresh" framing — asking to "rewrite" nothing makes the
    // model reply conversationally ("there's nothing here to rewrite") instead of writing.
    const userMessage = isEmptyField
      ? `<writing_instruction>\n${instruction}\n</writing_instruction>\n\nThis newsletter field is currently empty. Write the text from scratch following the instruction, in your persona's voice, using the section data reference for facts. Aim for a typical newsletter-segment length (2-4 sentences unless the instruction asks for more). Output only the new text.`
      : selectedText
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

    const content = row.content as Newsletter & { _publishHistory?: Array<{ at: string; htmlLength: number }>; _generationMeta?: { runId?: string } };

    // ── Rollback safety: snapshot the current content + HTML BEFORE re-rendering ──
    await saveNewsletterSnapshot({
      season, week,
      runId: content._generationMeta?.runId ?? null,
      actionType: 'finalize',
      note: typeof body.note === 'string' ? body.note : null,
      content: row.content,
      html: row.html,
    });

    // Heal any structure damage from the old dot-path bug before rendering
    const prunedKeys = sanitizeTradesSections(content);
    if (prunedKeys.length > 0) {
      console.warn(`[Edit] finalize pruned ${prunedKeys.length} malformed trade-analysis entr${prunedKeys.length === 1 ? 'y' : 'ies'}: ${prunedKeys.join(', ')}`);
    }

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

  // ── consistency_sweep ───────────────────────────────────────────────────────
  // Given a factual correction the editor made (e.g. "Brian Thomas was sent by
  // The Lone Ginger, not the Badgers"), scan EVERY editable field in the
  // newsletter for text that contradicts the corrected fact and propose minimal
  // rewrites — including revised trade letter grades when the correction
  // changes what a team actually gave or received. Returns proposals only;
  // the client applies accepted ones via save_section.
  if (action === 'consistency_sweep') {
    const note = String(body.note ?? '').trim();
    if (!note) {
      return NextResponse.json({ error: 'note is required — describe the factual correction' }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 });
    }

    const row = await loadNewsletterRow(season, week);
    if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
    const content = row.content as Newsletter;

    // Digest of every editable field (and trade grades) with stable addresses
    type DigestEntry = { sectionIndex: number; fieldPath: string; label: string; text: string };
    const digest: DigestEntry[] = [];
    (content.sections ?? []).forEach((sec, idx) => {
      const section = sec as { type: string; data?: unknown };
      for (const f of getEditableFields(section)) {
        const text = String(getValueAtPath(section.data, f.fieldPath) ?? '');
        if (text.trim()) {
          digest.push({ sectionIndex: idx, fieldPath: f.fieldPath, label: `${section.type} · ${f.label}`, text: text.slice(0, 2400) });
        }
      }
      for (const g of getTradeGradeFields(section)) {
        digest.push({ sectionIndex: idx, fieldPath: g.fieldPath, label: `${section.type} · ${g.label} (letter grade)`, text: g.current });
      }
    });

    if (digest.length === 0) {
      return NextResponse.json({ success: true, proposals: [] });
    }

    const fieldsBlock = digest
      .map((d, i) => `<field id="${i}" section="${d.sectionIndex}" path=${JSON.stringify(d.fieldPath)} label=${JSON.stringify(d.label)}>\n${d.text}\n</field>`)
      .join('\n\n');

    const sweepSystem = `You are the consistency editor for a fantasy-football newsletter written by two personas (Mason: loud entertainer; Westy: dry analyst).

The human editor corrected a fact. Your job: find every field whose text contradicts the corrected fact and propose a minimal rewrite that fixes ONLY the contradiction while preserving each persona's voice, tone, and length. Do not rewrite text that is already consistent with the correction. Do not improve style.

Letter-grade fields (label ends with "(letter grade)") hold a single grade like "B+". If the correction changes what a team actually gave up or received in a trade, propose an updated grade that follows from the writer's own logic in their paragraph; otherwise leave grades alone.

Output STRICT JSON only — an array (possibly empty) of objects:
[{"id": <field id number>, "newText": "<full replacement text>", "reason": "<one short sentence>"}]
No markdown fences, no commentary.`;

    const sweepUser = `<correction>\n${note}\n</correction>\n\n<newsletter_fields>\n${fieldsBlock}\n</newsletter_fields>\n\nReturn the JSON array of proposed fixes.`;

    const client = new Anthropic({ apiKey, timeout: 120_000 });
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      temperature: 1,
      system: sweepSystem,
      messages: [{ role: 'user', content: sweepUser }],
      thinking: { type: 'enabled', budget_tokens: 2048 },
    });

    const rawText = (message.content as Anthropic.ContentBlock[])
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    // Robust JSON extraction: take the outermost array
    let parsed: Array<{ id?: number; newText?: string; reason?: string }> = [];
    try {
      const start = rawText.indexOf('[');
      const end = rawText.lastIndexOf(']');
      if (start >= 0 && end > start) parsed = JSON.parse(rawText.slice(start, end + 1));
    } catch (parseErr) {
      console.error('[Edit] consistency_sweep JSON parse failed:', parseErr, rawText.slice(0, 400));
      return NextResponse.json({ error: 'Sweep response was not valid JSON — try again' }, { status: 502 });
    }

    const proposals = parsed
      .filter(p => typeof p.id === 'number' && p.id >= 0 && p.id < digest.length && typeof p.newText === 'string')
      .map(p => {
        const d = digest[p.id!];
        return {
          sectionIndex: d.sectionIndex,
          fieldPath: d.fieldPath,
          label: d.label,
          before: d.text,
          after: p.newText!,
          reason: p.reason ?? '',
        };
      })
      .filter(p => p.after.trim() && p.after.trim() !== p.before.trim());

    console.log(`[Edit] consistency_sweep s${season}w${week} — ${proposals.length} proposal(s) across ${digest.length} fields (in=${message.usage.input_tokens} out=${message.usage.output_tokens})`);
    return NextResponse.json({ success: true, proposals });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
