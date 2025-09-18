import { NextRequest, NextResponse } from 'next/server';
import { LEAGUE_IDS } from '@/lib/constants/league';
import {
  getAllPlayers,
  getLeagueMatchups,
  getTeamsData,
  computeSeasonTotalsCustomScoringFromStats,
} from '@/lib/utils/sleeper-api';
import { resolveCanonicalTeamName } from '@/lib/utils/team-utils';

export const dynamic = 'force-dynamic';

function normalizeName(s: string | undefined | null): string {
  return (s || '').trim().toLowerCase();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const playerIdParam = searchParams.get('playerId') || '';
    const playerNameParam = searchParams.get('playerName') || '';
    const teamNameParam = searchParams.get('teamName') || '';
    const ownerIdParam = searchParams.get('ownerId') || '';
    const includeSeasonsParam = searchParams.get('seasons') || '';

    // Build seasons list: current + previous from constants unless explicitly limited
    const prevYears = Object.keys(LEAGUE_IDS.PREVIOUS || {});
    const seasons = (includeSeasonsParam
      ? includeSeasonsParam.split(',').map(s => s.trim()).filter(Boolean)
      : Array.from(new Set(['2025', ...prevYears]))).sort();

    // Resolve playerId by name if needed
    let playerId = playerIdParam.trim();
    const allPlayers = await getAllPlayers();
    if (!playerId) {
      const target = normalizeName(playerNameParam);
      if (!target) {
        return NextResponse.json({ error: 'Provide playerId or playerName' }, { status: 400 });
      }
      for (const [pid, p] of Object.entries(allPlayers)) {
        const nm = normalizeName(`${p?.first_name || ''} ${p?.last_name || ''}`);
        if (nm === target) { playerId = pid; break; }
      }
      if (!playerId) return NextResponse.json({ error: 'playerName not found' }, { status: 404 });
    }

    // Resolve franchise per season
    const canonical = teamNameParam ? teamNameParam : (ownerIdParam ? resolveCanonicalTeamName({ ownerId: ownerIdParam }) : '');
    let resolvedTeamName: string | null = null;

    const rows: Array<any> = [];
    for (const season of seasons) {
      const leagueId = (season === '2025') ? LEAGUE_IDS.CURRENT : (LEAGUE_IDS.PREVIOUS as any)[season];
      if (!leagueId) continue;

      const teams = await getTeamsData(leagueId);
      let seasonTeam = teams.find(t => canonical && t.teamName === canonical) || teams.find(t => ownerIdParam && t.ownerId === ownerIdParam) || null;
      if (!seasonTeam) {
        rows.push({ season, error: 'team not found' });
        continue;
      }

      const rosterId = seasonTeam.rosterId;
      if (!resolvedTeamName) resolvedTeamName = seasonTeam.teamName || null;

      // Sum team-attributed points (Weeks 1–17 + playoffs) using league matchups players_points
      const weeks = Array.from({ length: 17 }, (_, i) => i + 1);
      const weekly = await Promise.all(weeks.map(w => getLeagueMatchups(leagueId, w).catch(() => [] as any[])));
      let teamAttr = 0;
      let playoffsOnly = 0;
      for (let i = 0; i < weekly.length; i++) {
        const weekNum = weeks[i];
        const matchups = weekly[i] as Array<{ roster_id?: number; players_points?: Record<string, number>; players?: string[]; starters?: string[] }>;
        for (const m of matchups) {
          if (!m || m.roster_id !== rosterId) continue;
          const pp = m.players_points || {};
          const val = Number(pp[playerId] || 0);
          if (Number.isFinite(val)) {
            teamAttr += val;
            if (weekNum >= 15) playoffsOnly += val;
          }
        }
      }

      // Compute NFL regular-season totals W1–18 and W1–17 using league scoring (half PPR custom)
      const [tot18, tot17] = await Promise.all([
        computeSeasonTotalsCustomScoringFromStats(season, leagueId, 18),
        computeSeasonTotalsCustomScoringFromStats(season, leagueId, 17),
      ]);
      const nflReg = Number(tot18[playerId] || 0);
      const week18Only = Number(((tot18[playerId] || 0) - (tot17[playerId] || 0)).toFixed(2));

      rows.push({
        season,
        team_attr_W1_17_plus_PO: Number(teamAttr.toFixed(2)),
        nfl_reg_W1_18: Number(nflReg.toFixed(2)),
        playoffs_W15_17_only: Number(playoffsOnly.toFixed(2)),
        week18_only: week18Only,
        delta_total: Number((teamAttr - nflReg).toFixed(2)),
        delta_theory_PO_minus_W18: Number((playoffsOnly - week18Only).toFixed(2)),
      });
    }

    // Add grand totals
    const grand = rows.reduce((acc, r) => {
      acc.team_attr_W1_17_plus_PO += r.team_attr_W1_17_plus_PO || 0;
      acc.nfl_reg_W1_18 += r.nfl_reg_W1_18 || 0;
      acc.playoffs_W15_17_only += r.playoffs_W15_17_only || 0;
      acc.week18_only += r.week18_only || 0;
      return acc;
    }, { team_attr_W1_17_plus_PO: 0, nfl_reg_W1_18: 0, playoffs_W15_17_only: 0, week18_only: 0 });
    const summary = {
      team_attr_W1_17_plus_PO: Number(grand.team_attr_W1_17_plus_PO.toFixed(2)),
      nfl_reg_W1_18: Number(grand.nfl_reg_W1_18.toFixed(2)),
      delta_total: Number((grand.team_attr_W1_17_plus_PO - grand.nfl_reg_W1_18).toFixed(2)),
      playoffs_W15_17_only: Number(grand.playoffs_W15_17_only.toFixed(2)),
      week18_only: Number(grand.week18_only.toFixed(2)),
      delta_theory_PO_minus_W18: Number((grand.playoffs_W15_17_only - grand.week18_only).toFixed(2)),
    };

    return NextResponse.json({ playerId, teamName: resolvedTeamName || canonical || null, seasons, rows, summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
