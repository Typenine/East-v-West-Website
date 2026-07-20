import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { and, desc, eq, like, lt } from 'drizzle-orm';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { TEAM_NAMES } from '@/lib/constants/league';
import { buildSystemPrompt } from '@/lib/newsletter/llm/groq';
import { generateWithCascade } from '@/lib/newsletter/llm/cascade';
import { buildCoverageReport } from '@/lib/newsletter/coverage-report';
import { runFactAudit, type FactAuditResult } from '@/lib/newsletter/fact-audit';
import { getEditableFields, type EditableFieldDef, type EditorVoice } from '@/lib/newsletter/editable-fields';
import { getValueAtPath, setValueAtPath } from '@/lib/newsletter/field-path';
import { renderHtml } from '@/lib/newsletter/template';
import type { Newsletter } from '@/lib/newsletter/types';
import { getDb } from '@/server/db/client';
import { generationRuns, generationRunSections, newsletters, newsletterSnapshots } from '@/server/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type NewsletterContent = Newsletter & {
  _generationMeta?: { runId?: string };
  _editor?: EditorMetadata;
};

type EditorMetadata = {
  version: number;
  baseline: Record<string, string>;
  history: Array<{
    at: string;
    sectionIndex: number;
    sectionType: string;
    fieldPath: string;
    label: string;
    source: 'manual' | 'ai' | 'consistency' | 'restore';
    before: string;
    after: string;
  }>;
  verifiedClaims: string[];
  dismissedClaims: string[];
  lastSavedAt?: string;
  lastAuditAt?: string;
  lastAuditVersion?: number;
  lastCoverageAt?: string;
};

type EditInput = {
  sectionIndex: number;
  fieldPath: string;
  value: unknown;
  source?: 'manual' | 'ai' | 'consistency';
};

type EditorRow = typeof newsletters.$inferSelect;

const SNAPSHOT_LIMIT = 20;
const MAX_HISTORY = 120;
const MAX_BASELINE_FIELDS = 400;

async function requireAdmin(): Promise<boolean> {
  const store = await cookies();
  return isAdminCookieValue(store.get('evw_admin')?.value);
}

async function loadRow(req: NextRequest, body?: Record<string, unknown>): Promise<EditorRow | null> {
  const db = getDb();
  const id = String(body?.id ?? req.nextUrl.searchParams.get('id') ?? '').trim();
  if (id) {
    const rows = await db.select().from(newsletters).where(eq(newsletters.id, id)).limit(1);
    return rows[0] ?? null;
  }

  const season = Number(body?.season ?? req.nextUrl.searchParams.get('season'));
  const week = Number(body?.week ?? req.nextUrl.searchParams.get('week'));
  if (!Number.isFinite(season) || !Number.isFinite(week)) return null;
  const rows = await db
    .select()
    .from(newsletters)
    .where(and(eq(newsletters.season, season), eq(newsletters.week, week)))
    .orderBy(desc(newsletters.generatedAt))
    .limit(1);
  return rows[0] ?? null;
}

function editorMeta(content: NewsletterContent): EditorMetadata {
  const current = content._editor;
  return {
    version: current?.version ?? 0,
    baseline: current?.baseline ?? {},
    history: current?.history ?? [],
    verifiedClaims: current?.verifiedClaims ?? [],
    dismissedClaims: current?.dismissedClaims ?? [],
    lastSavedAt: current?.lastSavedAt,
    lastAuditAt: current?.lastAuditAt,
    lastAuditVersion: current?.lastAuditVersion,
    lastCoverageAt: current?.lastCoverageAt,
  };
}

function fieldKey(sectionIndex: number, fieldPath: string): string {
  return `${sectionIndex}::${fieldPath}`;
}

function resolveField(content: NewsletterContent, edit: EditInput): { section: NewsletterContent['sections'][number]; field: EditableFieldDef } | null {
  if (!Array.isArray(content.sections) || edit.sectionIndex < 0 || edit.sectionIndex >= content.sections.length) return null;
  const section = content.sections[edit.sectionIndex];
  const field = getEditableFields(section).find(candidate => candidate.fieldPath === edit.fieldPath);
  return field ? { section, field } : null;
}

function coerceValue(value: unknown, field: EditableFieldDef): unknown {
  if (field.kind === 'number') {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : value;
  }
  if (field.kind === 'select' && (value === 'true' || value === 'false')) return value === 'true';
  return typeof value === 'string' ? value : String(value ?? '');
}

