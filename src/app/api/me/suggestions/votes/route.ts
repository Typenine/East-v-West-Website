import { requireTeamUser } from '@/lib/server/session';
import { readUserDoc } from '@/lib/server/user-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ votes: {} });
  const doc = await readUserDoc(ident.userId, ident.team);
  const v = (doc?.votes?.suggestions || {}) as Record<string, number>;
  return Response.json({ votes: v });
}
