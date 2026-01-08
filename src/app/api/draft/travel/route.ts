import { addDraftTravelEntry, listDraftTravelEntries } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const trip = (searchParams.get('trip') || '').trim() || '2026';
    const items = await listDraftTravelEntries(trip);
    return Response.json(items, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Failed to load travel entries' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const trip = typeof body.trip === 'string' && body.trip.trim() ? body.trip.trim() : '2026';
    const entryType = body.entryType === 'departure' ? 'departure' : 'arrival';
    const person = typeof body.person === 'string' ? body.person.trim() : '';
    if (!person) return Response.json({ error: 'Name is required' }, { status: 400 });
    const team = typeof body.team === 'string' && body.team.trim() ? body.team.trim() : null;
    const airline = typeof body.airline === 'string' && body.airline.trim() ? body.airline.trim() : null;
    const flightNo = typeof body.flightNo === 'string' && body.flightNo.trim() ? body.flightNo.trim() : null;
    const airport = typeof body.airport === 'string' && body.airport.trim() ? body.airport.trim() : null;
    const dtStr = typeof body.dt === 'string' && body.dt.trim() ? body.dt.trim() : '';
    const dt = dtStr ? new Date(dtStr) : null;
    const seats = Number.isFinite(Number(body.seats)) ? Number(body.seats) : null;
    const canPickup = Boolean(body.canPickup);
    const canDropoff = Boolean(body.canDropoff);
    const notes = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null;

    const res = await addDraftTravelEntry({
      trip,
      entryType,
      person,
      team,
      airline,
      flightNo,
      airport,
      dt,
      seats,
      canPickup,
      canDropoff,
      notes,
    });
    if (!res.ok) return Response.json({ error: res.error || 'Failed to save' }, { status: 500 });
    return Response.json({ ok: true, id: res.id }, { status: 201 });
  } catch {
    return Response.json({ error: 'Failed to submit travel entry' }, { status: 500 });
  }
}
