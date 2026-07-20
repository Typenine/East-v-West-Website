import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { TEAM_NAMES } from '@/lib/constants/league';
import { buildSystemPrompt, type PersonaType } from '@/lib/newsletter/llm/groq';
import { generateWithCascade } from '@/lib/newsletter/llm/cascade';
import { buildCoverageReport, extractText } from '@/lib/newsletter/coverage-report';
import { getEditableFields } from '@/lib/newsletter/editable-fields';
import { getValueAtPath, setValueAtPath } from '@/lib/newsletter/field-path';
import { renderHtml } from '@/lib/newsletter/template';
import type { Newsletter } from '@/lib/newsletter/types';
import { getDb } from '@/server/db/client';
import { newsletters } from '@/server/db/schema';
import {
  getLatestRunForWeek,
  getRunWithSections,
  listSnapshots,
  loadSnapshot,
  saveNewsletterSnapshot,
} from '@/server/db/observability-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type EditorReviewStatus = 'open' | 'verified' | 'dismissed';

type EditorContent = Newsletter & {
  _generationMeta?: { runId?: string };
  _editHistory?: Array<{
    at: string;
    sectionIndex: number;
    sectionType: string;
    fieldPath: string;
    label?: string;
    editType: 'manual' | 'ai_rewrite_applied' | 'consistency_fix';
    before: unknown;
    after: unknown;
  }>;
  _editorReview?: {
    audit?: Record<string, { status: EditorReviewStatus; note?: string; at: string }>;
  };
};

type NewsletterRow = typeof newsletters.$inferSelect;

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminCookieValue(cookieStore.get('evw_admin')?.value);
}

async function loadExactNewsletter(id: string): Promise<NewsletterRow | null> {
  const db = getDb();
  const rows = await db.select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
  return rows[0] ?? null;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function cloneContent(content: unknown): EditorContent {
  return JSON.parse(JSON.stringify(content)) as EditorContent;
}

function generationRunId(content: EditorContent): string | null {
  return content._generationMeta?.runId ?? null;
}

function snapshotMatchesNewsletter(
  snapshot: { runId: string | null; note: string | null },
  newsletterId: string,
  runId: string | null,
): boolean {
  if (runId && snapshot.runId === runId) return true;
  return Boolean(snapshot.note?.startsWith(`newsletter:${newsletterId}:`));
}

function serializeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return JSON.stringify(value);
}

function buildNewsletterDigest(content: EditorContent): string {
  return (content.sections ?? [])
    .map((section, index) => {
      const text = extractText(section.data).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
      return `SECTION ${index}: ${section.type}\n${text}`;
    })
    .join('\n\n')
    .slice(0, 14_000);
}

