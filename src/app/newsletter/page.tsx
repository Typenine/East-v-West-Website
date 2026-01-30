'use client';

import { useState, useEffect } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface NewsletterData {
  newsletter: {
    meta: {
      leagueName: string;
      week: number;
      date: string;
      season: number;
    };
    sections: Array<{ type: string; data: unknown }>;
  };
  html: string;
  generatedAt: string;
  fromCache: boolean;
}

interface NFLState {
  season: string;
  week: number;
  season_type: string;
}

export default function NewsletterPage() {
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [loading, setLoading] = useState(true); // Start loading
  const [error, setError] = useState<string | null>(null);
  const [newsletterData, setNewsletterData] = useState<NewsletterData | null>(null);
  const [currentSeason, setCurrentSeason] = useState<string>('2025');
  const [currentWeek, setCurrentWeek] = useState<number | null>(null); // Start null until we know
  const [seasonType, setSeasonType] = useState<string>('off');
  const [availableWeeks, setAvailableWeeks] = useState<number[]>([]);

  // Generate weeks 1-17 for the archive
  const weeks = Array.from({ length: 17 }, (_, i) => i + 1);

  // Check if we're in offseason
  const isOffseason = seasonType !== 'regular' && seasonType !== 'post';

  // Fetch current NFL state and available newsletters on mount
  useEffect(() => {
    // Get NFL state first
    fetch('https://api.sleeper.app/v1/state/nfl')
      .then(r => r.json())
      .then((state: NFLState) => {
        setCurrentSeason(state.season || '2025');
        setSeasonType(state.season_type || 'off');
        
        // Then get available newsletters
        return fetch(`/api/newsletter?list=true&season=${state.season || '2025'}`);
      })
      .then(r => r.json())
      .then(data => {
        if (data.weeks && Array.isArray(data.weeks)) {
          setAvailableWeeks(data.weeks);
          
          if (data.weeks.length > 0) {
            // Default to latest available newsletter
            const latestWeek = Math.max(...data.weeks);
            setCurrentWeek(latestWeek);
          } else {
            // No newsletters exist - show null (triggers offseason/empty message)
            setCurrentWeek(null);
          }
        } else {
          // No data - show null
          setCurrentWeek(null);
        }
        setLoading(false);
      })
      .catch(() => {
        setCurrentWeek(null);
        setLoading(false);
      });
  }, []);

  // Fetch newsletter when week changes
  useEffect(() => {
    const week = selectedWeek || currentWeek;
    if (!week) return;

    setLoading(true);
    setError(null);

    fetch(`/api/newsletter?season=${currentSeason}&week=${week}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setNewsletterData(data);
        } else {
          setNewsletterData(null);
          // Don't show error for "not found" - just show empty state
          if (data.error !== 'Newsletter not found') {
            setError(data.error || 'Failed to load newsletter');
          }
        }
      })
      .catch(err => {
        setError(err.message || 'Failed to load newsletter');
        setNewsletterData(null);
      })
      .finally(() => setLoading(false));
  }, [selectedWeek, currentWeek, currentSeason]);

  const displayWeek = selectedWeek || currentWeek;

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Weekly Newsletter" />

      {/* Offseason Banner */}
      {isOffseason && (
        <div className="max-w-4xl mx-auto mb-4">
          <div className="p-3 bg-amber-900/30 border border-amber-600 rounded-lg text-center">
            <span className="text-amber-300 font-medium">🏈 Offseason</span>
            <span className="text-amber-200 ml-2">
              — Browse the archive below for past newsletters. New issues return when the season starts!
            </span>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {selectedWeek 
                  ? `Week ${selectedWeek} Newsletter` 
                  : currentWeek 
                    ? `Week ${currentWeek} Newsletter`
                    : 'Weekly Newsletter'}
              </CardTitle>
              {selectedWeek && (
                <Button variant="ghost" size="sm" onClick={() => setSelectedWeek(null)}>
                  ← Back to Latest
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
                <p className="mt-4 text-[var(--muted)]">Loading...</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <p className="text-[var(--danger)]">{error}</p>
              </div>
            ) : newsletterData ? (
              <div>
                <div className="mb-4 text-sm text-[var(--muted)] flex items-center justify-between">
                  <span>
                    {newsletterData.newsletter.meta.leagueName} • Season {newsletterData.newsletter.meta.season}
                  </span>
                  <span>
                    Generated: {new Date(newsletterData.generatedAt).toLocaleString()}
                  </span>
                </div>
                {/* Render the HTML content */}
                <div
                  className="newsletter-content"
                  dangerouslySetInnerHTML={{ __html: newsletterData.html }}
                  style={{
                    // Override some inline styles for better integration
                    background: 'transparent',
                  }}
                />
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">📰</div>
                {isOffseason ? (
                  <>
                    <p className="text-lg font-medium mb-2">It&apos;s the Offseason</p>
                    <p className="text-[var(--muted)] mb-6">
                      Check back when the season starts for fresh weekly newsletters!
                    </p>
                    {availableWeeks.length > 0 && (
                      <p className="text-sm text-[var(--muted)]">
                        Browse the archive below to revisit past issues.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-lg font-medium mb-2">Coming Soon</p>
                    <p className="text-[var(--muted)] mb-6">
                      The Week {displayWeek} newsletter is on its way.
                    </p>
                    <p className="text-sm text-[var(--muted)] italic">
                      New issues drop every Wednesday morning at 6 AM ET.
                    </p>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Archive Section */}
      <div className="mt-8 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Archive</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-9 gap-2">
              {weeks.map((week) => {
                const hasNewsletter = availableWeeks.includes(week);
                const isSelected = selectedWeek === week || (!selectedWeek && currentWeek !== null && week === currentWeek);
                return (
                  <Button
                    key={week}
                    variant={isSelected ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={() => setSelectedWeek(week === selectedWeek ? null : week)}
                    className={!hasNewsletter ? 'opacity-40' : ''}
                    title={hasNewsletter ? `View Week ${week} Newsletter` : 'No newsletter available'}
                  >
                    Wk {week}
                  </Button>
                );
              })}
            </div>
            {availableWeeks.length === 0 && (
              <p className="text-center text-[var(--muted)] mt-4 text-sm">
                No newsletters have been published yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Info Section */}
      <div className="mt-8 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>About the Newsletter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-[var(--foreground)]">
              <p>
                Get your weekly dose of East v. West drama, delivered fresh every Wednesday morning.
              </p>
              <p className="mt-4">
                Each issue features dueling perspectives from our two resident commentators:
              </p>
              <ul className="mt-4 space-y-2">
                <li>
                  <strong>The Entertainer</strong> — Your hype man (or villain). Expect bold takes,
                  hot reactions, and zero mercy for underperformers. If there&apos;s chaos, he&apos;s here for it.
                </li>
                <li>
                  <strong>The Analyst</strong> — The voice of reason. Breaks down the numbers,
                  spots the trends, and makes predictions you can actually trust (most of the time).
                </li>
              </ul>
              <p className="mt-4 text-[var(--muted)]">
                Matchup recaps, trade analysis, waiver wire moves, and predictions for next week —
                all with a side of friendly rivalry. Who will you side with?
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
