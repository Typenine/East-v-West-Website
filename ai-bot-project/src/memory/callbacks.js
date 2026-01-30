// src/memory/callbacks.js
import fs from 'fs-extra';
const DIR = 'data/callbacks';

export async function loadCallbacks(week) {
  await fs.ensureDir(DIR);
  const prev = week > 1 ? `${DIR}/wk-${week - 1}.json` : null;
  if (!prev || !(await fs.pathExists(prev))) return null;
  try { return await fs.readJson(prev); } catch { return null; }
}

export async function saveCallbacks(week, data) {
  await fs.ensureDir(DIR);
  const path = `${DIR}/wk-${week}.json`;
  await fs.writeJson(path, data, { spaces: 2 });
  return path;
}

// Build what next week should remember about this issue
export function buildCallbacksFromIssue({ week, forecast, tradesAnalysis, spotlightTeam }) {
  const picks = (forecast?.picks || []).map(p => ({
    matchup_id: p.matchup_id,
    team1: p.team1,
    team2: p.team2,
    entertainer_pick: p.bot1_pick || p.entertainer_pick || '',
    analyst_pick: p.bot2_pick || p.analyst_pick || ''
  }));

  const trade_grades = [];
  for (const tr of tradesAnalysis || []) {
    const a = tr.analysis || {};
    for (const [team, g] of Object.entries(a)) {
      trade_grades.push({ event_id: tr.event_id, team, grade: g.grade });
    }
  }

  return {
    week,
    saved_at: new Date().toISOString(),
    spotlight_team: spotlightTeam || '',
    forecast_picks: picks,
    trade_grades
  };
}