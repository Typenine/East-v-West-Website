import { NextRequest } from 'next/server';
import { readPins, readTeamPin, writeTeamPin, StoredPin } from '@/lib/server/pins';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.AUTH_SECRET;
  if (!secret) return false;
  const header = req.headers.get('x-admin-secret');
  return !!header && header === secret;
}

export async function POST(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const legacy = await readPins();
    const legacyKeys = Object.keys(legacy);
    if (legacyKeys.length === 0) {
      return Response.json({ ok: true, migrated: 0, note: 'No legacy map found' });
    }

    let migrated = 0;
    let skipped = 0;
    for (const team of TEAM_NAMES) {
      const entry = legacy[team] as StoredPin | undefined;
      if (!entry) continue;
      const existing = await readTeamPin(team);
      if (existing && (existing.pinVersion || 0) >= (entry.pinVersion || 0)) {
        skipped++;
        continue;
      }
      const ok = await writeTeamPin(team, entry);
      if (ok) migrated++;
    }

    return Response.json({ ok: true, migrated, skipped });
  } catch (e) {
    console.error('POST /api/admin/pins/migrate-legacy failed', e);
    return Response.json({ error: 'Migration failed' }, { status: 500 });
  }
}
