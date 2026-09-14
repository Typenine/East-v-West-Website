import * as core from './compose-step-core';
export * from './compose-step-core';

import type { StepInput, StepResult, ValidationResult } from './compose-step-core';
import type { Newsletter, RecapItem, ForecastData } from './types';
import { generateSection } from './llm/groq';
import { getLeagueIdForSeason } from '@/lib/constants/league';
import {
  getAllPlayersCached,
  getLeagueRosters,
  getLeagueTransactionsAllWeeks,
  getRosterIdToTeamNameMap,
  getTeamsData,
  type SleeperPlayer,
  type SleeperTransaction,
} from '@/lib/utils/sleeper-api';
import {
  listNewslettersMeta,
  loadNewsletterById,
} from '@/server/db/newsletter-queries';
import { getDb } from '@/server/db/client';
import { taxiSquadEvents, teams as dbTeams, players as dbPlayers } from '@/server/db/schema';
import { eq, gt } from 'drizzle-orm';
import { buildReceiptDesk } from './receipt-desk';
import {
  WEEKLY_PLAYOFF_SPOTS,
  WEEKLY_FIRST_ROUND_BYES,
  type WeeklyTransactionsSection,
  type WeeklyTransactionItem,
  type IndependentPowerRankingsSection,
  type IndependentRankingItem,
  type LeaguePulseSection,
  type StockWatchSection,
  type StockWatchItem,
  type ReceiptDeskSection,
} from './weekly-recap-types';

const REGULAR_BASE_STEPS = new Set(['Intro', 'FinalWord', 'PowerRankings', 'Forecast', 'ClancyInsert']);

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function toMillis(value: number | null | undefined): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1_000_000_000_000 ? n * 1000 : n;
}

function isoFromMillis(value: number): string {
  return new Date(value).toISOString();
}

function parseJsonArray<T>(raw: string): T[] {
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseJsonObject(raw: string): Record<string, string> {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')) as Record<string, string>;
  } catch {
    return {};
  }
}

async function latestPublishedIssueMeta(season: number) {
  const rows = await listNewslettersMeta(season).catch(() => []);
  return rows
    .filter(row => row.status === 'published')
    .sort((a, b) => String(b.publishedAt ?? b.generatedAt).localeCompare(String(a.publishedAt ?? a.generatedAt)))[0] ?? null;
}

function playerName(players: Record<string, SleeperPlayer>, id: string): string {
  const p = players[id];
  if (!p) return id;
  return p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id;
}

function currentSlotByPlayer(rosters: Awaited<ReturnType<typeof getLeagueRosters>>): Map<string, 'IR' | 'taxi'> {
  const slots = new Map<string, 'IR' | 'taxi'>();
  for (const roster of rosters) {
    for (const id of roster.reserve ?? []) slots.set(id, 'IR');
    for (const id of roster.taxi ?? []) slots.set(id, 'taxi');
  }
  return slots;
}

function buildRosterSlotSnapshot(
  rosters: Awaited<ReturnType<typeof getLeagueRosters>>,
  teams: Map<number, string>,
  players: Record<string, SleeperPlayer>,
): NonNullable<WeeklyTransactionsSection['slotSnapshot']> {
  const snapshot: NonNullable<WeeklyTransactionsSection['slotSnapshot']> = {};
  for (const roster of rosters) {
    const team = teams.get(roster.roster_id) ?? `Roster ${roster.roster_id}`;
    const ir = new Set(roster.reserve ?? []);
    const taxi = new Set(roster.taxi ?? []);
    for (const id of roster.players ?? []) {
      snapshot[id] = {
        team,
        player: playerName(players, id),
        slot: ir.has(id) ? 'IR' : taxi.has(id) ? 'taxi' : 'active',
      };
    }
  }
  return snapshot;
}

