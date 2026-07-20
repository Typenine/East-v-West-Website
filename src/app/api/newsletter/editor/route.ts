import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { TEAM_NAMES } from '@/lib/constants/league';
import { buildCoverageReport, extractText } from '@/lib/newsletter/coverage-report';
import { getEditableFields } from '@/lib/newsletter/editable-fields';
import { getValueAtPath, setValueAtPath } from '@/lib/newsletter/field-path';
import { generateWithCascade } from '@/lib/newsletter/llm/cascade';
import { buildSystemPrompt, type PersonaType } from '@/lib/newsletter/llm/groq';
import { renderHtml } from '@/lib/newsletter/template';
import type { Newsletter } from '@/lib/newsletter/types';
import { getDb } from '@/server/db/client';
import {
  getLatestRunForWeek,
  getRunWithSections,
  listSnapshots,
  loadSnapshot,
  saveNewsletterSnapshot,
} from '@/server/db/observability-queries';
import { newsletters } from '@/server/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ReviewStatus = 'open' | 'verified' | 'dismissed';
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
    audit?: Record<string, { status: ReviewStatus; note?: string; at: string }>;
  };
};
type NewsletterRow = typeof newsletters.$inferSelect;

async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  return isAdminCookieValue(store.get('evw_admin')?.value);
}

async function loadRow(id: string): Promise<NewsletterRow | null> {
  const rows = await getDb().select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
  return rows[0] ?? null;
}

function cloneContent(value: unknown): EditorContent {
  return JSON.parse(JSON.stringify(value)) as EditorContent;
}

function runIdOf(content: EditorContent): string | null {
  return content._generationMeta?.runId ?? null;
}

function snapshotBelongsTo(
  snapshot: { runId: string | null; note: string | null },
  newsletterId: string,
  runId: string | null,
): boolean {
  return Boolean((runId && snapshot.runId === runId) || snapshot.note?.startsWith(`newsletter:${newsletterId}:`));
}

function serialize(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return JSON.stringify(value);
}

function newsletterDigest(content: EditorContent): string {
  return (content.sections ?? [])
    .map((section, index) => {
      const text = extractText(section.data).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1_200);
      return `SECTION ${index}: ${section.type}\n${text}`;
    })
    .join('\n\n')
    .slice(0, 14_000);
}

