/**
 * Event Judgment Layer — Phase 1 + Phase 2
 *
 * Phase 1: heuristic scoring of stakes, comedy, sensitivity, stance recommendation.
 * Phase 2: integrates narrative heat + rivalry awareness from team-narratives.ts.
 *
 * No LLM calls. All logic is data-driven.
 */

import type { BotMemory, TeamMemory, NarrativeHeat } from './types';
import { computeNarrativeHeat, heatSummary } from './narrative-heat';
import { computeRivalryScore } from './team-narratives';

// ============ Types ============

export type JudgmentStakes = 'trivial' | 'low' | 'medium' | 'high' | 'critical';
export type JudgmentWeight = 'low' | 'medium' | 'high';

export interface JudgmentInput {
  sectionType: string;      // 'Intro', 'Recap_0', 'Trade_0', 'WaiversAndFA', etc.
  episodeType: string;      // 'regular', 'playoffs_round', 'championship', etc.
  week: number;
  season: number;
  // Teams involved in this section (winner/loser for recaps, parties for trades)
  teamNames?: string[];
  // Pulled from BotMemory.teams for the involved teams
  teamMemory?: Partial<TeamMemory>;
  // For matchup recap sections
  matchupMargin?: number;
  winnerPoints?: number;
  loserPoints?: number;
  isBlowout?: boolean;
  isNailbiter?: boolean;
  // For trade/waiver sections
  eventRelevanceScore?: number;  // 0-100 from RELEVANCE_CONFIG
  // League context flags
  isPlayoffs?: boolean;
  isChampionship?: boolean;
  isTradeDeadline?: boolean;
  isRivalryMatchup?: boolean;
  // Phase 2: rivalry score (0-10), pre-computed by caller or computed internally
  rivalryScore?: number;
  // Phase 2: playoff implications for the teams in this matchup
  playoffImplication?: 'clinched' | 'eliminated' | 'bubble' | null;
  // Team performance signals
  winStreaks?: number[];   // win streaks for involved teams (+ = win, - = loss)
  trajectories?: string[]; // 'rising' | 'falling' | 'steady' | 'volatile'
  // Phase 2: was this topic covered last week? (from dedupe log)
  wasDiscussedLastWeek?: boolean;
  // Phase 2: H2H context
  hasH2HHistory?: boolean;
  hasChampionshipMeeting?: boolean;
}

export interface EventJudgment {
  /** High-level classification of what this section covers */
  eventType: string;
  stakes: JudgmentStakes;
  historicalWeight: JudgmentWeight;
  /** How much comedy potential this event has (0-10) */
  comedyValue: number;
  /** How careful the bot should be (0-10; high = tread lightly) */
  sensitivity: number;
  /** Recommended stance label (passed to stance.ts) */
  recommendedStance: string;
  /** Whether the bot should actively comment or just observe */
  shouldLeanIn: boolean;
  /** Topics/angles the bot should avoid for this section */
  avoidList: string[];
  /** A one-line note the bot can use to orient itself */
  note: string;
  /** Phase 2: computed narrative heat for this section */
  narrativeHeat: NarrativeHeat;
  /** Phase 2: rivalry score between primary teams (0-10) */
  rivalryScore: number;
}

// ============ Judgment Engine ============

/**
 * Assess a section's context and return structured guidance.
 * All logic is heuristic — no LLM call.
 */
