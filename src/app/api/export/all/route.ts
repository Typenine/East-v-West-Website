import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const base = `${url.protocol}//${url.host}`;

    const endpoints: Record<string, string> = {
      rosters: '/api/export/rosters',
      rules: '/api/export/rules',
      drafts: '/api/export/drafts',
      history: '/api/export/history',
      trades: '/api/export/trades',
    };

    const entries = Object.entries(endpoints);

    const settled = await Promise.allSettled(
      entries.map(async ([key, path]) => {
        try {
          const res = await fetch(`${base}${path}`, { cache: 'no-store' });
          if (!res.ok) {
            const raw = await res.text().catch(() => '');
            const msg = `HTTP ${res.status} from ${path}${raw ? `: ${raw.slice(0, 300)}` : ''}`;
            return { key, data: null as unknown, error: msg };
          }
          const json = await res.json().catch(() => null as unknown);
          if (json === null) {
            return { key, data: null as unknown, error: `Failed to parse JSON from ${path}` };
          }
          return { key, data: json as unknown, error: null as string | null };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { key, data: null as unknown, error: `Request to ${path} failed: ${msg}` };
        }
      }),
    );

    const payload: Record<string, unknown> = {};
    const errors: Record<string, string> = {};

    settled.forEach((result, idx) => {
      const [key] = entries[idx];
      if (result.status === 'fulfilled') {
        const { data, error } = result.value;
        payload[key] = data;
        if (error) errors[key] = error;
      } else {
        payload[key] = null;
        errors[key] = result.reason instanceof Error ? result.reason.message : String(result.reason);
      }
    });

    const body = {
      meta: {
        type: 'full-league-export',
        version: 1,
        generatedAt: new Date().toISOString(),
      },
      ...payload,
      errors: Object.keys(errors).length ? errors : undefined,
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="evw-league-export-all.json"',
      },
    });
  } catch (err) {
    console.error('export/all GET error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
