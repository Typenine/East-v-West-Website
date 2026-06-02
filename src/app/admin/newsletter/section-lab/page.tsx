'use client';

/**
 * Newsletter Section Lab
 *
 * Generates a single newsletter section in isolation using the exact same
 * compose-step.ts → generateNewsletterSection() path as the full staged generator.
 *
 * Use this to test and debug specific sections (especially Trade_N) without
 * paying LLM credits for the full newsletter.
 *
 * Workflow:
 *   1. (Optional but recommended) Click "Generate (Staged)" on the main admin
 *      page to run mode:start — this builds all data context cheaply (~30s, no LLM).
 *   2. Come here, pick a section, click Generate.
 *   3. Inspect the rendered HTML, raw JSON, and debug info.
 *   4. Iterate without regenerating other sections.
 */

import { useState, useRef } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Label from '@/components/ui/Label';
import Input from '@/components/ui/Input';

// ── Section catalog for each episode type ────────────────────────────────────
// Mirrors getGenerationSteps() from compose-step.ts with generous trade/recap counts.
// The API validates the final sectionName, so this is UI-only.

function labStepsForEpisodeType(et: string): string[] {
  const steps: string[] = ['Intro'];
  if (et === 'regular') {
    steps.push('PowerRankings');
    for (let i = 0; i < 6; i++) steps.push(`Recap_${i}`);
    steps.push('WaiversAndFA');
    for (let t = 0; t < 5; t++) steps.push(`Trade_${t}`);
    steps.push('Spotlight', 'Blurt', 'Forecast', 'PredictionCallbacks', 'ClancyInsert');
  } else if (['trade_deadline', 'playoffs_preview', 'playoffs_round'].includes(et)) {
    for (let i = 0; i < 6; i++) steps.push(`Recap_${i}`);
    steps.push('WaiversAndFA');
    for (let t = 0; t < 4; t++) steps.push(`Trade_${t}`);
    steps.push('Spotlight', 'Blurt', 'Forecast', 'ClancyInsert');
  } else if (['championship', 'season_finale'].includes(et)) {
    for (let i = 0; i < 6; i++) steps.push(`Recap_${i}`);
    steps.push('WaiversAndFA');
    for (let t = 0; t < 3; t++) steps.push(`Trade_${t}`);
    steps.push('Spotlight', 'Blurt', 'ClancyInsert');
  } else if (et === 'preseason') {
    steps.push('PowerRankings_Preseason', 'SeasonPreview');
  } else if (et === 'pre_draft') {
    steps.push('PreDraftTrades', 'MockDraft_R1_Mason', 'MockDraft_R1_Westy', 'MockDraft_R2_Mason', 'MockDraft_R2_Westy', 'ClancyInsert');
  } else if (et === 'post_draft') {
    for (let i = 0; i < 12; i++) steps.push(`DraftGrade_${i}`);
    steps.push('DraftGrades_Summary', 'ClancyInsert');
  }
  steps.push('FinalWord');
  if (['regular', 'trade_deadline', 'playoffs_preview', 'playoffs_round', 'championship', 'season_finale'].includes(et)) {
    steps.push('SocialSummary');
  }
  return steps;
}

