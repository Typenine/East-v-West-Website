'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

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

interface EditableField {
  fieldPath: string;
  label: string;
  bot: 'entertainer' | 'analyst';
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

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function getEditableFields(sec: NewsletterSection): EditableField[] {
  const fields: EditableField[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = sec.data as any;
  if (!d) return fields;

  switch (sec.type) {
    case 'Intro':
      fields.push({ fieldPath: 'bot1_text', label: '🎙️ Mason', bot: 'entertainer' });
      fields.push({ fieldPath: 'bot2_text', label: '📊 Westy', bot: 'analyst' });
      break;
    case 'FinalWord':
    case 'SpotlightTeam':
    case 'Blurt':
      fields.push({ fieldPath: 'bot1', label: '🎙️ Mason', bot: 'entertainer' });
      fields.push({ fieldPath: 'bot2', label: '📊 Westy', bot: 'analyst' });
      break;
    case 'MockDraft':
      if (d.mason_intro) fields.push({ fieldPath: 'mason_intro', label: '🎙️ Mason Intro', bot: 'entertainer' });
      if (d.westy_intro) fields.push({ fieldPath: 'westy_intro', label: '📊 Westy Intro', bot: 'analyst' });
      if (Array.isArray(d.picks)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.picks as Array<any>).forEach((pick: Record<string, unknown>, i: number) => {
          const lbl = `Pick ${(pick.overall as number) ?? i + 1}`;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((pick.mason as any)?.analysis !== undefined)
            fields.push({ fieldPath: `picks.${i}.mason.analysis`, label: `🎙️ ${lbl} — Mason`, bot: 'entertainer' });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((pick.westy as any)?.analysis !== undefined)
            fields.push({ fieldPath: `picks.${i}.westy.analysis`, label: `📊 ${lbl} — Westy`, bot: 'analyst' });
        });
      }
      break;
    case 'Trades':
      if (Array.isArray(d)) {
        (d as Array<Record<string, unknown>>).forEach((trade, i) => {
          // Use team names from the `teams` map if available, else fall back to context
          const teamsMap = trade.teams as Record<string, unknown> | null | undefined;
          const teamNames = teamsMap ? Object.keys(teamsMap).join(' / ') : null;
          const tLabel = `Trade ${i + 1}${teamNames ? ` — ${teamNames}` : trade.context ? ` — ${String(trade.context).slice(0, 40)}` : ''}`;
          const analysis = trade.analysis as Record<string, Record<string, string>> | undefined;
          if (analysis) {
            Object.entries(analysis).forEach(([teamKey, ta]) => {
              if (ta.entertainer_paragraph !== undefined)
                fields.push({ fieldPath: `${i}.analysis.${teamKey}.entertainer_paragraph`, label: `🎙️ ${tLabel} [${teamKey}]`, bot: 'entertainer' });
              if (ta.analyst_paragraph !== undefined)
                fields.push({ fieldPath: `${i}.analysis.${teamKey}.analyst_paragraph`, label: `📊 ${tLabel} [${teamKey}]`, bot: 'analyst' });
            });
          }
        });
      }
      break;
    case 'MatchupRecaps':
      if (Array.isArray(d)) {
        (d as Array<Record<string, unknown>>).forEach((recap, i) => {
          const rLabel = `Recap ${i + 1}${recap.winner ? ` — ${recap.winner} vs ${recap.loser}` : ''}`;
          if (recap.bot1 !== undefined)
            fields.push({ fieldPath: `${i}.bot1`, label: `🎙️ ${rLabel} — Mason`, bot: 'entertainer' });
          if (recap.bot2 !== undefined)
            fields.push({ fieldPath: `${i}.bot2`, label: `📊 ${rLabel} — Westy`, bot: 'analyst' });
          // Dialogue exchanges
          if (Array.isArray(recap.dialogue)) {
            (recap.dialogue as Array<Record<string, unknown>>).forEach((ex, j) => {
              const spk = ex.speaker === 'entertainer' ? '🎙️ Mason' : '📊 Westy';
              fields.push({
                fieldPath: `${i}.dialogue.${j}.text`,
                label: `${spk} (Recap ${i + 1} exchange ${j + 1})`,
                bot: ex.speaker === 'entertainer' ? 'entertainer' : 'analyst',
              });
            });
          }
        });
      }
      break;
    case 'WaiversAndFA':
      if (Array.isArray(d)) {
        (d as Array<Record<string, unknown>>).forEach((item, i) => {
          const wLabel = `Waiver ${i + 1}${item.player ? ` — ${item.player}` : ''}`;
          if (item.bot1 !== undefined)
            fields.push({ fieldPath: `${i}.bot1`, label: `🎙️ ${wLabel} — Mason`, bot: 'entertainer' });
          if (item.bot2 !== undefined)
            fields.push({ fieldPath: `${i}.bot2`, label: `📊 ${wLabel} — Westy`, bot: 'analyst' });
        });
      }
      break;
    case 'DraftGrades':
      if (Array.isArray(d?.grades)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (d.grades as Array<any>).forEach((g: Record<string, unknown>, i: number) => {
          const gLabel = `${g.team ?? `Team ${i + 1}`} (${g.grade ?? '?'})`;
          if (g.bot1_analysis !== undefined)
            fields.push({ fieldPath: `grades.${i}.bot1_analysis`, label: `🎙️ ${gLabel} — Mason`, bot: 'entertainer' });
          if (g.bot2_analysis !== undefined)
            fields.push({ fieldPath: `grades.${i}.bot2_analysis`, label: `📊 ${gLabel} — Westy`, bot: 'analyst' });
        });
        if (d.bot1_summary !== undefined) fields.push({ fieldPath: 'bot1_summary', label: '🎙️ Mason Summary', bot: 'entertainer' });
        if (d.bot2_summary !== undefined) fields.push({ fieldPath: 'bot2_summary', label: '📊 Westy Summary', bot: 'analyst' });
      }
      break;
    default: {
      const keyMap: Array<[string, string, 'entertainer' | 'analyst']> = [
        ['bot1_text', '🎙️ Mason', 'entertainer'], ['bot2_text', '📊 Westy', 'analyst'],
        ['bot1', '🎙️ Mason', 'entertainer'], ['bot2', '📊 Westy', 'analyst'],
        ['mason_intro', '🎙️ Mason Intro', 'entertainer'], ['westy_intro', '📊 Westy Intro', 'analyst'],
        ['bot1_summary', '🎙️ Mason Summary', 'entertainer'], ['bot2_summary', '📊 Westy Summary', 'analyst'],
        ['bot1_analysis', '🎙️ Mason Analysis', 'entertainer'], ['bot2_analysis', '📊 Westy Analysis', 'analyst'],
        ['bot1_preview', '🎙️ Mason Preview', 'entertainer'], ['bot2_preview', '📊 Westy Preview', 'analyst'],
        ['bot1_coronation', '🎙️ Mason', 'entertainer'], ['bot2_coronation', '📊 Westy', 'analyst'],
        ['bot1_finalThoughts', '🎙️ Mason Final Thoughts', 'entertainer'], ['bot2_finalThoughts', '📊 Westy Final Thoughts', 'analyst'],
        ['entertainer_commentary', '🎙️ Mason Commentary', 'entertainer'], ['analyst_commentary', '📊 Westy Commentary', 'analyst'],
      ];
      for (const [key, label, bot] of keyMap) {
        if (typeof d[key] === 'string' && d[key]) fields.push({ fieldPath: key, label, bot });
      }
      break;
    }
  }
  return fields;
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
  const [selPopover, setSelPopover] = useState<SelectionPopover | null>(null);
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
        const liveText = String(getNestedValue(sec.data, fieldPath) ?? '');
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
    } catch (err) {
      patch(idx, fp, { accepting: false, error: err instanceof Error ? err.message : 'Accept failed' });
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
                onClick={() => setShowPreview(p => !p)}
              >{showPreview ? '⬅ Hide Preview' : '➡ Show Preview'}</button>
              {finalizeResult?.ok ? (
                <Button variant="primary" size="sm" onClick={onPublish} disabled={publishing}>
                  {publishing ? 'Publishing…' : '🚀 Publish'}
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={handleFinalize} disabled={finalizing}>
                  {finalizing ? 'Rendering…' : '✅ Finalize Edits'}
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
                        <span className="text-sm font-medium text-zinc-200">{stepLabel(sec.type)}</span>
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
                            const liveText = String(getNestedValue(sec.data, fp) ?? '');
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
                                        placeholder='Ask AI to rewrite whole field… e.g. "make this punchier"'
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
