import { NextRequest, NextResponse } from 'next/server';
import { GET as getRosters } from '@/app/api/export/rosters/route';
import { GET as getRules } from '@/app/api/export/rules/route';
import { GET as getDrafts } from '@/app/api/export/drafts/route';
import { GET as getHistory } from '@/app/api/export/history/route';
import { GET as getTrades } from '@/app/api/export/trades/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type PlayerEntity = {
  idx: number;
  playerId: string;
  name: string;
  position: string | null;
  nflTeam: string | null;
};

type TeamEntity = {
  idx: number;
  team: string;
};

type PlayerInfoMeta = {
  name?: string;
  position?: string | null;
  nflTeam?: string | null;
};

function buildEntitiesIndex(payload: Record<string, unknown>): { players: PlayerEntity[]; teams: TeamEntity[] } | undefined {
  try {
    const rosters = payload.rosters as unknown as {
      playerInfo?: Record<string, PlayerInfoMeta>;
      teamsBySeason?: Record<string, Array<{ teamName?: string }>>;
    } | null;
    if (!rosters) return undefined;

    const players: PlayerEntity[] = [];
    const info = rosters.playerInfo;
    if (info && typeof info === 'object') {
      let idx = 0;
      const typedInfo = info as Record<string, PlayerInfoMeta>;
      for (const [pid, meta] of Object.entries(typedInfo)) {
        const name = meta.name ?? pid;
        const position = meta.position ?? null;
        const nflTeam = meta.nflTeam ?? null;
        players.push({ idx, playerId: pid, name, position, nflTeam });
        idx += 1;
      }
    }

    const teamSet = new Set<string>();
    const tbs = rosters.teamsBySeason;
    if (tbs && typeof tbs === 'object') {
      for (const seasonTeams of Object.values(tbs) as Array<unknown>) {
        if (!Array.isArray(seasonTeams)) continue;
        for (const t of seasonTeams as Array<{ teamName?: string }>) {
          const name = t?.teamName;
          if (typeof name === 'string' && name.trim().length > 0) {
            teamSet.add(name);
          }
        }
      }
    }

    const teams: TeamEntity[] = Array.from(teamSet)
      .sort((a, b) => a.localeCompare(b))
      .map((name, idx) => ({ idx, team: name }));

    if (!players.length && !teams.length) return undefined;
    return { players, teams };
  } catch {
    return undefined;
  }
}

export async function GET() {
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

    const entities = buildEntitiesIndex(payload);

    const body = {
      meta: {
        type: 'full-league-export',
        version: 1,
        generatedAt: new Date().toISOString(),
      },
      ...payload,
      entities,
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
