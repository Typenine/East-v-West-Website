'use client';

import { useState, useEffect, useRef, Component, ReactNode } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Label from '@/components/ui/Label';
import Input from '@/components/ui/Input';

interface GenerationResult {
  success: boolean;
  error?: string;
  details?: string; // Detailed error message from server
  newsletter?: {
    meta: {
      leagueName: string;
      week: number;
      season: number;
    };
  };
  html?: string;
  generatedAt?: string;
  fromCache?: boolean;
  stats?: {
    matchups: number;
    trades: number;
    waivers: number;
  };
}

// Detect if running on Vercel (production deployment)
const IS_VERCEL = typeof window !== 'undefined' && (
  window.location.hostname.includes('vercel.app') ||
  window.location.hostname === 'eastvswest.football' ||
  window.location.hostname.endsWith('.eastvswest.football')
);

// Error boundary to prevent crashes from taking down the page
class NewsletterErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardContent className="py-8">
            <div className="text-center">
              <div className="text-red-400 font-medium mb-2">⚠️ Component Error</div>
              <p className="text-[var(--muted)] text-sm mb-4">
                Something went wrong in the newsletter panel. The page is still usable.
              </p>
              <p className="text-xs font-mono text-red-300 mb-4">{this.state.error?.message}</p>
              <Button onClick={() => this.setState({ hasError: false, error: null })} variant="secondary">
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

