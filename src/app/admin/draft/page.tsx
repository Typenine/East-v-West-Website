'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SectionHeader from '@/components/ui/SectionHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { TEAM_NAMES } from '@/lib/constants/league';
import DraftOverlayLive from '@/components/draft-overlay/DraftOverlayLive';
import { getTeamLogoPath } from '@/lib/utils/team-utils';
import { getTeamColors } from '@/lib/constants/team-colors';

type DraftOverview = {
  id: string;
  year: number;
  rounds: number;
  clockSeconds: number;
  status: 'NOT_STARTED' | 'LIVE' | 'PAUSED' | 'COMPLETED';
  createdAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  curOverall: number;
  onClockTeam?: string | null;
  clockStartedAt?: string | null;
  deadlineTs?: string | null;
  recentPicks: Array<{ overall: number; round: number; team: string; playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null; madeAt: string }>;
  allPicks?: Array<{ overall: number; round: number; team: string; playerId: string; playerName?: string | null; playerPos?: string | null; playerNfl?: string | null; madeAt: string }>;
  upcoming: Array<{ overall: number; round: number; team: string }>;
  allSlots?: Array<{ overall: number; round: number; team: string }>;
};

function PlayerMediaCard() {
  type MediaEntry = { playerId: string; videoUrl: string | null; imageUrl: string | null; playerName: string | null };
  const [media, setMedia] = useState<MediaEntry[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; name: string; pos: string; nfl: string }>>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string; pos: string; nfl: string } | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  async function loadMedia() {
    try {
      const res = await fetch('/api/draft/player-videos', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      setMedia(j.videos || []);
    } catch {}
  }
  useEffect(() => { loadMedia(); }, []);

  async function searchPlayers() {
    if (!playerSearch.trim()) return;
    try {
      const res = await fetch('/api/draft', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'available', q: playerSearch, limit: 20 }),
      });
      setSearchResults((await res.json())?.available || []);
    } catch {}
  }

  async function saveMedia() {
    if (!selectedPlayer) return;
    setSaving(true);
    try {
      if (videoUrl.trim()) {
        setUploadProgress('Saving video URL…');
        await fetch('/api/draft/player-videos', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ playerId: selectedPlayer.id, videoUrl: videoUrl.trim(), playerName: selectedPlayer.name }),
        });
        setVideoUrl('');
      }
      if (videoFile) {
        setUploadProgress(`Uploading ${videoFile.name}…`);
        const fd = new FormData();
        fd.append('file', videoFile); fd.append('type', 'video');
        fd.append('playerId', selectedPlayer.id); fd.append('playerName', selectedPlayer.name);
        const r = await fetch('/api/draft/player-media', { method: 'POST', body: fd });
        if (!r.ok) { alert('Video upload failed'); }
        setVideoFile(null);
      }
      if (imageFile) {
        setUploadProgress(`Uploading ${imageFile.name}…`);
        const fd = new FormData();
        fd.append('file', imageFile); fd.append('type', 'image');
        fd.append('playerId', selectedPlayer.id); fd.append('playerName', selectedPlayer.name);
        const r = await fetch('/api/draft/player-media', { method: 'POST', body: fd });
        if (!r.ok) { alert('Image upload failed'); }
        setImageFile(null);
      }
      setSelectedPlayer(null); setPlayerSearch(''); setSearchResults([]);
      await loadMedia();
    } catch { alert('Save failed'); }
    finally { setSaving(false); setUploadProgress(null); }
  }

  async function deleteEntry(playerId: string) {
    if (!confirm('Remove all media for this player?')) return;
    setDeletingId(playerId);
    try {
      await fetch('/api/draft/player-videos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerId, action: 'delete' }),
      });
      await loadMedia();
    } catch { alert('Delete failed'); }
    finally { setDeletingId(null); }
  }

  const canSave = !!(selectedPlayer && (videoUrl.trim() || videoFile || imageFile));

  return (
    <div className="max-w-4xl space-y-6">
      {/* Add/update panel */}
      <Card>
        <CardHeader><CardTitle>Add / Update Player Media</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted)] mb-4">
            Attach a highlight video and/or player headshot to any player. The image appears on the draft pick card; the video plays after the animation sequence.
          </p>
          <div className="space-y-4">
            {/* Player search */}
            <div className="space-y-2">
              <Label className="block text-sm font-semibold">1. Find Player</Label>
              <div className="flex gap-2">
                <Input value={playerSearch} onChange={e => setPlayerSearch(e.target.value)}
                  placeholder="Search player name…" className="flex-1"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchPlayers(); } }} />
                <Button size="sm" onClick={searchPlayers}>Search</Button>
              </div>
              {searchResults.length > 0 && !selectedPlayer && (
                <div className="max-h-40 overflow-auto border border-zinc-600 rounded bg-zinc-900">
                  {searchResults.map(p => (
                    <button key={p.id} type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-700 flex items-center justify-between"
                      onClick={() => { setSelectedPlayer(p); setSearchResults([]); }}>
                      <span className="font-medium">{p.name}</span>
                      <span className="text-xs text-[var(--muted)] ml-2">{p.pos} · {p.nfl}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedPlayer && (
                <div className="flex items-center gap-2 p-2 bg-zinc-700/50 rounded text-sm">
                  <span className="font-semibold text-white">{selectedPlayer.name}</span>
                  <span className="text-zinc-400">{selectedPlayer.pos} · {selectedPlayer.nfl}</span>
                  <button type="button" className="ml-auto text-zinc-400 hover:text-white" onClick={() => { setSelectedPlayer(null); setVideoUrl(''); setVideoFile(null); setImageFile(null); }}>✕ Clear</button>
                </div>
              )}
            </div>

            {/* Video */}
            <div className="space-y-2">
              <Label className="block text-sm font-semibold">2. Video <span className="text-zinc-500 font-normal">(YouTube URL or local file)</span></Label>
              <Input value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=… or leave blank to use file" className="w-full" disabled={!selectedPlayer} />
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-500">Or upload file:</span>
                <input type="file" accept="video/*" disabled={!selectedPlayer}
                  className="text-sm text-zinc-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-zinc-700 file:text-white hover:file:bg-zinc-600"
                  onChange={e => setVideoFile(e.target.files?.[0] || null)} />
                {videoFile && <span className="text-xs text-green-400">{videoFile.name}</span>}
              </div>
            </div>

            {/* Image */}
            <div className="space-y-2">
              <Label className="block text-sm font-semibold">3. Player Image <span className="text-zinc-500 font-normal">(headshot for draft card)</span></Label>
              <div className="flex items-center gap-3">
                <input type="file" accept="image/*" disabled={!selectedPlayer}
                  className="text-sm text-zinc-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:bg-zinc-700 file:text-white hover:file:bg-zinc-600"
                  onChange={e => setImageFile(e.target.files?.[0] || null)} />
                {imageFile && <span className="text-xs text-green-400">{imageFile.name}</span>}
              </div>
            </div>

            {uploadProgress && <p className="text-sm text-blue-400 animate-pulse">{uploadProgress}</p>}

            <Button variant="primary" disabled={!canSave || saving} onClick={saveMedia} className="w-full sm:w-auto">
              {saving ? 'Saving…' : 'Save Media'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing media list */}
      <Card>
        <CardHeader><CardTitle>Existing Media ({media.length})</CardTitle></CardHeader>
        <CardContent>
          {media.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No player media set yet.</p>
          ) : (
            <div className="space-y-2">
              {media.map(m => (
                <div key={m.playerId} className="flex items-center gap-3 p-2 bg-zinc-800/40 rounded">
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt={m.playerName || ''} className="w-10 h-12 object-cover rounded flex-shrink-0" style={{ objectPosition: 'top center' }} />
                  ) : (
                    <div className="w-10 h-12 bg-zinc-700 rounded flex-shrink-0 flex items-center justify-center text-zinc-500 text-xs">No img</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-white truncate">{m.playerName || m.playerId}</div>
                    <div className="text-xs text-zinc-400 space-x-2">
                      {m.videoUrl && <span>🎬 {m.videoUrl.startsWith('/') ? 'local video' : m.videoUrl.length > 50 ? m.videoUrl.slice(0, 50) + '…' : m.videoUrl}</span>}
                      {m.imageUrl && <span>🖼️ {m.imageUrl.startsWith('/') ? 'local image' : m.imageUrl.slice(0, 30) + '…'}</span>}
                      {!m.videoUrl && !m.imageUrl && <span className="text-zinc-600">no media</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-red-400 hover:bg-red-900/30 flex-shrink-0"
                    disabled={deletingId === m.playerId} onClick={() => deleteEntry(m.playerId)}>
                    {deletingId === m.playerId ? '…' : '🗑️'}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminDraftPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftOverview | null>(null);
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [clockMins, setClockMins] = useState('10');
  const [clockSecs, setClockSecs] = useState('0');
  const [form, setForm] = useState({ year: new Date().getFullYear().toString(), rounds: '4' });
  const [roundOrders, setRoundOrders] = useState<Record<number, string[]>>({});
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState('');
  const [avail, setAvail] = useState<Array<{ id: string; name: string; pos: string; nfl: string }>>([]);
  const [forcePlayer, setForcePlayer] = useState<{ id: string; name: string; pos: string; nfl: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [teamOrder, setTeamOrder] = useState<string[]>(TEAM_NAMES);
  const [playersInfo, setPlayersInfo] = useState<{ useCustom: boolean; count: number }>({ useCustom: false, count: 0 });
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [pendingPick, setPendingPick] = useState<{
    id: string; overall: number; team: string; playerId: string;
    playerName: string | null; playerPos: string | null; playerNfl: string | null; submittedAt: string;
  } | null>(null);
  const [approvingPick, setApprovingPick] = useState(false);
  const [activeTab, setActiveTab] = useState<'draft' | 'media'>('draft');

  // Convert mins:secs to total seconds
  const getTotalSeconds = () => Number(clockMins || 0) * 60 + Number(clockSecs || 0);
  
  // Format seconds as MM:SS
  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  useEffect(() => {
    fetch('/api/admin-login').then(r => r.json()).then(j => setIsAdmin(Boolean(j?.isAdmin))).catch(() => setIsAdmin(false));
  }, []);

  async function load(includeAvail = false, showSpinner = false) {
    try {
      if (showSpinner) setLoading(true);
      const url = includeAvail ? '/api/draft?include=available' : '/api/draft';
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const j = await res.json();
      setDraft(j?.draft || null);
      setRemainingSec(j?.remainingSec ?? null);
      setPendingPick(j?.pendingPick ?? null);
      if (includeAvail) setAvail(j?.available || []);
    } catch {
      setError('Failed to load draft');
    } finally {
      if (showSpinner) setLoading(false);
    }
  }

  useEffect(() => {
    load(true, true);
    const t = setInterval(() => load(false), 3000);
    return () => clearInterval(t);
  }, []);

  async function refreshPlayersInfo() {
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'players_info' }) });
      const j = await res.json();
      setPlayersInfo({ useCustom: Boolean(j?.useCustom), count: Number(j?.count || 0) });
    } catch {}
  }
  useEffect(() => { refreshPlayersInfo(); }, []);

  // Auto-load draft order from existing /api/draft/next-order endpoint
  // This loads ALL rounds with their unique orders (accounting for trades)
  useEffect(() => {
    if (orderLoaded) return;
    
    async function loadDraftOrder() {
      try {
        const res = await fetch('/api/draft/next-order', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        
        // Load per-round orders from roundsData
        if (data?.roundsData && Array.isArray(data.roundsData)) {
          const newRoundOrders: Record<number, string[]> = {};
          for (const rd of data.roundsData) {
            if (rd.round && rd.picks) {
              // Order by slot, map to ownerTeam (who owns the pick now)
              const sortedPicks = [...rd.picks].sort((a: {slot: number}, b: {slot: number}) => a.slot - b.slot);
              newRoundOrders[rd.round] = sortedPicks.map((p: {ownerTeam: string}) => p.ownerTeam);
            }
          }
          if (Object.keys(newRoundOrders).length > 0) {
            setRoundOrders(newRoundOrders);
            // Use round 1 as the base teamOrder display
            if (newRoundOrders[1]) {
              setTeamOrder(newRoundOrders[1]);
            }
            setOrderLoaded(true);
          }
        } else if (data?.slotOrder && Array.isArray(data.slotOrder)) {
          // Fallback to basic slot order
          const order = data.slotOrder.map((slot: { team: string }) => slot.team);
          if (order.length > 0) {
            setTeamOrder(order);
            setOrderLoaded(true);
          }
        }
      } catch (err) {
        console.error('Failed to auto-load draft order:', err);
      }
    }
    
    loadDraftOrder();
  }, [orderLoaded]);

  const onAdmin = async (action: string, payload?: Record<string, unknown>) => {
    setBusy(action);
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...(payload || {}) }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || 'failed');
      await load(true);
    } catch (e) {
      alert((e as Error).message || 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const recent = draft?.recentPicks || [];
  const upcoming = draft?.upcoming || [];

  const parsePlayersText = (text: string): Array<{ id: string; name: string; pos: string; nfl?: string | null; rank?: number }> => {
    // Try JSON first
    try {
      const j = JSON.parse(text);
      if (Array.isArray(j)) {
        return j
          .map((o: unknown) => {
            const obj = (o as Record<string, unknown>) || {};
            const getStr = (k: string) => {
              const v = obj[k];
              return typeof v === 'string' ? v : '';
            };
            const getNum = (k: string) => {
              const v = obj[k];
              if (typeof v === 'number') return v;
              if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
              return undefined;
            };
            const id = (getStr('id') || getStr('player_id')).trim();
            const name = (getStr('name') || `${getStr('first_name')} ${getStr('last_name')}`).trim();
            const pos = (getStr('pos') || getStr('position')).trim().toUpperCase();
            const nfl = (getStr('nfl') || getStr('team'));
            const rank = getNum('rank');
            return rank != null ? { id, name, pos, nfl, rank } : { id, name, pos, nfl };
          })
          .filter((p) => p.id && p.name && p.pos);
      }
    } catch {}
    // Fallback CSV (id,name,pos,nfl or first_name,last_name)
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const headers = (lines.shift() || '')
      .split(',')
      .map((h) => h.trim().toLowerCase());
    const idx = (k: string) => headers.indexOf(k);
    const idIdx = idx('id') >= 0 ? idx('id') : idx('player_id');
    const nameIdx = idx('name');
    const firstIdx = idx('first_name');
    const lastIdx = idx('last_name');
    const posIdx = idx('pos') >= 0 ? idx('pos') : idx('position');
    const nflIdx = idx('nfl') >= 0 ? idx('nfl') : idx('team');
    const rankIdx = idx('rank') >= 0 ? idx('rank') : -1;
    const out: Array<{ id: string; name: string; pos: string; nfl?: string | null; rank?: number }> = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      const cols = line.split(',').map((c) => c.trim());
      const id = (cols[idIdx] || '').trim();
      const name = nameIdx >= 0 ? (cols[nameIdx] || '').trim() : `${cols[firstIdx] || ''} ${cols[lastIdx] || ''}`.trim();
      const pos = ((cols[posIdx] || '').trim().toUpperCase());
      const nfl = (nflIdx >= 0 ? cols[nflIdx] : '') || '';
      const rankRaw = rankIdx >= 0 ? cols[rankIdx] : '';
      const rank = rankRaw && !Number.isNaN(Number(rankRaw)) ? Number(rankRaw) : undefined;
      if (id && name && pos) out.push(rank != null ? { id, name, pos, nfl, rank } : { id, name, pos, nfl });
    }
    return out;
  };

  const onUploadPlayers = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const text = await file.text();
    const players = parsePlayersText(text);
    if (!players || players.length === 0) { alert('No players parsed'); return; }
    setBusy('upload_players');
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'upload_players', players }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || 'failed');
      await refreshPlayersInfo();
      alert(`Uploaded ${j?.count ?? players.length} players`);
    } catch (e) {
      alert((e as Error).message || 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const onClearPlayers = async () => {
    setBusy('clear_players');
    try {
      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'clear_players' }) });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || 'failed');
      await refreshPlayersInfo();
    } catch (e) {
      alert((e as Error).message || 'Clear failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1800px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <SectionHeader title="Admin: Draft Control" />
        <div className="flex gap-2">
          <Link href="/draft">
            <Button variant="ghost" size="sm">← Draft Page</Button>
          </Link>
          <Link href="/draft/room">
            <Button variant="ghost" size="sm">� Draft Room</Button>
          </Link>
        </div>
      </div>

      {/* Pending Pick Approval — floating panel */}
      {pendingPick && (
        <div
          className="fixed bottom-6 right-6 z-[9999] w-80 rounded-xl border-2 border-yellow-400 bg-zinc-900 shadow-2xl p-4 animate-pulse"
          style={{ boxShadow: '0 0 24px rgba(250,204,21,0.4)' }}
        >
          <div className="text-yellow-400 font-black text-sm uppercase tracking-widest mb-1">⏳ Pending Pick</div>
          <div className="text-white font-bold text-lg leading-tight mb-0.5">
            {pendingPick.playerName || pendingPick.playerId}
          </div>
          <div className="text-zinc-400 text-xs mb-1">
            {[pendingPick.playerPos, pendingPick.playerNfl].filter(Boolean).join(' · ')}
          </div>
          <div className="text-zinc-300 text-sm mb-3">
            <span className="font-semibold">{pendingPick.team}</span>
            <span className="text-zinc-500 ml-2">Pick #{pendingPick.overall}</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={approvingPick}
              onClick={async () => {
                setApprovingPick(true);
                try {
                  const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'approve_pick' }) });
                  const j = await res.json();
                  if (!j.ok) alert(j.error || 'Approve failed');
                  else { setPendingPick(null); await load(true); }
                } catch { alert('Approve failed'); }
                finally { setApprovingPick(false); }
              }}
            >
              {approvingPick ? '…' : '✓ Approve'}
            </Button>
            <Button
              variant="ghost"
              className="flex-1 border border-red-600 text-red-400 hover:bg-red-900/30"
              disabled={approvingPick}
              onClick={async () => {
                setApprovingPick(true);
                try {
                  await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'reject_pick' }) });
                  setPendingPick(null);
                } catch { alert('Reject failed'); }
                finally { setApprovingPick(false); }
              }}
            >
              ✗ Reject
            </Button>
          </div>
        </div>
      )}

      {/* Live Overlay - Full Screen Display */}
      {draft && (
        <div className="mb-4 rounded-lg overflow-hidden border border-[var(--border)] bg-black" style={{ height: 'calc(100vh - 300px)', minHeight: '700px' }}>
          <DraftOverlayLive />
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 border-b border-zinc-700">
        {(['draft', 'media'] as const).map(tab => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-semibold rounded-t-lg transition-colors -mb-px border-b-2 ${
              activeTab === tab
                ? 'border-[#bf9944] text-white bg-zinc-800'
                : 'border-transparent text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
          >
            {tab === 'draft' ? '⚙️ Draft Control' : '🎬 Player Media'}
          </button>
        ))}
      </div>

      {error && activeTab === 'draft' && (
        <div className="mb-4 text-[var(--danger)] text-sm">{error}</div>
      )}

      {/* Media Tab */}
      {activeTab === 'media' && isAdmin && <PlayerMediaCard />}

      {activeTab === 'draft' && (
        !isAdmin ? (
          <Card><CardContent><p className="text-[var(--muted)]">Admin mode required. Use the Admin login on /login.</p></CardContent></Card>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {/* Live Status Banner */}
            {draft && (
              <div className={`rounded-lg p-4 ${draft.status === 'LIVE' ? 'bg-emerald-900/30 border border-emerald-600' : draft.status === 'PAUSED' ? 'bg-yellow-900/30 border border-yellow-600' : 'bg-zinc-800/50 border border-zinc-700'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`px-3 py-1 rounded-full text-sm font-bold ${draft.status === 'LIVE' ? 'bg-emerald-600 text-white' : draft.status === 'PAUSED' ? 'bg-yellow-600 text-black' : 'bg-zinc-600 text-white'}`}>
                      {draft.status}
                    </div>
                    <div className="text-lg">
                      <span className="font-bold">{draft.onClockTeam || '—'}</span>
                      <span className="text-[var(--muted)] ml-2">on the clock</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-3xl font-mono font-bold ${remainingSec !== null && remainingSec <= 10 ? 'text-red-500' : ''}`}>
                      {remainingSec !== null ? formatTime(remainingSec) : '--:--'}
                    </div>
                    <div className="text-sm text-[var(--muted)]">
                      Pick #{draft.curOverall} • Round {draft.upcoming?.[0]?.round || Math.ceil(draft.curOverall / TEAM_NAMES.length)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Card>
              <CardHeader>
                <CardTitle>{draft ? 'Draft Controls' : 'Create Draft'}</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-[var(--muted)]">Loading…</p>
                ) : !draft ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <Label className="mb-1 block">Year</Label>
                        <Input value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
                      </div>
                      <div>
                        <Label className="mb-1 block">Rounds</Label>
                        <Input type="number" min={1} value={form.rounds} onChange={(e) => setForm({ ...form, rounds: e.target.value })} />
                      </div>
                      <div>
                        <Label className="mb-1 block">Clock Time</Label>
                        <div className="flex gap-1 items-center">
                          <Input type="number" min={0} max={59} value={clockMins} onChange={(e) => setClockMins(e.target.value)} className="w-16 text-center" placeholder="min" />
                          <span className="text-lg font-bold">:</span>
                          <Input type="number" min={0} max={59} value={clockSecs} onChange={(e) => setClockSecs(e.target.value)} className="w-16 text-center" placeholder="sec" />
                        </div>
                      </div>
                      <div>
                        <Label className="mb-1 block">Draft Type</Label>
                        <div className="text-sm text-[var(--muted)] py-2">Linear (Dynasty)</div>
                      </div>
                    </div>
                    <div>
                      <Label className="mb-2 block">Draft Order (All Rounds)</Label>
                      <div className="grid grid-cols-4 gap-2 max-h-80 overflow-auto border rounded bg-zinc-900/50 p-2">
                        {[1, 2, 3, 4].map(round => {
                          const order = roundOrders[round] || teamOrder;
                          return (
                            <div key={round} className="space-y-1">
                              <div className="text-xs font-bold text-center text-[var(--muted)] border-b border-zinc-700 pb-1">Round {round}</div>
                              {order.map((t, i) => (
                                <div key={`${round}-${i}`} className="text-xs px-1 py-0.5 bg-zinc-800/50 rounded flex items-center gap-1">
                                  <span className="text-[var(--muted)] w-4">{i + 1}.</span>
                                  <span className="truncate">{t}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setTeamOrder(TEAM_NAMES)}>Reset to Default</Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={async () => {
                            setOrderLoaded(false);
                            try {
                              const res = await fetch('/api/draft/next-order', { cache: 'no-store' });
                              if (!res.ok) throw new Error('Failed to fetch');
                              const data = await res.json();
                              // Load per-round orders from roundsData
                              if (data?.roundsData && Array.isArray(data.roundsData)) {
                                const newRoundOrders: Record<number, string[]> = {};
                                for (const rd of data.roundsData) {
                                  if (rd.round && rd.picks) {
                                    const sortedPicks = [...rd.picks].sort((a: {slot: number}, b: {slot: number}) => a.slot - b.slot);
                                    newRoundOrders[rd.round] = sortedPicks.map((p: {ownerTeam: string}) => p.ownerTeam);
                                  }
                                }
                                if (Object.keys(newRoundOrders).length > 0) {
                                  setRoundOrders(newRoundOrders);
                                  if (newRoundOrders[1]) setTeamOrder(newRoundOrders[1]);
                                  setOrderLoaded(true);
                                }
                              } else if (data?.slotOrder && Array.isArray(data.slotOrder)) {
                                const order = data.slotOrder.map((slot: { team: string }) => slot.team);
                                if (order.length > 0) {
                                  setTeamOrder(order);
                                  setRoundOrders({});
                                  setOrderLoaded(true);
                                }
                              }
                            } catch (e) {
                              alert(`❌ Error: ${(e as Error).message}`);
                            }
                          }}
                        >
                          🔄 Reload from Standings
                        </Button>
                      </div>
                      {orderLoaded && (
                        <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                          <span>✓</span> Order synced with standings
                        </div>
                      )}
                    </div>
                    <Button disabled={busy==='create'} onClick={() => onAdmin('create', { year: Number(form.year), rounds: Number(form.rounds), clockSeconds: getTotalSeconds(), teams: teamOrder, roundOrders: Object.keys(roundOrders).length > 0 ? roundOrders : undefined })}>
                      Create Draft
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Primary Controls */}
                    <div className="flex flex-wrap gap-2">
                      {draft.status === 'NOT_STARTED' && (
                        <Button disabled={busy==='start'} variant="primary" onClick={() => onAdmin('start')}>▶️ Start Draft</Button>
                      )}
                      {draft.status === 'LIVE' && (
                        <Button disabled={busy==='pause'} variant="ghost" onClick={() => onAdmin('pause')}>⏸️ Pause</Button>
                      )}
                      {draft.status === 'PAUSED' && (
                        <Button disabled={busy==='resume'} variant="primary" onClick={() => onAdmin('resume')}>▶️ Resume</Button>
                      )}
                      <Button disabled={busy==='undo'} variant="ghost" onClick={() => onAdmin('undo')}>↩️ Undo Last Pick</Button>
                      <Button disabled={busy==='skip_pick'} variant="ghost" onClick={() => onAdmin('skip_pick')} title="Skip current pick and advance to next">
                        ⏭️ Skip Pick
                      </Button>
                      <Button disabled={busy==='auto_pick'} variant="ghost" onClick={() => onAdmin('auto_pick')} title="Force auto-pick using queue or highest-ranked player">
                        🤖 Auto-Pick
                      </Button>
                      <a href="/draft/room" target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">👥 Team View →</Button>
                      </a>
                      <Button 
                        disabled={busy==='reset'} 
                        variant="ghost" 
                        size="sm"
                        onClick={async () => {
                          if (!confirm('RESET draft to Round 1? This will clear all picks but keep the draft order.')) return;
                          await onAdmin('reset');
                          await load(true);
                        }}
                        title="Clear all picks but keep draft order"
                      >
                        🔄 Reset Draft
                      </Button>
                      <Button 
                        disabled={busy==='delete'} 
                        variant="danger" 
                        size="sm"
                        onClick={async () => {
                          if (!confirm('DELETE this entire draft? This cannot be undone!')) return;
                          await onAdmin('delete');
                          await load(true);
                        }}
                      >
                        🗑️ Delete Draft
                      </Button>
                    </div>

                    {/* Clock Controls */}
                    <div className="p-3 bg-zinc-800/50 rounded-lg">
                      <Label className="mb-2 block text-sm font-semibold">Set Clock Time</Label>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1 items-center">
                          <Input type="number" min={0} max={59} value={clockMins} onChange={(e) => setClockMins(e.target.value)} className="w-16 text-center" />
                          <span className="text-lg font-bold">:</span>
                          <Input type="number" min={0} max={59} value={clockSecs} onChange={(e) => setClockSecs(e.target.value)} className="w-16 text-center" />
                        </div>
                        <span className="text-sm text-[var(--muted)]">({getTotalSeconds()}s)</span>
                        <Button disabled={busy==='set_clock'} size="sm" onClick={() => onAdmin('set_clock', { seconds: getTotalSeconds() })}>
                          Apply
                        </Button>
                        <div className="flex gap-1 flex-wrap">
                          <Button size="sm" variant="ghost" onClick={() => { setClockMins('0'); setClockSecs('10'); }}>0:10</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setClockMins('0'); setClockSecs('30'); }}>0:30</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setClockMins('1'); setClockSecs('0'); }}>1:00</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setClockMins('2'); setClockSecs('0'); }}>2:00</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setClockMins('5'); setClockSecs('0'); }}>5:00</Button>
                          <Button size="sm" variant="ghost" onClick={() => { setClockMins('10'); setClockSecs('0'); }}>10:00</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pick Reordering - Only show when draft is LIVE or PAUSED */}
            {draft && (draft.status === 'LIVE' || draft.status === 'PAUSED') && (
              <Card>
                <CardHeader>
                  <CardTitle>Assign Teams to Picks</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-[var(--muted)] mb-4">
                    Select a team for each unpicked slot. Use this to handle trades or reorder picks.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[600px] overflow-y-auto">
                    {(draft.allSlots?.filter(s => s.overall >= draft.curOverall) || upcoming).map((pick) => {
                      const teamLogo = getTeamLogoPath(pick.team);
                      const teamColors = getTeamColors(pick.team);
                      return (
                        <div 
                          key={pick.overall} 
                          className="flex items-center gap-2 p-2 rounded border" 
                          style={{ borderColor: teamColors.primary + '40', backgroundColor: teamColors.primary + '10' }}
                        >
                          <div className="flex items-center gap-2 min-w-[80px]">
                            {teamLogo && <img src={teamLogo} alt={pick.team} className="w-6 h-6 object-contain" />}
                            <span className="font-semibold text-sm">#{pick.overall}</span>
                            <span className="text-xs text-[var(--muted)]">R{pick.round}</span>
                          </div>
                          <Select
                            value={pick.team}
                            onChange={async (e) => {
                              const newTeam = e.target.value;
                              if (newTeam === pick.team) return;
                              setBusy('update_slot_' + pick.overall);
                              try {
                                const res = await fetch('/api/draft', {
                                  method: 'POST',
                                  headers: { 'content-type': 'application/json' },
                                  body: JSON.stringify({ 
                                    action: 'update_slot', 
                                    overall: pick.overall, 
                                    team: newTeam  // Fixed: was 'newTeam', API expects 'team'
                                  })
                                });
                                const j = await res.json();
                                if (!j.ok) {
                                  alert(j.error === 'slot_has_pick' ? 'This pick has already been made' : 'Failed to update slot');
                                } else {
                                  await load(true);
                                }
                              } catch {
                                alert('Failed to update slot');
                              } finally {
                                setBusy(null);
                              }
                            }}
                            disabled={busy?.startsWith('update_slot')}
                            className="flex-1 text-sm"
                          >
                            {TEAM_NAMES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </Select>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}


            {/* Testing Tools */}
            {draft && draft.status !== 'COMPLETED' && (
              <Card>
                <CardHeader>
                  <CardTitle>🧪 Testing Tools</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!avail.length) {
                            alert('Search for players first using the Force Pick panel');
                            return;
                          }
                          const randomPlayer = avail[Math.floor(Math.random() * avail.length)];
                          await onAdmin('force_pick', { playerId: randomPlayer.id, playerName: randomPlayer.name, playerPos: randomPlayer.pos, playerNfl: randomPlayer.nfl });
                        }}
                        disabled={Boolean(busy) || draft.status !== 'LIVE'}
                      >
                        🎲 Auto-Pick Random
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!avail.length) {
                            alert('Search for players first using the Force Pick panel');
                            return;
                          }
                          if (!confirm('Auto-fill entire round with random picks? This will make 12 picks.')) return;
                          setBusy('auto-fill');
                          try {
                            for (let i = 0; i < 12; i++) {
                              const randomPlayer = avail[Math.floor(Math.random() * Math.min(avail.length, 50))];
                              await fetch('/api/draft', {
                                method: 'POST',
                                headers: { 'content-type': 'application/json' },
                                body: JSON.stringify({ action: 'force_pick', playerId: randomPlayer.id, playerName: randomPlayer.name, playerPos: randomPlayer.pos, playerNfl: randomPlayer.nfl })
                              });
                              await new Promise(resolve => setTimeout(resolve, 500));
                            }
                            await load(true);
                          } catch (e) {
                            alert('Auto-fill failed: ' + (e as Error).message);
                          } finally {
                            setBusy(null);
                          }
                        }}
                        disabled={Boolean(busy) || draft.status !== 'LIVE'}
                      >
                        ⚡ Auto-Fill Round
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          window.open('/draft/overlay', 'overlay', 'width=1920,height=1080');
                        }}
                      >
                        🖥️ Test Overlay
                      </Button>
                    </div>
                    <div className="text-xs text-[var(--muted)] space-y-1 mt-3">
                      <p>• <strong>Auto-Pick Random:</strong> Makes a random pick for current team (tests single animation)</p>
                      <p>• <strong>Auto-Fill Round:</strong> Completes entire round quickly (tests board fill + multiple animations)</p>
                      <p>• <strong>Test Overlay:</strong> Opens overlay in popup to verify animations while making picks</p>
                      <p className="text-yellow-600">⚠️ Testing tools only work when draft is LIVE. Search for players first.</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader><CardTitle>Recent Picks</CardTitle></CardHeader>
              <CardContent>
                {recent.length === 0 ? <p className="text-[var(--muted)]">No picks yet.</p> : (
                  <ul className="space-y-2">
                    {recent.slice().reverse().map((p, idx) => {
                      const teamLogo = getTeamLogoPath(p.team);
                      const teamColors = getTeamColors(p.team);
                      return (
                        <li 
                          key={`${p.overall}-${idx}`} 
                          className="flex items-center gap-3 p-2 rounded"
                          style={{
                            background: `linear-gradient(90deg, ${teamColors.primary}20 0%, transparent 100%)`,
                            borderLeft: `3px solid ${teamColors.primary}`
                          }}
                        >
                          <div className="w-8 h-8 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                            {teamLogo && <img src={teamLogo} alt={p.team} className="w-full h-full object-contain" />}
                          </div>
                          <div className="flex-1 text-sm">
                            <div className="font-semibold">#{p.overall} (R{p.round}) — {p.playerName || p.playerId}</div>
                            <div className="text-xs text-[var(--muted)]">{p.team}</div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Upcoming Picks</CardTitle></CardHeader>
              <CardContent>
                {upcoming.length === 0 ? <p className="text-[var(--muted)]">—</p> : (
                  <ul className="space-y-1">
                    {upcoming.map((u) => {
                      const teamLogo = getTeamLogoPath(u.team);
                      const teamColors = getTeamColors(u.team);
                      return (
                        <li 
                          key={u.overall} 
                          className="flex items-center gap-2 p-1 text-xs rounded"
                          style={{
                            background: `${teamColors.primary}10`,
                            borderLeft: `2px solid ${teamColors.primary}`
                          }}
                        >
                          <div className="w-6 h-6 bg-zinc-800 rounded overflow-hidden flex-shrink-0">
                            {teamLogo && <img src={teamLogo} alt={u.team} className="w-full h-full object-contain" />}
                          </div>
                          <span className="font-semibold">#{u.overall}</span>
                          <span className="text-[var(--muted)]">R{u.round}</span>
                          <span className="flex-1">{u.team}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader><CardTitle>Force Pick</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div>
                    <Label className="mb-1 block">Search</Label>
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name search" />
                  </div>
                  <div>
                    <Label className="mb-1 block">Position</Label>
                    <Select value={pos} onChange={(e) => setPos(e.target.value)}>
                      <option value="">All</option>
                      {['QB','RB','WR','TE','K'].map((p) => <option key={p} value={p}>{p}</option>)}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button onClick={async () => {
                      const res = await fetch('/api/draft', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'available', q: search, pos, limit: 50 }) });
                      const j = await res.json();
                      setAvail(j?.available || []);
                    }}>Search</Button>
                    <Button variant="ghost" onClick={() => setAvail([])}>Clear</Button>
                  </div>
                  <div className="max-h-64 overflow-auto border rounded p-2">
                    <ul className="space-y-1">
                      {avail.map((p) => (
                        <li key={p.id} className="flex items-center justify-between text-sm">
                          <span>{p.name} <span className="text-[var(--muted)]">({p.pos} {p.nfl})</span></span>
                          <Button size="sm" onClick={() => setForcePlayer(p)}>Select</Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {forcePlayer && (
                    <div className="text-sm p-2 bg-blue-50 rounded">
                      Selected: <strong>{forcePlayer.name}</strong> ({forcePlayer.pos} {forcePlayer.nfl})
                    </div>
                  )}
                  <Button disabled={!forcePlayer || busy==='force_pick'} onClick={() => onAdmin('force_pick', { playerId: forcePlayer!.id, playerName: forcePlayer!.name, playerPos: forcePlayer!.pos, playerNfl: forcePlayer!.nfl })}>Force Pick</Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Custom Player Pool</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <p className="text-sm">{playersInfo.useCustom ? `Using custom list (${playersInfo.count} players)` : 'Using Sleeper player pool'}</p>
                  <div className="text-xs text-[var(--muted)]">
                    <p className="mb-2">Accepted formats:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>CSV with header: <strong>id,name,pos,nfl,rank</strong> (nfl and rank optional). Synonyms allowed: <em>player_id</em> for id, <em>first_name,last_name</em> for name, <em>position</em> for pos, <em>team</em> for nfl.</li>
                      <li>JSON array of objects with keys: <strong>id</strong>, <strong>name</strong> (or <em>first_name</em> + <em>last_name</em>), <strong>pos</strong>, optional <strong>nfl</strong>, optional <strong>rank</strong>.</li>
                    </ul>
                  </div>
                  <div>
                    <Label className="mb-1 block">Upload CSV or JSON</Label>
                    <Input type="file" accept=".csv,.json" onChange={(e) => onUploadPlayers(e.target.files)} />
                  </div>
                  <div className="flex gap-2">
                    <Button disabled={busy==='upload_players'} onClick={() => { /* file input triggers upload */ }}>Upload</Button>
                    <Button variant="ghost" disabled={!playersInfo.useCustom || busy==='clear_players'} onClick={onClearPlayers}>Clear Custom Players</Button>
                    <Button variant="ghost" onClick={() => {
                      const header = 'id,name,pos,nfl,rank\n';
                      const sample = [
                        'p001,John Doe,RB,SEA,1',
                        'p002,Jane Smith,WR,DAL,2',
                        'p003,Bob Qb,QB,KC,3',
                      ].join('\n');
                      const blob = new Blob([header + sample + '\n'], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'evw-draft-template.csv'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                    }}>Download CSV Template</Button>
                    <Button variant="ghost" onClick={() => {
                      const data = [
                        { id: 'p001', name: 'John Doe', pos: 'RB', nfl: 'SEA', rank: 1 },
                        { id: 'p002', name: 'Jane Smith', pos: 'WR', nfl: 'DAL', rank: 2 },
                        { id: 'p003', name: 'Bob Qb', pos: 'QB', nfl: 'KC', rank: 3 },
                      ];
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url; a.download = 'evw-draft-template.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
                    }}>Download JSON Template</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
        )
      )}
    </div>
  );
}

