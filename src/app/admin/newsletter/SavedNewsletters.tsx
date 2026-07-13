'use client';

import { useCallback, useEffect, useState } from 'react';
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
  regular: '📅 Weekly Recap',
  trade_deadline: '🔔 Trade Deadline',
  playoffs_preview: '🏈 Playoffs Preview',
  playoffs_round: '🏆 Playoff Round',
  championship: '👑 Championship',
  season_finale: '🎬 Season Finale',
  pre_draft: '📋 Pre-Draft',
  post_draft: '📊 Post-Draft Grades',
  preseason: '🌟 Preseason',
  offseason: '💤 Offseason',
};

function resolveType(item: NewsletterMeta): string {
  if (item.episodeType) return item.episodeType;
  return STORAGE_WEEK_TO_TYPE[item.week] ?? 'regular';
}

function weekLabel(item: NewsletterMeta): string | null {
  const type = resolveType(item);
  if (STORAGE_WEEK_TO_TYPE[item.week] || ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(type)) return null;
  return `Week ${item.week}`;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
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
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(`/api/newsletter?list=true&season=${season}&draft=1`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json() as { items?: NewsletterMeta[]; error?: string };
      if (Array.isArray(data.items)) {
        setItems(data.items);
        if (!opts?.silent) setError(null);
      } else if (!opts?.silent) {
        setError(data.error || 'Failed to load newsletters');
      }
    } catch (err) {
      if (!opts?.silent) setError(err instanceof Error ? err.message : 'Failed to load newsletters');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [season]);

  const loadWebhookHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/newsletter/publish', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await res.json() as WebhookHealth;
      if (res.ok) setWebhook(data);
      else setWebhook({ configured: false, reachable: false, status: res.status, error: data.message, message: data.message || 'Unable to verify webhook' });
    } catch (err) {
      setWebhook({
        configured: false,
        reachable: false,
        status: null,
        error: err instanceof Error ? err.message : String(err),
        message: 'Unable to verify newsletter Discord webhook.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
    void loadWebhookHealth();
  }, [load, loadWebhookHealth, reloadKey]);

  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load({ silent: true });
    }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const del = async (item: NewsletterMeta) => {
    setError(null);
    try {
      const res = await fetch(`/api/newsletter?id=${item.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Couldn't delete: ${(data as { error?: string }).error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
    setConfirmDelete(null);
    await load();
  };

  const publish = async (item: NewsletterMeta, sendDiscord: boolean, resendDiscord = false) => {
    setError(null);
    setPublishingId(item.id);
    try {
      const res = await fetch('/api/newsletter/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          season: item.season,
          week: item.week,
          id: item.id,
          sendDiscord,
          resendDiscord,
        }),
      });
      const data = await res.json().catch(() => ({})) as { success?: boolean; error?: string; message?: string };
      if (!res.ok || data.success === false) {
        setError(data.error || data.message || `Couldn't publish: HTTP ${res.status}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to publish');
    }
    setPublishingId(null);
    setConfirmPublish(null);
    await Promise.all([load(), loadWebhookHealth()]);
  };

  const startRename = (item: NewsletterMeta) => {
    setRenamingId(item.id);
    setRenameValue(item.title ?? '');
  };

  const saveRename = async (item: NewsletterMeta) => {
    const title = renameValue.trim();
    if (!title || title === item.title) {
      setRenamingId(null);
      return;
    }

    setRenameSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/newsletter', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id: item.id, title }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Couldn't rename: ${(data as { error?: string }).error ?? `HTTP ${res.status}`}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    }
    setRenameSaving(false);
    setRenamingId(null);
    await load();
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="text-base">🗂️ Saved Newsletters — {season}</CardTitle>
          <div className="flex items-center gap-3">
            {webhook && (
              <span
                className={`text-[11px] px-2 py-1 rounded border ${
                  webhook.configured && webhook.reachable
                    ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                    : 'bg-red-900/40 text-red-300 border-red-700'
                }`}
                title={webhook.message}
              >
                Discord {webhook.configured && webhook.reachable ? '✓ ready' : '✕ not ready'}
              </span>
            )}
            <button
              onClick={() => { void load(); void loadWebhookHealth(); }}
              className="text-[11px] text-zinc-500 underline hover:text-zinc-300"
              title="Refresh"
            >
              ↻ refresh
            </button>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Every saved newsletter for this season. Publishing one issue makes that exact catalog entry public. Discord status is verified without sending a message.
        </p>
      </CardHeader>
      <CardContent>
        {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
        {loading ? (
          <div className="text-sm text-zinc-500 animate-pulse py-4">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-sm text-zinc-500 py-4 text-center">No saved newsletters for {season} yet.</div>
        ) : (
          <div className="space-y-2">
            {items.map(item => {
              const type = resolveType(item);
              const wk = weekLabel(item);
              const isPublishing = publishingId === item.id;
              return (
                <div key={item.id} className="flex items-center gap-3 flex-wrap border border-zinc-800 rounded-lg px-3 py-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
                    item.status === 'published'
                      ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                      : 'bg-amber-900/40 text-amber-300 border-amber-600'
                  }`}>
                    {item.status}
                  </span>

                  {renamingId === item.id ? (
                    <span className="flex items-center gap-1.5">
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={event => setRenameValue(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === 'Enter') void saveRename(item);
                          if (event.key === 'Escape') setRenamingId(null);
                        }}
                        maxLength={200}
                        disabled={renameSaving}
                        className="bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-sm text-white w-64 focus:outline-none focus:border-zinc-500"
                      />
                      <Button variant="ghost" size="sm" className="text-xs text-emerald-400" disabled={renameSaving} onClick={() => void saveRename(item)}>
                        {renameSaving ? '…' : 'Save'}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-xs text-zinc-400" disabled={renameSaving} onClick={() => setRenamingId(null)}>
                        Cancel
                      </Button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm text-white truncate" title={item.title ?? undefined}>
                        {item.title || `${EPISODE_LABELS[type] ?? type}${wk ? ` — ${wk}` : ''}`}
                      </span>
                      <button onClick={() => startRename(item)} className="text-[11px] text-zinc-500 hover:text-zinc-300" title="Rename">
                        ✏️
                      </button>
                    </span>
                  )}

                  <span className="text-xs text-zinc-400">{EPISODE_LABELS[type] ?? type}</span>
                  {wk && <span className="text-xs font-medium text-zinc-300">{wk}</span>}
                  <span className="text-xs text-zinc-400" title={`Generated ${item.generatedAt}`}>gen {fmt(item.generatedAt)}</span>
                  {item.status === 'published' && (
                    <span className="text-xs text-emerald-400/80" title={`Published ${item.publishedAt}`}>pub {fmt(item.publishedAt)}</span>
                  )}
                  <span className="text-xs" title={item.discordPostedAt ? `Discord sent ${item.discordPostedAt}` : 'Not posted to Discord'}>
                    {item.discordPostedAt
                      ? <span className="text-indigo-300">💬 sent</span>
                      : <span className="text-zinc-600">💬 —</span>}
                  </span>

                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="text-xs"
                      title="Load into the generator above"
                      onClick={() => onSelect(String(item.season), item.week, type)}
                    >
                      Open
                    </Button>

                    {item.status === 'published' && !item.discordPostedAt && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-indigo-300"
                        disabled={isPublishing}
                        title="Send the missing Discord announcement. Existing dedupe records prevent accidental duplicates."
                        onClick={() => void publish(item, true)}
                      >
                        {isPublishing ? 'Checking…' : 'Retry Discord'}
                      </Button>
                    )}

                    {item.status !== 'published' && (
                      confirmPublish === item.id ? (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-emerald-400"
                            disabled={isPublishing}
                            title="Publish and announce to Discord"
                            onClick={() => void publish(item, true)}
                          >
                            {isPublishing ? '…' : '+ Discord'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-emerald-400/70"
                            disabled={isPublishing}
                            title="Publish without posting to Discord"
                            onClick={() => void publish(item, false)}
                          >
                            no Discord
                          </Button>
                          <Button variant="ghost" size="sm" className="text-xs text-zinc-400" disabled={isPublishing} onClick={() => setConfirmPublish(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs text-emerald-400"
                          title="Publish this exact newsletter"
                          onClick={() => setConfirmPublish(item.id)}
                        >
                          Publish
                        </Button>
                      )
                    )}

                    {confirmDelete === item.id ? (
                      <>
                        <Button variant="ghost" size="sm" className="text-xs text-zinc-400" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                        <Button variant="ghost" size="sm" className="text-xs text-red-400" onClick={() => void del(item)}>Confirm</Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-xs text-red-400" onClick={() => setConfirmDelete(item.id)}>🗑</Button>
                    )}
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
