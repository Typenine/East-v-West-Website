/**
 * Memory Module
 * Manages columnist memory (trust, frustration, mood) for each team
 * Now uses EnhancedBotMemory with win streaks, narratives, and prediction tracking
 * 
 * Note: The "bot" terminology in types is internal only - the columnists
 * are presented as media personalities, never as bots or AI.
 */

import type { 
  BotName, 
  BotMemory, 
  TeamMemory, 
  DerivedData,
  EnhancedBotMemory,
  EnhancedTeamMemory,
  Narrative,
} from './types';

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

/**
 * Create a fresh EnhancedBotMemory with all tracking features
 */
export function createEnhancedMemory(bot: BotName, season: number): EnhancedBotMemory {
  return {
    bot,
    season,
    updated_at: new Date().toISOString(),
    lastGeneratedWeek: 0,
    summaryMood: 'Focused',
    narratives: [],
    teams: {},
    predictions: [],
    predictionStats: {
      correct: 0,
      wrong: 0,
      winRate: 0,
      hotStreak: 0,
      bestStreak: 0,
      worstStreak: 0,
    },
    hotTakes: [],
    milestones: [],
  };
}

export function ensureTeams(mem: BotMemory, teamNames: string[]): void {
  for (const name of teamNames) {
    if (!mem.teams[name]) {
      mem.teams[name] = { trust: 0, frustration: 0, mood: 'Neutral' };
    }
  }
}

/**
 * Ensure all teams exist in enhanced memory
 */
export function ensureEnhancedTeams(mem: EnhancedBotMemory, teamNames: string[]): void {
  for (const name of teamNames) {
    if (!mem.teams[name]) {
      mem.teams[name] = createFreshEnhancedTeamMemory();
    }
  }
}

