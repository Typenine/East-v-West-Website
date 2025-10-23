import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { resolveCanonicalTeamName } from '@/lib/utils/team-utils';
import { readPins } from '@/lib/server/pins';
import { verifyPin } from '@/lib/server/auth';
import { signSession } from '@/lib/server/auth';
import { getKV } from '@/lib/server/kv';
import { logAuthEvent } from '@/lib/server/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function makeCookie(name: string, value: string, maxAgeSec: number): string {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
  const expires = new Date(Date.now() + maxAgeSec * 1000).toUTCString();
  return `${name}=${value}; Path=/; ${secure}HttpOnly; SameSite=Lax; Expires=${expires}; Max-Age=${maxAgeSec}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const teamRaw = typeof body.team === 'string' ? body.team.trim() : '';
    const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
    if (!teamRaw || !pin) {
      return Response.json({ error: 'team and pin required' }, { status: 400 });
    }

    const team = resolveCanonicalTeamName({ rosterTeamName: teamRaw });

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
    const kv = await getKV();
    if (kv) {
      const lockKey = `auth:lock:${team}:${ip}`;
      const locked = await kv.get(lockKey);
      if (locked) {
        await logAuthEvent({ type: 'login_lock', team, ip, ok: false, reason: 'locked' });
        return Response.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
      }
    }

    const pins = await readPins();
    const stored = pins[team];
    if (!stored) {
      await logAuthEvent({ type: 'login_fail', team, ip, ok: false, reason: 'no_pin' });
      return Response.json({ error: 'PIN not set for this team. Ask admin to set it.' }, { status: 400 });
    }

    const ok = await verifyPin(pin, stored.hash, stored.salt);
    if (!ok) {
      if (kv) {
        const attemptsKey = `auth:attempts:${team}:${ip}`;
        const lockKey = `auth:lock:${team}:${ip}`;
        const count = await kv.incr(attemptsKey);
        const ttl = await kv.ttl?.(attemptsKey as any);
        if (ttl === -1 || ttl === -2) {
          await kv.expire?.(attemptsKey as any, 600);
        }
        if (count >= 5) {
          await kv.set(lockKey as any, '1');
          await kv.expire?.(lockKey as any, 900);
        }
      }
      await logAuthEvent({ type: 'login_fail', team, ip, ok: false, reason: 'bad_pin' });
      return Response.json({ error: 'Invalid PIN' }, { status: 401 });
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

    if (kv) {
      const attemptsKey = `auth:attempts:${team}:${ip}`;
      const lockKey = `auth:lock:${team}:${ip}`;
      try { await kv.del(attemptsKey); } catch {}
      try { await kv.del(lockKey); } catch {}
    }

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