async function payload(row: NewsletterRow) {
  const content = row.content as EditorContent;
  const runId = runIdOf(content);
  const runBundle = runId
    ? await getRunWithSections(runId)
    : { run: await getLatestRunForWeek(row.season, row.week), sections: [] };
  const versions = (await listSnapshots(row.season, row.week))
    .filter(snapshot => snapshotBelongsTo(snapshot, row.id, runId));

  return {
    success: true as const,
    newsletter: {
      id: row.id,
      season: row.season,
      week: row.week,
      title: row.title,
      leagueName: row.leagueName,
      episodeType: row.episodeType,
      status: row.status,
      generatedAt: row.generatedAt.toISOString(),
      publishedAt: row.publishedAt?.toISOString() ?? null,
      discordPostedAt: row.discordPostedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
      meta: content.meta,
      sections: content.sections ?? [],
      editorReview: content._editorReview ?? {},
    },
    html: row.html,
    run: runBundle.run,
    runSections: runBundle.sections,
    factAudit: runBundle.run?.factAudit ?? null,
    coverage: buildCoverageReport(content.sections ?? [], TEAM_NAMES),
    versions,
  };
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Newsletter id is required' }, { status: 400 });
  const row = await loadRow(id);
  if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
  return NextResponse.json(await payload(row));
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = String(body.action ?? '');
  const id = String(body.id ?? '');
  if (!action || !id) return NextResponse.json({ error: 'action and id are required' }, { status: 400 });
  const row = await loadRow(id);
  if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });

  if (action === 'save_batch') {
    const edits = Array.isArray(body.edits) ? body.edits : [];
    if (edits.length === 0) return NextResponse.json({ error: 'At least one edit is required' }, { status: 400 });

    const baseDate = typeof body.baseUpdatedAt === 'string' ? new Date(body.baseUpdatedAt) : null;
    if (baseDate && !Number.isNaN(baseDate.getTime()) && baseDate.getTime() !== row.updatedAt.getTime()) {
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
      if (!definition || section.data == null || typeof section.data !== 'object') continue;

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
      const current = await payload(row);
      return NextResponse.json({ ...current, unchanged: true });
    }

    content._editHistory = history.slice(-150);
    let html: string;
    try {
      html = renderHtml(content);
    } catch (error) {
      return NextResponse.json({ error: `Preview render failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
    }

    const now = new Date();
    const updated = await getDb()
      .update(newsletters)
      .set({ content: content as typeof newsletters.$inferInsert['content'], html, updatedAt: now })
      .where(and(eq(newsletters.id, row.id), eq(newsletters.updatedAt, row.updatedAt)))
      .returning({ id: newsletters.id });

    if (updated.length === 0) {
      return NextResponse.json({
        error: 'This newsletter changed while your edits were saving. Reload before retrying.',
        code: 'EDIT_CONFLICT',
      }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      applied,
      html,
      updatedAt: now.toISOString(),
      sections: content.sections,
      coverage: buildCoverageReport(content.sections ?? [], TEAM_NAMES),
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

    const selected = typeof body.selectedText === 'string' && body.selectedText.trim() ? body.selectedText : null;
    const currentText = selected ?? serialize(getValueAtPath(section.data, fieldPath));
    const runId = runIdOf(content);
    const runBundle = runId ? await getRunWithSections(runId) : null;
    const packet = runBundle?.run?.contextPacket as Record<string, unknown> | null | undefined;
    const frozenContext = typeof packet?.enhancedContext === 'string'
      ? packet.enhancedContext.slice(0, 18_000)
      : JSON.stringify(packet ?? {}).slice(0, 18_000);
    const persona: PersonaType = bot === 'analyst' ? 'analyst' : 'entertainer';

    try {
      const result = await generateWithCascade({
        systemPrompt: `${buildSystemPrompt(persona, 1)}\n\nYou are editing one field in an assembled fantasy-football newsletter. Follow the human editor exactly. Preserve voice. Explicit human factual corrections are authoritative. Use the frozen context and structured section data for consistency. Never invent scores, usage, projections, injuries, transactions, depth-chart positions, or quotations. Return only replacement text.`,
        userPrompt: `<editor_instruction>\n${instruction}\n</editor_instruction>\n\n<current_text>\n${currentText}\n</current_text>\n\n<section type=${JSON.stringify(section.type)} field=${JSON.stringify(field.label)}>\n${JSON.stringify(section.data, null, 2).slice(0, 8_000)}\n</section>\n\n<frozen_generation_context>\n${frozenContext}\n</frozen_generation_context>\n\n<newsletter_digest>\n${newsletterDigest(content)}\n</newsletter_digest>`,
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
    const snapshotId = await saveNewsletterSnapshot({
      season: row.season,
      week: row.week,
      runId: runIdOf(content),
      actionType: 'manual',
      note: `newsletter:${row.id}:${String(body.note ?? 'Manual editor checkpoint').slice(0, 300)}`,
      content: row.content,
      html: row.html,
    });
    if (!snapshotId) return NextResponse.json({ error: 'Snapshot could not be created' }, { status: 500 });
    return NextResponse.json(await payload(row));
  }

  if (action === 'restore_snapshot') {
    const snapshotId = String(body.snapshotId ?? '');
    const snapshot = snapshotId ? await loadSnapshot(snapshotId) : null;
    const current = row.content as EditorContent;
    if (!snapshot || snapshot.season !== row.season || snapshot.week !== row.week || !snapshotBelongsTo(snapshot, row.id, runIdOf(current))) {
      return NextResponse.json({ error: 'Snapshot does not belong to this newsletter' }, { status: 404 });
    }

    await saveNewsletterSnapshot({
      season: row.season,
      week: row.week,
      runId: runIdOf(current),
      actionType: 'pre_restore',
      note: `newsletter:${row.id}:Automatic backup before restoring ${snapshotId}`,
      content: row.content,
      html: row.html,
    });

    const restored = cloneContent(snapshot.content);
    const html = snapshot.html ?? renderHtml(restored);
    await getDb().update(newsletters).set({
      content: restored as typeof newsletters.$inferInsert['content'],
      html,
      updatedAt: new Date(),
    }).where(eq(newsletters.id, row.id));
    const refreshed = await loadRow(row.id);
    return refreshed
      ? NextResponse.json(await payload(refreshed))
      : NextResponse.json({ error: 'Newsletter disappeared after restore' }, { status: 409 });
  }

  if (action === 'review_claim') {
    const claimKey = String(body.claimKey ?? '');
    const status = String(body.status ?? 'open') as ReviewStatus;
    if (!claimKey || !['open', 'verified', 'dismissed'].includes(status)) {
      return NextResponse.json({ error: 'claimKey and a valid status are required' }, { status: 400 });
    }
    const content = cloneContent(row.content);
    const audit = content._editorReview?.audit ?? {};
    audit[claimKey] = {
      status,
      note: typeof body.note === 'string' ? body.note.slice(0, 500) : undefined,
      at: new Date().toISOString(),
    };
    content._editorReview = { ...(content._editorReview ?? {}), audit };
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
      runId: runIdOf(content),
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
    return NextResponse.json({
      success: true,
      html,
      updatedAt: now.toISOString(),
      coverage: buildCoverageReport(content.sections ?? [], TEAM_NAMES),
    });
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
