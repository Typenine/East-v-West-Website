'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';

const WEEKLESS = new Set(['pre_draft', 'post_draft', 'preseason', 'offseason', 'special']);

export default function PdfUploadPanel({
  defaultSeason,
  onUploaded,
}: {
  defaultSeason: string;
  onUploaded: () => void;
}) {
  const [title, setTitle] = useState('');
  const [season, setSeason] = useState(defaultSeason);
  const [week, setWeek] = useState('1');
  const [episodeType, setEpisodeType] = useState('special');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const needsWeek = useMemo(() => !WEEKLESS.has(episodeType), [episodeType]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) {
      setResult({ ok: false, message: 'Choose a PDF first.' });
      return;
    }
    setUploading(true);
    setResult(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('title', title);
      form.set('season', season);
      form.set('episodeType', episodeType);
      form.set('issueDate', issueDate);
      form.set('description', description);
      if (needsWeek) form.set('week', week);

      const response = await fetch('/api/admin/newsletter/upload-pdf', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await response.json() as { success?: boolean; error?: string; message?: string };
      if (!response.ok || data.success === false) throw new Error(data.error || data.message || 'Upload failed');

      setResult({ ok: true, message: data.message || 'PDF uploaded as a draft.' });
      setTitle('');
      setDescription('');
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onUploaded();
    } catch (error) {
      setResult({ ok: false, message: error instanceof Error ? error.message : 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Upload Finished Newsletter PDF</CardTitle>
        <p className="mt-1 text-xs text-zinc-500">Creates a private draft with a normal newsletter landing page. Publishing from Saved Newsletters makes it public and sends the standard Discord announcement.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label className="mb-1 block text-xs">Issue title</Label>
              <Input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} required placeholder="2026 Rookie Draft Review" />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Season</Label>
              <Input type="number" min={2020} max={2100} value={season} onChange={event => setSeason(event.target.value)} required />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Issue date</Label>
              <Input type="date" value={issueDate} onChange={event => setIssueDate(event.target.value)} required />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="mb-1 block text-xs">Episode type</Label>
              <select
                value={episodeType}
                onChange={event => setEpisodeType(event.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white"
              >
                <option value="special">Special Edition</option>
                <option value="pre_draft">Pre-Draft</option>
                <option value="post_draft">Post-Draft</option>
                <option value="preseason">Preseason</option>
                <option value="offseason">Offseason</option>
                <option value="regular">Weekly Recap</option>
                <option value="trade_deadline">Trade Deadline</option>
                <option value="playoffs_preview">Playoffs Preview</option>
                <option value="playoffs_round">Playoff Round</option>
                <option value="championship">Championship</option>
                <option value="season_finale">Season Finale</option>
              </select>
            </div>
            {needsWeek && (
              <div>
                <Label className="mb-1 block text-xs">Week</Label>
                <Input type="number" min={1} max={18} value={week} onChange={event => setWeek(event.target.value)} required />
              </div>
            )}
            <div className={needsWeek ? '' : 'sm:col-span-2'}>
              <Label className="mb-1 block text-xs">PDF file</Label>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                required
                onChange={event => setFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 file:mr-3 file:rounded file:border-0 file:bg-zinc-700 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-white"
              />
              <p className="mt-1 text-[11px] text-zinc-500">Maximum file size: 25 MB.</p>
            </div>
          </div>

          <div>
            <Label className="mb-1 block text-xs">Landing-page description</Label>
            <Textarea value={description} onChange={event => setDescription(event.target.value)} rows={3} maxLength={2500} placeholder="Briefly describe the issue. This appears above the embedded PDF." />
          </div>

          {result && (
            <div className={`rounded border px-3 py-2 text-xs ${result.ok ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300' : 'border-red-700 bg-red-950/30 text-red-300'}`}>
              {result.message}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" disabled={uploading}>
              {uploading ? 'Uploading PDF…' : 'Upload as Draft'}
            </Button>
            <span className="text-xs text-zinc-500">Uploading alone never publishes or posts to Discord.</span>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
