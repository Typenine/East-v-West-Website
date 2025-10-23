import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/server/auth';
import { readPins } from '@/lib/server/pins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TradeBlock = {
  team: string;
  wants?: string;
  offers?: string;
  updatedAt: string;
};

const FOLDER = 'tradeblock/';

function fileForTeam(team: string) {
  return `${FOLDER}${encodeURIComponent(team)}.json`;
}

async function readFromBlob(pathname: string): Promise<TradeBlock | null> {
  const { list } = await import('@vercel/blob');
  const { blobs } = await list({ prefix: FOLDER });
  const found = blobs.find((b) => b.pathname === pathname);
  if (!found) return null;
  try {
    const res = await fetch(found.url);
    if (!res.ok) return null;
    const json = (await res.json()) as TradeBlock;
    return json;
  } catch {
    return null;
  }
}

async function writeToBlob(pathname: string, data: unknown) {
  const { put } = await import('@vercel/blob');
  await put(pathname, JSON.stringify(data, null, 2), {
    access: 'public',
    contentType: 'application/json; charset=utf-8',
  });
}

export async function GET() {
  const jar = await cookies();
  const token = jar.get('evw_session')?.value || '';
  const claims = token ? verifySession(token) : null;
  if (!claims || typeof claims.team !== 'string') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const team = claims.team as string;
  // Enforce pinVersion so sessions are invalid after PIN reset
  try {
    const pins = await readPins();
    const pv = (pins[team]?.pinVersion ?? 0);
    const cpv = typeof (claims as any).pv === 'number' ? (claims as any).pv : 0;
    if (pv > cpv) return Response.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
  } catch {}
  const pathname = fileForTeam(team);
  const data = (await readFromBlob(pathname)) || { team, wants: '', offers: '', updatedAt: new Date().toISOString() };
  return Response.json(data);
}

export async function POST(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get('evw_session')?.value || '';
  const claims = token ? verifySession(token) : null;
  if (!claims || typeof claims.team !== 'string') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const team = claims.team as string;
  // pinVersion enforcement
  try {
    const pins = await readPins();
    const pv = (pins[team]?.pinVersion ?? 0);
    const cpv = typeof (claims as any).pv === 'number' ? (claims as any).pv : 0;
    if (pv > cpv) return Response.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
  } catch {}
  const body = await req.json().catch(() => ({}));
  const wants = typeof body.wants === 'string' ? body.wants : '';
  const offers = typeof body.offers === 'string' ? body.offers : '';
  const data: TradeBlock = { team, wants, offers, updatedAt: new Date().toISOString() };
  await writeToBlob(fileForTeam(team), data);
  return Response.json(data, { status: 200 });
}
