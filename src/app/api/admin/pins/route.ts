import { NextRequest } from 'next/server';
import { listAllTeamPins, writeTeamPin, readTeamPin, StoredPin } from '@/lib/server/pins';
import { hashPin } from '@/lib/server/auth';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function requireAdmin(req: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET || process.env.AUTH_SECRET;
  if (!secret) return false;
  const header = req.headers.get('x-admin-secret');
  if (header && header === secret) return true;
  return false;
}

export async function GET() {
  const pins = await listAllTeamPins();
  const teams = TEAM_NAMES.map((team) => {
    const entry = pins[team] as StoredPin | undefined;
    return {
      team,
      hasPin: !!entry,
      updatedAt: entry?.updatedAt || null,
      pinVersion: entry?.pinVersion ?? null,
    };
  });
  return Response.json({ teams });
}

export async function POST(req: NextRequest) {
  try {
    if (!requireAdmin(req)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const team = typeof body.team === 'string' ? body.team.trim() : '';
    const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : '';

    if (!team || !newPin) {
      return Response.json({ error: 'team and newPin required' }, { status: 400 });
    }

    if (!TEAM_NAMES.includes(team)) {
      return Response.json({ error: 'Unknown team' }, { status: 400 });
    }

    const { hash, salt } = await hashPin(newPin);
    const prev = await readTeamPin(team);
    const record: StoredPin = {
      hash,
      salt,
      pinVersion: (prev?.pinVersion ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    const ok = await writeTeamPin(team, record);
    if (!ok) return Response.json({ error: 'Failed to persist PIN' }, { status: 500 });

    return Response.json({ ok: true });
  } catch (e) {
    console.error('POST /api/admin/pins failed', e);
    return Response.json({ error: 'Failed to set PIN' }, { status: 500 });
  }
}
