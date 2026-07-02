'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface NewsletterMeta {
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

// Storage weeks used by offseason episodes (mirror of run-newsletter.mjs EPISODE_WEEK_STORAGE).
const STORAGE_WEEK_TO_TYPE: Record<number, string> = { 900: 'preseason', 901: 'pre_draft', 902: 'post_draft', 903: 'offseason' };

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

// Resolve a display type even for old rows that predate the episode_type column.
function resolveType(item: NewsletterMeta): string {
  if (item.episodeType) return item.episodeType;
  return STORAGE_WEEK_TO_TYPE[item.week] ?? 'regular';
}

// A real NFL week number only applies to in-season episodes (week < 900).
function weekLabel(item: NewsletterMeta): string | null {
  const type = resolveType(item);
  if (STORAGE_WEEK_TO_TYPE[item.week] || ['pre_draft', 'post_draft', 'preseason', 'offseason'].includes(type)) return null;
  return `Week ${item.week}`;
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  season: string;
  /** Load a saved newsletter into the generator config (season / week / episodeType). */
  onSelect: (season: string, week: number, episodeType: string) => void;
  /** Bump to force a reload (e.g. after the parent generates/publishes/deletes). */
  reloadKey?: number;
}

export default function SavedNewsletters({ season, onSelect, reloadKey }: Props) {
  const [items, setItems] = useState<NewsletterMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch(`/api/newsletter?list=true&season=${season}&draft=1`, { cache: 'no-store', credentials: 'include' });
      const data = await res.json() as { items?: NewsletterMeta[]; error?: string };
      if (Array.isArray(data.items)) { setItems(data.items); setError(null); }
      else if (!opts?.silent) setError(data.error || 'Failed to load newsletters');
    } catch (e) {
      if (!opts?.silent) setError(e instanceof Error ? e.message : 'Failed to load newsletters');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [season]);

  useEffect(() => { load(); }, [load, reloadKey]);
  // Light auto-refresh so newly generated/published newsletters appear without a reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      load({ silent: true });
    }, 20000);
    return () => clearInterval(id);
  }, [load]);

  const del = async (item: NewsletterMeta) => {
    setError(null);
    try {
      const res = await fetch(`/api/newsletter?week=${item.week}&season=${item.season}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`Couldn't delete: ${(data as { error?: string }).error ?? `HTTP ${res.status}`}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
    setConfirmDelete(null);
    await load();
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">🗂️ Saved Newsletters — {season}</CardTitle>
          <button onClick={() => load()} className="text-[11px] text-zinc-500 underline hover:text-zinc-300" title="Refresh">↻ refresh</button>
        </div>
        <p className="text-xs text-zinc-500 mt-1">Every saved newsletter for this season — drafts and published. Tell them apart without opening.</p>
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
              const key = `${item.season}-${item.week}`;
              return (
                <div key={key} className="flex items-center gap-3 flex-wrap border border-zinc-800 rounded-lg px-3 py-2">
                  {/* Status */}
                  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-medium ${
                    item.status === 'published'
                      ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                      : 'bg-amber-900/40 text-amber-300 border-amber-600'
                  }`}>
                    {item.status}
                  </span>
                  {/* Type + week */}
                  <span className="text-sm text-white">{EPISODE_LABELS[type] ?? type}</span>
                  {wk && <span className="text-xs font-medium text-zinc-300">{wk}</span>}
                  {/* Times */}
                  <span className="text-xs text-zinc-400" title={`Generated ${item.generatedAt}`}>
                    gen {fmt(item.generatedAt)}
                  </span>
                  {item.status === 'published' && (
                    <span className="text-xs text-emerald-400/80" title={`Published ${item.publishedAt}`}>
                      pub {fmt(item.publishedAt)}
                    </span>
                  )}
                  {/* Discord */}
                  <span className="text-xs" title={item.discordPostedAt ? `Discord sent ${item.discordPostedAt}` : 'Not posted to Discord'}>
                    {item.discordPostedAt ? <span className="text-indigo-300">💬 sent</span> : <span className="text-zinc-600">💬 —</span>}
                  </span>

                  <div className="ml-auto flex items-center gap-1.5">
                    <Button variant="secondary" size="sm" className="text-xs"
                      title="Load into the generator above (edit / regenerate / publish)"
                      onClick={() => onSelect(String(item.season), item.week, type)}>
                      Open
                    </Button>
                    {confirmDelete === key ? (
                      <>
                        <Button variant="ghost" size="sm" className="text-xs text-zinc-400" onClick={() => setConfirmDelete(null)}>Cancel</Button>
                        <Button variant="ghost" size="sm" className="text-xs text-red-400" onClick={() => del(item)}>Confirm</Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" className="text-xs text-red-400" onClick={() => setConfirmDelete(key)}>🗑</Button>
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
