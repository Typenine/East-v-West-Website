'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { getEditableFields, type EditableFieldDef } from '@/lib/newsletter/editable-fields';
import { getValueAtPath, setValueAtPath } from '@/lib/newsletter/field-path';

export interface EditorialWorkspaceProps {
  newsletterId?: string | null;
  season?: string;
  week?: string;
  needsWeek?: boolean;
  initialHtml?: string | null;
  embedded?: boolean;
  onHtmlUpdate?: (html: string) => void;
  onClose?: () => void;
  onPublish?: () => void;
  publishing?: boolean;
  setFinalizeResult?: (result: { ok: boolean; message: string } | null) => void;
}

interface NewsletterSection {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

interface FactAuditClaim {
  section: string;
  claim: string;
  type: string;
  risk: 'high' | 'medium' | 'low';
  reason: string;
  verification?: 'supported' | 'contradicted' | 'unverified' | 'not_applicable';
  evidence?: string;
  unsupportedNumbers?: string[];
  unsupportedEntities?: string[];
}

interface FactAuditData {
  claims: FactAuditClaim[];
  highRiskCount: number;
  mediumRiskCount: number;
  supportedCount?: number;
  contradictedCount?: number;
  unverifiedCount?: number;
  sectionsAudited: number;
  model: string;
  generatedAt: string;
  error?: string;
}

interface CoverageTeam {
  team: string;
  mentions: number;
  analyticalMentions: number;
  analyticalSections: string[];
  coverage: 'substantive' | 'passing' | 'factual_only' | 'omitted';
}

interface CoverageData {
  teams: CoverageTeam[];
  omittedTeams: string[];
  factualOnlyTeams: string[];
  warnings: string[];
  repetition: Array<{ phrase: string; sections: string[] }>;
  generatedAt: string;
}

interface RunSectionMeta {
  sectionName: string;
  status: string;
  provider: string | null;
  isFallback: boolean;
  error: string | null;
}

interface VersionInfo {
  id: string;
  runId: string | null;
  actionType: string;
  note: string | null;
  createdAt: string;
}

interface NewsletterInfo {
  id: string;
  season: number;
  week: number;
  title: string | null;
  leagueName: string;
  episodeType: string | null;
  status: 'draft' | 'published';
  generatedAt: string | null;
  publishedAt: string | null;
  discordPostedAt: string | null;
  updatedAt: string;
  meta: { leagueName?: string; week?: number; season?: number; date?: string };
  sections: NewsletterSection[];
  editorReview: {
    audit?: Record<string, { status: 'open' | 'verified' | 'dismissed'; note?: string; at: string }>;
  };
}

interface WorkspacePayload {
  success: boolean;
  newsletter: NewsletterInfo;
  html: string;
  run: { runId: string; status: string; warnings?: string[]; factAudit?: FactAuditData | null } | null;
  runSections: RunSectionMeta[];
  factAudit: FactAuditData | null;
  coverage: CoverageData;
  versions: VersionInfo[];
}

interface PendingEdit {
  sectionIndex: number;
  fieldPath: string;
  value: unknown;
  editType: 'manual' | 'ai_rewrite_applied' | 'consistency_fix';
}

interface SweepProposal {
  sectionIndex: number;
  fieldPath: string;
  label: string;
  before: string;
  after: string;
  reason: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: 'Claude',
  'gemini-2.5-flash': 'Gemini 2.5',
  'gemini-2.0-flash': 'Gemini 2.0',
  groq: 'Groq',
  cerebras: 'Cerebras',
  openrouter: 'OpenRouter',
};

function cloneSections(sections: NewsletterSection[]): NewsletterSection[] {
  return JSON.parse(JSON.stringify(sections)) as NewsletterSection[];
}

function fieldKey(sectionIndex: number, fieldPath: string): string {
  return `${sectionIndex}::${fieldPath}`;
}

function valueText(value: unknown, kind?: EditableFieldDef['kind']): string {
  if (kind === 'string-list' && Array.isArray(value)) return value.join('\n');
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}

function parseFieldValue(field: EditableFieldDef, raw: string | boolean): unknown {
  if (field.kind === 'boolean') return Boolean(raw);
  const text = String(raw);
  if (field.kind === 'number') {
    if (!text.trim()) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (field.kind === 'string-list') {
    return text.split(/\n|,/).map(item => item.trim()).filter(Boolean);
  }
  return text;
}

function shortId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

function sectionLabel(type: string): string {
  const map: Record<string, string> = {
    Intro: 'Introduction', FinalWord: 'Final Word', WaiversAndFA: 'Waivers & Free Agency',
    PowerRankings: 'Power Rankings', SeasonPreview: 'Season Preview', SpotlightTeam: 'Team Spotlight',
    Blurt: 'Quick Takes', Forecast: 'Forecast', PredictionCallbacks: 'Prediction Callbacks',
    ClancyInsert: 'Clancy', Trades: 'Trades', MatchupRecaps: 'Matchup Recaps', MockDraft: 'Mock Draft',
    DraftGrades: 'Draft Grades', WeeklyAwards: 'Weekly Awards', WhatIf: 'What If',
    DynastyAnalysis: 'Dynasty Analysis', RivalryWatch: 'Rivalry Watch', PlayoffOdds: 'Playoff Odds',
  };
  return map[type] ?? type.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function renderDiff(before: string, after: string) {
  if (before === after) return <span>{after}</span>;
  const oldWords = before.split(/(\s+)/);
  const newWords = after.split(/(\s+)/);
  const m = oldWords.length;
  const n = newWords.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldWords[i] === newWords[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const output: Array<{ type: 'same' | 'old' | 'new'; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldWords[i] === newWords[j]) {
      output.push({ type: 'same', text: oldWords[i++] });
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      output.push({ type: 'new', text: newWords[j++] });
    } else {
      output.push({ type: 'old', text: oldWords[i++] });
    }
  }
  return output.map((part, index) => part.type === 'same'
    ? <span key={index}>{part.text}</span>
    : part.type === 'old'
      ? <span key={index} className="bg-red-900/50 text-red-300 line-through">{part.text}</span>
      : <span key={index} className="bg-emerald-900/50 text-emerald-200">{part.text}</span>);
}

function claimKey(claim: FactAuditClaim, _index: number): string {
  return `${claim.section}:${claim.type}:${claim.claim}`.slice(0, 500);
}

function runMetaForSection(type: string, runSections: RunSectionMeta[]): RunSectionMeta[] {
  return runSections.filter(meta => {
    if (meta.sectionName === type) return true;
    if (type === 'MatchupRecaps') return /^Recap_\d+$/.test(meta.sectionName);
    if (type === 'Trades') return /^Trade_\d+$/.test(meta.sectionName) || meta.sectionName === 'PreDraftTrades';
    if (type === 'SpotlightTeam') return meta.sectionName === 'Spotlight';
    if (type === 'DraftGrades') return /^DraftGrade_\d+$/.test(meta.sectionName) || meta.sectionName === 'DraftGrades_Summary';
    if (type === 'MockDraft') return meta.sectionName.startsWith('MockDraft_');
    return false;
  });
}

function sectionIndexForAudit(sectionName: string, sections: NewsletterSection[]): number {
  const exact = sections.findIndex(section => section.type === sectionName);
  if (exact >= 0) return exact;
  if (/^Recap_\d+$/.test(sectionName)) return sections.findIndex(section => section.type === 'MatchupRecaps');
  if (/^Trade_\d+$/.test(sectionName) || sectionName === 'PreDraftTrades') return sections.findIndex(section => section.type === 'Trades');
  if (sectionName === 'Spotlight') return sections.findIndex(section => section.type === 'SpotlightTeam');
  if (/^DraftGrade_\d+$/.test(sectionName) || sectionName === 'DraftGrades_Summary') return sections.findIndex(section => section.type === 'DraftGrades');
  return -1;
}

export default function EditorialWorkspace({
  newsletterId,
  season,
  week,
  needsWeek = true,
  initialHtml,
  embedded = false,
  onHtmlUpdate,
  onClose,
  onPublish,
  publishing: parentPublishing = false,
  setFinalizeResult,
}: EditorialWorkspaceProps) {
  const [resolvedId, setResolvedId] = useState<string | null>(newsletterId ?? null);
  const [newsletter, setNewsletter] = useState<NewsletterInfo | null>(null);
  const [sections, setSections] = useState<NewsletterSection[]>([]);
  const [html, setHtml] = useState(initialHtml ?? '');
  const [runSections, setRunSections] = useState<RunSectionMeta[]>([]);
  const [runInfo, setRunInfo] = useState<WorkspacePayload['run']>(null);
  const [factAudit, setFactAudit] = useState<FactAuditData | null>(null);
  const [coverage, setCoverage] = useState<CoverageData | null>(null);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [editorReview, setEditorReview] = useState<NewsletterInfo['editorReview']>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState(0);
  const [activeFieldPath, setActiveFieldPath] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<'outline' | 'preview' | 'edit'>('preview');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'dirty' | 'saving' | 'error' | 'conflict'>('saved');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set());
  const [auditStale, setAuditStale] = useState(false);

  const [aiInstruction, setAiInstruction] = useState('');
  const [aiPreview, setAiPreview] = useState<{ text: string; provider: string } | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  const [showHealth, setShowHealth] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showFinalReview, setShowFinalReview] = useState(false);
  const [snapshotRunning, setSnapshotRunning] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [sweepNote, setSweepNote] = useState('');
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepProposals, setSweepProposals] = useState<SweepProposal[] | null>(null);
  const [sendDiscord, setSendDiscord] = useState(true);
  const [overrideWarnings, setOverrideWarnings] = useState(false);
  const [publishRunning, setPublishRunning] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [webhookHealth, setWebhookHealth] = useState<{ configured: boolean; reachable: boolean; message: string } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const sectionsRef = useRef<NewsletterSection[]>([]);
  const updatedAtRef = useRef('');
  const queueRef = useRef<Map<string, PendingEdit>>(new Map());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRunningRef = useRef(false);
  const originalValuesRef = useRef<Map<string, unknown>>(new Map());
  const undoRef = useRef<Map<string, unknown[]>>(new Map());

