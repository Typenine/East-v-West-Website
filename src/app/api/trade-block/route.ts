import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession } from '@/lib/server/auth';
import { readPins } from '@/lib/server/pins';
import { getObjectText, putObjectText } from '@/server/storage/r2';

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

async function readFromStorage(pathname: string): Promise<TradeBlock | null> {
  const txt = await getObjectText({ key: pathname });
  if (!txt) return null;
  try { return JSON.parse(txt) as TradeBlock; } catch { return null; }
}

async function writeToStorage(pathname: string, data: unknown) {
  await putObjectText({ key: pathname, text: JSON.stringify(data, null, 2) });
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
    const v = (claims as { pv?: unknown }).pv;
    const cpv = typeof v === 'number' ? v : 0;
    if (pv > cpv) return Response.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
  } catch {}
  const pathname = fileForTeam(team);
  const data = (await readFromStorage(pathname)) || { team, wants: '', offers: '', updatedAt: new Date().toISOString() };
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
    const v2 = (claims as { pv?: unknown }).pv;
    const cpv = typeof v2 === 'number' ? v2 : 0;
    if (pv > cpv) return Response.json({ error: 'Session expired. Please log in again.' }, { status: 401 });
  } catch {}
  const body = await req.json().catch(() => ({}));
  const wants = typeof body.wants === 'string' ? body.wants : '';
  const offers = typeof body.offers === 'string' ? body.offers : '';
  const data: TradeBlock = { team, wants, offers, updatedAt: new Date().toISOString() };
  await writeToStorage(fileForTeam(team), data);
  return Response.json(data, { status: 200 });
}
