'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Label from '@/components/ui/Label';
import { Textarea } from '@/components/ui/Textarea';

type Bot = 'entertainer' | 'analyst';
type View = 'overview' | 'memories' | 'relationships' | 'growth' | 'voice' | 'history';
type ReviewStatus = 'unreviewed' | 'verified' | 'needs_review' | 'dismissed';
type Annotation = { reviewStatus: ReviewStatus; pinned: boolean; note: string; correction: string; updatedAt: string };
type Receipt = {
  id: string; claim: string; subject: string; subjectType: string; claimType: string;
  season: number; week: number; sourceNewsletterId: string; title: string | null;
  originalClaim?: string; originalClaimType?: string; qualityReviewRequired?: boolean;
  status: string; publishedAt: string; annotation: Annotation | null; voiceSample: boolean;
  source: { id: string; title: string | null; week: number };
};
type DevelopmentNote = {
  id: string; kind: 'lesson' | 'bias' | 'improvement'; text: string; receiptId: string | null;
  status: 'proposed' | 'approved' | 'rejected'; createdAt: string; updatedAt: string;
};
type BrainData = {
  bot: Bot; season: number; view: View; revision: number;
  summary: {
    name: string; role: string; updatedAt: string; mood: string;
    personality: Record<string, number> | null; emotion: { primary: string; intensity: number } | null;
    takes: number; predictions: number; reviewPending: number; publishedIssues: number;
    processedIssues: number; teams: number; players: number; growthLessons: number;
    approvedDevelopments: number; voiceExamples: number;
  };
  teams?: Array<{
    name: string; stance: string; trust: number; takeCount?: number; takes?: number;
    narrative?: string | null; history?: Array<{ season: number; week: number; take: string }>;
    burned?: number; vindicated?: number;
  }>;
  players?: Array<{
    name: string; team: string | null; sentiment: string; trust: number; historyCount: number;
    history: Array<{ season: number; week: number; event: string }>;
    predictions: Array<{ week: number; prediction: string; wasRight?: boolean }>;
  }>;
  recent?: Array<{ id: string; claim: string; subject: string; week: number; type: string }>;
  proposed?: number;
  total?: number; page?: number; pageSize?: number; entries?: Receipt[];
  growth?: {
    hardLessons: Array<{ week: number; season: number; lesson: string; context: string; appliedSince: boolean }>;
    recognizedBiases: Array<{ bias: string; discoveredWeek: number; workingOnIt: boolean }>;
    improvements: Array<{ skill: string; evidence: string }>; blindSpots: string[];
  };
  speech?: { obsessions: Array<{ topic: string; reason: string; mentions: number }> } | null;
  dynamics?: { recentInteractions: Array<{ week: number; topic: string; myTake: string; theirTake: string; agreed: boolean }> } | null;
  notes?: DevelopmentNote[];
  changes?: Array<{ at: string; action: string; receiptId?: string }>;
  identity?: {
    name: string; role: string; voice: Record<string, number | string>;
    blindSpots: string[]; openers: string[]; verbalTics: string[]; adminNotes: string | null;
  };
  samples?: Array<{ id: string; receiptId: string; quote: string; note: string; addedAt: string; sourceNewsletterId: string }>;
  issues?: Array<{ id: string; title: string | null; week: number; date: string | null;
    type: string | null; processed: boolean; takes: number; review: number }>;
};

