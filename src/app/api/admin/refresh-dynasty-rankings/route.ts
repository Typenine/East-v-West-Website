import { NextRequest, NextResponse } from 'next/server';
import { getConfiguredAdminSecret, isAdminCookieValue } from '@/lib/auth/admin';
import { putObjectText, getObjectText } from '@/server/storage/r2';
import { cookies } from 'next/headers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DYNASTY_RANKINGS_R2_KEY = 'newsletter/dynasty-rankings.json';

interface StoredDynastyRankings {
  fetchedAt: string;
  source: 'fantasycalc';
  rankings: Array<{ name: string; pos: string; nfl: string; rank: number }>;
}

async function isAdmin(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const adminCookie = cookieStore.get('evw_admin');
  const secret = getConfiguredAdminSecret();
  if (!secret) return false;
  return (
    isAdminCookieValue(adminCookie?.value) ||
    req.headers.get('x-admin-secret') === secret ||
    new URL(req.url).searchParams.get('secret') === secret
  );
}

/** GET — return current stored rankings metadata */
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const raw = await getObjectText({ key: DYNASTY_RANKINGS_R2_KEY });
    if (!raw) return NextResponse.json({ stored: false });
    const data = JSON.parse(raw) as StoredDynastyRankings;
    return NextResponse.json({ stored: true, fetchedAt: data.fetchedAt, count: data.rankings.length });
  } catch {
    return NextResponse.json({ stored: false });
  }
}

/** POST — fetch fresh rankings from FantasyCalc and store in R2 */
export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  try {
    const res = await fetch(
      'https://api.fantasycalc.com/values/current?isDynasty=true&numQbs=2&ppr=0.5',
      { signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) throw new Error(`FantasyCalc returned ${res.status}`);

    const data = await res.json() as Array<{
      player?: { name?: string; position?: string; nflTeamAbbreviation?: string };
    }>;
    if (!Array.isArray(data) || data.length === 0) throw new Error('FantasyCalc returned empty data');

    const rankings: StoredDynastyRankings['rankings'] = data.map((entry, i) => ({
      name: entry.player?.name ?? '',
      pos:  entry.player?.position ?? 'UNK',
      nfl:  entry.player?.nflTeamAbbreviation ?? '',
      rank: i + 1,
    })).filter(r => r.name);

    const payload: StoredDynastyRankings = {
      fetchedAt: new Date().toISOString(),
      source: 'fantasycalc',
      rankings,
    };

    await putObjectText({ key: DYNASTY_RANKINGS_R2_KEY, text: JSON.stringify(payload) });

    return NextResponse.json({ ok: true, count: rankings.length, fetchedAt: payload.fetchedAt });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[refresh-dynasty-rankings]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
