'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { getValueAtPath } from '@/lib/newsletter/field-path';
import type { EditableFieldDef } from '@/lib/newsletter/editable-fields';

type Mode = 'edit' | 'review' | 'versions';
type Pane = 'outline' | 'edit' | 'preview';
type SaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';
type Section = { type: string; data: unknown };
type RunSection = { sectionName: string; status: string; provider: string | null; isFallback: boolean; error?: string | null };
type FactClaim = {
  key: string; section: string; claim: string; type: string; risk: 'high' | 'medium' | 'low';
  reason: string; verification: 'supported' | 'contradicted' | 'unverified' | 'not_applicable';
  evidence?: string; unsupportedNumbers?: string[]; unsupportedEntities?: string[];
  resolution: 'open' | 'verified_by_editor' | 'dismissed';
};
type FactAudit = {
  claims: FactClaim[]; highRiskCount: number; mediumRiskCount: number; supportedCount: number;
  contradictedCount: number; unverifiedCount: number; generatedAt: string; model: string; error?: string;
};
type Coverage = {
  teams: Array<{ team: string; mentions: number; analyticalMentions: number; analysisScore: number; coverage: 'substantive' | 'passing' | 'factual_only' | 'omitted' }>;
  omittedTeams: string[]; factualOnlyTeams: string[];
  repetition: Array<{ phrase: string; sections: string[] }>;
  warnings: string[]; generatedAt: string;
};
type HistoryItem = {
  at: string; sectionIndex: number; sectionType: string; fieldPath: string; label: string;
  source: 'manual' | 'ai' | 'consistency' | 'restore'; before: string; after: string;
};
type EditorMeta = {
  version: number; baseline: Record<string, string>; history: HistoryItem[];
  lastSavedAt?: string; lastAuditAt?: string; lastAuditVersion?: number;
};
type Payload = {
  success: true;
  newsletter: {
    id: string; title: string | null; season: number; week: number; episodeType: string | null;
    status: 'draft' | 'published'; generatedAt: string; updatedAt: string; publishedAt: string | null;
    discordPostedAt: string | null; html: string; editor: EditorMeta;
    content: { meta: Record<string, unknown>; sections: Section[]; _editor?: EditorMeta };
  };
  fieldsBySection: Array<{ sectionIndex: number; type: string; fields: EditableFieldDef[]; providers: RunSection[] }>;
  run: null | { runId: string; status: string; warnings: string[]; factAudit: FactAudit | null };
  coverage: Coverage;
  snapshots: Array<{ id: string; actionType: string; note: string | null; createdAt: string }>;
  checklist: {
    exactNewsletterId: string; titlePresent: boolean; renderReady: boolean; auditCurrent: boolean;
    unresolvedHighRisk: number; factualOnlyTeams: string[]; omittedTeams: string[];
    repetitionWarnings: number; fallbackSections: string[]; failedSections: string[];
    emptyFields: Array<{ sectionIndex: number; sectionType: string; fieldPath: string; label: string }>;
    publishReady: boolean;
  };
};
type PendingEdit = { sectionIndex: number; fieldPath: string; value: unknown; source: 'manual' | 'ai' | 'consistency' };

export interface EditorialWorkspaceProps {
  newsletterId?: string | null;
  season?: string | number;
  week?: string | number;
  initialHtml?: string | null;
  embedded?: boolean;
  onHtmlUpdate?: (html: string) => void;
  onClose?: () => void;
  onPublished?: (message: string) => void;
}

const LABELS: Record<string, string> = {
  Intro: 'Intro', FinalWord: 'Final Word', WaiversAndFA: 'Waivers & Free Agency', PowerRankings: 'Power Rankings',
  SeasonPreview: 'Season Preview', SpotlightTeam: 'Spotlight', Blurt: 'Blurt', Forecast: 'Forecast',
  PredictionCallbacks: 'Prediction Callbacks', ClancyInsert: 'Clancy', Trades: 'Trades', MatchupRecaps: 'Matchup Recaps',
  MockDraft: 'Mock Draft', DraftGrades: 'Draft Grades', WeeklyAwards: 'Weekly Awards', PlayoffOdds: 'Playoff Odds',
};

