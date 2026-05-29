'use client';

import { useEffect, useState } from 'react';
import { TEAM_NAMES } from '@/lib/constants/league';
import { getTeamColorStyle } from '@/lib/utils/team-utils';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

type PinInfo = {
  team: string;
  hasPin: boolean;
  updatedAt: string | null;
  pinVersion: number | null;
  isDefault: boolean | null;
};

export default function AdminPinsPage() {
  const [pins, setPins] = useState<PinInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingTeam, setEditingTeam] = useState<string | null>(null);
  const [newPin, setNewPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadPins();
  }, []);

  async function loadPins() {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/pins', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load PINs');
      const data = await res.json();
      setPins(data.teams || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  async function savePin(team: string) {
    if (!newPin || newPin.length < 4) {
      setMessage('PIN must be at least 4 digits');
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/pins', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team, newPin }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save PIN');
      }
      setMessage(`PIN set for ${team}`);
      setEditingTeam(null);
      setNewPin('');
      await loadPins();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Admin • Team PINs" />
      
      <Card>
        <CardHeader>
          <CardTitle>Manage Team PINs</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-[var(--muted)]">Loading…</p>
          ) : error ? (
            <p className="text-[var(--danger)]">{error}</p>
          ) : (
            <>
              {message && (
                <div className="mb-4 p-2 rounded bg-[var(--surface)] border border-[var(--border)] text-sm">
                  {message}
                </div>
              )}
              <div className="space-y-2">
                {pins.map((p) => {
                  const teamStyle = getTeamColorStyle(p.team);
                  const isEditing = editingTeam === p.team;
                  return (
                    <div
                      key={p.team}
                      className="flex items-center justify-between p-3 rounded border border-[var(--border)]"
                      style={{ borderLeftColor: teamStyle?.backgroundColor as string, borderLeftWidth: 4 }}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{p.team}</span>
                        {p.hasPin ? (
                          <>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-600 text-white">Has PIN</span>
                            {p.isDefault && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-600 text-white">Default</span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-500 text-white">No PIN</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="New PIN (4-12 digits)"
                              value={newPin}
                              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 12))}
                              className="w-40 px-2 py-1 text-sm border border-[var(--border)] rounded"
                              disabled={saving}
                            />
                            <button
                              onClick={() => savePin(p.team)}
                              disabled={saving}
                              className="px-3 py-1 text-sm rounded bg-green-600 text-white disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => { setEditingTeam(null); setNewPin(''); }}
                              disabled={saving}
                              className="px-3 py-1 text-sm rounded border border-[var(--border)]"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => { setEditingTeam(p.team); setNewPin(''); setMessage(null); }}
                            className="px-3 py-1 text-sm rounded border border-[var(--border)] hover:bg-[var(--surface)]"
                          >
                            {p.hasPin ? 'Reset PIN' : 'Set PIN'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
