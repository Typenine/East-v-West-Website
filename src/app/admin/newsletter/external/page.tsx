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
  const [brainDownloading, setBrainDownloading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [uploadKey, setUploadKey] = useState(0);

  const needsWeek = useMemo(() => !WEEKLESS.has(episodeType), [episodeType]);
  const safeSeason = Number.isFinite(Number(season)) ? Math.trunc(Number(season)) : 2026;
  const safeWeek = episodeType === 'trade_deadline' ? 12 : needsWeek && Number.isFinite(Number(week)) ? Math.max(1, Math.trunc(Number(week))) : 0;

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

  async function download(kind: 'writing-room' | 'source-pack', packSize: 'compact' | 'full' = 'compact') {
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
        params.set('packSize', packSize);
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
        : `east-v-west-source-pack-${safeSeason}-${episodeType}${safeWeek ? `-week-${safeWeek}` : ''}${packSize === 'compact' ? '-chatgpt-compact' : ''}.json`;
      const fileName = filenameFromDisposition(response.headers.get('Content-Disposition'), fallback);
      const href = URL.createObjectURL(blob);
      const anchor = Object.assign(document.createElement('a'), { href, download: fileName });
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 10000);
      const fileKb = Math.max(1, Math.round(blob.size / 1024));
      setMessage({
        ok: true,
        text: kind === 'writing-room'
          ? `Writing Room downloaded (${fileKb} KB). Keep this as the permanent project file.`
          : `${packSize === 'compact' ? 'Compact' : 'Complete'} Episode Source Pack downloaded (${fileKb} KB). Upload the compact version with the two Active Brains for routine issues.`,
      });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Export failed.' });
    } finally {
      setDownloading(null);
    }
  }

  async function downloadBrain(bot:'mason'|'westy',depth:'active'|'full') {
    const key=bot+'-'+depth;
    setBrainDownloading(key);setMessage(null);
    try{
      const params=new URLSearchParams({bot,depth,season:String(safeSeason),format:depth==='active'?'md':'json'});
      const res=await fetch('/api/admin/newsletter/brain-export?'+params.toString(),{
        credentials:'include',cache:'no-store',
      });
      if(!res.ok){
        const error=await res.json().catch(()=>({})) as {error?:string};
        throw new Error(error.error||'Brain export failed ('+res.status+')');
      }
      const blob=await res.blob();
      const fileName=filenameFromDisposition(res.headers.get('Content-Disposition'),
        bot+'-'+depth+'-brain-'+safeSeason+(depth==='active'?'.md':'.json'));
      const href=URL.createObjectURL(blob);
      const anchor=Object.assign(document.createElement('a'),{href,download:fileName});
      document.body.appendChild(anchor);anchor.click();anchor.remove();
      // Delayed cleanup lets Android/mobile download handlers consume the blob.
      window.setTimeout(()=>URL.revokeObjectURL(href),10000);
      const sizeKb=Math.max(1,Math.round(blob.size/1024));
      setMessage({ok:true,text:(bot==='mason'?'Mason':'Westy')+' '+(depth==='active'?'Active':'Full')+
        ' Brain saved ('+sizeKb+' KB). '+(depth==='active'
        ? 'Upload this with the other Active Brain and Episode Source Pack for newsletter writing.'
        : 'Keep this as a backup. It is not needed in ChatGPT for normal weekly writing.')});
    }catch(error){
      setMessage({ok:false,text:error instanceof Error?error.message:'Character export failed.'});
    }finally{
      setBrainDownloading(null);
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

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader><CardTitle className="text-base">1. Writing Room</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted)]">
            <p>Download once and keep it in the ChatGPT project. It combines Mason, Westy, the show bible, team narratives, editorial rules, and episode formats.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">2. Active Brains</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted)]">
            <p>Download Mason and Westy separately. These are curated, compact snapshots of their identities, evolving beliefs, approved voice examples, and lessons.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">3. Episode Source Pack</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--muted)]">
            <p>Download a compact weekly pack containing live rosters, IR/taxi, trade and draft facts, plus targeted historical receipts. The full version remains available for deep dives.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">4. Finished PDF</CardTitle></CardHeader>
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
                <Input type="number" min={1} max={18} value={episodeType === 'trade_deadline' ? '12' : week} disabled={episodeType === 'trade_deadline'} onChange={event => setWeek(event.target.value)} />
              </div>
            )}
            <div className={needsWeek ? 'sm:col-span-2' : 'sm:col-span-3'}>
              <Label className="mb-1 block text-xs">Episode type</Label>
              <select
                value={episodeType}
                onChange={event => { setEpisodeType(event.target.value); if (event.target.value === 'trade_deadline') setWeek('12'); }}
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
          {episodeType === 'trade_deadline' && (
            <p className="text-xs leading-5 text-[var(--muted)]">
              Post-deadline special, Week 12. The Source Pack download opens after the season's Week 12 trade deadline closes.
              It includes a chronological completed-trade audit and instructions for an approximately 50-page ChatGPT-written issue.
              Download both Active Brains alongside the Compact Episode Pack. This does not replace the normal Weekly Recap.
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => void download('writing-room')} disabled={downloading !== null || brainDownloading !== null}>
              {downloading === 'writing-room' ? 'Building Writing Room...' : 'Download Writing Room (.md)'}
            </Button>
            <Button variant="primary" onClick={() => void download('source-pack', 'compact')} disabled={downloading !== null || brainDownloading !== null}>
              {downloading === 'source-pack' ? 'Building Source Pack...' : 'Download Compact Episode Pack (.json)'}
            </Button>
            <Button variant="secondary" onClick={() => void download('source-pack', 'full')} disabled={downloading !== null || brainDownloading !== null}>
              Download Complete Source Pack (.json)
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['mason','westy'] as const).map(bot => (
              <div key={bot} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
                <div>
                  <div className="font-semibold text-sm">{bot==='mason'?'Mason Reed':'Trent “Westy” Weston'}</div>
                  <p className="text-xs text-[var(--muted)] mt-1">Separate personality, beliefs, development, and source-backed continuity</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="primary" disabled={downloading!==null||brainDownloading!==null}
                    onClick={()=>void downloadBrain(bot,'active')}>
                    {brainDownloading===bot+'-active'?'Preparing…':'Download Active Brain (.md)'}
                  </Button>
                  <Button variant="secondary" disabled={downloading!==null||brainDownloading!==null}
                    onClick={()=>void downloadBrain(bot,'full')}>
                    {brainDownloading===bot+'-full'?'Preparing…':'Full Brain Backup (.json)'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">For each newsletter, use the Compact Episode Source Pack and both Active Brains. Keep the Writing Room in your ChatGPT project. Full Brain JSON files preserve retained history, reviews and source references for backup, not routine upload. Original newsletter PDFs remain on the website.</p>

          {message && (
            <div className={`rounded border px-3 py-2 text-xs ${message.ok ? 'border-emerald-700 bg-emerald-950/30 text-emerald-300' : 'border-red-700 bg-red-950/30 text-red-300'}`}>
              {message.text}
            </div>
          )}

          <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 px-4 py-3 text-xs leading-5 text-blue-200">
            Recommended request after uploading the files: <strong>Generate the selected East v. West newsletter as a finished PDF. Follow the permanent Writing Room instructions, use the Episode Source Pack for current facts, and use the separate Mason and Westy Active Brains for their individual voices and historical views. Do not invent disagreements, prediction results, or character growth. Keep the full established episode length and format.</strong>
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
