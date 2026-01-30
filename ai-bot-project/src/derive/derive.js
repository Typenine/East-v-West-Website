import fs from 'fs-extra';

// ---- Config loader (cached) ----
const defaultConfig = {
  thresholds: { lowMax: 39, moderateMax: 69 },
  trade: {
    weights: {
      dynastyRoleImpact: 20,
      positionalScarcity: 15,
      pointsImpact: 20,
      capitalPaid: 15,
      teamNeedFit: 15,
      tagShiftPotential: 15
    },
    blockbuster_floor: 70,
    lateral_cap: 55,
    narrative_bonus: 5
  },
  waiver: {
    weights: {
      faabSpentVsValue: 30,
      bidHeat: 15,
      needFit: 20,
      projectionRole: 20,
      timing: 15
    },
    fa_only_min: 40,
    high_floor: 70
  }
};

let cfgCache = null;
async function loadCfg() {
  if (cfgCache) return cfgCache;
  try { cfgCache = await fs.readJson('config/relevance-rules.json'); }
  catch { cfgCache = defaultConfig; }
  return cfgCache;
}

// ---- helpers for names & matchups ----
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

function buildMatchupPairs(matchups, rostersIndex) {
  const groups = new Map();
  for (const m of matchups) {
    const k = m.matchup_id ?? 'unknown';
    if (!groups.has(k)) groups.set(k, []);
    const owner_name = rostersIndex.get(m.roster_id)?.owner_name || `Roster ${m.roster_id}`;
    groups.get(k).push({ owner_name, points: Number(m.points ?? 0) });
  }
  const pairs = [];
  for (const [mid, entries] of groups.entries()) {
    if (!entries.length) continue;
    const sorted = [...entries].sort((a, b) => b.points - a.points);
    const winner = sorted[0];
    const loser = sorted[sorted.length - 1];
    const margin = Number((winner.points - loser.points).toFixed(2));
    pairs.push({
      matchup_id: mid,
      teams: entries.map(e => ({ name: e.owner_name, points: e.points })),
      winner: { name: winner.owner_name, points: winner.points },
      loser: { name: loser.owner_name, points: loser.points },
      margin
    });
  }
  return pairs.sort((a, b) => b.margin - a.margin);
}

// Upcoming (next week) pairs: just team names, no points yet
function buildUpcomingPairs(nextMatchups, rostersIndex) {
  const groups = new Map();
  for (const m of nextMatchups || []) {
    const k = m.matchup_id ?? 'unknown';
    if (!groups.has(k)) groups.set(k, []);
    const owner_name = rostersIndex.get(m.roster_id)?.owner_name || `Roster ${m.roster_id}`;
    groups.get(k).push(owner_name);
  }
  const pairs = [];
  for (const [mid, names] of groups.entries()) {
    if (names.length >= 2) {
      pairs.push({ matchup_id: mid, teams: [names[0], names[1]] });
    }
  }
  return pairs;
}

// ---- transactions → events + scoring ----
function normalizeTransactions(transactions, rostersIndex) {
  const events = [];
  for (const t of transactions || []) {
    const type = t.type; // "trade" | "waiver" | "free_agent"
    if (type === 'trade') {
      const parties = (t.roster_ids || []).map(id => rostersIndex.get(id)?.owner_name || `Roster ${id}`);
      const addsCount = t.adds ? Object.keys(t.adds).length : 0;
      const dropsCount = t.drops ? Object.keys(t.drops).length : 0;
      const picksCount = Array.isArray(t.draft_picks) ? t.draft_picks.length : 0;
      events.push({
        event_id: String(t.transaction_id || Math.random()),
        type: 'trade',
        week: t.leg || null,
        parties,
        assets_moved: addsCount + dropsCount + picksCount,
        picks_moved: picksCount
      });
    } else if (type === 'waiver') {
      const faab = Number(t.waiver_bid || 0);
      const rosterId = t.roster_ids?.[0] ?? t.roster_id;
      const teamName = rostersIndex.get(rosterId)?.owner_name || `Roster ${rosterId}`;
      events.push({
        event_id: String(t.transaction_id || Math.random()),
        type: 'waiver',
        week: t.leg || null,
        team: teamName,
        faab_spent: faab
      });
    } else if (type === 'free_agent') {
      const rosterId = t.roster_ids?.[0] ?? t.roster_id;
      const teamName = rostersIndex.get(rosterId)?.owner_name || `Roster ${rosterId}`;
      events.push({
        event_id: String(t.transaction_id || Math.random()),
        type: 'fa_add',
        week: t.leg || null,
        team: teamName
      });
    }
  }
  return events;
}

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

