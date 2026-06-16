'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { getValueAtPath, setValueAtPath } from '@/lib/newsletter/field-path';
import { getEditableFields } from '@/lib/newsletter/editable-fields';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NewsletterSection {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

interface EditFieldState {
  currentText: string;
  manualText: string;
  undoStack: string[];        // last 5 saved manualText values before current
  aiInstruction: string;
  aiInstructionHistory: string[];  // last 5 instructions
  aiPreview: string | null;
  saving: boolean;
  rewriting: boolean;
  accepting: boolean;
  error: string | null;
  saved: boolean;
}

interface SweepProposal {
  sectionIndex: number;
  fieldPath: string;
  label: string;
  before: string;
  after: string;
  reason: string;
  status: 'pending' | 'applying' | 'applied' | 'error';
}

interface SelectionPopover {
  fieldKey: string;
  selStart: number;
  selEnd: number;
  selectedText: string;
  instruction: string;
  rewriting: boolean;
  top: number;
  left: number;
}

interface ChangedField {
  sectionLabel: string;
  fieldLabel: string;
  original: string;
  current: string;
}

// ── Run observability types (from /api/admin/diagnostics) ────────────────────

interface RunSectionMeta {
  sectionName: string;
  status: string;
  provider: string | null;
  tier: number | null;
  isFallback: boolean;
  error: string | null;
}

interface RunInfo {
  runId: string;
  status: string;
  warnings: string[] | null;
  factAudit: FactAuditData | null;
}

interface FactAuditClaim {
  section: string;
  claim: string;
  type: string;
  risk: 'high' | 'medium' | 'low';
  reason: string;
}

interface FactAuditData {
  claims: FactAuditClaim[];
  highRiskCount: number;
  mediumRiskCount: number;
  sectionsAudited: number;
  model: string;
  generatedAt: string;
  error?: string;
}

/** Map run step names (Recap_0, Trade_1, Spotlight…) onto a newsletter section type. */
function runSectionsForType(sectionType: string, runSections: RunSectionMeta[]): RunSectionMeta[] {
  return runSections.filter(rs => {
    if (rs.sectionName === sectionType) return true;
    if (sectionType === 'MatchupRecaps') return /^Recap_\d+$/.test(rs.sectionName);
    if (sectionType === 'Trades') return /^Trade_\d+$/.test(rs.sectionName);
    if (sectionType === 'SpotlightTeam') return rs.sectionName === 'Spotlight';
    return false;
  });
}

const PROVIDER_BADGE: Record<string, { label: string; cls: string }> = {
  'anthropic':        { label: 'Claude',     cls: 'bg-orange-900/50 text-orange-300 border-orange-700/50' },
  'gemini-2.5-flash': { label: 'Gemini 2.5', cls: 'bg-blue-900/50 text-blue-300 border-blue-700/50' },
  'gemini-2.0-flash': { label: 'Gemini 2.0', cls: 'bg-blue-900/50 text-blue-400 border-blue-800/50' },
  'groq':             { label: 'Groq',       cls: 'bg-purple-900/50 text-purple-300 border-purple-700/50' },
  'cerebras':         { label: 'Cerebras',   cls: 'bg-pink-900/50 text-pink-300 border-pink-700/50' },
  'openrouter':       { label: 'OpenRouter', cls: 'bg-teal-900/50 text-teal-300 border-teal-700/50' },
};

function ProviderBadges({ metas }: { metas: RunSectionMeta[] }) {
  if (metas.length === 0) return null;
  const providers = [...new Set(metas.map(m => m.provider).filter((p): p is string => !!p))];
  const anyFallback = metas.some(m => m.isFallback);
  const anyFailed = metas.some(m => m.status === 'failed');
  return (
    <span className="flex items-center gap-1">
      {providers.map(p => {
        const badge = PROVIDER_BADGE[p] ?? { label: p, cls: 'bg-zinc-800 text-zinc-400 border-zinc-600' };
        return (
          <span key={p} className={`text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 ${badge.cls}`}>
            {badge.label}
          </span>
        );
      })}
      {anyFallback && (
        <span className="text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 bg-amber-900/50 text-amber-300 border-amber-700/50" title="A fallback provider wrote part of this section">
          ⚠ fallback
        </span>
      )}
      {anyFailed && (
        <span className="text-[9px] font-semibold uppercase tracking-wide border rounded px-1.5 py-0.5 bg-red-900/50 text-red-300 border-red-700/50" title="A step in this section failed during generation">
          ✗ failed step
        </span>
      )}
    </span>
  );
}

export interface EditModePanelProps {
  season: string;
  week: string;
  needsWeek: boolean;
  html: string | null;               // current rendered HTML (updates after finalize)
  onHtmlUpdate: (html: string) => void;
  onClose: () => void;
  onPublish: () => void;
  publishing: boolean;
  finalizeResult: { ok: boolean; message: string } | null;
  setFinalizeResult: (r: { ok: boolean; message: string } | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stepLabel(s: string): string {
  const map: Record<string, string> = {
    Intro: 'Intro', FinalWord: 'Final Word', WaiversAndFA: 'Waivers',
    PowerRankings: 'Power Rankings', SeasonPreview: 'Season Preview',
    Spotlight: 'Spotlight', Blurt: 'Blurt', Forecast: 'Forecast',
    PredictionCallbacks: 'Callbacks', ClancyInsert: 'Clancy',
    Trades: 'Trades', MatchupRecaps: 'Recaps', MockDraft: 'Mock Draft',
    DraftGrades: 'Draft Grades',
  };
  if (map[s]) return map[s];
  if (/^Recap_(\d+)$/.test(s)) return `Recap ${parseInt(s.replace('Recap_', '')) + 1}`;
  if (/^Trade_(\d+)$/.test(s)) return `Trade ${parseInt(s.replace('Trade_', '')) + 1}`;
  return s;
}

/** Inline word-level diff — returns spans with old text in red, new in green */
function renderDiff(oldText: string, newText: string): React.ReactNode {
  // Split into words for a simple word-diff
  const oldWords = oldText.split(/(\s+)/);
  const newWords = newText.split(/(\s+)/);
  // LCS-based diff (simple, good enough for paragraphs)
  type Op = { type: 'equal' | 'delete' | 'insert'; text: string };
  const ops: Op[] = [];
  const m = oldWords.length, n = newWords.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldWords[i] === newWords[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && oldWords[i] === newWords[j]) {
      ops.push({ type: 'equal', text: oldWords[i] }); i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      ops.push({ type: 'insert', text: newWords[j] }); j++;
    } else {
      ops.push({ type: 'delete', text: oldWords[i] }); i++;
    }
  }
  return (
    <>
      {ops.map((op, k) => {
        if (op.type === 'equal') return <span key={k}>{op.text}</span>;
        if (op.type === 'delete') return <span key={k} className="bg-red-900/60 text-red-300 line-through">{op.text}</span>;
        return <span key={k} className="bg-emerald-900/60 text-emerald-300">{op.text}</span>;
      })}
    </>
  );
}

const BLANK_FIELD_STATE: EditFieldState = {
  currentText: '', manualText: '', undoStack: [], aiInstruction: '',
  aiInstructionHistory: [], aiPreview: null,
  saving: false, rewriting: false, accepting: false, error: null, saved: false,
};

function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0;
}

function lengthBudgetColor(original: string, current: string): string | null {
  if (!original) return null;
  const ratio = current.length / original.length;
  if (ratio > 1.4) return 'text-red-400';
  if (ratio > 1.2) return 'text-amber-400';
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function EditModePanel({
  season, week, needsWeek, html, onHtmlUpdate, onClose, onPublish, publishing, finalizeResult, setFinalizeResult,
}: EditModePanelProps) {

  const wNum = needsWeek ? (parseInt(week) || 0) : 0;
  const seasonNum = parseInt(season);

  // ── State ──────────────────────────────────────────────────────────────────

  const [sections, setSections] = useState<NewsletterSection[]>([]);
  const [states, setStates] = useState<Record<string, EditFieldState>>({});
  const [expanded, setExpanded] = useState<string | null>('0');
  const [search, setSearch] = useState('');
  const [finalizing, setFinalizing] = useState(false);
  const [showChangeSummary, setShowChangeSummary] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [publishHistory, setPublishHistory] = useState<Array<{ at: string; htmlLength: number }>>([]);
  const [runInfo, setRunInfo] = useState<RunInfo | null>(null);
  const [runSections, setRunSections] = useState<RunSectionMeta[]>([]);
  const [factAudit, setFactAudit] = useState<FactAuditData | null>(null);
  const [auditRunning, setAuditRunning] = useState(false);
  const [showRunHealth, setShowRunHealth] = useState(false);
  const [selPopover, setSelPopover] = useState<SelectionPopover | null>(null);
  // Consistency sweep — propagate a factual correction across all sections
  const [sweepNote, setSweepNote] = useState('');
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepError, setSweepError] = useState<string | null>(null);
  const [sweepProposals, setSweepProposals] = useState<SweepProposal[] | null>(null);
  const taRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const autoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lsKey = `evw_edit_${season}_${week}`;

  // ── Load sections ──────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/newsletter?week=${wNum}&season=${season}`, { cache: 'no-store', credentials: 'include' })
      .then(r => r.json())
      .then((data: { newsletter?: { sections?: NewsletterSection[] } }) => {
        const secs = data.newsletter?.sections ?? [];
        setSections(secs);
        // Restore from localStorage if available
        try {
          const saved = localStorage.getItem(lsKey);
          if (saved) {
            const parsed = JSON.parse(saved) as Record<string, EditFieldState>;
            setStates(parsed);
            return;
          }
        } catch { /* ignore */ }
        setStates({});
      })
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load run observability (provider badges, warnings, fact audit) ────────

  useEffect(() => {
    fetch(`/api/admin/diagnostics?season=${season}&week=${wNum}`, { cache: 'no-store', credentials: 'include' })
      .then(r => r.json())
      .then((data: { run?: RunInfo | null; sections?: RunSectionMeta[] }) => {
        if (data.run) {
          setRunInfo(data.run);
          setFactAudit(data.run.factAudit ?? null);
        }
        setRunSections(data.sections ?? []);
      })
      .catch(() => { /* observability is optional — editor works without it */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRunFactAudit = async () => {
    setAuditRunning(true);
    try {
      const res = await fetch('/api/newsletter/fact-audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: seasonNum, week: wNum, runId: runInfo?.runId }),
      });
      const data = await res.json() as { audit?: FactAuditData; error?: string };
      if (!res.ok || !data.audit) throw new Error(data.error ?? 'Fact audit failed');
      setFactAudit(data.audit);
      setShowRunHealth(true);
    } catch (err) {
      setFactAudit({
        claims: [], highRiskCount: 0, mediumRiskCount: 0, sectionsAudited: 0,
        model: 'none', generatedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Fact audit failed',
      });
    } finally {
      setAuditRunning(false);
    }
  };

  // ── Persist to localStorage on every state change ─────────────────────────

  useEffect(() => {
    if (Object.keys(states).length === 0) return;
    try { localStorage.setItem(lsKey, JSON.stringify(states)); } catch { /* ignore */ }
  }, [states, lsKey]);

  // ── beforeunload warning when there are unsaved changes ───────────────────

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const hasUnsaved = Object.values(states).some(s => s.manualText !== s.currentText && !s.saved);
      if (hasUnsaved) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [states]);

  // ── Field state helpers ────────────────────────────────────────────────────

  const fk = (idx: number, fp: string) => `${idx}::${fp}`;

  const getState = useCallback((idx: number, fp: string, liveText: string): EditFieldState =>
    states[fk(idx, fp)] ?? { ...BLANK_FIELD_STATE, currentText: liveText, manualText: liveText },
  [states]);

  const patch = useCallback((idx: number, fp: string, p: Partial<EditFieldState>) => {
    const key = fk(idx, fp);
    setStates(prev => ({ ...prev, [key]: { ...(prev[key] ?? BLANK_FIELD_STATE), ...p } }));
  }, []);

  // ── Auto-save on type (2s debounce) ───────────────────────────────────────

  const scheduleAutoSave = useCallback((idx: number, fp: string, bot: 'entertainer' | 'analyst', text: string) => {
    const key = fk(idx, fp);
    if (autoSaveTimers.current[key]) clearTimeout(autoSaveTimers.current[key]);
    autoSaveTimers.current[key] = setTimeout(async () => {
      try {
        const res = await fetch('/api/newsletter/edit', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'save_section', season: seasonNum, week: wNum, sectionIndex: idx, bot, fieldPath: fp, text }),
        });
        const data = await res.json() as { success?: boolean };
        if (res.ok && data.success) {
          setStates(prev => {
            const cur = prev[key];
            if (!cur) return prev;
            return { ...prev, [key]: { ...cur, saved: true, currentText: text, undoStack: [cur.currentText, ...cur.undoStack].slice(0, 5) } };
          });
        }
      } catch { /* silent — user can manually save */ }
    }, 2000);
  }, [seasonNum, wNum]);

  // ── Changed fields for summary / diff ─────────────────────────────────────

  const changedFields = useCallback((): ChangedField[] => {
    const result: ChangedField[] = [];
    sections.forEach((sec, idx) => {
      const fields = getEditableFields(sec);
      fields.forEach(({ fieldPath, label }) => {
        const liveText = String(getValueAtPath(sec.data, fieldPath) ?? '');
        const st = getState(idx, fieldPath, liveText);
        if (st.saved && st.currentText !== st.manualText && st.manualText !== liveText) {
          result.push({ sectionLabel: stepLabel(sec.type), fieldLabel: label, original: st.currentText, current: st.manualText });
        }
      });
    });
    return result;
  }, [sections, states, getState]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save / AI ──────────────────────────────────────────────────────────────

  const handleRevertToOriginal = (idx: number, fp: string, liveText: string) => {
    patch(idx, fp, { manualText: liveText, saved: false, error: null });
  };

  const handleSave = async (idx: number, fp: string, bot: 'entertainer' | 'analyst') => {
    const st = getState(idx, fp, '');
    // Cancel any pending auto-save for this field
    const key = fk(idx, fp);
    if (autoSaveTimers.current[key]) { clearTimeout(autoSaveTimers.current[key]); delete autoSaveTimers.current[key]; }
    patch(idx, fp, { saving: true, error: null, saved: false });
    try {
      const res = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_section', season: seasonNum, week: wNum, sectionIndex: idx, bot, fieldPath: fp, text: st.manualText }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Save failed');
      patch(idx, fp, {
        saving: false, saved: true, currentText: st.manualText,
        undoStack: [st.currentText, ...st.undoStack].slice(0, 5),
      });
    } catch (err) {
      patch(idx, fp, { saving: false, error: err instanceof Error ? err.message : 'Save failed' });
    }
  };

  const handleUndo = (idx: number, fp: string) => {
    const st = getState(idx, fp, '');
    if (!st.undoStack.length) return;
    const [prev, ...rest] = st.undoStack;
    patch(idx, fp, { manualText: prev, undoStack: rest, saved: false });
  };

  const handleAiRewrite = async (idx: number, fp: string, bot: 'entertainer' | 'analyst') => {
    const st = getState(idx, fp, '');
    if (!st.aiInstruction.trim()) return;
    patch(idx, fp, { rewriting: true, aiPreview: null, error: null });
    try {
      const sec = sections[idx];
      const res = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'ai_rewrite', season: seasonNum, week: wNum, sectionIndex: idx, bot, fieldPath: fp,
          instruction: st.aiInstruction,
          // #5: inject raw section data so Claude has full context (scores, teams, etc.)
          sectionContext: sec?.data ?? null,
        }),
      });
      const data = await res.json() as { success?: boolean; preview?: string; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Rewrite failed');
      const newHistory = [st.aiInstruction, ...st.aiInstructionHistory.filter(h => h !== st.aiInstruction)].slice(0, 5);
      patch(idx, fp, { rewriting: false, aiPreview: data.preview ?? '', aiInstructionHistory: newHistory });
    } catch (err) {
      patch(idx, fp, { rewriting: false, error: err instanceof Error ? err.message : 'Rewrite failed' });
    }
  };

  const handleAccept = async (idx: number, fp: string, bot: 'entertainer' | 'analyst') => {
    const st = getState(idx, fp, '');
    if (!st.aiPreview) return;
    patch(idx, fp, { accepting: true, error: null });
    try {
      const res = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_section', season: seasonNum, week: wNum, sectionIndex: idx, bot, fieldPath: fp, text: st.aiPreview }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Accept failed');
      patch(idx, fp, {
        accepting: false, manualText: st.aiPreview!, currentText: st.aiPreview!,
        aiPreview: null, aiInstruction: '', saved: true,
        undoStack: [st.currentText, ...st.undoStack].slice(0, 5),
      });
      // Pre-fill the consistency sweep note so a factual fix can be propagated
      // to every other section with one click.
      if (st.aiInstruction.trim()) setSweepNote(prev => prev.trim() ? prev : st.aiInstruction);
    } catch (err) {
      patch(idx, fp, { accepting: false, error: err instanceof Error ? err.message : 'Accept failed' });
    }
  };

  // ── Consistency sweep — propagate a factual correction across sections ──────

  const handleConsistencySweep = async () => {
    if (!sweepNote.trim() || sweepRunning) return;
    setSweepRunning(true);
    setSweepError(null);
    setSweepProposals(null);
    try {
      const res = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'consistency_sweep', season: seasonNum, week: wNum, note: sweepNote }),
      });
      const data = await res.json() as { success?: boolean; proposals?: Array<Omit<SweepProposal, 'status'>>; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Consistency check failed');
      setSweepProposals((data.proposals ?? []).map(p => ({ ...p, status: 'pending' as const })));
    } catch (err) {
      setSweepError(err instanceof Error ? err.message : 'Consistency check failed');
    } finally {
      setSweepRunning(false);
    }
  };

  const applySweepProposal = async (pi: number) => {
    const proposal = sweepProposals?.[pi];
    if (!proposal || proposal.status === 'applied' || proposal.status === 'applying') return;
    const setStatus = (status: SweepProposal['status']) =>
      setSweepProposals(prev => prev ? prev.map((p, i) => i === pi ? { ...p, status } : p) : prev);
    setStatus('applying');
    try {
      const sec = sections[proposal.sectionIndex];
      const bot = sec ? (getEditableFields(sec).find(f => f.fieldPath === proposal.fieldPath)?.bot ?? 'entertainer') : 'entertainer';
      const res = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_section', season: seasonNum, week: wNum,
          sectionIndex: proposal.sectionIndex, bot, fieldPath: proposal.fieldPath,
          text: proposal.after, viaAiRewrite: true,
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Apply failed');
      // Reflect the change locally so textareas show the new text immediately
      setSections(prev => {
        const next = prev.map(s => ({ ...s }));
        const target = next[proposal.sectionIndex];
        if (target?.data != null && typeof target.data === 'object') {
          setValueAtPath(target.data as Record<string, unknown>, proposal.fieldPath, proposal.after);
        }
        return next;
      });
      // Sync any open editor state for this field
      const key = fk(proposal.sectionIndex, proposal.fieldPath);
      setStates(prev => prev[key]
        ? { ...prev, [key]: { ...prev[key], currentText: proposal.after, manualText: proposal.after, saved: true } }
        : prev);
      setStatus('applied');
    } catch {
      setStatus('error');
    }
  };

  const applyAllSweepProposals = async () => {
    if (!sweepProposals) return;
    for (let i = 0; i < sweepProposals.length; i++) {
      // Sequential — parallel writes to the same JSON row would race
      await applySweepProposal(i);
    }
  };

  // ── Selection-based rewrite ────────────────────────────────────────────────

  const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>, idx: number, fp: string) => {
    const ta = e.currentTarget;
    const start = ta.selectionStart ?? 0, end = ta.selectionEnd ?? 0;
    if (end <= start) { setSelPopover(null); return; }
    const selectedText = ta.value.slice(start, end).trim();
    if (!selectedText) { setSelPopover(null); return; }
    const rect = ta.getBoundingClientRect();
    setSelPopover(prev => ({
      fieldKey: fk(idx, fp), selStart: start, selEnd: end, selectedText,
      instruction: prev?.fieldKey === fk(idx, fp) ? (prev.instruction ?? '') : '',
      rewriting: false,
      top: rect.top + window.scrollY - 8,
      left: rect.left + rect.width / 2,
    }));
  };

  const handleRewriteSelection = async () => {
    if (!selPopover || !selPopover.instruction.trim()) return;
    const { fieldKey, selStart, selEnd, selectedText, instruction } = selPopover;
    const [idxStr, ...pathParts] = fieldKey.split('::');
    const idx = parseInt(idxStr), fp = pathParts.join('::');
    const sec = sections[idx];
    if (!sec) return;
    const field = getEditableFields(sec).find(f => f.fieldPath === fp);
    const bot = field?.bot ?? 'entertainer';
    setSelPopover(p => p ? { ...p, rewriting: true } : null);
    try {
      const res = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ai_rewrite', season: seasonNum, week: wNum, sectionIndex: idx, bot, fieldPath: fp, selectedText, instruction }),
      });
      const data = await res.json() as { success?: boolean; preview?: string; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Rewrite failed');
      const rewritten = data.preview ?? selectedText;
      const st = getState(idx, fp, '');
      const newText = st.manualText.slice(0, selStart) + rewritten + st.manualText.slice(selEnd);
      patch(idx, fp, { manualText: newText, saved: false });
      setSelPopover(null);
      const taRef = taRefs.current[fk(idx, fp)];
      if (taRef) { taRef.focus(); const c = selStart + rewritten.length; taRef.setSelectionRange(c, c); }
    } catch (err) {
      patch(idx, fp, { error: err instanceof Error ? err.message : 'Rewrite failed' });
      setSelPopover(null);
    }
  };

  // ── Finalize ──────────────────────────────────────────────────────────────

  const handleFinalize = async () => {
    const changed = changedFields();
    if (changed.length > 0) {
      setShowChangeSummary(true);
      return;
    }
    await doFinalize();
  };

  const doFinalize = async () => {
    setShowChangeSummary(false);
    setFinalizing(true);
    setFinalizeResult(null);
    try {
      const res = await fetch('/api/newsletter/edit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finalize', season: seasonNum, week: wNum }),
      });
      const data = await res.json() as { success?: boolean; html?: string; error?: string; publishHistory?: Array<{ at: string; htmlLength: number }> };
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Finalize failed');
      if (data.html) onHtmlUpdate(data.html);
      if (data.publishHistory) setPublishHistory(data.publishHistory);
      setFinalizeResult({ ok: true, message: 'HTML re-rendered. Ready to publish.' });
      // Clear localStorage after successful finalize
      try { localStorage.removeItem(lsKey); } catch { /* ignore */ }
    } catch (err) {
      setFinalizeResult({ ok: false, message: err instanceof Error ? err.message : 'Finalize failed' });
    } finally {
      setFinalizing(false);
    }
  };

  // ── Filtered sections for search ──────────────────────────────────────────

  const filteredSections = search.trim()
    ? sections.filter(sec => {
        const q = search.toLowerCase();
        if (stepLabel(sec.type).toLowerCase().includes(q)) return true;
        return getEditableFields(sec).some(f => f.label.toLowerCase().includes(q));
      })
    : sections;

  const unsavedCount = Object.values(states).filter(s => s.manualText !== s.currentText).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mt-4">
      {/* Change summary modal */}
      {showChangeSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="text-sm font-semibold text-zinc-100 mb-3">📋 Changes to finalize</div>
            <div className="space-y-3 mb-4">
              {changedFields().map((cf, i) => (
                <div key={i} className="text-xs border border-zinc-700 rounded p-3 space-y-1">
                  <div className="font-medium text-zinc-300">{cf.sectionLabel} — {cf.fieldLabel}</div>
                  <div className="text-zinc-400 whitespace-pre-wrap leading-relaxed">{renderDiff(cf.original, cf.current)}</div>
                </div>
              ))}
              {changedFields().length === 0 && <div className="text-xs text-zinc-500 italic">No saved changes detected.</div>}
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={doFinalize} disabled={finalizing}>
                {finalizing ? 'Rendering…' : '✅ Confirm & Finalize'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowChangeSummary(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Selection popover */}
      {selPopover && (
        <div className="fixed z-50 -translate-x-1/2 -translate-y-full" style={{ top: selPopover.top, left: selPopover.left }}>
          <div className="bg-zinc-900 border border-amber-600/60 rounded-lg shadow-2xl p-3 w-80 space-y-2">
            <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wide">✨ Rewrite selection</div>
            <div className="text-[10px] text-zinc-400 italic truncate">&ldquo;{selPopover.selectedText}&rdquo;</div>
            <div className="flex gap-2">
              <input
                autoFocus
                type="text"
                placeholder='e.g. "fix the score to 142–98"'
                className="flex-1 text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1.5 text-zinc-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                value={selPopover.instruction}
                onChange={e => setSelPopover(p => p ? { ...p, instruction: e.target.value } : null)}
                onKeyDown={e => { if (e.key === 'Enter') handleRewriteSelection(); if (e.key === 'Escape') setSelPopover(null); }}
              />
              <button
                className="text-xs bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded px-2 py-1.5 font-medium"
                onClick={handleRewriteSelection}
                disabled={selPopover.rewriting || !selPopover.instruction.trim()}
              >{selPopover.rewriting ? '…' : 'Go'}</button>
              <button className="text-xs text-zinc-500 hover:text-zinc-300 px-1" onClick={() => setSelPopover(null)}>✕</button>
            </div>
          </div>
          <div className="w-3 h-3 bg-zinc-900 border-r border-b border-amber-600/60 rotate-45 mx-auto -mt-1.5" />
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <CardTitle className="text-base">✏️ Edit Mode</CardTitle>
              <p className="text-xs text-zinc-400 mt-0.5">
                Edit sections manually or ask AI. Select any text in a textarea to rewrite just that part. Finalize when done, then Publish.
                {unsavedCount > 0 && <span className="ml-2 text-amber-400 font-medium">{unsavedCount} unsaved change{unsavedCount !== 1 ? 's' : ''}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-600 rounded px-2 py-1"
                onClick={() => setShowRunHealth(p => !p)}
              >
                🩺 Run Health
                {(runInfo?.warnings?.length ?? 0) > 0 && (
                  <span className="ml-1 text-amber-400">({runInfo!.warnings!.length})</span>
                )}
                {(factAudit?.highRiskCount ?? 0) > 0 && (
                  <span className="ml-1 text-red-400">⚑{factAudit!.highRiskCount}</span>
                )}
              </button>
              <button
                className="text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-600 rounded px-2 py-1"
                onClick={() => setShowPreview(p => !p)}
              >{showPreview ? '⬅ Hide Preview' : '➡ Show Preview'}</button>
              <Button variant="primary" size="sm" onClick={handleFinalize} disabled={finalizing}>
                {finalizing ? 'Rendering…' : '✅ Finalize Edits'}
              </Button>
              {finalizeResult?.ok && (
                <Button variant="primary" size="sm" onClick={onPublish} disabled={publishing}>
                  {publishing ? 'Publishing…' : '🚀 Publish'}
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose}>✕ Close</Button>
            </div>
          </div>
          {finalizeResult && (
            <div className={`mt-2 text-xs px-3 py-1.5 rounded ${finalizeResult.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
              {finalizeResult.ok ? '✅' : '❌'} {finalizeResult.message}
              {publishHistory.length > 1 && (
                <span className="ml-2 text-zinc-500">
                  · Finalized {publishHistory.length}× · Last: {new Date(publishHistory[publishHistory.length - 1].at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="py-3">
          {/* ── Run health panel: coverage warnings + fact-audit flags ── */}
          {showRunHealth && (
            <div className="mb-4 border border-zinc-700 rounded-lg p-4 bg-zinc-900/60 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">🩺 Run Health</div>
                <div className="flex items-center gap-2">
                  {runInfo && (
                    <span className="text-[10px] text-zinc-500">
                      run {runInfo.runId.slice(0, 12)}… · {runInfo.status}
                    </span>
                  )}
                  <Button size="sm" variant="secondary" onClick={handleRunFactAudit} disabled={auditRunning}>
                    {auditRunning ? 'Auditing…' : '🔍 Run Fact Audit'}
                  </Button>
                </div>
              </div>

              {/* Coverage / generation warnings */}
              {(runInfo?.warnings?.length ?? 0) > 0 ? (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Coverage & Generation Warnings</div>
                  {runInfo!.warnings!.map((w, i) => (
                    <div key={i} className="text-xs text-amber-200/90 bg-amber-900/20 border border-amber-800/30 rounded px-2 py-1">⚠ {w}</div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-zinc-500 italic">No coverage or generation warnings recorded for this run.</div>
              )}

              {/* Fact-audit results */}
              {factAudit && (
                <div className="space-y-1">
                  <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
                    Fact Audit · {factAudit.model} · {factAudit.sectionsAudited} sections ·{' '}
                    <span className="text-red-400">{factAudit.highRiskCount} high</span> /{' '}
                    <span className="text-amber-400">{factAudit.mediumRiskCount} medium</span>
                  </div>
                  {factAudit.error && (
                    <div className="text-xs text-red-400">Audit error: {factAudit.error}</div>
                  )}
                  <div className="max-h-64 overflow-y-auto space-y-1">
                    {factAudit.claims
                      .filter(c => c.risk !== 'low')
                      .map((c, i) => (
                        <div
                          key={i}
                          className={`text-xs rounded px-2 py-1.5 border ${
                            c.risk === 'high'
                              ? 'bg-red-900/20 border-red-800/40 text-red-200'
                              : 'bg-amber-900/15 border-amber-800/30 text-amber-200/90'
                          }`}
                        >
                          <span className="font-semibold uppercase text-[9px] tracking-wide mr-1.5">
                            {c.risk === 'high' ? '⚑ high' : '△ med'} · {c.type} · {stepLabel(c.section)}
                          </span>
                          <span className="text-zinc-300">&ldquo;{c.claim}&rdquo;</span>
                          {c.reason && <span className="block text-[10px] text-zinc-500 mt-0.5">{c.reason}</span>}
                        </div>
                      ))}
                    {factAudit.claims.filter(c => c.risk !== 'low').length === 0 && !factAudit.error && (
                      <div className="text-xs text-emerald-400">✓ No high- or medium-risk claims flagged.</div>
                    )}
                  </div>
                </div>
              )}
              {!factAudit && (
                <div className="text-xs text-zinc-500 italic">No fact audit yet — run one to flag risky claims before publishing.</div>
              )}
            </div>
          )}

          {/* ── Consistency sweep: propagate one factual correction everywhere ── */}
          <div className="mb-4 border border-zinc-700 rounded-lg p-4 bg-zinc-900/60 space-y-3">
            <div className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">🔁 Consistency Check</div>
            <p className="text-[11px] text-zinc-500">
              Fixed a fact in one section? Describe the correction and AI will find every other section that contradicts it
              (including trade grades) and propose matching fixes.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder='e.g. "Brian Thomas was sent by The Lone Ginger, not the Badgers"'
                className="flex-1 text-xs bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={sweepNote}
                onChange={e => setSweepNote(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleConsistencySweep(); }}
              />
              <Button size="sm" variant="secondary" onClick={handleConsistencySweep} disabled={sweepRunning || !sweepNote.trim()} className="shrink-0">
                {sweepRunning ? 'Scanning all sections…' : '🔍 Check All Sections'}
              </Button>
            </div>
            {sweepError && <div className="text-xs text-red-400">{sweepError}</div>}
            {sweepProposals && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] text-zinc-400">
                    {sweepProposals.length === 0
                      ? '✓ No contradictions found — the rest of the newsletter is consistent with this correction.'
                      : `${sweepProposals.length} field${sweepProposals.length !== 1 ? 's' : ''} contradict${sweepProposals.length === 1 ? 's' : ''} the correction:`}
                  </div>
                  {sweepProposals.some(p => p.status === 'pending' || p.status === 'error') && (
                    <Button size="sm" variant="primary" onClick={applyAllSweepProposals}>
                      ✅ Apply All
                    </Button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {sweepProposals.map((p, pi) => (
                    <div key={pi} className="text-xs border border-zinc-700 rounded p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-zinc-300">{p.label}</span>
                        <span className="shrink-0">
                          {p.status === 'applied' && <span className="text-emerald-400">✓ Applied</span>}
                          {p.status === 'applying' && <span className="text-zinc-400">Applying…</span>}
                          {p.status === 'error' && <span className="text-red-400">Failed — </span>}
                          {(p.status === 'pending' || p.status === 'error') && (
                            <button className="ml-1 text-emerald-400 hover:text-emerald-300 font-medium" onClick={() => applySweepProposal(pi)}>
                              {p.status === 'error' ? 'Retry' : 'Apply'}
                            </button>
                          )}
                        </span>
                      </div>
                      {p.reason && <div className="text-[10px] text-zinc-500 italic">{p.reason}</div>}
                      <div className="text-zinc-400 whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">
                        {renderDiff(p.before, p.after)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Layout: editor left, HTML preview right */}
          <div className={`flex gap-4 ${showPreview ? 'flex-row' : 'flex-col'}`}>

            {/* ── Editor column ── */}
            <div className={showPreview ? 'w-1/2 min-w-0' : 'w-full'}>
              {/* Search */}
              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Search sections or fields…"
                  className="w-full text-xs bg-zinc-800 border border-zinc-600 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                {filteredSections.map((sec) => {
                  const idx = sections.indexOf(sec);
                  const sectionKey = `${idx}`;
                  const isExpanded = expanded === sectionKey;
                  const fields = getEditableFields(sec);
                  return (
                    <div key={idx} className="border border-zinc-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => {
                          const next = isExpanded ? null : sectionKey;
                          setExpanded(next);
                          // #9: scroll iframe to the corresponding section anchor
                          if (next && iframeRef.current) {
                            try {
                              const doc = iframeRef.current.contentDocument;
                              // Try data-section attribute first, then id matching section type
                              const el = doc?.querySelector(`[data-section="${sec.type}"], #section-${sec.type}, .section-${sec.type}`) as HTMLElement | null;
                              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            } catch { /* cross-origin or not loaded yet — ignore */ }
                          }
                        }}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800/60 hover:bg-zinc-800 text-left transition-colors"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-medium text-zinc-200">{stepLabel(sec.type)}</span>
                          <ProviderBadges metas={runSectionsForType(sec.type, runSections)} />
                        </span>
                        <span className="text-xs text-zinc-500">
                          {fields.length > 0 ? `${fields.length} field${fields.length !== 1 ? 's' : ''}` : 'no text'}&nbsp;{isExpanded ? '▲' : '▼'}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="divide-y divide-zinc-700/50">
                          {fields.length === 0 && (
                            <div className="p-4 text-xs text-zinc-500 italic">No editable text fields in this section.</div>
                          )}
                          {fields.map(({ fieldPath: fp, label, bot }) => {
                            const liveText = String(getValueAtPath(sec.data, fp) ?? '');
                            const st = getState(idx, fp, liveText);
                            const displayText = st.manualText;
                            const wc = wordCount(displayText);
                            const origWc = wordCount(liveText);
                            const budgetColor = lengthBudgetColor(liveText, displayText);
                            const isDirty = displayText !== liveText;

                            return (
                              <div key={fp} className="p-4 space-y-2">
                                {/* Label row */}
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">{label}</div>
                                  <div className="flex items-center gap-2">
                                    {/* Word count + budget */}
                                    <span className={`text-[10px] tabular-nums ${budgetColor ?? 'text-zinc-600'}`}>
                                      {wc}w{origWc > 0 && wc !== origWc ? ` (orig ${origWc}w)` : ''}
                                      {budgetColor === 'text-red-400' ? ' ⚠️ very long' : budgetColor === 'text-amber-400' ? ' ↑ long' : ''}
                                    </span>
                                    {isDirty && (
                                      <button className="text-[10px] text-zinc-500 hover:text-zinc-300" onClick={() => handleRevertToOriginal(idx, fp, liveText)}>
                                        ↩ Reset
                                      </button>
                                    )}
                                    {st.undoStack.length > 0 && (
                                      <button className="text-[10px] text-zinc-500 hover:text-zinc-300" onClick={() => handleUndo(idx, fp)}>
                                        ↩ Undo
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Textarea with keyboard shortcuts */}
                                <div>
                                  <textarea
                                    ref={el => { taRefs.current[fk(idx, fp)] = el; }}
                                    className="w-full text-xs bg-zinc-800 border border-zinc-600 rounded p-3 text-zinc-100 resize-y min-h-[80px] focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                                    placeholder="This field is empty — type text here, or use Ask AI below to write it for you."
                                    value={displayText}
                                    onChange={e => {
                                      patch(idx, fp, { manualText: e.target.value, saved: false });
                                      scheduleAutoSave(idx, fp, bot, e.target.value);
                                    }}
                                    onMouseUp={e => handleSelect(e, idx, fp)}
                                    onKeyUp={e => handleSelect(e as unknown as React.SyntheticEvent<HTMLTextAreaElement>, idx, fp)}
                                    onKeyDown={e => {
                                      const mod = e.metaKey || e.ctrlKey;
                                      if (mod && e.key === 's') { e.preventDefault(); handleSave(idx, fp, bot); }
                                    }}
                                  />
                                  <div className="text-[10px] text-zinc-600 mt-0.5 select-none">
                                    💡 Select text to rewrite just that part · ⌘S / Ctrl+S to save
                                  </div>
                                </div>

                                {/* Save row */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Button size="sm" variant="secondary" onClick={() => handleSave(idx, fp, bot)} disabled={st.saving}>
                                    {st.saving ? 'Saving…' : '💾 Save'}
                                  </Button>
                                  {st.saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
                                  {st.error && !st.aiPreview && <span className="text-xs text-red-400">{st.error}</span>}
                                </div>

                                {/* AI rewrite — whole field */}
                                <div className="border-t border-zinc-700/40 pt-2 space-y-2">
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <input
                                        type="text"
                                        list={`hist-${fk(idx, fp)}`}
                                        placeholder={displayText.trim()
                                          ? 'Ask AI to rewrite whole field… e.g. "make this punchier"'
                                          : 'Field is empty — tell AI what to write, e.g. "2 sentences on this trade from Mason’s angle"'}
                                        className="w-full text-xs bg-zinc-900 border border-zinc-600 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
                                        value={st.aiInstruction}
                                        onChange={e => patch(idx, fp, { aiInstruction: e.target.value })}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') handleAiRewrite(idx, fp, bot);
                                          const mod = e.metaKey || e.ctrlKey;
                                          if (mod && e.key === 'Enter') { e.preventDefault(); handleAiRewrite(idx, fp, bot); }
                                        }}
                                      />
                                      {st.aiInstructionHistory.length > 0 && (
                                        <datalist id={`hist-${fk(idx, fp)}`}>
                                          {st.aiInstructionHistory.map((h, hi) => <option key={hi} value={h} />)}
                                        </datalist>
                                      )}
                                    </div>
                                    <Button size="sm" variant="secondary" onClick={() => handleAiRewrite(idx, fp, bot)} disabled={st.rewriting || !st.aiInstruction?.trim()} className="shrink-0">
                                      {st.rewriting ? '…' : '✨ Ask AI'}
                                    </Button>
                                  </div>

                                  {/* AI preview with diff */}
                                  {st.aiPreview && (
                                    <div className="space-y-2">
                                      <div className="text-xs font-medium text-amber-400">Preview (diff):</div>
                                      <div className="text-xs bg-zinc-900/80 border border-amber-800/40 rounded p-3 max-h-48 overflow-y-auto leading-relaxed">
                                        {renderDiff(st.currentText || liveText, st.aiPreview)}
                                      </div>
                                      {st.error && <div className="text-xs text-red-400">{st.error}</div>}
                                      <div className="flex gap-2">
                                        <Button size="sm" variant="primary" onClick={() => handleAccept(idx, fp, bot)} disabled={st.accepting}>
                                          {st.accepting ? 'Saving…' : '✅ Accept & Save'}
                                        </Button>
                                        <Button size="sm" variant="ghost" onClick={() => patch(idx, fp, { aiPreview: null })}>Discard</Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── HTML preview column ── */}
            {showPreview && html && (
              <div className="w-1/2 min-w-0">
                <div className="sticky top-4">
                  <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wide">Rendered Preview</div>
                  <div className="border border-zinc-700 rounded-lg overflow-hidden bg-white" style={{ height: '75vh' }}>
                    <iframe
                      ref={iframeRef}
                      srcDoc={html}
                      className="w-full h-full"
                      title="Newsletter preview"
                      sandbox="allow-same-origin"
                    />
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-1">Updates after Finalize</div>
                </div>
              </div>
            )}

          </div>
        </CardContent>
      </Card>
    </div>
  );
}
