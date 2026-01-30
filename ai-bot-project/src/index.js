// src/index.js
import 'dotenv/config';
import fs from 'fs-extra';
import { format } from 'date-fns';

import {
  getState, getLeague, getUsers, getRosters, getMatchups, getTransactions,
} from './ingest/sleeper.js';

import { buildDerived } from './derive/derive.js';
import { composeNewsletter } from './newsletter/compose.js';
import { renderHtml } from './newsletter/template.js';

import { loadMemory, saveMemory, ensureTeams, updateMemoryAfterWeek } from './memory/memory.js';
import { makeForecast } from './forecast/forecast.js';
import { scoreEvents } from './relevance/relevance.js';
import { getPlayersMap } from './ingest/players.js';
import { makeTagsBundle } from './tags/tags.js';

import { loadCallbacks, saveCallbacks, buildCallbacksFromIssue } from './memory/callbacks.js';

const OUT_DIR = process.env.OUT_DIR || 'out';
const LEAGUE_ID = process.env.LEAGUE_ID;

const FORECAST_DIR = 'data/forecast';
const RECORDS_PATH = `${FORECAST_DIR}/records.json`;
const PENDING_PATH  = `${FORECAST_DIR}/pending.json`;

if (!LEAGUE_ID) { console.error('❌ Missing LEAGUE_ID in .env'); process.exit(1); }

function pickWeek(state, override) {
  if (override) return Number(override);
  const { season_type, week } = state || {};
  if (season_type === 'regular' && Number(week) > 0) return Number(week);
  return 1;
}
function mapUsersById(users) {
  const map = new Map();
  for (const u of users) {
    const teamName = (u?.metadata?.team_name || '').trim();
    const best = teamName || u.display_name || u.username || `User ${u.user_id}`;
    map.set(u.user_id, best);
  }
  return map;
}
function mapRosters(rosters, usersById) {
  const map = new Map();
  for (const r of rosters) {
    const owner = usersById.get(r.owner_id) || `Owner ${r.owner_id}`;
    map.set(r.roster_id, { owner_id: r.owner_id, owner_name: owner });
  }
  return map;
}

// ---- forecast records helpers ----
async function loadRecords() {
  await fs.ensureDir(FORECAST_DIR);
  if (await fs.pathExists(RECORDS_PATH)) return fs.readJson(RECORDS_PATH);
  const fresh = { entertainer: { w: 0, l: 0 }, analyst: { w: 0, l: 0 } };
  await fs.writeJson(RECORDS_PATH, fresh, { spaces: 2 });
  return fresh;
}
async function saveRecords(rec) { await fs.writeJson(RECORDS_PATH, rec, { spaces: 2 }); }
async function loadPending() { if (await fs.pathExists(PENDING_PATH)) return fs.readJson(PENDING_PATH); return null; }
async function savePending(p) { await fs.writeJson(PENDING_PATH, p, { spaces: 2 }); }

async function tryLoadDerivedWeek(wk) {
  try { return await fs.readJson(`data/derived/wk-${wk}.json`); }
  catch { return null; }
}

function gradePending(pending, matchup_pairs, records) {
  if (!pending || !Array.isArray(pending.picks)) return;
  const winnersById = new Map();
  for (const p of (matchup_pairs || [])) winnersById.set(String(p.matchup_id), p.winner?.name);
  for (const pick of pending.picks) {
    const actual = winnersById.get(String(pick.matchup_id));
    if (!actual) continue;
    if (pick.entertainer_pick) (pick.entertainer_pick === actual ? records.entertainer.w++ : records.entertainer.l++);
    if (pick.analyst_pick)    (pick.analyst_pick    === actual ? records.analyst.w++    : records.analyst.l++);
  }
}

