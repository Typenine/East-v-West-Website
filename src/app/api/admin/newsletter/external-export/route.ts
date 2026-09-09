import { NextRequest } from 'next/server';
import { isAdminCookieValue } from '@/lib/auth/admin';
import { ANALYST_BRAIN, ENTERTAINER_BRAIN, type BotBrain } from '@/lib/newsletter/bot-brain';
import { buildStaticLeagueContext } from '@/lib/newsletter/league-knowledge';
import { getAllTeamCards } from '@/lib/newsletter/team-narratives';
import { getLeagueRulesContext } from '@/lib/newsletter';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import { fetchComprehensiveLeagueData, fetchCurrentWeekContext } from '@/lib/newsletter/data-integration';
import { getTradeValues } from '@/lib/trade-analyzer/values';
import { ensurePublishedTakeLedgerForSeason } from '@/lib/newsletter/published-take-ledger';
import { loadPublishedTakeLedgerState } from '@/lib/newsletter/published-take-store';
import {
  getAllPlayersCached,
  getDraftPicks,
  getLeague,
  getLeagueDrafts,
  getLeagueRosters,
  getTeamsData,
  type SleeperDraftPick,
  type SleeperPlayer,
  type SleeperRoster,
} from '@/lib/utils/sleeper-api';
import {
  loadAllPhrasePools,
  loadAllTeamNarrativeOverrides,
  loadBotSettings,
} from '@/server/db/personality-queries';
import {
  listNewslettersMeta,
  loadBotMemory,
  loadForecastRecords,
  loadNewsletterById,
} from '@/server/db/newsletter-queries';
import {
  buildWritingRoomMarkdown,
  getExternalEpisodeFormat,
} from '@/lib/newsletter/external-generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type ExportKind = 'writing-room' | 'source-pack';
type SignaturePhrases = { openers?: string[]; closers?: string[]; verbalTics?: string[] };

type TradedPick = {
  season?: string | number;
  round?: number;
  roster_id?: number;
  owner_id?: number;
  previous_owner_id?: number;
};

function isAdmin(req: NextRequest): boolean {
  return isAdminCookieValue(req.cookies.get('evw_admin')?.value);
}

function unique(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(value => value?.trim()).filter((value): value is string => Boolean(value)))];
}

function mergeBrain(base: BotBrain, settings: Awaited<ReturnType<typeof loadBotSettings>>): BotBrain {
  const signature = (settings?.signaturePhrases ?? null) as SignaturePhrases | null;
  return {
    ...base,
    displayName: settings?.displayName?.trim() || base.displayName,
    role: settings?.roleDescription?.trim() || base.role,
    voice: { ...base.voice, ...(settings?.voiceConfig ?? {}) },
    safetyBoundaries: unique([...base.safetyBoundaries, ...(settings?.safetyBoundaries ?? [])]),
    verbalTics: unique([...base.verbalTics, ...(signature?.verbalTics ?? [])]),
    openers: unique([...base.openers, ...(signature?.openers ?? [])]),
    closers: unique([...base.closers, ...(signature?.closers ?? [])]),
  };
}

function mergeTeamCards(overrides: Awaited<ReturnType<typeof loadAllTeamNarrativeOverrides>>): unknown[] {
  const baseCards = getAllTeamCards();
  const byName = new Map(overrides.map(row => [row.teamName.toLowerCase(), row.cardData]));
  const merged: unknown[] = baseCards.map(card => ({ ...card, ...(byName.get(card.teamName.toLowerCase()) ?? {}) }));
  const existing = new Set(baseCards.map(card => card.teamName.toLowerCase()));
  for (const override of overrides) {
    if (!existing.has(override.teamName.toLowerCase())) merged.push({ teamName: override.teamName, ...override.cardData });
  }
  return merged;
}

