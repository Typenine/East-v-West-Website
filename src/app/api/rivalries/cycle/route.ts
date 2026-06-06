import { getLatestCycle } from '@/server/db/rivalry-queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const cycle = await getLatestCycle();
  return Response.json({ cycle: cycle ?? null });
}
