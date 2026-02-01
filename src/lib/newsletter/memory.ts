/**
 * Memory Module
 * Manages columnist memory (trust, frustration, mood) for each team
 * Now uses BotMemory with win streaks, narratives, and prediction tracking
 * 
 * Note: The "bot" terminology in types is internal only - the columnists
 * are presented as media personalities, never as bots or AI.
 */

import type { 
  BotName, 
  BotMemory, 
  TeamMemory, 
  DerivedData,
  EnhancedTeamMemory,
  Narrative,
} from './types';

// ============ Constants ============

const CLAMP = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

// ============ Minimal Config (defaults match current behavior) ============

const MEMORY_DECAY_CONFIG = {
  // Trust/frustration weekly drift toward 0
  trustDecayPerWeek: 1,
  frustrationDecayPerWeek: 1,
  // Emotional decay per week and minimum clamp
  emotionalDecayPerWeek: 5,
  emotionalIntensityMin: 25,
  // Weeks after which low-intensity emotions reset to neutral
  emotionalResetWeeks: 3,
};

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
 * Create a fresh BotMemory with all tracking features
 * Includes evolving personality system
 */
export function createEnhancedMemory(bot: BotName, season: number): BotMemory {
  // Different starting personalities for each bot
  const entertainerPersonality: import('./types').PersonalityTraits = {
    confidence: 60,      // Starts cocky
    optimism: 40,        // Slightly optimistic
    loyalty: 30,         // Quick to jump ship
    analyticalTrust: -20, // Trusts gut over numbers
    grudgeLevel: 50,     // Holds grudges
    riskTolerance: 70,   // Loves bold picks
    volatility: 60,      // Big emotional swings
    // New traits
    contrarianism: 55,   // Likes going against the grain
    nostalgia: 40,       // References past seasons sometimes
    pettiness: 60,       // Remembers small slights
    patience: -20,       // Wants results NOW
    superstition: 50,    // Believes in momentum, curses
    competitiveness: 70, // Really wants to beat the analyst
    underdogAffinity: 60,// Loves a good underdog story
    dramaAppreciation: 80,// Lives for chaos
  };
  
  const analystPersonality: import('./types').PersonalityTraits = {
    confidence: 30,      // More measured
    optimism: 0,         // Neutral/realistic
    loyalty: 50,         // Sticks with process
    analyticalTrust: 80, // Trusts the numbers
    grudgeLevel: 20,     // Forgives based on data
    riskTolerance: 20,   // Plays it safe
    volatility: 20,      // Steady eddie
    // New traits
    contrarianism: -10,  // Generally follows consensus
    nostalgia: 20,       // Occasionally references history
    pettiness: 10,       // Mostly lets things go
    patience: 60,        // Willing to wait for long-term
    superstition: -40,   // Doesn't believe in jinxes
    competitiveness: 40, // Wants to be right but not obsessed
    underdogAffinity: -20,// Respects favorites
    dramaAppreciation: 10,// Prefers boring consistency
  };
  
  return {
    bot,
    season,
    updated_at: new Date().toISOString(),
    lastGeneratedWeek: 0,
    summaryMood: 'Focused',
    
    // Evolving personality
    personality: bot === 'entertainer' ? entertainerPersonality : analystPersonality,
    emotionalState: {
      primary: 'neutral',
      intensity: 30,
      duration: 0,
    },
    speechPatterns: {
      emergingPhrases: [], // Phrases that are building but not yet catchphrases
      catchphrases: [], // Only after 3+ occurrences over 3+ weeks
      verbalTics: bot === 'entertainer' 
        ? ['Look,', 'I\'m telling you,', 'Mark my words,', 'Here\'s the thing -']
        : ['The numbers suggest', 'Historically speaking,', 'If we look at the data,', 'The trend indicates'],
      obsessions: [],
      avoidTopics: [],
      signatureReactions: bot === 'entertainer'
        ? [
            { trigger: 'team I believed in wins big', reaction: 'vindicated celebration', examples: [] },
            { trigger: 'team I doubted proves me wrong', reaction: 'grudging respect with asterisk', examples: [] },
          ]
        : [
            { trigger: 'data prediction holds', reaction: 'quiet satisfaction, note the process', examples: [] },
            { trigger: 'model misses badly', reaction: 'analytical post-mortem', examples: [] },
          ],
    },
    personalGrowth: {
      hardLessons: [],
      recognizedBiases: [],
      improvements: [],
      blindSpots: bot === 'entertainer'
        ? ['Gets too attached to narratives', 'Overvalues recent performance']
        : ['Undervalues intangibles', 'Too slow to adjust to injuries'],
    },
    
    // Deep relationships
    deepPlayerRelationships: {},
    deepTeamRelationships: {},
    
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
    playerRelationships: {},
    favoritePlayers: [],
    disappointments: [],
  };
}

