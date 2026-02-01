/**
 * Context Builder
 * 
 * Aggregates data from multiple sources to build rich context for LLM generation.
 * This is the bridge between the website's data and the newsletter bots.
 * 
 * Three tiers of context:
 * - Tier 1: Static league knowledge (from league-knowledge.ts)
 * - Tier 2: Dynamic bot memory (from database)
 * - Tier 3: Live context (fetched each generation)
 */

import { 
  buildStaticLeagueContext, 
  CHAMPIONS, 
  getChampionshipMeetings,
} from './league-knowledge';

// No divisions in this league - removed division logic

import type { 
  BotMemory,
  DerivedData,
  BotName,
} from './types';

// ============ Types ============

export interface LiveMatchupContext {
  team1: string;
  team2: string;
  matchupId: string | number;
  // H2H history
  h2h?: {
    meetings: number;
    team1Wins: number;
    team2Wins: number;
    lastMeeting?: { year: string; week: number; winner: string };
    neverBeaten?: string; // "Team A has never beaten Team B"
  };
  // Championship context
  isChampionship?: boolean;
  isPlayoff?: boolean;
  // Championship meeting history (if these teams met in a championship before)
  championshipHistory?: Array<{ year: number; winner: string; context: string }>;
}

export interface LiveStandingsContext {
  team: string;
  wins: number;
  losses: number;
  pointsFor: number;
  playoffPosition?: number;
  gamesBack?: number;
  streak?: number; // positive = win streak, negative = loss streak
}

export interface LiveContext {
  week: number;
  season: number;
  seasonType: 'regular' | 'playoffs' | 'championship' | 'offseason';
  
  // Standings
  standings: LiveStandingsContext[];
  
  // This week's matchups with context
  matchups: LiveMatchupContext[];
  
  // Championship matchup (if championship week)
  championshipMatchup?: {
    team1: string;
    team2: string;
    team1Path: string; // "Beat X in semis"
    team2Path: string;
  };
  
  // Recent notable events
  recentEvents: {
    type: 'trade' | 'waiver' | 'injury' | 'milestone';
    description: string;
    teams: string[];
    week: number;
  }[];
  
  // Defending champion status
  defendingChampion: string | null;
  defendingChampionRecord?: { wins: number; losses: number };
}

export interface FullContext {
  // Tier 1: Static
  leagueKnowledge: string;
  
  // Tier 2: Bot memory
  botMemory: {
    narratives: string;
    teamAssessments: string;
    predictionHistory: string;
    hotTakes: string;
  };
  
  // Tier 3: Live
  liveContext: string;
  
  // Combined for LLM
  fullPromptContext: string;
}

// ============ Context Builders ============

function buildMatchupContext(
  matchup: LiveMatchupContext
): string {
  const lines: string[] = [];
  
  // Basic matchup
  lines.push(`${matchup.team1} vs ${matchup.team2}`);
  
  // Championship/playoff flag
  if (matchup.isChampionship) {
    lines.push(`  🏆 CHAMPIONSHIP GAME - This is THE final`);
  } else if (matchup.isPlayoff) {
    lines.push(`  🏈 Playoff matchup - win or go home`);
  }
  
  // H2H history
  if (matchup.h2h) {
    const { meetings, team1Wins, team2Wins, lastMeeting, neverBeaten } = matchup.h2h;
    if (neverBeaten) {
      lines.push(`  🔥 ${neverBeaten}`);
    } else if (meetings > 0) {
      lines.push(`  📊 All-time: ${matchup.team1} leads ${team1Wins}-${team2Wins} (${meetings} meetings)`);
      if (lastMeeting) {
        lines.push(`  📅 Last met: ${lastMeeting.year} Week ${lastMeeting.week} (${lastMeeting.winner} won)`);
      }
    }
  }
  
  // Championship meeting history (let bots assess significance)
  if (matchup.championshipHistory && matchup.championshipHistory.length > 0) {
    lines.push(`  � Championship history between these teams:`);
    matchup.championshipHistory.forEach(m => {
      lines.push(`    - ${m.year}: ${m.winner} won (${m.context})`);
    });
  }
  
  return lines.join('\n');
}

function buildStandingsContext(standings: LiveStandingsContext[]): string {
  if (!standings.length) return '';
  
  const sorted = [...standings].sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.pointsFor - a.pointsFor;
  });
  
  const lines: string[] = ['CURRENT STANDINGS:'];
  
  sorted.forEach((team, idx) => {
    const position = idx + 1;
    const playoffLine = position <= 6 ? '✓' : '✗';
    const streakText = team.streak 
      ? (team.streak > 0 ? `W${team.streak}` : `L${Math.abs(team.streak)}`)
      : '';
    lines.push(`${position}. ${team.team} (${team.wins}-${team.losses}) ${playoffLine} ${streakText}`);
  });
  
  return lines.join('\n');
}