async function editorPayload(row: NewsletterRow) {
  const content = row.content as EditorContent;
  const runId = generationRunId(content);
  const runBundle = runId
    ? await getRunWithSections(runId)
    : { run: await getLatestRunForWeek(row.season, row.week), sections: [] };
  const allSnapshots = await listSnapshots(row.season, row.week);
  const versions = allSnapshots.filter(snapshot => snapshotMatchesNewsletter(snapshot, row.id, runId));
  const coverage = buildCoverageReport(content.sections ?? [], TEAM_NAMES);

  return {
    success: true,
    newsletter: {
      id: row.id,
      season: row.season,
      week: row.week,
      title: row.title,
      leagueName: row.leagueName,
      episodeType: row.episodeType,
      status: row.status,
      generatedAt: iso(row.generatedAt),
      publishedAt: iso(row.publishedAt),
      discordPostedAt: iso(row.discordPostedAt),
      updatedAt: iso(row.updatedAt),
      meta: content.meta,
      sections: content.sections ?? [],
      editorReview: content._editorReview ?? {},
    },
    html: row.html,
    run: runBundle.run,
    runSections: runBundle.sections,
    factAudit: runBundle.run?.factAudit ?? null,
    coverage,
    versions,
  };
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Newsletter id is required' }, { status: 400 });
  const row = await loadExactNewsletter(id);
  if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
  return NextResponse.json(await editorPayload(row));
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const id = String(body.id ?? '');
  if (!action || !id) return NextResponse.json({ error: 'action and id are required' }, { status: 400 });

  const row = await loadExactNewsletter(id);
  if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

  if (action === 'save_batch') {
    const edits = Array.isArray(body.edits) ? body.edits : [];
    if (edits.length === 0) return NextResponse.json({ error: 'At least one edit is required' }, { status: 400 });

    const requestedBase = typeof body.baseUpdatedAt === 'string' ? new Date(body.baseUpdatedAt) : null;
    if (requestedBase && !Number.isNaN(requestedBase.getTime()) && requestedBase.getTime() !== row.updatedAt.getTime()) {
      return NextResponse.json({
        error: 'This newsletter changed in another tab or request. Reload before saving so no edits are overwritten.',
        code: 'EDIT_CONFLICT',
        currentUpdatedAt: row.updatedAt.toISOString(),
      }, { status: 409 });
    }

    const content = cloneContent(row.content);
    const history = content._editHistory ?? [];
    const applied: Array<{ sectionIndex: number; fieldPath: string }> = [];

    for (const raw of edits.slice(0, 100)) {
      if (!raw || typeof raw !== 'object') continue;
      const edit = raw as Record<string, unknown>;
      const sectionIndex = Number(edit.sectionIndex);
      const fieldPath = String(edit.fieldPath ?? '');
      if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || sectionIndex >= (content.sections?.length ?? 0) || !fieldPath) continue;

      const section = content.sections[sectionIndex] as { type: string; data: unknown };
      const definition = getEditableFields(section).find(field => field.fieldPath === fieldPath);
      if (!definition) continue;
      if (section.data == null || typeof section.data !== 'object') continue;

      const before = getValueAtPath(section.data, fieldPath);
      const after = edit.value;
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      setValueAtPath(section.data as Record<string, unknown>, fieldPath, after);
      history.push({
        at: new Date().toISOString(),
        sectionIndex,
        sectionType: section.type,
        fieldPath,
        label: definition.label,
        editType: edit.editType === 'ai_rewrite_applied'
          ? 'ai_rewrite_applied'
          : edit.editType === 'consistency_fix' ? 'consistency_fix' : 'manual',
        before,
        after,
      });
      applied.push({ sectionIndex, fieldPath });
    }

    if (applied.length === 0) {
      return NextResponse.json({ success: true, unchanged: true, ...(await editorPayload(row)) });
    }

    content._editHistory = history.slice(-150);
    let html: string;
    try {
      html = renderHtml(content);
    } catch (error) {
      return NextResponse.json({ error: `Preview render failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
    }

    const db = getDb();
    const now = new Date();
    const updated = await db
      .update(newsletters)
      .set({
        content: content as typeof newsletters.$inferInsert['content'],
        html,
        updatedAt: now,
      })
      .where(and(eq(newsletters.id, row.id), eq(newsletters.updatedAt, row.updatedAt)))
      .returning({ id: newsletters.id });

    if (updated.length === 0) {
      return NextResponse.json({
        error: 'This newsletter changed while your edits were saving. Reload before retrying.',
        code: 'EDIT_CONFLICT',
      }, { status: 409 });
    }

    const coverage = buildCoverageReport(content.sections ?? [], TEAM_NAMES);
    return NextResponse.json({
      success: true,
      applied,
      html,
      updatedAt: now.toISOString(),
      sections: content.sections,
      coverage,
    });
  }

  if (action === 'ai_rewrite') {
    const sectionIndex = Number(body.sectionIndex);
    const fieldPath = String(body.fieldPath ?? '');
    const instruction = String(body.instruction ?? '').trim();
    const bot = String(body.bot ?? 'neutral');
    if (!Number.isInteger(sectionIndex) || sectionIndex < 0 || !fieldPath || !instruction) {
      return NextResponse.json({ error: 'sectionIndex, fieldPath, and instruction are required' }, { status: 400 });
    }

    const content = row.content as EditorContent;
    const section = content.sections?.[sectionIndex] as { type: string; data: unknown } | undefined;
    if (!section) return NextResponse.json({ error: 'Section not found' }, { status: 404 });
    const field = getEditableFields(section).find(candidate => candidate.fieldPath === fieldPath);
    if (!field) return NextResponse.json({ error: 'Field is not editable' }, { status: 400 });

    const fullFieldText = serializeValue(getValueAtPath(section.data, fieldPath));
    const selectedText = typeof body.selectedText === 'string' && body.selectedText.trim() ? body.selectedText : null;
    const currentText = selectedText ?? fullFieldText;
    const runId = generationRunId(content);
    const runBundle = runId ? await getRunWithSections(runId) : null;
    const contextPacket = runBundle?.run?.contextPacket as Record<string, unknown> | null | undefined;
    const frozenContext = typeof contextPacket?.enhancedContext === 'string'
      ? contextPacket.enhancedContext.slice(0, 18_000)
      : JSON.stringify(contextPacket ?? {}).slice(0, 18_000);
    const personaKey: PersonaType = bot === 'analyst' ? 'analyst' : 'entertainer';
    const personaPrompt = buildSystemPrompt(personaKey, 1);
    const sectionData = JSON.stringify(section.data, null, 2).slice(0, 8_000);
    const newsletterDigest = buildNewsletterDigest(content);

    const systemPrompt = `${personaPrompt}\n\nYou are editing one field in an already assembled fantasy-football newsletter.\n- Follow the human editor's instruction exactly.\n- Preserve the named writer's established voice without adding a preamble, label, or section heading.\n- Treat explicit human factual corrections as authoritative.\n- Use the frozen run context and structured section data to preserve consistency.\n- Do not invent scores, usage, projections, injuries, transactions, depth-chart positions, or quotations.\n- Return only the replacement text for the requested field or selection.`;

    const userPrompt = `<editor_instruction>\n${instruction}\n</editor_instruction>\n\n<current_text>\n${currentText}\n</current_text>\n\n<section type=${JSON.stringify(section.type)} field=${JSON.stringify(field.label)}>\n${sectionData}\n</section>\n\n<frozen_generation_context>\n${frozenContext}\n</frozen_generation_context>\n\n<newsletter_digest>\n${newsletterDigest}\n</newsletter_digest>`;

    try {
      const result = await generateWithCascade({
        systemPrompt,
        userPrompt,
        temperature: 0.7,
        maxTokens: 4_096,
        thinkingBudget: 0,
        claudeThinkingBudget: 1_024,
        sectionName: 'Editorial Rewrite',
        validate: output => output.trim().length > 0 && !/^(?:here(?:'s| is)|rewritten|revision:)/i.test(output.trim()),
      });
      return NextResponse.json({ success: true, preview: result.content.trim(), provider: result.provider });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'AI rewrite failed' }, { status: 502 });
    }
  }

  if (action === 'create_snapshot') {
    const content = row.content as EditorContent;
    const note = String(body.note ?? 'Manual editor snapshot').slice(0, 300);
    const snapshotId = await saveNewsletterSnapshot({
      season: row.season,
      week: row.week,
      runId: generationRunId(content),
      actionType: 'manual',
      note: `newsletter:${row.id}:${note}`,
      content: row.content,
      html: row.html,
    });
    if (!snapshotId) return NextResponse.json({ error: 'Snapshot could not be created' }, { status: 500 });
    return NextResponse.json({ success: true, snapshotId, ...(await editorPayload(row)) });
  }

  if (action === 'restore_snapshot') {
    const snapshotId = String(body.snapshotId ?? '');
    if (!snapshotId) return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
    const snapshot = await loadSnapshot(snapshotId);
    const currentContent = row.content as EditorContent;
    if (!snapshot || snapshot.season !== row.season || snapshot.week !== row.week || !snapshotMatchesNewsletter(snapshot, row.id, generationRunId(currentContent))) {
      return NextResponse.json({ error: 'Snapshot does not belong to this newsletter' }, { status: 404 });
    }

    await saveNewsletterSnapshot({
      season: row.season,
      week: row.week,
      runId: generationRunId(currentContent),
      actionType: 'pre_restore',
      note: `newsletter:${row.id}:Automatic backup before restoring ${snapshotId}`,
      content: row.content,
      html: row.html,
    });

    const restoredContent = cloneContent(snapshot.content);
    let restoredHtml = snapshot.html;
    if (!restoredHtml) restoredHtml = renderHtml(restoredContent);
    const now = new Date();
    await getDb().update(newsletters).set({
      content: restoredContent as typeof newsletters.$inferInsert['content'],
      html: restoredHtml,
      updatedAt: now,
    }).where(eq(newsletters.id, row.id));
    const refreshed = await loadExactNewsletter(row.id);
    return NextResponse.json(refreshed ? await editorPayload(refreshed) : { error: 'Newsletter disappeared after restore' }, { status: refreshed ? 200 : 409 });
  }

  if (action === 'review_claim') {
    const claimKey = String(body.claimKey ?? '');
    const status = String(body.status ?? 'open') as EditorReviewStatus;
    if (!claimKey || !['open', 'verified', 'dismissed'].includes(status)) {
      return NextResponse.json({ error: 'claimKey and a valid status are required' }, { status: 400 });
    }
    const content = cloneContent(row.content);
    const review = content._editorReview ?? {};
    const audit = review.audit ?? {};
    audit[claimKey] = {
      status,
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
      at: new Date().toISOString(),
    };
    content._editorReview = { ...review, audit };
    const now = new Date();
    await getDb().update(newsletters).set({
      content: content as typeof newsletters.$inferInsert['content'],
      updatedAt: now,
    }).where(eq(newsletters.id, row.id));
    return NextResponse.json({ success: true, editorReview: content._editorReview, updatedAt: now.toISOString() });
  }

  if (action === 'finalize') {
    const content = cloneContent(row.content);
    await saveNewsletterSnapshot({
      season: row.season,
      week: row.week,
      runId: generationRunId(content),
      actionType: 'finalize',
      note: `newsletter:${row.id}:${String(body.note ?? 'Final editorial review').slice(0, 250)}`,
      content: row.content,
      html: row.html,
    });
    let html: string;
    try {
      html = renderHtml(content);
    } catch (error) {
      return NextResponse.json({ error: `Render failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
    }
    const now = new Date();
    await getDb().update(newsletters).set({ html, updatedAt: now }).where(eq(newsletters.id, row.id));
    const coverage = buildCoverageReport(content.sections ?? [], TEAM_NAMES);
    return NextResponse.json({ success: true, html, updatedAt: now.toISOString(), coverage });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
