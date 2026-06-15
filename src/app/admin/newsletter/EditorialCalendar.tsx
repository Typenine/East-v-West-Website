'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Label from '@/components/ui/Label';
import Input from '@/components/ui/Input';

// Episode types offered when planning a queue item (mirrors the generator's <select>).
const EPISODE_TYPES: Array<{ value: string; label: string }> = [
  { value: 'regular', label: '📅 Weekly Recap' },
  { value: 'trade_deadline', label: '🔔 Trade Deadline' },
  { value: 'playoffs_preview', label: '🏈 Playoffs Preview' },
  { value: 'playoffs_round', label: '🏆 Playoff Round' },
  { value: 'championship', label: '👑 Championship' },
  { value: 'season_finale', label: '🎬 Season Finale' },
  { value: 'pre_draft', label: '📋 Pre-Draft' },
  { value: 'post_draft', label: '📊 Post-Draft Grades' },
  { value: 'preseason', label: '🌟 Preseason Preview' },
  { value: 'offseason', label: '💤 Offseason Update' },
];
const WEEKLESS = ['pre_draft', 'post_draft', 'preseason', 'offseason'];

interface QueueItem {
  id: string;
  season: number;
  week: number | null;
  episodeType: string;
  scheduledFor: string;
  status: 'queued' | 'generating' | 'generated' | 'skipped' | 'failed' | 'published' | 'archived';
  note: string | null;
  generatedAt: string | null;
  error: string | null;
}

const STATUS_STYLES: Record<QueueItem['status'], string> = {
  queued: 'bg-blue-900/40 text-blue-300 border-blue-700',
  generating: 'bg-amber-900/40 text-amber-300 border-amber-600',
  generated: 'bg-emerald-900/40 text-emerald-300 border-emerald-700',
  skipped: 'bg-zinc-800 text-zinc-400 border-zinc-700',
  failed: 'bg-red-900/40 text-red-300 border-red-700',
  published: 'bg-purple-900/40 text-purple-300 border-purple-700',
  archived: 'bg-zinc-800/60 text-zinc-500 border-zinc-700',
};

function episodeLabel(value: string): string {
  return EPISODE_TYPES.find(e => e.value === value)?.label ?? value;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  defaultSeason: string;
  /** Pre-fill the generator config + start a staged generation for this queue item. */
  onGenerateNow: (episodeType: string, season: string, week: string | null) => void;
}