export function ensureTeams(mem: BotMemory | BotMemory, teamNames: string[]): void {
  for (const name of teamNames) {
    if (!mem.teams[name]) {
      mem.teams[name] = { trust: 0, frustration: 0, mood: 'Neutral' };
    }
  }
}

/**
 * Ensure all teams exist in enhanced memory
 */
export function ensureEnhancedTeams(mem: BotMemory, teamNames: string[]): void {
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
    if (t.trust > 0) t.trust -= MEMORY_DECAY_CONFIG.trustDecayPerWeek;
    if (t.trust < 0) t.trust += MEMORY_DECAY_CONFIG.trustDecayPerWeek;
    if (t.frustration > 0) t.frustration -= MEMORY_DECAY_CONFIG.frustrationDecayPerWeek;
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
export function updateMemoryAfterWeek(mem: BotMemory | BotMemory, derived: DerivedData): void {
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
  mem: BotMemory, 
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
    
    // Update win streaks (with null safety)
    const wStreak = w.winStreak ?? 0;
    const lStreak = l.winStreak ?? 0;
    w.winStreak = wStreak >= 0 ? wStreak + 1 : 1;
    l.winStreak = lStreak <= 0 ? lStreak - 1 : -1;
    
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
      
      // Add notable event for blowout (with null safety)
      if (!w.notableEvents) w.notableEvents = [];
      if (!l.notableEvents) l.notableEvents = [];
      w.notableEvents.push({ week, event: `Dominated ${loserName} by ${p.margin.toFixed(1)}`, sentiment: 'positive' });
      l.notableEvents.push({ week, event: `Got destroyed by ${winnerName} by ${p.margin.toFixed(1)}`, sentiment: 'negative' });
    } else if (p.margin <= 5) {
      w.trust = CLAMP(w.trust + 2, -50, 50);
      l.frustration = CLAMP(l.frustration + 2, 0, 50);
      
      // Add notable event for nail-biter (with null safety)
      if (!w.notableEvents) w.notableEvents = [];
      if (!l.notableEvents) l.notableEvents = [];
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

function updateEnhancedTeamMood(t: TeamMemory): void {
  const delta = t.trust - t.frustration;
  const streak = t.winStreak ?? 0;
  
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

function updateTeamTrajectory(t: TeamMemory): void {
  const streak = t.winStreak ?? 0;
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
  } else if (Math.abs(streak) <= 1 && (t.notableEvents?.length ?? 0) >= 2) {
    // Check if recent events are mixed
    const recent = (t.notableEvents ?? []).slice(-3);
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

function updateEnhancedSummaryMood(mem: BotMemory): void {
  const teams = Object.values(mem.teams);
  if (teams.length === 0) {
    mem.summaryMood = 'Focused';
    return;
  }
  
  const avgTrust = teams.reduce((sum, t) => sum + t.trust, 0) / teams.length;
  const avgFrustration = teams.reduce((sum, t) => sum + t.frustration, 0) / teams.length;
  const hotTeams = teams.filter(t => t.mood === 'hot' || t.mood === 'dangerous').length;
  const coldTeams = teams.filter(t => t.mood === 'cold').length;
  
  // Check prediction performance (with null safety)
  const winRate = mem.predictionStats?.winRate ?? 0;
  const hotStreak = mem.predictionStats?.hotStreak ?? 0;
  
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

function detectAndAddNarratives(mem: BotMemory, derived: DerivedData, week: number): void {
  for (const p of derived.matchup_pairs || []) {
    const winnerTeam = mem.teams[p.winner.name];
    const loserTeam = mem.teams[p.loser.name];
    
    if (!winnerTeam || !loserTeam) continue;
    
    // Detect win streak narrative (with null safety)
    const winnerStreak = winnerTeam.winStreak ?? 0;
    const loserStreak = loserTeam.winStreak ?? 0;
    const narratives = mem.narratives ?? [];
    
    if (winnerStreak >= 3) {
      const existingStreak = narratives.find(
        n => n.type === 'streak' && n.teams.includes(p.winner.name) && !n.resolved
      );
      if (!existingStreak) {
        addNarrative(mem, {
          type: 'streak',
          teams: [p.winner.name],
          title: `${p.winner.name}'s Hot Streak`,
          description: `${p.winner.name} is on a ${winnerStreak}-game winning streak`,
          startedWeek: week - winnerStreak + 1,
          lastUpdated: week,
        });
      } else {
        existingStreak.description = `${p.winner.name} extends their streak to ${winnerStreak} games`;
        existingStreak.lastUpdated = week;
      }
    }
    
    // Detect losing streak narrative
    if (loserStreak <= -3) {
      const existingStreak = narratives.find(
        n => n.type === 'collapse' && n.teams.includes(p.loser.name) && !n.resolved
      );
      if (!existingStreak) {
        addNarrative(mem, {
          type: 'collapse',
          teams: [p.loser.name],
          title: `${p.loser.name} in Freefall`,
          description: `${p.loser.name} has lost ${Math.abs(loserStreak)} straight`,
          startedWeek: week + loserStreak + 1,
          lastUpdated: week,
        });
      } else {
        existingStreak.description = `${p.loser.name} extends their losing streak to ${Math.abs(loserStreak)} games`;
        existingStreak.lastUpdated = week;
      }
    }
    
    // Resolve streak narratives when they end
    if (winnerStreak === 1 && loserStreak === -1) {
      // Winner just broke a losing streak
      const losingStreak = narratives.find(
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
  mem: BotMemory,
  narrative: Omit<Narrative, 'id' | 'resolved' | 'resolution'>
): void {
  if (!mem.narratives) mem.narratives = [];
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

export function serializeEnhancedMemory(mem: BotMemory): string {
  return JSON.stringify(mem);
}

export function deserializeEnhancedMemory(json: string): BotMemory {
  return JSON.parse(json) as BotMemory;
}

// ============ Bot-to-Bot Interaction Tracking ============

/**
 * Record an interaction between the two bots for future reference
 * This allows them to learn from each other and reference past conversations
 */
export function recordBotInteraction(
  mem: BotMemory,
  week: number,
  interaction: {
    matchup?: string;
    topic: string;
    agreed: boolean;
    myTake: string;
    theirTake: string;
    memorable?: boolean;
  }
): void {
  // Initialize partnerDynamics if needed
  if (!mem.partnerDynamics) {
    mem.partnerDynamics = {
      recentInteractions: [],
      agreementRate: 50,
      timesTheyWereRight: 0,
      timesIWasRight: 0,
      lessonsLearned: [],
      insideJokes: [],
    };
  }
  
  // Add the interaction
  mem.partnerDynamics.recentInteractions.push({
    week,
    ...interaction,
  });
  
  // Keep only last 20 interactions
  if (mem.partnerDynamics.recentInteractions.length > 20) {
    mem.partnerDynamics.recentInteractions = mem.partnerDynamics.recentInteractions.slice(-20);
  }
  
  // Update agreement rate
  const recent = mem.partnerDynamics.recentInteractions;
  const agreements = recent.filter(i => i.agreed).length;
  mem.partnerDynamics.agreementRate = Math.round((agreements / recent.length) * 100);
}

/**
 * Record when one bot was proven right about something
 * Deferred by design: kept available but not wired globally to avoid changing narrative frequency unexpectedly.
 */
export function recordWhoWasRight(
  mem: BotMemory,
  week: number,
  matchup: string,
  iWasRight: boolean,
  topic: string
): void {
  if (!mem.partnerDynamics) return;
  
  // Find the interaction and update it
  const interaction = mem.partnerDynamics.recentInteractions.find(
    i => i.matchup === matchup && i.week === week - 1 // Previous week's prediction
  );
  
  if (interaction) {
    interaction.whoWasRight = iWasRight ? 'me' : 'them';
  }
  
  // Update tallies
  if (iWasRight) {
    mem.partnerDynamics.timesIWasRight++;
  } else {
    mem.partnerDynamics.timesTheyWereRight++;
    
    // If they've been right multiple times about something, learn from it
    if (mem.partnerDynamics.timesTheyWereRight % 3 === 0) {
      mem.partnerDynamics.lessonsLearned.push({
        week,
        lesson: `Maybe I should listen more when they talk about ${topic}`,
      });
    }
  }
}

/**
 * Add an inside joke or callback reference between the bots
 * Deferred by design: available for future conversational features; not auto-wired to prevent unwanted tone shifts.
 */
export function addInsideJoke(
  mem: BotMemory,
  week: number,
  reference: string
): void {
  if (!mem.partnerDynamics) {
    mem.partnerDynamics = {
      recentInteractions: [],
      agreementRate: 50,
      timesTheyWereRight: 0,
      timesIWasRight: 0,
      lessonsLearned: [],
      insideJokes: [],
    };
  }
  
  mem.partnerDynamics.insideJokes.push({ week, reference });
  
  // Keep only last 10 inside jokes
  if (mem.partnerDynamics.insideJokes.length > 10) {
    mem.partnerDynamics.insideJokes = mem.partnerDynamics.insideJokes.slice(-10);
  }
}

/**
 * Start or update a feud between the bots
 */
export function updateBotFeud(
  mem: BotMemory,
  feud: {
    topic: string;
    myPosition: string;
    theirPosition: string;
    startedWeek: number;
    intensity: 'mild' | 'heated' | 'war';
  } | null
): void {
  if (!mem.partnerDynamics) {
    mem.partnerDynamics = {
      recentInteractions: [],
      agreementRate: 50,
      timesTheyWereRight: 0,
      timesIWasRight: 0,
      lessonsLearned: [],
      insideJokes: [],
    };
  }
  
  mem.partnerDynamics.activeFeud = feud || undefined;
}

/**
 * Get context about the bot's relationship with their partner for prompts
 */
export function getPartnerDynamicsContext(mem: BotMemory): string {
  if (!mem.partnerDynamics) return '';
  
  const lines: string[] = [];
  const pd = mem.partnerDynamics;
  
  // Agreement rate
  if (pd.agreementRate > 70) {
    lines.push(`You and your co-host usually see eye to eye (${pd.agreementRate}% agreement rate).`);
  } else if (pd.agreementRate < 40) {
    lines.push(`You and your co-host often disagree (only ${pd.agreementRate}% agreement rate). That's part of the fun.`);
  }
  
  // Who's been right more
  const total = pd.timesIWasRight + pd.timesTheyWereRight;
  if (total > 5) {
    if (pd.timesIWasRight > pd.timesTheyWereRight * 1.5) {
      lines.push(`Your predictions have been more accurate than theirs lately. You've earned some swagger.`);
    } else if (pd.timesTheyWereRight > pd.timesIWasRight * 1.5) {
      lines.push(`They've been right more often than you lately. Maybe listen to them more... or double down.`);
    }
  }
  
  // Active feud
  if (pd.activeFeud) {
    lines.push(`ONGOING FEUD: You disagree about "${pd.activeFeud.topic}". Your position: "${pd.activeFeud.myPosition}". Their position: "${pd.activeFeud.theirPosition}". Intensity: ${pd.activeFeud.intensity}.`);
  }
  
  // Recent memorable interactions
  const memorable = pd.recentInteractions.filter(i => i.memorable).slice(-2);
  if (memorable.length > 0) {
    lines.push(`Recent memorable moments with your co-host:`);
    for (const m of memorable) {
      lines.push(`  - Week ${m.week}: ${m.topic} (${m.agreed ? 'agreed' : 'disagreed'})`);
    }
  }
  
  // Lessons learned
  if (pd.lessonsLearned.length > 0) {
    const recent = pd.lessonsLearned.slice(-1)[0];
    lines.push(`Something you've learned: "${recent.lesson}"`);
  }
  
  // Inside jokes
  if (pd.insideJokes.length > 0) {
    const joke = pd.insideJokes[Math.floor(Math.random() * pd.insideJokes.length)];
    lines.push(`Callback opportunity: "${joke.reference}" (Week ${joke.week})`);
  }
  
  return lines.length > 0 ? `\nYOUR RELATIONSHIP WITH YOUR CO-HOST:\n${lines.join('\n')}` : '';
}

// ============ Personality Evolution Functions ============

/**
 * Evolve personality traits based on an experience
 * This is how the bot learns and changes over time
 */
export function evolvePersonality(
  mem: BotMemory,
  event: {
    type: 'prediction_correct' | 'prediction_wrong' | 'big_win' | 'heartbreak' | 
          'vindicated' | 'humbled' | 'partner_was_right' | 'partner_was_wrong' |
          'favorite_player_performed' | 'favorite_player_disappointed' |
          'bold_take_paid_off' | 'bold_take_backfired';
    intensity: number; // 1-10
    context?: string;
    week: number;
  }
): void {
  if (!mem.personality) return;
  
  const p = mem.personality;
  const i = event.intensity;
  
  switch (event.type) {
    case 'prediction_correct':
      p.confidence = CLAMP(p.confidence + i * 2, -100, 100);
      if (i >= 7) p.riskTolerance = CLAMP(p.riskTolerance + 3, -100, 100);
      break;
      
    case 'prediction_wrong':
      p.confidence = CLAMP(p.confidence - i * 1.5, -100, 100);
      if (i >= 7) {
        p.riskTolerance = CLAMP(p.riskTolerance - 5, -100, 100);
        // Learn a hard lesson
        if (mem.personalGrowth && event.context) {
          mem.personalGrowth.hardLessons.push({
            week: event.week,
            season: mem.season ?? 0,
            lesson: `Got burned on: ${event.context}`,
            context: event.context,
            appliedSince: false,
          });
        }
      }
      break;
      
    case 'vindicated':
      p.confidence = CLAMP(p.confidence + i * 3, -100, 100);
      p.grudgeLevel = CLAMP(p.grudgeLevel + 2, -100, 100); // Remembers being doubted
      break;
      
    case 'humbled':
      p.confidence = CLAMP(p.confidence - i * 3, -100, 100);
      p.volatility = CLAMP(p.volatility - 2, -100, 100); // Becomes more measured
      break;
      
    case 'partner_was_right':
      p.analyticalTrust = CLAMP(p.analyticalTrust + (mem.bot === 'entertainer' ? 3 : -3), -100, 100);
      break;
      
    case 'partner_was_wrong':
      p.confidence = CLAMP(p.confidence + 2, -100, 100);
      break;
      
    case 'favorite_player_performed':
      p.loyalty = CLAMP(p.loyalty + i, -100, 100);
      p.optimism = CLAMP(p.optimism + 2, -100, 100);
      break;
      
    case 'favorite_player_disappointed':
      p.loyalty = CLAMP(p.loyalty - i * 0.5, -100, 100); // Slower to lose loyalty
      p.grudgeLevel = CLAMP(p.grudgeLevel + 3, -100, 100);
      break;
      
    case 'bold_take_paid_off':
      p.riskTolerance = CLAMP(p.riskTolerance + i * 2, -100, 100);
      p.confidence = CLAMP(p.confidence + i, -100, 100);
      break;
      
    case 'bold_take_backfired':
      p.riskTolerance = CLAMP(p.riskTolerance - i * 1.5, -100, 100);
      p.volatility = CLAMP(p.volatility + 2, -100, 100); // Gets more reactive
      break;
      
    case 'big_win':
      p.optimism = CLAMP(p.optimism + i, -100, 100);
      break;
      
    case 'heartbreak':
      p.optimism = CLAMP(p.optimism - i * 1.5, -100, 100);
      p.volatility = CLAMP(p.volatility + i * 0.5, -100, 100);
      break;
  }
}

/**
 * Update emotional state based on events
 */
export function updateEmotionalState(
  mem: BotMemory,
  emotion: 'neutral' | 'excited' | 'frustrated' | 'smug' | 'anxious' | 'nostalgic' | 'vengeful' | 'hopeful',
  intensity: number,
  trigger?: { week: number; event: string; team?: string; player?: string }
): void {
  if (!mem.emotionalState) {
    mem.emotionalState = { primary: 'neutral', intensity: 30, duration: 0 };
  }
  
  // Only change if new emotion is more intense or different
  if (intensity > mem.emotionalState.intensity || emotion !== mem.emotionalState.primary) {
    mem.emotionalState = {
      primary: emotion,
      intensity: CLAMP(intensity, 0, 100),
      trigger,
      duration: 0,
    };
  }
}

/**
 * Decay emotional state over time (call each week)
 */
export function decayEmotionalState(mem: BotMemory): void {
  if (!mem.emotionalState) return;
  
  mem.emotionalState.duration++;
  // Decay based on config
  mem.emotionalState.intensity = Math.max(
    MEMORY_DECAY_CONFIG.emotionalIntensityMin,
    mem.emotionalState.intensity - MEMORY_DECAY_CONFIG.emotionalDecayPerWeek
  );
  
  // Strong emotions fade after a few weeks
  if (mem.emotionalState.duration >= MEMORY_DECAY_CONFIG.emotionalResetWeeks && mem.emotionalState.intensity < 40) {
    mem.emotionalState.primary = 'neutral';
  }
}

/**
 * Add or update a deep player relationship
 */
export function updatePlayerRelationship(
  mem: BotMemory,
  playerId: string,
  playerName: string,
  event: {
    week: number;
    description: string;
    impact: number; // -50 to +50
    emotional: boolean;
  }
): void {
  if (!mem.deepPlayerRelationships) {
    mem.deepPlayerRelationships = {};
  }
  
  let rel = mem.deepPlayerRelationships[playerId];
  if (!rel) {
    rel = {
      playerId,
      playerName,
      sentiment: 'neutral',
      trustLevel: 0,
      history: [],
      predictions: [],
      nicknames: [],
      mentionFrequency: 30,
    };
    mem.deepPlayerRelationships[playerId] = rel;
  }
  
  // Add to history
  rel.history.push({
    week: event.week,
    season: mem.season ?? 0,
    event: event.description,
    impact: event.impact,
    emotional: event.emotional,
  });
  
  // Keep only last 10 events
  if (rel.history.length > 10) {
    rel.history = rel.history.slice(-10);
  }
  
  // Update trust level
  rel.trustLevel = CLAMP(rel.trustLevel + event.impact, -100, 100);
  
  // Update sentiment based on trust level
  if (rel.trustLevel >= 70) rel.sentiment = 'beloved';
  else if (rel.trustLevel >= 40) rel.sentiment = 'trusted';
  else if (rel.trustLevel >= -20) rel.sentiment = 'neutral';
  else if (rel.trustLevel >= -50) rel.sentiment = 'skeptical';
  else if (rel.trustLevel >= -80) rel.sentiment = 'grudge';
  else rel.sentiment = 'enemy';
  
  // Check for defining moment
  if (Math.abs(event.impact) >= 30 && event.emotional) {
    rel.definingMoment = {
      week: event.week,
      season: mem.season ?? 0,
      event: event.description,
      sentiment: event.impact > 0 ? 'positive' : 'negative',
    };
  }
  
  // Increase mention frequency for strong relationships
  if (Math.abs(rel.trustLevel) > 50) {
    rel.mentionFrequency = Math.min(80, rel.mentionFrequency + 5);
  }
}

/**
 * Register a potential catchphrase - it won't become a real catchphrase until
 * it's been triggered 3+ times over 3+ weeks. This prevents forced/quick catchphrases.
 */
export function registerEmergingPhrase(
  mem: BotMemory,
  phrase: string,
  context: string,
  week: number,
  event: string
): void {
  if (!mem.speechPatterns) return;
  
  // Check if this phrase is already emerging
  const existing = mem.speechPatterns.emergingPhrases.find(p => p.phrase === phrase);
  
  if (existing) {
    existing.occurrences++;
    existing.events.push(event);
    
    // Promote to catchphrase if: 3+ occurrences AND spans 3+ weeks
    const weekSpan = week - existing.firstSeen;
    if (existing.occurrences >= 3 && weekSpan >= 2) {
      // Graduate to real catchphrase!
      mem.speechPatterns.catchphrases.push({
        phrase,
        context,
        frequency: 20, // Start LOW - needs to build naturally
        origin: { week: existing.firstSeen, event: existing.events[0] },
        timesUsed: 0,
      });
      
      // Remove from emerging
      mem.speechPatterns.emergingPhrases = mem.speechPatterns.emergingPhrases.filter(p => p.phrase !== phrase);
      
      // Keep only 3 catchphrases max
      if (mem.speechPatterns.catchphrases.length > 3) {
        mem.speechPatterns.catchphrases = mem.speechPatterns.catchphrases
          .sort((a, b) => b.timesUsed - a.timesUsed)
          .slice(0, 3);
      }
    }
  } else {
    // New emerging phrase
    mem.speechPatterns.emergingPhrases.push({
      phrase,
      context,
      occurrences: 1,
      firstSeen: week,
      events: [event],
    });
    
    // Keep only 5 emerging phrases
    if (mem.speechPatterns.emergingPhrases.length > 5) {
      mem.speechPatterns.emergingPhrases = mem.speechPatterns.emergingPhrases.slice(-5);
    }
  }
}

/**
 * Mark a catchphrase as used (increases frequency over time, but prevents overuse)
 */
export function useCatchphrase(mem: BotMemory, phrase: string, week: number): boolean {
  if (!mem.speechPatterns) return false;
  
  const catchphrase = mem.speechPatterns.catchphrases.find(c => c.phrase === phrase);
  if (!catchphrase) return false;
  
  // Don't use same catchphrase two weeks in a row
  if (catchphrase.lastUsed && week - catchphrase.lastUsed < 2) {
    return false;
  }
  
  catchphrase.timesUsed++;
  catchphrase.lastUsed = week;
  catchphrase.frequency = Math.min(60, catchphrase.frequency + 5); // Slow build, cap at 60
  
  return true;
}

/**
 * Add an obsession topic - requires multiple mentions to stick
 */
export function addObsession(
  mem: BotMemory,
  topic: string,
  reason: string,
  week: number
): void {
  if (!mem.speechPatterns) return;
  
  const existing = mem.speechPatterns.obsessions.find(o => o.topic === topic);
  if (existing) {
    existing.mentions++;
  } else {
    mem.speechPatterns.obsessions.push({ topic, reason, startedWeek: week, mentions: 1 });
  }
  
  // Keep only obsessions with 2+ mentions, max 3
  mem.speechPatterns.obsessions = mem.speechPatterns.obsessions
    .filter(o => o.mentions >= 2 || week - o.startedWeek < 2) // Give new ones a chance
    .slice(-3);
}

/**
 * Add a sore subject to avoid
 */
export function addAvoidTopic(
  mem: BotMemory,
  topic: string,
  reason: string,
  avoidUntilWeek?: number
): void {
  if (!mem.speechPatterns) return;
  
  mem.speechPatterns.avoidTopics.push({
    topic,
    reason,
    until: avoidUntilWeek,
  });
}

/**
 * Get personality context for prompts
 */
export function getPersonalityContext(mem: BotMemory): string {
  const lines: string[] = [];
  
  // Personality traits - only mention the most relevant/extreme ones
  if (mem.personality) {
    const p = mem.personality;
    
    // Core traits
    if (p.confidence > 50) lines.push(`You're feeling confident - your takes have been landing.`);
    else if (p.confidence < -30) lines.push(`You've been humbled lately. Maybe dial back the bold claims.`);
    
    if (p.optimism > 40) lines.push(`You're in an optimistic mood - looking for the upside.`);
    else if (p.optimism < -30) lines.push(`You're feeling pessimistic - expecting things to go wrong.`);
    
    if (p.grudgeLevel > 60) lines.push(`You're holding grudges. Don't forget who doubted you.`);
    
    if (p.riskTolerance > 60) lines.push(`You're feeling bold - go for the hot takes.`);
    else if (p.riskTolerance < -20) lines.push(`Play it safe - your bold takes haven't been working.`);
    
    // New traits - only surface when they're strong
    if (p.contrarianism > 50) lines.push(`You love going against the grain. If everyone thinks X, you're tempted to argue Y.`);
    
    if (p.nostalgia > 50) lines.push(`You keep thinking about past seasons. Reference history when relevant.`);
    
    if (p.pettiness > 60) lines.push(`You remember the small stuff. That one bad call? That lucky win? You haven't forgotten.`);
    
    if (p.patience < -30) lines.push(`You're impatient. You want results NOW, not "trust the process."`);
    else if (p.patience > 60) lines.push(`You're playing the long game. Short-term noise doesn't faze you.`);
    
    if (p.superstition > 50) lines.push(`You believe in momentum, curses, and jinxes. Don't tempt fate.`);
    else if (p.superstition < -40) lines.push(`You don't believe in jinxes or curses - that's just noise.`);
    
    if (p.competitiveness > 60) lines.push(`You REALLY want to be right more than your co-host. Keep score.`);
    
    if (p.underdogAffinity > 50) lines.push(`You love an underdog. Root for the longshots.`);
    else if (p.underdogAffinity < -30) lines.push(`You respect the favorites. Underdogs are underdogs for a reason.`);
    
    if (p.dramaAppreciation > 60) lines.push(`You live for chaos and drama. The messier, the better.`);
    else if (p.dramaAppreciation < -20) lines.push(`You prefer boring consistency over exciting chaos.`);
  }
  
  // Emotional state
  if (mem.emotionalState && mem.emotionalState.primary !== 'neutral') {
    const e = mem.emotionalState;
    const intensityWord = e.intensity > 70 ? 'very' : e.intensity > 40 ? 'somewhat' : 'slightly';
    lines.push(`Current mood: ${intensityWord} ${e.primary}${e.trigger ? ` (since ${e.trigger.event})` : ''}`);
  }
  
  // Speech patterns
  if (mem.speechPatterns) {
    const sp = mem.speechPatterns;
    
    if (sp.catchphrases.length > 0) {
      const phrase = sp.catchphrases[Math.floor(Math.random() * sp.catchphrases.length)];
      lines.push(`Catchphrase opportunity: "${phrase.phrase}" (use when: ${phrase.context})`);
    }
    
    if (sp.obsessions.length > 0) {
      const obsession = sp.obsessions[Math.floor(Math.random() * sp.obsessions.length)];
      lines.push(`You keep bringing up: ${obsession.topic} (${obsession.reason})`);
    }
    
    if (sp.avoidTopics.length > 0) {
      const avoid = sp.avoidTopics.filter(a => !a.until || a.until > (mem.lastGeneratedWeek ?? 0));
      if (avoid.length > 0) {
        lines.push(`Sore subject - avoid: ${avoid[0].topic} (${avoid[0].reason})`);
      }
    }
  }
  
  // Personal growth
  if (mem.personalGrowth) {
    const pg = mem.personalGrowth;
    
    if (pg.hardLessons.length > 0) {
      const recent = pg.hardLessons.filter(l => !l.appliedSince).slice(-1)[0];
      if (recent) {
        lines.push(`Lesson you're still learning: ${recent.lesson}`);
      }
    }
    
    if (pg.blindSpots.length > 0) {
      const blindSpot = pg.blindSpots[Math.floor(Math.random() * pg.blindSpots.length)];
      lines.push(`Your blind spot: ${blindSpot}`);
    }
  }
  
  return lines.length > 0 ? `\nYOUR CURRENT STATE:\n${lines.join('\n')}` : '';
}

/**
 * Get deep player relationship context for prompts
 */
export function getPlayerRelationshipContext(mem: BotMemory, playerIds: string[]): string {
  if (!mem.deepPlayerRelationships) return '';
  
  const lines: string[] = [];
  
  for (const playerId of playerIds) {
    const rel = mem.deepPlayerRelationships[playerId];
    if (!rel || rel.sentiment === 'neutral') continue;
    
    let desc = `${rel.playerName}: `;
    switch (rel.sentiment) {
      case 'beloved': desc += `One of your favorites. Trust: ${rel.trustLevel}.`; break;
      case 'trusted': desc += `You believe in them. Trust: ${rel.trustLevel}.`; break;
      case 'skeptical': desc += `You have doubts. Trust: ${rel.trustLevel}.`; break;
      case 'grudge': desc += `They've let you down. Trust: ${rel.trustLevel}.`; break;
      case 'enemy': desc += `You're done with them. Trust: ${rel.trustLevel}.`; break;
      case 'redeemed': desc += `They've earned back your trust. Trust: ${rel.trustLevel}.`; break;
    }
    
    if (rel.definingMoment) {
      desc += ` Key moment: ${rel.definingMoment.event}`;
    }
    
    if (rel.nicknames.length > 0) {
      desc += ` Nickname: "${rel.nicknames[0]}"`;
    }
    
    lines.push(desc);
  }
  
  return lines.length > 0 ? `\nYOUR PLAYER RELATIONSHIPS:\n${lines.join('\n')}` : '';
}

/**
 * Convert legacy BotMemory to BotMemory
 */
export function upgradeToEnhancedMemory(legacy: BotMemory, season: number): BotMemory {
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
  
  // Note: legacy teams are already converted above, no need to preserve separately
  
  return enhanced;
}
