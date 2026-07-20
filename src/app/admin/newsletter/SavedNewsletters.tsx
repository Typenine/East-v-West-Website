'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface NewsletterMeta {
  id: string;
  title: string | null;
  season: number;
  week: number;
  leagueName: string;
  episodeType: string | null;
  status: 'draft' | 'published';
  generatedAt: string;
  publishedAt: string | null;
  discordPostedAt: string | null;
  updatedAt: string | null;
}

interface WebhookHealth {
  configured: boolean;
  reachable: boolean;
  status: number | null;
  error: string | null;
  message: string;
}

const STORAGE_WEEK_TO_TYPE: Record<number, string> = {
  900: 'preseason',
  901: 'pre_draft',
  902: 'post_draft',
  903: 'offseason',
};

const EPISODE_LABELS: Record<string, string> = {
  regular: 'Weekly Recap',
  trade_deadline: 'Trade Deadline',
  playoffs_preview: 'Playoffs Preview',
  playoffs_round: 'Playoff Round',
  championship: 'Championship',
  season_finale: 'Season Finale',
  pre_draft: 'Pre-Draft',
  post_draft: 'Post-Draft Grades',
  preseason: 'Preseason',
  offseason: 'Offseason',
};

function resolveType(item: NewsletterMeta): string {
  return item.episodeType || STORAGE_WEEK_TO_TYPE[item.week] || 'regular';
}

function weekLabel(item: NewsletterMeta): string | null {
  const type = resolveType(item);
  if (STORAGE_WEEK_TO_TYPE[item.week] || ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(type)) return null;
  return `Week ${item.week}`;
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  season: string;
  onSelect: (season: string, week: number, episodeType: string) => void;
  reloadKey?: number;
}

