'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import CountdownTimer from '@/components/ui/countdown-timer';
import { IMPORTANT_DATES, LEAGUE_IDS } from '@/lib/constants/league';
import EmptyState from '@/components/ui/empty-state';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import { getLeagueDrafts, getDraftPicks, getTeamsData, getAllPlayers, SleeperPlayer } from '@/lib/utils/sleeper-api';
import SectionHeader from '@/components/ui/SectionHeader';
import { Tabs } from '@/components/ui/Tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Label from '@/components/ui/Label';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { getTeamColors, getTeamColorStyle, getTeamLogoPath } from '@/lib/utils/team-utils';
import { HomeIcon, TvIcon, FireIcon, MoonIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import { useRouter, useSearchParams } from 'next/navigation';

// Draft data types
type TeamHaul = {
  team: string;
  picks: { round: number; pick: number; player: string; price?: number }[];
};

type LinearPick = {
  pick_no: number;
  round: number;
  pick: number; // pick within round
  team: string;
  player: string;
  price?: number;
  pos?: string;
};

type DraftYearData = {
  rounds: number;
  picks_per_round: number;
  team_hauls: TeamHaul[];
  // Auction metadata: if true, picks may include price
  isAuction?: boolean;
  linear_picks: LinearPick[];
};

type SleeperDraftSettings = {
  rounds?: number;
};

// Suggestions section will use EmptyState (no mock content)

export default function DraftContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedYear, setSelectedYear] = useState('2025');
  const years = useMemo(() => ['2025', ...Object.keys(LEAGUE_IDS.PREVIOUS)].sort((a, b) => parseInt(b) - parseInt(a)), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftsByYear, setDraftsByYear] = useState<Record<string, DraftYearData | null>>({});
  const playersRef = useRef<Record<string, SleeperPlayer> | null>(null);
  const loadedYearsRef = useRef<Set<string>>(new Set());
  const [draftView, setDraftView] = useState<'teams' | 'linear'>('teams');
  const [isAdmin, setIsAdmin] = useState(false);

  const outerTabParam = searchParams?.get('view') || '';
  const nextTabParam = searchParams?.get('next') || '';
  const activeOuterTab = outerTabParam === 'next' || outerTabParam === '2027' || outerTabParam === 'past' ? outerTabParam : 'next';
  const activeNextTab = nextTabParam === 'airbnb' || nextTabParam === 'travel' || nextTabParam === 'order' ? nextTabParam : 'airbnb';

  const replaceDraftQuery = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams?.toString() || '');
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `/draft?${qs}` : '/draft', { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    fetch('/api/admin-login').then(r => r.json()).then(j => setIsAdmin(Boolean(j?.isAdmin))).catch(() => setIsAdmin(false));
  }, []);

  // Removed local classNames helper – primitives use tokenized styles

  // Download an ICS calendar file for the trip and draft
  const handleAddToCalendar = () => {
    try {
      const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      // Trip window (Thursday 3 PM ET -> Sunday 11 AM ET)
      const tripStart = new Date('2026-07-16T15:00:00-04:00');
      const tripEnd = new Date('2026-07-19T11:00:00-04:00');
      // Draft event (using league constant for start time)
      const draftStart = IMPORTANT_DATES.NEXT_DRAFT;
      const draftEnd = new Date(draftStart.getTime() + 2 * 60 * 60 * 1000); // 2 hours

      const now = new Date();
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//East v. West//Draft Trip//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:evw-trip-2026@eastvwest`,
        `DTSTAMP:${formatICSDate(now)}`,
        `DTSTART:${formatICSDate(tripStart)}`,
        `DTEND:${formatICSDate(tripEnd)}`,
        'SUMMARY:East v. West Draft Trip',
        'LOCATION:Somerset, Pennsylvania, United States',
        'DESCRIPTION:Airbnb: https://www.airbnb.com/rooms/21559127',
        'END:VEVENT',
        'BEGIN:VEVENT',
        `UID:evw-draft-2026@eastvwest`,
        `DTSTAMP:${formatICSDate(now)}`,
        `DTSTART:${formatICSDate(draftStart)}`,
        `DTEND:${formatICSDate(draftEnd)}`,
        'SUMMARY:East v. West Rookie Draft',
        'DESCRIPTION:Draft starts at 1:00 PM ET',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'evw-draft-trip-2026.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to create calendar file', e);
      alert('Could not generate calendar file.');
    }
  };

  function TravelSubtab({ trip }: { trip: string }) {
    const [items, setItems] = useState<Array<{
      id: string; trip: string; entryType: 'arrival' | 'departure'; person: string; team?: string | null; airline?: string | null; flightNo?: string | null; airport?: string | null; dt?: string | null; seats?: number | null; canPickup?: boolean; canDropoff?: boolean; notes?: string | null; createdAt: string;
    }>>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const empty = { person: '', team: '', airline: '', flightNo: '', airport: '', dt: '', seats: '', canPickup: false, canDropoff: false, notes: '' };
    const [arrForm, setArrForm] = useState<typeof empty>({ ...empty });
    const [depForm, setDepForm] = useState<typeof empty>({ ...empty });
    const [submitting, setSubmitting] = useState<'arrival' | 'departure' | null>(null);

    const load = useCallback(async () => {
      try {
        setLoading(true);
        setError(null);
        const r = await fetch(`/api/draft/travel?trip=${encodeURIComponent(trip)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error('Failed to load');
        const j = await r.json();
        setItems(Array.isArray(j) ? j : []);
      } catch {
        setError('Unable to load entries');
      } finally {
        setLoading(false);
      }
    }, [trip]);

    useEffect(() => { load(); }, [load]);

    const submit = async (entryType: 'arrival' | 'departure', formData: typeof empty) => {
      if (!formData.person) return;
      try {
        setSubmitting(entryType);
        const payload = {
          trip,
          entryType,
          person: formData.person,
          team: formData.team || null,
          airline: formData.airline || null,
          flightNo: formData.flightNo || null,
          airport: formData.airport || null,
          dt: formData.dt || null,
          seats: formData.seats ? Number(formData.seats) : null,
          canPickup: !!formData.canPickup,
          canDropoff: !!formData.canDropoff,
          notes: formData.notes || null,
        };
        const r = await fetch('/api/draft/travel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'Failed to submit');
        if (entryType === 'arrival') setArrForm({ ...empty, canPickup: arrForm.canPickup, canDropoff: arrForm.canDropoff });
        else setDepForm({ ...empty, canPickup: depForm.canPickup, canDropoff: depForm.canDropoff });
        await load();
      } catch {
        alert('Failed to submit');
      } finally {
        setSubmitting(null);
      }
    };

    const arrivals = items.filter(i => i.entryType === 'arrival');
    const departures = items.filter(i => i.entryType === 'departure');

    return (
      <div className="space-y-6">
        {loading ? (
          <LoadingState message="Loading entries…" />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="evw-surface">
              <CardHeader>
                <CardTitle>Arrivals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Name</Th>
                        <Th>Team</Th>
                        <Th>Date &amp; Time</Th>
                        <Th>Airline</Th>
                        <Th>Flight #</Th>
                        <Th>Airport</Th>
                        <Th>Seats</Th>
                        <Th>Pickup</Th>
                        <Th>Dropoff</Th>
                        <Th>Notes</Th>
                        <Th></Th>
                      </Tr>
                    </THead>
                    <TBody>
                      <Tr>
                        <Td><Input placeholder="Name" value={arrForm.person} onChange={(e) => setArrForm({ ...arrForm, person: e.target.value })} /></Td>
                        <Td><Input placeholder="Team" value={arrForm.team} onChange={(e) => setArrForm({ ...arrForm, team: e.target.value })} /></Td>
                        <Td><Input type="datetime-local" value={arrForm.dt} onChange={(e) => setArrForm({ ...arrForm, dt: e.target.value })} /></Td>
                        <Td><Input placeholder="Airline" value={arrForm.airline} onChange={(e) => setArrForm({ ...arrForm, airline: e.target.value })} /></Td>
                        <Td><Input placeholder="Flight #" value={arrForm.flightNo} onChange={(e) => setArrForm({ ...arrForm, flightNo: e.target.value })} /></Td>
                        <Td><Input placeholder="Airport" value={arrForm.airport} onChange={(e) => setArrForm({ ...arrForm, airport: e.target.value })} /></Td>
                        <Td><Input type="number" min={0} value={arrForm.seats} onChange={(e) => setArrForm({ ...arrForm, seats: e.target.value })} /></Td>
                        <Td><input type="checkbox" checked={arrForm.canPickup} onChange={(e) => setArrForm({ ...arrForm, canPickup: e.target.checked })} /></Td>
                        <Td><input type="checkbox" checked={arrForm.canDropoff} onChange={(e) => setArrForm({ ...arrForm, canDropoff: e.target.checked })} /></Td>
                        <Td><Textarea rows={1} value={arrForm.notes} onChange={(e) => setArrForm({ ...arrForm, notes: e.target.value })} /></Td>
                        <Td className="whitespace-nowrap"><Button size="sm" disabled={submitting==='arrival' || !arrForm.person} onClick={() => submit('arrival', arrForm)}>{submitting==='arrival' ? 'Adding…' : 'Add'}</Button></Td>
                      </Tr>
                      {arrivals.length === 0 ? (
                        <Tr><Td colSpan={11} className="text-sm text-[var(--muted)]">No arrivals yet</Td></Tr>
                      ) : (
                        arrivals.map((it) => (
                          <Tr key={it.id}>
                            <Td className="font-medium">{it.person}</Td>
                            <Td>{it.team || '—'}</Td>
                            <Td>{it.dt ? new Date(it.dt).toLocaleString() : '—'}</Td>
                            <Td>{it.airline || '—'}</Td>
                            <Td>{it.flightNo || '—'}</Td>
                            <Td>{it.airport || '—'}</Td>
                            <Td>{typeof it.seats === 'number' ? it.seats : '—'}</Td>
                            <Td>{it.canPickup ? 'Yes' : '—'}</Td>
                            <Td>{it.canDropoff ? 'Yes' : '—'}</Td>
                            <Td className="max-w-[220px] truncate" title={it.notes || ''}>{it.notes || '—'}</Td>
                            <Td />
                          </Tr>
                        ))
                      )}
                    </TBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="evw-surface">
              <CardHeader>
                <CardTitle>Departures</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <THead>
                      <Tr>
                        <Th>Name</Th>
                        <Th>Team</Th>
                        <Th>Date &amp; Time</Th>
                        <Th>Airline</Th>
                        <Th>Flight #</Th>
                        <Th>Airport</Th>
                        <Th>Seats</Th>
                        <Th>Pickup</Th>
                        <Th>Dropoff</Th>
                        <Th>Notes</Th>
                        <Th></Th>
                      </Tr>
                    </THead>
                    <TBody>
                      <Tr>
                        <Td><Input placeholder="Name" value={depForm.person} onChange={(e) => setDepForm({ ...depForm, person: e.target.value })} /></Td>
                        <Td><Input placeholder="Team" value={depForm.team} onChange={(e) => setDepForm({ ...depForm, team: e.target.value })} /></Td>
                        <Td><Input type="datetime-local" value={depForm.dt} onChange={(e) => setDepForm({ ...depForm, dt: e.target.value })} /></Td>
                        <Td><Input placeholder="Airline" value={depForm.airline} onChange={(e) => setDepForm({ ...depForm, airline: e.target.value })} /></Td>
                        <Td><Input placeholder="Flight #" value={depForm.flightNo} onChange={(e) => setDepForm({ ...depForm, flightNo: e.target.value })} /></Td>
                        <Td><Input placeholder="Airport" value={depForm.airport} onChange={(e) => setDepForm({ ...depForm, airport: e.target.value })} /></Td>
                        <Td><Input type="number" min={0} value={depForm.seats} onChange={(e) => setDepForm({ ...depForm, seats: e.target.value })} /></Td>
                        <Td><input type="checkbox" checked={depForm.canPickup} onChange={(e) => setDepForm({ ...depForm, canPickup: e.target.checked })} /></Td>
                        <Td><input type="checkbox" checked={depForm.canDropoff} onChange={(e) => setDepForm({ ...depForm, canDropoff: e.target.checked })} /></Td>
                        <Td><Textarea rows={1} value={depForm.notes} onChange={(e) => setDepForm({ ...depForm, notes: e.target.value })} /></Td>
                        <Td className="whitespace-nowrap"><Button size="sm" disabled={submitting==='departure' || !depForm.person} onClick={() => submit('departure', depForm)}>{submitting==='departure' ? 'Adding…' : 'Add'}</Button></Td>
                      </Tr>
                      {departures.length === 0 ? (
                        <Tr><Td colSpan={11} className="text-sm text-[var(--muted)]">No departures yet</Td></Tr>
                      ) : (
                        departures.map((it) => (
                          <Tr key={it.id}>
                            <Td className="font-medium">{it.person}</Td>
                            <Td>{it.team || '—'}</Td>
                            <Td>{it.dt ? new Date(it.dt).toLocaleString() : '—'}</Td>
                            <Td>{it.airline || '—'}</Td>
                            <Td>{it.flightNo || '—'}</Td>
                            <Td>{it.airport || '—'}</Td>
                            <Td>{typeof it.seats === 'number' ? it.seats : '—'}</Td>
                            <Td>{it.canPickup ? 'Yes' : '—'}</Td>
                            <Td>{it.canDropoff ? 'Yes' : '—'}</Td>
                            <Td className="max-w-[220px] truncate" title={it.notes || ''}>{it.notes || '—'}</Td>
                            <Td />
                          </Tr>
                        ))
                      )}
                    </TBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  const handleAddToCalendar2027 = () => {
    try {
      const formatICSDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
      const tripStart = new Date('2027-07-08T15:00:00-04:00');
      const tripEnd = new Date('2027-07-11T11:00:00-04:00');
      const draftStart = new Date('2027-07-10T13:00:00-04:00');
      const draftEnd = new Date(draftStart.getTime() + 2 * 60 * 60 * 1000);
      const now = new Date();
      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//East v. West//Draft Trip//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:evw-trip-2027@eastvwest`,
        `DTSTAMP:${formatICSDate(now)}`,
        `DTSTART:${formatICSDate(tripStart)}`,
        `DTEND:${formatICSDate(tripEnd)}`,
        'SUMMARY:East v. West Draft Trip',
        'LOCATION:Denver, Colorado, United States',
        'DESCRIPTION:Airbnb: https://www.airbnb.com/rooms/1260402684146301716',
        'END:VEVENT',
        'BEGIN:VEVENT',
        `UID:evw-draft-2027@eastvwest`,
        `DTSTAMP:${formatICSDate(now)}`,
        `DTSTART:${formatICSDate(draftStart)}`,
        `DTEND:${formatICSDate(draftEnd)}`,
        'SUMMARY:East v. West Rookie Draft',
        'DESCRIPTION:Draft starts at 1:00 PM ET',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'evw-draft-trip-2027.ics';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to create 2027 calendar file', e);
      alert('Could not generate calendar file.');
    }
  };

  useEffect(() => {
    const leagueId = selectedYear === '2025' 
      ? LEAGUE_IDS.CURRENT 
      : LEAGUE_IDS.PREVIOUS[selectedYear as keyof typeof LEAGUE_IDS.PREVIOUS];

    if (!leagueId) {
      setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
      return;
    }

    if (loadedYearsRef.current.has(selectedYear)) return;
    loadedYearsRef.current.add(selectedYear);

    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError(null);
        const [drafts, teams] = await Promise.all([
          getLeagueDrafts(leagueId),
          getTeamsData(leagueId),
        ]);

        if (!playersRef.current) {
          playersRef.current = await getAllPlayers();
        }

        const draft = drafts[0];
        if (!draft) {
          if (!cancelled) setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
          return;
        }

        const picks = await getDraftPicks(draft.draft_id);
        const rounds = picks.reduce((max, p) => Math.max(max, p.round), 0);
        const picksInRound1 = picks.filter(p => p.round === 1).length || teams.length;

        const byTeam = new Map<number, { round: number; pick: number; player: string; price?: number }[]>();
        const rosterIdToTeam = new Map<number, string>(teams.map(t => [t.rosterId, t.teamName]));
        const linearPicks: LinearPick[] = [];
        for (const p of picks) {
          const arr = byTeam.get(p.roster_id) || [];
          const player = playersRef.current?.[p.player_id];
          const name = player ? `${player.first_name} ${player.last_name}` : 'Unknown Player';
          // Attach price for auction drafts when present on pick
          // Sleeper stores auction bid in metadata.amount (string); fallback to root amount/price
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyPick = p as any;
          const metaAmountRaw = anyPick?.metadata?.amount;
          const metaAmount = typeof metaAmountRaw === 'string' && metaAmountRaw.trim() !== '' ? Number(metaAmountRaw) : undefined;
          const rootAmountRaw = anyPick?.amount ?? anyPick?.price;
          const rootAmount = typeof rootAmountRaw === 'string' ? Number(rootAmountRaw) : (typeof rootAmountRaw === 'number' ? rootAmountRaw : undefined);
          const price = Number.isFinite(metaAmount) ? (metaAmount as number) : (Number.isFinite(rootAmount) ? (rootAmount as number) : undefined);
          arr.push({ round: p.round, pick: p.draft_slot, player: name, price });
          byTeam.set(p.roster_id, arr);

          const teamName = rosterIdToTeam.get(p.roster_id) || 'Unknown Team';
          const overall = (typeof p.pick_no === 'number' && Number.isFinite(p.pick_no))
            ? (p.pick_no as number)
            : ((p.round - 1) * picksInRound1 + p.draft_slot);
          linearPicks.push({ pick_no: overall, round: p.round, pick: p.draft_slot, team: teamName, player: name, price, pos: player?.position });
        }

        const team_hauls: TeamHaul[] = [];
        for (const t of teams) {
          const arr = byTeam.get(t.rosterId) || [];
          team_hauls.push({
            team: t.teamName,
            picks: arr.sort((a, b) => (a.round === b.round ? a.pick - b.pick : a.round - b.round)),
          });
        }

        const data: DraftYearData = {
          rounds: rounds || ((draft.settings as SleeperDraftSettings | null | undefined)?.rounds ?? 0),
          picks_per_round: picksInRound1,
          team_hauls,
          isAuction: (draft.type || '').toLowerCase() === 'auction' || picks.some((pp) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyp = pp as any;
            return anyp?.metadata?.amount != null || anyp?.amount != null || anyp?.price != null;
          }),
          linear_picks: linearPicks.sort((a, b) => a.pick_no - b.pick_no),
        };

        if (!cancelled) setDraftsByYear(prev => ({ ...prev, [selectedYear]: data }));
      } catch (e) {
        console.error('Error loading draft data', e);
        if (!cancelled) {
          setError('Unable to load draft data at this time.');
          setDraftsByYear(prev => ({ ...prev, [selectedYear]: null }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedYear]);

  return (
    <div className="container mx-auto px-4 py-8">
      <SectionHeader title="Draft Central" />
      <div className="mt-6">
        <Tabs
          activeId={activeOuterTab}
          onChange={(id) => {
            if (id === 'next') replaceDraftQuery({ view: 'next', next: activeNextTab || 'airbnb' });
            else replaceDraftQuery({ view: id, next: null });
          }}
          tabs={[
            {
              id: 'next',
              label: 'Next Draft',
              content: (
                <div className="space-y-6">
                  <CountdownTimer
                    targetDate={IMPORTANT_DATES.NEXT_DRAFT}
                    title="Countdown to Draft Day"
                    className="mb-2"
                  />
                  <Tabs
                    activeId={activeNextTab}
                    onChange={(id) => replaceDraftQuery({ view: 'next', next: id })}
                    tabs={[
                      {
                        id: 'airbnb',
                        label: 'Airbnb Info',
                        content: (
                          <div className="space-y-4">
                            <Card>
                              <CardHeader>
                                <CardTitle>Next Draft: July 18, 2026</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="grid gap-4">
                                  <Card className="evw-surface">
                                    <CardHeader>
                                      <CardTitle>Airbnb Information</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="space-y-4">
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Listing</h4>
                                          <p className="font-medium">Not Your Typical Mountain Cabin - Must See Photos</p>
                                          <a
                                            href="https://www.airbnb.com/rooms/21559127?viralityEntryPoint=1&s=76&source_impression_id=p3_1751382164_P3PAwIqHxrQ87fn9"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[var(--accent-strong)] hover:underline"
                                            aria-label="View Airbnb listing in a new tab"
                                          >
                                            View on Airbnb
                                          </a>
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Location</h4>
                                          <p>Somerset, Pennsylvania, United States</p>
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Dates</h4>
                                          <p>July 16-19, 2026 (Thursday-Sunday)</p>
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Notes</h4>
                                          <ul className="list-disc pl-5">
                                            <li>Check-in: 3:00 PM Thursday</li>
                                            <li>Check-out: 11:00 AM Sunday</li>
                                            <li>Draft starts at 1:00 PM ET on Saturday</li>
                                            <li>Linens provided for all beds — please bring your own shower towels.</li>
                                          </ul>
                                        </div>

                                        <div className="mt-2 pt-4 border-t border-[var(--border)]">
                                          <h4 className="font-semibold text-[var(--text)] mb-2">Amenities</h4>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><HomeIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Kitchen</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Space where guests can cook their own meals</li>
                                                <li>Refrigerator</li>
                                                <li>Microwave</li>
                                                <li>Cooking basics (pots and pans, oil, salt and pepper)</li>
                                                <li>Dishes and silverware (bowls, chopsticks, plates, cups, etc.)</li>
                                                <li>Mini fridge</li>
                                                <li>Freezer</li>
                                                <li>Dishwasher</li>
                                                <li>Stove & Oven</li>
                                                <li>Coffee makers (regular + Keurig)</li>
                                                <li>Wine glasses</li>
                                                <li>Toaster</li>
                                                <li>Baking sheet</li>
                                                <li>Blender</li>
                                                <li>Barbecue utensils (grill tools, skewers, etc.)</li>
                                                <li>Dining table</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><TvIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Entertainment</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>98&quot; Hi‑Def TV</li>
                                                <li>Full bar area with mini fridge</li>
                                                <li>Full-size arcade games</li>
                                                <li>Dart board</li>
                                                <li>Bubble hockey game</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><FireIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Outdoor</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Fire pit</li>
                                                <li>Outdoor furniture</li>
                                                <li>Outdoor dining area</li>
                                                <li>BBQ grill</li>
                                                <li>Plenty of parking</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><MoonIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Sleeping Arrangements</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>5 bedrooms total</li>
                                                <li>2 queen beds</li>
                                                <li>1 king bed</li>
                                                <li>2 bunk beds</li>
                                                <li>1 sofa bed</li>
                                                <li>2 single beds</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><HomeIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Comfort & Utilities</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Washer &amp; dryer</li>
                                                <li>Geothermal A/C</li>
                                                <li>Wood fireplace &amp; geothermal heating</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4 md:col-span-2">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><BookOpenIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Loft</h5>
                                              <p className="text-sm">
                                                The upstairs loft area includes a library with many books and a large shuffleboard game.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                        <div>
                                          <Button onClick={handleAddToCalendar} variant="primary">Add to Calendar (.ics)</Button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ),
                      },
                      {
                        id: 'travel',
                        label: 'Flights / Arrivals',
                        content: (
                          <TravelSubtab trip="2026" />
                        ),
                      },
                      {
                        id: 'order',
                        label: 'Draft Order',
                        content: (
                          <DraftOrderView />
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              id: '2027',
              label: '2027 Draft',
              content: (
                <div className="space-y-6">
                  <CountdownTimer
                    targetDate={new Date('2027-07-10T13:00:00-04:00')}
                    title="Countdown to Draft Day"
                    className="mb-2"
                  />
                  <Tabs
                    tabs={[
                      {
                        id: 'airbnb-2027',
                        label: 'Airbnb Info',
                        content: (
                          <div className="space-y-4">
                            <Card>
                              <CardHeader>
                                <CardTitle>2027 Draft: July 10, 2027</CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="grid gap-4">
                                  <Card className="evw-surface">
                                    <CardHeader>
                                      <CardTitle>Airbnb Information</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <div className="space-y-4">
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Listing</h4>
                                          <p className="font-medium">Denver Airbnb</p>
                                          <a
                                            href="https://www.airbnb.com/rooms/1260402684146301716?adults=10&children=0&infants=0&pets=0&wishlist_item_id=11005650071920&check_in=2027-07-08&check_out=2027-07-11&source_impression_id=p3_1765135617_P3pwC3M86B1vG_Xa&previous_page_section_name=1000"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[var(--accent-strong)] hover:underline"
                                            aria-label="View Airbnb listing in a new tab"
                                          >
                                            View on Airbnb
                                          </a>
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Location</h4>
                                          <p>Denver, Colorado, United States</p>
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Dates</h4>
                                          <p>July 8-11, 2027 (Thursday-Sunday)</p>
                                        </div>
                                        <div>
                                          <h4 className="font-semibold text-[var(--text)]">Notes</h4>
                                          <ul className="list-disc pl-5">
                                            <li>Check-in: 3:00 PM Thursday</li>
                                            <li>Check-out: 11:00 AM Sunday</li>
                                            <li>Draft starts at 1:00 PM ET on Saturday</li>
                                          </ul>
                                        </div>

                                        <div className="mt-2 pt-4 border-t border-[var(--border)]">
                                          <h4 className="font-semibold text-[var(--text)] mb-2">Amenities</h4>
                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><HomeIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Kitchen</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Space where guests can cook their own meals</li>
                                                <li>Refrigerator</li>
                                                <li>Microwave</li>
                                                <li>Cooking basics (pots and pans, oil, salt and pepper)</li>
                                                <li>Dishes and silverware (bowls, chopsticks, plates, cups, etc.)</li>
                                                <li>Mini fridge</li>
                                                <li>Freezer</li>
                                                <li>Dishwasher</li>
                                                <li>Stove & Oven</li>
                                                <li>Coffee makers (regular + Keurig)</li>
                                                <li>Wine glasses</li>
                                                <li>Toaster</li>
                                                <li>Baking sheet</li>
                                                <li>Blender</li>
                                                <li>Barbecue utensils (grill tools, skewers, etc.)</li>
                                                <li>Dining table</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><TvIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Entertainment</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Hi‑Def TV</li>
                                                <li>Bar area / mini fridge</li>
                                                <li>Games area</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><FireIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Outdoor</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Fire pit</li>
                                                <li>Outdoor furniture</li>
                                                <li>Outdoor dining area</li>
                                                <li>BBQ grill</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><MoonIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Sleeping Arrangements</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Multiple bedrooms</li>
                                                <li>Varied bed sizes (see listing)</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><HomeIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Comfort & Utilities</h5>
                                              <ul className="list-disc pl-5 space-y-1 text-sm">
                                                <li>Washer &amp; dryer</li>
                                                <li>Air conditioning</li>
                                                <li>Heating</li>
                                              </ul>
                                            </div>
                                            <div className="rounded-lg border border-[var(--border)] p-4 md:col-span-2">
                                              <h5 className="font-semibold mb-2 flex items-center gap-2"><BookOpenIcon className="h-4 w-4 text-[var(--muted)]" aria-hidden="true" />Loft</h5>
                                              <p className="text-sm">
                                                Additional common spaces per listing details.
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                        <div>
                                          <Button onClick={handleAddToCalendar2027} variant="primary">Add to Calendar (.ics)</Button>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        ),
                      },
                      {
                        id: 'travel-2027',
                        label: 'Flights / Arrivals',
                        content: (
                          <TravelSubtab trip="2027" />
                        ),
                      },
                    ]}
                  />
                </div>
              ),
            },
            {
              id: 'past',
              label: 'Previous Drafts',
              content: (
                <Card>
                  <CardContent>
                    <div className="mb-6">
                      <Label htmlFor="year-select" className="mb-1 block">Select Year</Label>
                      <Select
                        id="year-select"
                        value={selectedYear}
                        onChange={(e) => setSelectedYear(e.target.value)}
                      >
                        {years.map((year) => (
                          <option key={year} value={year}>
                            {year === '2023' ? 'Inaugural Draft' : `${year} Draft`}
                          </option>
                        ))}
                      </Select>
                    </div>
                    {loading ? (
                      <LoadingState message="Loading draft data..." />
                    ) : error ? (
                      <ErrorState message={error} />
                    ) : draftsByYear[selectedYear] === undefined ? (
                      <EmptyState title="Select a year" message="Choose a year to view draft results." />
                    ) : draftsByYear[selectedYear] === null ? (
                      <EmptyState title="No draft data" message="No draft data available for the selected year." />
                    ) : (
                      <div className="space-y-8">
                        <div>
                          <h3 className="text-base font-semibold text-[var(--text)] mb-3">Draft Structure</h3>
                          <div className="grid grid-cols-2 gap-4">
                            <Card>
                              <CardContent>
                                <div className="text-sm text-[var(--muted)]">Rounds</div>
                                <div className="text-2xl font-bold text-[var(--text)]">{draftsByYear[selectedYear]?.rounds}</div>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardContent>
                                <div className="text-sm text-[var(--muted)]">Picks Per Round</div>
                                <div className="text-2xl font-bold text-[var(--text)]">{draftsByYear[selectedYear]?.picks_per_round}</div>
                              </CardContent>
                            </Card>
                          </div>
                        </div>
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <h3 className="text-base font-semibold text-[var(--text)]">
                              {draftView === 'teams' ? 'Team Hauls' : 'Linear Picks'}
                            </h3>
                            <div className="inline-flex rounded-md border border-[var(--border)] overflow-hidden">
                              <Button
                                variant={draftView === 'teams' ? 'primary' : 'ghost'}
                                size="sm"
                                className="px-3"
                                onClick={() => setDraftView('teams')}
                              >
                                By Team
                              </Button>
                              <Button
                                variant={draftView === 'linear' ? 'primary' : 'ghost'}
                                size="sm"
                                className="px-3"
                                onClick={() => setDraftView('linear')}
                              >
                                Linear
                              </Button>
                            </div>
                          </div>
                          {draftView === 'teams' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {(draftsByYear[selectedYear]?.team_hauls ?? []).map((teamHaul, index) => {
                                const colors = getTeamColors(teamHaul.team);
                                const headerStyle = getTeamColorStyle(teamHaul.team, 'primary');
                                return (
                                  <Card key={index} className="hover-lift" style={{ borderColor: colors.primary }}>
                                    <CardHeader className="rounded-t-[var(--radius-card)]" style={headerStyle}>
                                      <CardTitle style={{ color: headerStyle.color }}>{teamHaul.team}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      <ul className="space-y-1">
                                        {teamHaul.picks.map((pick, pickIndex) => (
                                          <li key={pickIndex} className="text-sm">
                                            {`Round ${pick.round}, Pick ${pick.pick}: ${pick.player}${selectedYear === '2023' && draftsByYear[selectedYear]?.isAuction && pick.price != null ? ` — $${pick.price}` : ''}`}
                                          </li>
                                        ))}
                                      </ul>
                                    </CardContent>
                                  </Card>
                                );
                              })}
                            </div>
                          ) : (
                            <Card className="overflow-x-auto">
                              <CardContent>
                                {(() => {
                                  const picks = draftsByYear[selectedYear]?.linear_picks ?? [];
                                  const byRound = new Map<number, LinearPick[]>();
                                  for (const p of picks) {
                                    const arr = byRound.get(p.round) || [];
                                    arr.push(p);
                                    byRound.set(p.round, arr);
                                  }
                                  const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
                                  return rounds.map((r) => (
                                    <div key={r} className="mb-6">
                                      <div className="sticky top-0 z-10 bg-[var(--surface)]/80 backdrop-blur-sm text-base font-semibold text-[var(--muted)] -mx-2 px-2 py-1.5 border-b border-[var(--border)]">{`Round ${r}`}</div>
                                      <ul className="space-y-2 mt-2">
                                        {(byRound.get(r) || []).map((p) => {
                                          const colors = getTeamColors(p.team);
                                          const nameStyle = getTeamColorStyle(p.team);
                                          const priceEnabled = selectedYear === '2023' && draftsByYear[selectedYear]?.isAuction && p.price != null;
                                          return (
                                            <li
                                              key={p.pick_no}
                                              className="text-sm rounded-md"
                                              style={{
                                                borderLeft: `4px solid ${colors.secondary}`,
                                                backgroundColor: nameStyle.backgroundColor as string,
                                                color: nameStyle.color as string,
                                              }}
                                            >
                                              <div className="pl-3 py-2 flex items-start justify-between gap-3">
                                                <div className="flex items-start min-w-0">
                                                  <div 
                                                    className="w-12 h-12 rounded-full flex items-center justify-center mr-3 overflow-hidden flex-shrink-0"
                                                    style={nameStyle}
                                                  >
                                                    <Image
                                                      src={getTeamLogoPath(p.team)}
                                                      alt={p.team}
                                                      width={36}
                                                      height={36}
                                                      className="object-contain"
                                                      onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        target.style.display = 'none';
                                                        const parent = target.parentElement;
                                                        if (parent) {
                                                          const fallback = document.createElement('div');
                                                          fallback.className = 'flex items-center justify-center h-full w-full';
                                                          fallback.innerHTML = `<span class=\"text-xs font-bold\">${p.team.charAt(0)}</span>`;
                                                          parent.appendChild(fallback);
                                                        }
                                                      }}
                                                    />
                                                  </div>
                                                  <div className="min-w-0">
                                                    <div className="flex items-center justify-between gap-3">
                                                      <span className="font-medium truncate">{p.team}</span>
                                                      <span className="text-sm whitespace-nowrap opacity-90 font-semibold">{`Pick ${p.pick_no} • Rd ${p.round}, Pk ${p.pick}`}</span>
                                                    </div>
                                                    <div className="text-sm truncate">
                                                      <span className="truncate inline-block max-w-full align-middle">{p.player}</span>
                                                      {p.pos && (
                                                        <span
                                                          className="ml-2 align-middle px-1.5 py-0.5 rounded text-[10px]"
                                                          style={{
                                                            backgroundColor: (nameStyle.color as string) === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)',
                                                            color: nameStyle.color as string,
                                                          }}
                                                        >
                                                          {p.pos}
                                                        </span>
                                                      )}
                                                    </div>
                                                  </div>
                                                </div>
                                                {priceEnabled && (
                                                  <div className="flex-shrink-0">
                                                    <span
                                                      className="inline-block px-2 py-0.5 rounded-full text-xs"
                                                      style={{
                                                        backgroundColor: (nameStyle.color as string) === '#000000' ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.12)',
                                                        color: nameStyle.color as string,
                                                      }}
                                                    >
                                                      {`$${p.price}`}
                                                    </span>
                                                  </div>
                                                )}
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                      <div className="h-px bg-gradient-to-r from-[#be161e] to-[#bf9944] opacity-40 mt-4" />
                                    </div>
                                  ));
                                })()}
                              </CardContent>
                            </Card>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ),
            },
            ...(isAdmin ? [{
              id: 'draft-room',
              label: 'Draft Room',
              content: (
                <Card>
                  <CardHeader>
                    <CardTitle>Live Draft Room</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-[var(--muted)]">
                        Access the live draft room to participate in the draft, view picks in real-time, and manage your queue.
                      </p>
                      <Button onClick={() => window.location.href = '/draft/room'} variant="primary">
                        Enter Draft Room
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ),
            },{
              id: 'setup-draft',
              label: 'Setup Draft',
              content: (
                <Card>
                  <CardHeader>
                    <CardTitle>Draft Setup &amp; Control</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-[var(--muted)]">
                        Commissioner controls for setting up and managing the live draft. Create drafts, upload custom player lists, control the clock, and more.
                      </p>
                      <div className="flex gap-3">
                        <Button onClick={() => window.location.href = '/admin/draft'} variant="primary">
                          Open Draft Control Panel
                        </Button>
                        <Button onClick={() => window.location.href = '/draft/overlay'} variant="ghost">
                          Open Presentation Overlay
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ),
            }] : []),
          ]}
        />
      </div>
    </div>
  );
}

function DraftOrderView() {
  const [data, setData] = useState<{
    season: number;
    rounds: number;
    rosterCount: number;
    generatedAt?: string;
    slotOrder: Array<{ slot: number; rosterId: number; team: string; record: { wins: number; losses: number; ties: number; fpts: number; fptsAgainst: number } }>;
    roundsData: Array<{ round: number; picks: Array<{ slot: number; round: number; originalTeam: string; ownerTeam: string; originalRosterId: number; ownerRosterId: number; history: Array<{ tradeId: string; timestamp: number; fromTeam: string; toTeam: string }> }> }>;
    summary: { factoids: string[]; picksPerTeam: Array<{ team: string; overall: number; firstTwo: number }>; leaders: { mostOverall: { team: string; count: number } | null; mostFirstTwo: { team: string; count: number } | null } };
    transfers: Array<{ round: number; slot: number | null; tradeId: string; timestamp: number; fromTeam: string; toTeam: string; originalTeam: string; ownerTeam: string; summary?: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch('/api/draft/next-order', { cache: 'no-store' });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Failed to load draft order');
        if (!cancelled) setData(j);
      } catch {
        if (!cancelled) setError('Unable to load draft order right now.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <LoadingState message="Loading draft order..." />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <EmptyState title="No data" message="Draft order is not available yet." />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Projected Draft Order • {data.season}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {data.roundsData.map((round) => (
              <div key={round.round} className="evw-surface border border-[var(--border)] rounded-lg overflow-hidden">
                <div className="px-3 py-2 text-sm font-semibold border-b border-[var(--border)]">Round {round.round}</div>
                <ul className="divide-y divide-[var(--border)]">
                  {round.picks.map((p) => {
                    const style = getTeamColorStyle(p.ownerTeam);
                    return (
                      <li key={`${round.round}-${p.slot}`} className="flex items-center gap-3 px-3 py-2" style={{ backgroundColor: (style.backgroundColor as string) + '11' }}>
                        <div className="text-xs font-semibold w-8 shrink-0 text-[var(--muted)]">#{p.slot}</div>
                        <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0" style={style}>
                          <Image src={getTeamLogoPath(p.ownerTeam)} alt={p.ownerTeam} width={24} height={24} className="object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate text-[var(--text)]">{p.ownerTeam}</div>
                          {p.originalTeam && p.originalTeam !== p.ownerTeam && (
                            <div className="text-xs text-[var(--muted)] truncate">from {p.originalTeam}</div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Factoids</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {data.summary.factoids.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pick Transfer History</CardTitle>
        </CardHeader>
        <CardContent>
          {data.transfers.length === 0 ? (
            <div className="text-sm text-[var(--muted)]">No trades involving next year’s picks yet.</div>
          ) : (
            <ul className="space-y-2">
              {data.transfers.map((t, idx) => (
                <li key={idx} className="text-sm evw-surface border border-[var(--border)] rounded-md px-3 py-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">R{t.round}{typeof t.slot === 'number' ? `, S${t.slot}` : ''}</span>
                      <span className="text-[var(--muted)]"> • orig {t.originalTeam}</span>
                    </div>
                    <div className="text-xs text-[var(--muted)]">{new Date(t.timestamp).toLocaleDateString()}</div>
                  </div>
                  <div className="mt-1">
                    <span>{t.fromTeam}</span>
                    <span className="mx-1">→</span>
                    <span>{t.toTeam}</span>
                    <span className="text-[var(--muted)]"> (now {t.ownerTeam})</span>
                    <a href={`/trades/${t.tradeId}`} className="ml-2 text-[var(--accent-strong)] hover:underline" aria-label={`View trade ${t.tradeId}`}>Details</a>
                  </div>
                  {t.summary ? (
                    <div className="mt-1 text-xs text-[var(--muted)]">{t.summary}</div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
