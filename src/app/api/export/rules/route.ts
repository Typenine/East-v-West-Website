import { NextResponse } from 'next/server';
import { LEAGUE_IDS, IMPORTANT_DATES } from '@/lib/constants/league';
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
