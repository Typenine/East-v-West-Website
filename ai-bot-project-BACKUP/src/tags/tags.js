// src/tags/tags.js
import fs from "fs-extra";

// --------- helpers ---------
const mean = a => (a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0);
const stdev = a => {
  if (!a.length) return 0;
  const m = mean(a);
  const v = mean(a.map(x => (x - m) ** 2));
  return Math.sqrt(v);
};

function collectPoints(weeks) {
  // weeks: array of derived objects (current + history)
  const map = new Map(); // team -> [points...]
  for (const w of weeks) {
    const pairs = w?.matchup_pairs || [];
    for (const p of pairs) {
      for (const t of p.teams || []) {
        if (!map.has(t.name)) map.set(t.name, []);
        map.get(t.name).push(Number(t.points || 0));
      }
    }
  }
  return map;
}

function collectActivity(current) {
  // returns per-team activity this week
  const out = new Map();
  const add = (team, key, inc=1) => {
    if (!team) return;
    if (!out.has(team)) out.set(team, { waiversHi:0, waiversAny:0, trades:0 });
    out.get(team)[key] += inc;
  };
  for (const e of current?.events_scored || []) {
    if (e.type === 'waiver') {
      add(e.team, 'waiversAny', 1);
      if ((e.relevance_score || 0) >= 70) add(e.team, 'waiversHi', 1);
    } else if (e.type === 'fa_add') {
      // ignore low-signal adds
    } else if (e.type === 'trade') {
      for (const t of e.parties || []) add(t, 'trades', 1);
    }
  }
  return out;
}

// --------- tag assignment ---------
export function makeTagsBundle({ current, history = [] }) {
  const weeks = [current, ...history].filter(Boolean);
  const pts = collectPoints(weeks);
  const activity = collectActivity(current);

  // league baseline over last 3 games per team
  const leaguelast = [];
  pts.forEach(arr => leaguelast.push(mean(arr.slice(-3))));
  const leagueLastAvg = mean(leaguelast);

  const byTeam = {};
  pts.forEach((arr, team) => {
    const last3 = arr.slice(-3);
    const metrics = {
      games: arr.length,
      season_avg: +mean(arr).toFixed(1),
      last3_avg: +mean(last3).toFixed(1),
      stdev: +stdev(arr).toFixed(1),
      best: arr.length ? Math.max(...arr) : 0,
      worst: arr.length ? Math.min(...arr) : 0
    };
    const act = activity.get(team) || { waiversHi:0, waiversAny:0, trades:0 };
    const actScore = act.trades*2 + act.waiversHi*1.5 + Math.max(0, act.waiversAny - act.waiversHi)*0.5;

    // heuristics (tweakable)
    const tags = [];
    const reasons = [];

    // Boom/Bust — big variance
    if (metrics.stdev >= 18) { tags.push('Boom/Bust'); reasons.push(`High week-to-week swing (σ ${metrics.stdev}).`); }

    // Safe Builder — steady profile + low activity
    if (metrics.stdev <= 10 && actScore < 2) { tags.push('Safe Builder'); reasons.push(`Low variance (σ ${metrics.stdev}) and quiet market behavior.`); }

    // Dark Horse — rising form relative to league
    if (metrics.last3_avg >= leagueLastAvg + 6) { tags.push('Dark Horse'); reasons.push(`Recent form up (L3 ${metrics.last3_avg} vs league ${leagueLastAvg.toFixed(1)}).`); }

    // Chaos Agent — very active manager this week
    if (actScore >= 4) { tags.push('Chaos Agent'); reasons.push(`Aggressive week: ${act.trades} trade(s), ${act.waiversHi} high-FAAB claim(s).`); }

    // Reckless Contender — big scoring + volatility + active
    if (metrics.last3_avg >= leagueLastAvg + 10 && metrics.stdev >= 15 && actScore >= 3) {
      tags.push('Reckless Contender');
      reasons.push(`Top-end output (L3 ${metrics.last3_avg}) with volatility (σ ${metrics.stdev}) and aggression (score ${actScore}).`);
    }

    // keep maximum two salient tags
    const primary = tags.slice(0, 2);
    byTeam[team] = { tags: primary, reasons, metrics, activity: act };
  });

  return { byTeam, league: { last3_avg: +leagueLastAvg.toFixed(1) } };
}