function buildSleeperTransactionItem(
  tx: SleeperTransaction,
  teams: Map<number, string>,
  players: Record<string, SleeperPlayer>,
  slots: Map<string, 'IR' | 'taxi'>,
): WeeklyTransactionItem | null {
  const timestamp = toMillis(tx.status_updated ?? (tx as SleeperTransaction & { created?: number }).created);
  if (!timestamp) return null;
  const rosterIds = tx.roster_ids ?? [];
  const parties = [...new Set(rosterIds.map(id => teams.get(id) ?? `Roster ${id}`))];
  const adds = Object.entries(tx.adds ?? {});
  const drops = Object.entries(tx.drops ?? {});
  const addedNames = adds.map(([id]) => playerName(players, id));
  const droppedNames = drops.map(([id]) => playerName(players, id));
  const statusSuffixes = adds.flatMap(([id]) => slots.has(id) ? [`${playerName(players, id)} is currently on ${slots.get(id)}`] : []);
  const bid = Number((tx.settings as { waiver_bid?: number } | undefined)?.waiver_bid ?? 0);

  if (tx.type === 'trade') {
    const byTeam = new Map<string, { gets: string[]; gives: string[] }>();
    const ensure = (team: string) => {
      const current = byTeam.get(team) ?? { gets: [], gives: [] };
      byTeam.set(team, current);
      return current;
    };
    for (const [id, rosterId] of adds) ensure(teams.get(rosterId) ?? `Roster ${rosterId}`).gets.push(playerName(players, id));
    for (const [id, rosterId] of drops) ensure(teams.get(rosterId) ?? `Roster ${rosterId}`).gives.push(playerName(players, id));
    const picks = (tx.draft_picks ?? []) as Array<{ season?: string | number; round?: number; owner_id?: number; previous_owner_id?: number }>;
    for (const pick of picks) {
      const label = `${pick.season ?? ''} Round ${pick.round ?? '?'}`.trim();
      if (pick.owner_id != null) ensure(teams.get(pick.owner_id) ?? `Roster ${pick.owner_id}`).gets.push(label);
      if (pick.previous_owner_id != null) ensure(teams.get(pick.previous_owner_id) ?? `Roster ${pick.previous_owner_id}`).gives.push(label);
    }
    const sides = [...byTeam.entries()];
    const detail = sides.map(([team, assets]) => `${team} received ${assets.gets.join(', ') || 'nothing listed'}${assets.gives.length ? `; sent ${assets.gives.join(', ')}` : ''}`).join(' | ');
    const namedParties = sides.map(([team]) => team);
    return {
      id: `sleeper:${tx.transaction_id}`,
      timestamp,
      happenedAt: isoFromMillis(timestamp),
      kind: 'trade',
      headline: `${namedParties.join(' ↔ ')} trade`,
      detail,
      teams: namedParties,
      players: [...new Set([...addedNames, ...droppedNames])],
      major: true,
    };
  }

  const receivingRoster = Number(adds[0]?.[1] ?? rosterIds[0] ?? 0);
  const team = teams.get(receivingRoster) ?? parties[0] ?? 'Unknown team';
  const action = tx.type === 'waiver' ? 'waiver claim' : 'free-agent move';
  const detailParts = [
    addedNames.length ? `added ${addedNames.join(', ')}` : '',
    droppedNames.length ? `dropped ${droppedNames.join(', ')}` : '',
    bid > 0 ? `spent ${bid} FAAB` : '',
    ...statusSuffixes,
  ].filter(Boolean);
  return {
    id: `sleeper:${tx.transaction_id}`,
    timestamp,
    happenedAt: isoFromMillis(timestamp),
    kind: tx.type,
    headline: `${team}: ${action}`,
    detail: detailParts.join('; ') || action,
    teams: [team],
    players: [...new Set([...addedNames, ...droppedNames])],
    major: tx.type === 'waiver' ? bid >= 10 || addedNames.length + droppedNames.length >= 3 : false,
  };
}