export function judgeSection(input: JudgmentInput): EventJudgment {
  const {
    sectionType,
    episodeType,
    week,
    teamNames = [],
    matchupMargin,
    isBlowout = false,
    isNailbiter = false,
    eventRelevanceScore,
    isPlayoffs = false,
    isChampionship = false,
    isTradeDeadline = false,
    isRivalryMatchup = false,
    winStreaks = [],
    trajectories = [],
    teamMemory,
  } = input;

  // ── Classify section ──────────────────────────────────────────────────────
  const isIntro = sectionType === 'Intro' || sectionType === 'FinalWord';
  const isRecap = sectionType.startsWith('Recap_');
  const isTrade = sectionType.startsWith('Trade_');
  const isWaiver = sectionType === 'WaiversAndFA';
  const isSpotlight = sectionType === 'Spotlight';
  const isBlurt = sectionType === 'Blurt';
  const isForecast = sectionType === 'Forecast';

  // ── Compute stakes ────────────────────────────────────────────────────────
  let stakes: JudgmentStakes = 'low';
  if (isChampionship) {
    stakes = 'critical';
  } else if (isPlayoffs) {
    stakes = 'high';
  } else if (isTradeDeadline && isTrade) {
    stakes = 'high';
  } else if (isTrade && (eventRelevanceScore ?? 0) >= 70) {
    stakes = 'high';
  } else if (isRecap && isBlowout) {
    stakes = 'medium';
  } else if (isRecap && isNailbiter) {
    stakes = 'medium';
  } else if (isRivalryMatchup) {
    stakes = 'medium';
  } else if ((eventRelevanceScore ?? 0) >= 40) {
    stakes = 'medium';
  } else if (isForecast) {
    stakes = 'medium';
  } else if (isIntro) {
    stakes = 'medium';
  }

  // ── Historical weight ─────────────────────────────────────────────────────
  let historicalWeight: JudgmentWeight = 'low';
  if (isRivalryMatchup || isChampionship) {
    historicalWeight = 'high';
  } else if (winStreaks.some(s => Math.abs(s) >= 3)) {
    historicalWeight = 'medium';
  } else if (trajectories.includes('rising') || trajectories.includes('falling')) {
    historicalWeight = 'medium';
  }

  // ── Comedy value ──────────────────────────────────────────────────────────
  let comedyValue = 4; // baseline
  if (isBlowout && !isPlayoffs) comedyValue += 3;
  if (isBlurt) comedyValue = 8;
  if (isChampionship) comedyValue = 1; // high stakes → less comedy
  if (isRivalryMatchup) comedyValue += 2;
  const trustLevel = (teamMemory?.trust ?? 0);
  const frustration = (teamMemory?.frustration ?? 0);
  if (frustration >= 15) comedyValue += 1; // bot is annoyed → snarkier
  if (trustLevel < -10) comedyValue += 1;  // bot skeptical → more sarcastic
  comedyValue = Math.min(10, Math.max(0, comedyValue));

  // ── Sensitivity ───────────────────────────────────────────────────────────
  let sensitivity = 2; // baseline
  if (isChampionship) sensitivity = 7; // real stakes, real feelings
  if (isPlayoffs) sensitivity += 2;
  if (isTrade && (eventRelevanceScore ?? 0) >= 70) sensitivity += 2;
  if (isRivalryMatchup) sensitivity += 1;
  sensitivity = Math.min(10, Math.max(0, sensitivity));

  // ── Recommended stance ────────────────────────────────────────────────────
  let recommendedStance = 'Town Crier'; // safe default

  if (isIntro && week <= 3) {
    recommendedStance = 'Hype Man';
  } else if (isIntro && isChampionship) {
    recommendedStance = 'Historian';
  } else if (isIntro) {
    recommendedStance = 'Town Crier';
  } else if (isTrade && (eventRelevanceScore ?? 0) >= 70) {
    recommendedStance = 'Accountant';
  } else if (isTrade) {
    recommendedStance = 'Prosecutor';
  } else if (isWaiver) {
    recommendedStance = 'Sicko Scout';
  } else if (isRecap && isBlowout) {
    recommendedStance = 'Undertaker';
  } else if (isRecap && isNailbiter) {
    recommendedStance = 'Town Crier';
  } else if (isRecap && isRivalryMatchup) {
    recommendedStance = 'Rivalry Arsonist';
  } else if (isRecap && isChampionship) {
    recommendedStance = 'Historian';
  } else if (isRecap) {
    recommendedStance = comedyValue >= 6 ? 'Undertaker' : 'Defense Attorney';
  } else if (isSpotlight) {
    const trajectory = trajectories[0] ?? 'steady';
    if (trajectory === 'rising') recommendedStance = 'Hype Man';
    else if (trajectory === 'falling') recommendedStance = 'Undertaker';
    else recommendedStance = 'Historian';
  } else if (isForecast) {
    recommendedStance = 'Prosecutor';
  } else if (isBlurt) {
    recommendedStance = 'Town Crier';
  }

  // ── Should lean in ────────────────────────────────────────────────────────
  const shouldLeanIn =
    stakes === 'critical' ||
    stakes === 'high' ||
    isRivalryMatchup ||
    isBlowout ||
    comedyValue >= 7 ||
    winStreaks.some(s => Math.abs(s) >= 4);

  // ── Avoid list ────────────────────────────────────────────────────────────
  const avoidList: string[] = [];
  if (isChampionship || isPlayoffs) {
    avoidList.push('casual dismissiveness — every team in the playoffs earned their spot');
  }
  if (sensitivity >= 6) {
    avoidList.push('piling on — one strong take is enough, no need to repeat');
  }
  if (!isRivalryMatchup) {
    avoidList.push('inventing a rivalry if none is evidenced in the H2H data provided');
  }
  if (isBlurt) {
    avoidList.push('long paragraphs — keep it punchy, one or two lines max');
  }

  // ── Phase 2: rivalry score ────────────────────────────────────────────────
  // Use provided value or compute from team names using team-narratives
  let derivedRivalryScore = input.rivalryScore ?? 0;
  if (!input.rivalryScore && teamNames.length >= 2) {
    derivedRivalryScore = computeRivalryScore(teamNames[0], teamNames[1]);
  }
  const isActualRivalry = isRivalryMatchup || derivedRivalryScore >= 5;

  // Upgrade stakes if rivalry score is high and stakes would otherwise be low
  if (isActualRivalry && derivedRivalryScore >= 7 && stakes === 'low') stakes = 'medium';

  // ── Phase 2: narrative heat ───────────────────────────────────────────────
  const memTrust = (teamMemory?.trust ?? 0);
  const memFrustration = (teamMemory?.frustration ?? 0);
  const teamTrustDelta = Math.abs(memTrust - memFrustration);

  const narrativeHeat = computeNarrativeHeat({
    matchupMargin,
    winnerPoints: input.winnerPoints,
    loserPoints:  input.loserPoints,
    isPlayoffs,
    isChampionship,
    isTradeDeadline,
    rivalryScore: derivedRivalryScore,
    eventRelevanceScore,
    playoffImplication: input.playoffImplication,
    teamTrustDelta,
    winStreak: winStreaks.length > 0 ? Math.max(...winStreaks.map(Math.abs)) : undefined,
    hasActiveNarrative: false, // caller can pass via opts if available
    hasH2HHistory: input.hasH2HHistory,
    hasChampionshipMeeting: input.hasChampionshipMeeting,
    wasDiscussedLastWeek: input.wasDiscussedLastWeek,
  });

  // Heat overrides: high heat can escalate shouldLeanIn even if stakes is medium
  const finalShouldLeanIn = shouldLeanIn || narrativeHeat.shouldLeanIn;

  // ── One-line note ─────────────────────────────────────────────────────────
  const teamLabel = teamNames.length > 0 ? teamNames.slice(0, 2).join(' vs ') : sectionType;
  let note = `Week ${week}, ${episodeType}: ${teamLabel}. Stakes: ${stakes}.`;
  if (isChampionship) note = `Championship week — this is the biggest game of the season. Treat it that way.`;
  else if (isPlayoffs) note = `Playoff stakes — every point matters. Single elimination energy.`;
  else if (isTradeDeadline) note = `Trade deadline — buyers and sellers are sorting out. Drama is high.`;
  else if (isActualRivalry && derivedRivalryScore >= 7) note += ` Blood feud — pull from the history.`;
  else if (isActualRivalry) note += ` Rivalry matchup — history matters here.`;
  else if (isBlowout) note += ` Blowout (${matchupMargin?.toFixed(0)} pts) — room for comedy.`;
  else if (isNailbiter) note += ` Nail-biter — tension was real.`;
  note += ` ${heatSummary(narrativeHeat)}`;

  return {
    eventType: classifyEventType(sectionType, episodeType),
    stakes,
    historicalWeight,
    comedyValue,
    sensitivity,
    recommendedStance,
    shouldLeanIn: finalShouldLeanIn,
    avoidList,
    note,
    narrativeHeat,
    rivalryScore: derivedRivalryScore,
  };
}

