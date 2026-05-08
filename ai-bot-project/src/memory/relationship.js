// src/memory/relationship.js
// Bot-to-bot relationship memory: prediction records, pushback history, recurring themes.
import fs from 'fs-extra';

const PATH = 'data/memory/relationship.json';

function fresh(season) {
  return {
    season: String(season || new Date().getFullYear()),
    updated_at: new Date().toISOString(),
    prediction_records: {
      entertainer: { w: 0, l: 0 },
      analyst: { w: 0, l: 0 }
    },
    pushbacks: [],
    themes: {
      entertainer_tendencies: [],
      analyst_tendencies: [],
      persistent_disagreements: []
    },
    dynamic: {
      entertainer_lead_in_predictions: 0,
      total_pushbacks: 0,
      last_pushback_week: null,
      agreements_this_season: 0
    }
  };
}

export async function loadRelationship(season) {
  try {
    const data = await fs.readJson(PATH);
    if (data.season === String(season)) return data;
  } catch {}
  return fresh(season);
}

export async function saveRelationship(rel) {
  await fs.ensureDir('data/memory');
  rel.updated_at = new Date().toISOString();
  await fs.writeJson(PATH, rel, { spaces: 2 });
}

// Sync prediction win/loss records from the forecast grading system into relationship memory.
export function updatePredictionLead(rel, entRecords, anaRecords) {
  rel.prediction_records.entertainer = { w: entRecords.w || 0, l: entRecords.l || 0 };
  rel.prediction_records.analyst     = { w: anaRecords.w  || 0, l: anaRecords.l  || 0 };
  const entNet = (entRecords.w || 0) - (entRecords.l || 0);
  const anaNet = (anaRecords.w  || 0) - (anaRecords.l  || 0);
  rel.dynamic.entertainer_lead_in_predictions = entNet - anaNet;
}

// Heuristic: does the analyst's output push back on the entertainer's?
const PUSHBACK_SIGNALS = [
  'but ', 'however', 'not so fast', "don't overreact", 'caution', 'pump the brakes',
  'regression', 'too early', 'concerned', 'temper', 'hold on', 'small sample',
  'wait ', 'disagree', 'worth noting', "i'd pump", 'sustainable if'
];

export function detectPushback(entText, anaText) {
  const lower = String(anaText || '').toLowerCase();
  return PUSHBACK_SIGNALS.some(sig => lower.includes(sig));
}

// Record a confirmed pushback instance.
// entChampionedWinner: true when Entertainer's memory was more bullish on the actual winner.
// Resolved immediately from memory state — no next-week lookup needed.
export function recordPushback(rel, week, matchupId, entText, anaText, winnerName, entChampionedWinner) {
  rel.pushbacks.push({
    week,
    matchup_id:         String(matchupId),
    winner_name:        winnerName || '',
    entertainer_stance: String(entText || '').slice(0, 140),
    analyst_stance:     String(anaText || '').slice(0, 140),
    outcome:            entChampionedWinner ? 'entertainer_championed_winner' : 'analyst_championed_winner',
    recorded_at:        new Date().toISOString()
  });
  rel.dynamic.total_pushbacks    = rel.pushbacks.length;
  rel.dynamic.last_pushback_week = week;
}

// Tallies pushback outcomes into a per-bot debate win/loss record.
export function getDebateRecord(rel) {
  const rec = { entertainer: { w: 0, l: 0 }, analyst: { w: 0, l: 0 } };
  for (const pb of (rel.pushbacks || [])) {
    if (pb.outcome === 'entertainer_championed_winner') {
      rec.entertainer.w++; rec.analyst.l++;
    } else if (pb.outcome === 'analyst_championed_winner') {
      rec.analyst.w++; rec.entertainer.l++;
    }
  }
  return rec;
}