async function buildWeeklyTransactions(input: StepInput): Promise<WeeklyTransactionsSection> {
  const prior = await latestPublishedIssueMeta(input.season);
  const fallback = Date.UTC(input.season, 0, 1);
  const cutoffMs = prior ? Date.parse(prior.publishedAt ?? prior.generatedAt) : fallback;
  const cutoff = new Date(Number.isFinite(cutoffMs) ? cutoffMs : fallback).toISOString();
  const leagueId = getLeagueIdForSeason(input.season);
  if (!leagueId) {
    return { cutoff, cutoffIssueId: prior?.id, cutoffIssueTitle: prior?.title, items: [], note: 'No league id was available for transaction auditing.' };
  }

  const [transactions, players, teamMap, rosters] = await Promise.all([
    getLeagueTransactionsAllWeeks(leagueId, { timeoutMs: 20000 }).catch(() => [] as SleeperTransaction[]),
    getAllPlayersCached().catch(() => ({} as Record<string, SleeperPlayer>)),
    getRosterIdToTeamNameMap(leagueId).catch(() => new Map<number, string>()),
    getLeagueRosters(leagueId).catch(() => []),
  ]);
  const slots = currentSlotByPlayer(rosters);
  const slotSnapshot = buildRosterSlotSnapshot(rosters, teamMap, players);
  const items = transactions
    .filter(tx => !tx.status || tx.status === 'complete')
    .filter(tx => toMillis(tx.status_updated ?? (tx as SleeperTransaction & { created?: number }).created) > cutoffMs)
    .map(tx => buildSleeperTransactionItem(tx, teamMap, players, slots))
    .filter((item): item is WeeklyTransactionItem => Boolean(item));

  // Compare the current roster slot state to the previous published Weekly Recap snapshot.
  // Sleeper does not expose a historical IR/taxi transaction feed, so this durable snapshot
  // makes pure IR/taxi moves auditable from one published issue to the next.
  if (prior) {
    const previousIssue = await loadNewsletterById(prior.id).catch(() => null);
    const previousTx = previousIssue?.newsletter.sections.find(section => section.type === 'WeeklyTransactions')?.data as WeeklyTransactionsSection | undefined;
    const previousSnapshot = previousTx?.slotSnapshot ?? {};
    const detectedAt = Date.now();
    for (const [id, current] of Object.entries(slotSnapshot)) {
      const before = previousSnapshot[id];
      if (!before || before.team !== current.team || before.slot === current.slot) continue;
      if (before.slot !== 'IR' && current.slot !== 'IR' && before.slot !== 'taxi' && current.slot !== 'taxi') continue;
      const alreadyCovered = items.some(item => item.players.some(name => normalize(name) === normalize(current.player)) && item.teams.includes(current.team));
      if (alreadyCovered && (current.slot === 'IR' || before.slot === 'IR')) continue;
      const label = current.slot === 'IR' ? 'moved to IR' : before.slot === 'IR' ? 'activated from IR' : current.slot === 'taxi' ? 'moved to taxi' : 'promoted from taxi';
      items.push({
        id: `slot:${id}:${before.slot}:${current.slot}`,
        timestamp: detectedAt,
        happenedAt: new Date(detectedAt).toISOString(),
        kind: current.slot === 'IR' || before.slot === 'IR' ? 'ir' : 'taxi',
        headline: `${current.team}: ${label}`,
        detail: `${current.team} ${label} ${current.player}.`,
        teams: [current.team],
        players: [current.player],
        major: current.slot === 'active' && before.slot !== 'active',
      });
    }
  }

  try {
    const db = getDb();
    const taxiRows = await db
      .select({
        id: taxiSquadEvents.id,
        eventAt: taxiSquadEvents.eventAt,
        eventType: taxiSquadEvents.eventType,
        teamName: dbTeams.name,
        playerName: dbPlayers.name,
      })
      .from(taxiSquadEvents)
      .leftJoin(dbTeams, eq(taxiSquadEvents.teamId, dbTeams.id))
      .leftJoin(dbPlayers, eq(taxiSquadEvents.playerId, dbPlayers.id))
      .where(gt(taxiSquadEvents.eventAt, new Date(cutoff)));
    for (const row of taxiRows) {
      const timestamp = row.eventAt.getTime();
      const team = row.teamName ?? 'Unknown team';
      const player = row.playerName ?? 'Unknown player';
      const verb = row.eventType === 'promote' ? 'promoted from taxi' : row.eventType === 'demote' ? 'moved to taxi' : row.eventType === 'add' ? 'added to taxi' : 'removed from taxi';
      items.push({
        id: `taxi:${row.id}`,
        timestamp,
        happenedAt: row.eventAt.toISOString(),
        kind: 'taxi',
        headline: `${team}: ${verb}`,
        detail: `${team} ${verb} ${player}.`,
        teams: [team],
        players: [player],
        major: row.eventType === 'promote',
      });
    }
  } catch {
    // Taxi events are supplemental. Sleeper transactions still provide the primary audit.
  }

  items.sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id));
  const major = items.filter(item => item.major);
  if (major.length) {
    const source = JSON.stringify(major.map(item => ({ id: item.id, happenedAt: item.happenedAt, headline: item.headline, detail: item.detail })), null, 2);
    const [masonRaw, westyRaw] = await Promise.all([
      generateSection({
        persona: 'entertainer',
        sectionType: 'Weekly Transactions',
        context: `VERIFIED TRANSACTIONS SINCE ${cutoff}:\n${source}`,
        constraints: 'Return ONLY a JSON object keyed by transaction id. Give each transaction that materially changes a team 2-4 sentences of Mason analysis. Discuss what the move changes, not just the asset list. Do not invent transaction facts.',
        maxTokens: 1200,
      }).catch(() => '{}'),
      generateSection({
        persona: 'analyst',
        sectionType: 'Weekly Transactions',
        context: `VERIFIED TRANSACTIONS SINCE ${cutoff}:\n${source}`,
        constraints: 'Return ONLY a JSON object keyed by transaction id. Give each transaction that materially changes a team 2-4 sentences of Westy analysis focused on roster construction, repeatable value, and cost. Do not invent transaction facts.',
        maxTokens: 1200,
      }).catch(() => '{}'),
    ]);
    const mason = parseJsonObject(masonRaw);
    const westy = parseJsonObject(westyRaw);
    for (const item of items) {
      if (mason[item.id]) item.mason = mason[item.id];
      if (westy[item.id]) item.westy = westy[item.id];
    }
  }

  return {
    cutoff,
    cutoffIssueId: prior?.id,
    cutoffIssueTitle: prior?.title,
    items,
    slotSnapshot,
    note: items.length ? undefined : 'No meaningful roster transactions were recorded after the previous published issue cutoff.',
  };
}

