'use client';

import { useState, useEffect } from 'react';
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

export default function AdminNewsletterPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [currentSeason, setCurrentSeason] = useState('2025');
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const [seasonType, setSeasonType] = useState('off');
  const [weekInput, setWeekInput] = useState('17'); // Default to last week
  const [episodeType, setEpisodeType] = useState<string>('regular'); // Episode type selector
  const [forceRegenerate, setForceRegenerate] = useState(false);
  const [previewMode, setPreviewMode] = useState(true); // Default to preview for safety
  const [showPreviewHtml, setShowPreviewHtml] = useState(false);

  const isOffseason = seasonType !== 'regular';
  
  // Episode types that don't need a week number
  const weeklessEpisodes = ['pre_draft', 'post_draft', 'preseason', 'offseason'];
  const needsWeek = !weeklessEpisodes.includes(episodeType);

  // Check admin status
  useEffect(() => {
    fetch('/api/admin-login')
      .then(r => r.json())
      .then(j => setIsAdmin(Boolean(j?.isAdmin)))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, []);

  // Fetch current NFL state and last published newsletter
  useEffect(() => {
    fetch('https://api.sleeper.app/v1/state/nfl')
      .then(r => r.json())
      .then(state => {
        setCurrentSeason(state.season || '2025');
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

  const handleGenerate = async () => {
    setGenerating(true);
    setResult(null);

    try {
      const week = needsWeek ? (parseInt(weekInput, 10) || currentWeek) : 0;
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for admin auth
        body: JSON.stringify({
          week,
          season: currentSeason,
          episodeType, // Include episode type for special episodes
          forceRegenerate,
          preview: previewMode, // Don't save to DB in preview mode
        }),
      });

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
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

              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  variant={previewMode ? 'secondary' : 'primary'}
                >
                  {generating ? 'Generating...' : previewMode ? '👁️ Preview Newsletter' : '📰 Publish Newsletter'}
                </Button>
                <Button
                  onClick={async () => {
                    const week = parseInt(weekInput, 10) || currentWeek;
                    if (!confirm(`Delete newsletter for Season ${currentSeason} Week ${week}? This cannot be undone.`)) return;
                    try {
                      const res = await fetch(`/api/newsletter?week=${week}&season=${currentSeason}`, { method: 'DELETE' });
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
                <div className="text-center">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
                </div>
                
                {/* Progress indicator */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[var(--muted)]">Generating newsletter...</span>
                    <span className="text-[var(--primary)]">~2-4 minutes</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-[var(--primary)] to-amber-500 rounded-full"
                      style={{ animation: 'progress 180s linear forwards' }}
                    />
                  </div>
                </div>

                <div className="text-sm text-[var(--muted)] space-y-2">
                  <p>📡 Fetching data from Sleeper API...</p>
                  <p>🤖 Generating AI commentary with full conversational context...</p>
                  <p className="text-xs text-zinc-500">
                    (Each bot turn sees previous responses for natural back-and-forth. 
                    Rate-limited to 3s between calls to stay within free tier.)
                  </p>
                  <p>📝 Building newsletter sections...</p>
                </div>

                <div className="mt-4 p-3 bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-300">
                  💡 <strong>Why so long?</strong> To preserve nuanced dialogue where bots actually respond to each other, 
                  we make multiple LLM calls per matchup with delays to stay within free API limits. 
                  This gives you real personality and back-and-forth, not generic commentary.
                </div>

                <style jsx>{`
                  @keyframes progress {
                    0% { width: 3%; }
                    10% { width: 12%; }
                    25% { width: 30%; }
                    50% { width: 55%; }
                    75% { width: 78%; }
                    90% { width: 88%; }
                    100% { width: 95%; }
                  }
                `}</style>
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
                      <Button 
                        variant="secondary" 
                        className="w-full"
                        onClick={() => setShowPreviewHtml(!showPreviewHtml)}
                      >
                        {showPreviewHtml ? '🔼 Hide Preview' : '👁️ View Generated HTML'}
                      </Button>
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
