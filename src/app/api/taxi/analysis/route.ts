import { NextRequest } from 'next/server';
import { validateTaxiForRoster } from '@/lib/server/taxi-validator';
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
  const season = url.searchParams.get('season') || '2026';
  const rosterId = Number(url.searchParams.get('rosterId') || '0');
  if (!Number.isFinite(rosterId) || rosterId <= 0) return Response.json({ error: 'invalid_roster' }, { status: 400 });

  try {
    const result = await validateTaxiForRoster(season, rosterId);
    if (!result) return Response.json({ error: 'unavailable' }, { status: 404 });
    
    // Convert new validator format to old analysis format for backward compatibility
    const analysis = {
      team: { 
        ownerId: '', // Not available in new format
        teamName: result.team.teamName, 
        selectedSeason: result.team.selectedSeason, 
        rosterId: result.team.rosterId 
      },
      limits: { maxSlots: 4, maxQB: 1 },
      current: {
        taxi: result.current.taxi.map(p => ({
          playerId: p.playerId,
          name: p.name,
          position: p.position,
          sinceTs: p.joinedAt,
          activatedSinceJoin: false, // Will be determined by violations
          potentialActivatedSinceJoin: false,
          activatedAt: null,
          onTaxiSince: p.firstTaxiWeek ? { year: result.team.selectedSeason, week: p.firstTaxiWeek } : null,
          ineligibleReason: null,
          potentialAt: null,
        })),
        counts: result.current.counts
      },
      violations: {
        overSlots: result.violations.some(v => v.code === 'too_many_on_taxi'),
        overQB: result.violations.some(v => v.code === 'too_many_qbs'),
        ineligibleOnTaxi: result.violations
          .filter(v => v.code === 'boomerang_active_player' || v.code === 'boomerang_reset_ineligible')
          .flatMap(v => v.players || [])
      }
    };

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

    // Attach observedSince to taxi items and mark activated players
    const enriched = {
      ...analysis,
      current: {
        ...analysis.current,
        taxi: analysis.current.taxi.map((tp) => ({
          ...tp,
          observedSince: doc.players[tp.playerId]?.firstSeen || null,
          activatedSinceJoin: analysis.violations.ineligibleOnTaxi.includes(tp.playerId),
        })),
      },
      // Add new violation details for UI
      violationDetails: result.violations,
    };

    return Response.json(enriched);
  } catch {
    return Response.json({ error: 'server_error' }, { status: 500 });
  }
}
