#!/usr/bin/env node
/**
 * Automated Newsletter Runner (no HTTP)
 * - Respects schedule gating and strict quality gating
 * - Idempotent: checks DB for an existing newsletter (incl. drafts) before writing
 * - Free-tier safe by default (NEWSLETTER_MAX_CONCURRENCY=1)
 *
 * IMPORTANT: This runner NEVER publishes. Generated newsletters are saved as
 * DRAFTS (status:'draft') and are not publicly visible until an admin explicitly
 * publishes them via the admin UI / POST /api/newsletter/publish. It also never
 * posts to Discord. Both side effects are reserved for the explicit publish action.
 */

import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

// Utilities
function parseArgs(argv) {
  const args = new Map();
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    let key;
    let val;
    const sliced = a.slice(2);
    if (sliced.includes('=')) {
      const idx = sliced.indexOf('=');
      key = sliced.slice(0, idx);
      val = sliced.slice(idx + 1);
    } else {
      key = sliced;
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        val = next;
        i++;
      } else {
        val = 'true';
      }
    }
    args.set(key, val);
  }
  const asString = (k) => {
    const v = args.get(k);
    if (v === undefined || v === null || v === '') return null;
    return String(v);
  };
  const asNumber = (k) => {
    const v = asString(k);
    if (v === null) return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  };
  const asBool = (k) => {
    if (!args.has(k)) return false;
    const raw = String(args.get(k)).toLowerCase();
    if (raw === 'true' || raw === '1' || raw === 'yes') return true;
    if (raw === 'false' || raw === '0' || raw === 'no' || raw === '') return false;
    return true;
  };
  return {
    season: asString('season'),
    week: asNumber('week'),
    episodeType: asString('episodeType') || asString('episode_type') || null,
    force: asBool('force'),
    preview: asBool('preview'),
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
  offseason: 903,
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

// Map an editorial-queue item to a generation target. The mapping lives in
// src/lib/newsletter/queue-target.ts (unit-tested); weekly items with a blank
// week resolve against the live NFL week instead of silently targeting week 0.
async function queueItemToTarget(item) {
  const { resolveQueueTarget } = await import(
    pathResolve(projectRoot, 'src', 'lib', 'newsletter', 'queue-target.ts')
  );
  let currentWeek = 1;
  try {
    const state = await getSleeperState();
    currentWeek = parseInt(state.week, 10) || 1;
  } catch { /* keep fallback */ }
  return resolveQueueTarget(item, currentWeek);
}

/**
 * Generate a single target into a DRAFT (or write preview artifacts).
 * Returns a status string; never calls process.exit so callers can loop.
 *   'exists' | 'generated' | 'gated' | 'no_league' | 'preview'
 */
async function runTarget(target, { preview }) {
  console.log(`[Runner] Target resolved: season=${target.season}, week=${target.week}, episodeType=${target.episodeType}, storageWeek=${target.storageWeek} (${target.reason})`);

  const { loadNewsletter, saveNewsletter, loadBotMemory, saveBotMemory, loadForecastRecords, saveForecastRecords, loadPendingPicks, savePendingPicks, loadPreviousNewsletter, extractPredictionsFromNewsletter } = await importDb();

  // Idempotency check (skip for preview). includeDrafts:true so we don't clobber an
  // existing draft (possibly hand-edited) on every scheduled run.
  if (!preview) {
    const existing = await loadNewsletter(target.season, target.storageWeek, { includeDrafts: true });
    if (existing) {
      console.log('[Runner] Newsletter already exists for target (draft or published). Skipping.');
      return 'exists';
    }
  }

  const { getLeagueIdForSeason, fetchComprehensiveLeagueData, buildComprehensiveContextString, fetchCurrentWeekContext, buildCurrentStandingsContext, buildTransactionsContext, getLeagueRulesContext, fetchAllExternalData, buildExternalDataContext, generateNewsletter, setPlayerNameCache, scanForUnresolvedPlayerIds } = await importNewsletter();

  // getLeagueIdForSeason compares strictly against CURRENT_SEASON (a string), so the
  // season MUST be passed as a string. target.season is numeric (DB integer column),
  // so coerce here — otherwise the current season never matches and we get no_league.
  const leagueId = getLeagueIdForSeason(String(target.season));
  if (!leagueId) {
    console.error(`[Runner] No league ID found for season ${target.season}`);
    return 'no_league';
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

  // Load player name cache EARLY - required for all episode types to resolve player IDs to names
  const { getAllPlayersCached, getSleeperInjuriesCached } = await import(pathResolve(projectRoot, 'src', 'lib', 'utils', 'sleeper-api.ts'));
  const [allPlayers, injuryData] = await Promise.all([
    getAllPlayersCached(12 * 60 * 60 * 1000), // 12 hour cache
    getSleeperInjuriesCached().catch(() => []),
  ]);
  setPlayerNameCache(allPlayers);
  console.log(`[Runner] Player cache loaded: ${Object.keys(allPlayers).length} players`);

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

    // Build roster name lookup (allPlayers and injuryData already loaded above)
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

  // Quality gate: Check for unresolved player IDs in HTML
  const playerIdWarnings = scanForUnresolvedPlayerIds(result.html || '');
  if (playerIdWarnings.length > 0) {
    console.warn('[Runner] ⚠️ QUALITY WARNING: Possible unresolved player IDs detected:');
    for (const w of playerIdWarnings) {
      console.warn(`  - ${w}`);
    }
    if (!preview) {
      // For draft runs, treat as quality failure
      console.error('[Runner] Unresolved player IDs in draft run. Marking as fallbackUsed.');
      result.fallbackUsed = true;
      result.fallbackSections = result.fallbackSections || [];
      result.fallbackSections.push('player_id_resolution');
    }
  }

  // Strict quality gating (only for non-preview)
  if (!preview && strictFailIfDegraded(result)) {
    console.error('[Runner] Strict quality gating failed (composeFailed or fallbackUsed). No writes.');
    return 'gated';
  }

  if (preview) {
    console.log('[Runner] PREVIEW MODE: not persisting memory or newsletter.');
    const artifactsDir = pathResolve(projectRoot, 'artifacts');
    await mkdir(artifactsDir, { recursive: true });
    const htmlPath = join(artifactsDir, 'newsletter-preview.html');
    const metaPath = join(artifactsDir, 'newsletter-preview.json');
    await writeFile(htmlPath, result.html || '', 'utf8');
    const meta = {
      season: target.season,
      week: target.week,
      episodeType: target.episodeType || 'regular',
      timestamp: new Date().toISOString(),
      warnings: playerIdWarnings.length > 0 ? playerIdWarnings : undefined,
    };
    await writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
    console.log(`[Runner] Wrote preview artifacts:`);
    console.log(` - ${htmlPath}`);
    console.log(` - ${metaPath}`);
    if (playerIdWarnings.length > 0) {
      console.log(`[Runner] ⚠️ Preview contains ${playerIdWarnings.length} quality warnings - see newsletter-preview.json`);
    }
    console.log(`Download artifact → open newsletter-preview.html`);
    return 'preview';
  }

  // Persist memory and newsletter
  await Promise.all([
    saveBotMemory('entertainer', target.season, result.memoryEntertainer),
    saveBotMemory('analyst', target.season, result.memoryAnalyst),
    saveForecastRecords(target.season, result.records),
    savePendingPicks(target.season, result.pendingPicks),
  ]);

  // Save as DRAFT — never autopublish. Admin publishes manually later.
  await saveNewsletter(target.season, target.storageWeek, league.name || 'East v. West', result.newsletter, result.html, {
    status: 'draft',
    episodeType: target.episodeType || 'regular',
  });

  console.log(`[Runner] Newsletter generated and saved as DRAFT. Season=${target.season}, Week=${target.storageWeek}, EpisodeType=${target.episodeType || 'regular'} (not published, no Discord)`);
  return 'generated';
}

// Process editorial-calendar items whose scheduled time has arrived. Each is
// generated into a DRAFT — never published, never Discord. Best-effort: a queue
// failure is recorded on the item and does not abort the legacy schedule run.
async function processDueQueue(now) {
  let processed = 0;
  // Unmissable marker so the GitHub Actions log unambiguously shows whether this run
  // even reached the queue and which DB it's talking to. A stuck-"queued" item with
  // NONE of these lines in the log = the workflow isn't running this code at all.
  const dbHint = (process.env.DATABASE_URL || '').replace(/:\/\/[^@]*@/, '://***@').slice(0, 60);
  console.log(`[Runner] ===== EDITORIAL QUEUE CHECK ===== now=${now.toISOString()} db=${dbHint || '(DATABASE_URL unset!)'}`);
  try {
    const { findDueQueueItems, updateQueueItem, recordRunnerHeartbeat } = await import(
      pathResolve(projectRoot, 'src', 'server', 'db', 'newsletter-queue-queries.ts')
    );
    const due = await findDueQueueItems(now);
    console.log(`[Runner] Editorial queue: ${due.length} due item(s).`);
    // Heartbeat FIRST — even a "0 due" pass proves the runner is alive and talking
    // to the right DB. The admin calendar surfaces staleness.
    await recordRunnerHeartbeat(`${due.length} due item(s) at pass start`).catch((e) =>
      console.warn('[Runner] Heartbeat write failed (non-fatal):', e?.message ?? e));
    if (!due.length) return 0;
    for (const item of due) {
      // Each attempt bumps the counter so a failing item retries a bounded number of
      // times (see MAX_QUEUE_ATTEMPTS in newsletter-queue-queries) instead of looping
      // forever. The counter is written on the FINAL failed status (always a valid enum
      // value) so the bound holds even if the cosmetic 'generating' mark below is a no-op.
      const nextAttempts = (item.attempts ?? 0) + 1;
      console.log(`[Runner] Queue item ${item.id}: ${item.episodeType} S${item.season}${item.week != null ? `W${item.week}` : ''} (scheduled ${item.scheduledFor}, attempt ${nextAttempts}) — generating draft…`);
      const target = await queueItemToTarget(item);
      try {
        // Mark in-progress so the admin UI shows it actively working. Best-effort and
        // cosmetic — if the 'generating' enum value isn't deployed yet this is a no-op
        // and generation still proceeds.
        await updateQueueItem(item.id, { status: 'generating' }).catch(() => {});
        const status = await runTarget(target, { preview: false });
        if (status === 'generated' || status === 'exists') {
          // 'exists' = a draft was already saved for this slot (e.g. the admin ran
          // "Generate now" first). Record that on the item so "generated" is never
          // mistaken for a fresh run that silently produced nothing.
          const existsNote = status === 'exists'
            ? { note: [item.note, 'draft already existed — not regenerated'].filter(Boolean).join(' · ') }
            : {};
          await updateQueueItem(item.id, { status: 'generated', generatedAt: new Date(), error: null, ...existsNote });
          console.log(`[Runner] Queue item ${item.id} → ${status} (draft saved).`);
        } else {
          await updateQueueItem(item.id, { status: 'failed', error: `runTarget=${status}`, attempts: nextAttempts });
          console.warn(`[Runner] Queue item ${item.id} → failed (runTarget=${status}, attempt ${nextAttempts}/${3}).`);
        }
        processed++;
      } catch (e) {
        await updateQueueItem(item.id, { status: 'failed', error: String(e?.message ?? e), attempts: nextAttempts }).catch(() => {});
        console.error(`[Runner] Queue item ${item.id} threw (attempt ${nextAttempts}):`, e?.message ?? e);
      }
    }
  } catch (e) {
    // Loud + distinctive: an error HERE (import / DB / missing table) is why items get
    // stuck "queued" with no per-item error. Surfaced at error level so it's visible
    // in `preview_logs level:error` and the GitHub Actions run log.
    console.error('[Runner] ⚠️ QUEUE PROCESSING ERROR — due items may be stuck "queued". Check the runner DATABASE_URL points at the same DB as the site and that newsletter_queue exists:', e?.message ?? e);
  }
  return processed;
}

async function main() {
  const args = parseArgs(process.argv);
  const now = new Date();

  console.log(`[Runner] Inputs resolved:`, {
    season: args.season,
    week: args.week,
    episodeType: args.episodeType,
    preview: args.preview,
    force: args.force,
  });

  // Preview mode: single explicit target, write artifacts, no queue, no DB writes.
  if (args.preview) {
    const state = await getSleeperState();
    const season = args.season ? parseInt(args.season, 10) : parseInt(state.season, 10);
    const episodeType = args.episodeType || 'regular';
    let week = (args.week !== null && Number.isFinite(args.week)) ? args.week : (parseInt(state.week, 10) || 1);
    let storageWeek = week;
    if (episodeType === 'preseason' || episodeType === 'pre_draft' || episodeType === 'post_draft') {
      week = args.week ?? 0;
      storageWeek = EPISODE_WEEK_STORAGE[episodeType] ?? 900;
    }
    const target = { season, week, episodeType, storageWeek, reason: 'preview override' };
    await runTarget(target, { preview: true });
    process.exit(0);
  }

  // Non-preview: first process any due editorial-calendar items into drafts.
  const queueProcessed = await processDueQueue(now);

  // Then run the legacy schedule-gated single target (fallback for un-queued cadence).
  const target = await resolveNewsletterRunTarget({
    now,
    force: args.force,
    seasonArg: args.season,
    weekArg: args.week,
    episodeTypeArg: args.episodeType,
  });

  if (!target) {
    if (queueProcessed === 0) console.log('[Runner] Outside of scheduling window and no due queue items. Exiting 0.');
    else console.log(`[Runner] Processed ${queueProcessed} queue item(s); no additional schedule target. Exiting 0.`);
    process.exit(0);
  }

  const status = await runTarget(target, { preview: false });
  if (status === 'no_league') process.exit(2);
  if (status === 'gated') process.exit(3);
  process.exit(0);
}

main().catch((err) => {
  console.error('[Runner] Unhandled error:', err);
  process.exit(1);
});