function scoreWaiver(ev, cfg) {
  const W = cfg.waiver.weights;
  const faab = Number(ev.faab_spent || 0);
  const faabScore =
    faab >= 50 ? 0.90 :
    faab >= 35 ? 0.75 :
    faab >= 20 ? 0.60 :
    faab >= 10 ? 0.45 :
    faab >= 5  ? 0.35 : 0.25;

  const features = {
    faabSpentVsValue: faabScore,
    bidHeat: 0.5,
    needFit: 0.5,
    projectionRole: 0.5,
    timing: 0.5
  };

  const totalW = Object.values(W).reduce((a, b) => a + b, 0);
  let score01 = 0;
  for (const k of Object.keys(W)) score01 += (features[k] ?? 0.5) * (W[k] / totalW);
  const score = Math.round(score01 * 100);

  const why = [];
  if (faab >= 35) why.push(`FAAB ${faab} (aggressive)`);
  else if (faab >= 20) why.push(`FAAB ${faab} (moderate)`);
  else why.push(`FAAB ${faab} (low)`);

  return { score, why };
}

function scoreTrade(ev, cfg) {
  const W = cfg.trade.weights;
  const assets = Number(ev.assets_moved || 0);
  const picks = Number(ev.picks_moved || 0);

  const dynastyRoleImpact = picks >= 2 ? 0.9 : picks === 1 ? 0.7 : assets >= 4 ? 0.6 : 0.5;
  const positionalScarcity = 0.5;
  const pointsImpact = assets >= 6 ? 0.8 : assets >= 4 ? 0.65 : assets >= 2 ? 0.55 : 0.45;
  const capitalPaid = picks >= 2 ? 0.8 : picks === 1 ? 0.65 : 0.5;
  const teamNeedFit = 0.5;
  const tagShiftPotential = picks >= 1 || assets >= 4 ? 0.6 : 0.5;

  const features = { dynastyRoleImpact, positionalScarcity, pointsImpact, capitalPaid, teamNeedFit, tagShiftPotential };

  const totalW = Object.values(W).reduce((a, b) => a + b, 0);
  let score01 = 0;
  for (const k of Object.keys(W)) score01 += clamp01(features[k]) * (W[k] / totalW);
  let score = Math.round(score01 * 100);

  if (assets >= 6 || picks >= 2) score = Math.max(score, cfg.trade.blockbuster_floor);
  if (assets <= 2 && picks === 0) score = Math.min(score, cfg.trade.lateral_cap);

  const why = [];
  if (picks >= 2)      why.push('multiple picks involved');
  else if (picks === 1)why.push('future pick involved');
  if (assets >= 6)     why.push('many assets moved');
  else if (assets >= 4)why.push('several assets moved');
  else                 why.push('low volume swap');

  return { score, why };
}

function coverageLevel(score, thresholds) {
  if (score <= thresholds.lowMax) return 'low';
  if (score <= thresholds.moderateMax) return 'moderate';
  return 'high';
}

function scoreEvents(events, cfg) {
  const out = [];
  for (const ev of events) {
    if (ev.type === 'waiver') {
      const { score, why } = scoreWaiver(ev, cfg);
      out.push({ ...ev, relevance_score: score, coverage_level: coverageLevel(score, cfg.thresholds), why });
    } else if (ev.type === 'fa_add') {
      const score = 30;
      out.push({ ...ev, relevance_score: score, coverage_level: coverageLevel(score, cfg.thresholds), why: ['free agent add'] });
    } else if (ev.type === 'trade') {
      const { score, why } = scoreTrade(ev, cfg);
      out.push({ ...ev, relevance_score: score, coverage_level: coverageLevel(score, cfg.thresholds), why });
    }
  }
  return out;
}

// ---- main entry ----
export async function buildDerived({ users, rosters, matchups, nextMatchups, transactions }) {
  const cfg = await loadCfg();
  const usersById = mapUsersById(users);
  const rostersIndex = mapRosters(rosters, usersById);

  const matchup_pairs = buildMatchupPairs(matchups, rostersIndex);
  const upcoming_pairs = buildUpcomingPairs(nextMatchups, rostersIndex);

  const events_normalized = normalizeTransactions(transactions, rostersIndex);
  const events_scored = scoreEvents(events_normalized, cfg);

  return { matchup_pairs, upcoming_pairs, events_scored };
}
