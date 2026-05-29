// src/ingest/players.js
// Fetch + cache Sleeper players; expose name/pos/age/years/draft/injury.

import fs from 'fs-extra';

const CACHE = 'data/players.json';
const URL = 'https://api.sleeper.app/v1/players/nfl';

function yearsBetween(a, b) {
  const ms = Math.abs(b - a);
  return Math.floor(ms / (365.25 * 24 * 3600 * 1000));
}

export async function getPlayersMap() {
  try {
    if (await fs.pathExists(CACHE)) return fs.readJson(CACHE);
    const res = await fetch(URL);
    if (!res.ok) throw new Error(`fetch players ${res.status}`);
    const raw = await res.json();

    const map = {};
    for (const [pid, p] of Object.entries(raw)) {
      const name =
        p.full_name ||
        (p.first_name && p.last_name ? `${p.first_name} ${p.last_name}` : p.last_name || p.first_name || '');
      const pos = p.position || (Array.isArray(p.fantasy_positions) ? p.fantasy_positions[0] : '') || '';
      let age = p.age;
      if (age == null && p.birth_date) {
        const dob = new Date(p.birth_date);
        if (!isNaN(dob)) age = yearsBetween(dob, new Date());
      }
      map[pid] = {
        name,
        pos,
        age: age ?? null,
        years_exp: p.years_exp ?? null,
        draft_round: p.draft_round ?? null,
        draft_pick: p.draft_pick ?? null,
        injury_status: p.injury_status || null
      };
    }
    await fs.ensureDir('data');
    await fs.writeJson(CACHE, map, { spaces: 2 });
    return map;
  } catch (err) {
    console.error('players fetch/cfg error, falling back to empty map:', err?.message || err);
    return {};
  }
}
