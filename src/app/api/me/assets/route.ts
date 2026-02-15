import { requireTeamUser } from '@/lib/server/session';
import { getTeamAssets } from '@/lib/server/trade-assets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const ident = await requireTeamUser();
  if (!ident) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const assets = await getTeamAssets(ident.team);
  const years = Array.from(new Set(assets.picks.map((p) => p.year))).sort((a, b) => a - b);
  const year = years.length > 0 ? years[0] : (new Date().getFullYear() + 1);
  return Response.json({ ...assets, year, years });
}
