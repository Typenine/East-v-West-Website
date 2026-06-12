'use client';

import { useState, useEffect, useRef, useCallback, Component, ReactNode } from 'react';
import EditModePanel from './EditModePanel';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Label from '@/components/ui/Label';
import Input from '@/components/ui/Input';

// ── Error boundary ────────────────────────────────────────────────────────────

class ErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  constructor(props: { children: ReactNode }) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(e: Error) { return { err: e }; }
  render() {
    if (this.state.err) return (
      <div className="p-6 text-center">
        <p className="text-red-400 font-medium mb-2">Something went wrong</p>
        <p className="text-xs text-zinc-400 font-mono mb-4">{this.state.err.message}</p>
        <button className="text-sm underline text-zinc-300" onClick={() => this.setState({ err: null })}>Try again</button>
      </div>
    );
    return this.props.children;
  }
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WEEKLESS = ['pre_draft', 'post_draft', 'preseason', 'offseason'];

function stepLabel(s: string): string {
  const map: Record<string, string> = {
    Intro: 'Intro', FinalWord: 'Final Word', WaiversAndFA: 'Waivers',
    PowerRankings: 'Power Rankings', PowerRankings_Preseason: 'Power Rankings',
    SeasonPreview: 'Season Preview', Spotlight: 'Spotlight', Blurt: 'Blurt',
    Forecast: 'Forecast', PredictionCallbacks: 'Callbacks', ClancyInsert: 'Clancy',
    SocialSummary: 'Social', PreDraftTrades: 'Trades', DraftGrades_Summary: 'Grade Summary',
    MockDraft_R1_Mason: 'R1 Mason', MockDraft_R1_Westy: 'R1 Westy',
    MockDraft_R2_Mason: 'R2 Mason', MockDraft_R2_Westy: 'R2 Westy',
  };
  if (map[s]) return map[s];
  if (/^Recap_(\d+)$/.test(s))      return `Recap ${parseInt(s.replace('Recap_', '')) + 1}`;
  if (/^Trade_(\d+)$/.test(s))      return `Trade ${parseInt(s.replace('Trade_', '')) + 1}`;
  if (/^DraftGrade_(\d+)$/.test(s)) return `Grade ${parseInt(s.replace('DraftGrade_', '')) + 1}`;
  return s;
}

// Per-step duration estimates (seconds), calibrated against measured prod runs
// (observability data, June 2026): mock-draft steps average 146-183s (two extended-
// thinking segments), Intro/PreDraftTrades ~40s, FinalWord ~29s. Steps without
// direct measurements are scaled from those by their Claude thinking budgets.
const STEP_EST_SECONDS: Record<string, number> = {
  Intro: 40,
  PreDraftTrades: 45,
  MockDraft_R1_Mason: 180, MockDraft_R1_Westy: 180,
  MockDraft_R2_Mason: 175, MockDraft_R2_Westy: 160,
  PowerRankings: 90, PowerRankings_Preseason: 90,
  SeasonPreview: 90,
  WaiversAndFA: 40,
  Spotlight: 30,
  Blurt: 15,
  Forecast: 75,
  PredictionCallbacks: 30,
  ClancyInsert: 10,
  DraftGrades_Summary: 60,
  FinalWord: 30,
  SocialSummary: 15,
};

function stepEstSeconds(s: string): number {
  if (STEP_EST_SECONDS[s] !== undefined) return STEP_EST_SECONDS[s];
  if (/^Recap_\d+$/.test(s)) return 30;
  if (/^Trade_\d+$/.test(s)) return 90;   // multiple serialized grade calls per trade
  if (/^DraftGrade_\d+$/.test(s)) return 35;
  return 45;
}

// Context build at job start (Sleeper fetches, derived data, DB write) before step 1
const JOB_START_EST_SECONDS = 30;

/**
 * Pre-generation estimate: mirrors getGenerationSteps (compose-step.ts) with typical
 * counts (6 matchups; 1-2 trades), summing the per-step estimates above.
 */