function classifyEventType(sectionType: string, episodeType: string): string {
  if (sectionType === 'Intro') return `${episodeType}_intro`;
  if (sectionType === 'FinalWord') return 'final_word';
  if (sectionType.startsWith('Recap_')) return 'matchup_recap';
  if (sectionType.startsWith('Trade_')) return 'trade_grade';
  if (sectionType === 'WaiversAndFA') return 'waiver_wire';
  if (sectionType === 'Spotlight') return 'spotlight_team';
  if (sectionType === 'Forecast') return 'forecast';
  if (sectionType === 'Blurt') return 'blurt';
  if (sectionType === 'PowerRankings') return 'power_rankings';
  if (sectionType.startsWith('MockDraft')) return 'mock_draft';
  if (sectionType.startsWith('DraftGrade')) return 'draft_grade';
  return 'unknown';
}

// ============ Prompt formatter ============

/**
 * Format judgment as a concise block appended to the section prompt.
 * Kept intentionally short — the LLM's main context is the full section data.
 */
export function buildJudgmentContext(judgment: EventJudgment): string {
  const lines: string[] = [];

  lines.push(`SECTION GUIDANCE:`);
  lines.push(`Event: ${judgment.eventType} | Stakes: ${judgment.stakes} | Comedy: ${judgment.comedyValue}/10 | Sensitivity: ${judgment.sensitivity}/10`);
  lines.push(`Note: ${judgment.note}`);

  // Phase 2: rivalry callout
  if (judgment.rivalryScore >= 7) {
    lines.push(`Blood feud detected — reference the rivalry history between these teams.`);
  } else if (judgment.rivalryScore >= 5) {
    lines.push(`Rival teams — keep the historical tension in the background.`);
  }

  if (judgment.shouldLeanIn) {
    lines.push(`Lean in — this section has real weight. Don't play it safe.`);
  }

  if (judgment.avoidList.length > 0) {
    lines.push(`Avoid: ${judgment.avoidList.join('; ')}.`);
  }

  return `\n${lines.join('\n')}`;
}

