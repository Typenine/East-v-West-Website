import { NextRequest, NextResponse } from 'next/server';
import { 
  getNFLWeekStats,
  getAllPlayersCached,
  getNFLState,
  SleeperNFLSeasonPlayerStats,
  SleeperPlayer,
} from '@/lib/utils/sleeper-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Shape of the aggregated team feed response
interface TeamFeedItem {
  team: string; // NFL team code, e.g., 'SEA'
  totalPPR: number; // sum of weekly PPR across players on this team
  playerCount: number; // number of players contributing (>0 pts)
  topPlayers: Array<{
    playerId: string;
    firstName: string;
    lastName: string;
    position: string;
    ppr: number;
  }>;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    // Defaults from current NFL state (cached)
    const state = await getNFLState().catch(() => ({} as any));
    let season = (searchParams.get('season') || state?.season || String(new Date().getFullYear())).trim();

    const weekParam = searchParams.get('week');
    let week = Number.isFinite(Number(weekParam)) ? Number(weekParam) : (state?.week ?? 1);
    week = clamp(Math.floor(Number(week) || 1), 1, 23);

    const teamFilter = (searchParams.get('team') || '').toUpperCase().trim(); // optional NFL team code filter
    const topN = clamp(Math.floor(Number(searchParams.get('top')) || 5), 1, 50);

    // Fetch weekly stats and players in parallel
    const [weekStats, players] = await Promise.all([
      getNFLWeekStats(season, week),
      getAllPlayersCached(),
    ]);

    // Aggregate by NFL team code (from players index)
    type Agg = {
      totalPPR: number;
      players: Array<{ id: string; ppr: number }>; // for top list later
    };
    const byTeam: Record<string, Agg> = {};

    const entries = Object.entries(weekStats) as Array<[string, SleeperNFLSeasonPlayerStats]>;
    for (const [playerId, stat] of entries) {
      // Only consider players with positive weekly points
      const ppr = (stat?.pts_ppr ?? 0) || 0;
      if (ppr <= 0) continue;
      const pl: SleeperPlayer | undefined = (players as Record<string, SleeperPlayer>)[playerId];
      const teamCode = (pl?.team || 'FA').toUpperCase();
      if (teamFilter && teamCode !== teamFilter) continue;

      if (!byTeam[teamCode]) byTeam[teamCode] = { totalPPR: 0, players: [] };
      byTeam[teamCode].totalPPR += ppr;
      byTeam[teamCode].players.push({ id: playerId, ppr });
    }

    // Build response list sorted by totalPPR desc
    const result: TeamFeedItem[] = Object.entries(byTeam)
      .map(([team, agg]) => {
        const top = agg.players
          .sort((a, b) => b.ppr - a.ppr)
          .slice(0, topN)
          .map(({ id, ppr }) => {
            const pl = (players as Record<string, SleeperPlayer>)[id];
            return {
              playerId: id,
              firstName: pl?.first_name || '',
              lastName: pl?.last_name || '',
              position: pl?.position || '',
              ppr,
            };
          });
        return {
          team,
          totalPPR: Number(agg.totalPPR.toFixed(2)),
          playerCount: agg.players.length,
          topPlayers: top,
        } as TeamFeedItem;
      })
      .sort((a, b) => b.totalPPR - a.totalPPR);

    return NextResponse.json(
      {
        season: String(season),
        week,
        generatedAt: new Date().toISOString(),
        source: 'sleeper',
        teams: result,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('Team Feed API error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
