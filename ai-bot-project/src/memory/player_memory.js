// src/memory/player_memory.js
// Tracks notable players each bot has formed opinions about, built from high-relevance events.
import fs from 'fs-extra';

const PATH = 'data/memory/player_memory.json';
const MAX_TAKES = 30;
const MIN_RELEVANCE = 60;

function fresh(season) {
  return { season: String(season), updated_at: new Date().toISOString(), takes: [] };
}

export async function loadPlayerMemory(season) {
  try {
    const data = await fs.readJson(PATH);
    if (data.season === String(season)) return data;
  } catch {}
  return fresh(season);
}

export async function savePlayerMemory(pm) {
  await fs.ensureDir('data/memory');
  pm.updated_at = new Date().toISOString();
  await fs.writeJson(PATH, pm, { spaces: 2 });
}

// Ingest high-relevance scored events into player memory for the week.
export function updatePlayerMemory(pm, events_scored, week) {
  for (const ev of events_scored || []) {
    if (!ev.player || ev.relevance_score < MIN_RELEVANCE) continue;
    pm.takes.push({
      week,
      player_name: ev.player,
      position:    ev.player.match(/\((\w+)\)/)?.[1] || '',
      team:        ev.team || '',
      event_type:  ev.type,
      relevance_score:  ev.relevance_score,
      coverage_level:   ev.coverage_level || 'moderate'
    });
  }
  if (pm.takes.length > MAX_TAKES) pm.takes = pm.takes.slice(-MAX_TAKES);
}

// Returns a formatted string ready to append to a bot's system prompt.
// Empty string if nothing on radar yet.
export function getRecentTakesForPrompt(pm, n = 5) {
  if (!pm?.takes?.length) return '';
  const recent = [...pm.takes].reverse().slice(0, n).reverse();
  const lines = recent.map(t =>
    `- ${t.player_name}${t.team ? ` (${t.team})` : ''}: ${t.coverage_level} ${t.event_type}, week ${t.week}`
  );
  return `\n\nNotable players on your radar:\n${lines.join('\n')}`;
}
