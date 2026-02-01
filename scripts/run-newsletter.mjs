#!/usr/bin/env node
/**
 * Automated Newsletter Runner (no HTTP)
 * - Respects schedule gating and strict publish gating
 * - Idempotent: checks DB for existing newsletter before writing
 * - Free-tier safe by default (NEWSLETTER_MAX_CONCURRENCY=1)
 */

import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';

// Utilities
function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.includes('=') ? a.slice(2).split('=') : [a.slice(2), 'true'];
      args.set(k, v);
    }
  }
  return {
    season: args.get('season') || null,
    week: args.get('week') ? parseInt(args.get('week'), 10) : null,
    episodeType: args.get('episodeType') || null,
    force: args.get('force') === 'true' || args.has('force'),
    preview: args.get('preview') === 'true' || args.has('preview'),
  };
}

function toET(date = new Date()) {
  try {
    // America/New_York (ET)
    return new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  } catch {
    return new Date(date);
  }
}

function startOfDayET(date = new Date()) {
  const d = toET(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetweenET(a, b) {
  const da = startOfDayET(a);
  const db = startOfDayET(b);
  return Math.round((da - db) / (24 * 60 * 60 * 1000));
}

// Episode week mapping to keep DB idempotency for offseason episodes
const EPISODE_WEEK_STORAGE = {
  preseason: 900,
  pre_draft: 901,
  post_draft: 902,
};

// Sleeper helpers
const SLEEPER_API = 'https://api.sleeper.app/v1';
async function getSleeperState() {
  const res = await fetch(`${SLEEPER_API}/state/nfl`);
  if (!res.ok) throw new Error(`Sleeper state error: ${res.status}`);
  return res.json();
}
async function getLeague(leagueId) {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}`);
  if (!res.ok) throw new Error(`Sleeper league error: ${res.status}`);
  return res.json();
}
async function getUsers(leagueId) {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}/users`);
  if (!res.ok) throw new Error(`Sleeper users error: ${res.status}`);
  return res.json();
}
async function getRosters(leagueId) {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}/rosters`);
  if (!res.ok) throw new Error(`Sleeper rosters error: ${res.status}`);
  return res.json();
}
async function getMatchups(leagueId, week) {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}/matchups/${week}`);
  if (!res.ok) throw new Error(`Sleeper matchups error: ${res.status}`);
  return res.json();
}
async function getTransactions(leagueId, week) {
  const res = await fetch(`${SLEEPER_API}/league/${leagueId}/transactions/${week}`);
  if (!res.ok) throw new Error(`Sleeper transactions error: ${res.status}`);
  return res.json();
}

// Dynamic imports to use TS code via tsx
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = pathResolve(__dirname, '..');

async function importNewsletter() {
  return import(pathResolve(projectRoot, 'src', 'lib', 'newsletter', 'index.ts'));
}
async function importDb() {
  return import(pathResolve(projectRoot, 'src', 'server', 'db', 'newsletter-queries.ts'));
}

// Scheduling logic
async function resolveNewsletterRunTarget({ now, force, seasonArg, weekArg, episodeTypeArg }) {
  const nET = toET(now);

  // If force, respect inputs or compute from Sleeper state
  if (force) {
    const state = await getSleeperState();
    const season = seasonArg ? parseInt(seasonArg, 10) : parseInt(state.season, 10);
    // const inSeason = state.season_type === 'regular';
    if (episodeTypeArg && episodeTypeArg !== 'regular') {
      const storageWeek = EPISODE_WEEK_STORAGE[episodeTypeArg] ?? 900;
      return { season, week: weekArg ?? 0, episodeType: episodeTypeArg, storageWeek, reason: 'force' };
    }
    return { season, week: weekArg ?? state.week, episodeType: 'regular', storageWeek: weekArg ?? state.week, reason: 'force' };
  }

  // Not forced: use gating
  const state = await getSleeperState();
  const season = seasonArg ? parseInt(seasonArg, 10) : parseInt(state.season, 10);
  const inSeason = state.season_type === 'regular';

  // Offseason windows (pre_draft, post_draft, preseason)
  const { IMPORTANT_DATES } = await import(pathResolve(projectRoot, 'src', 'lib', 'constants', 'league.ts'));
  const draftDate = process.env.EVW_DRAFT_DATE_ISO ? new Date(process.env.EVW_DRAFT_DATE_ISO) : IMPORTANT_DATES.NEXT_DRAFT;
  const week1Start = process.env.EVW_SEASON_START_ISO ? new Date(process.env.EVW_SEASON_START_ISO) : IMPORTANT_DATES.NFL_WEEK_1_START;

  // Pre-draft: exactly 7 days before draft
  const daysToDraft = daysBetweenET(draftDate, nET) * -1; // positive when before
  if (daysToDraft === 7) {
    return { season, week: 0, episodeType: 'pre_draft', storageWeek: EPISODE_WEEK_STORAGE.pre_draft, reason: 'pre_draft window' };
  }

  // Post-draft: exactly 7 days after draft
  const daysSinceDraft = daysBetweenET(nET, draftDate);
  if (daysSinceDraft === 7) {
    return { season, week: 0, episodeType: 'post_draft', storageWeek: EPISODE_WEEK_STORAGE.post_draft, reason: 'post_draft window' };
  }

  // Preseason: exactly 7 days before Week 1
  const daysToWeek1 = daysBetweenET(week1Start, nET) * -1;
  if (daysToWeek1 === 7) {
    return { season, week: 0, episodeType: 'preseason', storageWeek: EPISODE_WEEK_STORAGE.preseason, reason: 'preseason window' };
  }

  // In-season weekly: Wednesday ET
  if (inSeason) {
    const dow = nET.getDay(); // 0=Sun,3=Wed
    if (dow === 3) {
      const targetWeek = weekArg ?? state.week;
      return { season, week: targetWeek, episodeType: 'regular', storageWeek: targetWeek, reason: 'in-season Wednesday' };
    }
    return null; // Not the window
  }

  // Otherwise, no-op
  return null;
}

