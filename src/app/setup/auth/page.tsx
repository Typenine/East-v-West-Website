'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';

type AuthMethod = 'invite' | 'pin' | 'open';

type Team = {
  teamName: string;
  inviteCode: string;
};

export default function SetupAuthPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [authMethod, setAuthMethod] = useState<AuthMethod>('invite');
  const [defaultPin, setDefaultPin] = useState('');
  const [teams, setTeams] = useState<Team[]>([]);

  useEffect(() => {
    async function loadTeams() {
      try {
        const res = await fetch('/api/setup/auth');
        if (res.ok) {
          const data = await res.json();
          if (data.teams) {
            setTeams(data.teams);
          }
        }
      } catch {
        // Teams not loaded yet
      }
    }
    loadTeams();
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      if (authMethod === 'pin' && !defaultPin.trim()) {
        throw new Error('Please enter a default PIN');
      }

      const res = await fetch('/api/setup/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authMethod,
          defaultPin: authMethod === 'pin' ? defaultPin.trim() : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save auth settings');
      }

      router.push('/setup/complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
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
            7
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)] mb-2">
            Team Signup
          </h1>
          <p className="text-[var(--muted)]">
            How should team owners join the site?
          </p>
        </div>

        <Card className="p-6">
          {error && (
            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Invite Links Option */}
            <button
              onClick={() => setAuthMethod('invite')}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                authMethod === 'invite'
                  ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                  authMethod === 'invite' ? 'border-[var(--accent)]' : 'border-[var(--muted)]'
                }`}>
                  {authMethod === 'invite' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-[var(--text)]">Unique Invite Links</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    Each team gets a unique link to claim their roster. Most secure option.
                  </div>
                </div>
              </div>
            </button>

            {/* Default PIN Option */}
            <button
              onClick={() => setAuthMethod('pin')}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                authMethod === 'pin'
                  ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                  authMethod === 'pin' ? 'border-[var(--accent)]' : 'border-[var(--muted)]'
                }`}>
                  {authMethod === 'pin' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-[var(--text)]">Default PIN</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    All teams use the same PIN initially, then set their own on first login.
                  </div>
                </div>
              </div>
            </button>

            {/* Open Signup Option */}
            <button
              onClick={() => setAuthMethod('open')}
              className={`w-full text-left p-4 rounded-lg border transition-all ${
                authMethod === 'open'
                  ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                  : 'border-[var(--border)] hover:border-[var(--accent)]/50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                  authMethod === 'open' ? 'border-[var(--accent)]' : 'border-[var(--muted)]'
                }`}>
                  {authMethod === 'open' && (
                    <div className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                  )}
                </div>
                <div>
                  <div className="font-medium text-[var(--text)]">Open Signup</div>
                  <div className="text-sm text-[var(--muted)] mt-1">
                    Teams claim their roster by selecting from a list. Easiest but least secure.
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* PIN Input */}
          {authMethod === 'pin' && (
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <Label htmlFor="defaultPin">Default PIN</Label>
              <Input
                id="defaultPin"
                type="text"
                value={defaultPin}
                onChange={(e) => setDefaultPin(e.target.value)}
                placeholder="e.g., league2024"
                className="mt-1"
              />
              <p className="text-xs text-[var(--muted)] mt-1">
                Share this with your league members. They&apos;ll set their own PIN on first login.
              </p>
            </div>
          )}

          {/* Invite Codes Preview */}
          {authMethod === 'invite' && teams.length > 0 && (
            <div className="mt-6 pt-6 border-t border-[var(--border)]">
              <p className="text-sm font-medium text-[var(--text)] mb-3">Team Invite Codes</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {teams.map((team) => (
                  <div
                    key={team.inviteCode}
                    className="flex items-center justify-between p-2 rounded bg-[var(--surface)] text-sm"
                  >
                    <span className="text-[var(--text)]">{team.teamName}</span>
                    <code className="text-[var(--accent)] font-mono">{team.inviteCode}</code>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--muted)] mt-2">
                You can copy these codes after setup to share with team owners.
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-6 mt-6 border-t border-[var(--border)]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push('/setup/admin')}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Saving...' : 'Complete Setup'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
