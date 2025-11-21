import { NextRequest, NextResponse } from 'next/server';
import { GET as getRosters } from '@/app/api/export/rosters/route';
import { GET as getRules } from '@/app/api/export/rules/route';
import { GET as getDrafts } from '@/app/api/export/drafts/route';
import { GET as getHistory } from '@/app/api/export/history/route';
import { GET as getTrades } from '@/app/api/export/trades/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    // Map logical keys to their route handlers. Calling these directly bypasses
    // any HTTP-layer auth/middleware and runs entirely on the server.
    const handlers: Record<string, () => Promise<Response>> = {
      rosters: () => getRosters(),
      rules: () => getRules(),
      drafts: () => getDrafts(),
      history: () => getHistory(),
      trades: () => getTrades(),
    };

    const entries = Object.entries(handlers);

    const settled = await Promise.allSettled(
      entries.map(async ([key, fn]) => {
        try {
          const res = await fn();
          const json = await res
            .json()
            .catch(() => null as unknown);
          if (json === null) {
            return {
              key,
              data: null as unknown,
              error: `Failed to parse JSON from ${key} export handler`,
            };
          }
          return { key, data: json as unknown, error: null as string | null };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return {
            key,
            data: null as unknown,
            error: `Export handler for ${key} failed: ${msg}`,
          };
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
        errors[key] =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
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
        'Content-Disposition':
          'attachment; filename="evw-league-export-all.json"',
      },
    });
  } catch (err) {
    console.error('export/all GET error', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
