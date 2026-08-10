'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';
import PdfUploadPanel from '../PdfUploadPanel';

const WEEKLESS = new Set(['pre_draft', 'post_draft', 'preseason', 'offseason', 'special']);

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = header.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

export default function ExternalNewsletterWritingRoomPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [checked, setChecked] = useState(false);
  const [season, setSeason] = useState('2026');
  const [week, setWeek] = useState('1');
  const [episodeType, setEpisodeType] = useState('preseason');
  const [downloading, setDownloading] = useState<'writing-room' | 'source-pack' | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

  const needsWeek = useMemo(() => !WEEKLESS.has(episodeType), [episodeType]);
  const safeSeason = Number.isFinite(Number(season)) ? Math.trunc(Number(season)) : 2026;
  const safeWeek = needsWeek && Number.isFinite(Number(week)) ? Math.max(1, Math.trunc(Number(week))) : 0;

  useEffect(() => {
    fetch('/api/admin-login', { credentials: 'include' })
      .then(response => response.json())
      .then(data => { setIsAdmin(Boolean(data?.isAdmin)); setChecked(true); })
      .catch(() => setChecked(true));

    fetch('https://api.sleeper.app/v1/state/nfl')
      .then(response => response.json())
      .then(state => {
        if (state?.season) setSeason(String(state.season));
        if (state?.week) setWeek(String(Math.max(1, Number(state.week))));
      })
      .catch(() => {});
  }, []);

  async function download(kind: 'writing-room' | 'source-pack') {
    setDownloading(kind);
    setMessage(null);
    try {
      const params = new URLSearchParams({
        kind,
        season: String(safeSeason),
      });
      if (kind === 'source-pack') {
        params.set('episodeType', episodeType);
        params.set('week', String(safeWeek));
      }

      const response = await fetch(`/api/admin/newsletter/external-export?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string; details?: string };
        throw new Error(data.details || data.error || `Export failed (${response.status})`);
      }

      const blob = await response.blob();
      const fallback = kind === 'writing-room'
        ? `east-v-west-newsletter-writing-room-${safeSeason}.md`
        : `east-v-west-source-pack-${safeSeason}-${episodeType}${safeWeek ? `-week-${safeWeek}` : ''}.json`;
      const fileName = filenameFromDisposition(response.headers.get('Content-Disposition'), fallback);
      const href = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement('a'), { href, download: fileName });
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
      setMessage({
        ok: true,
        text: kind === 'writing-room'
          ? 'Writing Room downloaded. Keep this as the permanent project file.'
          : 'Episode Source Pack downloaded. Upload it with the newsletter request.',
      });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Export failed.' });
    } finally {
      setDownloading(null);
    }
  }

  if (!checked) return <div className="p-8 text-[var(--muted)]">Loading...</div>;
  if (!isAdmin) return <div className="p-8 text-red-400">Admin access required.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <SectionHeader
          title="External Newsletter Writing Room"
          subtitle="Export the bot instructions and live league context for finished newsletters created outside the automated generator"
        />
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <Link href="/admin/newsletter" className="text-[var(--muted)] hover:text-[var(--foreground)]">← Newsletter Admin</Link>
          <Link href="/admin/newsletter/personality" className="text-[var(--muted)] hover:text-[var(--foreground)]">Personality Console</Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Writing Room</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted)]">
            <p>Download once and keep it in the ChatGPT project. It combines Mason, Westy, the show bible, team narratives, editorial rules, and episode formats.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">2. Episode Source Pack</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted)]">
            <p>Download a fresh pack for each issue. It contains the live roster, IR/taxi state, values, trades, draft, future picks, history, bot memory, and recent issue continuity.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">3. Finished PDF</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted)]">
            <p>Generate and review the newsletter in ChatGPT, then upload the finished PDF below. Publishing remains a separate admin action.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Export Files</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="mb-1 block text-xs">Season</Label>
              <Input type="number" min={2020} max={2100} value={season} onChange={event => setSeason(event.target.value)} />
            </div>
            {needsWeek && (
              <div>
                <Label className="mb-1 block text-xs">Week</Label>
                <Input type="number" min={1} max={18} value={week} onChange={event => setWeek(event.target.value)} />
              </div>
            )}
            <div className={needsWeek ? 'sm:col-span-2' : 'sm:col-span-3'}>
              <Label className="mb-1 block text-xs">Episode type</Label>
              <select
                value={episodeType}
                onChange={event => setEpisodeType(event.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]"
              >
                <option value="preseason">Preseason Preview</option>
                <option value="regular">Weekly Recap</option>
                <option value="pre_draft">Pre-Draft</option>
                <option value="post_draft">Post-Draft Review</option>
                <option value="offseason">Offseason Update</option>
                <option value="trade_deadline">Trade Deadline</option>
                <option value="playoffs_preview">Playoffs Preview</option>
                <option value="playoffs_round">Playoff Round</option>
                <option value="championship">Championship</option>
                <option value="season_finale">Season Finale</option>
                <option value="special">Special Edition</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void download('writing-room')} disabled={downloading !== null}>
              {downloading === 'writing-room' ? 'Building Writing Room...' : 'Download Writing Room (.md)'}
            </Button>
            <Button variant="primary" onClick={() => void download('source-pack')} disabled={downloading !== null}>
              {downloading === 'source-pack' ? 'Building Source Pack...' : 'Download Episode Source Pack (.json)'}
            </Button>
          </div>

          {message && (
            <div className={`rounded border px-3 py-2 text-xs ${message.ok ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300' : 'border-red-700 bg-red-950/30 text-red-300'}`}>
              {message.text}
            </div>
          )}

          <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 px-4 py-3 text-xs leading-5 text-blue-200">
            Recommended request after uploading the files: <strong>Generate the selected East v. West newsletter as a finished PDF. Treat the Writing Room as permanent instructions and the Source Pack as authoritative for the current league state. Mason and Westy should lead the issue with their own analysis, arguments, callbacks, and disagreements.</strong>
          </div>
        </CardContent>
      </Card>

      <PdfUploadPanel
        key={`${season}-${uploadKey}`}
        defaultSeason={String(safeSeason)}
        onUploaded={() => setUploadKey(value => value + 1)}
      />
    </div>
  );
}
