/**
 * Memory Module
 * Manages columnist memory (trust, frustration, mood) for each team
 * This version uses in-memory state that can be persisted to database
 * 
 * Note: The "bot" terminology in types is internal only - the columnists
 * are presented as media personalities, never as bots or AI.
 */

import type { BotName, BotMemory, TeamMemory, DerivedData } from './types';

// ============ Constants ============

const CLAMP = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// ============ Memory Creation ============

export function createFreshMemory(bot: BotName): BotMemory {
  return {
    bot,
    updated_at: new Date().toISOString(),
    summaryMood: 'Focused',
    teams: {},
  };
}

export function ensureTeams(mem: BotMemory, teamNames: string[]): void {
  for (const name of teamNames) {
    if (!mem.teams[name]) {
      mem.teams[name] = { trust: 0, frustration: 0, mood: 'Neutral' };
    }
  }
}

// ============ Memory Decay ============

function decay(mem: BotMemory): void {
  for (const t of Object.values(mem.teams)) {
    // Drift toward 0 each week
    if (t.trust > 0) t.trust -= 1;
    if (t.trust < 0) t.trust += 1;
    if (t.frustration > 0) t.frustration -= 1;
  }
}

// ============ Memory Adjustments ============

function adjust(t: TeamMemory, dt = 0, df = 0): void {
  t.trust = CLAMP((t.trust ?? 0) + dt, -50, 50);
  t.frustration = CLAMP((t.frustration ?? 0) + df, 0, 50);
}

function recomputeTeamMood(t: TeamMemory): void {
  const delta = (t.trust ?? 0) - (t.frustration ?? 0);
  if ((t.frustration ?? 0) >= 12) {
    t.mood = 'Irritated';
  } else if (delta >= 10) {
    t.mood = 'Confident';
  } else if (delta <= -8) {
    t.mood = 'Suspicious';
  } else {
    t.mood = 'Neutral';
  }
}

function recomputeSummaryMood(mem: BotMemory): void {
  const deltas = Object.values(mem.teams).map(t => (t.trust ?? 0) - (t.frustration ?? 0));
  const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  mem.summaryMood = avg > 5 ? 'Fired Up' : avg < -5 ? 'Deflated' : 'Focused';
}

// ============ Weekly Update ============

/**
 * Update memory after a week using derived data.
 * - Winners gain trust; losers gain frustration (scaled by margin).
 * - High relevance waivers add small trust for the acquiring team.
 * - Trades add small trust for active teams (neutral stance).
 */
export function updateMemoryAfterWeek(mem: BotMemory, derived: DerivedData): void {
  decay(mem);

  // Process matchup results
  for (const p of derived.matchup_pairs || []) {
    const w = mem.teams[p.winner.name] || (mem.teams[p.winner.name] = { trust: 0, frustration: 0, mood: 'Neutral' });
    const l = mem.teams[p.loser.name] || (mem.teams[p.loser.name] = { trust: 0, frustration: 0, mood: 'Neutral' });

    if (p.margin >= 30) {
      // Blowout
      adjust(w, +4, -1);
      adjust(l, -1, +4);
    } else if (p.margin <= 5) {
      // Nail-biter
      adjust(w, +2, 0);
      adjust(l, 0, +2);
    } else {
      // Normal game
      adjust(w, +3, 0);
      adjust(l, 0, +3);
    }

    recomputeTeamMood(w);
    recomputeTeamMood(l);
  }

  // Process events (waivers and trades)
  for (const ev of derived.events_scored || []) {
    if (ev.type === 'waiver' && ev.team) {
      const t = mem.teams[ev.team] || (mem.teams[ev.team] = { trust: 0, frustration: 0, mood: 'Neutral' });
      if (ev.relevance_score >= 70) {
        adjust(t, +2, 0);
      } else if (ev.relevance_score >= 40) {
        adjust(t, +1, 0);
      }
      recomputeTeamMood(t);
    }

    if (ev.type === 'trade' && Array.isArray(ev.parties)) {
      for (const name of ev.parties) {
        const t = mem.teams[name] || (mem.teams[name] = { trust: 0, frustration: 0, mood: 'Neutral' });
        adjust(t, +1, 0); // Reward activity slightly
        recomputeTeamMood(t);
      }
    }
  }

  recomputeSummaryMood(mem);
  mem.updated_at = new Date().toISOString();
}

// ============ Memory Getters ============

export function getTeamMood(mem: BotMemory, teamName: string): TeamMemory['mood'] {
  return mem.teams[teamName]?.mood || 'Neutral';
}

export function getTeamTrust(mem: BotMemory, teamName: string): number {
  return mem.teams[teamName]?.trust || 0;
}

export function getTeamFrustration(mem: BotMemory, teamName: string): number {
  return mem.teams[teamName]?.frustration || 0;
}

// ============ Serialization ============

export function serializeMemory(mem: BotMemory): string {
  return JSON.stringify(mem);
}

export function deserializeMemory(json: string): BotMemory {
  return JSON.parse(json) as BotMemory;
}
