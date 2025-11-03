import { NextRequest } from 'next/server';
import { computeTaxiAnalysisForRoster } from '@/lib/utils/taxi';
import { getTaxiObservation, setTaxiObservation } from '@/server/db/queries';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TaxiPlayerStats = { firstSeen: string; lastSeen: string; seenCount: number };
type TaxiObsDoc = { team: string; updatedAt?: string; players: Record<string, TaxiPlayerStats> };

async function readObservation(teamKey: string): Promise<TaxiObsDoc | null> {
  try {
    const row = await getTaxiObservation(teamKey);
    if (!row) return null;
    const players = row.players as unknown as Record<string, TaxiPlayerStats>;
    const updatedAtIso = (row.updatedAt as unknown as Date)?.toISOString?.();
    return { team: teamKey, updatedAt: updatedAtIso || undefined, players } as TaxiObsDoc;
  } catch {
    return null;
  }
}

async function writeObservation(teamKey: string, doc: { team: string; updatedAt: string; players: Record<string, { firstSeen: string; lastSeen: string; seenCount: number }> }) {
  try {
    await setTaxiObservation(teamKey, { updatedAt: new Date(doc.updatedAt), players: doc.players });
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
