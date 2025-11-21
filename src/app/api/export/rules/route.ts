import { NextResponse } from 'next/server';
import { LEAGUE_IDS, IMPORTANT_DATES, TEAM_NAMES } from '@/lib/constants/league';
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

export async function GET() {
  try {
    const seasons = ['2025', ...Object.keys(LEAGUE_IDS.PREVIOUS || {})].sort();
    const leagueIds: Record<string, string> = {
      '2025': LEAGUE_IDS.CURRENT,
      ...LEAGUE_IDS.PREVIOUS,
    } as Record<string, string>;

    const importantDates = {
      NFL_WEEK_1_START: IMPORTANT_DATES.NFL_WEEK_1_START.toISOString(),
      TRADE_DEADLINE: IMPORTANT_DATES.TRADE_DEADLINE.toISOString(),
      PLAYOFFS_START: IMPORTANT_DATES.PLAYOFFS_START.toISOString(),
      NEXT_DRAFT: IMPORTANT_DATES.NEXT_DRAFT.toISOString(),
    };

    const rules = rulesHtmlSections.map((section) => ({
      id: section.id,
      title: section.title,
      html: section.html,
      text: stripTags(section.html),
    }));

    // Structured payouts derived from Rule 8.3
    const payouts = {
      champion: {
        label: 'League Champion',
        amount: 365,
        frequency: 'season',
      },
      secondPlace: {
        label: '2nd Place',
        amount: 180,
        frequency: 'season',
      },
      thirdPlace: {
        label: '3rd Place',
        amount: 105,
        frequency: 'season',
      },
      regularSeasonWinner: {
        label: 'Best Regular Season Record',
        amount: 150,
        frequency: 'season',
      },
      weeklyHighScore: {
        label: 'Weekly High Score',
        amount: 20,
        frequency: 'weekly',
        weeks: 14,
        totalAmount: 280,
      },
      toiletBowlWinner: {
        label: 'Toilet Bowl Winner',
        amount: 20,
        frequency: 'season',
      },
      mvp: {
        label: 'MVP (Most Points by Single Player)',
        amount: 50,
        frequency: 'season',
      },
      roy: {
        label: 'ROY (Most Points by Rookie Player)',
        amount: 50,
        frequency: 'season',
      },
      totalPayout: {
        label: 'Total Prizes',
        amount: 1200,
        frequency: 'season',
      },
    } as const;

    // Roster and lineup configuration derived from Rule 2
    const rosterSettings = {
      totalRosterSize: 17,
      starters: {
        QB: 1,
        RB: 2,
        WR: 2,
        TE: 1,
        FLEX: 1,
        SUPERFLEX: 1,
        K: 1,
        DST: 1,
      },
      benchSize: 7,
      irSlots: 3,
      taxi: {
        slots: 3,
        maxQBs: 1,
        oneWayPromotion: true,
        intakeSources: ['freeAgency', 'trade', 'entryDraft'],
      },
    } as const;

    // Structured scoring model derived from Rule 13
    const scoringSettings = {
      passing: {
        yardsPerYard: 0.04, // 1 point per 25 yards
        touchdown: 5,
        twoPointConversion: 2,
        interception: -2,
      },
      rushing: {
        yardsPerYard: 0.1, // 1 point per 10 yards
        touchdown: 6,
        twoPointConversion: 2,
      },
      receiving: {
        reception: 0.5,
        yardsPerYard: 0.1,
        touchdown: 6,
        twoPointConversion: 2,
      },
      kicking: {
        fieldGoals: {
          made0to49: 3,
          made50Plus: 3,
          bonusPerYardOver30: 0.1,
        },
        pat: {
          made: 1,
          missed: -1,
        },
        missed0to49: -1,
      },
      defenseST: {
        defensiveTouchdown: 6,
        sacks: 1,
        interceptions: 2,
        fumbleRecoveries: 2,
        safeties: 2,
        forcedFumbles: 1,
        blockedKicks: 2,
        pointsAllowed: [
          { range: '0', points: 5 },
          { range: '1-6', points: 4 },
          { range: '7-13', points: 3 },
          { range: '14-20', points: 1 },
          { range: '28-34', points: -1 },
          { range: '35+', points: -4 },
        ],
        yardsAllowed: [
          { range: '<100', points: 5 },
          { range: '100-199', points: 3 },
          { range: '200-299', points: 2 },
          { range: '350-399', points: -1 },
          { range: '400-449', points: -3 },
          { range: '450-499', points: -5 },
          { range: '500-549', points: -6 },
          { range: '550+', points: -7 },
        ],
      },
      specialTeams: {
        touchdown: 6,
        forcedFumble: 1,
        fumbleRecovery: 1,
        individualForcedFumble: 1,
        individualFumbleRecovery: 1,
      },
      misc: {
        fumbleLost: -2,
        fumbleRecoveryTouchdown: 6,
      },
    } as const;

    // Conferences metadata: this league does not use conferences/divisions.
    const conferences = {
      hasConferences: false,
      groups: [] as Array<{ name: string; teams: string[] }>,
      allTeams: TEAM_NAMES,
    } as const;

    const body = {
      meta: {
        type: 'rules-and-settings',
        version: 1,
        generatedAt: new Date().toISOString(),
      },
      league: {
        seasons,
        leagueIds,
        importantDates,
      },
      rules,
      payouts,
      rosterSettings,
      scoringSettings,
      conferences,
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="evw-rules-and-settings.json"',
      },
    });
  } catch (err) {
    console.error('export/rules GET error', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