async function generateWeeklyRecap(input: StepInput, index: number): Promise<RecapItem | null> {
  const pair = input.derived.matchup_pairs?.[index];
  if (!pair) return null;
  const teams = [pair.winner.name, pair.loser.name];
  const priorMason = teams.map(team => input.memEntertainer.teams[team]?.lastAssessment?.text).filter(Boolean).join(' | ');
  const priorWesty = teams.map(team => input.memAnalyst.teams[team]?.lastAssessment?.text).filter(Boolean).join(' | ');
  const evidence = JSON.stringify({
    matchupId: pair.matchup_id,
    winner: pair.winner,
    loser: pair.loser,
    margin: pair.margin,
    priorMason: priorMason || null,
    priorWesty: priorWesty || null,
  }, null, 2);

  const mason = await generateSection({
    persona: 'entertainer',
    sectionType: 'Matchup Review',
    context: `WEEK ${input.week} VERIFIED MATCHUP:\n${evidence}\n\nCURRENT LEAGUE CONTEXT:\n${input.enhancedContext.slice(-10000)}`,
    constraints: 'Write 150-220 words. Give this matchup substantive treatment comparable to every other completed game. Do NOT frame it as Game of the Week. Do not merely retell the score. Explain what changed in our understanding of both teams, what looks repeatable versus variance, lineup/player developments, implications for prior/preseason takes, and explicitly say if your opinion changed when the evidence supports it.',
    maxTokens: 850,
  }).catch(() => `${pair.winner.name} won, but the useful question is whether the underlying scoring and lineup signals repeat. One result is evidence, not a verdict.`);

  const westy = await generateSection({
    persona: 'analyst',
    sectionType: 'Matchup Review',
    context: `WEEK ${input.week} VERIFIED MATCHUP:\n${evidence}\n\nMASON JUST WROTE:\n${mason}\n\nCURRENT LEAGUE CONTEXT:\n${input.enhancedContext.slice(-10000)}`,
    constraints: 'Write 150-220 words. Respond to Mason’s actual claims rather than restarting the recap. Give this game substantive treatment comparable to every other completed matchup. Separate repeatable evidence from one-week variance, address lineup/player developments and prior takes, and identify any opinion change. Do not simply recap the box score and do not call it Game of the Week.',
    maxTokens: 850,
  }).catch(() => `The result matters, but the repeatable inputs matter more. I want to see whether the usage and scoring profile hold before treating this as a permanent shift.`);

  return {
    matchup_id: pair.matchup_id,
    bot1: mason,
    bot2: westy,
    winner: pair.winner.name,
    loser: pair.loser.name,
    winner_score: pair.winner.points,
    loser_score: pair.loser.points,
    winner_top_players: pair.winner.topPlayers,
    loser_top_players: pair.loser.topPlayers,
    bracketLabel: pair.bracketLabel,
    dialogue: [
      { speaker: 'entertainer', text: mason },
      { speaker: 'analyst', text: westy },
    ],
  };
}

type RawRanking = { rank?: number; team?: string; blurb?: string };

async function loadPreviousIndependentRankings(season: number) {
  const metas = (await listNewslettersMeta(season).catch(() => []))
    .filter(item => item.status === 'published')
    .sort((a, b) => String(b.publishedAt ?? b.generatedAt).localeCompare(String(a.publishedAt ?? a.generatedAt)));
  for (const meta of metas.slice(0, 8)) {
    const loaded = await loadNewsletterById(meta.id).catch(() => null);
    const section = loaded?.newsletter.sections.find(s => s.type === 'PowerRankings');
    if (!section) continue;
    const data = section.data as Partial<IndependentPowerRankingsSection> & { rankings?: Array<{ rank: number; team: string }> };
    const mason = data.masonRankings?.map(r => ({ team: r.team, rank: r.rank })) ?? data.rankings?.map(r => ({ team: r.team, rank: r.rank })) ?? [];
    const westy = data.westyRankings?.map(r => ({ team: r.team, rank: r.rank })) ?? [];
    if (mason.length || westy.length) return { meta, mason, westy };
  }
  return null;
}

