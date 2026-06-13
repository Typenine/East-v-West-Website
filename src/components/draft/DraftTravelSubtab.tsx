'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import LoadingState from '@/components/ui/loading-state';
import ErrorState from '@/components/ui/error-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/Table';
import type { DraftTravelPerson, DraftTravelSheetPayload, DraftTravelTripInfo } from '@/lib/draft/fetch-draft-travel-sheet';

type DbTravelItem = {
  id: string;
  trip: string;
  entryType: 'arrival' | 'departure';
  person: string;
  team?: string | null;
  airline?: string | null;
  flightNo?: string | null;
  airport?: string | null;
  dt?: string | null;
  seats?: number | null;
  canPickup?: boolean;
  canDropoff?: boolean;
  notes?: string | null;
  createdAt: string;
};

function cell(value: string | undefined | null) {
  const v = (value ?? '').trim();
  return v || '—';
}

function BoolBadge({ value, yes = 'Yes', no = 'No' }: { value: boolean; yes?: string; no?: string }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${value ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-[var(--muted)]'}`}
    >
      {value ? yes : no}
    </span>
  );
}

function SheetTripSummary({ tripInfo, sheetUrl }: { tripInfo: DraftTravelTripInfo; sheetUrl: string }) {
  return (
    <Card className="evw-surface">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Trip details</CardTitle>
          <p className="mt-1 text-sm text-[var(--muted)]">Synced from the league Google Sheet</p>
        </div>
        <Link
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary text-sm px-3 py-1.5 shrink-0"
        >
          Edit in Google Sheet
        </Link>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-[var(--muted)]">Airbnb address</dt>
            <dd className="font-medium">{cell(tripInfo.airbnbAddress)}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Check-in</dt>
            <dd className="font-medium">{cell(tripInfo.checkIn)}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Check-out</dt>
            <dd className="font-medium">{cell(tripInfo.checkOut)}</dd>
          </div>
          <div>
            <dt className="text-[var(--muted)]">Draft time</dt>
            <dd className="font-medium">{cell(tripInfo.draftTime)}</dd>
          </div>
          {tripInfo.note ? (
            <div className="sm:col-span-2">
              <dt className="text-[var(--muted)]">Note</dt>
              <dd className="font-medium">{tripInfo.note}</dd>
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

function SheetPeopleTable({ people }: { people: DraftTravelPerson[] }) {
  const sorted = [...people].sort((a, b) => {
    if (a.attending !== b.attending) return a.attending ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Card className="evw-surface">
      <CardHeader>
        <CardTitle>Arrivals &amp; departures</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Attending</Th>
                <Th>Driving</Th>
                <Th>Arrival</Th>
                <Th>Arr. airport</Th>
                <Th>Departure</Th>
                <Th>Dep. airport</Th>
                <Th>Pickup/dropoff</Th>
                <Th>Car</Th>
                <Th>Pick up</Th>
                <Th>Pick up time</Th>
                <Th>Early stay</Th>
                <Th>Drop off</Th>
              </Tr>
            </THead>
            <TBody>
              {sorted.length === 0 ? (
                <Tr>
                  <Td colSpan={13} className="text-sm text-[var(--muted)]">
                    No entries in the sheet yet.
                  </Td>
                </Tr>
              ) : (
                sorted.map((person) => (
                  <Tr
                    key={person.name}
                    className={person.attending ? undefined : 'opacity-60'}
                  >
                    <Td className="font-medium whitespace-nowrap">{person.name}</Td>
                    <Td><BoolBadge value={person.attending} /></Td>
                    <Td><BoolBadge value={person.driving} /></Td>
                    <Td className="whitespace-nowrap">{cell(person.arrivalTime)}</Td>
                    <Td>{cell(person.arrivalAirport)}</Td>
                    <Td className="whitespace-nowrap">{cell(person.departure)}</Td>
                    <Td>{cell(person.departureAirport)}</Td>
                    <Td><BoolBadge value={person.availableForPickupDropoff} yes="Available" no="—" /></Td>
                    <Td>{cell(person.carCapacity)}</Td>
                    <Td>{cell(person.pickUp)}</Td>
                    <Td className="whitespace-nowrap">{cell(person.pickUpTime)}</Td>
                    <Td>{cell(person.earlyStayLocation)}</Td>
                    <Td>{cell(person.dropOff)}</Td>
                  </Tr>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function DatabaseTravelSubtab({ trip }: { trip: string }) {
  const [items, setItems] = useState<DbTravelItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = { person: '', team: '', airline: '', flightNo: '', airport: '', dt: '', seats: '', canPickup: false, canDropoff: false, notes: '' };
  const [arrForm, setArrForm] = useState({ ...empty });
  const [depForm, setDepForm] = useState({ ...empty });
  const [submitting, setSubmitting] = useState<'arrival' | 'departure' | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`/api/draft/travel?trip=${encodeURIComponent(trip)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('Failed to load');
      const j = await r.json();
      setItems(Array.isArray(j.items) ? j.items : []);
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

  const arrivals = items.filter((i) => i.entryType === 'arrival');
  const departures = items.filter((i) => i.entryType === 'departure');

  if (loading) return <LoadingState message="Loading entries…" />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="evw-surface">
        <CardHeader><CardTitle>Arrivals</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th><Th>Team</Th><Th>Date &amp; Time</Th><Th>Airline</Th><Th>Flight #</Th><Th>Airport</Th><Th>Seats</Th><Th>Pickup</Th><Th>Dropoff</Th><Th>Notes</Th><Th></Th>
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
                  <Td className="whitespace-nowrap"><Button size="sm" disabled={submitting === 'arrival' || !arrForm.person} onClick={() => submit('arrival', arrForm)}>{submitting === 'arrival' ? 'Adding…' : 'Add'}</Button></Td>
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
        <CardHeader><CardTitle>Departures</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Name</Th><Th>Team</Th><Th>Date &amp; Time</Th><Th>Airline</Th><Th>Flight #</Th><Th>Airport</Th><Th>Seats</Th><Th>Pickup</Th><Th>Dropoff</Th><Th>Notes</Th><Th></Th>
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
                  <Td className="whitespace-nowrap"><Button size="sm" disabled={submitting === 'departure' || !depForm.person} onClick={() => submit('departure', depForm)}>{submitting === 'departure' ? 'Adding…' : 'Add'}</Button></Td>
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
  );
}

export default function DraftTravelSubtab({ trip }: { trip: string }) {
  const [sheetData, setSheetData] = useState<DraftTravelSheetPayload | null>(null);
  const [usesSheet, setUsesSheet] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch(`/api/draft/travel?trip=${encodeURIComponent(trip)}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'Failed to load');
      if (j.source === 'sheet') {
        setUsesSheet(true);
        setSheetData(j as DraftTravelSheetPayload);
      } else {
        setUsesSheet(false);
        setSheetData(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load travel info');
    } finally {
      setLoading(false);
    }
  }, [trip]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState message="Loading travel info…" />;
  if (error) return <ErrorState message={error} />;
  if (usesSheet === false) return <DatabaseTravelSubtab trip={trip} />;
  if (!sheetData) return <ErrorState message="No travel data available" />;

  return (
    <div className="space-y-6">
      <SheetTripSummary tripInfo={sheetData.tripInfo} sheetUrl={sheetData.sheetUrl} />
      <SheetPeopleTable people={sheetData.people} />
      <p className="text-xs text-[var(--muted)]">
        Updates appear here within about a minute after you edit the{' '}
        <Link href={sheetData.sheetUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--accent-strong)] hover:underline">
          Google Sheet
        </Link>.
      </p>
    </div>
  );
}