function estimateGenerationSeconds(episodeType: string): number {
  const steps: string[] = ['Intro'];
  const matchupCount = 6;
  const tradeCount = episodeType === 'trade_deadline' ? 2 : 1;

  if (episodeType === 'preseason') steps.push('PowerRankings_Preseason', 'SeasonPreview');

  const isRegularOrPlayoff = ['regular', 'trade_deadline', 'playoffs_preview', 'playoffs_round', 'championship', 'season_finale'].includes(episodeType);
  if (isRegularOrPlayoff) {
    if (episodeType === 'regular') steps.push('PowerRankings');
    for (let i = 0; i < matchupCount; i++) steps.push(`Recap_${i}`);
    steps.push('WaiversAndFA');
    for (let t = 0; t < tradeCount; t++) steps.push(`Trade_${t}`);
    steps.push('Spotlight', 'Blurt');
    if (['regular', 'trade_deadline', 'playoffs_preview', 'playoffs_round'].includes(episodeType)) steps.push('Forecast');
    if (episodeType === 'regular') steps.push('PredictionCallbacks');
    if (['championship', 'trade_deadline', 'playoffs_round', 'regular'].includes(episodeType)) steps.push('ClancyInsert');
  }
  if (episodeType === 'pre_draft') {
    steps.push('PreDraftTrades', 'MockDraft_R1_Mason', 'MockDraft_R1_Westy', 'MockDraft_R2_Mason', 'MockDraft_R2_Westy', 'ClancyInsert');
  }
  if (episodeType === 'post_draft') {
    for (let i = 0; i < 12; i++) steps.push(`DraftGrade_${i}`);
    steps.push('DraftGrades_Summary', 'ClancyInsert');
  }
  steps.push('FinalWord');
  if (isRegularOrPlayoff) steps.push('SocialSummary');

  return JOB_START_EST_SECONDS + steps.reduce((sum, s) => sum + stepEstSeconds(s), 0);
}

function fmtEstimate(totalSeconds: number): string {
  const min = Math.round(totalSeconds / 60);
  return min < 1 ? '<1 min' : `~${min} min`;
}

