import { NextResponse } from 'next/server';
import { getNFLState } from '@/lib/utils/sleeper-api';
import { GET as getExportAll } from '@/app/api/export/all/route';
import { GET as getTransactions } from '@/app/api/transactions/route';
import { GET as getTeamFeed } from '@/app/api/team-feed/route';
import { GET as getDefenseStrength } from '@/app/api/defense-strength/route';
import { GET as getDraftNextOrder } from '@/app/api/draft/next-order/route';
import { GET as getTradeBlocks } from '@/app/api/teams/trade-blocks/route';
import { GET as getFranchiseSummaries } from '@/app/api/franchise-summaries/route';
import { GET as getMatchupPoints } from '@/app/api/matchup-points/route';
import { GET as getNFLScoreboard } from '@/app/api/nfl-scoreboard/route';
import { GET as getNFLWeekStats } from '@/app/api/nfl-week-stats/route';
import { GET as getPlayerInfo } from '@/app/api/player-info/route';
import { GET as getPlayerBaselines } from '@/app/api/player-baselines/route';
import { GET as getRosterNews } from '@/app/api/roster-news/route';
import { GET as getLineupSnapshot } from '@/app/api/lineups/snapshot/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RESPONSE_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0, s-maxage=0',
  Pragma: 'no-cache',
  Expires: '0',
};

const SECTION_NAMES = [
  'exportAll',
  'transactions',
  'teamFeed',
  'defenseStrength',
  'draftNextOrder',
  'tradeBlocks',
  'franchiseSummaries',
  'matchupPoints',
  'nflScoreboard',
  'nflWeekStats',
  'playerInfo',
  'playerBaselines',
  'rosterNews',
  'lineupsSnapshot',
] as const;

type SectionName = (typeof SECTION_NAMES)[number];

function parseInclude(searchParams: URLSearchParams): Set<SectionName> {
  const raw = (searchParams.get('include') || 'all')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (raw.length === 0 || raw.includes('all')) {
    return new Set<SectionName>(SECTION_NAMES);
  }

  const selected = new Set<SectionName>();
  for (const value of raw) {
    if ((SECTION_NAMES as readonly string[]).includes(value)) {
      selected.add(value as SectionName);
    }
  }
  return selected;
}