// Human-readable labels (extend as needed)
const SECTION_LABELS: Record<string, string> = {
  Intro:                   '✍️  Intro',
  PowerRankings:           '📈 Power Rankings',
  PowerRankings_Preseason: '📈 Preseason Power Rankings',
  WaiversAndFA:            '💸 Waivers & FA',
  Spotlight:               '🔦 Spotlight',
  Blurt:                   '💬 Blurt (hot takes)',
  Forecast:                '🔮 Forecast',
  PredictionCallbacks:     '📣 Prediction Callbacks',
  ClancyInsert:            '📰 Clancy Insert',
  FinalWord:               '📝 Final Word',
  SocialSummary:           '📢 Social Summary',
  PreDraftTrades:          '🔄 Pre-Draft Trades',
  MockDraft_R1_Mason:      '🏈 Mock Draft R1 (Mason)',
  MockDraft_R1_Westy:      '🏈 Mock Draft R1 (Westy)',
  MockDraft_R2_Mason:      '🏈 Mock Draft R2 (Mason)',
  MockDraft_R2_Westy:      '🏈 Mock Draft R2 (Westy)',
  DraftGrades_Summary:     '📊 Draft Grades Summary',
  SeasonPreview:           '🌟 Season Preview',
};
function sectionLabel(step: string): string {
  if (SECTION_LABELS[step]) return SECTION_LABELS[step];
  if (/^Recap_(\d+)$/.test(step))      return `🏈 Matchup Recap ${step.replace('Recap_', '')}`;
  if (/^Trade_(\d+)$/.test(step))      return `🔄 Trade ${parseInt(step.replace('Trade_', '')) + 1}`;
  if (/^DraftGrade_(\d+)$/.test(step)) return `📊 Draft Grade Team ${parseInt(step.replace('DraftGrade_', '')) + 1}`;
  return step;
}

// ── Result types ─────────────────────────────────────────────────────────────

interface LabResult {
  ok: true;
  runId: string;
  season: number;
  week: number;
  episodeType: string;
  sectionName: string;
  generatedAt: string;
  contentHash: string;
  renderedHtml?: string;
  sectionHtml?: string;
  rawSectionData?: unknown;
  usedStagedData?: boolean;
  contextOnly?: boolean;
  debug?: {
    availableSteps?: string[];
    tradeDebug?: unknown;
    sourceDataSummary?: unknown;
    matchupCount?: number;
    tradeCount?: number;
    contextLength?: number;
    contextPreview?: string;
    targetTradeEvent?: unknown;
  };
}

interface LabError {
  ok: false;
  runId?: string;
  error: string;
  debug?: { availableSteps?: string[] };
}