  useEffect(() => { sectionsRef.current = sections; }, [sections]);

  const applyPayload = useCallback((payload: WorkspacePayload, resetOriginals = false) => {
    setNewsletter(payload.newsletter);
    setResolvedId(payload.newsletter.id);
    setSections(cloneSections(payload.newsletter.sections));
    sectionsRef.current = cloneSections(payload.newsletter.sections);
    setHtml(payload.html ?? '');
    onHtmlUpdate?.(payload.html ?? '');
    setRunInfo(payload.run);
    setRunSections(payload.runSections ?? []);
    setFactAudit(payload.factAudit ?? null);
    setCoverage(payload.coverage ?? null);
    setVersions(payload.versions ?? []);
    setEditorReview(payload.newsletter.editorReview ?? {});
    updatedAtRef.current = payload.newsletter.updatedAt;
    if (resetOriginals || originalValuesRef.current.size === 0) {
      const originals = new Map<string, unknown>();
      payload.newsletter.sections.forEach((section, sectionIndex) => {
        getEditableFields(section).forEach(field => originals.set(fieldKey(sectionIndex, field.fieldPath), getValueAtPath(section.data, field.fieldPath)));
      });
      originalValuesRef.current = originals;
      undoRef.current = new Map();
    }
    setDirtyKeys(new Set());
    queueRef.current.clear();
    setSaveStatus('saved');
    setSaveError(null);
  }, [onHtmlUpdate]);