const sections: Array<{ key: View; label: string }> = [
  { key: 'overview', label: 'Overview' },
  { key: 'memories', label: 'Memories' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'growth', label: 'Growth' },
  { key: 'voice', label: 'Voice Library' },
  { key: 'history', label: 'Issue History' },
];
const panel = 'rounded-xl border border-[var(--border)] bg-[var(--card)] p-4';
const muted = 'text-[var(--muted)]';
function formatDate(raw?: string | null) {
  if (!raw) return 'Not recorded';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function statusColor(status?: string) {
  if (status === 'verified' || status === 'approved') return 'text-emerald-400';
  if (status === 'needs_review' || status === 'proposed') return 'text-amber-400';
  if (status === 'dismissed' || status === 'rejected') return 'text-red-400';
  return 'text-[var(--muted)]';
}
function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className={panel}><div className="text-xl font-semibold tabular-nums">{value}</div><div className={muted+' text-xs mt-1'}>{label}</div></div>;
}
async function request(url: string, options?: RequestInit) {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store', ...options });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || 'Brain Center request failed');
  return data;
}
export default function BotBrainCenter({ onEditSettings }: { onEditSettings: () => void }) {
  const [bot, setBot] = useState<Bot>('entertainer');
  const [season, setSeason] = useState('2026');
  const [view, setView] = useState<View>('overview');
  const [data, setData] = useState<BrainData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [review, setReview] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Receipt | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('unreviewed');
  const [pinned, setPinned] = useState(false);
  const [note, setNote] = useState('');
  const [correction, setCorrection] = useState('');
  const [voiceReason, setVoiceReason] = useState('');
  const [relationshipType, setRelationshipType] = useState<'teams' | 'players'>('teams');
  const [expandedRelationship, setExpandedRelationship] = useState<string | null>(null);
  const [growthKind, setGrowthKind] = useState<'lesson' | 'bias' | 'improvement'>('lesson');
  const [growthText, setGrowthText] = useState('');
  const [growthSource, setGrowthSource] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);
  const refresh = () => setRefreshKey(v => v + 1);
  const load = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const params = new URLSearchParams({ bot, season, view });
      if (view === 'memories') {
        params.set('q', search); params.set('kind', kind); params.set('review', review);
        params.set('page', String(page));
      }
      const next: BrainData = await request('/api/admin/newsletter/brain-center?' + params.toString());
      setData(next);
    } catch (err) { setMessage(err instanceof Error ? err.message : String(err)); setData(null); }
    finally { setLoading(false); }
  }, [bot, season, view, search, kind, review, page, refreshKey]);

  useEffect(() => { void load(); }, [load]);
  const changeBot = (value: Bot) => { setBot(value); setSelected(null); setPage(1); setExpandedRelationship(null); };
  const changeView = (value: View) => { setView(value); setSelected(null); setPage(1); setExpandedRelationship(null); };
  const chooseReceipt = (receipt: Receipt) => {
    setSelected(receipt);
    setReviewStatus(receipt.annotation?.reviewStatus ?? 'unreviewed');
    setPinned(receipt.annotation?.pinned ?? false);
    setNote(receipt.annotation?.note ?? '');
    setCorrection(receipt.annotation?.correction ?? '');
    setVoiceReason('');
  };
  async function mutate(action: string, payload: Record<string, unknown>) {
    setSaving(true); setMessage('');
    try {
      await request('/api/admin/newsletter/brain-center', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot, season: Number(season), action, ...payload }),
      });
      setMessage('Saved to the character brain audit history.');
      setSelected(null);
      refresh();
    } catch (err) { setMessage(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  }
  const goToEvidence = (receiptId: string | null) => {
    if (!receiptId) return;
    changeView('memories'); setSearchInput(receiptId); setSearch(receiptId);setReview('all');setKind('all');
  };

  return (
    <div className="space-y-5">
      <div className={panel+' flex flex-wrap gap-3 items-end justify-between'}>
        <div>
          <div className="text-xs uppercase tracking-widest text-[var(--muted)]">Newsletter Admin / Bot Brain Center</div>
          <h2 className="text-2xl font-semibold mt-1">Mason & Westy</h2>
          <p className={muted+' text-sm mt-1'}>Their independent histories, character states and editorial controls. Nothing here posts publicly.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="brain-season" className={muted+' text-xs'}>Season</label>
          <Input id="brain-season" className="w-24" type="number" min={2020} max={2100} value={season}
            onChange={e => setSeason(e.target.value)} />
          <Button variant="secondary" onClick={refresh} disabled={loading}>Refresh</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(['entertainer','analyst'] as Bot[]).map(value => <button key={value} type="button"
          onClick={() => changeBot(value)}
          aria-pressed={bot === value}
          className={('rounded-xl border p-4 text-left transition-colors ' + (bot===value
            ? 'border-[var(--accent)] bg-[var(--card)]'
            : 'border-[var(--border)] hover:bg-[var(--card)]'))}>
          <span className="block font-semibold">{value==='entertainer'?'Mason Reed':'Trent “Westy” Weston'}</span>
          <span className={muted+' text-xs'}>{value==='entertainer'?'Narrative and momentum':'Structure and long-term value'}</span>
        </button>)}
      </div>
      <nav className="flex gap-1 overflow-x-auto pb-2 border-b border-[var(--border)]" aria-label="Bot brain sections">
        {sections.map(section => <button key={section.key} type="button" onClick={() => changeView(section.key)}
          aria-current={view===section.key?'page':undefined}
          className={'whitespace-nowrap px-3 py-2 text-sm rounded-lg '+(view===section.key
            ? 'bg-[var(--card)] text-[var(--foreground)] font-semibold'
            : muted+' hover:bg-[var(--card)]')}>{section.label}</button>)}
      </nav>
      {message && <div role="status" className={panel+' text-sm'}>{message}</div>}
      {loading && <div role="status" className={muted+' py-8 text-sm'}>Loading character memory…</div>}
      {!loading && data && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-lg">{data.summary.name}</h3>
              <p className={muted+' text-sm'}>{data.summary.role}</p>
            </div>
            <div className={muted+' text-xs'}>Memory: {formatDate(data.summary.updatedAt)} · {data.summary.mood}</div>
          </div>

          {view === 'overview' && <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Published takes" value={data.summary.takes} />
              <Metric label="Issues processed" value={data.summary.processedIssues+'/'+data.summary.publishedIssues} />
              <Metric label="Review needed" value={data.summary.reviewPending} />
              <Metric label="Approved voice examples" value={data.summary.voiceExamples} />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className={panel+' space-y-3'}>
                <h4 className="font-semibold">Character development</h4>
                <div className="flex justify-between text-sm"><span>Team histories</span><span>{data.summary.teams}</span></div>
                <div className="flex justify-between text-sm"><span>Player histories</span><span>{data.summary.players}</span></div>
                <div className="flex justify-between text-sm"><span>Recorded hard lessons</span><span>{data.summary.growthLessons}</span></div>
                <div className="flex justify-between text-sm"><span>Approved development notes</span><span>{data.summary.approvedDevelopments}</span></div>
                <p className={muted+' text-xs'}>Traits do not change automatically when a historical take is imported. Approval and evidence remain separate.</p>
                <Button variant="secondary" onClick={() => changeView('growth')}>Inspect Growth</Button>
              </div>
              <div className={panel+' space-y-3'}>
                <h4 className="font-semibold">Current tracked team narratives</h4>
                {data.teams?.length ? data.teams.slice(0,5).map(team =>
                  <div key={team.name} className="border-b border-[var(--border)] pb-2">
                    <div className="text-sm font-medium">{team.name}</div>
                    <p className={muted+' text-xs line-clamp-2'}>{team.narrative}</p>
                  </div>)
                  : <p className={muted+' text-sm'}>No active narratives recorded.</p>}
                <Button variant="secondary" onClick={() => changeView('relationships')}>See Relationships</Button>
              </div>
            </div>
            <div className={panel+' space-y-2'}>
              <h4 className="font-semibold">Recent published takes</h4>
              {data.recent?.map(take => <div key={take.id} className="py-2 border-b border-[var(--border)]">
                <span className={muted+' text-xs'}>Week {take.week} · {take.subject} · {take.type}</span>
                <p className="text-sm mt-1">{take.claim}</p>
              </div>)}
            </div>
          </>}

          {view === 'memories' && <>
            <div className={panel+' space-y-3'}>
              <div className="grid gap-2 md:grid-cols-3">
                <div><Label className="text-xs">Search claims, teams, or issues</Label>
                  <Input value={searchInput} onChange={e => { setSearchInput(e.target.value); setPage(1); }}
                    placeholder="e.g. Badgers, tanking, playoffs" /></div>
                <div><Label className="text-xs">Claim type</Label>
                  <select value={kind} onChange={e=>{setKind(e.target.value);setPage(1);}}
                    className="block w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                    {['all','prediction','evaluation','strategy','reaction'].map(x=><option key={x} value={x}>{x}</option>)}
                  </select></div>
                <div><Label className="text-xs">Review filter</Label>
                  <select value={review} onChange={e=>{setReview(e.target.value);setPage(1);}}
                    className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm">
                    <option value="all">All</option><option value="flagged">Needs review</option>
                    <option value="pinned">Pinned</option><option value="verified">Verified</option>
                  </select></div>
              </div>
              <div className={muted+' text-xs'}>{data.total ?? 0} matching memories. Statements are preserved as published. Annotations do not rewrite them.</div>
            </div>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] gap-3">
              <div className="space-y-2">
                {data.entries?.length ? data.entries.map(receipt => (
                  <button key={receipt.id} type="button" onClick={()=>chooseReceipt(receipt)}
                    className={panel+' w-full text-left space-y-2 transition-colors '+(selected?.id===receipt.id?'border-[var(--accent)]':'hover:border-[var(--accent)]')}>
                    <div className="flex flex-wrap justify-between gap-2 text-xs">
                      <span className={muted}>{receipt.source.title ?? 'Newsletter'} · Week {receipt.week}</span>
                      <span className={receipt.qualityReviewRequired&&!['verified','dismissed'].includes(receipt.annotation?.reviewStatus??'')?'text-amber-400':muted}>
                        {receipt.annotation?.pinned?'Pinned · ':''}{receipt.claimType}{receipt.qualityReviewRequired?' · Review':''}
                      </span>
                    </div>
                    <p className="text-sm">{receipt.claim}</p>
                    <div className={muted+' text-xs'}>{receipt.subject} · {receipt.annotation?.reviewStatus ?? 'Unreviewed'} · Select to inspect</div>
                  </button>
                )) : <div className={panel+' text-sm '+muted}>No published takes match these filters.</div>}
                <div className="flex items-center justify-between gap-2">
                  <Button variant="secondary" disabled={page<=1} onClick={()=>setPage(v=>v-1)}>Previous</Button>
                  <span className={muted+' text-xs'}>Page {data.page ?? page} / {Math.max(1,Math.ceil((data.total??0)/(data.pageSize??12)))}</span>
                  <Button variant="secondary" disabled={page>=Math.ceil((data.total??0)/(data.pageSize??12))} onClick={()=>setPage(v=>v+1)}>Next</Button>
                </div>
              </div>
              <div className={panel+' space-y-3 h-fit lg:sticky lg:top-4'}>
                {selected ? <>
                  <h4 className="font-semibold">Review published memory</h4>
                  <p className={muted+' text-xs'}>{selected.source.title} · {formatDate(selected.publishedAt)}</p>
                  <p className="text-sm">{selected.claim}</p>
                  {selected.originalClaim && selected.originalClaim!==selected.claim &&
                    <details className="text-xs"><summary className={muted+' cursor-pointer'}>Original extracted text</summary>
                      <p className="mt-2 break-words">{selected.originalClaim}</p></details>}
                  <Link className="text-xs underline" href={ '/admin/newsletter/editor/' + encodeURIComponent(selected.sourceNewsletterId)}>
                    Open source newsletter
                  </Link>
                  <div><Label className="text-xs">Review result</Label>
                    <select className="block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      value={reviewStatus} onChange={e=>setReviewStatus(e.target.value as ReviewStatus)}>
                      <option value="unreviewed">Unreviewed</option><option value="verified">Verified</option>
                      <option value="needs_review">Needs follow-up</option><option value="dismissed">Ignore for learning</option>
                    </select></div>
                  <label className="flex gap-2 items-center text-sm">
                    <input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)} /> Pin as important
                  </label>
                  <div><Label className="text-xs">Correction / clarification</Label>
                    <Textarea value={correction} onChange={e=>setCorrection(e.target.value)} rows={2}
                      placeholder="What should the character remember instead, if necessary?" /></div>
                  <div><Label className="text-xs">Editorial note</Label>
                    <Textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
                      placeholder="Why this matters, or why it should be disregarded" /></div>
                  <Button disabled={saving} onClick={()=>mutate('annotate',{
                    receiptId:selected.id,reviewStatus,pinned,note,correction,
                  })}>{saving?'Saving…':'Save Memory Review'}</Button>
                  <hr className="border-[var(--border)]" />
                  <h5 className="text-sm font-semibold">Natural voice example</h5>
                  <p className={muted+' text-xs'}>Save an authentic passage to use when building future character exports.</p>
                  <Textarea value={voiceReason} onChange={e=>setVoiceReason(e.target.value)} rows={2}
                    placeholder="What makes this sound like this character?" />
                  <Button variant="secondary" disabled={saving} onClick={()=>mutate(selected.voiceSample?'remove_voice':'add_voice',{
                    receiptId:selected.id,note:voiceReason,
                  })}>{selected.voiceSample?'Remove Voice Example':'Approve Voice Example'}</Button>
                  <Button variant="secondary" onClick={()=>{
                    setGrowthSource(selected.id);setGrowthText('');changeView('growth');
                  }}>Use as growth evidence</Button>
                </> : <>
                  <h4 className="font-semibold">Memory details</h4>
                  <p className={muted+' text-sm'}>Select a published take to see its source, attach a correction, pin it, or approve it as an example of the character's voice.</p>
                </>}
              </div>
            </div>
          </>}

          {view === 'relationships' && <>
            <div className="flex gap-2">
              {(['teams','players'] as const).map(k=><Button key={k} variant={relationshipType===k?'primary':'secondary'}
                onClick={()=>{setRelationshipType(k);setExpandedRelationship(null);}}>{k==='teams'?'Teams ('+(data.teams?.length??0)+')':'Players ('+(data.players?.length??0)+')'}</Button>)}
            </div>
            <p className={muted+' text-xs'}>Trust and sentiment labels are displayed as stored. Published-take history does not automatically change these subjective scores.</p>
            <div className="grid md:grid-cols-2 gap-2">
              {relationshipType==='teams' ? data.teams?.map(team=>(
                <button key={team.name} type="button" className={panel+' text-left space-y-2'} onClick={()=>setExpandedRelationship(v=>v===team.name?null:team.name)}>
                  <div className="flex justify-between gap-2"><span className="font-semibold">{team.name}</span>
                    <span className={muted+' text-xs'}>{team.takeCount} takes</span></div>
                  <div className={muted+' text-xs'}>{team.stance} · Trust {team.trust} · Burned {team.burned} · Vindicated {team.vindicated}</div>
                  {team.narrative && <p className="text-sm line-clamp-3">{team.narrative}</p>}
                  {expandedRelationship===team.name && <div className="border-t border-[var(--border)] pt-3 space-y-2">
                    {(team.history??[]).map((h,i)=><div key={i} className="text-xs">
                      <span className={muted}>Season {h.season} Week {h.week}</span><p className="mt-1">{h.take}</p></div>)}
                  </div>}
                </button>
              )) : data.players?.map(player=>(
                <button key={player.name} type="button" className={panel+' text-left space-y-2'} onClick={()=>setExpandedRelationship(v=>v===player.name?null:player.name)}>
                  <div className="flex justify-between gap-2"><span className="font-semibold">{player.name}</span>
                    <span className={muted+' text-xs'}>{player.historyCount} takes</span></div>
                  <div className={muted+' text-xs'}>{player.team??'Team not recorded'} · {player.sentiment} · Trust {player.trust}</div>
                  {expandedRelationship===player.name && <div className="border-t border-[var(--border)] pt-3 space-y-2">
                    {player.history.map((h,i)=><div key={i} className="text-xs">
                      <span className={muted}>Season {h.season} Week {h.week}</span><p className="mt-1">{h.event}</p></div>)}
                  </div>}
                </button>
              ))}
            </div>
          </>}

          {view === 'growth' && <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Metric label="Hard lessons" value={data.growth?.hardLessons.length??0} />
              <Metric label="Recognized biases" value={data.growth?.recognizedBiases.length??0} />
              <Metric label="Recorded improvements" value={data.growth?.improvements.length??0} />
              <Metric label="Proposed/approved notes" value={data.notes?.length??0} />
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className={panel+' space-y-3'}>
                <h4 className="font-semibold">Propose character development</h4>
                <p className={muted+' text-xs'}>These observations are staged for approval. They do not silently rewrite personality traits or grade unresolved predictions.</p>
                <div><Label className="text-xs">Kind</Label>
                  <select className="w-full rounded-lg bg-[var(--background)] border border-[var(--border)] px-3 py-2 text-sm"
                    value={growthKind} onChange={e=>setGrowthKind(e.target.value as typeof growthKind)}>
                    <option value="lesson">Lesson learned</option><option value="bias">Recognized bias</option>
                    <option value="improvement">Improvement</option></select></div>
                <Textarea rows={4} value={growthText} onChange={e=>setGrowthText(e.target.value)}
                  placeholder="A specific, evidence-based development for this character" />
                <div><Label className="text-xs">Source receipt ID (optional)</Label>
                  <Input value={growthSource} onChange={e=>setGrowthSource(e.target.value)} placeholder="Select 'Use as growth evidence' from Memories" /></div>
                <Button disabled={saving||growthText.trim().length<15} onClick={async()=>{
                  await mutate('propose_growth',{kind:growthKind,text:growthText,receiptId:growthSource});
                  setGrowthText('');setGrowthSource('');
                }}>Submit for Review</Button>
              </div>
              <div className={panel+' space-y-3'}>
                <h4 className="font-semibold">Core personality dimensions</h4>
                {Object.entries(data.summary.personality??{}).map(([key,value])=><div key={key} className="text-xs">
                  <div className="flex justify-between mb-1"><span>{key.replace(/([A-Z])/g,' $1')}</span><span>{value}</span></div>
                  <div className="h-1.5 bg-[var(--border)] rounded overflow-hidden">
                    <div className="h-full bg-[var(--accent)]" style={{width:(Math.min(100,Math.max(0,(value+100)/2))+'%')}} />
                  </div></div>)}
                <p className={muted+' text-xs'}>Stored values, not claimed evidence of independent learning.</p>
              </div>
            </div>
            <div className={panel+' space-y-3'}>
              <h4 className="font-semibold">Development review queue</h4>
              {data.notes?.length ? [...data.notes].reverse().map(n=><div key={n.id} className="border-b border-[var(--border)] pb-3">
                <div className="flex items-center gap-2 text-xs"><span>{n.kind}</span>
                  <span className={statusColor(n.status)}>{n.status}</span><span className={muted}>{formatDate(n.createdAt)}</span></div>
                <p className="text-sm my-2">{n.text}</p>
                {n.receiptId && <button type="button" onClick={()=>goToEvidence(n.receiptId)}
                  className="text-xs underline mb-2">Inspect linked evidence</button>}
                <div className="flex gap-2">
                  <Button variant="secondary" disabled={saving||n.status==='approved'}
                    onClick={()=>mutate('review_growth',{noteId:n.id,status:'approved'})}>Approve</Button>
                  <Button variant="secondary" disabled={saving||n.status==='rejected'}
                    onClick={()=>mutate('review_growth',{noteId:n.id,status:'rejected'})}>Reject</Button>
                </div>
              </div>) : <p className={muted+' text-sm'}>No development notes yet. This is separate from the automatically extracted newsletter history.</p>}
            </div>
            <div className={panel+' space-y-2'}>
              <h4 className="font-semibold">Persisted lessons and interaction history</h4>
              {(data.growth?.hardLessons??[]).map((l,i)=><p className="text-sm" key={i}>Season {l.season} Week {l.week}: {l.lesson}</p>)}
              {!data.growth?.hardLessons.length && <p className={muted+' text-sm'}>No verified hard lessons stored yet.</p>}
              <p className={muted+' text-xs'}>Co-host interactions: {data.dynamics?.recentInteractions?.length??0} · Speech obsessions: {data.speech?.obsessions?.length??0}</p>
            </div>
          </>}

          {view === 'voice' && <>
            <div className="grid md:grid-cols-2 gap-3">
              <div className={panel+' space-y-3'}>
                <h4 className="font-semibold">Character identity</h4>
                <p className="text-sm">{data.identity?.role}</p>
                <div className="text-xs space-y-1">
                  {Object.entries(data.identity?.voice??{}).map(([key,value])=><div key={key}
                    className="flex justify-between"><span>{key}</span><span>{String(value)}</span></div>)}
                </div>
                <h5 className="text-sm font-semibold">Established natural phrases</h5>
                <p className={muted+' text-xs'}>{data.identity?.verbalTics?.join(' · ')||'None recorded'}</p>
                <Button onClick={onEditSettings} variant="secondary">Edit Voice and Identity Settings</Button>
              </div>
              <div className={panel+' space-y-2'}>
                <h4 className="font-semibold">Approved examples</h4>
                <p className={muted+' text-xs'}>Collected for the later active-brain export phase. They are not automatically inserted into current newsletter prompts.</p>
                {data.samples?.length ? data.samples.map(s=><div key={s.id} className="border-t border-[var(--border)] pt-2 space-y-2">
                  <p className="text-sm">{s.quote}</p>
                  {s.note&&<p className={muted+' text-xs'}>{s.note}</p>}
                  <Button variant="secondary" disabled={saving} onClick={()=>mutate('remove_voice',{receiptId:s.receiptId})}>Remove Example</Button>
                </div>) : <p className={muted+' text-sm'}>No approved voice examples. Choose authentic passages from the Memories tab.</p>}
                <Button variant="secondary" onClick={()=>changeView('memories')}>Find Voice Examples</Button>
              </div>
            </div>
          </>}

          {view==='history' && <div className="space-y-2">
            <p className={muted+' text-sm'}>Publication is the source of truth. Each issue links to its original saved newsletter.</p>
            {data.issues?.map(issue=><div key={issue.id} className={panel+' flex flex-wrap justify-between items-center gap-3'}>
              <div>
                <Link href={'/admin/newsletter/editor/'+encodeURIComponent(issue.id)}
                  className="font-semibold text-sm hover:underline">{issue.title??'Untitled issue'}</Link>
                <p className={muted+' text-xs'}>{formatDate(issue.date)} · {issue.type??'regular'} · Week {issue.week}</p>
              </div>
              <div className="text-right text-xs">
                <div className={issue.processed?'text-emerald-400':'text-amber-400'}>{issue.processed?'Processed':'Continuity missing'}</div>
                <div className={muted}>{issue.takes} takes · {issue.review} review flags</div>
              </div>
            </div>)}
          </div>}
        </>
      )}
    </div>
  );
}
