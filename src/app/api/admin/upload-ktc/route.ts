import { NextRequest, NextResponse } from 'next/server';
import { putObjectText } from '@/server/storage/r2';
import { isAdminCookieValue } from '@/lib/auth/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KTC_R2_KEY = 'trade-analyzer/ktc.json';

export async function POST(req: NextRequest) {
  try {
    if (!isAdminCookieValue(req.cookies.get('evw_admin')?.value)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const body = await req.json();
    if (!body || typeof body !== 'object' || !Array.isArray(body.players)) {
      return NextResponse.json({ error: 'Invalid payload: expected { players: [...], updatedAt: string }' }, { status: 400 });
    }

    const payload = JSON.stringify(body);
    await putObjectText({ key: KTC_R2_KEY, text: payload });

    return NextResponse.json({
      ok: true,
      key: KTC_R2_KEY,
      players: body.players.length,
      updatedAt: body.updatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upload-ktc] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