function downloadResponse(body: string, fileName: string, contentType: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

function safePlayerName(player: SleeperPlayer | undefined, fallback: string): string {
  if (!player) return fallback;
  return `${player.first_name || ''} ${player.last_name || ''}`.trim() || fallback;
}

function sumValues(players: Array<{ dynastyValue: { value: number } | null }>): number {
  return players.reduce((sum, player) => sum + (player.dynastyValue?.value ?? 0), 0);
}

function valuesByPosition(players: Array<{ position: string | null; dynastyValue: { value: number } | null }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const player of players) {
    const position = player.position || 'UNKNOWN';
    out[position] = (out[position] ?? 0) + (player.dynastyValue?.value ?? 0);
  }
  return out;
}

async function loadRecentPublishedIssues(season: number) {
  const current = await listNewslettersMeta(season).catch(() => []);
  const previous = current.length >= 4 || season <= 2023
    ? []
    : await listNewslettersMeta(season - 1).catch(() => []);
  const selected = [...current, ...previous]
    .filter(item => item.status === 'published')
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, 4);

  const loaded = await Promise.all(selected.map(item => loadNewsletterById(item.id).catch(() => null)));
  return loaded.filter(Boolean).map(issue => {
    const value = issue!;
    return {
      id: value.id,
      title: value.title,
      season: value.season,
      week: value.week,
      episodeType: value.episodeType,
      generatedAt: value.generatedAt,
      sections: value.newsletter.sections,
    };
  });
}

async function buildWritingRoom(season: number): Promise<Response> {
  const [masonSettings, westySettings, overrides, phraseRows] = await Promise.all([
    loadBotSettings('entertainer'),
    loadBotSettings('analyst'),
    loadAllTeamNarrativeOverrides(),
    loadAllPhrasePools(),
  ]);

  const phrasePools = Object.fromEntries(phraseRows.map(row => [row.poolKey, row.phrases]));
  const exportedAt = new Date().toISOString();
  const markdown = buildWritingRoomMarkdown({
    season,
    exportedAt,
    mason: mergeBrain(ENTERTAINER_BRAIN, masonSettings),
    westy: mergeBrain(ANALYST_BRAIN, westySettings),
    masonSettings,
    westySettings,
    staticLeagueContext: buildStaticLeagueContext(),
    leagueRules: getLeagueRulesContext(),
    teamNarrativeCards: mergeTeamCards(overrides),
    phrasePools,
  });

  return downloadResponse(
    markdown,
    `east-v-west-newsletter-writing-room-${season}.md`,
    'text/markdown; charset=utf-8',
  );
}