function normalizeRankingList(raw: RawRanking[], teamRows: Array<{ teamName: string; wins: number; losses: number; ties: number; fpts: number }>): Array<{ rank: number; team: string; blurb: string }> {
  const canonical = new Map(teamRows.map(team => [normalize(team.teamName), team.teamName]));
  const used = new Set<string>();
  const clean: Array<{ rank: number; team: string; blurb: string }> = [];
  for (const item of raw) {
    const team = canonical.get(normalize(String(item.team ?? '')));
    if (!team || used.has(team)) continue;
    const rank = Number(item.rank);
    if (!Number.isInteger(rank) || rank < 1 || rank > teamRows.length) continue;
    used.add(team);
    clean.push({ rank, team, blurb: String(item.blurb ?? '').trim() });
  }
  clean.sort((a, b) => a.rank - b.rank);
  if (clean.length === teamRows.length && new Set(clean.map(r => r.rank)).size === teamRows.length) return clean;
  return [...teamRows]
    .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
    .map((team, index) => ({ rank: index + 1, team: team.teamName, blurb: `${team.teamName} lands here on the current balance of record, scoring, and roster evidence.` }));
}

async function generateIndependentPowerRankings(input: StepInput): Promise<IndependentPowerRankingsSection> {
  const leagueId = getLeagueIdForSeason(input.season);
  const teams = leagueId ? await getTeamsData(leagueId).catch(() => []) : [];
  const rows = teams.map(team => ({ teamName: team.teamName, wins: team.wins, losses: team.losses, ties: team.ties, fpts: team.fpts }));
  const neutral = JSON.stringify(rows, null, 2);
  const sharedContext = `WEEK ${input.week} NEUTRAL TEAM DATA:\n${neutral}\n\nMATCHUP EVIDENCE:\n${JSON.stringify(input.derived.matchup_pairs ?? [], null, 2)}\n\nCURRENT VERIFIED CONTEXT:\n${input.enhancedContext.slice(-14000)}`;
  const [masonRaw, westyRaw, masonIntro, westyIntro] = await Promise.all([
    generateSection({
      persona: 'entertainer', sectionType: 'Power Rankings', context: sharedContext,
      constraints: `Return ONLY a JSON array of exactly ${rows.length || 12} objects: {"rank":1,"team":"exact team name","blurb":"2-4 sentences"}. Rank every team exactly once. This is YOUR independent list. Explain why each team occupies that slot now; do not repeat the matchup recap. Weight current scoring strength, lineup quality, sustainability, and ceiling.`, maxTokens: 3200,
    }).catch(() => '[]'),
    generateSection({
      persona: 'analyst', sectionType: 'Power Rankings', context: sharedContext,
      constraints: `Return ONLY a JSON array of exactly ${rows.length || 12} objects: {"rank":1,"team":"exact team name","blurb":"2-4 sentences"}. Rank every team exactly once. This is YOUR independent list and you cannot see Mason's ranking. Explain why each team occupies that slot now; do not repeat the matchup recap. Weight repeatable evidence, roster depth, scoring profile, and uncertainty.`, maxTokens: 3200,
    }).catch(() => '[]'),
    generateSection({ persona: 'entertainer', sectionType: 'Power Rankings Intro', context: sharedContext, constraints: '2-3 sentences setting up your independent ranking philosophy this week. Do not preview every slot.', maxTokens: 300 }).catch(() => ''),
    generateSection({ persona: 'analyst', sectionType: 'Power Rankings Intro', context: sharedContext, constraints: '2-3 sentences setting up your independent ranking philosophy this week. Do not preview every slot.', maxTokens: 300 }).catch(() => ''),
  ]);
  const masonList = normalizeRankingList(parseJsonArray<RawRanking>(masonRaw), rows);
  const westyList = normalizeRankingList(parseJsonArray<RawRanking>(westyRaw), rows);
  const previous = await loadPreviousIndependentRankings(input.season);
  const priorMason = new Map((previous?.mason ?? []).map(r => [normalize(r.team), r.rank]));
  const priorWesty = new Map((previous?.westy ?? []).map(r => [normalize(r.team), r.rank]));
  const byTeam = new Map(rows.map(row => [normalize(row.teamName), row]));

  const enrich = (list: typeof masonList, prior: Map<string, number>): IndependentRankingItem[] => list.map(item => {
    const team = byTeam.get(normalize(item.team));
    const previousRank = prior.get(normalize(item.team));
    const delta = previousRank == null ? 0 : previousRank - item.rank;
    return {
      rank: item.rank,
      team: item.team,
      record: team ? `${team.wins}-${team.losses}${team.ties ? `-${team.ties}` : ''}` : '',
      pointsFor: team?.fpts ?? 0,
      previousRank,
      movement: previousRank == null ? 'new' : delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
      movementAmount: Math.abs(delta),
      blurb: item.blurb,
    };
  });
  const masonRankings = enrich(masonList, priorMason);
  const westyRankings = enrich(westyList, priorWesty);
  const westyByTeam = new Map(westyRankings.map(item => [normalize(item.team), item]));
  const rankings = masonRankings.map(item => ({
    rank: item.rank,
    team: item.team,
    record: item.record,
    pointsFor: item.pointsFor,
    trend: item.movement === 'up' ? 'up' as const : item.movement === 'down' ? 'down' as const : 'steady' as const,
    trendAmount: item.movementAmount,
    bot1_blurb: item.blurb,
    bot2_blurb: westyByTeam.get(normalize(item.team))?.blurb ?? '',
  }));
  return {
    rankings,
    masonRankings,
    westyRankings,
    bot1_intro: masonIntro,
    bot2_intro: westyIntro,
    previousIssueId: previous?.meta.id,
    previousIssueTitle: previous?.meta.title,
  };
}

