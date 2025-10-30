import { NextRequest } from 'next/server';
import { TEAM_NAMES } from '@/lib/constants/league';
import { readTeamPin, writeTeamPin } from '@/lib/server/pins';
import { hashPin } from '@/lib/server/auth';

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

    // Deterministic, easy-to-remember defaults
    const defaultPins: string[] = [
      '111111', '222222', '333333', '444444', '555555', '666666',
      '777777', '888888', '999999', '101010', '121212', '131313'
    ];

    const mapping: Record<string, string> = {};
    TEAM_NAMES.forEach((team, idx) => {
      mapping[team] = defaultPins[idx % defaultPins.length];
    });

    for (const team of TEAM_NAMES) {
      const pin = mapping[team];
      const { hash, salt } = await hashPin(pin);
      const prev = await readTeamPin(team);
      const ok = await writeTeamPin(team, {
        hash,
        salt,
        pinVersion: (prev?.pinVersion ?? 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      if (!ok) return Response.json({ error: `Failed to persist PIN for ${team}` }, { status: 500 });
    }

    // Return plaintext mapping so admin can copy/store it
    return Response.json({ ok: true, plaintextPins: mapping }, { status: 200 });
  } catch (e) {
    console.error('POST /api/admin/pins/init-defaults failed', e);
    return Response.json({ error: 'Failed to initialize default PINs' }, { status: 500 });
  }
}
