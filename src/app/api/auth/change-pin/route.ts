import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, verifyPin, hashPin, signSession } from '@/lib/server/auth';
import { readPins, writePins } from '@/lib/server/pins';
import { logAuthEvent } from '@/lib/server/audit';
import { TEAM_NAMES } from '@/lib/constants/league';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const jar = await cookies();
    const token = jar.get('evw_session')?.value || '';
    const claims = token ? verifySession(token) : null;
    if (!claims || typeof claims.team !== 'string') {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const team = claims.team as string;

    const body = await req.json().catch(() => ({}));
    const currentPin = typeof body.currentPin === 'string' ? body.currentPin.trim() : '';
    const newPin = typeof body.newPin === 'string' ? body.newPin.trim() : '';

    if (!/^[0-9]{4,12}$/.test(newPin)) {
      return Response.json({ error: 'PIN must be 4-12 digits' }, { status: 400 });
    }
    if (!/^[0-9]{1,12}$/.test(currentPin)) {
      return Response.json({ error: 'Current PIN required' }, { status: 400 });
    }

    const pins = await readPins();
    const stored = pins[team];

    // If no stored pin yet, allow change only if currentPin equals default expected for team
    if (!stored) {
      const defaults = ['111111','222222','333333','444444','555555','666666','777777','888888','999999','101010','121212','131313'];
      const index = TEAM_NAMES.indexOf(team);
      const expected = index >= 0 ? defaults[index % defaults.length] : null;
      if (!(expected && currentPin === expected)) {
        return Response.json({ error: 'Current PIN is incorrect' }, { status: 401 });
      }
    } else {
      const ok = await verifyPin(currentPin, stored.hash, stored.salt);
      if (!ok) return Response.json({ error: 'Current PIN is incorrect' }, { status: 401 });
    }

    const { hash, salt } = await hashPin(newPin);
    const pv = (pins[team]?.pinVersion || 0) + 1;
    pins[team] = {
      hash,
      salt,
      pinVersion: pv,
      updatedAt: new Date().toISOString(),
    };
    try {
      await writePins(pins);
    } catch {}

    // Always set a per-browser override so new PIN is immediately enforced locally
    const overrideToken = signSession({
      pins: { [team]: { hash, salt, pinVersion: pv, updatedAt: new Date().toISOString() } },
      exp: Date.now() + 365 * 24 * 60 * 60 * 1000,
      kind: 'pin_override'
    });
    jar.set('evw_pin_override', overrideToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });

    await logAuthEvent({ type: 'login_success', team, ip: 'n/a', ok: true, reason: 'pin_changed' });

    // Suggest re-login by clearing the session cookie
    jar.set('evw_session', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    });

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Failed to change PIN' }, { status: 500 });
  }
}