function strictFailIfDegraded(result) {
  const strict = (process.env.NEWSLETTER_STRICT_PUBLISH || 'true') === 'true';
  if (!strict) return false;
  if (result.composeFailed) return true;
  if (result.fallbackUsed) return true;
  if (Array.isArray(result.fallbackSections) && result.fallbackSections.length > 0) return true;
  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const now = new Date();

  console.log(`[Runner] Args:`, args);

  const target = await resolveNewsletterRunTarget({
    now,
    force: args.force,
    seasonArg: args.season,
    weekArg: args.week,
    episodeTypeArg: args.episodeType,
  });

  if (!target) {
    console.log('[Runner] Outside of scheduling window. Exiting 0.');
    process.exit(0);
  }

  console.log(`[Runner] Target resolved: season=${target.season}, week=${target.week}, episodeType=${target.episodeType}, storageWeek=${target.storageWeek} (${target.reason})`);

  const { loadNewsletter, saveNewsletter, loadBotMemory, saveBotMemory, loadForecastRecords, saveForecastRecords, loadPendingPicks, savePendingPicks, loadPreviousNewsletter, extractPredictionsFromNewsletter } = await importDb();

  // Idempotency check
  const existing = await loadNewsletter(target.season, target.storageWeek);
  if (existing) {
    console.log('[Runner] Newsletter already exists for target. Exiting 0.');
    process.exit(0);
  }

  const { getLeagueIdForSeason, fetchComprehensiveLeagueData, buildComprehensiveContextString, fetchCurrentWeekContext, buildCurrentStandingsContext, buildTransactionsContext, getLeagueRulesContext, fetchAllExternalData, buildExternalDataContext, generateNewsletter } = await importNewsletter();

  const leagueId = getLeagueIdForSeason(target.season);
  if (!leagueId) {
    console.error(`[Runner] No league ID found for season ${target.season}`);
    process.exit(2);
  }

  // Fetch core data
  const [league, users, rosters, matchups, nextMatchups, transactions] = await Promise.all([
    getLeague(leagueId),
    getUsers(leagueId),
    getRosters(leagueId),
    getMatchups(leagueId, target.week),
    getMatchups(leagueId, target.week + 1).catch(() => []),
    getTransactions(leagueId, target.week),
  ]);

  // Load state to pass through
  const [existingMemoryEntertainer, existingMemoryAnalyst, existingRecords, existingPendingPicks, previousNewsletter] = await Promise.all([
    loadBotMemory('entertainer', target.season),
    loadBotMemory('analyst', target.season),
    loadForecastRecords(target.season),
    loadPendingPicks(target.season, target.week),
    loadPreviousNewsletter(target.season, target.week),
  ]);

  const previousPredictions = previousNewsletter ? extractPredictionsFromNewsletter(previousNewsletter) : [];

  // Build enhanced context similar to API route
  const comprehensiveData = await fetchComprehensiveLeagueData();
  const comprehensiveContextString = buildComprehensiveContextString(comprehensiveData);

  let enhancedContext = {};
  if (target.episodeType === 'preseason' || target.episodeType === 'pre_draft' || target.episodeType === 'post_draft' || target.episodeType === 'offseason') {
    const rulesString = getLeagueRulesContext();
    enhancedContext = {
      standings: [],
      byeTeams: [],
      enhancedContextString: `${rulesString}\n\n${comprehensiveContextString}`,
    };
  } else {
    const currentWeekContext = await fetchCurrentWeekContext(leagueId, target.season, target.week);
    const currentStandingsString = buildCurrentStandingsContext(currentWeekContext);
    const transactionsString = buildTransactionsContext(currentWeekContext);
    const externalData = await fetchAllExternalData();
    const externalDataString = buildExternalDataContext(externalData);
    const rulesString = getLeagueRulesContext();

    // Injuries + fantasy team mapping (best-effort), mirroring API route behavior
    const { getAllPlayersCached, getSleeperInjuriesCached } = await import(pathResolve(projectRoot, 'src', 'lib', 'utils', 'sleeper-api.ts'));
    const [allPlayers, injuryData] = await Promise.all([
      getAllPlayersCached(12 * 60 * 60 * 1000),
      getSleeperInjuriesCached().catch(() => []),
    ]);
    // Build roster name lookup
    const userNameById = new Map();
    for (const u of users) {
      const display = (u?.metadata?.team_name) || u.display_name || u.username || `User ${u.user_id}`;
      userNameById.set(u.user_id, display);
    }
    const rosterNameById = new Map();
    for (const r of rosters) {
      const name = userNameById.get(r.owner_id) || `Roster ${r.roster_id}`;
      rosterNameById.set(r.roster_id, name);
    }
    const playerToFantasyTeam = new Map();
    for (const r of rosters) {
      for (const pid of (r.players || [])) {
        if (!playerToFantasyTeam.has(pid)) playerToFantasyTeam.set(pid, rosterNameById.get(r.roster_id) || `Roster ${r.roster_id}`);
      }
    }
    const formattedInjuries = (injuryData || [])
      .filter(inj => inj.status && inj.status !== 'Healthy' && inj.status !== 'Active')
      .slice(0, 30)
      .map(inj => {
        const player = allPlayers[inj.player_id];
        const fantasyTeam = playerToFantasyTeam.get(inj.player_id) || 'FA';
        return {
          playerId: inj.player_id,
          playerName: player ? `${player.first_name} ${player.last_name}` : `Player ${inj.player_id}`,
          team: player?.team || 'FA',
          status: inj.status || 'Unknown',
          fantasyTeam,
        };
      })
      .filter(inj => inj.playerName !== `Player ${inj.playerId}`);

    enhancedContext = {
      enhancedContextString: `${rulesString}\n\n${comprehensiveContextString}\n\n${currentStandingsString}\n\n${transactionsString}\n\n${externalDataString}`,
      injuries: formattedInjuries,
    };
  }

  // Generate
  const result = await generateNewsletter({
    leagueName: league.name || 'East v. West',
    leagueId,
    season: target.season,
    week: target.week,
    episodeType: target.episodeType || 'regular',
    users,
    rosters,
    matchups,
    nextMatchups,
    transactions,
    existingMemoryEntertainer,
    existingMemoryAnalyst,
    existingRecords,
    pendingPicks: existingPendingPicks,
    enhancedContext,
    previousPredictions,
  });

  // Strict publish gating
  if (strictFailIfDegraded(result)) {
    console.error('[Runner] Strict publish gating failed (composeFailed or fallbackUsed). No writes. Exiting non-zero.');
    process.exit(3);
  }

  if (args.preview) {
    console.log('[Runner] PREVIEW MODE: not persisting memory or newsletter.');
    console.log(JSON.stringify({
      meta: result.newsletter.meta,
      stats: {
        sections: result.newsletter.sections.length,
        fallbackUsed: result.fallbackUsed,
        fallbackSections: result.fallbackSections || [],
      },
    }, null, 2));
    process.exit(0);
  }

  // Persist memory and newsletter
  await Promise.all([
    saveBotMemory('entertainer', target.season, result.memoryEntertainer),
    saveBotMemory('analyst', target.season, result.memoryAnalyst),
    saveForecastRecords(target.season, result.records),
    savePendingPicks(target.season, result.pendingPicks),
  ]);

  await saveNewsletter(target.season, target.storageWeek, league.name || 'East v. West', result.newsletter, result.html);

  console.log(`[Runner] Newsletter generated and saved. Season=${target.season}, Week=${target.storageWeek}, EpisodeType=${target.episodeType || 'regular'}`);
}

main().catch((err) => {
  console.error('[Runner] Unhandled error:', err);
  process.exit(1);
});
