import { NextRequest } from 'next/server';
import { computeTaxiAnalysisForRoster } from '@/lib/utils/taxi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TaxiObsDoc = { team: string; updatedAt?: string; players: Record<string, { firstSeen: string; lastSeen: string; seenCount: number }> };

async function readObservation(teamKey: string): Promise<TaxiObsDoc | null> {
  try {
    const { list } = await import('@vercel/blob');
    const prefix = `logs/taxi/observations/${encodeURIComponent(teamKey)}.json`;
    const { blobs } = await list({ prefix });
    type BlobMeta = { pathname: string; url: string };
    const arr = (blobs as unknown as BlobMeta[]) || [];
    const hit = arr.find((b) => b.pathname === prefix);
    if (!hit) return null;
    const r = await fetch(hit.url, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = (await r.json()) as unknown;
    if (!j || typeof j !== 'object') return null;
    const doc = j as TaxiObsDoc;
    return doc;
  } catch {
    return null;
  }
}

async function writeObservation(teamKey: string, doc: { team: string; updatedAt: string; players: Record<string, { firstSeen: string; lastSeen: string; seenCount: number }> }) {
  try {
    const { put } = await import('@vercel/blob');
    const key = `logs/taxi/observations/${encodeURIComponent(teamKey)}.json`;
    await put(key, JSON.stringify(doc, null, 2), {
      access: 'public',
      contentType: 'application/json; charset=utf-8',
      token: process.env.BLOB_READ_WRITE_TOKEN,
      allowOverwrite: true,
    });
  } catch {
    /* ignore */
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const season = url.searchParams.get('season') || '2025';
  const rosterId = Number(url.searchParams.get('rosterId') || '0');
  if (!Number.isFinite(rosterId) || rosterId <= 0) return Response.json({ error: 'invalid_roster' }, { status: 400 });

  try {
    const analysis = await computeTaxiAnalysisForRoster(season, rosterId);
    if (!analysis) return Response.json({ error: 'unavailable' }, { status: 404 });

    // Merge observation (firstSeen on taxi) into response; update with current taxi list
    const key = analysis.team.teamName;
    const existing = await readObservation(key);
    const nowIso = new Date().toISOString();
    const doc: Required<TaxiObsDoc> = existing ? { team: existing.team, updatedAt: existing.updatedAt || nowIso, players: existing.players } : { team: key, updatedAt: nowIso, players: {} };
    for (const p of analysis.current.taxi) {
      const cur = doc.players[p.playerId];
      if (!cur) {
        doc.players[p.playerId] = { firstSeen: nowIso, lastSeen: nowIso, seenCount: 1 };
      } else {
        cur.lastSeen = nowIso;
        cur.seenCount = (cur.seenCount || 0) + 1;
      }
    }
    doc.updatedAt = nowIso;
    await writeObservation(key, doc);

    // Attach observedSince to taxi items
    const enriched = {
      ...analysis,
      current: {
        ...analysis.current,
        taxi: analysis.current.taxi.map((tp) => ({
          ...tp,
          observedSince: doc.players[tp.playerId]?.firstSeen || null,
        })),
      },
    };

    return Response.json(enriched);
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
