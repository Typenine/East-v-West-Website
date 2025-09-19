import { NextRequest, NextResponse } from 'next/server';
import { trainWPModel, type WPModel } from '@/lib/utils/wp-train';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let MODEL: WPModel | null = null;
let LAST_TS = 0;
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get('train') === '1' || searchParams.get('reload') === '1';
    const now = Date.now();

    if (!MODEL || force || now - LAST_TS > TTL_MS) {
      MODEL = await trainWPModel();
      LAST_TS = now;
    }

    return NextResponse.json({ model: MODEL }, { status: 200 });
  } catch (err) {
    console.error('wp-model GET error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}

export async function POST() {
  try {
    MODEL = await trainWPModel();
    LAST_TS = Date.now();
    return NextResponse.json({ ok: true, model: MODEL }, { status: 200 });
  } catch (err) {
    console.error('wp-model POST error', err);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
