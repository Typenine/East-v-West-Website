import { NextRequest } from 'next/server';
import { validateTaxiForRoster } from '@/lib/server/taxi-validator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const season = url.searchParams.get('season') || '2025';
  const rosterId = Number(url.searchParams.get('rosterId') || '0');
  if (!Number.isFinite(rosterId) || rosterId <= 0) return Response.json({ error: 'invalid_roster' }, { status: 400 });
  try {
    const result = await validateTaxiForRoster(season, rosterId);
    if (!result) return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json(result);
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