async function generateLeaguePulse(input: StepInput): Promise<LeaguePulseSection> {
  const leagueId = getLeagueIdForSeason(input.season);
  const teams = leagueId ? await getTeamsData(leagueId).catch(() => []) : [];
  const rows = [...teams]
    .sort((a, b) => b.wins - a.wins || b.fpts - a.fpts)
    .map((team, index) => ({ rank: index + 1, team: team.teamName, wins: team.wins, losses: team.losses, ties: team.ties, pointsFor: team.fpts }));
  const showPlayoffRace = input.week >= 9;
  const lastIn = rows[WEEKLY_PLAYOFF_SPOTS - 1];
  const firstOut = rows[WEEKLY_PLAYOFF_SPOTS];
  const raceNote = showPlayoffRace && lastIn && firstOut
    ? `Seven teams qualify. ${lastIn.team} currently holds the #7 spot; ${firstOut.team} is first out. The #1 seed receives the first-round bye.`
    : undefined;
  return { rows, playoffSpots: WEEKLY_PLAYOFF_SPOTS, firstRoundByes: WEEKLY_FIRST_ROUND_BYES, showPlayoffRace, raceNote };
}

async function generateStockWatch(input: StepInput): Promise<StockWatchSection> {
  const evidence = `MATCHUPS:\n${JSON.stringify(input.derived.matchup_pairs ?? [], null, 2)}\n\nCURRENT CONTEXT:\n${input.enhancedContext.slice(-16000)}`;
  const selectorRaw = await generateSection({
    persona: 'analyst',
    sectionType: 'Stock Watch Selection',
    context: evidence,
    constraints: 'Return ONLY a JSON array with 0-5 items. Include an item only when this week produced genuine new evidence that changes the evaluation. Shape: {"subject":"exact player/team/position group/narrative","category":"player|team|position_group|narrative","direction":"up|down","evidence":"specific verified reason"}. Do not force a quota. Do not include a subject unless it appears in the supplied context.',
    maxTokens: 1000,
  }).catch(() => '[]');
  const contextNorm = normalize(evidence);
  const selected = parseJsonArray<Partial<StockWatchItem>>(selectorRaw)
    .filter(item => item.subject && item.evidence && (item.direction === 'up' || item.direction === 'down'))
    .filter(item => contextNorm.includes(normalize(String(item.subject))))
    .slice(0, 5)
    .map(item => ({
      subject: String(item.subject),
      category: (['player', 'team', 'position_group', 'narrative'].includes(String(item.category)) ? item.category : 'narrative') as StockWatchItem['category'],
      direction: item.direction as 'up' | 'down',
      evidence: String(item.evidence),
    }));
  if (!selected.length) return { items: [], note: 'No evaluation changed enough this week to force a stock call.' };
  const list = JSON.stringify(selected, null, 2);
  const [masonRaw, westyRaw] = await Promise.all([
    generateSection({ persona: 'entertainer', sectionType: 'Stock Watch', context: list, constraints: 'Return ONLY a JSON object keyed by exact subject. Give each subject 1-2 Mason sentences explaining the stock move from the listed evidence. Do not add subjects.', maxTokens: 800 }).catch(() => '{}'),
    generateSection({ persona: 'analyst', sectionType: 'Stock Watch', context: list, constraints: 'Return ONLY a JSON object keyed by exact subject. Give each subject 1-2 Westy sentences explaining whether the evidence is durable. Do not add subjects.', maxTokens: 800 }).catch(() => '{}'),
  ]);
  const mason = parseJsonObject(masonRaw);
  const westy = parseJsonObject(westyRaw);
  return { items: selected.map(item => ({ ...item, mason: mason[item.subject], westy: westy[item.subject] })) };
}