function fmtElapsed(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface ExistingNewsletter { generatedAt: string; fromCache: boolean }

interface GenState {
  phase: 'idle' | 'starting' | 'running' | 'done' | 'failed';
  steps: string[];
  done: Set<string>;
  failed: Set<string>;
  failedRequired: Set<string>;
  currentStep: string | null;
  /** gen.elapsed value at the moment currentStep started — drives per-step progress credit. */
  currentStepStartElapsed: number;
  totalSteps: number;
  elapsed: number;
  error: string | null;
  html: string | null;
  meta: { leagueName: string; week: number; season: number } | null;
  generatedAt: string | null;
  runId: string | null;
  optionalSkipped: number;
}

const INIT_GEN: GenState = {
  phase: 'idle', steps: [], done: new Set(), failed: new Set(), failedRequired: new Set(),
  currentStep: null, currentStepStartElapsed: 0, totalSteps: 10, elapsed: 0, error: null,
  html: null, meta: null, generatedAt: null, runId: null, optionalSkipped: 0,
};

// ── Main component ────────────────────────────────────────────────────────────

function AdminNewsletterPageInner() {
  // Auth
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // NFL state
  const [nflSeason, setNflSeason] = useState('2025');
  const [nflWeek, setNflWeek] = useState<number | null>(null);

  // Config
  const [season, setSeason] = useState('2025');
  const [week, setWeek] = useState('17');
  const [episodeType, setEpisodeType] = useState('regular');
  const needsWeek = !WEEKLESS.includes(episodeType);

  // Advanced options
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [isFirstEpisodeEver, setIsFirstEpisodeEver] = useState(false);

  // Status check (does a newsletter exist for this week?)
  const [statusLoading, setStatusLoading] = useState(false);
  const [existing, setExisting] = useState<ExistingNewsletter | null>(null);

  // Generation state
  const [gen, setGen] = useState<GenState>(INIT_GEN);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef(0);
  const abortRef = useRef(false);

  // Publish
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit Mode
  const [editMode, setEditMode] = useState(false);
  const [editHtml, setEditHtml] = useState<string | null>(null);
  const [finalizeResult, setFinalizeResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/admin-login', { signal: ctrl.signal })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => setIsAdmin(Boolean(j?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setAuthLoading(false));
    return () => ctrl.abort();
  }, []);

  // ── NFL state + smart defaults ────────────────────────────────────────────

  useEffect(() => {
    fetch('https://api.sleeper.app/v1/state/nfl').then(r => r.json()).then(state => {
      const s = state.season || '2025';
      setNflSeason(s);
      // Default season to current NFL season
      setSeason(s);
      if (state.season_type === 'regular') {
        const w = String(state.week || 1);
        setNflWeek(state.week || 1);
        setWeek(w);
      } else {
        // Offseason: find last published week
        fetch(`/api/newsletter?list=true&season=${s}`).then(r => r.json()).then(data => {
          if (data.weeks?.length > 0) {
            const last = Math.max(...data.weeks);
            setNflWeek(last);
            setWeek(String(last));
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  // ── Status check ──────────────────────────────────────────────────────────

  const checkStatus = useCallback(async (s: string, w: string) => {
    if (!s || (!needsWeek && false)) return;
    setStatusLoading(true);
    setExisting(null);
    try {
      const wNum = needsWeek ? (parseInt(w) || 0) : 0;
      const res = await fetch(`/api/newsletter?season=${s}&week=${wNum}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json() as { success: boolean; html?: string; generatedAt?: string; fromCache?: boolean };
        if (data.success && data.html) {
          setExisting({ generatedAt: data.generatedAt ?? '', fromCache: data.fromCache ?? false });
        }
      }
    } catch { /* ignore */ } finally {
      setStatusLoading(false);
    }
  }, [needsWeek]);

  // Recheck when config changes (debounced)
  useEffect(() => {
    if (!isAdmin) return;
    const t = setTimeout(() => checkStatus(season, week), 400);
    return () => clearTimeout(t);
  }, [season, week, episodeType, isAdmin, checkStatus]);

  // ── Elapsed timer ─────────────────────────────────────────────────────────

  function startTimer() {
    startRef.current = Date.now();
    elapsedRef.current = setInterval(() => {
      setGen(g => ({ ...g, elapsed: Math.floor((Date.now() - startRef.current) / 1000) }));
    }, 1000);
  }
  function stopTimer() {
    if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    abortRef.current = false;
    const wNum = needsWeek ? (parseInt(week) || nflWeek || 1) : 0;
    setGen({ ...INIT_GEN, phase: 'starting' });
    setPublishResult(null);
    startTimer();

    try {
      // 1. Start job — builds context, stores in DB, returns step list
      const startRes = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ season, week: wNum, episodeType, forceRegenerate, isFirstEpisodeEver, mode: 'start' }),
      });
      const startData = await startRes.json() as {
        success?: boolean; error?: string; details?: string;
        totalSteps?: number; steps?: string[]; runId?: string;
      };

      if (!startRes.ok || !startData.success) {
        setGen(g => ({ ...g, phase: 'failed', error: startData.error ?? startData.details ?? 'Failed to start job' }));
        stopTimer();
        return;
      }

      const steps = startData.steps ?? [];
      const totalSteps = startData.totalSteps ?? steps.length;
      const runId = startData.runId ?? null;
      // Mark step 1 as running immediately — the first step request is in flight
      // from here, and mock-draft first steps can run 3+ minutes.
      setGen(g => ({
        ...g, phase: 'running', steps, totalSteps, runId,
        currentStep: steps[0] ?? null, currentStepStartElapsed: g.elapsed,
      }));

      // 2. Loop through generate-step until done
      let done = false;
      let consecutiveErrors = 0;
      const failedInRun = new Set<string>();
      const failedRequiredInRun = new Set<string>();

      while (!done && !abortRef.current) {
        const stepRes = await fetch('/api/newsletter/generate-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ season: parseInt(season), week: wNum }),
        });

        if (!stepRes.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            setGen(g => ({ ...g, phase: 'failed', error: `Step request failed 3× in a row (HTTP ${stepRes.status})` }));
            break;
          }
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        consecutiveErrors = 0;

        const stepData = await stepRes.json() as {
          done?: boolean; step?: string; nextStep?: string; status?: string;
          isRequiredStep?: boolean; completedCount?: number;
          failedSteps?: string[]; missingRequiredSteps?: string[];
          failedRequiredSteps?: string[]; error?: string;
          validation?: { passed: boolean; missing: string[]; issues: string[] };
        };

        done = stepData.done ?? false;

        // Track failures
        if (stepData.failedSteps) {
          for (const s of stepData.failedSteps) failedInRun.add(s);
        }

        if (stepData.status === 'step_failed_required' && stepData.step) {
          failedRequiredInRun.add(stepData.step);
          failedInRun.add(stepData.step);
          setGen(g => ({
            ...g,
            currentStep: null,
            failed: new Set(failedInRun),
            failedRequired: new Set(failedRequiredInRun),
            phase: 'failed',
            error: `Required section "${stepLabel(stepData.step!)}" failed — use Retry to continue. Error: ${stepData.error ?? ''}`,
          }));
          break;
        }

        if (stepData.status === 'needs_attention') {
          const blocked = [...(stepData.failedRequiredSteps ?? []), ...(stepData.missingRequiredSteps ?? [])];
          for (const s of blocked) failedRequiredInRun.add(s);
          setGen(g => ({
            ...g, phase: 'failed', failedRequired: new Set(failedRequiredInRun),
            error: `Generation blocked — required sections incomplete: ${blocked.join(', ')}`,
          }));
          break;
        }

        // Update completed/current step in state.
        // Set currentStep to nextStep so the chip shows as running while the next API call is in flight.
        if (stepData.step) {
          setGen(g => {
            const newDone = new Set(g.done);
            const failed = stepData.status === 'step_failed' || stepData.status === 'step_failed_required';
            if (!failed) newDone.add(stepData.step!);
            const nextCurrent = done ? null : (stepData.nextStep ?? null);
            return {
              ...g,
              done: newDone,
              failed: new Set(failedInRun),
              failedRequired: new Set(failedRequiredInRun),
              currentStep: nextCurrent,
              // Reset the per-step clock only when the running step actually changes
              // (a 504-resumed step keeps accruing on the same clock).
              currentStepStartElapsed: nextCurrent !== g.currentStep ? g.elapsed : g.currentStepStartElapsed,
            };
          });
        }

        if (done) break;
        await new Promise(r => setTimeout(r, 300));
      }

      if (done) {
        // 3. Fetch assembled newsletter
        const getRes = await fetch(`/api/newsletter?week=${wNum}&season=${season}`, { cache: 'no-store', credentials: 'include' });
        const getData = await getRes.json() as { success?: boolean; html?: string; generatedAt?: string; newsletter?: { meta: { leagueName: string; week: number; season: number } } };
        if (getData.success && getData.html) {
          setExisting({ generatedAt: getData.generatedAt ?? '', fromCache: false });
          setGen(g => ({
            ...g, phase: 'done', currentStep: null,
            html: getData.html ?? null,
            meta: getData.newsletter?.meta ?? null,
            generatedAt: getData.generatedAt ?? null,
            optionalSkipped: failedInRun.size - failedRequiredInRun.size,
          }));
        } else {
          setGen(g => ({ ...g, phase: 'failed', error: 'Generation completed but newsletter could not be loaded.' }));
        }
      }
    } catch (err) {
      setGen(g => ({ ...g, phase: 'failed', error: err instanceof Error ? err.message : 'Unknown error' }));
    } finally {
      stopTimer();
    }
  };

  // ── Retry a single failed section ─────────────────────────────────────────

  const handleRetry = async (stepName: string) => {
    const wNum = needsWeek ? (parseInt(week) || nflWeek || 1) : 0;
    setGen(g => ({ ...g, currentStep: stepName, currentStepStartElapsed: 0, phase: 'running' }));
    startTimer();

    try {
      let done = false;
      let consecutiveErrors = 0;

      // Run step with override, then continue the normal loop until done
      let useOverride: string | undefined = stepName;
      while (!done) {
        const stepRes = await fetch('/api/newsletter/generate-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ season: parseInt(season), week: wNum, step: useOverride }),
        });
        useOverride = undefined; // only use override for first call

        if (!stepRes.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) break;
          await new Promise(r => setTimeout(r, 3000));
          continue;
        }
        consecutiveErrors = 0;

        const stepData = await stepRes.json() as {
          done?: boolean; step?: string; nextStep?: string; status?: string;
          failedSteps?: string[]; failedRequiredSteps?: string[];
          missingRequiredSteps?: string[];
        };

        done = stepData.done ?? false;

        if (stepData.step) {
          setGen(g => {
            const newDone = new Set(g.done);
            const newFailed = new Set(g.failed);
            const newFailedReq = new Set(g.failedRequired);
            if (stepData.status !== 'step_failed' && stepData.status !== 'step_failed_required') {
              newDone.add(stepData.step!);
              newFailed.delete(stepData.step!);
              newFailedReq.delete(stepData.step!);
            }
            if (stepData.failedSteps) for (const s of stepData.failedSteps) newFailed.add(s);
            const nextCurrent = done ? null : (stepData.nextStep ?? null);
            return {
              ...g, done: newDone, failed: newFailed, failedRequired: newFailedReq,
              currentStep: nextCurrent,
              currentStepStartElapsed: nextCurrent !== g.currentStep ? g.elapsed : g.currentStepStartElapsed,
            };
          });
        }
        if (done) break;
        await new Promise(r => setTimeout(r, 300));
      }

      if (done) {
        const getRes = await fetch(`/api/newsletter?week=${wNum}&season=${season}`, { cache: 'no-store', credentials: 'include' });
        const getData = await getRes.json() as { success?: boolean; html?: string; generatedAt?: string; newsletter?: { meta: { leagueName: string; week: number; season: number } } };
        if (getData.success && getData.html) {
          setGen(g => ({ ...g, phase: 'done', currentStep: null, html: getData.html ?? null, meta: getData.newsletter?.meta ?? null, generatedAt: getData.generatedAt ?? null }));
          setExisting({ generatedAt: getData.generatedAt ?? '', fromCache: false });
        }
      } else {
        setGen(g => ({ ...g, phase: g.failedRequired.size > 0 ? 'failed' : 'done', currentStep: null }));
      }
    } catch (err) {
      setGen(g => ({ ...g, currentStep: null, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      stopTimer();
    }
  };

  // ── Publish ───────────────────────────────────────────────────────────────

  const handlePublish = async () => {
    if (!gen.html || !gen.meta) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/newsletter/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season: parseInt(season), week: parseInt(week) || 0, newsletter: gen.meta, html: editHtml ?? gen.html }),
      });
      const data = await res.json() as { message?: string; error?: string };
      setPublishResult({ ok: res.ok, message: data.message ?? data.error ?? (res.ok ? 'Published!' : 'Failed') });
    } catch (err) {
      setPublishResult({ ok: false, message: err instanceof Error ? err.message : 'Publish failed' });
    } finally {
      setPublishing(false);
    }
  };

  // ── Edit Mode ─────────────────────────────────────────────────────────────

  const openEditMode = (fromExisting = false) => {
    if (!fromExisting && !gen.html) return;
    setEditMode(true);
    setFinalizeResult(null);
    setEditHtml(null);
    // When opening from existing (no generation), populate gen.html from the DB
    if (fromExisting && !gen.html) {
      const wNum = needsWeek ? (parseInt(week) || 0) : 0;
      fetch(`/api/newsletter?week=${wNum}&season=${season}`, { cache: 'no-store', credentials: 'include' })
        .then(r => r.json())
        .then((data: { html?: string; newsletter?: { meta?: unknown } }) => {
          if (data.html) {
            setGen(g => ({
              ...g,
              phase: 'done',
              html: data.html!,
              meta: (data.newsletter?.meta ?? null) as GenState['meta'],
            }));
          }
        })
        .catch(console.error);
    }
  };

  const closeEditMode = () => {
    setEditMode(false);
    setFinalizeResult(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    const wNum = needsWeek ? (parseInt(week) || 0) : 0;
    try {
      const res = await fetch(`/api/newsletter?week=${wNum}&season=${season}`, { method: 'DELETE' });
      if (res.ok) { setExisting(null); setConfirmDelete(false); setGen(INIT_GEN); }
    } catch { /* ignore */ }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  const isGenerating = gen.phase === 'starting' || gen.phase === 'running';

  // Duration-weighted progress: a mock-draft step (~3 min) moves the bar ~5x more
  // than an Intro (~40s). The in-flight step earns partial credit from its elapsed
  // time, capped at 95% of its estimate so the bar never overtakes reality.
  const totalWeight = gen.steps.reduce((sum, s) => sum + stepEstSeconds(s), 0);
  const handledWeight = gen.steps
    .filter(s => gen.done.has(s) || gen.failed.has(s))
    .reduce((sum, s) => sum + stepEstSeconds(s), 0);
  const currentCredit = (gen.currentStep && !gen.done.has(gen.currentStep) && !gen.failed.has(gen.currentStep))
    ? Math.min(Math.max(0, gen.elapsed - gen.currentStepStartElapsed), stepEstSeconds(gen.currentStep) * 0.95)
    : 0;
  const percent = gen.phase === 'done' ? 100
    : gen.steps.length > 0 && totalWeight > 0
      ? Math.round(5 + ((handledWeight + currentCredit) / totalWeight) * 95)
      : gen.phase === 'starting' ? 3 : 0;
  const remainingSeconds = gen.steps.length > 0
    ? Math.max(0, totalWeight - handledWeight - currentCredit)
    : estimateGenerationSeconds(episodeType);

  // ── Auth guards ───────────────────────────────────────────────────────────

  if (authLoading) return (
    <div className="container mx-auto px-4 py-16 text-center text-zinc-500">Checking auth...</div>
  );
  if (!isAdmin) return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Admin: Newsletter Generator" />
      <Card><CardContent className="py-8 text-center text-zinc-500">Admin access required. <Link href="/login" className="underline text-zinc-300">Log in</Link>.</CardContent></Card>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <SectionHeader title="Newsletter Generator" />
        <div className="flex items-center gap-2">
          <Link href="/admin/newsletter/section-lab">
            <Button variant="secondary" size="sm">🧪 Section Lab</Button>
          </Link>
          <Link href="/admin/newsletter/personality">
            <Button variant="secondary" size="sm">🎭 Personality</Button>
          </Link>
          <Link href="/newsletter">
            <Button variant="ghost" size="sm">View Newsletter →</Button>
          </Link>
        </div>
      </div>

      {/* Row 1: Config + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-4">

        {/* Config (3 cols) */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="py-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div>
                  <Label className="mb-1 block text-xs">Season</Label>
                  <Input type="number" min={2020} max={2030} value={season}
                    onChange={e => setSeason(e.target.value)} disabled={isGenerating} />
                </div>

                {needsWeek && (
                  <div>
                    <Label className="mb-1 block text-xs">Week</Label>
                    <Input type="number" min={0} max={17} value={week}
                      onChange={e => setWeek(e.target.value)} disabled={isGenerating} />
                  </div>
                )}

                <div className={needsWeek ? 'col-span-2' : 'col-span-3'}>
                  <Label className="mb-1 block text-xs">Episode Type</Label>
                  <select
                    value={episodeType}
                    onChange={e => { setEpisodeType(e.target.value); }}
                    disabled={isGenerating}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                  >
                    <optgroup label="Regular Season">
                      <option value="regular">📅 Weekly Recap</option>
                      <option value="trade_deadline">🔔 Trade Deadline</option>
                      <option value="playoffs_preview">🏈 Playoffs Preview</option>
                      <option value="playoffs_round">🏆 Playoff Round</option>
                      <option value="championship">👑 Championship</option>
                      <option value="season_finale">🎬 Season Finale</option>
                    </optgroup>
                    <optgroup label="Offseason">
                      <option value="pre_draft">📋 Pre-Draft</option>
                      <option value="post_draft">📊 Post-Draft Grades</option>
                      <option value="preseason">🌟 Preseason Preview</option>
                      <option value="offseason">💤 Offseason Update</option>
                    </optgroup>
                  </select>
                </div>
              </div>

              {season !== nflSeason && (
                <p className="text-xs text-amber-400 mb-3">⚠️ Season {season} — current NFL season is {nflSeason}</p>
              )}
              {!needsWeek && (
                <p className="text-xs text-blue-300 mb-3">ℹ️ This episode type doesn&apos;t use a week number.</p>
              )}

              {/* Advanced */}
              <div className="mb-4">
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1"
                >
                  {showAdvanced ? '▾' : '▸'} Advanced options
                </button>
                {showAdvanced && (
                  <div className="mt-3 space-y-2 pl-3 border-l border-zinc-700">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={isFirstEpisodeEver}
                        onChange={e => setIsFirstEpisodeEver(e.target.checked)} className="rounded" />
                      <span><span className="text-blue-400">First episode ever</span> — bots introduce themselves</span>
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={forceRegenerate}
                        onChange={e => setForceRegenerate(e.target.checked)} className="rounded" />
                      <span>Force overwrite existing newsletter</span>
                    </label>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  variant="primary"
                  className="flex-1"
                >
                  {isGenerating ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      Generating...
                    </span>
                  ) : existing ? '🔄 Regenerate Newsletter' : '⚡ Generate Newsletter'}
                </Button>
                <span className="text-xs text-zinc-500 whitespace-nowrap">{fmtEstimate(estimateGenerationSeconds(episodeType))}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status (2 cols) */}
        <div className="lg:col-span-2">
          <Card className="h-full">
            <CardContent className="py-5">
              <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
                S{season}{needsWeek ? ` W${week}` : ''} Status
              </div>

              {statusLoading && (
                <div className="text-sm text-zinc-500 animate-pulse">Checking...</div>
              )}

              {!statusLoading && existing && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-emerald-400 text-lg leading-none">✓</span>
                    <div>
                      <div className="text-sm font-medium text-emerald-400">Newsletter exists</div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {existing.generatedAt
                          ? new Date(existing.generatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : 'Date unknown'}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Link href="/newsletter" className="flex-1">
                      <Button variant="secondary" size="sm" className="w-full text-xs">View →</Button>
                    </Link>
                    {!editMode && (
                      <Button variant="secondary" size="sm" className="text-xs" onClick={() => openEditMode(true)}>✏️ Edit</Button>
                    )}
                    {!confirmDelete ? (
                      <Button variant="ghost" size="sm" className="text-red-400 hover:text-red-300 text-xs"
                        onClick={() => setConfirmDelete(true)}>🗑️ Delete</Button>
                    ) : (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="text-zinc-400 text-xs" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                        <Button variant="ghost" size="sm" className="text-red-400 text-xs" onClick={handleDelete}>Confirm delete</Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {!statusLoading && !existing && (
                <div className="flex items-start gap-2">
                  <span className="text-zinc-500 text-lg leading-none">○</span>
                  <div>
                    <div className="text-sm text-zinc-400">No newsletter yet</div>
                    <div className="text-xs text-zinc-500 mt-0.5">Click Generate to create one.</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Row 2: Progress (during generation) */}
      {isGenerating && (
        <Card className="mb-4">
          <CardContent className="py-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-medium text-white">
                  {gen.phase === 'starting' ? '📡 Fetching data & building context...' : `⚙️ Generating sections`}
                </div>
                {gen.currentStep && (() => {
                  const isMockDraft = /^MockDraft_/.test(gen.currentStep!);
                  const deepThinkingSteps = ['PowerRankings','PowerRankings_Preseason','Forecast'];
                  const mediumThinkingSteps = ['Intro','FinalWord','DraftGrades_Summary'];
                  if (isMockDraft) return <div className="text-[10px] text-amber-400/80 mt-0.5">🧠 {stepLabel(gen.currentStep!)} — two deep-reasoning passes, ~3 min for this section</div>;
                  if (deepThinkingSteps.includes(gen.currentStep!)) return <div className="text-[10px] text-amber-400/80 mt-0.5">🧠 Claude is reasoning deeply — this section may take 60–90s</div>;
                  if (mediumThinkingSteps.includes(gen.currentStep!)) return <div className="text-[10px] text-blue-400/60 mt-0.5">🧠 Claude is thinking…</div>;
                  return null;
                })()}
              </div>
              <div className="text-sm font-mono text-zinc-400">
                {fmtElapsed(gen.elapsed)} elapsed
                {gen.phase === 'running' && gen.steps.length > 0 && (
                  <span className="text-zinc-500"> · {fmtEstimate(remainingSeconds)} left</span>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-zinc-800 rounded-full h-2 mb-4 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--primary)] to-amber-500 rounded-full transition-all duration-700"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* Section chips — one per step, colour-coded by state */}
            {gen.steps.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {gen.steps.map(s => {
                  const isDone    = gen.done.has(s);
                  const isFailReq = gen.failedRequired.has(s);
                  const isFail    = gen.failed.has(s) && !isFailReq;
                  const isCurrent = gen.currentStep === s;
                  const cls = isFailReq ? 'bg-red-900/50 text-red-300 border-red-700'
                            : isFail    ? 'bg-amber-900/50 text-amber-300 border-amber-700'
                            : isDone    ? 'bg-emerald-900/50 text-emerald-300 border-emerald-700'
                            : isCurrent ? 'bg-blue-900/50 text-blue-300 border-blue-600'
                            :             'bg-zinc-800/80 text-zinc-500 border-zinc-700';
                  return (
                    <span key={s} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${cls}${isCurrent ? ' animate-pulse' : ''}`}>
                      {isDone    && <span>✓</span>}
                      {isFailReq && <span>✗</span>}
                      {isFail    && <span>⚠</span>}
                      {isCurrent && <span className="inline-block animate-spin leading-none">↻</span>}
                      {stepLabel(s)}
                    </span>
                  );
                })}
              </div>
            )}

            <div className="mt-3 text-xs text-zinc-500">
              {gen.done.size}/{gen.totalSteps} complete
              {gen.failed.size > 0 && ` · ${gen.failed.size} skipped`}
              {' '}· Keep this tab open while generation runs
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 2: Failed sections with retry buttons */}
      {!isGenerating && gen.phase === 'failed' && (
        <Card className="mb-4 border border-red-800">
          <CardContent className="py-4">
            <div className="text-sm font-medium text-red-400 mb-3">⚠️ Generation stopped</div>
            {gen.error && <p className="text-xs text-red-300 mb-3">{gen.error}</p>}
            <div className="flex flex-wrap gap-2">
              {[...gen.failedRequired].map(s => (
                <div key={s} className="flex items-center gap-2 bg-red-900/30 border border-red-700 rounded px-3 py-1.5">
                  <span className="text-xs text-red-300 font-medium">🚫 {stepLabel(s)} (required)</span>
                  <button
                    onClick={() => handleRetry(s)}
                    className="text-xs bg-red-700 hover:bg-red-600 text-white rounded px-2 py-0.5 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ))}
              {[...gen.failed].filter(s => !gen.failedRequired.has(s)).map(s => (
                <div key={s} className="flex items-center gap-2 bg-amber-900/30 border border-amber-700 rounded px-3 py-1.5">
                  <span className="text-xs text-amber-300">⚠️ {stepLabel(s)} (optional)</span>
                  <button
                    onClick={() => handleRetry(s)}
                    className="text-xs bg-amber-700 hover:bg-amber-600 text-white rounded px-2 py-0.5 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Row 2: Newsletter preview (after successful generation) */}
      {gen.phase === 'done' && gen.html && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="text-base">
                  {gen.meta?.leagueName ?? 'East v. West'}
                  {gen.meta?.week ? ` — Week ${gen.meta.week}` : ''}
                </CardTitle>
                <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                  {gen.generatedAt && (
                    <span>Generated {new Date(gen.generatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  )}
                  {gen.runId && <span className="font-mono">runId: {gen.runId}</span>}
                  {gen.optionalSkipped > 0 && (
                    <span className="text-amber-400">⚠️ {gen.optionalSkipped} optional section{gen.optionalSkipped > 1 ? 's' : ''} skipped</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => {
                  const blob = new Blob([editHtml ?? gen.html!], { type: 'text/html' });
                  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `newsletter-s${season}-w${week}.html` });
                  a.click(); URL.revokeObjectURL(a.href);
                }}>⬇️ Download</Button>
                <Button variant="secondary" size="sm" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(editHtml ?? gen.html ?? '');
                  } catch { /* fallback: select all in a temp textarea */
                    const ta = document.createElement('textarea');
                    ta.value = editHtml ?? gen.html ?? '';
                    document.body.appendChild(ta); ta.select();
                    document.execCommand('copy');
                    document.body.removeChild(ta);
                  }
                }}>📋 Copy HTML</Button>
                <Button variant="secondary" size="sm" onClick={() => {
                  const win = window.open('', '_blank');
                  if (!win) return;
                  win.document.write(gen.html!.replace('<head>', `<head><base href="${window.location.origin}">`));
                  win.document.close();
                  win.addEventListener('load', () => win.print());
                }}>🖨️ Print/PDF</Button>
                {!editMode && (
                  <Button variant="secondary" size="sm" onClick={() => openEditMode()}>✏️ Edit Newsletter</Button>
                )}
                {!publishResult?.ok && !editMode && (
                  <Button variant="primary" size="sm" onClick={handlePublish} disabled={publishing}>
                    {publishing ? 'Publishing...' : '🚀 Publish'}
                  </Button>
                )}
                {publishResult?.ok && (
                  <Link href="/newsletter">
                    <Button variant="primary" size="sm">View Published →</Button>
                  </Link>
                )}
              </div>
            </div>
            {publishResult && (
              <div className={`mt-2 text-xs px-3 py-1.5 rounded ${publishResult.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
                {publishResult.ok ? '✅' : '❌'} {publishResult.message}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            <iframe
              srcDoc={editHtml ?? gen.html}
              title="Newsletter Preview"
              className="w-full rounded-b-lg border-0"
              style={{ height: '720px' }}
              sandbox="allow-same-origin"
            />
          </CardContent>
        </Card>
      )}

      {/* Edit Mode Panel */}
      {editMode && gen.phase === 'done' && gen.html && (
        <EditModePanel
          season={season}
          week={week}
          needsWeek={needsWeek}
          html={editHtml ?? gen.html}
          onHtmlUpdate={html => { setEditHtml(html); setGen(g => ({ ...g, html })); }}
          onClose={closeEditMode}
          onPublish={handlePublish}
          publishing={publishing}
          finalizeResult={finalizeResult}
          setFinalizeResult={setFinalizeResult}
        />
      )}

    </div>
  );
}

export default function AdminNewsletterPage() {
  return (
    <ErrorBoundary>
      <AdminNewsletterPageInner />
    </ErrorBoundary>
  );
}