export default function SavedNewsletters({ season, onSelect, reloadKey }: Props) {
  const [items, setItems] = useState<NewsletterMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webhook, setWebhook] = useState<WebhookHealth | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/newsletter?list=true&season=${encodeURIComponent(season)}&draft=1`, { cache: 'no-store', credentials: 'include' });
      const data = await response.json() as { items?: NewsletterMeta[]; error?: string };
      if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error ?? 'Failed to load newsletters');
      setItems(data.items);
      setError(null);
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : 'Failed to load newsletters');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [season]);

  const loadWebhook = useCallback(async () => {
    try {
      const response = await fetch('/api/newsletter/publish', { cache: 'no-store', credentials: 'include' });
      const data = await response.json() as WebhookHealth;
      setWebhook(response.ok ? data : { configured: false, reachable: false, status: response.status, error: data.message, message: data.message || 'Unable to verify webhook' });
    } catch (loadError) {
      setWebhook({ configured: false, reachable: false, status: null, error: String(loadError), message: 'Unable to verify newsletter Discord webhook.' });
    }
  }, []);

  useEffect(() => { void load(); void loadWebhook(); }, [load, loadWebhook, reloadKey]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 20_000);
    return () => clearInterval(timer);
  }, [load]);

  const publish = async (item: NewsletterMeta, sendDiscord: boolean) => {
    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch('/api/newsletter/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: item.id, season: item.season, week: item.week, sendDiscord }),
      });
      const data = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || data.success === false) throw new Error(data.error ?? data.message ?? 'Publish failed');
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : 'Publish failed');
    } finally {
      setBusyId(null);
      setConfirmPublish(null);
      await Promise.all([load(true), loadWebhook()]);
    }
  };

  const remove = async (item: NewsletterMeta) => {
    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch(`/api/newsletter?id=${encodeURIComponent(item.id)}`, { method: 'DELETE', credentials: 'include' });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Delete failed');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Delete failed');
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
      await load(true);
    }
  };

  const saveRename = async (item: NewsletterMeta) => {
    const title = renameValue.trim();
    if (!title || title === item.title) {
      setRenamingId(null);
      return;
    }
    setBusyId(item.id);
    try {
      const response = await fetch('/api/newsletter', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ id: item.id, title }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Rename failed');
      setRenamingId(null);
      await load(true);
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Rename failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Saved Newsletters — {season}</CardTitle>
            <p className="mt-1 text-xs text-zinc-500">Edit opens the exact stored issue by immutable newsletter ID. Open Generator only changes the generator controls.</p>
          </div>
          <div className="flex items-center gap-2">
            {webhook && <span title={webhook.message} className={`rounded border px-2 py-1 text-[11px] ${webhook.configured && webhook.reachable ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-red-700 bg-red-950/40 text-red-300'}`}>Discord {webhook.configured && webhook.reachable ? 'ready' : 'not ready'}</span>}
            <button onClick={() => { void load(); void loadWebhook(); }} className="text-[11px] text-zinc-500 underline hover:text-zinc-300">Refresh</button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && <div className="mb-3 rounded border border-red-800 bg-red-950/30 px-3 py-2 text-xs text-red-300">{error}</div>}
        {loading ? <div className="py-5 text-sm text-zinc-500">Loading…</div> : items.length === 0 ? <div className="py-5 text-center text-sm text-zinc-500">No saved newsletters for {season}.</div> : (
          <div className="space-y-2">
            {items.map(item => {
              const type = resolveType(item);
              const week = weekLabel(item);
              const busy = busyId === item.id;
              return (
                <div key={item.id} className="rounded-lg border border-zinc-800 p-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span className={`rounded border px-2 py-0.5 text-[10px] uppercase ${item.status === 'published' ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-amber-700 bg-amber-950/40 text-amber-300'}`}>{item.status}</span>
                    <div className="min-w-0 flex-1">
                      {renamingId === item.id ? (
                        <div className="flex max-w-xl gap-2">
                          <input autoFocus value={renameValue} onChange={event => setRenameValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void saveRename(item); if (event.key === 'Escape') setRenamingId(null); }} maxLength={200} className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-white" />
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void saveRename(item)}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>Cancel</Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-medium text-white">{item.title || `${EPISODE_LABELS[type] ?? type}${week ? ` — ${week}` : ''}`}</div>
                          <button onClick={() => { setRenamingId(item.id); setRenameValue(item.title ?? ''); }} className="text-[11px] text-zinc-600 hover:text-zinc-300" title="Rename">Rename</button>
                        </div>
                      )}
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                        <span>{EPISODE_LABELS[type] ?? type}{week ? ` · ${week}` : ''}</span>
                        <span>Generated {formatDate(item.generatedAt)}</span>
                        {item.publishedAt && <span>Published {formatDate(item.publishedAt)}</span>}
                        <span className={item.discordPostedAt ? 'text-indigo-300' : 'text-zinc-600'}>{item.discordPostedAt ? 'Discord sent' : 'Discord not sent'}</span>
                        <span className="font-mono" title={item.id}>{item.id.slice(0, 8)}…</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Link href={`/admin/newsletter/editor/${item.id}`}><Button variant="primary" size="sm">Edit</Button></Link>
                      <Button variant="secondary" size="sm" title="Load the season, week, and episode type into the generator above" onClick={() => onSelect(String(item.season), item.week, type)}>Open Generator</Button>
                      {item.status === 'published' && !item.discordPostedAt && <Button variant="ghost" size="sm" disabled={busy} onClick={() => void publish(item, true)}>Retry Discord</Button>}
                      {item.status !== 'published' && (confirmPublish === item.id ? (
                        <>
                          <Button variant="ghost" size="sm" disabled={busy} className="text-emerald-400" onClick={() => void publish(item, true)}>Publish + Discord</Button>
                          <Button variant="ghost" size="sm" disabled={busy} className="text-emerald-400/80" onClick={() => void publish(item, false)}>Publish only</Button>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmPublish(null)}>Cancel</Button>
                        </>
                      ) : <Button variant="ghost" size="sm" className="text-emerald-400" onClick={() => setConfirmPublish(item.id)}>Publish</Button>)}
                      {confirmDelete === item.id ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                          <Button variant="ghost" size="sm" disabled={busy} className="text-red-400" onClick={() => void remove(item)}>Confirm delete</Button>
                        </>
                      ) : <Button variant="ghost" size="sm" className="text-red-400" onClick={() => setConfirmDelete(item.id)}>Delete</Button>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
