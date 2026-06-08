/**
 * MCP Tool: get_league_info
 * Returns league identity, important dates, scoring settings, payouts, and
 * roster configuration. Data is entirely static (sourced from constants and
 * the rules data file) — no Sleeper API calls are made.
 */

import { NextResponse } from 'next/server';
import { requireMcpAuth, mcpMeta } from '@/lib/mcp/auth';
import { LEAGUE_IDS, TEAM_NAMES, CHAMPIONS, IMPORTANT_DATES, CURRENT_SEASON } from '@/lib/constants/league';
import { rulesHtmlSections } from '@/data/rules';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: Request) {
  const authError = requireMcpAuth(request);
  if (authError) return authError;

  const seasons = [
    ...Object.keys(LEAGUE_IDS.PREVIOUS),
    CURRENT_SEASON,
  ].sort();

  const rules = rulesHtmlSections.map((s) => ({
    id: s.id,
    title: s.title,
    text: stripTags(s.html),
  }));

  const body = {
    meta: mcpMeta('get_league_info', { dataSource: 'static-constants', seasons }),
    league: {
      name: 'East v. West Fantasy Football',
      format: 'Dynasty',
      scoring: '0.5 PPR SuperFlex',
      teamCount: TEAM_NAMES.length,
      teams: TEAM_NAMES,
      currentSeason: CURRENT_SEASON,
      seasons,
      champions: CHAMPIONS,
    },
    importantDates: {
      NFL_WEEK_1_START: IMPORTANT_DATES.NFL_WEEK_1_START.toISOString(),
      TRADE_DEADLINE: IMPORTANT_DATES.TRADE_DEADLINE.toISOString(),
      PLAYOFFS_START: IMPORTANT_DATES.PLAYOFFS_START.toISOString(),
      NEW_LEAGUE_YEAR: IMPORTANT_DATES.NEW_LEAGUE_YEAR.toISOString(),
      NEXT_DRAFT: IMPORTANT_DATES.NEXT_DRAFT.toISOString(),
    },
    structure: {
      regularSeasonWeeks: 14,
      playoffTeams: 7,
      toiletBowlTeams: 5,
      playoffStartWeek: 15,
      tradeDeadlineWeek: 12,
      rosterSize: 17,
      starters: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 1, K: 1, DST: 1 },
      benchSlots: 7,
      irSlots: 3,
      taxiSlots: 3,
    },
    payouts: {
      champion: 365,
      secondPlace: 180,
      thirdPlace: 105,
      regularSeasonWinner: 150,
      weeklyHighScore: 20,
      toiletBowlWinner: 20,
      mvp: 50,
      roy: 50,
      totalPrizePool: 1200,
    },
    scoringHighlights: {
      passingTD: 5,
      rushingTD: 6,
      receivingTD: 6,
      reception: 0.5,
      interception: -2,
      fumbleLost: -2,
    },
    rules,
  };

  return NextResponse.json(body, { status: 200 });
}
