'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';

type SleeperLeagueInfo = {
  name: string;
  totalRosters: number;
  status: string;
  season: string;
  scoringSettings: string;
  rosters: Array<{ rosterId: number; ownerName: string; teamName: string }>;
};

type HistoricalLeague = {
  year: string;
  leagueId: string;
  validated: boolean;
  info?: SleeperLeagueInfo;
  error?: string;
};

export default function SetupSleeperPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [currentLeagueId, setCurrentLeagueId] = useState('');
  const [currentLeagueInfo, setCurrentLeagueInfo] = useState<SleeperLeagueInfo | null>(null);
  const [historicalLeagues, setHistoricalLeagues] = useState<HistoricalLeague[]>([]);
  const [showHistorical, setShowHistorical] = useState(false);

  const validateLeagueId = async (leagueId: string): Promise<SleeperLeagueInfo | null> => {
    try {
      // Fetch league info from Sleeper API
      const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}`);
      if (!leagueRes.ok) return null;
      const league = await leagueRes.json();

      // Fetch rosters
      const rostersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/rosters`);
      const rosters = rostersRes.ok ? await rostersRes.json() : [];

      // Fetch users
      const usersRes = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/users`);
      const users = usersRes.ok ? await usersRes.json() : [];

      // Map users to rosters
      const userMap = new Map(users.map((u: { user_id: string; display_name: string; metadata?: { team_name?: string } }) => [
        u.user_id,
        { displayName: u.display_name, teamName: u.metadata?.team_name }
      ]));

      const rosterInfo = rosters.map((r: { roster_id: number; owner_id: string }) => {
        const user = userMap.get(r.owner_id) as { displayName: string; teamName?: string } | undefined;
        return {
          rosterId: r.roster_id,
          ownerName: user?.displayName || `Owner ${r.roster_id}`,
          teamName: user?.teamName || user?.displayName || `Team ${r.roster_id}`,
        };
      });

      return {
        name: league.name,
        totalRosters: league.total_rosters,
        status: league.status,
        season: league.season,
        scoringSettings: league.scoring_settings?.rec === 1 ? 'PPR' : 
                        league.scoring_settings?.rec === 0.5 ? 'Half PPR' : 'Standard',
        rosters: rosterInfo,
      };
    } catch {
      return null;
    }
  };

  const handleValidateCurrent = async () => {
    if (!currentLeagueId.trim()) {
      setError('Please enter a Sleeper League ID');
      return;
    }

    setValidating(true);
    setError(null);

    const info = await validateLeagueId(currentLeagueId.trim());
    
    if (info) {
      setCurrentLeagueInfo(info);
    } else {
      setError('Could not find that league. Please check the ID and try again.');
    }

    setValidating(false);
  };

  const handleAddHistorical = () => {
    const currentYear = new Date().getFullYear();
    const existingYears = new Set(historicalLeagues.map(h => h.year));
    
    // Find next available year going backwards
    let year = currentYear - 1;
    while (existingYears.has(String(year)) && year > 2015) {
      year--;
    }

    setHistoricalLeagues([
      ...historicalLeagues,
      { year: String(year), leagueId: '', validated: false }
    ]);
  };

  const handleHistoricalChange = (index: number, field: 'year' | 'leagueId', value: string) => {
    setHistoricalLeagues(prev => prev.map((h, i) => 
      i === index ? { ...h, [field]: value, validated: false, info: undefined, error: undefined } : h
    ));
  };

  const handleValidateHistorical = async (index: number) => {
    const league = historicalLeagues[index];
    if (!league.leagueId.trim()) return;

    setHistoricalLeagues(prev => prev.map((h, i) => 
      i === index ? { ...h, validated: false, error: undefined } : h
    ));

    const info = await validateLeagueId(league.leagueId.trim());
    
    setHistoricalLeagues(prev => prev.map((h, i) => 
      i === index ? { 
        ...h, 
        validated: !!info, 
        info: info || undefined,
        error: info ? undefined : 'Invalid league ID'
      } : h
    ));
  };

  const handleRemoveHistorical = (index: number) => {
    setHistoricalLeagues(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!currentLeagueInfo) {
      setError('Please validate your current league first');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build sleeper_league_ids object
      const sleeperLeagueIds: Record<string, string> = {
        [currentLeagueInfo.season]: currentLeagueId.trim()
      };
      
      historicalLeagues.forEach(h => {
        if (h.validated && h.leagueId.trim()) {
          sleeperLeagueIds[h.year] = h.leagueId.trim();
        }
      });

      const res = await fetch('/api/setup/sleeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sleeperLeagueId: currentLeagueId.trim(),
          sleeperLeagueIds,
          teams: currentLeagueInfo.rosters,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save Sleeper settings');
      }

      router.push('/setup/branding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push('/setup')}
            className="text-[var(--muted)] hover:text-[var(--text)] flex items-center gap-1 text-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to overview
          </button>
        </div>

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--accent)] text-white text-lg font-bold mb-4">
            2
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">
            Sleeper Integration
          </h1>
          <p className="text-[var(--muted)]">
            Connect your Sleeper league to import teams and data
          </p>
        </div>

        <Card className="p-6">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-6">
            {/* Current League */}
            <div>
              <Label htmlFor="currentLeagueId">Current Season League ID *</Label>
              <div className="flex gap-2">
                <Input
                  id="currentLeagueId"
                  type="text"
                  value={currentLeagueId}
                  onChange={(e) => {
                    setCurrentLeagueId(e.target.value);
                    setCurrentLeagueInfo(null);
                  }}
                  placeholder="e.g., 1234567890123456789"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleValidateCurrent}
                  disabled={validating || !currentLeagueId.trim()}
                >
                  {validating ? 'Checking...' : 'Validate'}
                </Button>
              </div>
              <p className="text-xs text-[var(--muted)] mt-1">
                Find this in your Sleeper app under League Settings → General
              </p>
            </div>

            {/* League Preview */}
            {currentLeagueInfo && (
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
                <div className="flex items-center gap-2 text-green-400 mb-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="font-medium">League Found!</span>
                </div>
                <div className="space-y-1 text-sm">
                  <p><span className="text-[var(--muted)]">Name:</span> {currentLeagueInfo.name}</p>
                  <p><span className="text-[var(--muted)]">Season:</span> {currentLeagueInfo.season}</p>
                  <p><span className="text-[var(--muted)]">Teams:</span> {currentLeagueInfo.totalRosters}</p>
                  <p><span className="text-[var(--muted)]">Scoring:</span> {currentLeagueInfo.scoringSettings}</p>
                </div>
                
                <div className="mt-4">
                  <p className="text-sm font-medium text-[var(--text)] mb-2">Teams:</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {currentLeagueInfo.rosters.map(r => (
                      <div key={r.rosterId} className="text-[var(--muted)]">
                        {r.teamName}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Historical Leagues */}
            {currentLeagueInfo && (
              <div className="border-t border-[var(--border)] pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-medium text-[var(--text)]">Historical Leagues</h3>
                    <p className="text-xs text-[var(--muted)]">Optional: Add previous seasons for history features</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowHistorical(!showHistorical)}
                  >
                    {showHistorical ? 'Hide' : 'Add'}
                  </Button>
                </div>

                {showHistorical && (
                  <div className="space-y-3">
                    {historicalLeagues.map((league, index) => (
                      <div key={index} className="flex gap-2 items-start">
                        <Input
                          type="number"
                          value={league.year}
                          onChange={(e) => handleHistoricalChange(index, 'year', e.target.value)}
                          className="w-24"
                          min={2015}
                          max={new Date().getFullYear() - 1}
                        />
                        <Input
                          type="text"
                          value={league.leagueId}
                          onChange={(e) => handleHistoricalChange(index, 'leagueId', e.target.value)}
                          placeholder="League ID"
                          className={`flex-1 ${league.validated ? 'border-green-500' : league.error ? 'border-red-500' : ''}`}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleValidateHistorical(index)}
                          disabled={!league.leagueId.trim()}
                        >
                          {league.validated ? '✓' : 'Check'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveHistorical(index)}
                        >
                          ×
                        </Button>
                      </div>
                    ))}
                    
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleAddHistorical}
                      className="w-full"
                    >
                      + Add Previous Season
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-6 mt-6 border-t border-[var(--border)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/setup/league')}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !currentLeagueInfo}
              className="flex-1"
            >
              {loading ? 'Saving...' : 'Continue'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
