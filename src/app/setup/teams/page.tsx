'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Label from '@/components/ui/Label';

type TeamColor = {
  primary: string;
  secondary: string;
  tertiary?: string;
  quaternary?: string;
};

type Team = {
  rosterId: number;
  teamName: string;
  ownerName: string;
  colors: TeamColor;
};

const DEFAULT_COLORS: TeamColor = {
  primary: '#1a1a2e',
  secondary: '#16213e',
};

export default function SetupTeamsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [expandedTeam, setExpandedTeam] = useState<number | null>(null);

  useEffect(() => {
    async function loadTeams() {
      try {
        const res = await fetch('/api/setup/teams');
        if (res.ok) {
          const data = await res.json();
          if (data.teams) {
            setTeams(data.teams.map((t: { rosterId: number; teamName: string; ownerName: string }) => ({
              ...t,
              colors: DEFAULT_COLORS,
            })));
          }
        }
      } catch {
        // Teams not loaded yet
      }
    }
    loadTeams();
  }, []);

  const handleColorChange = (teamIndex: number, colorKey: keyof TeamColor, value: string) => {
    setTeams(prev => prev.map((team, i) => 
      i === teamIndex 
        ? { ...team, colors: { ...team.colors, [colorKey]: value } }
        : team
    ));
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const teamColors: Record<string, TeamColor> = {};
      teams.forEach(team => {
        teamColors[team.teamName] = team.colors;
      });

      const res = await fetch('/api/setup/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamColors }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save team colors');
      }

      router.push('/setup/rules');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    router.push('/setup/rules');
  };

  return (
    <div className="min-h-screen bg-[var(--background)] py-12 px-4">
      <div className="max-w-2xl mx-auto">
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
            4
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">
            Team Colors
          </h1>
          <p className="text-[var(--muted)]">
            Customize colors for each team (optional)
          </p>
        </div>

        <Card className="p-6">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {teams.length === 0 ? (
            <div className="text-center py-8 text-[var(--muted)]">
              <p>No teams found. Please complete the Sleeper integration step first.</p>
              <Button
                variant="secondary"
                onClick={() => router.push('/setup/sleeper')}
                className="mt-4"
              >
                Go to Sleeper Setup
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {teams.map((team, index) => (
                <div
                  key={team.rosterId}
                  className="border border-[var(--border)] rounded-lg overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedTeam(expandedTeam === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 hover:bg-[var(--surface)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div
                          className="w-4 h-8 rounded-sm"
                          style={{ backgroundColor: team.colors.primary }}
                        />
                        <div
                          className="w-4 h-8 rounded-sm"
                          style={{ backgroundColor: team.colors.secondary }}
                        />
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-[var(--text)]">{team.teamName}</div>
                        <div className="text-xs text-[var(--muted)]">{team.ownerName}</div>
                      </div>
                    </div>
                    <svg
                      className={`w-5 h-5 text-[var(--muted)] transition-transform ${
                        expandedTeam === index ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {expandedTeam === index && (
                    <div className="p-4 border-t border-[var(--border)] bg-[var(--surface)]">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Primary</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="color"
                              value={team.colors.primary}
                              onChange={(e) => handleColorChange(index, 'primary', e.target.value)}
                              className="w-10 h-10 rounded cursor-pointer border border-[var(--border)]"
                            />
                            <input
                              type="text"
                              value={team.colors.primary}
                              onChange={(e) => handleColorChange(index, 'primary', e.target.value)}
                              className="flex-1 px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text)] text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Secondary</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="color"
                              value={team.colors.secondary}
                              onChange={(e) => handleColorChange(index, 'secondary', e.target.value)}
                              className="w-10 h-10 rounded cursor-pointer border border-[var(--border)]"
                            />
                            <input
                              type="text"
                              value={team.colors.secondary}
                              onChange={(e) => handleColorChange(index, 'secondary', e.target.value)}
                              className="flex-1 px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text)] text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Tertiary (optional)</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="color"
                              value={team.colors.tertiary || '#333333'}
                              onChange={(e) => handleColorChange(index, 'tertiary', e.target.value)}
                              className="w-10 h-10 rounded cursor-pointer border border-[var(--border)]"
                            />
                            <input
                              type="text"
                              value={team.colors.tertiary || ''}
                              onChange={(e) => handleColorChange(index, 'tertiary', e.target.value)}
                              placeholder="#333333"
                              className="flex-1 px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text)] text-sm"
                            />
                          </div>
                        </div>
                        <div>
                          <Label>Quaternary (optional)</Label>
                          <div className="flex items-center gap-2 mt-1">
                            <input
                              type="color"
                              value={team.colors.quaternary || '#444444'}
                              onChange={(e) => handleColorChange(index, 'quaternary', e.target.value)}
                              className="w-10 h-10 rounded cursor-pointer border border-[var(--border)]"
                            />
                            <input
                              type="text"
                              value={team.colors.quaternary || ''}
                              onChange={(e) => handleColorChange(index, 'quaternary', e.target.value)}
                              placeholder="#444444"
                              className="flex-1 px-2 py-1 rounded bg-[var(--background)] border border-[var(--border)] text-[var(--text)] text-sm"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Preview */}
                      <div className="mt-4 p-3 rounded-lg border border-[var(--border)]">
                        <p className="text-xs text-[var(--muted)] mb-2">Preview</p>
                        <div className="flex gap-1">
                          <div
                            className="flex-1 h-8 rounded"
                            style={{ backgroundColor: team.colors.primary }}
                          />
                          <div
                            className="flex-1 h-8 rounded"
                            style={{ backgroundColor: team.colors.secondary }}
                          />
                          {team.colors.tertiary && (
                            <div
                              className="flex-1 h-8 rounded"
                              style={{ backgroundColor: team.colors.tertiary }}
                            />
                          )}
                          {team.colors.quaternary && (
                            <div
                              className="flex-1 h-8 rounded"
                              style={{ backgroundColor: team.colors.quaternary }}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-6 mt-6 border-t border-[var(--border)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/setup/branding')}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleSkip}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || teams.length === 0}
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
