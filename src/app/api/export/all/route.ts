import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const base = `${url.protocol}//${url.host}`;

    const [rostersRes, rulesRes, draftsRes, historyRes, tradesRes] = await Promise.all([
      fetch(`${base}/api/export/rosters`, { cache: 'no-store' }),
      fetch(`${base}/api/export/rules`, { cache: 'no-store' }),
      fetch(`${base}/api/export/drafts`, { cache: 'no-store' }),
      fetch(`${base}/api/export/history`, { cache: 'no-store' }),
      fetch(`${base}/api/export/trades`, { cache: 'no-store' }),
    ]);

    if (!rostersRes.ok || !rulesRes.ok || !draftsRes.ok || !historyRes.ok || !tradesRes.ok) {
      throw new Error('One or more export endpoints failed');
    }

    const [rosters, rules, drafts, history, trades] = await Promise.all([
      rostersRes.json(),
      rulesRes.json(),
      draftsRes.json(),
      historyRes.json(),
      tradesRes.json(),
    ]);

    const body = {
      meta: {
        type: 'full-league-export',
        version: 1,
        generatedAt: new Date().toISOString(),
      },
      rosters,
      rules,
      drafts,
      history,
      trades,
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