function AdminNewsletterPageInner() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false); // Track if we've checked admin status
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ percent: number; stage: string; elapsed: number; sectionsCompleted: string[] } | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generatingStartRef = useRef<number>(0);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [currentSeason, setCurrentSeason] = useState('2025');
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const [seasonType, setSeasonType] = useState('off');
  const [weekInput, setWeekInput] = useState('17'); // Default to last week
  const [seasonInput, setSeasonInput] = useState('2025'); // User-editable season override
  const [episodeType, setEpisodeType] = useState<string>('regular'); // Episode type selector
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [previewMode, setPreviewMode] = useState(true); // Default to preview for safety
  const [showPreviewHtml, setShowPreviewHtml] = useState(false);

  const isOffseason = seasonType !== 'regular';

  // Episode types that don't need a week number
  const weeklessEpisodes = ['pre_draft', 'post_draft', 'preseason', 'offseason'];
  const needsWeek = !weeklessEpisodes.includes(episodeType);

  // Estimate total LLM calls for the selected episode type (12-team league = 6 matchups)
  const GAP_MINUTES = 3;
  function estimateLLMCalls(type: string): number {
    const matchups = 6;
    const base = 2 + 2 + 2 + 4; // intro + finalWord + blurt + llmFeatures
    switch (type) {
      case 'regular':
      case 'trade_deadline':
      case 'playoffs_preview':
      case 'playoffs_round':
      case 'championship':
        return base + matchups + 4 + 2 + (matchups + 2); // recaps + powerRankings + spotlight + forecast
      case 'preseason':
        return base + 4 + 2 + (matchups + 2); // powerRankings + seasonPreview + forecast
      case 'pre_draft':
      case 'post_draft':
        return base + 4; // draft sections
      case 'offseason':
        return base;
      default:
        return base + matchups + 4 + 2 + (matchups + 2);
    }
  }
  const estimatedCalls = estimateLLMCalls(episodeType);
  const estimatedMinutes = estimatedCalls * GAP_MINUTES;
  const estimatedHours = Math.floor(estimatedMinutes / 60);
  const estimatedMins = estimatedMinutes % 60;
  const estimatedLabel = estimatedHours > 0
    ? `~${estimatedHours}h ${estimatedMins > 0 ? `${estimatedMins}m` : ''}`
    : `~${estimatedMinutes} min`;
  const estimatedNote = `${estimatedCalls} AI calls × ${GAP_MINUTES} min gap = ${estimatedLabel} minimum`;

  // Maps DB section names to human-readable labels
  const SECTION_LABELS: Record<string, string> = {
    Intro:                 '✍️ Intro',
    Blurt:                 '💬 Bot takes (Blurt)',
    Recaps:                '🏈 Matchup recaps',
    WeeklyPowerRankings:   '📈 Power rankings',
    WaiversAndFA:          '💸 Waivers & FA',
    Trades:                '🔄 Trades',
    Spotlight:             '🔦 Spotlight',
    FinalWord:             '📝 Final word',
    PreseasonRankings:     '📈 Preseason rankings',
    SeasonPreview:         '🌟 Season preview',
    DraftPreview:          '📋 Draft preview',
    DraftGrades:           '📊 Draft grades',
  };
  const TOTAL_SECTIONS = 8;

  // Check admin status - single call, no retry loop
  useEffect(() => {
    if (adminChecked) return; // Don't retry
    const controller = new AbortController();
    fetch('/api/admin-login', { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(j => setIsAdmin(Boolean(j?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => { setAdminChecked(true); setLoading(false); });
    return () => controller.abort();
  }, [adminChecked]);

  // Fetch current NFL state and last published newsletter
  useEffect(() => {
    fetch('https://api.sleeper.app/v1/state/nfl')
      .then(r => r.json())
      .then(state => {
        const detectedSeason = state.season || '2025';
        setCurrentSeason(detectedSeason);
        // Default season input to the PREVIOUS season for testing (current season has no game data yet)
        // Only set if user hasn't already typed something different
        setSeasonInput(prev => prev === '2025' ? (parseInt(detectedSeason) - 1).toString() : prev);
        setSeasonType(state.season_type || 'off');
        
        // During season, use current week; offseason, fetch last published
        const inSeason = state.season_type === 'regular';
        if (inSeason) {
          setCurrentWeek(state.week || 1);
          setWeekInput(String(state.week || 1));
        } else {
          // Offseason - get last published newsletter week
          fetch(`/api/newsletter?list=true&season=${state.season || '2025'}`)
            .then(r => r.json())
            .then(data => {
              if (data.weeks?.length > 0) {
                const lastWeek = Math.max(...data.weeks);
                setCurrentWeek(lastWeek);
                setWeekInput(String(lastWeek));
              } else {
                setCurrentWeek(null);
                setWeekInput('17');
              }
            })
            .catch(() => {
              setCurrentWeek(null);
              setWeekInput('17');
            });
        }
      })
      .catch(() => {});
  }, []);

  const stopPolling = () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (elapsedIntervalRef.current) { clearInterval(elapsedIntervalRef.current); elapsedIntervalRef.current = null; }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);
    generatingStartRef.current = Date.now();
    setProgress({ percent: 2, stage: '📡 Fetching Sleeper data & building context...', elapsed: 0, sectionsCompleted: [] });

    stopPolling();

    // Elapsed timer — updates every second
    elapsedIntervalRef.current = setInterval(() => {
      setProgress(prev => prev ? { ...prev, elapsed: Math.floor((Date.now() - generatingStartRef.current) / 1000) } : prev);
    }, 1000);

    // Real progress polling — every 3s, reads sectionsCompleted from DB
    const pollWeek = needsWeek ? (parseInt(weekInput, 10) || currentWeek || 1) : 0;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/newsletter?progress=true&season=${seasonInput}&week=${pollWeek}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json() as {
          status?: string;
          currentSection?: string | null;
          sectionsCompleted?: string[];
        };
        const completed = data.sectionsCompleted ?? [];
        const current = data.currentSection ?? null;
        const completedCount = completed.length;
        // Reserve first 5% for data fetch, last 5% for rendering
        const sectionPercent = Math.round(5 + (completedCount / TOTAL_SECTIONS) * 90);
        const label = current
          ? `⚙️ Generating: ${SECTION_LABELS[current] ?? current}...`
          : completedCount > 0
            ? `⏳ Waiting for next section (${completedCount}/${TOTAL_SECTIONS} done)`
            : '📡 Fetching Sleeper data & building context...';
        setProgress(prev => prev
          ? { ...prev, percent: Math.min(94, sectionPercent), stage: label, sectionsCompleted: completed }
          : prev
        );
      } catch { /* best-effort poll */ }
    }, 3000);

    try {
      const week = pollWeek;
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          week,
          season: seasonInput,
          episodeType,
          forceRegenerate,
          preview: previewMode,
        }),
      });

      const ct = res.headers.get('content-type') || '';
      type ErrorResult = { success: false; error: string; details?: string; [k: string]: unknown };
      let data: GenerationResult | ErrorResult;
      if (ct.includes('application/json')) {
        try {
          data = await res.json();
        } catch {
          const txt = await res.text().catch(() => '');
          data = { success: false, error: 'Invalid JSON response from server', details: txt.slice(0, 2000) };
        }
      } else {
        const txt = await res.text().catch(() => '');
        data = { success: false, error: `Server returned ${res.status}`, details: txt.slice(0, 2000) };
      }
      if (!res.ok && data && typeof data === 'object') {
        data.success = false;
        if (!data.error) data.error = `HTTP ${res.status}`;
      }
      const elapsed = Math.floor((Date.now() - generatingStartRef.current) / 1000);
      setProgress(prev => ({ ...(prev ?? { sectionsCompleted: [] }), percent: 100, stage: '✅ Complete!', elapsed }));
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      stopPolling();
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Admin: Newsletter" />
        <div className="text-center py-12 text-[var(--muted)]">Loading...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="container mx-auto px-4 py-8">
        <SectionHeader title="Admin: Newsletter" />
        <Card>
          <CardContent className="py-8">
            <p className="text-[var(--muted)] text-center">
              Admin access required. Use the Admin login on /login.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <SectionHeader title="Admin: Newsletter Generator" />
        <Link href="/newsletter">
          <Button variant="ghost" size="sm">View Newsletter Page →</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Generation Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Newsletter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="p-3 bg-zinc-800/50 rounded-lg text-sm">
                <div className="text-[var(--muted)]">Current NFL State</div>
                <div className="font-medium">
                  Season {currentSeason} • {isOffseason ? (
                    <span className="text-amber-400">Offseason</span>
                  ) : (
                    `Week ${currentWeek}`
                  )}
                </div>
              </div>

              <div>
                <Label className="mb-1 block">Season Year</Label>
                <Input
                  type="number"
                  min={2020}
                  max={2030}
                  value={seasonInput}
                  onChange={(e) => setSeasonInput(e.target.value)}
                  placeholder={currentSeason}
                />
                {seasonInput !== currentSeason && (
                  <p className="text-xs text-amber-400 mt-1">
                    ⚠️ Using season {seasonInput} for testing (current NFL season is {currentSeason})
                  </p>
                )}
              </div>

              <div>
                <Label className="mb-1 block">Episode Type</Label>
                <select
                  value={episodeType}
                  onChange={(e) => setEpisodeType(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <optgroup label="Regular Season">
                    <option value="regular">📅 Weekly Recap</option>
                    <option value="trade_deadline">🔔 Trade Deadline Special</option>
                    <option value="playoffs_preview">🏈 Playoffs Preview</option>
                    <option value="playoffs_round">🏆 Playoff Round Recap</option>
                    <option value="championship">👑 Championship Edition</option>
                    <option value="season_finale">🎬 Season Finale</option>
                  </optgroup>
                  <optgroup label="Offseason">
                    <option value="pre_draft">📋 Pre-Draft Preview</option>
                    <option value="post_draft">📊 Post-Draft Grades</option>
                    <option value="preseason">🌟 Preseason Preview</option>
                    <option value="offseason">💤 Offseason Update</option>
                  </optgroup>
                </select>
              </div>

              {needsWeek && (
                <div>
                  <Label className="mb-1 block">Week Number</Label>
                  <Input
                    type="number"
                    min={1}
                    max={17}
                    value={weekInput}
                    onChange={(e) => setWeekInput(e.target.value)}
                    placeholder={String(currentWeek)}
                  />
                </div>
              )}

              {!needsWeek && (
                <div className="p-2 bg-blue-900/30 border border-blue-600 rounded text-sm text-blue-300">
                  ℹ️ This episode type doesn&apos;t require a specific week number.
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="previewMode"
                  checked={previewMode}
                  onChange={(e) => setPreviewMode(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="previewMode" className="cursor-pointer">
                  <span className="text-amber-400">Preview mode</span> (test without publishing)
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="forceRegenerate"
                  checked={forceRegenerate}
                  onChange={(e) => setForceRegenerate(e.target.checked)}
                  className="rounded"
                  disabled={previewMode}
                />
                <Label htmlFor="forceRegenerate" className={`cursor-pointer ${previewMode ? 'opacity-50' : ''}`}>
                  Force regenerate (overwrite existing)
                </Label>
              </div>

              {previewMode && (
                <div className="p-2 bg-amber-900/30 border border-amber-600 rounded text-sm text-amber-300">
                  ⚠️ Preview mode: Newsletter will be generated but NOT saved. Users won&apos;t see it.
                </div>
              )}

              {/* Block generation on Vercel - it will timeout */}
              {IS_VERCEL && (
                <div className="p-3 bg-red-900/30 border border-red-600 rounded text-sm space-y-2">
                  <div className="font-medium text-red-400">🚫 Generation Disabled on Deployed Site</div>
                  <p className="text-red-300">
                    Newsletter generation takes ~3 minutes and exceeds Vercel&apos;s serverless timeout.
                    Use one of these methods instead:
                  </p>
                  <div className="space-y-1 text-xs">
                    <div><strong>GitHub Actions (recommended):</strong></div>
                    <a 
                      href="https://github.com/Typenine/East-v-West-Website/actions/workflows/newsletter-scheduler.yml"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-blue-400 hover:underline"
                    >
                      → Open Newsletter Scheduler workflow
                    </a>
                    <div className="text-[var(--muted)] mt-1">
                      Click &quot;Run workflow&quot; → set episode_type, week, preview=true
                    </div>
                  </div>
                  <div className="space-y-1 text-xs mt-2">
                    <div><strong>Local CLI:</strong></div>
                    <code className="block bg-black/30 px-2 py-1 rounded text-green-300">
                      node scripts/run-newsletter.mjs --preview --episode {episodeType} --week {weekInput}
                    </code>
                  </div>
                </div>
              )}

              <div className="p-2 bg-zinc-800/40 border border-zinc-700 rounded text-xs text-zinc-400">
                ⏱️ {estimatedNote}
                <span className="block text-zinc-500 mt-0.5">Trades &amp; waivers add more time depending on volume.</span>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={generating || IS_VERCEL}
                  variant={previewMode ? 'secondary' : 'primary'}
                  title={IS_VERCEL ? 'Generation disabled on deployed site - use GitHub Actions' : undefined}
                >
                  {generating ? 'Generating...' : IS_VERCEL ? '🚫 Disabled (use GH Actions)' : previewMode ? '👁️ Preview Newsletter' : '📰 Publish Newsletter'}
                </Button>
                <Button
                  onClick={async () => {
                    const week = parseInt(weekInput, 10) || currentWeek;
                    if (!confirm(`Delete newsletter for Season ${seasonInput} Week ${week}? This cannot be undone.`)) return;
                    try {
                      const res = await fetch(`/api/newsletter?week=${week}&season=${seasonInput}`, { method: 'DELETE' });
                      const data = await res.json();
                      setResult(data);
                    } catch (err) {
                      setResult({ success: false, error: err instanceof Error ? err.message : 'Delete failed' });
                    }
                  }}
                  variant="ghost"
                  className="text-red-400 hover:text-red-300"
                >
                  🗑️ Delete Newsletter
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Result Display */}
        <Card>
          <CardHeader>
            <CardTitle>Generation Result</CardTitle>
          </CardHeader>
          <CardContent>
            {generating ? (
              <div className="py-6 space-y-4">
                {/* Large percentage display */}
                <div className="text-center">
                  <div className="text-5xl font-bold text-[var(--primary)]">
                    {progress?.percent ?? 0}%
                  </div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    {progress?.elapsed
                      ? `${Math.floor((progress.elapsed) / 60)}:${((progress.elapsed) % 60).toString().padStart(2, '0')} elapsed`
                      : 'Starting...'}
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white font-medium">{progress?.stage || 'Initializing...'}</span>
                    <span className="text-[var(--primary)] font-mono">
                      {(progress?.sectionsCompleted?.length ?? 0)}/{TOTAL_SECTIONS} sections
                    </span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[var(--primary)] to-amber-500 rounded-full transition-all duration-700 ease-out"
                      style={{ width: `${progress?.percent ?? 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-[var(--muted)]">
                    <span>0%</span>
                    <span>Est. {estimatedLabel} ({estimatedCalls} calls × {GAP_MINUTES} min)</span>
                    <span>100%</span>
                  </div>
                </div>

                {/* Completed sections checklist */}
                {(progress?.sectionsCompleted?.length ?? 0) > 0 && (
                  <div className="p-3 bg-zinc-800/50 rounded-lg space-y-1">
                    <div className="text-xs text-[var(--muted)] mb-2">Completed sections:</div>
                    {progress!.sectionsCompleted.map(s => (
                      <div key={s} className="text-xs text-emerald-400 flex items-center gap-1">
                        <span>✓</span>
                        <span>{SECTION_LABELS[s] ?? s}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Spinner */}
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--primary)]"></div>
                </div>

                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-300">
                  💡 <strong>Quality mode:</strong> Each AI call has a {GAP_MINUTES}-minute gap to stay safely
                  under rate limits. This episode type needs ~{estimatedCalls} calls, so expect {estimatedLabel} minimum
                  (more if there are trades or waivers). Progress updates every 3 seconds. Don&apos;t close this tab.
                </div>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {result.success ? (
                  <>
                    <div className="p-3 bg-emerald-900/30 border border-emerald-600 rounded-lg">
                      <div className="font-medium text-emerald-400">✅ Success!</div>
                      <div className="text-sm mt-1">
                        {result.newsletter?.meta.leagueName} — Week {result.newsletter?.meta.week}
                      </div>
                      {result.fromCache && (
                        <div className="text-xs text-[var(--muted)] mt-1">
                          (Loaded from cache)
                        </div>
                      )}
                    </div>

                    {result.stats && (
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="p-2 bg-zinc-800/50 rounded">
                          <div className="text-2xl font-bold">{result.stats.matchups}</div>
                          <div className="text-xs text-[var(--muted)]">Matchups</div>
                        </div>
                        <div className="p-2 bg-zinc-800/50 rounded">
                          <div className="text-2xl font-bold">{result.stats.trades}</div>
                          <div className="text-xs text-[var(--muted)]">Trades</div>
                        </div>
                        <div className="p-2 bg-zinc-800/50 rounded">
                          <div className="text-2xl font-bold">{result.stats.waivers}</div>
                          <div className="text-xs text-[var(--muted)]">Waivers</div>
                        </div>
                      </div>
                    )}

                    {result.generatedAt && (
                      <div className="text-sm text-[var(--muted)]">
                        Generated: {new Date(result.generatedAt).toLocaleString()}
                      </div>
                    )}

                    {result.html && (
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          className="flex-1"
                          onClick={() => setShowPreviewHtml(!showPreviewHtml)}
                        >
                          {showPreviewHtml ? '🔼 Hide Preview' : '👁️ View HTML'}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            // Download HTML — open in Chrome then Ctrl+P → Save as PDF
                            const blob = new Blob([result.html!], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `newsletter-s${seasonInput}-w${weekInput}.html`;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          ⬇️ Download HTML
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            // Open in new tab with logos resolved, then print → Save as PDF
                            const printWindow = window.open('', '_blank');
                            if (!printWindow) return;
                            const baseTag = `<base href="${window.location.origin}">`;
                            const html = result.html!.replace('<head>', `<head>${baseTag}`);
                            printWindow.document.write(html);
                            printWindow.document.close();
                            printWindow.addEventListener('load', () => printWindow.print());
                          }}
                        >
                          🖨️ Print / PDF
                        </Button>
                      </div>
                    )}

                    {!previewMode && (
                      <Link href="/newsletter">
                        <Button variant="ghost" className="w-full">
                          View Published Newsletter →
                        </Button>
                      </Link>
                    )}
                  </>
                ) : (
                  <div className="p-3 bg-red-900/30 border border-red-600 rounded-lg">
                    <div className="font-medium text-red-400">❌ Error</div>
                    <div className="text-sm mt-1">{result.error}</div>
                    {result.details && (
                      <div className="text-xs mt-2 p-2 bg-red-950/50 rounded font-mono break-all">
                        {result.details}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-[var(--muted)]">
                <p>Click &quot;Generate Newsletter&quot; to create a new issue.</p>
                <p className="text-sm mt-2">
                  The generator will fetch data from Sleeper and create analysis
                  from both AI personalities.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Preview HTML Display */}
      {showPreviewHtml && result?.html && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Newsletter Preview</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowPreviewHtml(false)}>
                  ✕ Close
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div 
                className="newsletter-preview bg-white text-black rounded-lg overflow-auto max-h-[600px]"
                dangerouslySetInnerHTML={{ __html: result.html }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Info Section */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-[var(--foreground)]">
              <ol className="space-y-2">
                <li>
                  <strong>Data Fetch:</strong> Pulls matchups, rosters, transactions from Sleeper API
                </li>
                <li>
                  <strong>Analysis:</strong> Scores events by relevance, builds matchup pairs
                </li>
                <li>
                  <strong>Memory Update:</strong> Updates trust/frustration scores for each team
                </li>
                <li>
                  <strong>Composition:</strong> Two AI personalities generate commentary for each section
                </li>
                <li>
                  <strong>Forecast:</strong> Both bots make predictions for next week&apos;s matchups
                </li>
                <li>
                  <strong>Render:</strong> Outputs formatted HTML newsletter
                </li>
              </ol>
              <p className="mt-4 text-[var(--muted)]">
                ✓ Database persistence enabled. Bot memory, forecast records, and published newsletters are saved to the database.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Wrap with error boundary for resilience
export default function AdminNewsletterPage() {
  return (
    <NewsletterErrorBoundary>
      <AdminNewsletterPageInner />
    </NewsletterErrorBoundary>
  );
}