function claimKey(claim: { section?: string; type?: string; claim?: string }): string {
  const normalized = `${claim.section ?? ''}|${claim.type ?? ''}|${claim.claim ?? ''}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `claim_${(hash >>> 0).toString(36)}`;
}

function auditForClient(audit: unknown, meta: EditorMetadata) {
  if (!audit || typeof audit !== 'object') return null;
  const typed = audit as FactAuditResult;
  return {
    ...typed,
    claims: (typed.claims ?? []).map(claim => {
      const key = claimKey(claim);
      return {
        ...claim,
        key,
        resolution: meta.verifiedClaims.includes(key)
          ? 'verified_by_editor'
          : meta.dismissedClaims.includes(key)
            ? 'dismissed'
            : 'open',
      };
    }),
  };
}

function fieldDigest(content: NewsletterContent, maxChars = 18_000): string {
  const lines: string[] = [];
  let chars = 0;
  content.sections.forEach((section, sectionIndex) => {
    for (const field of getEditableFields(section)) {
      const text = String(getValueAtPath(section.data, field.fieldPath) ?? '').trim();
      if (!text) continue;
      const line = `[${sectionIndex}:${section.type}:${field.label}] ${text}`;
      if (chars + line.length > maxChars) return;
      lines.push(line);
      chars += line.length;
    }
  });
  return lines.join('\n\n');
}

function extractRunReference(run: typeof generationRuns.$inferSelect | null): string {
  const packet = run?.contextPacket;
  if (!packet || typeof packet !== 'object') return '';
  const record = packet as Record<string, unknown>;
  const priority = [
    record.enhancedContext,
    record.context,
    record.derivedSummary,
    record.sourcePacket,
  ].filter(value => typeof value === 'string') as string[];
  return priority.join('\n\n').slice(0, 80_000);
}

function sectionNameMatches(sectionType: string, runName: string): boolean {
  if (runName === sectionType) return true;
  if (sectionType === 'MatchupRecaps') return /^Recap_\d+$/.test(runName);
  if (sectionType === 'Trades') return /^Trade_\d+$/.test(runName);
  if (sectionType === 'SpotlightTeam') return runName === 'Spotlight';
  return false;
}

async function loadRun(content: NewsletterContent, row: EditorRow) {
  const db = getDb();
  const runId = content._generationMeta?.runId;
  const runRows = runId
    ? await db.select().from(generationRuns).where(eq(generationRuns.runId, runId)).limit(1)
    : await db.select().from(generationRuns)
        .where(and(eq(generationRuns.season, row.season), eq(generationRuns.week, row.week)))
        .orderBy(desc(generationRuns.startedAt)).limit(1);
  const run = runRows[0] ?? null;
  const sections = run
    ? await db.select().from(generationRunSections)
        .where(eq(generationRunSections.runId, run.runId))
        .orderBy(generationRunSections.createdAt)
    : [];
  return { run, sections };
}

function snapshotPrefix(id: string): string {
  return `[newsletter:${id}]`;
}

async function listExactSnapshots(row: EditorRow) {
  const db = getDb();
  return db.select({
    id: newsletterSnapshots.id,
    actionType: newsletterSnapshots.actionType,
    note: newsletterSnapshots.note,
    createdAt: newsletterSnapshots.createdAt,
  })
    .from(newsletterSnapshots)
    .where(and(
      eq(newsletterSnapshots.season, row.season),
      eq(newsletterSnapshots.week, row.week),
      like(newsletterSnapshots.note, `${snapshotPrefix(row.id)}%`),
    ))
    .orderBy(desc(newsletterSnapshots.createdAt));
}

async function saveExactSnapshot(row: EditorRow, actionType: 'finalize' | 'pre_restore' | 'manual', note: string) {
  const db = getDb();
  const prefix = snapshotPrefix(row.id);
  const inserted = await db.insert(newsletterSnapshots).values({
    season: row.season,
    week: row.week,
    runId: (row.content as NewsletterContent)._generationMeta?.runId ?? null,
    actionType,
    note: `${prefix} ${note}`.slice(0, 2000),
    content: row.content as Record<string, unknown>,
    html: row.html,
  }).returning({ id: newsletterSnapshots.id });

  const all = await db.select({ id: newsletterSnapshots.id, createdAt: newsletterSnapshots.createdAt })
    .from(newsletterSnapshots)
    .where(and(
      eq(newsletterSnapshots.season, row.season),
      eq(newsletterSnapshots.week, row.week),
      like(newsletterSnapshots.note, `${prefix}%`),
    ))
    .orderBy(desc(newsletterSnapshots.createdAt));
  if (all.length > SNAPSHOT_LIMIT) {
    const cutoff = all[SNAPSHOT_LIMIT - 1].createdAt;
    await db.delete(newsletterSnapshots).where(and(
      eq(newsletterSnapshots.season, row.season),
      eq(newsletterSnapshots.week, row.week),
      like(newsletterSnapshots.note, `${prefix}%`),
      lt(newsletterSnapshots.createdAt, cutoff),
    ));
  }
  return inserted[0]?.id ?? null;
}

function coverageFor(content: NewsletterContent) {
  return buildCoverageReport(content.sections, TEAM_NAMES);
}

function emptyFields(content: NewsletterContent) {
  const empty: Array<{ sectionIndex: number; sectionType: string; fieldPath: string; label: string }> = [];
  content.sections.forEach((section, sectionIndex) => {
    for (const field of getEditableFields(section)) {
      const value = getValueAtPath(section.data, field.fieldPath);
      if (value == null || String(value).trim() === '') {
        empty.push({ sectionIndex, sectionType: section.type, fieldPath: field.fieldPath, label: field.label });
      }
    }
  });
  return empty;
}

function buildChecklist(
  row: EditorRow,
  content: NewsletterContent,
  run: typeof generationRuns.$inferSelect | null,
  runSections: Array<typeof generationRunSections.$inferSelect>,
) {
  const meta = editorMeta(content);
  const audit = auditForClient(run?.factAudit, meta);
  const unresolvedHigh = audit?.claims?.filter(claim =>
    claim.risk === 'high'
    && claim.verification !== 'supported'
    && claim.verification !== 'not_applicable'
    && claim.resolution === 'open'
  ) ?? [];
  const coverage = coverageFor(content);
  const fallbackSections = [...new Set(runSections.filter(section => section.isFallback).map(section => section.sectionName))];
  const failedSections = [...new Set(runSections.filter(section => section.status === 'failed').map(section => section.sectionName))];
  const empties = emptyFields(content);
  const auditCurrent = meta.lastAuditVersion != null && meta.lastAuditVersion === meta.version;
  return {
    exactNewsletterId: row.id,
    titlePresent: Boolean(row.title?.trim()),
    renderReady: Boolean(row.html?.trim()),
    auditCurrent,
    unresolvedHighRisk: unresolvedHigh.length,
    factualOnlyTeams: coverage.factualOnlyTeams,
    omittedTeams: coverage.omittedTeams,
    repetitionWarnings: coverage.repetition.length,
    fallbackSections,
    failedSections,
    emptyFields: empties,
    publishReady: Boolean(row.title?.trim())
      && Boolean(row.html?.trim())
      && unresolvedHigh.length === 0
      && failedSections.length === 0,
  };
}

async function editorPayload(row: EditorRow) {
  const content = row.content as NewsletterContent;
  const meta = editorMeta(content);
  const { run, sections: runSections } = await loadRun(content, row);
  const snapshots = await listExactSnapshots(row);
  const fieldsBySection = content.sections.map((section, sectionIndex) => ({
    sectionIndex,
    type: section.type,
    fields: getEditableFields(section),
    providers: runSections.filter(item => sectionNameMatches(section.type, item.sectionName)),
  }));
  return {
    success: true,
    newsletter: {
      id: row.id,
      title: row.title,
      season: row.season,
      week: row.week,
      episodeType: row.episodeType,
      status: row.status,
      generatedAt: row.generatedAt,
      updatedAt: row.updatedAt,
      publishedAt: row.publishedAt,
      discordPostedAt: row.discordPostedAt,
      content,
      html: row.html,
      editor: meta,
    },
    fieldsBySection,
    run: run ? {
      runId: run.runId,
      status: run.status,
      warnings: run.warnings ?? [],
      factAudit: auditForClient(run.factAudit, meta),
    } : null,
    coverage: coverageFor(content),
    snapshots,
    checklist: buildChecklist(row, content, run, runSections),
  };
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const row = await loadRow(req);
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
  const row = await loadRow(req, body);
  if (!row) return NextResponse.json({ error: 'Newsletter not found' }, { status: 404 });
  const db = getDb();
  const content = structuredClone(row.content) as NewsletterContent;

  if (action === 'save_batch') {
    const edits = Array.isArray(body.edits) ? body.edits as EditInput[] : [];
    if (edits.length === 0) return NextResponse.json({ error: 'No edits supplied' }, { status: 400 });

    const expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : null;
    if (expectedUpdatedAt && row.updatedAt.toISOString() !== expectedUpdatedAt) {
      return NextResponse.json({
        error: 'This newsletter changed in another editor session. Reload before saving to avoid overwriting newer edits.',
        conflict: true,
        updatedAt: row.updatedAt,
      }, { status: 409 });
    }

    const meta = editorMeta(content);
    const now = new Date();
    for (const edit of edits) {
      const resolved = resolveField(content, edit);
      if (!resolved) {
        return NextResponse.json({ error: `Unknown editable field ${edit.sectionIndex}:${edit.fieldPath}` }, { status: 400 });
      }
      const beforeValue = getValueAtPath(resolved.section.data, edit.fieldPath);
      const before = beforeValue == null ? '' : String(beforeValue);
      const nextValue = coerceValue(edit.value, resolved.field);
      const after = nextValue == null ? '' : String(nextValue);
      if (before === after) continue;
      const key = fieldKey(edit.sectionIndex, edit.fieldPath);
      if (Object.keys(meta.baseline).length < MAX_BASELINE_FIELDS && meta.baseline[key] === undefined) {
        meta.baseline[key] = before;
      }
      setValueAtPath(resolved.section.data as Record<string, unknown>, edit.fieldPath, nextValue);
      meta.history.push({
        at: now.toISOString(),
        sectionIndex: edit.sectionIndex,
        sectionType: resolved.section.type,
        fieldPath: edit.fieldPath,
        label: resolved.field.label,
        source: edit.source ?? 'manual',
        before: before.slice(0, 12_000),
        after: after.slice(0, 12_000),
      });
    }
    meta.version += 1;
    meta.history = meta.history.slice(-MAX_HISTORY);
    meta.lastSavedAt = now.toISOString();
    content._editor = meta;

    let html: string;
    try {
      html = renderHtml(content);
    } catch (error) {
      return NextResponse.json({ error: `Preview render failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
    }

    await db.update(newsletters).set({ content, html, updatedAt: now }).where(eq(newsletters.id, row.id));
    const refreshed = { ...row, content, html, updatedAt: now } as EditorRow;
    return NextResponse.json(await editorPayload(refreshed));
  }

  if (action === 'rename') {
    const title = String(body.title ?? '').trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    const now = new Date();
    await db.update(newsletters).set({ title, updatedAt: now }).where(eq(newsletters.id, row.id));
    return NextResponse.json(await editorPayload({ ...row, title, updatedAt: now }));
  }

  if (action === 'ai_rewrite') {
    const sectionIndex = Number(body.sectionIndex);
    const fieldPath = String(body.fieldPath ?? '');
    const instruction = String(body.instruction ?? '').trim();
    if (!instruction) return NextResponse.json({ error: 'Rewrite instruction is required' }, { status: 400 });
    const resolved = resolveField(content, { sectionIndex, fieldPath, value: '' });
    if (!resolved || resolved.field.aiEnabled === false) return NextResponse.json({ error: 'This field cannot be AI rewritten' }, { status: 400 });

    const fullText = String(getValueAtPath(resolved.section.data, fieldPath) ?? '');
    const selectedText = typeof body.selectedText === 'string' && body.selectedText.trim() ? body.selectedText : null;
    const targetText = selectedText ?? fullText;
    const { run } = await loadRun(content, row);
    const runReference = extractRunReference(run).slice(0, 16_000);
    const digest = fieldDigest(content, 15_000);
    const voice = resolved.field.bot as EditorVoice;
    const persona = voice === 'entertainer'
      ? buildSystemPrompt('entertainer', 1)
      : voice === 'analyst'
        ? buildSystemPrompt('analyst', 1)
        : voice === 'clancy'
          ? 'You are Clancy, the league archivist. Write concise, dry, authoritative archival commentary without imitating Mason or Westy.'
          : 'You are the senior editor of the East v. West fantasy-football newsletter. Preserve the established editorial voice and factual record.';

    const systemPrompt = `${persona}\n\nYou are editing one newsletter field. The human editor instruction is authoritative. Preserve facts and conclusions from the shared issue unless the instruction explicitly corrects them. Distinguish verified facts from inference. Do not invent scores, records, usage, transactions, projections, or depth-chart details. Return only the replacement text—no labels, explanation, or markdown fences.`;
    const userPrompt = [
      `<editor_instruction>${instruction}</editor_instruction>`,
      `<target section=${JSON.stringify(resolved.section.type)} field=${JSON.stringify(resolved.field.label)}>${targetText}</target>`,
      `<section_data>${JSON.stringify(resolved.section.data, null, 2).slice(0, 7000)}</section_data>`,
      `<other_newsletter_copy>${digest}</other_newsletter_copy>`,
      runReference ? `<generation_source_context>${runReference}</generation_source_context>` : '',
      selectedText
        ? 'Rewrite only the selected target text. Keep it compatible with the surrounding field.'
        : 'Rewrite the complete target field. Match its approximate length unless the instruction requests a different length.',
    ].filter(Boolean).join('\n\n');

    const result = await generateWithCascade({
      systemPrompt,
      userPrompt,
      temperature: 0.55,
      maxTokens: 4096,
      thinkingBudget: 512,
      claudeThinkingBudget: 1024,
      sectionName: `Editorial Rewrite — ${resolved.section.type}`,
      validate: output => output.trim().length > 0 && !/^```/.test(output.trim()),
    });
    return NextResponse.json({ success: true, preview: result.content.trim(), provider: result.provider });
  }

  if (action === 'run_audit') {
    const { run } = await loadRun(content, row);
    const meta = editorMeta(content);
    const audit = await runFactAudit(content.sections, { referenceText: extractRunReference(run) });
    meta.lastAuditAt = new Date().toISOString();
    meta.lastAuditVersion = meta.version;
    content._editor = meta;
    const now = new Date();
    await db.update(newsletters).set({ content, updatedAt: now }).where(eq(newsletters.id, row.id));
    if (run) {
      await db.update(generationRuns).set({ factAudit: audit as unknown as Record<string, unknown> }).where(eq(generationRuns.runId, run.runId));
    }
    const refreshed = { ...row, content, updatedAt: now } as EditorRow;
    return NextResponse.json(await editorPayload(refreshed));
  }

  if (action === 'resolve_claim') {
    const key = String(body.claimKey ?? '');
    const resolution = String(body.resolution ?? 'open');
    if (!key) return NextResponse.json({ error: 'claimKey is required' }, { status: 400 });
    const meta = editorMeta(content);
    meta.verifiedClaims = meta.verifiedClaims.filter(item => item !== key);
    meta.dismissedClaims = meta.dismissedClaims.filter(item => item !== key);
    if (resolution === 'verified_by_editor') meta.verifiedClaims.push(key);
    if (resolution === 'dismissed') meta.dismissedClaims.push(key);
    content._editor = meta;
    const now = new Date();
    await db.update(newsletters).set({ content, updatedAt: now }).where(eq(newsletters.id, row.id));
    return NextResponse.json(await editorPayload({ ...row, content, updatedAt: now } as EditorRow));
  }

  if (action === 'snapshot' || action === 'finalize') {
    const note = String(body.note ?? (action === 'finalize' ? 'Final review checkpoint' : 'Manual checkpoint'));
    await saveExactSnapshot(row, action === 'finalize' ? 'finalize' : 'manual', note);
    let html: string;
    try {
      html = renderHtml(content);
    } catch (error) {
      return NextResponse.json({ error: `Render failed: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
    }
    const meta = editorMeta(content);
    const coverage = coverageFor(content);
    meta.lastCoverageAt = coverage.generatedAt;
    content._editor = meta;
    const now = new Date();
    await db.update(newsletters).set({ content, html, updatedAt: now }).where(eq(newsletters.id, row.id));
    return NextResponse.json(await editorPayload({ ...row, content, html, updatedAt: now } as EditorRow));
  }

  if (action === 'restore_snapshot') {
    const snapshotId = String(body.snapshotId ?? '');
    if (!snapshotId) return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
    const snapshots = await db.select().from(newsletterSnapshots).where(eq(newsletterSnapshots.id, snapshotId)).limit(1);
    const snapshot = snapshots[0];
    if (!snapshot || snapshot.season !== row.season || snapshot.week !== row.week || !snapshot.note?.startsWith(snapshotPrefix(row.id))) {
      return NextResponse.json({ error: 'Snapshot does not belong to this exact newsletter' }, { status: 404 });
    }
    await saveExactSnapshot(row, 'pre_restore', `Before restoring snapshot ${snapshotId}`);
    const restoredContent = structuredClone(snapshot.content) as NewsletterContent;
    const restoredMeta = editorMeta(restoredContent);
    restoredMeta.version += 1;
    restoredMeta.history.push({
      at: new Date().toISOString(),
      sectionIndex: -1,
      sectionType: 'Newsletter',
      fieldPath: '*',
      label: 'Full newsletter restore',
      source: 'restore',
      before: `Version ${editorMeta(content).version}`,
      after: `Snapshot ${snapshotId}`,
    });
    restoredContent._editor = restoredMeta;
    const restoredHtml = snapshot.html || renderHtml(restoredContent);
    const now = new Date();
    await db.update(newsletters).set({ content: restoredContent, html: restoredHtml, updatedAt: now }).where(eq(newsletters.id, row.id));
    return NextResponse.json(await editorPayload({ ...row, content: restoredContent, html: restoredHtml, updatedAt: now } as EditorRow));
  }

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
}