type LabResponse = LabResult | LabError;

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SectionLabPage() {
  const [season,      setSeason]      = useState('2025');
  const [week,        setWeek]        = useState('5');
  const [episodeType, setEpisodeType] = useState('regular');
  const [sectionName, setSectionName] = useState('Trade_0');
  const [debug,       setDebug]       = useState(false);
  const [contextOnly, setContextOnly] = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [result,      setResult]      = useState<LabResponse | null>(null);
  const [activeTab,   setActiveTab]   = useState<'preview' | 'json' | 'debug'>('preview');
  const lastInputRef = useRef<{ season: string; week: string; episodeType: string; sectionName: string; debug: boolean; contextOnly: boolean } | null>(null);

  const steps = labStepsForEpisodeType(episodeType);

  // If the current sectionName is not in the new step list, reset to Intro
  const validSection = steps.includes(sectionName) ? sectionName : steps[0];

  async function generate(overrideName?: string) {
    const name = overrideName ?? validSection;
    setGenerating(true);
    setResult(null);
    lastInputRef.current = { season, week, episodeType, sectionName: name, debug, contextOnly };

    try {
      const res = await fetch('/api/newsletter/generate-section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({
          season: parseInt(season, 10),
          week: parseInt(week, 10) || 0,
          episodeType,
          sectionName: name,
          debug,
          contextOnly,
        }),
      });
      const data = await res.json() as LabResponse;
      setResult(data);
      // Default tab: if contextOnly, show debug; else show preview
      setActiveTab(contextOnly ? 'debug' : 'preview');
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : 'Unknown error' });
    } finally {
      setGenerating(false);
    }
  }

  function regenerate() {
    const last = lastInputRef.current;
    if (!last) return;
    generate(last.sectionName);
  }

  const weeklessEpisodes = ['pre_draft', 'post_draft', 'preseason', 'offseason'];
  const needsWeek = !weeklessEpisodes.includes(episodeType);

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <SectionHeader title="Newsletter Section Lab" />
        <div className="flex items-center gap-2">
          <Link href="/admin/newsletter">
            <Button variant="ghost" size="sm">← Newsletter Admin</Button>
          </Link>
          <Link href="/newsletter">
            <Button variant="ghost" size="sm">View Newsletter →</Button>
          </Link>
        </div>
      </div>

      <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600 rounded text-sm text-blue-200">
        <strong>Section Lab:</strong> Generate one section in isolation using the exact same code path as the full staged generator. Trade sections always re-derive from live Sleeper data.
        <br />
        <span className="text-blue-300 text-xs">Tip: Run &ldquo;Generate (Staged) → Start Job&rdquo; first on the Newsletter Admin page to build data context without spending LLM credits. Then come here to generate specific sections.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Controls */}
        <Card>
          <CardHeader><CardTitle>Section Controls</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1 block">Season</Label>
                  <Input type="number" min={2020} max={2030} value={season}
                    onChange={e => setSeason(e.target.value)} />
                </div>
                {needsWeek && (
                  <div>
                    <Label className="mb-1 block">Week</Label>
                    <Input type="number" min={0} max={17} value={week}
                      onChange={e => setWeek(e.target.value)} />
                  </div>
                )}
              </div>

              <div>
                <Label className="mb-1 block">Episode Type</Label>
                <select
                  value={episodeType}
                  onChange={e => setEpisodeType(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  <optgroup label="Regular Season">
                    <option value="regular">📅 Weekly Recap</option>
                    <option value="trade_deadline">🔔 Trade Deadline</option>
                    <option value="playoffs_preview">🏈 Playoffs Preview</option>
                    <option value="playoffs_round">🏆 Playoff Round Recap</option>
                    <option value="championship">👑 Championship</option>
                    <option value="season_finale">🎬 Season Finale</option>
                  </optgroup>
                  <optgroup label="Offseason">
                    <option value="pre_draft">📋 Pre-Draft Preview</option>
                    <option value="post_draft">📊 Post-Draft Grades</option>
                    <option value="preseason">🌟 Preseason Preview</option>
                    <option value="offseason">💤 Offseason</option>
                  </optgroup>
                </select>
              </div>

              <div>
                <Label className="mb-1 block">Section</Label>
                <select
                  value={validSection}
                  onChange={e => setSectionName(e.target.value)}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                >
                  {steps.map(s => (
                    <option key={s} value={s}>{sectionLabel(s)}</option>
                  ))}
                </select>
                <p className="text-xs text-zinc-400 mt-1">
                  {steps.length} sections available for this episode type.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={debug} onChange={e => setDebug(e.target.checked)} className="rounded" />
                  <span className="text-sm">Debug mode — include source data summary, trade debug info</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={contextOnly} onChange={e => setContextOnly(e.target.checked)} className="rounded" />
                  <span className="text-sm text-amber-300">Context only — skip LLM, show data/trade facts only</span>
                </label>
                {contextOnly && (
                  <p className="text-xs text-amber-400 pl-6">No LLM credit spent. Use this to verify trade facts before generating.</p>
                )}
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={() => generate()}
                  disabled={generating}
                  variant="primary"
                  className="flex-1"
                >
                  {generating
                    ? 'Generating...'
                    : contextOnly
                      ? '🔍 Check Context (no LLM)'
                      : `⚡ Generate ${sectionLabel(validSection)}`}
                </Button>
                {lastInputRef.current && !generating && (
                  <Button onClick={regenerate} variant="secondary" title="Regenerate the same section with a fresh LLM call">
                    🔄 Regenerate
                  </Button>
                )}
              </div>

              {generating && (
                <div className="flex items-center gap-2 text-sm text-zinc-400 animate-pulse">
                  <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-[var(--primary)]" />
                  Generating {validSection}... (may take 30–90s)
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Result metadata */}
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent>
            {!result && !generating && (
              <div className="text-center py-8 text-zinc-500 text-sm">
                <p>No result yet. Choose a section and click Generate.</p>
                <p className="mt-2 text-xs">
                  Only the selected section will be generated — no Intro, Recaps, Forecast, FinalWord, or other steps.
                </p>
              </div>
            )}

            {generating && (
              <div className="py-6 text-center text-zinc-400 text-sm">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)] mb-4" />
                <p>Generating <strong>{validSection}</strong>...</p>
                <p className="text-xs mt-1">This is a single LLM call — should complete in 30–90 seconds.</p>
              </div>
            )}

            {result && !generating && (
              <div className="space-y-3">
                {result.ok ? (
                  <>
                    <div className="p-3 bg-emerald-900/30 border border-emerald-600 rounded-lg">
                      <div className="font-medium text-emerald-400 text-sm mb-2">✅ Section generated</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs font-mono text-zinc-300">
                        <span className="text-zinc-500">runId</span>
                        <span>{result.runId}</span>
                        <span className="text-zinc-500">section</span>
                        <span>{result.sectionName}</span>
                        <span className="text-zinc-500">hash</span>
                        <span className="text-amber-300">{result.contentHash}</span>
                        <span className="text-zinc-500">generatedAt</span>
                        <span>{new Date(result.generatedAt).toLocaleTimeString()}</span>
                        <span className="text-zinc-500">usedStagedData</span>
                        <span className={result.usedStagedData ? 'text-blue-300' : 'text-amber-300'}>
                          {result.usedStagedData ? 'yes (fast path)' : 'no (fresh fetch)'}
                        </span>
                        {result.contextOnly && (
                          <>
                            <span className="text-zinc-500">mode</span>
                            <span className="text-amber-300">context only (no LLM)</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Tabs */}
                    {!result.contextOnly && (
                      <div className="flex gap-1 border-b border-zinc-700">
                        {(['preview', 'json', 'debug'] as const).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-t transition-colors ${
                              activeTab === tab
                                ? 'bg-zinc-700 text-white'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {tab === 'preview' ? '👁️ Preview' : tab === 'json' ? '{ } JSON' : '🔧 Debug'}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-3 bg-red-900/30 border border-red-600 rounded-lg">
                    <div className="font-medium text-red-400 text-sm mb-1">❌ Error</div>
                    <div className="text-xs text-red-300 font-mono break-all">{result.error}</div>
                    {result.debug?.availableSteps && (
                      <div className="mt-2 text-xs text-zinc-400">
                        Valid steps: {result.debug.availableSteps.join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full-width preview / JSON / debug panels */}
      {result?.ok && (
        <div className="mt-6">

          {/* Context-only result */}
          {result.contextOnly && result.debug && (
            <Card>
              <CardHeader>
                <CardTitle>Context Check (no LLM was called)</CardTitle>
              </CardHeader>
              <CardContent>
                <DebugPanel debug={result.debug} contextOnly />
              </CardContent>
            </Card>
          )}

          {/* Section preview */}
          {!result.contextOnly && activeTab === 'preview' && result.renderedHtml && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Rendered Section: {result.sectionName}</CardTitle>
                  <div className="flex gap-2">
                    <span className="text-xs text-zinc-400 font-mono">hash: {result.contentHash}</span>
                    <Button
                      variant="secondary" size="sm"
                      onClick={() => {
                        const blob = new Blob([result.renderedHtml!], { type: 'text/html' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `section-lab-${result.sectionName}-${result.contentHash}.html`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      ⬇️ Download HTML
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <iframe
                  srcDoc={result.renderedHtml}
                  title={`Section preview: ${result.sectionName}`}
                  className="w-full rounded-b-lg border-0"
                  style={{ height: '700px' }}
                  sandbox="allow-same-origin"
                />
              </CardContent>
            </Card>
          )}

          {/* Raw JSON */}
          {!result.contextOnly && activeTab === 'json' && result.rawSectionData !== undefined && (
            <Card>
              <CardHeader><CardTitle>Raw Section Data (JSON)</CardTitle></CardHeader>
              <CardContent>
                <pre className="text-xs text-green-300 bg-zinc-900 rounded p-4 overflow-auto max-h-[600px] whitespace-pre-wrap break-all">
                  {JSON.stringify(result.rawSectionData, null, 2)}
                </pre>
              </CardContent>
            </Card>
          )}

          {/* Debug */}
          {!result.contextOnly && activeTab === 'debug' && (
            <Card>
              <CardHeader><CardTitle>Debug Info</CardTitle></CardHeader>
              <CardContent>
                {result.debug
                  ? <DebugPanel debug={result.debug} />
                  : <p className="text-zinc-400 text-sm">Enable &ldquo;Debug mode&rdquo; and regenerate to see debug info.</p>}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// ── Debug panel component ─────────────────────────────────────────────────────

function DebugPanel({
  debug,
  contextOnly = false,
}: {
  debug: NonNullable<LabResult['debug']>;
  contextOnly?: boolean;
}) {
  return (
    <div className="space-y-4 text-sm">
      {contextOnly && (
        <div className="p-2 bg-amber-900/30 border border-amber-600 rounded text-amber-300 text-xs">
          Context-only mode: LLM was NOT called. Use this to verify data before spending credits.
        </div>
      )}

      {debug.sourceDataSummary != null && (
        <div>
          <div className="font-medium text-zinc-300 mb-1">Source Data</div>
          <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-3 overflow-auto">
            {JSON.stringify(debug.sourceDataSummary as Record<string, unknown>, null, 2)}
          </pre>
        </div>
      )}

      {(debug.matchupCount !== undefined || debug.tradeCount !== undefined) && (
        <div className="grid grid-cols-3 gap-3 text-xs">
          {debug.matchupCount !== undefined && (
            <div className="bg-zinc-800 rounded p-2 text-center">
              <div className="text-xl font-bold text-white">{debug.matchupCount}</div>
              <div className="text-zinc-400">matchup pairs</div>
            </div>
          )}
          {debug.tradeCount !== undefined && (
            <div className="bg-zinc-800 rounded p-2 text-center">
              <div className="text-xl font-bold text-white">{debug.tradeCount}</div>
              <div className="text-zinc-400">trade events</div>
            </div>
          )}
          {debug.contextLength !== undefined && (
            <div className="bg-zinc-800 rounded p-2 text-center">
              <div className="text-xl font-bold text-white">{Math.round(debug.contextLength / 1000)}K</div>
              <div className="text-zinc-400">context chars</div>
            </div>
          )}
        </div>
      )}

      {debug.tradeDebug != null && (
        <div>
          <div className="font-medium text-zinc-300 mb-1">Trade Debug</div>
          <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-3 overflow-auto max-h-64">
            {JSON.stringify(debug.tradeDebug as Record<string, unknown>, null, 2)}
          </pre>
        </div>
      )}

      {debug.targetTradeEvent != null && (
        <div>
          <div className="font-medium text-zinc-300 mb-1">Target Trade Event</div>
          <pre className="text-xs text-zinc-400 bg-zinc-900 rounded p-3 overflow-auto max-h-64">
            {JSON.stringify(debug.targetTradeEvent as Record<string, unknown>, null, 2)}
          </pre>
        </div>
      )}

      {debug.contextPreview && (
        <div>
          <div className="font-medium text-zinc-300 mb-1">Context Preview (first 800 chars)</div>
          <pre className="text-xs text-zinc-500 bg-zinc-900 rounded p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {debug.contextPreview}
          </pre>
        </div>
      )}

      {debug.availableSteps && (
        <div>
          <div className="font-medium text-zinc-300 mb-1">Available Steps for this Episode Type</div>
          <div className="flex flex-wrap gap-1">
            {debug.availableSteps.map(s => (
              <span key={s} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">{s}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