function buildRequest(pathname: string, params: Record<string, string | number | undefined | null>): Request {
  const url = new URL(`https://evw-public.local${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    const normalized = String(value).trim();
    if (!normalized) continue;
    url.searchParams.set(key, normalized);
  }
  return new Request(url.toString(), { method: 'GET' });
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const err = (payload as { error?: unknown; message?: unknown }).error;
    if (typeof err === 'string' && err.trim()) return err;
    const msg = (payload as { error?: unknown; message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  return fallback;
}

async function parseResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => null);
}

type SectionResult = { name: SectionName; ok: boolean; status: number; data?: unknown; error?: string };

async function resolveSection(
  name: SectionName,
  invoke: () => Promise<Response>,
): Promise<SectionResult> {
  try {
    const response = await invoke();
    const payload = await parseResponse(response);
    if (!response.ok) {
      return {
        name,
        ok: false,
        status: response.status,
        error: getErrorMessage(payload, `Section ${name} failed with status ${response.status}`),
      };
    }
    return {
      name,
      ok: true,
      status: response.status,
      data: payload,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const searchParams = url.searchParams;
    const include = parseInclude(searchParams);

    let nflState: Awaited<ReturnType<typeof getNFLState>> | null = null;
    try {
      nflState = await getNFLState();
    } catch {
      nflState = null;
    }

    const resolvedSeason = (searchParams.get('season') || String(nflState?.season || new Date().getFullYear())).trim();
    const resolvedWeekRaw = Number(searchParams.get('week') || nflState?.week || 1);
    const resolvedWeek = Number.isFinite(resolvedWeekRaw) && resolvedWeekRaw > 0 ? Math.floor(resolvedWeekRaw) : 1;
    const resolvedUptoWeekRaw = Number(searchParams.get('uptoWeek') || Math.max(1, resolvedWeek - 1));
    const resolvedUptoWeek = Number.isFinite(resolvedUptoWeekRaw) && resolvedUptoWeekRaw > 0 ? Math.floor(resolvedUptoWeekRaw) : 1;

    const playerId = (searchParams.get('playerId') || '').trim();
    const players = (searchParams.get('players') || '').trim();
    const playerIds = (searchParams.get('playerIds') || '').trim();
    const lineupYear = (searchParams.get('lineupYear') || '').trim();
    const lineupWeekRaw = Number(searchParams.get('lineupWeek') || '');
    const lineupWeek = Number.isFinite(lineupWeekRaw) && lineupWeekRaw > 0 ? Math.floor(lineupWeekRaw) : null;

    const skipped: Partial<Record<SectionName, string>> = {};
    const tasks: Array<Promise<SectionResult>> = [];

    if (include.has('exportAll')) {
      tasks.push(resolveSection('exportAll', () => getExportAll()));
    }

    if (include.has('transactions')) {
      tasks.push(resolveSection(
        'transactions',
        () => getTransactions(buildRequest('/api/transactions', {
          season: searchParams.get('transactionSeason') || undefined,
          team: searchParams.get('transactionTeam') || undefined,
          sort: searchParams.get('transactionSort') || undefined,
          direction: searchParams.get('transactionDirection') || undefined,
        }) as Parameters<typeof getTransactions>[0]),
      ));
    }

    if (include.has('teamFeed')) {
      tasks.push(resolveSection(
        'teamFeed',
        () => getTeamFeed(buildRequest('/api/team-feed', {
          season: resolvedSeason,
          week: resolvedWeek,
          team: searchParams.get('team') || undefined,
          top: searchParams.get('top') || undefined,
        }) as Parameters<typeof getTeamFeed>[0]),
      ));
    }

    if (include.has('defenseStrength')) {
      tasks.push(resolveSection(
        'defenseStrength',
        () => getDefenseStrength(buildRequest('/api/defense-strength', {
          season: resolvedSeason,
          uptoWeek: resolvedUptoWeek,
        }) as Parameters<typeof getDefenseStrength>[0]),
      ));
    }

    if (include.has('draftNextOrder')) {
      tasks.push(resolveSection(
        'draftNextOrder',
        () => getDraftNextOrder(buildRequest('/api/draft/next-order', {
          season: searchParams.get('draftSeason') || resolvedSeason,
        }) as Parameters<typeof getDraftNextOrder>[0]),
      ));
    }

    if (include.has('tradeBlocks')) {
      tasks.push(resolveSection('tradeBlocks', () => getTradeBlocks()));
    }

    if (include.has('franchiseSummaries')) {
      tasks.push(resolveSection(
        'franchiseSummaries',
        () => getFranchiseSummaries(buildRequest('/api/franchise-summaries', {
          fresh: searchParams.get('fresh') || undefined,
        }) as Parameters<typeof getFranchiseSummaries>[0]),
      ));
    }

    if (include.has('matchupPoints')) {
      tasks.push(resolveSection(
        'matchupPoints',
        () => getMatchupPoints(buildRequest('/api/matchup-points', {
          leagueId: searchParams.get('matchupLeagueId') || undefined,
          week: searchParams.get('matchupWeek') || resolvedWeek,
        }) as Parameters<typeof getMatchupPoints>[0]),
      ));
    }

    if (include.has('nflScoreboard')) {
      tasks.push(resolveSection(
        'nflScoreboard',
        () => getNFLScoreboard(buildRequest('/api/nfl-scoreboard', {
          season: resolvedSeason,
          week: resolvedWeek,
        }) as Parameters<typeof getNFLScoreboard>[0]),
      ));
    }

    if (include.has('nflWeekStats')) {
      tasks.push(resolveSection(
        'nflWeekStats',
        () => getNFLWeekStats(buildRequest('/api/nfl-week-stats', {
          season: resolvedSeason,
          week: resolvedWeek,
        }) as Parameters<typeof getNFLWeekStats>[0]),
      ));
    }

    if (include.has('playerInfo')) {
      if (playerId) {
        tasks.push(resolveSection(
          'playerInfo',
          () => getPlayerInfo(buildRequest('/api/player-info', { id: playerId }) as Parameters<typeof getPlayerInfo>[0]),
        ));
      } else {
        skipped.playerInfo = 'Requires playerId query param.';
      }
    }

    if (include.has('playerBaselines')) {
      if (players) {
        tasks.push(resolveSection(
          'playerBaselines',
          () => getPlayerBaselines(buildRequest('/api/player-baselines', {
            season: resolvedSeason,
            players,
          }) as Parameters<typeof getPlayerBaselines>[0]),
        ));
      } else {
        skipped.playerBaselines = 'Requires players query param.';
      }
    }

    if (include.has('rosterNews')) {
      if (playerIds) {
        tasks.push(resolveSection(
          'rosterNews',
          () => getRosterNews(buildRequest('/api/roster-news', {
            playerIds,
            limit: searchParams.get('limit') || undefined,
            sinceHours: searchParams.get('sinceHours') || undefined,
          }) as Parameters<typeof getRosterNews>[0]),
        ));
      } else {
        skipped.rosterNews = 'Requires playerIds query param.';
      }
    }

    if (include.has('lineupsSnapshot')) {
      if (lineupYear && lineupWeek != null) {
        tasks.push(resolveSection(
          'lineupsSnapshot',
          () => getLineupSnapshot(buildRequest('/api/lineups/snapshot', {
            year: lineupYear,
            week: lineupWeek,
          }) as Parameters<typeof getLineupSnapshot>[0]),
        ));
      } else {
        skipped.lineupsSnapshot = 'Requires lineupYear and lineupWeek query params.';
      }
    }

    const settled = await Promise.all(tasks);
    const data: Partial<Record<SectionName, unknown>> = {};
    const errors: Partial<Record<SectionName, { status: number; message: string }>> = {};

    for (const result of settled) {
      if (result.ok) {
        data[result.name] = result.data;
      } else {
        errors[result.name] = {
          status: result.status,
          message: result.error || 'Unknown error',
        };
      }
    }

    const body = {
      meta: {
        type: 'public-data-bundle',
        version: 1,
        generatedAt: new Date().toISOString(),
        included: Array.from(include),
        defaults: {
          season: resolvedSeason,
          week: resolvedWeek,
          uptoWeek: resolvedUptoWeek,
        },
      },
      data,
      skipped: Object.keys(skipped).length ? skipped : undefined,
      errors: Object.keys(errors).length ? errors : undefined,
    };

    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...RESPONSE_CACHE_HEADERS,
      },
    });
  } catch (error) {
    console.error('public bundle API error', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