function createFreshEnhancedTeamMemory(): EnhancedTeamMemory {
  return {
    mood: 'neutral',
    trajectory: 'steady',
    winStreak: 0,
    trust: 0,
    frustration: 0,
    notableEvents: [],
    seasonStats: {
      wins: 0,
      losses: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    },
  };
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

/**
 * Update enhanced memory after a week - tracks streaks, trajectories, narratives
 */
export function updateEnhancedMemoryAfterWeek(
  mem: EnhancedBotMemory, 
  derived: DerivedData,
  week: number
): void {
  // Process matchup results with enhanced tracking
  for (const p of derived.matchup_pairs || []) {
    const winnerName = p.winner.name;
    const loserName = p.loser.name;
    
    // Ensure teams exist
    if (!mem.teams[winnerName]) mem.teams[winnerName] = createFreshEnhancedTeamMemory();
    if (!mem.teams[loserName]) mem.teams[loserName] = createFreshEnhancedTeamMemory();
    
    const w = mem.teams[winnerName];
    const l = mem.teams[loserName];
    
    // Update win streaks
    w.winStreak = w.winStreak >= 0 ? w.winStreak + 1 : 1;
    l.winStreak = l.winStreak <= 0 ? l.winStreak - 1 : -1;
    
    // Update season stats
    if (w.seasonStats) {
      w.seasonStats.wins++;
      w.seasonStats.pointsFor += p.winner.points;
      w.seasonStats.pointsAgainst += p.loser.points;
    }
    if (l.seasonStats) {
      l.seasonStats.losses++;
      l.seasonStats.pointsFor += p.loser.points;
      l.seasonStats.pointsAgainst += p.winner.points;
    }
    
    // Update trust/frustration
    if (p.margin >= 30) {
      w.trust = CLAMP(w.trust + 4, -50, 50);
      w.frustration = CLAMP(w.frustration - 1, 0, 50);
      l.trust = CLAMP(l.trust - 1, -50, 50);
      l.frustration = CLAMP(l.frustration + 4, 0, 50);
      
      // Add notable event for blowout
      w.notableEvents.push({ week, event: `Dominated ${loserName} by ${p.margin.toFixed(1)}`, sentiment: 'positive' });
      l.notableEvents.push({ week, event: `Got destroyed by ${winnerName} by ${p.margin.toFixed(1)}`, sentiment: 'negative' });
    } else if (p.margin <= 5) {
      w.trust = CLAMP(w.trust + 2, -50, 50);
      l.frustration = CLAMP(l.frustration + 2, 0, 50);
      
      // Add notable event for nail-biter
      w.notableEvents.push({ week, event: `Clutch win over ${loserName} by ${p.margin.toFixed(1)}`, sentiment: 'positive' });
      l.notableEvents.push({ week, event: `Heartbreaker loss to ${winnerName} by ${p.margin.toFixed(1)}`, sentiment: 'negative' });
    } else {
      w.trust = CLAMP(w.trust + 3, -50, 50);
      l.frustration = CLAMP(l.frustration + 3, 0, 50);
    }
    
    // Update trajectories and moods
    updateEnhancedTeamMood(w);
    updateEnhancedTeamMood(l);
    updateTeamTrajectory(w);
    updateTeamTrajectory(l);
  }
  
  // Check for narrative triggers
  detectAndAddNarratives(mem, derived, week);
  
  // Update summary mood
  updateEnhancedSummaryMood(mem);
  
  mem.lastGeneratedWeek = week;
  mem.updated_at = new Date().toISOString();
}

function updateEnhancedTeamMood(t: EnhancedTeamMemory): void {
  const delta = t.trust - t.frustration;
  const streak = t.winStreak;
  
  if (streak >= 3) {
    t.mood = 'hot';
  } else if (streak <= -3) {
    t.mood = 'cold';
  } else if (t.frustration >= 15 && t.trust >= 10) {
    t.mood = 'chaotic';
  } else if (delta >= 15) {
    t.mood = 'dangerous'; // High trust, low frustration = dangerous team
  } else {
    t.mood = 'neutral';
  }
}

function updateTeamTrajectory(t: EnhancedTeamMemory): void {
  const streak = t.winStreak;
  const stats = t.seasonStats;
  
  if (!stats) {
    t.trajectory = 'steady';
    return;
  }
  
  const totalGames = stats.wins + stats.losses;
  if (totalGames < 3) {
    t.trajectory = 'steady';
    return;
  }
  
  // Check recent trend based on streak
  if (streak >= 2) {
    t.trajectory = 'rising';
  } else if (streak <= -2) {
    t.trajectory = 'falling';
  } else if (Math.abs(streak) <= 1 && t.notableEvents.length >= 2) {
    // Check if recent events are mixed
    const recent = t.notableEvents.slice(-3);
    const positive = recent.filter(e => e.sentiment === 'positive').length;
    const negative = recent.filter(e => e.sentiment === 'negative').length;
    if (positive > 0 && negative > 0) {
      t.trajectory = 'volatile';
    } else {
      t.trajectory = 'steady';
    }
  } else {
    t.trajectory = 'steady';
  }
}

function updateEnhancedSummaryMood(mem: EnhancedBotMemory): void {
  const teams = Object.values(mem.teams);
  if (teams.length === 0) {
    mem.summaryMood = 'Focused';
    return;
  }
  
  const avgTrust = teams.reduce((sum, t) => sum + t.trust, 0) / teams.length;
  const avgFrustration = teams.reduce((sum, t) => sum + t.frustration, 0) / teams.length;
  const hotTeams = teams.filter(t => t.mood === 'hot' || t.mood === 'dangerous').length;
  const coldTeams = teams.filter(t => t.mood === 'cold').length;
  
  // Check prediction performance
  const { winRate, hotStreak } = mem.predictionStats;
  
  if (hotStreak >= 5 || winRate >= 0.7) {
    mem.summaryMood = 'Vindicated';
  } else if (hotTeams >= 3 || avgTrust > 10) {
    mem.summaryMood = 'Fired Up';
  } else if (coldTeams >= 3 || avgFrustration > 15) {
    mem.summaryMood = 'Deflated';
  } else if (teams.filter(t => t.trajectory === 'volatile').length >= 3) {
    mem.summaryMood = 'Chaotic';
  } else {
    mem.summaryMood = 'Focused';
  }
}

function detectAndAddNarratives(mem: EnhancedBotMemory, derived: DerivedData, week: number): void {
  for (const p of derived.matchup_pairs || []) {
    const winnerTeam = mem.teams[p.winner.name];
    const loserTeam = mem.teams[p.loser.name];
    
    if (!winnerTeam || !loserTeam) continue;
    
    // Detect win streak narrative
    if (winnerTeam.winStreak >= 3) {
      const existingStreak = mem.narratives.find(
        n => n.type === 'streak' && n.teams.includes(p.winner.name) && !n.resolved
      );
      if (!existingStreak) {
        addNarrative(mem, {
          type: 'streak',
          teams: [p.winner.name],
          title: `${p.winner.name}'s Hot Streak`,
          description: `${p.winner.name} is on a ${winnerTeam.winStreak}-game winning streak`,
          startedWeek: week - winnerTeam.winStreak + 1,
          lastUpdated: week,
        });
      } else {
        existingStreak.description = `${p.winner.name} extends their streak to ${winnerTeam.winStreak} games`;
        existingStreak.lastUpdated = week;
      }
    }
    
    // Detect losing streak narrative
    if (loserTeam.winStreak <= -3) {
      const existingStreak = mem.narratives.find(
        n => n.type === 'collapse' && n.teams.includes(p.loser.name) && !n.resolved
      );
      if (!existingStreak) {
        addNarrative(mem, {
          type: 'collapse',
          teams: [p.loser.name],
          title: `${p.loser.name} in Freefall`,
          description: `${p.loser.name} has lost ${Math.abs(loserTeam.winStreak)} straight`,
          startedWeek: week + loserTeam.winStreak + 1,
          lastUpdated: week,
        });
      } else {
        existingStreak.description = `${p.loser.name} extends their losing streak to ${Math.abs(loserTeam.winStreak)} games`;
        existingStreak.lastUpdated = week;
      }
    }
    
    // Resolve streak narratives when they end
    if (winnerTeam.winStreak === 1 && loserTeam.winStreak === -1) {
      // Winner just broke a losing streak
      const losingStreak = mem.narratives.find(
        n => n.type === 'collapse' && n.teams.includes(p.winner.name) && !n.resolved
      );
      if (losingStreak) {
        losingStreak.resolved = true;
        losingStreak.resolution = `${p.winner.name} snapped their losing streak with a win over ${p.loser.name}`;
      }
    }
  }
}

function addNarrative(
  mem: EnhancedBotMemory,
  narrative: Omit<Narrative, 'id' | 'resolved' | 'resolution'>
): void {
  mem.narratives.push({
    ...narrative,
    id: `${narrative.type}-${narrative.teams.join('-')}-${narrative.startedWeek}`,
    resolved: false,
  });
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

export function serializeEnhancedMemory(mem: EnhancedBotMemory): string {
  return JSON.stringify(mem);
}

export function deserializeEnhancedMemory(json: string): EnhancedBotMemory {
  return JSON.parse(json) as EnhancedBotMemory;
}

/**
 * Convert legacy BotMemory to EnhancedBotMemory
 */
export function upgradeToEnhancedMemory(legacy: BotMemory, season: number): EnhancedBotMemory {
  const enhanced = createEnhancedMemory(legacy.bot, season);
  
  // Convert legacy team memories
  for (const [teamName, legacyTeam] of Object.entries(legacy.teams)) {
    enhanced.teams[teamName] = {
      mood: legacyTeam.mood === 'Confident' ? 'hot' 
          : legacyTeam.mood === 'Irritated' ? 'cold'
          : legacyTeam.mood === 'Suspicious' ? 'cold'
          : 'neutral',
      trajectory: 'steady',
      winStreak: 0,
      trust: legacyTeam.trust,
      frustration: legacyTeam.frustration,
      notableEvents: [],
      seasonStats: { wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 },
    };
  }
  
  // Preserve legacy teams for reference
  enhanced.legacyTeams = legacy.teams;
  
  return enhanced;
}