  const loadWorkspace = useCallback(async (knownId?: string | null) => {
    setLoading(true);
    setLoadError(null);
    try {
      let id = knownId ?? resolvedId ?? newsletterId ?? null;
      if (!id) {
        if (!season) throw new Error('Newsletter id or season is required');
        const weekNumber = needsWeek ? (parseInt(week ?? '0') || 0) : 0;
        const lookup = await fetch(`/api/newsletter?season=${encodeURIComponent(season)}&week=${weekNumber}&draft=1`, { cache: 'no-store', credentials: 'include' });
        const lookupData = await lookup.json() as { id?: string; error?: string };
        if (!lookup.ok || !lookupData.id) throw new Error(lookupData.error ?? 'Unable to resolve the exact newsletter');
        id = lookupData.id;
      }
      const response = await fetch(`/api/newsletter/editor?id=${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'include' });
      const payload = await response.json() as WorkspacePayload & { error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? 'Unable to load editor');
      applyPayload(payload, true);
      const draftKey = `evw_editor_draft_${id}`;
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { updatedAt?: string; edits?: PendingEdit[] };
          if (parsed.updatedAt === payload.newsletter.updatedAt && Array.isArray(parsed.edits) && parsed.edits.length > 0) {
            const restoredSections = cloneSections(payload.newsletter.sections);
            const restoredDirty = new Set<string>();
            parsed.edits.forEach(edit => {
              const section = restoredSections[edit.sectionIndex];
              if (!section?.data || typeof section.data !== 'object') return;
              setValueAtPath(section.data, edit.fieldPath, edit.value);
              const key = fieldKey(edit.sectionIndex, edit.fieldPath);
              queueRef.current.set(key, edit);
              restoredDirty.add(key);
            });
            setSections(restoredSections);
            sectionsRef.current = restoredSections;
            setDirtyKeys(restoredDirty);
            setSaveStatus('dirty');
          }
        }
      } catch { /* stale browser draft is non-fatal */ }
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load editor');
    } finally {
      setLoading(false);
    }
  }, [applyPayload, needsWeek, newsletterId, resolvedId, season, week]);

  useEffect(() => { void loadWorkspace(newsletterId); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetch('/api/newsletter/publish', { cache: 'no-store', credentials: 'include' })
      .then(response => response.json().then(data => ({ response, data })))
      .then(({ response, data }) => {
        if (response.ok) setWebhookHealth({ configured: Boolean(data.configured), reachable: Boolean(data.reachable), message: String(data.message ?? '') });
      })
      .catch(() => {});
  }, []);

  const persistBrowserDraft = useCallback(() => {
    if (!resolvedId) return;
    const edits = [...queueRef.current.values()];
    const key = `evw_editor_draft_${resolvedId}`;
    try {
      if (edits.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify({ updatedAt: updatedAtRef.current, edits }));
    } catch { /* storage is best effort */ }
  }, [resolvedId]);

  const flushSave = useCallback(async (): Promise<boolean> => {
    if (!resolvedId) return false;
    if (saveRunningRef.current) return false;
    if (queueRef.current.size === 0) {
      setSaveStatus('saved');
      return true;
    }

    saveRunningRef.current = true;
    const batch = [...queueRef.current.entries()];
    batch.forEach(([key]) => queueRef.current.delete(key));
    setSaveStatus('saving');
    setSaveError(null);

    try {
      const response = await fetch('/api/newsletter/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'save_batch',
          id: resolvedId,
          baseUpdatedAt: updatedAtRef.current,
          edits: batch.map(([, edit]) => edit),
        }),
      });
      const data = await response.json() as {
        success?: boolean; error?: string; code?: string; html?: string; updatedAt?: string;
        sections?: NewsletterSection[]; coverage?: CoverageData;
      };
      if (!response.ok || !data.success) {
        batch.forEach(([key, edit]) => { if (!queueRef.current.has(key)) queueRef.current.set(key, edit); });
        if (response.status === 409 || data.code === 'EDIT_CONFLICT') {
          setSaveStatus('conflict');
          setSaveError(data.error ?? 'Edit conflict. Reload before saving.');
        } else {
          setSaveStatus('error');
          setSaveError(data.error ?? 'Save failed');
        }
        persistBrowserDraft();
        return false;
      }

      if (data.updatedAt) {
        updatedAtRef.current = data.updatedAt;
        setNewsletter(current => current ? { ...current, updatedAt: data.updatedAt! } : current);
      }
      if (data.sections) {
        setSections(cloneSections(data.sections));
        sectionsRef.current = cloneSections(data.sections);
      }
      if (data.html != null) {
        setHtml(data.html);
        onHtmlUpdate?.(data.html);
      }
      if (data.coverage) setCoverage(data.coverage);
      setAuditStale(true);
      setDirtyKeys(current => {
        const next = new Set(current);
        batch.forEach(([key]) => { if (!queueRef.current.has(key)) next.delete(key); });
        return next;
      });
      persistBrowserDraft();
      setSaveStatus(queueRef.current.size > 0 ? 'dirty' : 'saved');
      return true;
    } catch (error) {
      batch.forEach(([key, edit]) => { if (!queueRef.current.has(key)) queueRef.current.set(key, edit); });
      setSaveStatus('error');
      setSaveError(error instanceof Error ? error.message : 'Save failed');
      persistBrowserDraft();
      return false;
    } finally {
      saveRunningRef.current = false;
      if (queueRef.current.size > 0) {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => { void flushSave(); }, 250);
      }
    }
  }, [onHtmlUpdate, persistBrowserDraft, resolvedId]);

  const scheduleEdit = useCallback((sectionIndex: number, field: EditableFieldDef, value: unknown, editType: PendingEdit['editType'] = 'manual', recordUndo = true) => {
    const key = fieldKey(sectionIndex, field.fieldPath);
    const currentValue = getValueAtPath(sectionsRef.current[sectionIndex]?.data, field.fieldPath);
    if (recordUndo && JSON.stringify(currentValue) !== JSON.stringify(value)) {
      const stack = undoRef.current.get(key) ?? [];
      undoRef.current.set(key, [currentValue, ...stack].slice(0, 20));
    }
    const next = cloneSections(sectionsRef.current);
    const section = next[sectionIndex];
    if (!section?.data || typeof section.data !== 'object') return;
    setValueAtPath(section.data, field.fieldPath, value);
    sectionsRef.current = next;
    setSections(next);
    queueRef.current.set(key, { sectionIndex, fieldPath: field.fieldPath, value, editType });
    setDirtyKeys(current => new Set(current).add(key));
    setSaveStatus('dirty');
    setSaveError(null);
    setAuditStale(true);
    persistBrowserDraft();
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushSave(); }, 900);
  }, [flushSave, persistBrowserDraft]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (queueRef.current.size > 0 || saveRunningRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const filteredSections = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sections.map((section, index) => ({ section, index }));
    return sections.map((section, index) => ({ section, index })).filter(({ section }) => {
      if (sectionLabel(section.type).toLowerCase().includes(query)) return true;
      return getEditableFields(section).some(field => field.label.toLowerCase().includes(query));
    });
  }, [search, sections]);

  const currentSection = sections[activeSection] ?? null;
  const currentFields = currentSection ? getEditableFields(currentSection) : [];
  const activeField = currentFields.find(field => field.fieldPath === activeFieldPath) ?? currentFields[0] ?? null;
  const activeValue = currentSection && activeField ? getValueAtPath(currentSection.data, activeField.fieldPath) : '';
  const activeKey = activeField ? fieldKey(activeSection, activeField.fieldPath) : '';
  const originalValue = activeKey ? originalValuesRef.current.get(activeKey) : undefined;

  useEffect(() => {
    if (currentFields.length === 0) setActiveFieldPath(null);
    else if (!currentFields.some(field => field.fieldPath === activeFieldPath)) setActiveFieldPath(currentFields[0].fieldPath);
    setAiPreview(null);
    setSelectedText('');
  }, [activeSection, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectSection = useCallback((index: number) => {
    setActiveSection(index);
    const fields = getEditableFields(sectionsRef.current[index] ?? { type: '', data: null });
    setActiveFieldPath(fields[0]?.fieldPath ?? null);
    setMobileTab('edit');
    try {
      const doc = iframeRef.current?.contentDocument;
      const type = sectionsRef.current[index]?.type;
      const target = type ? doc?.querySelector(`[data-section="${type}"], #section-${type}, .section-${type}`) as HTMLElement | null : null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch { /* preview navigation is best effort */ }
  }, []);

  const handlePreviewLoad = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const clickHandler = (event: Event) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest('[data-section], [id^="section-"], [class*="section-"]') as HTMLElement | null;
      if (!anchor) return;
      const raw = anchor.dataset.section
        || anchor.id.replace(/^section-/, '')
        || [...anchor.classList].find(name => name.startsWith('section-'))?.replace(/^section-/, '');
      if (!raw) return;
      const index = sectionsRef.current.findIndex(section => section.type.toLowerCase() === raw.toLowerCase());
      if (index >= 0) {
        event.preventDefault();
        selectSection(index);
      }
    };
    doc.addEventListener('click', clickHandler);
  }, [selectSection]);

  const undoActive = () => {
    if (!activeField || !activeKey) return;
    const stack = undoRef.current.get(activeKey) ?? [];
    if (stack.length === 0) return;
    const [previous, ...rest] = stack;
    undoRef.current.set(activeKey, rest);
    scheduleEdit(activeSection, activeField, previous, 'manual', false);
  };

  const resetActive = () => {
    if (!activeField || !activeKey) return;
    scheduleEdit(activeSection, activeField, originalValuesRef.current.get(activeKey), 'manual');
  };

  const runAiRewrite = async (instruction = aiInstruction) => {
    if (!resolvedId || !activeField || !instruction.trim()) return;
    setAiRunning(true);
    setAiPreview(null);
    try {
      const response = await fetch('/api/newsletter/editor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          action: 'ai_rewrite', id: resolvedId, sectionIndex: activeSection,
          fieldPath: activeField.fieldPath, bot: activeField.bot,
          instruction, selectedText: selectedText || undefined,
        }),
      });
      const data = await response.json() as { success?: boolean; preview?: string; provider?: string; error?: string };
      if (!response.ok || !data.success || data.preview == null) throw new Error(data.error ?? 'AI rewrite failed');
      let preview = data.preview;
      if (selectedText) {
        const full = valueText(activeValue, activeField.kind);
        const at = full.indexOf(selectedText);
        if (at >= 0) preview = `${full.slice(0, at)}${preview}${full.slice(at + selectedText.length)}`;
      }
      setAiPreview({ text: preview, provider: data.provider ?? 'unknown' });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'AI rewrite failed');
    } finally {
      setAiRunning(false);
    }
  };

  const acceptAiPreview = () => {
    if (!activeField || !aiPreview) return;
    scheduleEdit(activeSection, activeField, parseFieldValue(activeField, aiPreview.text), 'ai_rewrite_applied');
    setAiPreview(null);
    setAiInstruction('');
    setSelectedText('');
  };

  const runFactAudit = async () => {
    if (!resolvedId) return;
    await flushSave();
    setAuditRunning(true);
    try {
      const response = await fetch('/api/newsletter/fact-audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: resolvedId, season: newsletter?.season, week: newsletter?.week, runId: runInfo?.runId }),
      });
      const data = await response.json() as { audit?: FactAuditData; error?: string };
      if (!response.ok || !data.audit) throw new Error(data.error ?? 'Fact audit failed');
      setFactAudit(data.audit);
      setAuditStale(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Fact audit failed');
    } finally {
      setAuditRunning(false);
    }
  };

  const reviewClaim = async (claim: FactAuditClaim, index: number, status: 'verified' | 'dismissed' | 'open') => {
    if (!resolvedId) return;
    const key = claimKey(claim, index);
    const response = await fetch('/api/newsletter/editor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ action: 'review_claim', id: resolvedId, claimKey: key, status }),
    });
    const data = await response.json() as { success?: boolean; editorReview?: NewsletterInfo['editorReview']; updatedAt?: string };
    if (response.ok && data.success && data.editorReview) {
      setEditorReview(data.editorReview);
      if (data.updatedAt) updatedAtRef.current = data.updatedAt;
    }
  };

  const runConsistencySweep = async () => {
    if (!resolvedId || !newsletter || !sweepNote.trim()) return;
    await flushSave();
    setSweepRunning(true);
    setSweepProposals(null);
    try {
      const response = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'consistency_sweep', id: resolvedId, season: newsletter.season, week: newsletter.week, note: sweepNote }),
      });
      const data = await response.json() as { success?: boolean; proposals?: SweepProposal[]; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Consistency sweep failed');
      setSweepProposals(data.proposals ?? []);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Consistency sweep failed');
    } finally {
      setSweepRunning(false);
    }
  };

  const applySweep = (proposal: SweepProposal) => {
    const section = sectionsRef.current[proposal.sectionIndex];
    const field = section ? getEditableFields(section).find(item => item.fieldPath === proposal.fieldPath) : null;
    if (!field) return;
    scheduleEdit(proposal.sectionIndex, field, parseFieldValue(field, proposal.after), 'consistency_fix');
    setSweepProposals(current => current?.filter(item => item !== proposal) ?? null);
  };

  const createSnapshot = async () => {
    if (!resolvedId) return;
    await flushSave();
    setSnapshotRunning(true);
    try {
      const response = await fetch('/api/newsletter/editor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'create_snapshot', id: resolvedId, note: 'Manual checkpoint from Editorial Workspace' }),
      });
      const data = await response.json() as WorkspacePayload & { error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Snapshot failed');
      applyPayload(data, false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Snapshot failed');
    } finally {
      setSnapshotRunning(false);
    }
  };

  const restoreVersion = async (snapshotId: string) => {
    if (!resolvedId || !window.confirm('Restore this version? The current version will be backed up first.')) return;
    setSnapshotRunning(true);
    try {
      const response = await fetch('/api/newsletter/editor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'restore_snapshot', id: resolvedId, snapshotId }),
      });
      const data = await response.json() as WorkspacePayload & { error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Restore failed');
      applyPayload(data, true);
      setAuditStale(true);
      setShowVersions(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Restore failed');
    } finally {
      setSnapshotRunning(false);
    }
  };

  const finalizeNewsletter = async (): Promise<boolean> => {
    if (!resolvedId) return false;
    const saved = await flushSave();
    if (!saved && queueRef.current.size > 0) return false;
    try {
      const response = await fetch('/api/newsletter/editor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'finalize', id: resolvedId, note: 'Final review completed in Editorial Workspace' }),
      });
      const data = await response.json() as { success?: boolean; html?: string; updatedAt?: string; coverage?: CoverageData; error?: string };
      if (!response.ok || !data.success || data.html == null) throw new Error(data.error ?? 'Finalize failed');
      setHtml(data.html);
      onHtmlUpdate?.(data.html);
      if (data.updatedAt) updatedAtRef.current = data.updatedAt;
      if (data.coverage) setCoverage(data.coverage);
      setFinalizeResult?.({ ok: true, message: 'Final HTML rendered and a recovery version was saved.' });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Finalize failed';
      setFinalizeResult?.({ ok: false, message });
      setSaveError(message);
      return false;
    }
  };

  const publishNewsletter = async () => {
    if (!resolvedId || !newsletter) return;
    setPublishRunning(true);
    setPublishResult(null);
    const finalized = await finalizeNewsletter();
    if (!finalized) {
      setPublishRunning(false);
      return;
    }
    try {
      if (onPublish) {
        onPublish();
        setPublishResult({ ok: true, message: 'Publish request sent.' });
      } else {
        const response = await fetch('/api/newsletter/publish', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ id: resolvedId, season: newsletter.season, week: newsletter.week, sendDiscord, html }),
        });
        const data = await response.json() as { success?: boolean; message?: string; error?: string };
        if (!response.ok || data.success === false) throw new Error(data.error ?? data.message ?? 'Publish failed');
        setPublishResult({ ok: true, message: data.message ?? 'Newsletter published.' });
        await loadWorkspace(resolvedId);
      }
    } catch (error) {
      setPublishResult({ ok: false, message: error instanceof Error ? error.message : 'Publish failed' });
    } finally {
      setPublishRunning(false);
    }
  };

  const allFields = useMemo(() => sections.flatMap((section, sectionIndex) => getEditableFields(section).map(field => ({ sectionIndex, section, field }))), [sections]);
  const emptyFields = allFields.filter(({ section, field }) => {
    const value = getValueAtPath(section.data, field.fieldPath);
    return value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
  });
  const fallbackSections = runSections.filter(meta => meta.isFallback);
  const unresolvedHighRisk = (factAudit?.claims ?? []).filter((claim, index) => {
    if (claim.risk !== 'high') return false;
    if (claim.verification === 'supported' || claim.verification === 'not_applicable') return false;
    const review = editorReview.audit?.[claimKey(claim, index)]?.status;
    return review !== 'verified' && review !== 'dismissed';
  });
  const blockingWarnings = unresolvedHighRisk.length + (saveStatus === 'conflict' || saveStatus === 'error' ? 1 : 0) + emptyFields.length;

  if (loading) return <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-10 text-center text-sm text-zinc-400">Loading editorial workspace…</div>;
  if (loadError || !newsletter) return (
    <div className="rounded-xl border border-red-800 bg-red-950/30 p-6 text-sm text-red-200">
      <div className="font-semibold">Editorial workspace could not load</div>
      <div className="mt-1 text-red-300/80">{loadError ?? 'Newsletter not found'}</div>
      <Button className="mt-4" variant="secondary" size="sm" onClick={() => void loadWorkspace(resolvedId)}>Retry</Button>
    </div>
  );

  const saveStatusText = saveStatus === 'saving' ? 'Saving…'
    : saveStatus === 'dirty' ? `${dirtyKeys.size} change${dirtyKeys.size === 1 ? '' : 's'} pending`
      : saveStatus === 'error' ? 'Save failed'
        : saveStatus === 'conflict' ? 'Edit conflict'
          : 'All changes saved';

  const previewPane = (
    <div className="h-full min-h-0 flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-3 py-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Live newsletter preview</div>
          <div className="text-[10px] text-zinc-500">Updates after each automatic save. Click a rendered section to edit it.</div>
        </div>
        <button className="text-[11px] text-zinc-400 hover:text-white" onClick={() => setMobileTab('edit')}>Edit selected →</button>
      </div>
      <div className="min-h-0 flex-1 bg-white">
        <iframe ref={iframeRef} srcDoc={html} title="Live newsletter preview" sandbox="allow-same-origin" onLoad={handlePreviewLoad} className="h-full min-h-[70vh] w-full border-0" />
      </div>
    </div>
  );

  const outlinePane = (
    <div className="h-full min-h-0 flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="border-b border-zinc-800 p-3">
        <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a section or field…" className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white outline-none focus:border-blue-500" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1">
        {filteredSections.map(({ section, index }) => {
          const fields = getEditableFields(section);
          const dirty = fields.filter(field => dirtyKeys.has(fieldKey(index, field.fieldPath))).length;
          const metas = runMetaForSection(section.type, runSections);
          const fallback = metas.some(meta => meta.isFallback);
          const failed = metas.some(meta => meta.status === 'failed');
          const auditCount = (factAudit?.claims ?? []).filter(claim => sectionIndexForAudit(claim.section, sections) === index && claim.risk !== 'low').length;
          return (
            <button key={`${section.type}-${index}`} onClick={() => selectSection(index)} className={`w-full rounded-lg border px-3 py-2 text-left transition ${activeSection === index ? 'border-blue-600 bg-blue-950/40' : 'border-transparent hover:border-zinc-700 hover:bg-zinc-900'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-zinc-200">{sectionLabel(section.type)}</span>
                <span className="text-[10px] text-zinc-600">{fields.length}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[9px] uppercase tracking-wide">
                {dirty > 0 && <span className="rounded bg-amber-900/50 px-1.5 py-0.5 text-amber-300">{dirty} edited</span>}
                {fallback && <span className="rounded bg-purple-900/50 px-1.5 py-0.5 text-purple-300">fallback</span>}
                {failed && <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-red-300">failed</span>}
                {auditCount > 0 && <span className="rounded bg-orange-900/50 px-1.5 py-0.5 text-orange-300">{auditCount} audit</span>}
                {dirty === 0 && !fallback && !failed && auditCount === 0 && <span className="text-zinc-700">clean</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  const editorPane = (
    <div className="h-full min-h-0 flex flex-col rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden">
      <div className="border-b border-zinc-800 p-3">
        <div className="text-xs font-semibold text-zinc-200">{currentSection ? sectionLabel(currentSection.type) : 'Select a section'}</div>
        <select value={activeField?.fieldPath ?? ''} onChange={event => { setActiveFieldPath(event.target.value); setAiPreview(null); setSelectedText(''); }} className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs text-white">
          {currentFields.map(field => <option key={field.fieldPath} value={field.fieldPath}>{field.label}</option>)}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!activeField || !currentSection ? <div className="text-sm text-zinc-500">This section has no editable fields.</div> : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{activeField.label}</div>
                <div className="mt-0.5 text-[10px] text-zinc-600">{activeField.bot === 'entertainer' ? 'Mason voice' : activeField.bot === 'analyst' ? 'Westy voice' : 'Structured newsletter field'}</div>
              </div>
              <div className="flex gap-2 text-[10px]">
                <button onClick={undoActive} disabled={(undoRef.current.get(activeKey)?.length ?? 0) === 0} className="text-zinc-400 hover:text-white disabled:opacity-30">Undo</button>
                <button onClick={resetActive} className="text-zinc-400 hover:text-white">Reset generated</button>
              </div>
            </div>

            {activeField.kind === 'boolean' ? (
              <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm text-zinc-200">
                <input type="checkbox" checked={Boolean(activeValue)} onChange={event => scheduleEdit(activeSection, activeField, event.target.checked)} />
                Enabled
              </label>
            ) : activeField.kind === 'select' ? (
              <select value={valueText(activeValue)} onChange={event => scheduleEdit(activeSection, activeField, event.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white">
                <option value="">Select…</option>
                {(activeField.options ?? []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : activeField.kind === 'textarea' || activeField.kind === 'string-list' ? (
              <textarea
                value={valueText(activeValue, activeField.kind)}
                rows={activeField.rows ?? 6}
                onChange={event => scheduleEdit(activeSection, activeField, parseFieldValue(activeField, event.target.value))}
                onSelect={event => {
                  const target = event.currentTarget;
                  setSelectedText(target.selectionEnd > target.selectionStart ? target.value.slice(target.selectionStart, target.selectionEnd) : '');
                }}
                className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 p-3 text-sm leading-relaxed text-white outline-none focus:border-blue-500"
              />
            ) : (
              <input
                type={activeField.kind === 'number' ? 'number' : 'text'}
                value={valueText(activeValue)}
                onChange={event => scheduleEdit(activeSection, activeField, parseFieldValue(activeField, event.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              />
            )}

            <div className="flex items-center justify-between text-[10px] text-zinc-600">
              <span>{valueText(activeValue, activeField.kind).trim().split(/\s+/).filter(Boolean).length} words</span>
              {dirtyKeys.has(activeKey) ? <span className="text-amber-400">Pending automatic save</span> : <span>Saved</span>}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-300">AI editing assistant</div>
                {selectedText && <span className="max-w-[55%] truncate text-[10px] text-amber-400">Selection: “{selectedText}”</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Make this shorter', 'Add specific evidence', 'Remove repetition', activeField.bot === 'entertainer' ? 'Make Mason less exaggerated' : 'Make this more analytical'].map(instruction => (
                  <button key={instruction} onClick={() => { setAiInstruction(instruction); void runAiRewrite(instruction); }} className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-400 hover:border-zinc-500 hover:text-white">{instruction}</button>
                ))}
              </div>
              <div className="flex gap-2">
                <input value={aiInstruction} onChange={event => setAiInstruction(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void runAiRewrite(); }} placeholder={selectedText ? 'Tell AI how to rewrite the selection…' : 'Tell AI how to rewrite this field…'} className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-white outline-none focus:border-amber-500" />
                <Button size="sm" variant="secondary" disabled={aiRunning || !aiInstruction.trim()} onClick={() => void runAiRewrite()}>{aiRunning ? 'Working…' : 'Preview'}</Button>
              </div>
              {aiPreview && (
                <div className="space-y-2 rounded-lg border border-amber-800/50 bg-zinc-950 p-3">
                  <div className="flex justify-between text-[10px] uppercase tracking-wide text-amber-400"><span>Proposed change</span><span>{PROVIDER_LABELS[aiPreview.provider] ?? aiPreview.provider}</span></div>
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{renderDiff(valueText(activeValue, activeField.kind), aiPreview.text)}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={acceptAiPreview}>Accept</Button>
                    <Button size="sm" variant="ghost" onClick={() => setAiPreview(null)}>Discard</Button>
                    <Button size="sm" variant="ghost" onClick={() => void runAiRewrite(`${aiInstruction}\nRevise the previous attempt while staying closer to the original wording.`)}>Refine</Button>
                  </div>
                </div>
              )}
            </div>

            {JSON.stringify(originalValue) !== JSON.stringify(activeValue) && (
              <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                <summary className="cursor-pointer text-[11px] font-medium text-zinc-400">Compare with generated version</summary>
                <div className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">{renderDiff(valueText(originalValue, activeField.kind), valueText(activeValue, activeField.kind))}</div>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className={embedded ? 'mt-4' : 'min-h-screen bg-zinc-950 p-3 sm:p-5'}>
      <div className={embedded ? '' : 'mx-auto max-w-[1800px]'}>
        <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-base font-semibold text-white">{newsletter.title || `${newsletter.leagueName} Newsletter`}</h1>
                <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${newsletter.status === 'published' ? 'border-emerald-700 bg-emerald-950 text-emerald-300' : 'border-amber-700 bg-amber-950 text-amber-300'}`}>{newsletter.status}</span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 font-mono text-[10px] text-zinc-500" title={newsletter.id}>{shortId(newsletter.id)}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                <span>Season {newsletter.season}{newsletter.week > 0 ? ` · Week ${newsletter.week}` : ''}</span>
                <span>{newsletter.episodeType ?? 'regular'}</span>
                <span className={saveStatus === 'saved' ? 'text-emerald-400' : saveStatus === 'error' || saveStatus === 'conflict' ? 'text-red-400' : 'text-amber-400'}>{saveStatusText}</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(saveStatus === 'error' || saveStatus === 'dirty') && <Button size="sm" variant="secondary" onClick={() => void flushSave()}>Save now</Button>}
              {saveStatus === 'conflict' && <Button size="sm" variant="secondary" onClick={() => void loadWorkspace(resolvedId)}>Reload safely</Button>}
              <Button size="sm" variant="secondary" onClick={() => setShowHealth(true)}>Quality {((coverage?.warnings.length ?? 0) + unresolvedHighRisk.length) > 0 ? `(${(coverage?.warnings.length ?? 0) + unresolvedHighRisk.length})` : ''}</Button>
              <Button size="sm" variant="secondary" onClick={() => setShowVersions(true)}>Versions ({versions.length})</Button>
              <Button size="sm" variant="primary" onClick={() => setShowFinalReview(true)}>Final review</Button>
              {onClose ? <Button size="sm" variant="ghost" onClick={onClose}>Close</Button> : <Link href="/admin/newsletter"><Button size="sm" variant="ghost">Back</Button></Link>}
            </div>
          </div>
          {saveError && <div className="mt-2 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">{saveError}</div>}
          {publishResult && <div className={`mt-2 rounded-md border px-3 py-2 text-xs ${publishResult.ok ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300' : 'border-red-800 bg-red-950/40 text-red-300'}`}>{publishResult.message}</div>}
        </div>

        <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 lg:hidden">
          {(['outline', 'preview', 'edit'] as const).map(tab => <button key={tab} onClick={() => setMobileTab(tab)} className={`rounded px-3 py-2 text-xs capitalize ${mobileTab === tab ? 'bg-zinc-700 text-white' : 'text-zinc-500'}`}>{tab}</button>)}
        </div>

        <div className="hidden h-[calc(100vh-150px)] min-h-[650px] grid-cols-[250px_minmax(420px,1.15fr)_minmax(360px,0.85fr)] gap-3 lg:grid">
          {outlinePane}
          {previewPane}
          {editorPane}
        </div>
        <div className="min-h-[72vh] lg:hidden">
          {mobileTab === 'outline' ? outlinePane : mobileTab === 'preview' ? previewPane : editorPane}
        </div>
      </div>

      {showHealth && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onMouseDown={event => { if (event.currentTarget === event.target) setShowHealth(false); }}>
          <div className="h-full w-full max-w-2xl overflow-y-auto border-l border-zinc-700 bg-zinc-950 p-5">
            <div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-white">Quality review</h2><button className="text-zinc-500 hover:text-white" onClick={() => setShowHealth(false)}>Close</button></div>

            <section className="mt-5 space-y-3">
              <div className="flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Fact audit</h3><Button size="sm" variant="secondary" disabled={auditRunning} onClick={() => void runFactAudit()}>{auditRunning ? 'Auditing…' : auditStale ? 'Rerun after edits' : 'Run audit'}</Button></div>
              {auditStale && <div className="rounded border border-amber-800 bg-amber-950/30 p-2 text-xs text-amber-300">The displayed audit predates the latest edits.</div>}
              {!factAudit && <div className="text-xs text-zinc-500">No audit has been run.</div>}
              {factAudit?.error && <div className="text-xs text-red-400">{factAudit.error}</div>}
              <div className="space-y-2">
                {(factAudit?.claims ?? []).filter(claim => claim.risk !== 'low').map((claim, index) => {
                  const key = claimKey(claim, index);
                  const review = editorReview.audit?.[key]?.status ?? 'open';
                  return (
                    <div key={key} className={`rounded-lg border p-3 ${review === 'verified' ? 'border-emerald-800 bg-emerald-950/20' : review === 'dismissed' ? 'border-zinc-800 bg-zinc-900/30 opacity-70' : claim.risk === 'high' ? 'border-red-800 bg-red-950/20' : 'border-amber-800 bg-amber-950/20'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-wide">
                        <span className={claim.risk === 'high' ? 'text-red-300' : 'text-amber-300'}>{claim.risk} · {claim.type} · {claim.verification ?? 'unverified'}</span>
                        <button className="text-blue-400 hover:text-blue-300" onClick={() => { const indexToOpen = sectionIndexForAudit(claim.section, sections); if (indexToOpen >= 0) selectSection(indexToOpen); setShowHealth(false); }}>Jump to section</button>
                      </div>
                      <div className="mt-1 text-xs text-zinc-200">“{claim.claim}”</div>
                      {claim.reason && <div className="mt-1 text-[11px] text-zinc-500">{claim.reason}</div>}
                      {claim.evidence && <div className="mt-2 rounded bg-zinc-900 p-2 text-[11px] text-zinc-400"><span className="font-medium text-zinc-300">Source evidence:</span> {claim.evidence}</div>}
                      {(claim.unsupportedNumbers?.length || claim.unsupportedEntities?.length) && <div className="mt-1 text-[10px] text-zinc-500">Unsupported: {[...(claim.unsupportedNumbers ?? []), ...(claim.unsupportedEntities ?? [])].join(', ')}</div>}
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => void reviewClaim(claim, index, 'verified')} className="text-[11px] text-emerald-400 hover:text-emerald-300">Mark verified by editor</button>
                        <button onClick={() => void reviewClaim(claim, index, 'dismissed')} className="text-[11px] text-zinc-400 hover:text-white">Dismiss as opinion/acceptable</button>
                        {review !== 'open' && <button onClick={() => void reviewClaim(claim, index, 'open')} className="text-[11px] text-amber-400">Reopen</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-7 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Coverage after current edits</h3>
              {(coverage?.warnings ?? []).length === 0 ? <div className="text-xs text-emerald-400">No coverage or repetition warnings.</div> : coverage?.warnings.map((warning, index) => <div key={index} className="rounded border border-amber-800/50 bg-amber-950/20 p-2 text-xs text-amber-200">{warning}</div>)}
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {(coverage?.teams ?? []).map(team => <div key={team.team} className="flex items-center justify-between rounded border border-zinc-800 px-2 py-1.5 text-[11px]"><span className="text-zinc-300">{team.team}</span><span className={team.coverage === 'substantive' ? 'text-emerald-400' : team.coverage === 'passing' ? 'text-blue-400' : team.coverage === 'factual_only' ? 'text-amber-400' : 'text-red-400'}>{team.coverage.replace('_', ' ')}</span></div>)}
              </div>
            </section>

            <section className="mt-7 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-300">Consistency correction</h3>
              <p className="text-xs text-zinc-500">Describe one factual correction. The system will scan every section and propose only matching changes.</p>
              <div className="flex gap-2"><input value={sweepNote} onChange={event => setSweepNote(event.target.value)} placeholder="e.g. The Badgers received the pick; they did not send it" className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-white" /><Button size="sm" variant="secondary" disabled={sweepRunning || !sweepNote.trim()} onClick={() => void runConsistencySweep()}>{sweepRunning ? 'Scanning…' : 'Scan'}</Button></div>
              {sweepProposals && sweepProposals.length === 0 && <div className="text-xs text-emerald-400">No contradictions found.</div>}
              {sweepProposals?.map((proposal, index) => <div key={`${proposal.fieldPath}-${index}`} className="rounded border border-zinc-800 p-3"><div className="flex justify-between gap-2 text-xs"><span className="font-medium text-zinc-300">{proposal.label}</span><button className="text-emerald-400" onClick={() => applySweep(proposal)}>Apply</button></div><div className="mt-1 text-[10px] text-zinc-500">{proposal.reason}</div><div className="mt-2 text-xs text-zinc-400">{renderDiff(proposal.before, proposal.after)}</div></div>)}
              {(sweepProposals?.length ?? 0) > 1 && <Button size="sm" variant="primary" onClick={() => { sweepProposals?.forEach(applySweep); setSweepProposals([]); }}>Apply all proposals</Button>}
            </section>
          </div>
        </div>
      )}

      {showVersions && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onMouseDown={event => { if (event.currentTarget === event.target) setShowVersions(false); }}>
          <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Version history</h2><p className="text-xs text-zinc-500">Every restore first creates a backup of the current version.</p></div><button className="text-zinc-500 hover:text-white" onClick={() => setShowVersions(false)}>Close</button></div>
            <div className="mt-4 flex justify-end"><Button size="sm" variant="secondary" disabled={snapshotRunning} onClick={() => void createSnapshot()}>{snapshotRunning ? 'Saving…' : 'Create checkpoint'}</Button></div>
            <div className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
              {versions.length === 0 && <div className="py-6 text-center text-sm text-zinc-500">No saved versions yet.</div>}
              {versions.map(version => <div key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 p-3"><div><div className="text-xs font-medium text-zinc-300">{version.actionType.replace('_', ' ')}</div><div className="mt-0.5 text-[10px] text-zinc-500">{new Date(version.createdAt).toLocaleString()} · {version.note?.replace(`newsletter:${newsletter.id}:`, '') || 'No note'}</div></div><Button size="sm" variant="ghost" disabled={snapshotRunning} onClick={() => void restoreVersion(version.id)}>Restore</Button></div>)}
            </div>
          </div>
        </div>
      )}

      {showFinalReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onMouseDown={event => { if (event.currentTarget === event.target) setShowFinalReview(false); }}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-950 p-5 shadow-2xl">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-semibold text-white">Final publish review</h2><p className="text-xs text-zinc-500">Exact issue {shortId(newsletter.id)} · {newsletter.title || 'Untitled newsletter'}</p></div><button className="text-zinc-500 hover:text-white" onClick={() => setShowFinalReview(false)}>Close</button></div>
            <div className="mt-5 space-y-2">
              {[
                { ok: saveStatus === 'saved' && queueRef.current.size === 0, label: 'All editor changes are saved' },
                { ok: Boolean(html), label: 'Rendered preview is available' },
                { ok: Boolean(factAudit) && !auditStale, label: 'Fact audit was run after the latest edit', warning: true },
                { ok: unresolvedHighRisk.length === 0, label: `${unresolvedHighRisk.length} unresolved high-risk factual claim${unresolvedHighRisk.length === 1 ? '' : 's'}` },
                { ok: emptyFields.length === 0, label: `${emptyFields.length} empty visible field${emptyFields.length === 1 ? '' : 's'}` },
                { ok: fallbackSections.length === 0, label: `${fallbackSections.length} section step${fallbackSections.length === 1 ? '' : 's'} written by fallback providers`, warning: true },
                { ok: (coverage?.warnings.length ?? 0) === 0, label: `${coverage?.warnings.length ?? 0} coverage or repetition warning${coverage?.warnings.length === 1 ? '' : 's'}`, warning: true },
                { ok: Boolean(webhookHealth?.configured && webhookHealth?.reachable), label: webhookHealth?.message || 'Discord webhook status unavailable', warning: !sendDiscord },
              ].map((item, index) => <div key={index} className={`flex items-center gap-3 rounded-lg border p-3 text-xs ${item.ok ? 'border-emerald-900 bg-emerald-950/20 text-emerald-300' : item.warning ? 'border-amber-900 bg-amber-950/20 text-amber-300' : 'border-red-900 bg-red-950/20 text-red-300'}`}><span className="text-base">{item.ok ? '✓' : item.warning ? '!' : '×'}</span><span>{item.label}</span></div>)}
            </div>
            <label className="mt-4 flex items-center gap-2 text-xs text-zinc-300"><input type="checkbox" checked={sendDiscord} onChange={event => setSendDiscord(event.target.checked)} /> Announce this issue in Discord after publishing</label>
            {blockingWarnings > 0 && <label className="mt-3 flex items-start gap-2 rounded border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-200"><input className="mt-0.5" type="checkbox" checked={overrideWarnings} onChange={event => setOverrideWarnings(event.target.checked)} /><span>I reviewed the unresolved items and am intentionally overriding the warnings. Manual editorial verification remains authoritative.</span></label>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => void finalizeNewsletter()}>Finalize without publishing</Button>
              <Button variant="primary" disabled={publishRunning || parentPublishing || (blockingWarnings > 0 && !overrideWarnings)} onClick={() => void publishNewsletter()}>{publishRunning || parentPublishing ? 'Publishing…' : sendDiscord ? 'Publish + Discord' : 'Publish'}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
