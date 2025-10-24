import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import { readPins } from '@/lib/server/pins';
import { verifyPin, signSession, verifySession, hashPin } from '@/lib/server/auth';
import { logAuthEvent } from '@/lib/server/audit';
import { TEAM_NAMES } from '@/lib/constants/league';
import { writePins } from '@/lib/server/pins';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const teamRaw = typeof body.team === 'string' ? body.team.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!teamRaw || !pin) {
      return Response.json({ error: 'team and pin required' }, { status: 400 });
    }

    let team = TEAM_NAMES.includes(teamRaw) ? teamRaw : resolveCanonicalTeamName({ rosterTeamName: teamRaw });
    if (team === 'Unknown Team') team = teamRaw;

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

    const pins = await readPins();
    let stored = pins[team];

    // Read per-browser override cookie (from change-pin fallback)
    let overrideStored: { hash: string; salt: string; pinVersion: number; updatedAt: string } | null = null;
    try {
      const jarRead = await cookies();
      const overrideTok = jarRead.get('evw_pin_override')?.value || '';
      const claims = overrideTok ? verifySession(overrideTok) : null;
      if (claims && typeof (claims as Record<string, unknown>).pins === 'object') {
        const pinsObj = (claims as { pins?: Record<string, unknown> }).pins || {};
        const o = pinsObj[team] as Record<string, unknown> | undefined;
        if (o && typeof o.hash === 'string' && typeof o.salt === 'string') {
          overrideStored = {
            hash: o.hash as string,
            salt: o.salt as string,
            pinVersion: typeof o.pinVersion === 'number' ? (o.pinVersion as number) : 1,
            updatedAt: typeof o.updatedAt === 'string' ? (o.updatedAt as string) : new Date().toISOString(),
          };
        }
      }
    } catch {}

    if (!stored && overrideStored) {
      stored = overrideStored;
    }

    if (!stored) {
      // Fallback: accept default PINs if storage hasn't been initialized yet
      const defaults = ['111111','222222','333333','444444','555555','666666','777777','888888','999999','101010','121212','131313'];
      const index = TEAM_NAMES.indexOf(team);
      const expected = index >= 0 ? defaults[index % defaults.length] : null;
      if (expected && pin === expected) {
        // Persist immediately
        const { hash, salt } = await hashPin(pin);
        pins[team] = stored = { hash, salt, pinVersion: 1, updatedAt: new Date().toISOString() };
        try { await writePins(pins); } catch {}
      } else {
        await logAuthEvent({ type: 'login_fail', team, ip, ok: false, reason: 'no_pin' });
        return Response.json({ error: 'PIN not set for this team. Ask admin to set it.' }, { status: 400 });
      }

    let ok = await verifyPin(pin, stored.hash, stored.salt);
    if (!ok && overrideStored) {
      ok = await verifyPin(pin, overrideStored.hash, overrideStored.salt);
      if (ok) stored = overrideStored;
    }
    if (!ok) {
      // Rescue path: allow default PIN if it matches expected for this team, then persist
      const defaults = ['111111','222222','333333','444444','555555','666666','777777','888888','999999','101010','121212','131313'];
      const index = TEAM_NAMES.indexOf(team);
      const expected = index >= 0 ? defaults[index % defaults.length] : null;
      if (expected && pin === expected) {
        const { hash, salt } = await hashPin(pin);
        pins[team] = { hash, salt, pinVersion: (stored?.pinVersion ?? 0) + 1, updatedAt: new Date().toISOString() };
        try { await writePins(pins); } catch {}
      } else {
        await logAuthEvent({ type: 'login_fail', team, ip, ok: false, reason: 'bad_pin' });
        return Response.json({ error: 'Invalid PIN' }, { status: 401 });
      }
    }
    }

    const ttlDays = 30;
    const payload = {
      sub: team,
      team,
      pv: stored.pinVersion || 1,
      exp: Date.now() + ttlDays * 24 * 60 * 60 * 1000,
    };
    const token = signSession(payload);

    const jar = await cookies();
    jar.set('evw_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ttlDays * 24 * 60 * 60,
    });

    await logAuthEvent({ type: 'login_success', team, ip, ok: true });

    return new Response(JSON.stringify({ team }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (e) {
    console.error('POST /api/auth/login failed', e);
    return Response.json({ error: 'Login failed' }, { status: 500 });
  }
}