async function buildSourcePack(season: number, week: number, episodeType: string): Promise<Response> {
  const leagueId = getLeagueIdForSeason(season);
  if (!leagueId) {
    return Response.json({ error: `No Sleeper league id configured for ${season}.` }, { status: 400 });
  }

  const snapshotWeek = Math.max(1, week || 1);
  const opts = { timeoutMs: 20000 };

  // Before exporting anything to the ChatGPT Writing Room, make sure every
  // published issue we can recover has been turned into durable host receipts.
  const continuityHealth = await ensurePublishedTakeLedgerForSeason(season).catch(error => ({
    publishedIssues: 0,
    alreadyProcessed: 0,
    backfilled: 0,
    unresolvedIssueIds: [],
    masonTakeCount: 0,
    westyTakeCount: 0,
    error: error instanceof Error ? error.message : String(error),
  }));

  const [
    comprehensive,
    currentWeek,
    teams,
    rosters,
    allPlayers,
    league,
    tradeValues,
    drafts,
    masonMemory,
    westyMemory,
    priorMasonMemory,
    priorWestyMemory,
    forecastRecords,
    recentPublishedIssues,
    overrides,
    masonTakeState,
    westyTakeState,
  ] = await Promise.all([
    fetchComprehensiveLeagueData(),
    fetchCurrentWeekContext(leagueId, season, snapshotWeek).catch(() => null),
    getTeamsData(leagueId, opts).catch(() => []),
    getLeagueRosters(leagueId, opts).catch(() => [] as SleeperRoster[]),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getLeague(leagueId, opts).catch(() => null),
    getTradeValues().catch(() => ({})),
    getLeagueDrafts(leagueId, opts).catch(() => []),
    loadBotMemory('entertainer', season).catch(() => null),
    loadBotMemory('analyst', season).catch(() => null),
    season > 2023 ? loadBotMemory('entertainer', season - 1).catch(() => null) : Promise.resolve(null),
    season > 2023 ? loadBotMemory('analyst', season - 1).catch(() => null) : Promise.resolve(null),
    loadForecastRecords(season).catch(() => ({ entertainer: { w: 0, l: 0 }, analyst: { w: 0, l: 0 } })),
    loadRecentPublishedIssues(season),
    loadAllTeamNarrativeOverrides().catch(() => []),
    loadPublishedTakeLedgerState('entertainer', season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null })),
    loadPublishedTakeLedgerState('analyst', season).catch(() => ({ entries: [], processedNewsletterIds: [], updatedAt: null })),
  ]);

  const valueBySleeperId = new Map(
    Object.values(tradeValues)
      .filter(value => value.sleeperId && !value.isPick)
      .map(value => [value.sleeperId, value]),
  );
  const rosterById = new Map<number, SleeperRoster>(rosters.map(roster => [roster.roster_id, roster]));

  const rosterPositions = Array.isArray(league?.roster_positions) ? league.roster_positions : [];
  const mainRosterLimit = rosterPositions.filter(position => position !== 'IR' && position !== 'TAXI').length || null;
  const requiredDefenseSlots = rosterPositions.filter(position => position === 'DEF').length;

  const rosterProfiles = teams.map(team => {
    const roster = rosterById.get(team.rosterId);
    const reserve = new Set<string>(roster?.reserve ?? []);
    const taxi = new Set<string>(roster?.taxi ?? []);
    const playerIds: string[] = roster?.players ?? team.players ?? [];

    const players = playerIds.filter(Boolean).map(id => {
      const player = allPlayers[id] as SleeperPlayer | undefined;
      const slot = reserve.has(id) ? 'ir' : taxi.has(id) ? 'taxi' : 'active';
      const value = valueBySleeperId.get(id);
      return {
        id,
        name: safePlayerName(player, id),
        position: player?.position ?? null,
        nflTeam: player?.team ?? null,
        status: player?.injury_status ?? player?.status ?? null,
        slot,
        dynastyValue: value ? {
          value: value.value,
          fantasyCalc: value.fcValue,
          ktc: value.ktcValue,
          rank: value.rank,
          trend: value.trend,
          age: value.age ?? null,
        } : null,
      };
    });

    const activePlayers = players.filter(player => player.slot === 'active');
    const irPlayers = players.filter(player => player.slot === 'ir');
    const taxiPlayers = players.filter(player => player.slot === 'taxi');
    const defenseCount = activePlayers.filter(player => player.position === 'DEF').length;
    const missingDefenses = Math.max(0, requiredDefenseSlots - defenseCount);
    const activeRosterCount = activePlayers.length;
    const overLimitNow = mainRosterLimit == null ? null : Math.max(0, activeRosterCount - mainRosterLimit);
    const cutsNeededToAddRequiredDefense = mainRosterLimit == null
      ? null
      : Math.max(0, activeRosterCount + missingDefenses - mainRosterLimit);

    return {
      team: team.teamName,
      rosterId: team.rosterId,
      record: { wins: team.wins, losses: team.losses, ties: team.ties, pointsFor: team.fpts },
      rosterCounts: {
        active: activePlayers.length,
        ir: irPlayers.length,
        taxi: taxiPlayers.length,
        total: players.length,
        mainRosterLimit,
        requiredDefenseSlots,
        currentActiveDefenses: defenseCount,
        missingDefenses,
        overLimitNow,
        cutsNeededToAddRequiredDefense,
      },
      dynastyValue: {
        allSlots: sumValues(players),
        active: sumValues(activePlayers),
        ir: sumValues(irPlayers),
        taxi: sumValues(taxiPlayers),
        allSlotsByPosition: valuesByPosition(players),
        activeByPosition: valuesByPosition(activePlayers),
        note: 'Values are current dynasty asset values, not projected 2026 scoring. IR and taxi value are shown separately so hidden value is not mistaken for roster weakness.',
      },
      players,
    };
  }).sort((a, b) => a.team.localeCompare(b.team));

  const rosterIdToTeam = new Map<number, string>(teams.map(team => [team.rosterId, team.teamName]));
  const currentDraft = drafts.find(draft => String(draft.season) === String(season)) ?? drafts[0] ?? null;
  let draftPicks: SleeperDraftPick[] = [];
  if (currentDraft?.draft_id) {
    draftPicks = await getDraftPicks(currentDraft.draft_id, opts).catch(() => [] as SleeperDraftPick[]);
  }

  const completedDraft = draftPicks.map(pick => {
    const player = pick.player_id ? allPlayers[pick.player_id] as SleeperPlayer | undefined : undefined;
    return {
      round: Number(pick.round ?? 0),
      draftSlot: Number(pick.draft_slot ?? 0),
      pickNo: Number(pick.pick_no ?? 0),
      team: rosterIdToTeam.get(Number(pick.roster_id)) ?? `Roster ${pick.roster_id}`,
      playerId: pick.player_id ?? null,
      player: pick.player_id ? safePlayerName(player, pick.player_id) : null,
      position: player?.position ?? null,
      nflTeam: player?.team ?? null,
    };
  }).sort((a, b) => a.round - b.round || a.draftSlot - b.draftSlot);

  let tradedPicks: TradedPick[] = [];
  try {
    const response = await fetch(`https://api.sleeper.app/v1/league/${leagueId}/traded_picks`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) tradedPicks = await response.json() as TradedPick[];
  } catch {
    tradedPicks = [];
  }

  const draftComplete = String((currentDraft as { status?: string } | null)?.status ?? '').toLowerCase() === 'complete';
  const firstFutureSeason = draftComplete ? season + 1 : season;
  const futurePickOwnership: Array<{
    season: number;
    round: number;
    originalTeam: string;
    currentOwner: string;
    traded: boolean;
  }> = [];

  for (let pickSeason = firstFutureSeason; pickSeason <= season + 3; pickSeason++) {
    for (let round = 1; round <= 4; round++) {
      for (const team of teams) {
        const transfer = tradedPicks.find(pick =>
          String(pick.season ?? '') === String(pickSeason) &&
          Number(pick.round ?? 0) === round &&
          Number(pick.roster_id ?? 0) === team.rosterId
        );
        const ownerId = transfer ? Number(transfer.owner_id ?? team.rosterId) : team.rosterId;
        const owner = rosterIdToTeam.get(ownerId) ?? `Roster ${ownerId}`;
        futurePickOwnership.push({
          season: pickSeason,
          round,
          originalTeam: team.teamName,
          currentOwner: owner,
          traded: ownerId !== team.rosterId,
        });
      }
    }
  }

  const episodeFormat = getExternalEpisodeFormat(episodeType);
  const exportedAt = new Date().toISOString();
  const sourcePack = {
    schemaVersion: 2,
    packType: 'east-v-west-newsletter-source-pack',
    exportedAt,
    request: {
      season,
      week: week || null,
      episodeType,
      episodeFormat,
    },
    generationDirective: {
      objective: 'Create the finished East v. West newsletter PDF using the permanent Writing Room file plus this source pack.',
      authority: 'This pack is authoritative for East v. West rosters, transactions, draft state, league history, rules, bot memory, and saved newsletter continuity as of exportedAt.',
      nflResearch: 'Research current reliable NFL information when player status, role, injury, depth chart, or team context materially affects the analysis. Do not overwrite East v. West league facts with web assumptions.',
      voice: 'Mason Reed and Trent Weston are the authors. Neutral factual material belongs only in compact tables/sidebars. Main prose should be their analysis, arguments, callbacks, disagreements, and conclusions.',
      continuity: 'Use publishedContinuity as the primary receipt system for what Mason and Westy previously argued. Preserve each host\'s individual history. When new evidence changes a take, acknowledge the prior position and explain why it strengthened, weakened, or reversed. Do not force callbacks where they are not relevant.',
      finalOutput: 'Return a polished PDF with no AI/process/meta language inside the newsletter.',
    },
    dataQualityNotes: [
      'Current dynasty values are asset values, not current-season projections.',
      'Roster value is split into active, IR, taxi, and all-slots totals. Do not call a roster weak because a major asset is parked on IR.',
      'publishedContinuity is the primary continuity record. recentPublishedIssues provide additional prose context, not the only memory of prior newsletters.',
      'Take-ledger entries preserve host attribution, source issue, subject, stance, confidence, and whether the position strengthened, weakened, reversed, resolved, or proved wrong.',
      'Any IDs in publishedContinuity.health.unresolvedIssueIds are published issues whose Mason/Westy attribution could not yet be recovered. Do not invent takes for those issues.',
      'Future pick ownership is reconstructed from the current Sleeper roster map plus traded-pick ownership for four rookie-draft rounds.',
      'For weekless episodes, snapshotWeek is set to 1 so current standings/transaction APIs still return a usable league snapshot.',
    ],
    league: {
      leagueId,
      name: league?.name ?? 'East v. West Fantasy Football',
      season: String(league?.season ?? season),
      status: league?.status ?? null,
      rosterPositions,
      scoringSettings: league?.scoring_settings ?? {},
      settings: league?.settings ?? {},
      staticContext: buildStaticLeagueContext(),
      rules: getLeagueRulesContext(),
    },
    currentLeagueSnapshot: currentWeek,
    rosters: rosterProfiles,
    draft: {
      draftId: currentDraft?.draft_id ?? null,
      status: (currentDraft as { status?: string } | null)?.status ?? null,
      completedSelections: completedDraft,
      futurePickOwnership,
      rawTradedPickRecords: tradedPicks,
    },
    historyAndTransactions: comprehensive,
    publishedContinuity: {
      health: continuityHealth,
      mason: masonTakeState.entries,
      westy: westyTakeState.entries,
      processedNewsletterIds: {
        mason: masonTakeState.processedNewsletterIds,
        westy: westyTakeState.processedNewsletterIds,
      },
      instructions: [
        'These entries are receipts, not immutable opinions. New evidence may strengthen, weaken, or reverse a take.',
        'Keep Mason and Westy separate. Never transfer one host\'s prior position to the other.',
        'Prefer the most recent relevant entry, but use older entries when they establish a meaningful through-line, prediction receipt, or reversal.',
        'A callback should identify the prior position accurately and then connect it to the current evidence.',
      ],
    },
    botContinuity: {
      currentSeason: { mason: masonMemory, westy: westyMemory },
      priorSeason: { mason: priorMasonMemory, westy: priorWestyMemory },
      forecastRecords,
      teamNarrativeCards: mergeTeamCards(overrides),
      recentPublishedIssues,
    },
  };

  const suffix = week > 0 ? `-week-${week}` : '';
  return downloadResponse(
    JSON.stringify(sourcePack, null, 2),
    `east-v-west-source-pack-${season}-${episodeType}${suffix}.json`,
    'application/json; charset=utf-8',
  );
}

export async function GET(req: NextRequest) {
  if (!isAdmin(req)) return Response.json({ error: 'forbidden' }, { status: 403 });

  const kind = (req.nextUrl.searchParams.get('kind') || 'source-pack') as ExportKind;
  const seasonRaw = Number(req.nextUrl.searchParams.get('season') || new Date().getFullYear());
  const season = Number.isFinite(seasonRaw) ? Math.trunc(seasonRaw) : new Date().getFullYear();
  const weekRaw = Number(req.nextUrl.searchParams.get('week') || 0);
  const week = Number.isFinite(weekRaw) ? Math.max(0, Math.trunc(weekRaw)) : 0;
  const episodeType = (req.nextUrl.searchParams.get('episodeType') || 'regular').trim();

  if (!['writing-room', 'source-pack'].includes(kind)) {
    return Response.json({ error: 'kind must be writing-room or source-pack' }, { status: 400 });
  }

  try {
    if (kind === 'writing-room') return await buildWritingRoom(season);
    return await buildSourcePack(season, week, episodeType);
  } catch (error) {
    console.error('[newsletter/external-export]', error);
    return Response.json({
      error: 'export_failed',
      details: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
