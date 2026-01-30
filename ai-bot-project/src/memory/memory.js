import fs from 'fs-extra';

const MEM_DIR = 'data/memory';
const CLAMP = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function memPath(bot) {
  return `${MEM_DIR}/${bot}.json`;
}

export async function loadMemory(bot) {
  await fs.ensureDir(MEM_DIR);
  const p = memPath(bot);
  if (!(await fs.pathExists(p))) {
    const fresh = { bot, updated_at: new Date().toISOString(), summaryMood: 'Focused', teams: {} };
    await fs.writeJson(p, fresh, { spaces: 2 });
    return fresh;
  }
  return fs.readJson(p);
}

export async function saveMemory(bot, mem) {
  mem.updated_at = new Date().toISOString();
  await fs.writeJson(memPath(bot), mem, { spaces: 2 });
}

export function ensureTeams(mem, teamNames = []) {
  for (const name of teamNames) {
    if (!mem.teams[name]) mem.teams[name] = { trust: 0, frustration: 0, mood: 'Neutral' };
  }
}

function decay(mem) {
  for (const t of Object.values(mem.teams)) {
    // drift toward 0 each week
    if (t.trust > 0) t.trust -= 1;
    if (t.trust < 0) t.trust += 1;
    if (t.frustration > 0) t.frustration -= 1;
  }
}

function adjust(t, dt = 0, df = 0) {
  t.trust = CLAMP((t.trust ?? 0) + dt, -50, 50);
  t.frustration = CLAMP((t.frustration ?? 0) + df, 0, 50);
}

function recomputeTeamMood(t) {
  const delta = (t.trust ?? 0) - (t.frustration ?? 0);
  if ((t.frustration ?? 0) >= 12) t.mood = 'Irritated';
  else if (delta >= 10) t.mood = 'Confident';
  else if (delta <= -8) t.mood = 'Suspicious';
  else t.mood = 'Neutral';
}

function recomputeSummaryMood(mem) {
  const deltas = Object.values(mem.teams).map(t => (t.trust ?? 0) - (t.frustration ?? 0));
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  mem.summaryMood = avg > 5 ? 'Fired Up' : avg < -5 ? 'Deflated' : 'Focused';
}

/**
 * Update memory after a week using derived data.
 * - Winners gain trust; losers gain frustration (scaled by margin).
 * - High relevance waivers add small trust for the acquiring team.
 * - Trades add small trust for active teams (neutral stance).
 */
export function updateMemoryAfterWeek(mem, derived) {
  decay(mem);

  for (const p of derived.matchup_pairs || []) {
    const w = mem.teams[p.winner.name] || (mem.teams[p.winner.name] = { trust: 0, frustration: 0, mood: 'Neutral' });
    const l = mem.teams[p.loser.name]  || (mem.teams[p.loser.name]  = { trust: 0, frustration: 0, mood: 'Neutral' });
    if (p.margin >= 30) { adjust(w, +4, -1); adjust(l, -1, +4); }
    else if (p.margin <= 5) { adjust(w, +2, 0); adjust(l, 0, +2); }
    else { adjust(w, +3, 0); adjust(l, 0, +3); }
    recomputeTeamMood(w); recomputeTeamMood(l);
  }

  for (const ev of derived.events_scored || []) {
    if (ev.type === 'waiver' && ev.team) {
      const t = mem.teams[ev.team] || (mem.teams[ev.team] = { trust: 0, frustration: 0, mood: 'Neutral' });
      if (ev.relevance_score >= 70) adjust(t, +2, 0);
      else if (ev.relevance_score >= 40) adjust(t, +1, 0);
      recomputeTeamMood(t);
    }
    if (ev.type === 'trade' && Array.isArray(ev.parties)) {
      for (const name of ev.parties) {
        const t = mem.teams[name] || (mem.teams[name] = { trust: 0, frustration: 0, mood: 'Neutral' });
        adjust(t, +1, 0); // reward activity slightly
        recomputeTeamMood(t);
      }
    }
  }

  recomputeSummaryMood(mem);
}