function label(type: string): string { return LABELS[type] ?? type.replace(/([a-z])([A-Z])/g, '$1 $2'); }
function fieldKey(sectionIndex: number, fieldPath: string): string { return `${sectionIndex}::${fieldPath}`; }
function asText(value: unknown): string { return value == null ? '' : String(value); }
function fmt(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function words(value: string): number { return value.trim() ? value.trim().split(/\s+/).length : 0; }

function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls = tone === 'good' ? 'border-emerald-700 text-emerald-300' : tone === 'warn' ? 'border-amber-700 text-amber-300' : tone === 'bad' ? 'border-red-700 text-red-300' : 'border-zinc-700 text-zinc-400';
  return <span className={`text-[10px] rounded border px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

function ProviderBadges({ items }: { items: RunSection[] }) {
  const providers = [...new Set(items.map(item => item.provider).filter((value): value is string => Boolean(value)))];
  if (!providers.length && !items.some(item => item.isFallback || item.status === 'failed')) return null;
  return <span className="flex gap-1 flex-wrap">{providers.map(provider => <Badge key={provider}>{provider}</Badge>)}{items.some(item => item.isFallback) && <Badge tone="warn">fallback</Badge>}{items.some(item => item.status === 'failed') && <Badge tone="bad">failed</Badge>}</span>;
}

export default function EditorialWorkspace({ newsletterId, season, week, initialHtml, embedded = false, onHtmlUpdate, onClose, onPublished }: EditorialWorkspaceProps) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('edit');
  const [pane, setPane] = useState<Pane>('edit');
  const [sectionIndex, setSectionIndex] = useState(0);
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  const [auditRunning, setAuditRunning] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [showPublish, setShowPublish] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [discordReady, setDiscordReady] = useState<boolean | null>(null);

  const pending = useRef<Map<string, PendingEdit>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef<Payload | null>(null);
  useEffect(() => { latest.current = payload; }, [payload]);

  const endpoint = useMemo(() => newsletterId
    ? `/api/newsletter/editor?id=${encodeURIComponent(newsletterId)}`
    : `/api/newsletter/editor?season=${encodeURIComponent(String(season ?? ''))}&week=${encodeURIComponent(String(week ?? ''))}`,
  [newsletterId, season, week]);

  const values = useCallback((data: Payload) => {
    const next: Record<string, string> = {};
    for (const info of data.fieldsBySection) {
      const section = data.newsletter.content.sections[info.sectionIndex];
      for (const field of info.fields) next[fieldKey(info.sectionIndex, field.fieldPath)] = asText(getValueAtPath(section?.data, field.fieldPath));
    }
    return next;
  }, []);

  const applyPayload = useCallback((data: Payload, preserveDrafts = false) => {
    setPayload(data);
    setTitleDraft(data.newsletter.title ?? '');
    if (!preserveDrafts) setDrafts(values(data));
    onHtmlUpdate?.(data.newsletter.html);
  }, [onHtmlUpdate, values]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await fetch(endpoint, { cache: 'no-store', credentials: 'include' });
      const data = await response.json() as Payload & { error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'Unable to load editorial workspace');
      const storageKey = `evw_editor_${data.newsletter.id}`;
      let restored: Record<string, string> | null = null;
      try { const raw = localStorage.getItem(storageKey); if (raw) restored = JSON.parse(raw) as Record<string, string>; } catch { /* ignore */ }
      applyPayload(data);
      if (restored) setDrafts(current => ({ ...current, ...restored }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load editorial workspace');
    } finally { setLoading(false); }
  }, [applyPayload, endpoint]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetch('/api/newsletter/publish', { cache: 'no-store', credentials: 'include' })
      .then(response => response.json().then(data => ({ ok: response.ok, data })))
      .then(({ ok, data }) => setDiscordReady(ok && Boolean(data.configured && data.reachable)))
      .catch(() => setDiscordReady(false));
  }, []);
  useEffect(() => {
    if (!payload) return;
    try { localStorage.setItem(`evw_editor_${payload.newsletter.id}`, JSON.stringify(drafts)); } catch { /* ignore */ }
  }, [drafts, payload]);

  const saveQueued = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      chain.current = chain.current.then(async () => {
        const current = latest.current;
        if (!current || pending.current.size === 0) return;
        const edits = [...pending.current.values()];
        pending.current.clear();
        setSaveState('saving'); setSaveError(null);
        try {
          const response = await fetch('/api/newsletter/editor', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
            body: JSON.stringify({ action: 'save_batch', id: current.newsletter.id, expectedUpdatedAt: current.newsletter.updatedAt, edits }),
          });
          const data = await response.json() as Payload & { error?: string; conflict?: boolean };
          if (response.status === 409 || data.conflict) {
            edits.forEach(edit => pending.current.set(fieldKey(edit.sectionIndex, edit.fieldPath), edit));
            setSaveState('conflict'); setSaveError(data.error ?? 'This issue changed in another session.'); return;
          }
          if (!response.ok || !data.success) throw new Error(data.error ?? 'Save failed');
          applyPayload(data);
          setSaveState('saved');
          try { localStorage.removeItem(`evw_editor_${data.newsletter.id}`); } catch { /* ignore */ }
        } catch (saveFailure) {
          edits.forEach(edit => pending.current.set(fieldKey(edit.sectionIndex, edit.fieldPath), edit));
          setSaveState('error'); setSaveError(saveFailure instanceof Error ? saveFailure.message : 'Save failed');
        }
      });
    }, 700);
  }, [applyPayload]);

  const change = (index: number, field: EditableFieldDef, value: string, source: PendingEdit['source'] = 'manual') => {
    const key = fieldKey(index, field.fieldPath);
    setDrafts(previous => ({ ...previous, [key]: value }));
    pending.current.set(key, { sectionIndex: index, fieldPath: field.fieldPath, value, source });
    setSaveState('idle');
    saveQueued();
  };

  const reloadAfterConflict = async () => { pending.current.clear(); setSaveState('idle'); await load(); };

  const post = async (body: Record<string, unknown>, actionName: string) => {
    if (!payload) return null;
    setAction(actionName); setError(null);
    try {
      await chain.current;
      const response = await fetch('/api/newsletter/editor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: payload.newsletter.id, ...body }),
      });
      const data = await response.json() as Payload & { error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? `${actionName} failed`);
      applyPayload(data);
      return data;
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : `${actionName} failed`);
      return null;
    } finally { setAction(null); }
  };

  const activeInfo = payload?.fieldsBySection.find(info => info.sectionIndex === sectionIndex) ?? null;
  const activeSection = payload?.newsletter.content.sections[sectionIndex] ?? null;
  const activeDefinition = activeField && activeInfo ? activeInfo.fields.find(field => fieldKey(sectionIndex, field.fieldPath) === activeField) ?? null : null;

  const askAi = async (instruction = aiInstruction) => {
    if (!payload || !activeDefinition || !instruction.trim()) return;
    setAiRunning(true); setAiPreview(null); setAiProvider(null); setError(null);
    try {
      const response = await fetch('/api/newsletter/editor', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action: 'ai_rewrite', id: payload.newsletter.id, sectionIndex, fieldPath: activeDefinition.fieldPath, instruction }),
      });
      const data = await response.json() as { success?: boolean; preview?: string; provider?: string; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error ?? 'AI rewrite failed');
      setAiPreview(data.preview ?? ''); setAiProvider(data.provider ?? null);
    } catch (aiError) { setError(aiError instanceof Error ? aiError.message : 'AI rewrite failed'); }
    finally { setAiRunning(false); }
  };

  const acceptAi = () => {
    if (!activeDefinition || aiPreview == null) return;
    change(sectionIndex, activeDefinition, aiPreview, 'ai');
    setAiPreview(null); setAiInstruction('');
  };

  const rename = async () => {
    if (!titleDraft.trim()) return;
    const data = await post({ action: 'rename', title: titleDraft }, 'rename');
    if (data) setEditingTitle(false);
  };

  const publish = async (sendDiscord: boolean) => {
    if (!payload) return;
    setAction('publish'); setPublishResult(null);
    try {
      await chain.current;
      const response = await fetch('/api/newsletter/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: payload.newsletter.id, season: payload.newsletter.season, week: payload.newsletter.week, sendDiscord, html: payload.newsletter.html }),
      });
      const data = await response.json() as { success?: boolean; message?: string; error?: string };
      if (!response.ok || data.success === false) throw new Error(data.error ?? data.message ?? 'Publish failed');
      const message = data.message ?? 'Newsletter published.';
      setPublishResult(message); setShowPublish(false); onPublished?.(message); await load();
    } catch (publishError) { setPublishResult(publishError instanceof Error ? publishError.message : 'Publish failed'); }
    finally { setAction(null); }
  };

  const sectionClaims = useMemo(() => {
    const map = new Map<string, number>();
    for (const claim of payload?.run?.factAudit?.claims ?? []) {
      if (claim.resolution !== 'open') continue;
      map.set(claim.section, (map.get(claim.section) ?? 0) + 1);
    }
    return map;
  }, [payload]);

  if (loading) return <Card><CardContent className="py-12 text-center text-zinc-500">Loading editorial workspace…</CardContent></Card>;
  if (!payload || error && !payload) return <Card><CardContent className="py-10 text-center"><div className="text-red-300 mb-3">{error ?? 'Newsletter unavailable'}</div><Button variant="secondary" onClick={() => void load()}>Retry</Button></CardContent></Card>;

  const filtered = payload.fieldsBySection.filter(info => {
    const query = search.trim().toLowerCase();
    return !query || label(info.type).toLowerCase().includes(query) || info.fields.some(field => field.label.toLowerCase().includes(query));
  });
  const saveText = saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'All changes saved' : saveState === 'conflict' ? 'Save conflict' : saveState === 'error' ? 'Save failed' : pending.current.size ? 'Changes pending' : 'All changes saved';
  const saveTone = saveState === 'conflict' || saveState === 'error' ? 'bad' : saveState === 'saving' || pending.current.size ? 'warn' : 'good';

  return <div className={embedded ? 'mt-4' : ''}>
    {showPublish && <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="w-full max-w-xl rounded-xl border border-zinc-700 bg-zinc-950 p-5 space-y-4">
        <div><h2 className="text-lg font-semibold text-white">Publish exact newsletter</h2><p className="text-xs text-zinc-500 font-mono mt-1">{payload.newsletter.id}</p></div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="border border-zinc-800 rounded p-2">Title <span className={payload.checklist.titlePresent ? 'text-emerald-400' : 'text-red-400'}>{payload.checklist.titlePresent ? 'ready' : 'missing'}</span></div>
          <div className="border border-zinc-800 rounded p-2">Audit <span className={payload.checklist.auditCurrent ? 'text-emerald-400' : 'text-amber-400'}>{payload.checklist.auditCurrent ? 'current' : 'stale/not run'}</span></div>
          <div className="border border-zinc-800 rounded p-2">High-risk open <span className={payload.checklist.unresolvedHighRisk ? 'text-red-400' : 'text-emerald-400'}>{payload.checklist.unresolvedHighRisk}</span></div>
          <div className="border border-zinc-800 rounded p-2">Discord <span className={discordReady ? 'text-emerald-400' : 'text-amber-400'}>{discordReady ? 'ready' : 'not ready'}</span></div>
        </div>
        {!payload.checklist.publishReady && <p className="text-xs text-amber-300">Warnings may be overridden because the human editor is authoritative. Review them before publishing.</p>}
        <div className="flex gap-2 flex-wrap justify-end"><Button variant="ghost" onClick={() => setShowPublish(false)}>Cancel</Button><Button variant="secondary" disabled={action === 'publish'} onClick={() => void publish(false)}>Publish without Discord</Button><Button variant="primary" disabled={action === 'publish'} onClick={() => void publish(true)}>Publish + Discord</Button></div>
      </div>
    </div>}

    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            {editingTitle ? <div className="flex gap-2"><input autoFocus className="w-full max-w-2xl bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-white" value={titleDraft} maxLength={200} onChange={event => setTitleDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void rename(); if (event.key === 'Escape') setEditingTitle(false); }} /><Button size="sm" onClick={() => void rename()}>Save</Button></div>
              : <div className="flex items-center gap-2"><CardTitle className="text-base truncate">{payload.newsletter.title || `${label(payload.newsletter.episodeType ?? 'Newsletter')} — ${payload.newsletter.season}`}</CardTitle><button className="text-xs text-zinc-500 hover:text-zinc-300" onClick={() => setEditingTitle(true)}>Rename</button></div>}
            <div className="flex gap-2 flex-wrap mt-1 text-[10px] text-zinc-500"><span>{payload.newsletter.status}</span><span>S{payload.newsletter.season} W{payload.newsletter.week}</span><span>Updated {fmt(payload.newsletter.updatedAt)}</span><span className="font-mono">{payload.newsletter.id}</span><Badge tone={saveTone}>{saveText}</Badge></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {embedded && onClose && <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>}
            {!embedded && <Link href="/admin/newsletter"><Button size="sm" variant="ghost">Back</Button></Link>}
            <Button size="sm" variant="secondary" onClick={() => void post({ action: 'snapshot', note: 'Manual editorial checkpoint' }, 'snapshot')} disabled={action === 'snapshot'}>Checkpoint</Button>
            <Button size="sm" variant="primary" onClick={() => setShowPublish(true)}>Final review & publish</Button>
          </div>
        </div>
        {(error || saveError || publishResult) && <div className={`mt-2 rounded px-3 py-2 text-xs ${error || saveError ? 'bg-red-950/40 text-red-300' : 'bg-emerald-950/40 text-emerald-300'}`}>{error || saveError || publishResult}{saveState === 'conflict' && <button className="ml-2 underline" onClick={() => void reloadAfterConflict()}>Reload latest</button>}</div>}
        <div className="mt-3 flex gap-1 border-b border-zinc-800">
          {(['edit', 'review', 'versions'] as Mode[]).map(item => <button key={item} className={`px-3 py-2 text-xs capitalize border-b-2 ${mode === item ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500'}`} onClick={() => setMode(item)}>{item}{item === 'review' && payload.checklist.unresolvedHighRisk > 0 ? ` (${payload.checklist.unresolvedHighRisk})` : ''}</button>)}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {mode === 'edit' && <>
          <div className="lg:hidden grid grid-cols-3 border-b border-zinc-800">{(['outline', 'edit', 'preview'] as Pane[]).map(item => <button key={item} className={`py-2 text-xs capitalize ${pane === item ? 'text-white bg-zinc-800' : 'text-zinc-500'}`} onClick={() => setPane(item)}>{item}</button>)}</div>
          <div className="lg:grid lg:grid-cols-[260px_minmax(380px,1fr)_minmax(420px,1fr)] min-h-[72vh]">
            <aside className={`${pane === 'outline' ? 'block' : 'hidden'} lg:block border-r border-zinc-800 p-3 overflow-y-auto max-h-[78vh]`}>
              <input className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-2 text-xs text-white mb-3" placeholder="Search sections or fields…" value={search} onChange={event => setSearch(event.target.value)} />
              <div className="space-y-1">{filtered.map(info => {
                const openClaims = sectionClaims.get(info.type) ?? 0;
                return <button key={info.sectionIndex} onClick={() => { setSectionIndex(info.sectionIndex); setPane('edit'); setActiveField(null); setAiPreview(null); }} className={`w-full rounded border p-2 text-left ${sectionIndex === info.sectionIndex ? 'border-blue-600 bg-blue-950/30' : 'border-zinc-800 hover:bg-zinc-900'}`}>
                  <div className="flex justify-between gap-2"><span className="text-xs text-zinc-200">{label(info.type)}</span><span className="text-[10px] text-zinc-600">{info.fields.length}</span></div>
                  <div className="mt-1 flex gap-1 flex-wrap"><ProviderBadges items={info.providers} />{openClaims > 0 && <Badge tone="bad">{openClaims} audit</Badge>}</div>
                </button>;
              })}</div>
            </aside>

            <main className={`${pane === 'edit' ? 'block' : 'hidden'} lg:block p-3 sm:p-4 overflow-y-auto max-h-[78vh]`}>
              {!activeInfo || !activeSection ? <div className="text-zinc-500">No editable section selected.</div> : <div>
                <div className="flex items-center justify-between gap-2 mb-4"><div><h2 className="text-lg font-semibold text-white">{label(activeInfo.type)}</h2><ProviderBadges items={activeInfo.providers} /></div><span className="text-[10px] text-zinc-600">Live preview updates after autosave</span></div>
                <div className="space-y-4">{activeInfo.fields.map(field => {
                  const key = fieldKey(sectionIndex, field.fieldPath);
                  const current = drafts[key] ?? '';
                  const generated = payload.newsletter.editor.baseline[key] ?? asText(getValueAtPath(activeSection.data, field.fieldPath));
                  const changed = current !== generated;
                  const selected = activeField === key;
                  const common = { value: current, onFocus: () => setActiveField(key), onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => change(sectionIndex, field, event.target.value) };
                  return <div key={field.fieldPath} className={`rounded-lg border p-3 ${selected ? 'border-blue-700 bg-blue-950/10' : 'border-zinc-800'}`}>
                    <div className="flex justify-between gap-3 mb-2"><div><div className="text-xs font-semibold text-zinc-300">{field.label}</div>{field.group && <div className="text-[10px] text-zinc-600">{field.group}</div>}</div><div className="flex gap-2 text-[10px] text-zinc-600"><span>{words(current)} words</span>{changed && <button className="text-amber-400" onClick={() => change(sectionIndex, field, generated)}>Reset to generated</button>}</div></div>
                    {field.kind === 'select' ? <select {...common} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white">{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                      : field.kind === 'textarea' || !field.kind ? <textarea {...common} rows={Math.max(4, Math.min(12, Math.ceil(current.length / 90)))} className="w-full bg-zinc-950 border border-zinc-700 rounded p-3 text-sm text-zinc-100 leading-relaxed resize-y" />
                      : <input {...common} type={field.kind === 'number' ? 'number' : 'text'} className="w-full bg-zinc-950 border border-zinc-700 rounded p-2 text-sm text-white" />}
                    {changed && <details className="mt-2"><summary className="text-[10px] text-blue-400 cursor-pointer">Compare with generated version</summary><div className="grid sm:grid-cols-2 gap-2 mt-2 text-[11px]"><div className="rounded bg-red-950/20 border border-red-900 p-2 whitespace-pre-wrap"><div className="text-red-400 mb-1">Generated</div>{generated}</div><div className="rounded bg-emerald-950/20 border border-emerald-900 p-2 whitespace-pre-wrap"><div className="text-emerald-400 mb-1">Current</div>{current}</div></div></details>}
                    {field.aiEnabled !== false && selected && <div className="mt-3 border-t border-zinc-800 pt-3 space-y-2">
                      <div className="flex gap-1 flex-wrap">{['Make shorter', 'Add specific evidence', 'Make more analytical', field.bot === 'entertainer' ? 'Reduce exaggeration' : 'Make conclusion clearer', 'Remove repetition'].map(prompt => <button key={prompt} className="text-[10px] border border-zinc-700 rounded px-2 py-1 text-zinc-400 hover:text-white" onClick={() => { setAiInstruction(prompt); void askAi(prompt); }}>{prompt}</button>)}</div>
                      <div className="flex gap-2"><input className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-2 text-xs text-white" placeholder="Tell the editor how to rewrite this field…" value={aiInstruction} onChange={event => setAiInstruction(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void askAi(); }} /><Button size="sm" variant="secondary" disabled={aiRunning || !aiInstruction.trim()} onClick={() => void askAi()}>{aiRunning ? 'Rewriting…' : 'Ask AI'}</Button></div>
                      {aiPreview != null && <div className="rounded border border-amber-800 bg-amber-950/10 p-3"><div className="flex justify-between text-[10px] text-amber-300 mb-2"><span>AI preview</span><span>{aiProvider}</span></div><div className="text-xs text-zinc-200 whitespace-pre-wrap">{aiPreview}</div><div className="flex gap-2 mt-3"><Button size="sm" onClick={acceptAi}>Accept</Button><Button size="sm" variant="secondary" onClick={() => void askAi()}>Try again</Button><Button size="sm" variant="ghost" onClick={() => setAiPreview(null)}>Discard</Button></div></div>}
                    </div>}
                  </div>;
                })}</div>
              </div>}
            </main>

            <section className={`${pane === 'preview' ? 'block' : 'hidden'} lg:block border-l border-zinc-800 p-3`}>
              <div className="sticky top-3"><div className="flex justify-between mb-2"><span className="text-xs text-zinc-500 uppercase tracking-wide">Rendered preview</span><span className="text-[10px] text-zinc-600">{saveState === 'saving' ? 'updating…' : 'current saved version'}</span></div><div className="bg-white rounded border border-zinc-700 overflow-hidden h-[72vh]"><iframe title="Newsletter preview" srcDoc={payload.newsletter.html || initialHtml || ''} sandbox="allow-same-origin" className="w-full h-full" /></div></div>
            </section>
          </div>
        </>}

        {mode === 'review' && <div className="p-4 sm:p-6 space-y-5">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-zinc-800 p-4"><h3 className="text-sm font-semibold text-white mb-3">Publish checklist</h3><div className="space-y-2 text-xs">
              {[
                ['Exact issue selected', true, payload.newsletter.id], ['Title', payload.checklist.titlePresent, payload.newsletter.title || 'Missing'],
                ['Rendered preview', payload.checklist.renderReady, payload.checklist.renderReady ? 'Ready' : 'Missing'],
                ['Audit after latest edit', payload.checklist.auditCurrent, payload.checklist.auditCurrent ? 'Current' : 'Stale or not run'],
                ['High-risk unresolved', payload.checklist.unresolvedHighRisk === 0, String(payload.checklist.unresolvedHighRisk)],
                ['Failed generation sections', payload.checklist.failedSections.length === 0, payload.checklist.failedSections.join(', ') || 'None'],
              ].map(([name, ok, detail]) => <div key={String(name)} className="flex justify-between gap-3 border-b border-zinc-800 pb-2"><span className="text-zinc-400">{name}</span><span className={ok ? 'text-emerald-400' : 'text-amber-400'}>{detail}</span></div>)}
            </div>
            <div className="rounded-lg border border-zinc-800 p-4"><h3 className="text-sm font-semibold text-white mb-3">Generation health</h3><div className="text-xs text-zinc-400 mb-2">Run: {payload.run?.status ?? 'No run metadata'}</div>{payload.checklist.fallbackSections.length > 0 && <div className="text-xs text-amber-300 mb-2">Fallback-written: {payload.checklist.fallbackSections.join(', ')}</div>}{payload.checklist.failedSections.length > 0 && <div className="text-xs text-red-300 mb-2">Failed: {payload.checklist.failedSections.join(', ')}</div>}{(payload.run?.warnings ?? []).map((warning, index) => <div key={index} className="text-xs border border-amber-900 bg-amber-950/20 rounded p-2 mb-1 text-amber-200">{warning}</div>)}</div>
          </div>

          <div className="rounded-lg border border-zinc-800 p-4"><div className="flex justify-between mb-3"><div><h3 className="text-sm font-semibold text-white">Coverage after edits</h3><p className="text-[10px] text-zinc-600">A name mention is not counted as analysis.</p></div><Badge>{fmt(payload.coverage.generatedAt)}</Badge></div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">{payload.coverage.teams.map(team => <div key={team.team} className="border border-zinc-800 rounded p-2 text-xs"><div className="flex justify-between gap-2"><span className="text-zinc-300">{team.team}</span><span className={team.coverage === 'substantive' ? 'text-emerald-400' : team.coverage === 'passing' ? 'text-blue-400' : team.coverage === 'factual_only' ? 'text-amber-400' : 'text-red-400'}>{team.coverage.replace('_', ' ')}</span></div><div className="text-[10px] text-zinc-600 mt-1">{team.mentions} mentions · {team.analyticalMentions} analytical</div></div>)}</div>{payload.coverage.repetition.length > 0 && <div className="mt-4"><div className="text-xs font-semibold text-amber-300 mb-2">Repeated phrases</div>{payload.coverage.repetition.map((item, index) => <div key={index} className="text-xs text-zinc-500 mb-1">“{item.phrase}” — {item.sections.join(', ')}</div>)}</div>}</div>

          <div className="rounded-lg border border-zinc-800 p-4"><div className="flex justify-between gap-2 mb-3"><div><h3 className="text-sm font-semibold text-white">Fact audit</h3><p className="text-[10px] text-zinc-600">Editor verification and dismissals are recorded on this issue.</p></div><Button size="sm" variant="secondary" disabled={auditRunning} onClick={async () => { setAuditRunning(true); await post({ action: 'run_audit' }, 'audit'); setAuditRunning(false); }}>{auditRunning ? 'Auditing…' : payload.run?.factAudit ? 'Re-run audit' : 'Run audit'}</Button></div>
            {!payload.run?.factAudit && <div className="py-8 text-center text-zinc-500 text-sm">No audit yet.</div>}
            <div className="space-y-2">{payload.run?.factAudit?.claims.map(claim => <div key={claim.key} className={`rounded border p-3 ${claim.resolution !== 'open' ? 'border-zinc-800 opacity-60' : claim.risk === 'high' ? 'border-red-800 bg-red-950/20' : claim.risk === 'medium' ? 'border-amber-800 bg-amber-950/20' : 'border-zinc-800'}`}><div className="flex justify-between gap-4"><div><div className="text-[10px] uppercase text-zinc-500">{claim.risk} · {claim.type} · {claim.verification} · {label(claim.section)}</div><div className="text-xs text-zinc-200 mt-1">“{claim.claim}”</div>{claim.reason && <div className="text-[10px] text-zinc-500 mt-1">{claim.reason}</div>}{claim.evidence && <details className="mt-2"><summary className="text-[10px] text-blue-400 cursor-pointer">Show source evidence</summary><div className="text-[10px] text-zinc-400 border-l border-zinc-700 pl-2 mt-1">{claim.evidence}</div></details>}{(claim.unsupportedNumbers?.length || claim.unsupportedEntities?.length) && <div className="text-[10px] text-amber-300 mt-1">Unsupported: {[...(claim.unsupportedNumbers ?? []), ...(claim.unsupportedEntities ?? [])].join(', ')}</div>}</div><div className="shrink-0 flex flex-col gap-1 items-end"><button className="text-[10px] text-blue-400" onClick={() => { const found = payload.fieldsBySection.find(info => info.type === claim.section || (claim.section.startsWith('Recap') && info.type === 'MatchupRecaps')); if (found) { setSectionIndex(found.sectionIndex); setMode('edit'); } }}>Jump to section</button>{claim.resolution === 'open' ? <><button className="text-[10px] text-emerald-400" onClick={() => void post({ action: 'resolve_claim', claimKey: claim.key, resolution: 'verified_by_editor' }, `claim:${claim.key}`)}>Mark verified</button><button className="text-[10px] text-zinc-500" onClick={() => void post({ action: 'resolve_claim', claimKey: claim.key, resolution: 'dismissed' }, `claim:${claim.key}`)}>Dismiss</button></> : <button className="text-[10px] text-zinc-500" onClick={() => void post({ action: 'resolve_claim', claimKey: claim.key, resolution: 'open' }, `claim:${claim.key}`)}>Reopen</button>}</div></div></div>)}</div>
          </div>

          {payload.checklist.emptyFields.length > 0 && <div className="rounded-lg border border-amber-800 p-4"><h3 className="text-sm font-semibold text-amber-300 mb-2">Empty visible fields</h3>{payload.checklist.emptyFields.map(item => <button key={`${item.sectionIndex}:${item.fieldPath}`} className="block text-xs text-zinc-400 hover:text-white mb-1" onClick={() => { setSectionIndex(item.sectionIndex); setMode('edit'); }}>{label(item.sectionType)} — {item.label}</button>)}</div>}
        </div>}

        {mode === 'versions' && <div className="p-4 sm:p-6 space-y-5">
          <div className="flex justify-between gap-3"><div><h3 className="text-sm font-semibold text-white">Exact-ID checkpoints</h3><p className="text-xs text-zinc-500">Restores are reversible and cannot cross into another issue.</p></div><Button size="sm" onClick={() => void post({ action: 'snapshot', note: 'Manual editorial checkpoint' }, 'snapshot')}>Create checkpoint</Button></div>
          <div className="space-y-2">{payload.snapshots.length === 0 ? <div className="py-8 text-center text-zinc-500">No checkpoints yet.</div> : payload.snapshots.map(snapshot => <div key={snapshot.id} className="border border-zinc-800 rounded p-3 flex justify-between gap-3"><div><div className="text-sm text-zinc-200">{snapshot.actionType.replaceAll('_', ' ')}</div><div className="text-xs text-zinc-500">{fmt(snapshot.createdAt)} · {snapshot.note?.replace(/^\[newsletter:[^\]]+\]\s*/, '') || 'No note'}</div></div><Button size="sm" variant="secondary" disabled={action === `restore:${snapshot.id}`} onClick={() => void post({ action: 'restore_snapshot', snapshotId: snapshot.id }, `restore:${snapshot.id}`)}>Restore</Button></div>)}</div>
          <div className="rounded-lg border border-zinc-800 p-4"><h3 className="text-sm font-semibold text-white mb-3">Recent field changes</h3><div className="space-y-2 max-h-96 overflow-y-auto">{[...payload.newsletter.editor.history].reverse().slice(0, 50).map((item, index) => <details key={`${item.at}:${index}`} className="border-b border-zinc-800 pb-2"><summary className="text-xs text-zinc-300 cursor-pointer">{item.sectionType} · {item.label} <span className="text-zinc-600">— {item.source}, {fmt(item.at)}</span></summary><div className="grid sm:grid-cols-2 gap-2 mt-2 text-[10px]"><div className="bg-red-950/20 border border-red-900 rounded p-2 whitespace-pre-wrap">{item.before}</div><div className="bg-emerald-950/20 border border-emerald-900 rounded p-2 whitespace-pre-wrap">{item.after}</div></div></details>)}{payload.newsletter.editor.history.length === 0 && <div className="text-xs text-zinc-500">No structured edit history yet.</div>}</div></div>
        </div>}
      </CardContent>
    </Card>
  </div>;
}
