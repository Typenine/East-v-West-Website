'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import PlayerLink from '@/components/players/PlayerLink';
import PlayerQuickViewModal from '@/components/players/PlayerQuickViewModal';
import { CURRENT_SEASON } from '@/lib/constants/league';
import {
  getReadableTextForColors,
  getTeamColors,
  getTeamLogoPath,
} from '@/lib/utils/team-utils';
import type {
  HallOfFameCandidate,
  HallOfFameEntryPublic,
  HallOfFameFranchise,
  HallOfFameIndexResponse,
} from '@/lib/hall-of-fame/types';

type ViewMode = 'franchise' | 'class';
type AuthState = {
  authenticated: boolean;
  isAdmin: boolean;
  claims?: { team?: string };
};
type EditorState =
  | { mode: 'induct'; franchise: HallOfFameFranchise }
  | { mode: 'edit'; franchise: HallOfFameFranchise; entry: HallOfFameEntryPublic };
type ProfilePreview = { playerId: string; name: string };

function tenure(entry: HallOfFameEntryPublic): string {
  const { firstSeason, lastSeason } = entry.career;
  if (!firstSeason && !lastSeason) return 'League history on file';
  if (firstSeason === lastSeason) return firstSeason || lastSeason || 'League history on file';
  return `${firstSeason ?? '?'}–${lastSeason ?? '?'}`;
}

function candidateTenure(candidate: HallOfFameCandidate): string {
  if (!candidate.firstSeason && !candidate.lastSeason) return 'League history on file';
  if (candidate.firstSeason === candidate.lastSeason) return candidate.firstSeason || candidate.lastSeason || 'League history on file';
  return `${candidate.firstSeason ?? '?'}–${candidate.lastSeason ?? '?'}`;
}