async function enhanceForecast(input: StepInput): Promise<StepResult> {
  const result = await core.generateNewsletterSection({ ...input, sectionName: 'Forecast' });
  if (!result.ok) return result;
  const data = result.data as { forecast?: ForecastData; pendingPicks?: unknown };
  if (!data.forecast?.picks?.length) return result;
  const pickContext = JSON.stringify(data.forecast.picks.map(p => ({ matchup_id: p.matchup_id, team1: p.team1, team2: p.team2, masonPick: p.bot1_pick, westyPick: p.bot2_pick, masonReason: p.note_bot1, westyReason: p.note_bot2 })), null, 2);
  const questionsRaw = await generateSection({
    persona: 'analyst',
    sectionType: 'Upcoming Matchup Questions',
    context: `UPCOMING WEEK ${input.week + 1} MATCHUPS AND PICKS:\n${pickContext}\n\nCURRENT CONTEXT:\n${input.enhancedContext.slice(-12000)}`,
    constraints: 'Return ONLY a JSON object keyed by matchup_id. Each value is one concise key question that decides what matters in that game. Cover every matchup. Do not create a Game of the Week or elevate one matchup above the others.',
    maxTokens: 700,
  }).catch(() => '{}');
  const questions = parseJsonObject(questionsRaw);
  const picks = data.forecast.picks.map(pick => ({ ...pick, key_question: questions[String(pick.matchup_id)] ?? 'Which team can turn its current roster strengths into repeatable scoring this week?' }));
  const forecast = {
    ...data.forecast,
    picks,
    bot1_matchup_of_the_week: undefined,
    bot2_matchup_of_the_week: undefined,
    bot1_bold_player: undefined,
    bot2_bold_player: undefined,
  } as ForecastData;
  return { ok: true, sectionName: input.sectionName, data: { ...data, forecast } };
}

export function getGenerationSteps(
  episodeType: string,
  matchupCount: number,
  tradeCount: number,
  draftTeamsOrCount?: string[] | number,
): string[] {
  if (episodeType !== 'regular') return core.getGenerationSteps(episodeType, matchupCount, tradeCount, draftTeamsOrCount);
  const steps = ['Intro', 'Transactions'];
  for (let i = 0; i < matchupCount; i++) steps.push(`Recap_${i}`);
  steps.push('PowerRankings', 'LeaguePulse', 'ClancyInsert', 'StockWatch', 'ReceiptDesk', 'Forecast', 'FinalWord', 'SocialSummary');
  return steps;
}

export function getRequiredSteps(
  episodeType: string,
  matchupCount: number,
  tradeCount: number,
  draftTeamsOrCount?: string[] | number,
): string[] {
  if (episodeType !== 'regular') return core.getRequiredSteps(episodeType, matchupCount, tradeCount, draftTeamsOrCount);
  const required = ['Intro', 'Transactions', 'PowerRankings', 'LeaguePulse', 'Forecast', 'FinalWord'];
  for (let i = 0; i < matchupCount; i++) required.push(`Recap_${i}`);
  return required;
}

export async function generateNewsletterSection(input: StepInput): Promise<StepResult> {
  if (input.episodeType !== 'regular') return core.generateNewsletterSection(input);
  if (input.sectionName === 'Transactions') return { ok: true, sectionName: input.sectionName, data: await buildWeeklyTransactions(input) };
  if (input.sectionName === 'PowerRankings') return { ok: true, sectionName: input.sectionName, data: await generateIndependentPowerRankings(input) };
  if (input.sectionName === 'LeaguePulse') return { ok: true, sectionName: input.sectionName, data: await generateLeaguePulse(input) };
  if (input.sectionName === 'StockWatch') return { ok: true, sectionName: input.sectionName, data: await generateStockWatch(input) };
  if (input.sectionName === 'ReceiptDesk') return { ok: true, sectionName: input.sectionName, data: await buildReceiptDesk(input) };
  if (input.sectionName === 'Forecast') return enhanceForecast(input);
  const recap = input.sectionName.match(/^Recap_(\d+)$/);
  if (recap) return { ok: true, sectionName: input.sectionName, data: await generateWeeklyRecap(input, Number(recap[1])) };
  if (REGULAR_BASE_STEPS.has(input.sectionName) || input.sectionName === 'SocialSummary') return core.generateNewsletterSection(input);
  return core.generateNewsletterSection(input);
}

