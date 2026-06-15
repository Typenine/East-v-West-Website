import { type NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { presignGet } from '@/server/storage/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isAdmin(req: NextRequest): boolean {
  try { return isAdminCookieValue(req.cookies.get('evw_admin')?.value); } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await params;
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const key = req.nextUrl.searchParams.get('key');
  if (!key || !key.startsWith('polls/')) {
    return Response.json({ error: 'Invalid key.' }, { status: 400 });
  }

  try {
    const url = await presignGet({ key, expiresSec: 600 });
    return Response.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 500 });
  }
}