function buildBotMemoryContext(memory: BotMemory | null, botName: BotName): string {
  if (!memory) return `No prior memory for ${botName}. This is a fresh start.`;
  
  const lines: string[] = [`${botName.toUpperCase()}'S MEMORY:`];
  
  // Check if it's enhanced memory
  const enhanced = memory as BotMemory;
  if (enhanced.narratives) {
    // Enhanced memory
    lines.push(`\nMood: ${enhanced.summaryMood}`);
    
    // Active narratives
    const activeNarratives = enhanced.narratives.filter(n => !n.resolved);
    if (activeNarratives.length > 0) {
      lines.push(`\nACTIVE STORYLINES:`);
      activeNarratives.slice(0, 5).forEach(n => {
        lines.push(`- "${n.title}": ${n.description}`);
      });
    }
    
    // Prediction stats
    if (enhanced.predictionStats) {
      const { correct, wrong, winRate, hotStreak } = enhanced.predictionStats;
      lines.push(`\nPREDICTION RECORD: ${correct}-${wrong} (${(winRate * 100).toFixed(0)}%)`);
      if (hotStreak > 2) lines.push(`🔥 On a ${hotStreak}-game correct streak!`);
      if (hotStreak < -2) lines.push(`😬 On a ${Math.abs(hotStreak)}-game wrong streak...`);
    }
    
    // Recent hot takes
    const recentTakes = enhanced.hotTakes?.slice(-3) || [];
    if (recentTakes.length > 0) {
      lines.push(`\nRECENT HOT TAKES:`);
      recentTakes.forEach(t => {
        const aged = t.agedWell === true ? '✓' : t.agedWell === false ? '✗' : '?';
        lines.push(`- [${aged}] "${t.take}"`);
      });
    }
    
    // Team assessments (top 5 most notable)
    const teamEntries = Object.entries(enhanced.teams || {});
    if (teamEntries.length > 0) {
      lines.push(`\nTEAM ASSESSMENTS:`);
      teamEntries.slice(0, 5).forEach(([team, data]) => {
        const trajectory = data.trajectory ? `(${data.trajectory})` : '';
        const winStreak = data.winStreak ?? 0;
        const streak = winStreak > 0 ? `W${winStreak}` : winStreak < 0 ? `L${Math.abs(winStreak)}` : '';
        lines.push(`- ${team}: ${data.mood} ${trajectory} ${streak}`);
      });
    }
  } else {
    // Legacy memory
    const legacy = memory as BotMemory;
    lines.push(`Mood: ${legacy.summaryMood}`);
    
    const teamEntries = Object.entries(legacy.teams || {});
    if (teamEntries.length > 0) {
      lines.push(`\nTeam opinions:`);
      teamEntries.slice(0, 5).forEach(([team, data]) => {
        lines.push(`- ${team}: ${data.mood}`);
      });
    }
  }
  
  return lines.join('\n');
}

function buildLiveContextString(live: LiveContext): string {
  const lines: string[] = [];
  
  // Season context
  const seasonTypeLabels = {
    regular: 'Regular Season',
    playoffs: 'Playoffs',
    championship: '🏆 CHAMPIONSHIP WEEK',
    offseason: 'Offseason',
  };
  lines.push(`WEEK ${live.week} - ${seasonTypeLabels[live.seasonType]}`);
  lines.push('');
  
  // Defending champion
  if (live.defendingChampion) {
    const record = live.defendingChampionRecord 
      ? ` (${live.defendingChampionRecord.wins}-${live.defendingChampionRecord.losses})`
      : '';
    lines.push(`👑 Defending Champion: ${live.defendingChampion}${record}`);
    lines.push('');
  }
  
  // Championship matchup (if applicable)
  if (live.championshipMatchup) {
    const { team1, team2, team1Path, team2Path } = live.championshipMatchup;
    lines.push(`🏆 CHAMPIONSHIP MATCHUP:`);
    lines.push(`${team1} (${team1Path}) vs ${team2} (${team2Path})`);
    lines.push(`Only these two teams are competing for the title. Everyone else is in consolation.`);
    lines.push('');
  }
  
  // Standings
  lines.push(buildStandingsContext(live.standings));
  lines.push('');
  
  // This week's matchups
  lines.push(`THIS WEEK'S MATCHUPS:`);
  live.matchups.forEach(m => {
    lines.push(buildMatchupContext(m));
    lines.push('');
  });
  
  return lines.join('\n');
}

// ============ Main Export ============