function HallEntryCard({
  entry,
  canEdit,
  canRemove,
  onEdit,
  onRemove,
}: {
  entry: HallOfFameEntryPublic;
  canEdit: boolean;
  canRemove: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const colors = getTeamColors(entry.franchiseName);
  return (
    <article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div
        className="h-1.5"
        style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.secondary})` }}
      />
      <div className="p-4 sm:p-5">
        <div className="flex gap-4">
          <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-[var(--surface-strong)] sm:h-28 sm:w-24">
            {entry.headshotUrl ? (
              <Image
                src={entry.headshotUrl}
                alt={entry.playerName}
                fill
                sizes="96px"
                className="object-cover object-top"
                unoptimized
              />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">
              Class of {entry.inductionYear}
            </div>
            <h3 className="mt-1 truncate text-xl font-black text-[var(--text)]">
              <PlayerLink playerId={entry.playerId}>{entry.playerName}</PlayerLink>
            </h3>
            <div className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {[entry.position, entry.nflTeam].filter(Boolean).join(' · ') || 'Player'}
            </div>
            <div className="mt-2 text-xs font-semibold text-[var(--muted)]">{entry.franchiseName} · {tenure(entry)}</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-[var(--surface-strong)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Total Production</div>
                <div className="mt-0.5 font-black tabular-nums text-[var(--text)]">{entry.career.totalPoints.toFixed(1)}</div>
                <div className="text-[9px] font-semibold text-[var(--muted)]">while rostered</div>
              </div>
              <div className="rounded-lg bg-[var(--surface-strong)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Starts</div>
                <div className="mt-0.5 font-black tabular-nums text-[var(--text)]">{entry.career.starts}</div>
              </div>
              <div className="rounded-lg bg-[var(--surface-strong)] px-2 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">Seasons</div>
                <div className="mt-0.5 font-black tabular-nums text-[var(--text)]">{entry.career.seasons.length}</div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[var(--text)]">{entry.bio}</p>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-3">
          <Link
            href={`/players/${encodeURIComponent(entry.playerId)}`}
            className="text-xs font-bold text-[var(--accent)] hover:underline"
          >
            Full player profile →
          </Link>
          <div className="ml-auto flex gap-2">
            {canEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--surface-strong)]"
              >
                Edit bio
              </button>
            ) : null}
            {canRemove ? (
              <button
                type="button"
                onClick={onRemove}
                className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-500/10"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function HallOfFameClient() {
  const [data, setData] = useState<HallOfFameIndexResponse | null>(null);
  const [auth, setAuth] = useState<AuthState>({ authenticated: false, isAdmin: false });
  const [view, setView] = useState<ViewMode>('franchise');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [candidates, setCandidates] = useState<HallOfFameCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [bio, setBio] = useState('');
  const [inductionYear, setInductionYear] = useState(Number(CURRENT_SEASON));
  const [saving, setSaving] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<ProfilePreview | null>(null);

  const loadIndex = useCallback(async () => {
    const response = await fetch('/api/hall-of-fame', { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load the Team Hall of Fame.');
    const json = (await response.json()) as HallOfFameIndexResponse;
    setData(json);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        await loadIndex();
        try {
          const authResponse = await fetch('/api/auth/me', { cache: 'no-store' });
          const authJson = (await authResponse.json().catch(() => ({}))) as Partial<AuthState>;
          if (!cancelled) {
            setAuth({
              authenticated: Boolean(authJson.authenticated),
              isAdmin: Boolean(authJson.isAdmin),
              claims: authJson.claims,
            });
          }
        } catch {
          if (!cancelled) setAuth({ authenticated: false, isAdmin: false });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the Team Hall of Fame.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [loadIndex]);

  useEffect(() => {
    if (!data || typeof window === 'undefined') return;
    const franchiseId = new URLSearchParams(window.location.search).get('franchise');
    if (!franchiseId) return;
    setView('franchise');
    window.setTimeout(() => {
      document.getElementById(`hof-franchise-${franchiseId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }, [data]);

  const entriesByFranchise = useMemo(() => {
    const map = new Map<string, HallOfFameEntryPublic[]>();
    for (const franchise of data?.franchises ?? []) map.set(franchise.franchiseId, []);
    for (const entry of data?.entries ?? []) {
      const rows = map.get(entry.franchiseId) ?? [];
      rows.push(entry);
      map.set(entry.franchiseId, rows);
    }
    return map;
  }, [data]);

  const classes = useMemo(() => {
    const map = new Map<number, HallOfFameEntryPublic[]>();
    for (const entry of data?.entries ?? []) {
      const rows = map.get(entry.inductionYear) ?? [];
      rows.push(entry);
      map.set(entry.inductionYear, rows);
    }
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0]);
  }, [data]);

  const latestClass = classes[0] ?? null;
  const featured = latestClass?.[1]?.[0] ?? null;

  const canManage = useCallback((franchise: HallOfFameFranchise) => {
    return auth.isAdmin || (auth.authenticated && auth.claims?.team === franchise.franchiseName);
  }, [auth]);

  const openInduct = useCallback(async (franchise: HallOfFameFranchise) => {
    setEditor({ mode: 'induct', franchise });
    setCandidates([]);
    setCandidateSearch('');
    setSelectedCandidateId('');
    setBio('');
    setInductionYear(Number(CURRENT_SEASON));
    setEditorError(null);
    setCandidateLoading(true);
    try {
      const response = await fetch(`/api/hall-of-fame/candidates?franchiseId=${encodeURIComponent(franchise.franchiseId)}`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not load eligible players.');
      setCandidates(Array.isArray(json.candidates) ? json.candidates as HallOfFameCandidate[] : []);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Could not load eligible players.');
    } finally {
      setCandidateLoading(false);
    }
  }, []);

  const openEdit = useCallback((franchise: HallOfFameFranchise, entry: HallOfFameEntryPublic) => {
    setEditor({ mode: 'edit', franchise, entry });
    setCandidates([]);
    setCandidateSearch('');
    setSelectedCandidateId(entry.playerId);
    setBio(entry.bio);
    setInductionYear(entry.inductionYear);
    setEditorError(null);
  }, []);

  const closeEditor = useCallback(() => {
    if (saving) return;
    setEditor(null);
    setEditorError(null);
    setProfilePreview(null);
  }, [saving]);

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((candidate) =>
      `${candidate.playerName} ${candidate.position ?? ''} ${candidate.nflTeam ?? ''}`.toLowerCase().includes(q),
    );
  }, [candidateSearch, candidates]);

  const selectedCandidate = candidates.find((candidate) => candidate.playerId === selectedCandidateId) ?? null;

  const saveEditor = useCallback(async () => {
    if (!editor) return;
    if (editor.mode === 'induct' && !selectedCandidateId) {
      setEditorError('Choose an eligible former player first.');
      return;
    }
    if (bio.trim().length < 20) {
      setEditorError('The Hall of Fame biography must be at least 20 characters.');
      return;
    }

    setSaving(true);
    setEditorError(null);
    try {
      const response = await fetch('/api/hall-of-fame', {
        method: editor.mode === 'induct' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editor.mode === 'induct'
          ? {
              franchiseId: editor.franchise.franchiseId,
              playerId: selectedCandidateId,
              inductionYear,
              bio: bio.trim(),
            }
          : {
              id: editor.entry.id,
              inductionYear,
              bio: bio.trim(),
            }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not save Hall of Fame entry.');
      await loadIndex();
      setEditor(null);
      setProfilePreview(null);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : 'Could not save Hall of Fame entry.');
    } finally {
      setSaving(false);
    }
  }, [bio, editor, inductionYear, loadIndex, selectedCandidateId]);

  const removeEntry = useCallback(async (entry: HallOfFameEntryPublic) => {
    if (!window.confirm(`Remove ${entry.playerName} from the ${entry.franchiseName} Hall of Fame? Only commissioner actions can do this.`)) return;
    try {
      const response = await fetch('/api/hall-of-fame', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, reason: 'Removed by commissioner from Team Hall of Fame page.' }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Could not remove Hall of Fame entry.');
      await loadIndex();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Could not remove Hall of Fame entry.');
    }
  }, [loadIndex]);

  if (loading) {
    return <div className="container mx-auto px-4 py-16 text-center text-[var(--muted)]">Loading Team Hall of Fame…</div>;
  }
  if (error || !data) {
    return <div className="container mx-auto px-4 py-16 text-center text-red-500">{error ?? 'Could not load Team Hall of Fame.'}</div>;
  }

  return (
    <div className="min-h-screen pb-16">
      <header className="border-b border-[var(--border)] bg-[linear-gradient(135deg,var(--surface),var(--surface-strong))]">
        <div className="container mx-auto px-4 py-10 sm:py-14">
          <div className="text-xs font-black uppercase tracking-[0.28em] text-[var(--accent)]">East v. West</div>
          <div className="mt-3 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-4xl font-black tracking-tight text-[var(--text)] sm:text-5xl">Team Hall of Fame</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--muted)]">
                The permanent home for the players who defined each East v. West franchise. Membership is bestowed by the franchise and remains part of league history.
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-3">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Inductees</div>
                <div className="mt-1 text-3xl font-black text-[var(--text)]">{data.entries.length}</div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">Latest Class</div>
                <div className="mt-1 text-3xl font-black text-[var(--text)]">{latestClass?.[0] ?? '—'}</div>
              </div>
            </div>
          </div>

          {featured ? (() => {
            const colors = getTeamColors(featured.franchiseName);
            const textColor = getReadableTextForColors([colors.primary, colors.secondary]);
            return (
              <div
                className="mt-8 overflow-hidden rounded-2xl border border-white/10 p-5 shadow-lg sm:p-6"
                style={{ background: `linear-gradient(120deg, ${colors.primary}, ${colors.secondary})`, color: textColor }}
              >
                <div className="flex items-center gap-4">
                  <div className="relative h-16 w-16 shrink-0 rounded-full bg-black/15 p-2">
                    <Image src={getTeamLogoPath(featured.franchiseName)} alt="" fill sizes="64px" className="object-contain p-2" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-75">Latest Class · {featured.inductionYear}</div>
                    <div className="mt-1 text-2xl font-black">{featured.playerName}</div>
                    <div className="mt-1 text-sm font-semibold opacity-80">{featured.franchiseName}</div>
                  </div>
                </div>
              </div>
            );
          })() : (
            <div className="mt-8 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-sm text-[var(--muted)]">
              No one has been inducted yet. The first class will appear here.
            </div>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setView('franchise')}
            className={`rounded-xl px-4 py-2 text-sm font-black ${view === 'franchise' ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'}`}
          >
            By Franchise
          </button>
          <button
            type="button"
            onClick={() => setView('class')}
            className={`rounded-xl px-4 py-2 text-sm font-black ${view === 'class' ? 'bg-[var(--accent)] text-white' : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'}`}
          >
            By Class
          </button>
        </div>

        {view === 'franchise' ? (
          <div className="grid gap-6 xl:grid-cols-2">
            {data.franchises.map((franchise) => {
              const entries = entriesByFranchise.get(franchise.franchiseId) ?? [];
              const colors = getTeamColors(franchise.franchiseName);
              const headerText = getReadableTextForColors([colors.primary, colors.secondary]);
              const latest = entries.length ? Math.max(...entries.map((entry) => entry.inductionYear)) : null;
              const manageable = canManage(franchise);
              return (
                <section
                  key={franchise.franchiseId}
                  id={`hof-franchise-${franchise.franchiseId}`}
                  className="scroll-mt-24 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm"
                >
                  <div
                    className="flex items-center gap-4 px-5 py-4"
                    style={{ background: `linear-gradient(110deg, ${colors.primary}, ${colors.secondary})`, color: headerText }}
                  >
                    <div className="relative h-14 w-14 shrink-0 rounded-full bg-black/15">
                      <Image src={getTeamLogoPath(franchise.franchiseName)} alt="" fill sizes="56px" className="object-contain p-2" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-black">{franchise.franchiseName}</h2>
                      <div className="mt-1 text-xs font-semibold opacity-80">
                        {entries.length} Hall of Famer{entries.length === 1 ? '' : 's'}{latest ? ` · Latest class ${latest}` : ''}
                      </div>
                    </div>
                    {manageable ? (
                      <button
                        type="button"
                        onClick={() => void openInduct(franchise)}
                        className="ml-auto shrink-0 rounded-lg bg-black/20 px-3 py-2 text-xs font-black backdrop-blur hover:bg-black/30"
                      >
                        + Induct Player
                      </button>
                    ) : null}
                  </div>
                  <div className="p-4 sm:p-5">
                    {entries.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center">
                        <div className="text-sm font-bold text-[var(--text)]">No inductees yet</div>
                        <div className="mt-1 text-xs text-[var(--muted)]">This franchise&apos;s Hall is waiting for its first class.</div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {entries.map((entry) => (
                          <HallEntryCard
                            key={entry.id}
                            entry={entry}
                            canEdit={manageable}
                            canRemove={auth.isAdmin}
                            onEdit={() => openEdit(franchise, entry)}
                            onRemove={() => void removeEntry(entry)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="space-y-10">
            {classes.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-10 text-center text-[var(--muted)]">
                No induction classes yet.
              </div>
            ) : classes.map(([year, entries]) => (
              <section key={year}>
                <div className="mb-4 flex items-end gap-4 border-b border-[var(--border)] pb-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[var(--accent)]">Induction Class</div>
                    <h2 className="text-3xl font-black text-[var(--text)]">Class of {year}</h2>
                  </div>
                  <div className="mb-1 text-sm font-semibold text-[var(--muted)]">{entries.length} inductee{entries.length === 1 ? '' : 's'}</div>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                  {entries.map((entry) => {
                    const franchise = data.franchises.find((row) => row.franchiseId === entry.franchiseId) ?? {
                      franchiseId: entry.franchiseId,
                      franchiseName: entry.franchiseName,
                    };
                    return (
                      <HallEntryCard
                        key={entry.id}
                        entry={entry}
                        canEdit={canManage(franchise)}
                        canRemove={auth.isAdmin}
                        onEdit={() => openEdit(franchise, entry)}
                        onRemove={() => void removeEntry(entry)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {editor ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl sm:rounded-2xl">
            <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-5 py-4">
              <div className="relative h-10 w-10 shrink-0">
                <Image src={getTeamLogoPath(editor.franchise.franchiseName)} alt="" fill sizes="40px" className="object-contain" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--muted)]">{editor.mode === 'induct' ? 'New induction' : 'Edit Hall entry'}</div>
                <div className="truncate font-black text-[var(--text)]">{editor.franchise.franchiseName}</div>
              </div>
              <button type="button" onClick={closeEditor} className="ml-auto rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm font-bold text-[var(--text)]">Close</button>
            </div>

            <div className="space-y-5 p-5">
              {editor.mode === 'induct' ? (
                <section>
                  <label className="text-xs font-black uppercase tracking-wider text-[var(--muted)]" htmlFor="hof-player-search">Eligible former players</label>
                  <input
                    id="hof-player-search"
                    value={candidateSearch}
                    onChange={(event) => setCandidateSearch(event.target.value)}
                    placeholder="Search player, position, or NFL team"
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2.5 text-sm text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
                    {candidateLoading ? <div className="p-4 text-sm text-[var(--muted)]">Loading franchise history…</div> : null}
                    {!candidateLoading && filteredCandidates.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)]">No eligible former players match this search.</div>
                    ) : null}
                    {filteredCandidates.map((candidate) => {
                      const selected = candidate.playerId === selectedCandidateId;
                      return (
                        <button
                          key={candidate.playerId}
                          type="button"
                          onClick={() => setSelectedCandidateId(candidate.playerId)}
                          className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${selected ? 'border-[var(--accent)] bg-accent-soft' : 'border-[var(--border)] bg-[var(--surface-strong)]'}`}
                        >
                          <div className="relative h-12 w-10 shrink-0 overflow-hidden rounded-lg bg-black/10">
                            {candidate.headshotUrl ? <Image src={candidate.headshotUrl} alt="" fill sizes="40px" className="object-cover object-top" unoptimized /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-black text-[var(--text)]">{candidate.playerName}</div>
                            <div className="mt-0.5 text-xs text-[var(--muted)]">{[candidate.position, candidate.nflTeam].filter(Boolean).join(' · ') || 'Player'} · {candidateTenure(candidate)}</div>
                          </div>
                          <div className="max-w-[150px] text-right text-xs text-[var(--muted)] sm:max-w-[220px]">
                            <div className="font-black leading-4 text-[var(--text)]">{candidate.totalPoints.toFixed(1)} total production while rostered</div>
                            <div className="mt-1">{candidate.starts} start{candidate.starts === 1 ? '' : 's'}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ) : (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4">
                  <div className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">Hall of Famer</div>
                  <div className="mt-1 text-xl font-black text-[var(--text)]">{editor.entry.playerName}</div>
                </div>
              )}

              {editor.mode === 'induct' && selectedCandidate ? (
                <div className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-4 text-sm text-[var(--text)] sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-black">Selected:</span> {selectedCandidate.playerName} · {candidateTenure(selectedCandidate)} · {selectedCandidate.totalPoints.toFixed(1)} total production while rostered · {selectedCandidate.starts} start{selectedCandidate.starts === 1 ? '' : 's'}
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfilePreview({ playerId: selectedCandidate.playerId, name: selectedCandidate.playerName })}
                    className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs font-black text-[var(--text)] hover:bg-[var(--surface-strong)]"
                  >
                    View player profile
                  </button>
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
                <div>
                  <label htmlFor="hof-year" className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">Induction class</label>
                  <input
                    id="hof-year"
                    type="number"
                    min={2000}
                    max={2100}
                    value={inductionYear}
                    onChange={(event) => setInductionYear(Number(event.target.value))}
                    className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2.5 text-sm font-bold text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <div>
                  <label htmlFor="hof-bio" className="text-xs font-black uppercase tracking-wider text-[var(--muted)]">Hall of Fame biography</label>
                  <textarea
                    id="hof-bio"
                    rows={7}
                    maxLength={2000}
                    value={bio}
                    onChange={(event) => setBio(event.target.value)}
                    placeholder="Explain why this player matters to the franchise's history."
                    className="mt-2 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-3 text-sm leading-6 text-[var(--text)] outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                  <div className="mt-1 text-right text-[10px] text-[var(--muted)]">{bio.length}/2000</div>
                </div>
              </div>

              {editorError ? <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm font-semibold text-red-500">{editorError}</div> : null}

              <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-4">
                <button type="button" onClick={closeEditor} disabled={saving} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold text-[var(--text)]">Cancel</button>
                <button
                  type="button"
                  onClick={() => void saveEditor()}
                  disabled={saving || (editor.mode === 'induct' && !selectedCandidateId)}
                  className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editor.mode === 'induct' ? 'Induct into Hall of Fame' : 'Save Hall entry'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {profilePreview ? (
        <div className="relative z-[100]">
          <PlayerQuickViewModal
            open
            onClose={() => setProfilePreview(null)}
            playerId={profilePreview.playerId}
            name={profilePreview.name}
          />
        </div>
      ) : null}
    </div>
  );
}
