'use client';

import { useEffect, useState } from 'react';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import Button from '@/components/ui/Button';

type Suggestion = {
  id: string;
  content: string;
  category?: string;
  createdAt: string; // ISO
};

type Tallies = Record<string, { up: number; down: number }>;

const CATEGORIES = ['Rules', 'Website', 'Discord', 'Other'];

export default function SuggestionsPage() {
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tallies, setTallies] = useState<Tallies>({});
  const [auth, setAuth] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/suggestions', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load suggestions');
      const data = (await res.json()) as Suggestion[];
      setItems(data);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load suggestions';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    fetch('/api/suggestions/tallies', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((j) => setTallies((j?.tallies as Tallies) || {}))
      .catch(() => setTallies({}));
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setAuth(Boolean(j?.authenticated)))
      .catch(() => setAuth(false));
  }, []);

  async function vote(suggestionId: string, value: 1 | -1 | 0) {
    if (!auth) return;
    try {
      const res = await fetch('/api/me/suggestions/vote', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestionId, value })
      });
      if (!res.ok) return;
      const t = await fetch('/api/suggestions/tallies', { cache: 'no-store' }).then((r) => r.json());
      setTallies((t?.tallies as Tallies) || {});
    } catch {}
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    try {
      setSubmitting(true);
      setError(null);
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim(), category: category || undefined }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'Failed to submit');
      }
      setContent('');
      setCategory('');
      await load();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to submit suggestion';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="League Suggestions" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">
          <Card>
            <CardContent>
              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="category" className="mb-1 block">
                    Category (optional)
                  </Label>
                  <Select
                    id="category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Select a category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>

                <div>
                  <Label htmlFor="content" className="mb-1 block">
                    Your suggestion (anonymous)
                  </Label>
                  <Textarea
                    id="content"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={6}
                    required
                    minLength={3}
                    maxLength={5000}
                    placeholder="Propose changes to rules, website, Discord, etc."
                  />
                </div>

                {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

                <Button
                  type="submit"
                  disabled={submitting || content.trim().length < 3}
                >
                  {submitting ? 'Submitting…' : 'Submit Suggestion'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Suggestions</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-[var(--muted)]">Loading…</p>
              ) : items.length === 0 ? (
                <p className="text-[var(--muted)]">No suggestions yet. Be the first to submit one!</p>
              ) : (
                <ul className="space-y-4">
                  {items.map((s) => (
                    <li key={s.id} className="evw-surface border border-[var(--border)] rounded-[var(--radius-card)] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[var(--muted)]">
                          {new Date(s.createdAt).toLocaleString(undefined, {
                            year: 'numeric', month: 'short', day: 'numeric',
                            hour: 'numeric', minute: '2-digit'
                          })}
                        </span>
                        {s.category && (
                          <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] evw-surface text-[var(--text)]">{s.category}</span>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-[var(--text)]">{s.content}</p>
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-sm text-[var(--muted)]">Up: {tallies[s.id]?.up || 0}</span>
                        <span className="text-sm text-[var(--muted)]">Down: {tallies[s.id]?.down || 0}</span>
                        {auth && (
                          <div className="ml-auto flex gap-2">
                            <Button
                              type="button"
                              onClick={() => vote(s.id, 1)}
                              aria-label="Thumbs up"
                            >👍</Button>
                            <Button
                              type="button"
                              onClick={() => vote(s.id, -1)}
                              aria-label="Thumbs down"
                            >👎</Button>
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