export function buildFullContext(
  live: LiveContext,
  entertainerMemory: BotMemory | null,
  analystMemory: BotMemory | null
): FullContext {
  // Tier 1: Static league knowledge
  const leagueKnowledge = buildStaticLeagueContext();
  
  // Tier 2: Bot memories
  const entertainerContext = buildBotMemoryContext(entertainerMemory, 'entertainer');
  const analystContext = buildBotMemoryContext(analystMemory, 'analyst');
  
  // Tier 3: Live context
  const liveContextStr = buildLiveContextString(live);
  
  // Combine for full prompt
  const fullPromptContext = `
${leagueKnowledge}

---

${liveContextStr}

---

${entertainerContext}

---

${analystContext}
`.trim();

  return {
    leagueKnowledge,
    botMemory: {
      narratives: entertainerContext, // Simplified for now
      teamAssessments: '',
      predictionHistory: '',
      hotTakes: '',
    },
    liveContext: liveContextStr,
    fullPromptContext,
  };
}

// ============ Helper: Build Live Context from Derived Data ============

export function buildLiveContextFromDerived(
  week: number,
  season: number,
  derived: DerivedData,
  standings?: Array<{ name: string; wins: number; losses: number; pointsFor: number; division?: 'East' | 'West' }>,
  h2hData?: Record<string, Record<string, { meetings: number; wins: number; lastMeeting?: { year: string; week: number } }>>
): LiveContext {
  const CHAMPIONSHIP_WEEK = 17;
  const PLAYOFFS_START = 15;
  
  // Determine season type
  let seasonType: LiveContext['seasonType'] = 'regular';
  if (week >= CHAMPIONSHIP_WEEK) seasonType = 'championship';
  else if (week >= PLAYOFFS_START) seasonType = 'playoffs';
  
  // Build standings context (no divisions in this league)
  const standingsContext: LiveStandingsContext[] = (standings || []).map(s => ({
    team: s.name,
    wins: s.wins,
    losses: s.losses,
    pointsFor: s.pointsFor,
  }));
  
  // Build matchup contexts
  const matchups: LiveMatchupContext[] = derived.matchup_pairs.map((pair, idx) => {
    const team1 = pair.winner.name;
    const team2 = pair.loser.name;
    
    const matchupCtx: LiveMatchupContext = {
      team1,
      team2,
      matchupId: pair.matchup_id,
      isChampionship: seasonType === 'championship' && (pair.matchup_id === 1 || idx === 0),
      isPlayoff: seasonType === 'playoffs' || seasonType === 'championship',
    };
    
    // Add H2H if available
    if (h2hData && h2hData[team1] && h2hData[team1][team2]) {
      const h2h = h2hData[team1][team2];
      const reverseH2h = h2hData[team2]?.[team1];
      matchupCtx.h2h = {
        meetings: h2h.meetings,
        team1Wins: h2h.wins,
        team2Wins: reverseH2h?.wins || 0,
        lastMeeting: h2h.lastMeeting ? {
          ...h2h.lastMeeting,
          winner: h2h.wins > (reverseH2h?.wins || 0) ? team1 : team2,
        } : undefined,
        neverBeaten: h2h.wins === 0 && h2h.meetings > 0 
          ? `${team1} has never beaten ${team2} in ${h2h.meetings} meetings!`
          : undefined,
      };
    }
    
    // Add championship meeting history (bots can assess rivalry significance themselves)
    const champMeetings = getChampionshipMeetings(team1, team2);
    if (champMeetings.length > 0) {
      matchupCtx.championshipHistory = champMeetings.map(m => ({
        year: m.year,
        winner: m.winner,
        context: m.context,
      }));
    }
    
    return matchupCtx;
  });
  
  // Championship matchup
  let championshipMatchup: LiveContext['championshipMatchup'];
  if (seasonType === 'championship' && matchups.length > 0) {
    const champMatch = matchups.find(m => m.isChampionship) || matchups[0];
    championshipMatchup = {
      team1: champMatch.team1,
      team2: champMatch.team2,
      team1Path: 'Advanced to final',
      team2Path: 'Advanced to final',
    };
  }
  
  // Defending champion
  const lastSeasonChamp = CHAMPIONS[(season - 1) as keyof typeof CHAMPIONS];
  const defendingChampion = lastSeasonChamp?.champion || null;
  const champStanding = standingsContext.find(s => s.team === defendingChampion);
  
  return {
    week,
    season,
    seasonType,
    standings: standingsContext,
    matchups,
    championshipMatchup,
    recentEvents: [],
    defendingChampion,
    defendingChampionRecord: champStanding 
      ? { wins: champStanding.wins, losses: champStanding.losses }
      : undefined,
  };
}