export function assembleNewsletterFromSections(
  leagueName: string,
  week: number,
  season: number,
  episodeType: string,
  steps: string[],
  sectionData: Record<string, unknown>,
): Newsletter {
  const newsletter = core.assembleNewsletterFromSections(leagueName, week, season, episodeType, steps, sectionData);
  if (episodeType !== 'regular') return newsletter;
  const base = newsletter.sections as Array<{ type: string; data: unknown }>;
  const find = (type: string) => base.find(section => section.type === type);
  const recaps = find('MatchupRecaps');
  const power = find('PowerRankings');
  const forecast = find('Forecast');
  const intro = find('Intro');
  const final = find('FinalWord');
  const archival = find('ClancyInsert');
  const custom: Array<{ type: string; data: unknown }> = [];
  if (intro) custom.push(intro);
  if (sectionData.Transactions) custom.push({ type: 'WeeklyTransactions', data: sectionData.Transactions });
  if (recaps) custom.push(recaps);
  if (power) custom.push(power);
  if (sectionData.LeaguePulse) custom.push({ type: 'LeaguePulse', data: sectionData.LeaguePulse });
  if (archival) custom.push(archival); // rare archive cameo remains distinct and separately frequency-gated
  if (sectionData.StockWatch) custom.push({ type: 'StockWatch', data: sectionData.StockWatch });
  const receipts = sectionData.ReceiptDesk as ReceiptDeskSection | undefined;
  if (receipts?.receipts?.length) custom.push({ type: 'ReceiptDesk', data: receipts });
  if (forecast) custom.push(forecast);
  if (final) custom.push(final);
  return { ...newsletter, sections: custom as Newsletter['sections'] };
}

export function validateNewsletterSections(
  newsletter: Newsletter,
  episodeType: string,
  expectedMatchupCount: number,
  expectedTeamCount?: number,
): ValidationResult {
  const result = core.validateNewsletterSections(newsletter, episodeType, expectedMatchupCount, expectedTeamCount);
  if (episodeType !== 'regular') return result;
  const sections = newsletter.sections as Array<{ type: string; data: unknown }>;
  const types = sections.map(section => section.type);
  const missing = [...result.missing];
  const issues = [...result.issues];
  for (const required of ['WeeklyTransactions', 'MatchupRecaps', 'PowerRankings', 'LeaguePulse', 'Forecast', 'FinalWord']) {
    if (!types.includes(required)) missing.push(required);
  }
  const expectedOrder = ['Intro', 'WeeklyTransactions', 'MatchupRecaps', 'PowerRankings', 'LeaguePulse', 'StockWatch', 'ReceiptDesk', 'Forecast', 'FinalWord'];
  const visible = types.filter(type => expectedOrder.includes(type));
  const positions = visible.map(type => expectedOrder.indexOf(type));
  if (positions.some((value, index) => index > 0 && value < positions[index - 1])) issues.push('Weekly Recap sections are out of canonical order.');
  const pr = sections.find(section => section.type === 'PowerRankings')?.data as IndependentPowerRankingsSection | undefined;
  const teamCount = expectedTeamCount ?? 12;
  if (!pr?.masonRankings || pr.masonRankings.length !== teamCount) issues.push(`Mason power rankings have ${pr?.masonRankings?.length ?? 0}/${teamCount} teams.`);
  if (!pr?.westyRankings || pr.westyRankings.length !== teamCount) issues.push(`Westy power rankings have ${pr?.westyRankings?.length ?? 0}/${teamCount} teams.`);
  const forecast = sections.find(section => section.type === 'Forecast')?.data as ForecastData | undefined;
  if ((forecast?.picks?.length ?? 0) !== expectedMatchupCount) issues.push(`Upcoming previews have ${forecast?.picks?.length ?? 0}/${expectedMatchupCount} matchups.`);
  return { passed: result.passed && missing.length === 0 && issues.length === 0, missing: [...new Set(missing)], issues: [...new Set(issues)] };
}