export default function EditorialCalendar({ defaultSeason, onGenerateNow }: Props) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // New-item form
  const [formEpisode, setFormEpisode] = useState('regular');
  const [formSeason, setFormSeason] = useState(defaultSeason);
  const [formWeek, setFormWeek] = useState('');
  const [formWhen, setFormWhen] = useState('');
  const [formNote, setFormNote] = useState('');
  const [saving, setSaving] = useState(false);
  const formNeedsWeek = !WEEKLESS.includes(formEpisode);

  // silent=true skips the loading spinner — used by the auto-refresh poll so the list
  // updates in place without flashing "Loading queue…".
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch('/api/newsletter/queue', { cache: 'no-store', credentials: 'include' });
      const data = await res.json() as { success?: boolean; items?: QueueItem[]; error?: string };
      if (data.success && data.items) { setItems(data.items); setError(null); setLastUpdated(new Date()); }
      else if (!opts?.silent) setError(data.error || 'Failed to load queue');
    } catch (e) {
      if (!opts?.silent) setError(e instanceof Error ? e.message : 'Failed to load queue');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setFormSeason(defaultSeason); }, [defaultSeason]);

  // Auto-refresh: queue items flip queued → generated/failed when the GitHub runner
  // finishes (which can happen at any time, independent of this tab). Poll every 15s
  // so the status updates without a manual page refresh. Pauses when the tab is hidden.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      load({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, [load]);

  const addItem = async () => {
    if (!formWhen) { setError('Pick a scheduled date/time.'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/newsletter/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          season: parseInt(formSeason, 10),
          week: formNeedsWeek && formWeek ? parseInt(formWeek, 10) : null,
          episodeType: formEpisode,
          // datetime-local has no timezone — interpret in the admin's local zone.
          scheduledFor: new Date(formWhen).toISOString(),
          note: formNote || undefined,
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) { setError(data.error || 'Failed to add item'); return; }
      setFormWeek(''); setFormWhen(''); setFormNote('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (id: string, status: QueueItem['status']) => {
    setError(null);
    try {
      const res = await fetch('/api/newsletter/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Couldn't set status to "${status}": ${(data as { error?: string }).error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to update item`);
    }
    await load();
  };

  const removeItem = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/newsletter/queue?id=${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Couldn't delete: ${(data as { error?: string }).error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to delete item`);
    }
    await load();
  };

  const visible = items.filter(i => showArchived || i.status !== 'archived');

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">🗓️ Editorial Calendar</CardTitle>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-zinc-500" title="Auto-refreshes every 15s">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {lastUpdated ? `updated ${lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'live'}
              <button onClick={() => load()} className="ml-1 underline hover:text-zinc-300" title="Refresh now">↻</button>
            </span>
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="rounded" />
              Show archived
            </label>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Plan episodes by type + generation time. At the scheduled time the runner generates a <strong>draft</strong> — it never autopublishes and never posts Discord. Publish manually when ready.
        </p>
      </CardHeader>
      <CardContent>
        {/* Add form */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end mb-4">
          <div className="col-span-2 sm:col-span-2">
            <Label className="mb-1 block text-xs">Episode</Label>
            <select
              value={formEpisode}
              onChange={e => setFormEpisode(e.target.value)}
              className="w-full px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
            >
              {EPISODE_TYPES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-xs">Season</Label>
            <Input type="number" min={2020} max={2030} value={formSeason} onChange={e => setFormSeason(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1 block text-xs">Week</Label>
            <Input type="number" min={0} max={17} value={formWeek} disabled={!formNeedsWeek}
              placeholder={formNeedsWeek ? '' : 'n/a'} onChange={e => setFormWeek(e.target.value)} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <Label className="mb-1 block text-xs">Generate at</Label>
            <input type="datetime-local" value={formWhen} onChange={e => setFormWhen(e.target.value)}
              className="w-full px-2 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-xs focus:outline-none focus:ring-2 focus:ring-[var(--primary)]" />
          </div>
          <div className="col-span-2 sm:col-span-6 flex items-end gap-2">
            <div className="flex-1">
              <Label className="mb-1 block text-xs">Note (optional)</Label>
              <Input type="text" value={formNote} onChange={e => setFormNote(e.target.value)} placeholder="e.g. trade-deadline special" />
            </div>
            <Button variant="primary" size="sm" onClick={addItem} disabled={saving}>
              {saving ? 'Adding…' : '+ Queue'}
            </Button>
          </div>
        </div>

        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}

        {/* List */}
        {loading ? (
          <div className="text-sm text-zinc-500 animate-pulse py-4">Loading queue…</div>
        ) : visible.length === 0 ? (
          <div className="text-sm text-zinc-500 py-4 text-center">No queued episodes. Add one above.</div>
        ) : (
          <div className="space-y-2">
            {visible.map(item => (
              <div key={item.id} className="flex items-center gap-3 flex-wrap border border-zinc-800 rounded-lg px-3 py-2">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-medium ${STATUS_STYLES[item.status]}${item.status === 'generating' ? ' animate-pulse' : ''}`}>
                  {item.status === 'generating' && <span className="inline-block animate-spin leading-none">↻</span>}
                  {item.status === 'generating' ? 'generating…' : item.status}
                </span>
                <span className="text-sm text-white">{episodeLabel(item.episodeType)}</span>
                <span className="text-xs text-zinc-400">
                  S{item.season}{item.week != null ? ` · W${item.week}` : ''} · {fmtDateTime(item.scheduledFor)}
                </span>
                {item.note && <span className="text-xs text-zinc-500 italic truncate max-w-[200px]">{item.note}</span>}
                {item.error && <span className="text-xs text-red-400 truncate max-w-[260px]" title={item.error}>⚠ {item.error}</span>}
                <div className="ml-auto flex items-center gap-1.5">
                  {(item.status === 'failed' || item.status === 'skipped') && (
                    <Button variant="secondary" size="sm" className="text-xs text-amber-300"
                      title="Re-queue this item so the next scheduled run retries it"
                      onClick={() => patchStatus(item.id, 'queued')}>
                      ↻ Retry
                    </Button>
                  )}
                  <Button variant="secondary" size="sm" className="text-xs"
                    onClick={() => onGenerateNow(item.episodeType, String(item.season), item.week != null ? String(item.week) : null)}>
                    Generate now
                  </Button>
                  {item.status !== 'archived' && (
                    <Button variant="ghost" size="sm" className="text-xs text-zinc-400" onClick={() => patchStatus(item.id, 'archived')}>Archive</Button>
                  )}
                  <Button variant="ghost" size="sm" className="text-xs text-red-400" onClick={() => removeItem(item.id)}>🗑</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