/**
 * Build judgment from BotMemory context for a team pair.
 * Convenience wrapper for the most common use-case (matchup recap).
 */
export function judgeMatchup(
  mem: BotMemory,
  teamA: string,
  teamB: string,
  margin: number,
  week: number,
  season: number,
  episodeType: string,
  sectionIndex: number,
): EventJudgment {
  const memA = mem.teams[teamA];
  const memB = mem.teams[teamB];

  const winStreaks = [
    (memA as { winStreak?: number })?.winStreak ?? 0,
    (memB as { winStreak?: number })?.winStreak ?? 0,
  ];
  const trajectories = [
    (memA as { trajectory?: string })?.trajectory ?? 'steady',
    (memB as { trajectory?: string })?.trajectory ?? 'steady',
  ];

  // Use the team with more extreme sentiment as the reference
  const refMem = (Math.abs((memA?.trust ?? 0) - (memA?.frustration ?? 0)) >
                  Math.abs((memB?.trust ?? 0) - (memB?.frustration ?? 0)))
    ? memA
    : memB;

  // Carry-forward: was this matchup's teams covered in last week's output log?
  const recentLabels = mem.recentOutputLog?.teamLabels ?? {};
  const wasDiscussedLastWeek = !!(recentLabels[teamA] || recentLabels[teamB]);

  return judgeSection({
    sectionType: `Recap_${sectionIndex}`,
    episodeType,
    week,
    season,
    teamNames: [teamA, teamB],
    teamMemory: refMem,
    matchupMargin: margin,
    isBlowout: margin >= 30,
    isNailbiter: margin <= 5,
    isPlayoffs: episodeType === 'playoffs_round' || episodeType === 'championship',
    isChampionship: episodeType === 'championship',
    isTradeDeadline: episodeType === 'trade_deadline',
    wasDiscussedLastWeek,
    winStreaks,
    trajectories,
  });
}