async function main() {
  try {
    const state = await getState();
    const league = await getLeague(LEAGUE_ID);
    const users = await getUsers(LEAGUE_ID);
    const rosters = await getRosters(LEAGUE_ID);

    const usersById = mapUsersById(users);
    const rostersIndex = mapRosters(rosters, usersById);
    const teamNames = Array.from(rostersIndex.values()).map(v => v.owner_name);

    const week = pickWeek(state, process.env.FORCE_WEEK);
    const nextWeek = week + 1;

    const [matchups, nextMatchups, transactions] = await Promise.all([
      getMatchups(LEAGUE_ID, week),
      getMatchups(LEAGUE_ID, nextWeek).catch(() => []),
      getTransactions(LEAGUE_ID, week)
    ]);

    const snapshot = {
      meta: { season: String(state?.season || ''), season_type: state?.season_type || 'unknown', week, next_week: nextWeek, pulled_at: new Date().toISOString() },
      league: { id: LEAGUE_ID, name: league?.name || 'League' },
      users, rosters, matchups, next_matchups: nextMatchups, transactions
    };
    await fs.ensureDir('data/snapshots');
    await fs.writeJson(`data/snapshots/season-${snapshot.meta.season || 'NA'}-wk-${week}.json`, snapshot, { spaces: 2 });

    const derived = await buildDerived({ users, rosters, matchups, nextMatchups, transactions });
    await fs.ensureDir('data/derived');
    await fs.writeJson(`data/derived/wk-${week}.json`, derived, { spaces: 2 });

    // players + relevance v2
    const players = await getPlayersMap();
    const rosterIdToName = (id) => rostersIndex.get(id)?.owner_name || `Roster ${id}`;
    const userIdToName = (id) => usersById.get(id) || 'Unknown Team';
    const resolvePlayer = (pid) => players?.[pid] || { name: `Player ${String(pid).slice(0,6)}`, pos: '' };
    derived.events_scored = scoreEvents({ transactions, rosterIdToName, userIdToName, resolvePlayer });

    // team position counts (QB/RB/WR/TE) and roster ids for talent index
    const posCounts = {};
    const rosterPlayersByTeam = {};
    for (const r of rosters || []) {
      const name = rostersIndex.get(r.roster_id)?.owner_name || `Roster ${r.roster_id}`;
      const c = { QB:0, RB:0, WR:0, TE:0 };
      for (const pid of (r.players || [])) {
        const pos = players?.[pid]?.pos;
        if (c[pos] != null) c[pos] += 1;
      }
      posCounts[name] = c;
      rosterPlayersByTeam[name] = r.players || [];
    }

    // memory
    const memEntertainer = await loadMemory('entertainer');
    const memAnalyst = await loadMemory('analyst');
    ensureTeams(memEntertainer, teamNames);
    ensureTeams(memAnalyst, teamNames);
    updateMemoryAfterWeek(memEntertainer, derived);
    updateMemoryAfterWeek(memAnalyst, derived);

    // forecast grading + new pending
    const records = await loadRecords();
    const pending = await loadPending();
    if (pending?.week === week) { gradePending(pending, derived.matchup_pairs, records); await saveRecords(records); }
    const { forecast, pending: newPending } = makeForecast({
      upcoming_pairs: derived.upcoming_pairs || [],
      last_pairs: derived.matchup_pairs || [],
      memEntertainer, memAnalyst, nextWeek
    });
    forecast.records = records;
    await savePending(newPending);

    // tags
    const prev1 = await tryLoadDerivedWeek(week - 1);
    const prev2 = await tryLoadDerivedWeek(week - 2);
    const tagsBundle = makeTagsBundle({ current: derived, history: [prev1, prev2].filter(Boolean) });
    await fs.ensureDir('data/tags');
    await fs.writeJson(`data/tags/wk-${week}.json`, tagsBundle, { spaces: 2 });

    // callbacks (load last week)
    const lastCallbacks = await loadCallbacks(week);

    // compose + render
    const newsletter = await composeNewsletter({
      leagueName: league?.name || 'Your League',
      week,
      derived,
      memEntertainer,
      memAnalyst,
      forecast,
      tagsBundle,
      posCounts,
      players,
      dynastyConfig: await fs.readJson('config/dynasty.json').catch(() => ({})),
      season: Number(state?.season || new Date().getFullYear()),
      rosterPlayersByTeam,
      lastCallbacks
    });
    const html = renderHtml(newsletter);

    await fs.ensureDir(OUT_DIR);
    const fileName = `newsletter-${format(new Date(), 'yyyy-MM-dd')}-wk-${week}.html`;
    const full = `${OUT_DIR}/${fileName}`;
    await fs.writeFile(full, html, 'utf-8');

    // save callbacks for next week
    const spotlightTeam = newsletter._forCallbacks?.spotlight?.team || '';
    const tradesAnalysis = (newsletter._forCallbacks?.tradeItems || []).map(t => ({
      event_id: t.event_id, analysis: t.analysis
    }));
    const cbObj = buildCallbacksFromIssue({ week, forecast, tradesAnalysis, spotlightTeam });
    await saveCallbacks(week, cbObj);

    await saveMemory('entertainer', memEntertainer);
    await saveMemory('analyst', memAnalyst);

    console.log(`✅ Newsletter saved: ${full}`);
  } catch (err) {
    console.error('❌ Build failed:', err?.response?.data || err);
    process.exit(1);
  }
}

main();